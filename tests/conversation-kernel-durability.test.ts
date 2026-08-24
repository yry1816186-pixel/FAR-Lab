import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import { createApiServer, type ApiServer } from '../src/server/api.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import { ResearchQuestion } from '../src/domain/index.js';
import { MemoryItemSchema } from '../src/domain/memory.js';
import { analyzeTrajectory } from '../src/app/supervisor.js';
import {
  conversationSessionId, planConversationResume, conversationRolloutDir, type ConversationResumePlan,
} from '../src/server/conversation-agent.js';
import { attachRunToConversation } from '../src/server/conversations.js';
import { readRollout, rolloutFile, type RolloutLine } from '../src/agent/rollout.js';

/**
 * Lane-08 kernel durability + new surfaces (offline, scripted provider):
 * - every conversation turn leaves an append-only rollout (session_meta/session_end)
 * - a CRASHED turn (rollout without session_end — the torn-process shape) is
 *   RESUMED by retryConversationTurn: priorTurns continue the same budget,
 *   attempt-1 tool results survive into the resumed session
 * - decided sessions (any session_end) never resume — honest fresh restart
 * - recall_memory surfaces cross-run memory with trust labels
 * - run_supervision surfaces trajectory signals with recommended actions
 * - cancel_run: foreign-run proposals refused at the tool boundary;
 *   in-conversation card -> researcher approval -> requestCancel + audit event
 */

const finishTurn = (over: Record<string, unknown> = {}): StubStep => ({
  rawOutput: JSON.stringify({
    action: 'finish',
    reason: 'scripted turn',
    result: {
      reply: '回复。', clarifyingQuestions: [], candidates: [], readyToConverge: false, ...over,
    },
  }),
});
const useTool = (tool: string, args: Record<string, unknown> = {}): StubStep => ({
  rawOutput: JSON.stringify({ action: 'use_tool', tool, args, reason: 'scripted tool use' }),
});

// Dynamic ids cannot be scripted statically; the stub steps are held by
// reference and patched before the turn that consumes them (existing
// CANCEL_PLACEHOLDER precedent in tests/conversations.test.ts).
const SUPERVISED_RUN = '__SUPERVISED_RUN__';
const CANCEL_RUN = '__CANCEL_RUN__';
const stubSteps: StubStep[] = [
  // turn 1: tool use then honest finish (rollout success path)
  useTool('list_runs'),
  finishTurn({ reply: '第一回合完成。' }),
  // turn 2: CRASH SHAPE — tool use succeeds, then the provider dies; the test
  // strips session_end to model a process crash mid-session
  useTool('search_workspace', { query: '质粒 转移' }),
  { fail: { kind: 'provider_error', message: 'scripted crash mid-turn' } },
  // turn 2 retry: the resumed session finishes directly — attempt-1 tool
  // results are already in the transcript, nothing is re-executed
  finishTurn({ reply: '恢复成功，继续刚才的调查。' }),
  // turn 3: recall_memory then finish
  useTool('recall_memory', { query: 'plasmid transfer experiment' }),
  finishTurn({ reply: '根据记忆回答。' }),
  // turn 4: run_supervision (patched to the real run id) then finish
  useTool('run_supervision', { runId: SUPERVISED_RUN }),
  finishTurn({ reply: '监督结论如下。' }),
  // turn 5: propose cancel_run — foreign run first (tool refuses), then the
  // in-conversation run (patched) becomes a card
  useTool('propose_action', { kind: 'cancel_run', title: '取消别人的研究', args: { runId: 'run_foreign0000000000000000000' } }),
  useTool('propose_action', { kind: 'cancel_run', title: '取消停滞的研究', args: { runId: CANCEL_RUN } }),
  finishTurn({ reply: '已提议取消，等待批准。' }),
];
const patchStep = (placeholder: string, value: string): void => {
  const step = stubSteps.find((s) => (s.rawOutput ?? '').includes(placeholder));
  if (step === undefined) throw new Error(`test authoring bug: placeholder ${placeholder} not found`);
  step.rawOutput = step.rawOutput!.replace(placeholder, value);
};

let tmp: string;
let api: ApiServer;
let app: Awaited<ReturnType<typeof createApp>>;
let base: string;
let convId: string;
let dir: string;

/** Rewrite a rollout file keeping only the chosen lines (crash simulation). */
const keepLines = (file: string, keep: (l: RolloutLine) => boolean): void => {
  const { lines } = readRollout(file);
  fs.writeFileSync(file, `${lines.filter(keep).map((l) => JSON.stringify(l)).join('\n')}\n`, 'utf8');
};
const linesOf = (file: string): RolloutLine[] => readRollout(file).lines;
const toolResults = (file: string, tool: string): Array<{ ok: boolean; payload: unknown }> =>
  linesOf(file)
    .filter((l): l is Extract<RolloutLine, { type: 'transcript_item' }> => l.type === 'transcript_item')
    .filter((l) => l.entry.kind === 'tool_result' && l.entry.tool === tool)
    .map((l) => l.entry as { kind: 'tool_result'; tool: string; ok: boolean; payload: unknown });

