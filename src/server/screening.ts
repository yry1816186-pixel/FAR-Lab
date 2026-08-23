import { FeedbackSignal, ScreeningDecision, ScreeningSession, newId } from '../domain/index.js';
import type { App } from '../app/composition.js';
import { estimateStop, rankQueue, type ScreenDoc } from '../pipeline/screening.js';/**
 * Screening-loop server surface (ASReview-pattern): one session per run over
 * its retrieved pool; decisions are append-only; stopping records an honest
 * human_expert feedback signal the revise stage can consume causally.
 */

export type ScreeningErrorCode = 'not_found' | 'run_not_found' | 'no_corpus' | 'session_stopped' | 'src_not_in_pool';

export class ScreeningError extends Error {
  constructor(readonly status: number, readonly code: ScreeningErrorCode, message: string) {
    super(message);
  }
}

export interface ScreeningNextItem {
  srcId: string;
  title: string;
  authors: string[];
  year?: number;
  abstractText?: string;
  pRelevant: number | null;
  rank: number;
  phase: 'random' | 'model';
}

export interface ScreeningView {
  session: {
    id: string;
    state: 'active' | 'stopped';
    poolSize: number;
    includeCount: number;
    excludeCount: number;
    /** Pool vs live corpus divergence — honest restart offer, never silent. */
    corpusGrew: boolean;
  };
  next: ScreeningNextItem[];
  stop: ReturnType<typeof estimateStop>;
}

const docText = (d: { title: string; abstractText?: string }): string =>
  `${d.title}\n${d.abstractText ?? ''}`;

const recentVerdicts = (app: App, runId: string): ('include' | 'exclude')[] =>
  app.store.listObjects('screening_decision', runId)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1))
    .map((d) => d.verdict);

/** Session lookup or lazy creation; throws ScreeningError for absent run/corpus. */
export function getOrCreateScreeningSession(app: App, runId: string): ScreeningSession {
  if (app.store.getRun(runId) === null) {
    throw new ScreeningError(404, 'run_not_found', `no run ${runId}`);
  }
  const existing = app.store.listObjects('screening_session', runId);
  const found = existing[0];
  if (found !== undefined) return found;

  const pool = app.store.listObjects('source_document', runId);
  if (pool.length === 0) {
    throw new ScreeningError(404, 'no_corpus', `run ${runId} has no retrieved documents to screen`);
  }
  const now = new Date().toISOString();
  const session = ScreeningSession.parse({
    id: newId('scn'),
    runId,
    poolDocIds: pool.map((d) => d.id),
    includeIds: [],
    excludeIds: [],
    state: 'active',
    createdAt: now,
    updatedAt: now,
  });
  app.store.putObject('screening_session', session);
  return session;
}

export function buildScreeningView(app: App, session: ScreeningSession, queueDepth = 5): ScreeningView {
  const docsAll = app.store.listObjects('source_document', session.runId);
  const byId = new Map(docsAll.map((d) => [d.id, d]));
  const docs: ScreenDoc[] = session.poolDocIds
    .map((id) => byId.get(id))
    .filter((d): d is NonNullable<typeof d> => d !== undefined)
    .map((d) => ({ id: d.id, text: docText(d) }));

  const queue = session.state === 'active'
    ? rankQueue(docs, session.includeIds, session.excludeIds)
    : [];
  const next: ScreeningNextItem[] = queue.slice(0, queueDepth).map((item) => {
    const d = byId.get(item.srcId);
    return {
      srcId: item.srcId,
      title: d?.title ?? item.srcId,
      authors: d?.authors ?? [],
      ...(d?.publicationYear !== undefined ? { year: d.publicationYear } : {}),
      ...(d?.abstractText !== undefined && d.abstractText.length > 0 ? { abstractText: d.abstractText } : {}),
      pRelevant: item.pRelevant,
      rank: item.rank,
      phase: item.phase,
    };
  });

  return {
    session: {
      id: session.id,
      state: session.state,
      poolSize: session.poolDocIds.length,
      includeCount: session.includeIds.length,
      excludeCount: session.excludeIds.length,
      corpusGrew: docsAll.length > session.poolDocIds.length,
    },
    next,
    stop: estimateStop(docs, session.includeIds, session.excludeIds, recentVerdicts(app, session.runId)),
  };
}

export function recordScreeningDecision(
  app: App,
  runId: string,
  input: { srcId: string; verdict: 'include' | 'exclude'; reason?: string },
): { session: ScreeningSession; duplicate: boolean } {
  const session = getOrCreateScreeningSession(app, runId);
  if (session.state === 'stopped') {
    throw new ScreeningError(409, 'session_stopped', 'this screening session is stopped; decisions are closed');
  }
  if (!session.poolDocIds.includes(input.srcId)) {
    throw new ScreeningError(404, 'src_not_in_pool', `document ${input.srcId} is not part of this screening pool`);
  }
  if (session.includeIds.includes(input.srcId) || session.excludeIds.includes(input.srcId)) {
    return { session, duplicate: true };
  }
  const now = new Date().toISOString();
  app.store.putObject('screening_decision', ScreeningDecision.parse({
    id: newId('scd'),
    runId,
    sessionId: session.id,
    srcId: input.srcId,
    verdict: input.verdict,
    ...(input.reason !== undefined && input.reason.length > 0 ? { reason: input.reason } : {}),
    at: now,
  }));
  const updated = ScreeningSession.parse({
    ...session,
    includeIds: input.verdict === 'include' ? [...session.includeIds, input.srcId] : session.includeIds,
    excludeIds: input.verdict === 'exclude' ? [...session.excludeIds, input.srcId] : session.excludeIds,
    updatedAt: now,
  });
  app.store.putObject('screening_session', updated);
  return { session: updated, duplicate: false };
}

/** Stop the session; if anything was included, record the human_expert feedback
 *  signal (consumable by revise) — the researcher's verdicts are evidence. */
export function stopScreeningSession(app: App, runId: string): { session: ScreeningSession; feedbackId?: string } {
  const session = getOrCreateScreeningSession(app, runId);
  if (session.state === 'stopped') return { session };
  const now = new Date().toISOString();
  const stopped = ScreeningSession.parse({ ...session, state: 'stopped', updatedAt: now });
  app.store.putObject('screening_session', stopped);

  let feedbackId: string | undefined;
  if (stopped.includeIds.length > 0) {
    const decisions = app.store.listObjects('screening_decision', runId);
    const reasons = decisions
      .filter((d) => d.verdict === 'exclude' && d.reason !== undefined && d.reason.length > 0)
      .slice(0, 20)
      .map((d) => `${d.srcId}: ${d.reason}`);
    const content = [
      `文献筛选完成：纳入 ${stopped.includeIds.length} 篇 / 排除 ${stopped.excludeIds.length} 篇（池 ${stopped.poolDocIds.length} 篇）。`,
      `纳入集合（相关文献）：${stopped.includeIds.join(', ')}`,
      ...(reasons.length > 0 ? [`主要排除理由：${reasons.join('；')}`] : []),
    ].join('\n');
    const fb = FeedbackSignal.parse({
      id: newId('fbk'),
      runId,
      source: 'human_expert',
      content,
      provenance: 'active-screening-stop',
      receivedAt: now,
    });
    app.store.putObject('feedback', fb);
    feedbackId = fb.id;
  }
  return { session: stopped, ...(feedbackId !== undefined ? { feedbackId } : {}) };
}