const json = async (method: string, pathName: string, body?: unknown): Promise<{ status: number; data: Record<string, unknown> | null }> => {
  const res = await fetch(`${base}/api/v1${pathName}`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
  const text = await res.text();
  return { status: res.status, data: text.length > 0 ? JSON.parse(text) as Record<string, unknown> : null };
};

const lastResearcherMsg = async (): Promise<Record<string, unknown>> => {
  const conv = (await json('GET', `/conversations/${convId}`)).data!.conversation as Record<string, unknown>;
  return (conv.messages as Array<Record<string, unknown>>).filter((m) => m.role === 'researcher').at(-1)!;
};

const seedRun = (text: string): string => {
  const question = ResearchQuestion.parse({
    id: `q_${Math.random().toString(36).slice(2, 28).padEnd(20, '0')}`,
    text, background: '', goalType: 'explanatory',
    scope: { domain: 'test', phenomena: ['x'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  return app.store.createRun(question, {}, new Date().toISOString()).id;
};

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-convdur-'));
  app = await createApp({ dataDir: tmp, providerOverride: createTestStubProvider(stubSteps) });
  api = createApiServer(app, {
    port: 0,
    executor: (runId) => Promise.resolve(app.store.getRun(runId)),
    staticRoot: path.join(tmp, 'no-web-dist'),
  });
  base = `http://127.0.0.1:${await api.start()}`;
  dir = conversationRolloutDir(app);
  const create = await json('POST', '/conversations', { title: 'durability' });
  convId = create.data!.conversation.id as string;
});

afterAll(() => { api.stop(); });

describe('conversation rollout durability', () => {
  it('writes a complete rollout for a successful turn', async () => {
    const turn = await json('POST', `/conversations/${convId}/messages`, { text: '看看工作区里有什么' });
    expect(turn.status).toBe(200);
    const researcherMsg = await lastResearcherMsg();
    const file = rolloutFile(dir, conversationSessionId(convId, researcherMsg.id as string));
    expect(fs.existsSync(file)).toBe(true);
    const meta = linesOf(file).find((l) => l.type === 'session_meta');
    expect(meta?.type === 'session_meta' && meta.capability).toBe('conversation-resident');
    const end = linesOf(file).filter((l) => l.type === 'session_end').at(-1);
    expect(end?.type === 'session_end' && end.status).toBe('completed');
    expect(toolResults(file, 'list_runs').length).toBe(1);
  });

  it('resumes a crashed turn on retry: priorTurns continue, attempt-1 results survive', async () => {
    const turn = await json('POST', `/conversations/${convId}/messages`, { text: '搜索质粒文献' });
    expect(turn.status).toBe(502); // provider failure — the researcher message survives, marked failed
    const researcherMsg = await lastResearcherMsg();
    expect(researcherMsg.replyError).toMatch(/scripted crash mid-turn/);
    const file = rolloutFile(dir, conversationSessionId(convId, researcherMsg.id as string));

    // Crash shape: the process died before any session decision — strip ALL
    // session_end lines (torn process, not a decided session).
    keepLines(file, (l) => l.type !== 'session_end');
    const plan = planConversationResume(dir, convId, researcherMsg.id as string);
    expect(plan).not.toBeNull();
    // attempt 1 executed exactly one tool turn before dying
    expect((plan as ConversationResumePlan).resume.priorTurns).toBe(1);

    const retry = await json('POST', `/conversations/${convId}/messages/${researcherMsg.id}/retry`);
    expect(retry.status).toBe(200);
    const conv = (await json('GET', `/conversations/${convId}`)).data!.conversation as Record<string, unknown>;
    const reply = (conv.messages as Array<Record<string, unknown>>).filter((m) => m.role === 'agent').at(-1)!;
    expect(reply.content).toMatch(/恢复成功/);

    const lines = linesOf(file);
    const resumed = lines.find((l) => l.type === 'resumed');
    expect(resumed?.type === 'resumed' && resumed.priorTurns).toBe(1);
    // attempt-1 tool result is part of the resumed session history
    expect(toolResults(file, 'search_workspace').length).toBe(1);
    const end = lines.filter((l) => l.type === 'session_end').at(-1);
    expect(end?.type === 'session_end' && end.status).toBe('completed');
    // decided sessions never resume again
    expect(planConversationResume(dir, convId, researcherMsg.id as string)).toBeNull();
  });

  it('planConversationResume refuses empty rollouts', () => {
    expect(planConversationResume(dir, convId, 'never-happened')).toBeNull();
  });
});

describe('resident agent memory + supervision surfaces', () => {
  it('recall_memory returns seeded memory with trust labels', async () => {
    const now = new Date().toISOString();
    app.store.putMemory(MemoryItemSchema.parse({
      id: 'mem_testplasmidoutcome0000000', kind: 'experiment_outcome', entityType: 'experiment',
      title: 'experiment failed for: does plasmid transfer rate predict resistance level',
      body: JSON.stringify({ experimentRunId: 'exp_1', status: 'failed' }),
      status: 'active', outcome: 'failed', failureReason: 'dataset column drift after upstream schema change',
      trustClass: 'own_unverified', taint: 'trusted', provenance: { runId: 'run_x' },
      createdAt: now, lastAccessedAt: now, accessCount: 0,
    }));
    const turn = await json('POST', `/conversations/${convId}/messages`, { text: '以前做过质粒转移实验吗' });
    expect(turn.status).toBe(200);
    const researcherMsg = await lastResearcherMsg();
    const file = rolloutFile(dir, conversationSessionId(convId, researcherMsg.id as string));
    const results = toolResults(file, 'recall_memory');
    expect(results.length).toBe(1);
    expect(results[0]!.ok).toBe(true);
    const payload = results[0]!.payload as { hits: Array<{ title: string; trustClass: string; outcome?: string }> };
    const hit = payload.hits.find((h) => h.title.includes('plasmid transfer'));
    expect(hit).toBeDefined();
    expect(hit!.trustClass).toBe('own_unverified');
    expect(hit!.outcome).toBe('failed');
  });

  it('run_supervision surfaces repeated_failure with a recommended action', async () => {
    const runId = seedRun('supervised question about stagnation');
    patchStep(SUPERVISED_RUN, runId);
    for (let i = 0; i < 3; i += 1) {
      app.store.appendEvent(runId, { type: 'stage_failed', stage: 'retrieve', detail: { error: 'upstream timeout boom' }, at: new Date().toISOString() });
    }
    const turn = await json('POST', `/conversations/${convId}/messages`, { text: `run ${runId} 看起来卡住了吗` });
    expect(turn.status).toBe(200);
    const researcherMsg = await lastResearcherMsg();
    const file = rolloutFile(dir, conversationSessionId(convId, researcherMsg.id as string));
    const results = toolResults(file, 'run_supervision');
    expect(results.length).toBe(1);
    expect(results[0]!.ok).toBe(true);
    const payload = results[0]!.payload as { signals: Array<{ kind: string; recommendedAction: string }> };
    expect(payload.signals.some((s) => s.kind === 'repeated_failure' && s.recommendedAction === 'change_strategy')).toBe(true);
    // the deterministic surface the tool exposes, verified directly
    const obs = analyzeTrajectory({ store: app.store, runId });
    expect(obs.signals.some((s) => s.kind === 'repeated_failure')).toBe(true);
  });
});

describe('cancel_run proposal (supervisor-consumer redirect path)', () => {
  it('refuses foreign runs at the tool boundary, cancels in-conversation runs after approval', async () => {
    const runId = seedRun('stagnant question to cancel');
    attachRunToConversation(app, convId, runId);
    patchStep(CANCEL_RUN, runId);
    const turn = await json('POST', `/conversations/${convId}/messages`, { text: '把它停掉吧' });
    expect(turn.status).toBe(200);
    const researcherMsg = await lastResearcherMsg();
    const file = rolloutFile(dir, conversationSessionId(convId, researcherMsg.id as string));
    // first propose (foreign run) was refused by the tool's scope check
    const proposals = toolResults(file, 'propose_action');
    expect(proposals.length).toBe(2);
    expect(proposals[0]!.ok).toBe(false);

    const conv = (await json('GET', `/conversations/${convId}`)).data!.conversation as Record<string, unknown>;
    const agentMsg = (conv.messages as Array<Record<string, unknown>>).filter((m) => m.role === 'agent').at(-1)!;
    const cards = agentMsg.proposals as Array<Record<string, unknown>>;
    // the refused proposal created no card; only the scoped one did
    expect(cards.length).toBe(1);
    expect(cards[0]!.kind).toBe('cancel_run');
    expect(cards[0]!.riskLevel).toBe('low');
    expect((cards[0]!.argSummary as Record<string, string>).runId).toBe(runId);

    const approve = await json('POST', `/conversations/${convId}/proposals/${cards[0]!.id}`, { approve: true });
    expect(approve.status).toBe(200);
    expect(app.store.getRun(runId)?.cancelRequested).toBe(true);
    const events = app.store.listEvents(runId);
    expect(events.some((e) => e.type === 'run_cancelled' && (e.detail as { via?: string }).via === 'conversation-proposal')).toBe(true);
  });
});
