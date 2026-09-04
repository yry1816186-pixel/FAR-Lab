import type { App } from '../app/composition.js';
import type { ModelProvider } from '../shared/ports.js';
import { ACTIVE_MODEL_CONFIG_META_KEY, resolveRunProvider } from '../app/provider-resolver.js';
import type { ReasoningGear, ReasoningStyle } from '../domain/model-config.js';
import {
  newId, ConversationSchema, ConversationSeedSchema,
  type Automation, type CandidateQuestion, type Conversation, type ConversationProposal, type ConversationSeed,
  CreateToolIntegrationArgsSchema, instantiateDraft, integrationSemanticIssues, ToolIntegrationSchema,
} from '../domain/index.js';
import {
  generateConversationTurn, CreateAutomationArgsSchema, LaunchResearchArgsSchema, CancelAutomationArgsSchema,
  CancelRunArgsSchema, RunCommandArgsSchema, conversationSessionId, planConversationResume, conversationRolloutDir,
  type ConversationTurnProgress,
} from './conversation-agent.js';
import { runInLoginShell } from '../shared/login-shell.js';
import { resolveInsideRoot } from '../agent/capabilities/workspace-tools.js';

/**
 * Conversation service (resident-agent flow, PROPOSAL-resident-agent): the
 * durable dialogue between the researcher and the resident agent. Every agent
 * turn is a REAL kernel tool-loop (conversation-agent.ts) — reads are free,
 * actions land as researcher-gated proposals. The researcher's message is
 * persisted BEFORE the model runs and survives any model failure (recorded on
 * the message as a visible, retryable failure); an agent reply lands only
 * when the model finished honestly — no fake replies, ever.
 */

export const MAX_MESSAGES = 500;
const HISTORY_TURNS = 24; // transcript window per turn (token budget control)

/** Run-creation bridge injected by the API layer (shared with POST /runs). */
export type CreateRunForConversation = (input: {
  text: string;
  seeds: ConversationSeed[];
  providerConfigId?: string;
}) => Promise<string>;

export interface ConversationDeps {
  createRun?: CreateRunForConversation;
}

export interface ConversationTurnRuntime {
  signal?: AbortSignal;
  onProgress?: (event: ConversationTurnProgress) => void;
  /** Hub-owned mid-turn steering queue (FA-HAR-05); injected between loop turns. */
  steer?: () => string | null;
}

export type ConversationErrorCode = 'not_found' | 'validation' | 'conversation_model_failed' | 'conversation_full' | 'turn_in_flight' | 'turn_cancelled' | 'no_active_turn';

export class ConversationError extends Error {
  constructor(readonly status: number, readonly code: ConversationErrorCode, message: string) {
    super(message);
    this.name = 'ConversationError';
  }
}

const mustGetConversation = (app: App, id: string): Conversation => {
  const conv = app.store.getObject('conversation', id);
  if (conv === null) throw new ConversationError(404, 'not_found', `conversation not found: ${id}`);
  return conv;
};

/** Conversation model route: conversation pin > workspace default > app default. */
export const resolveConversationProvider = (app: App, conv: Conversation): ModelProvider => {
  if (conv.providerConfigId !== undefined) {
    const run = { providerConfigId: conv.providerConfigId } as Parameters<typeof resolveRunProvider>[1];
    const provider = resolveRunProvider(app.store, run);
    if (provider !== null) return provider;
  }
  const activeId = app.store.getMeta(ACTIVE_MODEL_CONFIG_META_KEY);
  if (activeId !== null) {
    const provider = resolveRunProvider(app.store, { providerConfigId: activeId } as Parameters<typeof resolveRunProvider>[1]);
    if (provider !== null) return provider;
  }
  return app.provider;
};

/**
 * The reasoning route a conversation resolves to, with its DECLARED capability:
 * the same config the conversation pin / workspace default / env chain selects.
 * Only user-declared custom configs carry a reasoning declaration; the env chain
 * has none (capability is declared per config, never inferred from a catalog).
 */
export interface ConversationReasoningRoute {
  configId: string;
  style: ReasoningStyle;
  defaultGear: ReasoningGear;
}

export const resolveConversationReasoningRoute = (
  app: App,
  conv: Conversation,
): ConversationReasoningRoute | null => {
  const candidates: string[] = [];
  if (conv.providerConfigId !== undefined) candidates.push(conv.providerConfigId);
  const activeId = app.store.getMeta(ACTIVE_MODEL_CONFIG_META_KEY);
  if (typeof activeId === 'string' && activeId.length > 0) candidates.push(activeId);
  for (const configId of candidates) {
    const cfg = app.store.getObject('model_config', configId);
    if (cfg?.reasoning !== undefined) {
      return { configId: cfg.id, style: cfg.reasoning.style, defaultGear: cfg.reasoning.defaultGear };
    }
  }
  return null;
};

/**
 * The reasoning payload for THIS turn's model calls: explicit conversation gear wins,
 * else the route's declared default. null = send nothing (no declared capability).
 */
export const effectiveConversationReasoning = (
  app: App,
  conv: Conversation,
): { style: ReasoningStyle; gear: ReasoningGear } | null => {
  const route = resolveConversationReasoningRoute(app, conv);
  if (route === null) return null;
  return { style: route.style, gear: conv.reasoningGear ?? route.defaultGear };
};

/**
 * Validate + persist a gear override. Rules (fail-visible):
 *   - gear must be 'low'|'medium'|'high' or null (clear)
 *   - setting a gear requires the resolved route to DECLARE a capability — a control
 *     that would do nothing must not pretend to work (PRODUCT_HCI: no dead controls)
 */
export function setConversationReasoningGear(
  app: App,
  conversationId: string,
  rawGear: unknown,
): Conversation {
  const conv = mustGetConversation(app, conversationId);
  if (rawGear !== null && (typeof rawGear !== 'string' || !['low', 'medium', 'high'].includes(rawGear))) {
    throw new ConversationError(400, 'validation', 'field "gear" must be "low" | "medium" | "high" | null');
  }
  const route = resolveConversationReasoningRoute(app, conv);
  if (route === null) {
    throw new ConversationError(
      400,
      'validation',
      'this conversation\'s model route has no declared reasoning capability — declare one on the model config first',
    );
  }
  const updated = ConversationSchema.parse({
    ...conv,
    ...(rawGear === null ? {} : { reasoningGear: rawGear }),
    updatedAt: new Date().toISOString(),
  });
  // ReasoningGear.optional() keeps an absent field absent; explicit clear removes it.
  if (rawGear === null) delete (updated as { reasoningGear?: string }).reasoningGear;
  app.store.putObject('conversation', updated);
  return updated;
}

export function createConversation(
  app: App,
  opts: { title?: unknown; providerConfigId?: unknown } = {},
): Conversation {
  const now = new Date().toISOString();
  let providerConfigId: string | undefined;
  if (opts.providerConfigId !== undefined) {
    if (typeof opts.providerConfigId !== 'string' || !/^mcfg_[a-z0-9]+$/.test(opts.providerConfigId)) {
      throw new ConversationError(400, 'validation', 'field "providerConfigId" must be a model config id (mcfg_...)');
    }
    if (app.store.getObject('model_config', opts.providerConfigId) === null) {
      throw new ConversationError(404, 'not_found', `model config not found: ${opts.providerConfigId}`);
    }
    providerConfigId = opts.providerConfigId;
  }
  const title = typeof opts.title === 'string' && opts.title.trim().length > 0
    ? opts.title.trim().slice(0, 120)
    : '新对话';
  const conv = ConversationSchema.parse({
    id: newId('conv'),
    title,
    status: 'open',
    ...(providerConfigId !== undefined ? { providerConfigId } : {}),
    messages: [],
    runIds: [],
    turns: 0,
    createdAt: now,
    updatedAt: now,
  });
  app.store.putObject('conversation', conv);
  return conv;
}

export function listConversations(app: App): Conversation[] {
  // conversations are workspace-scoped, so they live in the unscoped slot ('__none__')
  const all = app.store.listObjects('conversation', '__none__') as Conversation[];
  return all.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/** Drop a deleted run's id from every conversation that references it, so the
 *  conversation stream never carries a dangling run link. Conversations (and
 *  their message history) themselves are never deleted by run deletion. */
export function detachRunFromAllConversations(app: App, runId: string): number {
  let touched = 0;
  for (const conv of listConversations(app)) {
    if (!conv.runIds.includes(runId)) continue;
    const updated: Conversation = ConversationSchema.parse({
      ...conv,
      runIds: conv.runIds.filter((id) => id !== runId),
      updatedAt: new Date().toISOString(),
    });
    app.store.putObject('conversation', updated);
    touched += 1;
  }
  return touched;
}

export function getConversation(app: App, id: string): Conversation {
  return mustGetConversation(app, id);
}

/** Rename a conversation (Doubao-parity conversation management). The title
 *  is the researcher's own label for the dialogue — same validation as
 *  creation (non-empty after trim, ≤120 chars); empty input is a 400, never a
 *  silent no-op. Touches updatedAt so the renamed conversation re-ranks by
 *  recency honestly. */
export function renameConversation(app: App, id: string, title: unknown): Conversation {
  const conv = mustGetConversation(app, id);
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new ConversationError(400, 'validation', 'field "title" must be a non-empty string');
  }
  const updated: Conversation = ConversationSchema.parse({
    ...conv,
    title: title.trim().slice(0, 120),
    updatedAt: new Date().toISOString(),
  });
  app.store.putObject('conversation', updated);
  return updated;
}

export function deleteConversation(app: App, id: string): void {
  if (app.store.getObject('conversation', id) === null) {
    throw new ConversationError(404, 'not_found', `conversation not found: ${id}`);
  }
  app.store.deleteObject('conversation', id);
}

/** All researcher materials in the conversation, deduped, bounded (launch bridge). */
export function collectConversationSeeds(conv: Conversation): ConversationSeed[] {
  const seen = new Set<string>();
  return conv.messages
    .filter((m) => m.role === 'researcher')
    .flatMap((m) => m.seeds ?? [])
    .filter((s) => {
      const k = `${s.title}|${s.identifiers[0]?.value ?? ''}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 50)
    .map((s) => ({
      title: s.title,
      identifiers: s.identifiers,
      ...(s.text !== undefined ? { text: s.text } : {}),
      ...(s.year !== undefined ? { year: s.year } : {}),
      authors: s.authors,
    }));
}

/** One model turn per conversation at a time (post + retry share this gate):
 * turns are whole-doc read-modify-writes and must never interleave. */
const inFlightTurns = new Set<string>();
const serializeTurn = <T>(conversationId: string, body: () => Promise<T>): Promise<T> => {
  if (inFlightTurns.has(conversationId)) {
    return Promise.reject(new ConversationError(409, 'turn_in_flight', 'this conversation already has a turn running — wait for it to land'));
  }
  inFlightTurns.add(conversationId);
  return body().finally(() => { inFlightTurns.delete(conversationId); });
};

const replyErrorText = (e: unknown): string =>
  (e instanceof Error ? e.message : String(e)).slice(0, 2000);

/**
 * Record a model failure ON the persisted researcher message (visible in the
 * transcript, retryable). Best-effort by design: the original error keeps
 * propagating to the caller — a failure to write the marker must never mask
 * the turn failure itself.
 */
const markReplyFailed = (app: App, conversationId: string, researcherMsgId: string, e: unknown): void => {
  try {
    const conv = app.store.getObject('conversation', conversationId);
    if (conv === null || !conv.messages.some((m) => m.id === researcherMsgId)) return;
    app.store.putObject('conversation', ConversationSchema.parse({
      ...conv,
      messages: conv.messages.map((m) => (m.id === researcherMsgId
        ? { ...m, replyError: replyErrorText(e) }
        : m)),
      updatedAt: new Date().toISOString(),
    }));
  } catch { /* secondary write only; the primary error already propagates */ }
};

/** Persist only the schema-projected public reply prefix. The caller throttles
 * whole-document writes and forces a flush before every terminal outcome. */
const writeReplyDraft = (app: App, conversationId: string, researcherMsgId: string, draft: string): void => {
  const conv = app.store.getObject('conversation', conversationId);
  if (conv === null || !conv.messages.some((m) => m.id === researcherMsgId)) return;
  app.store.putObject('conversation', ConversationSchema.parse({
    ...conv,
    messages: conv.messages.map((m) => {
      if (m.id !== researcherMsgId) return m;
      const next = { ...m };
      if (draft.length > 0) next.replyDraft = draft.slice(0, 40_000);
      else delete next.replyDraft;
      return next;
    }),
    updatedAt: new Date().toISOString(),
  }));
};

/**
 * Run one resident-agent model turn for an ALREADY-PERSISTED researcher
 * message and land the reply: append the agent message, clear any failure
 * marker, count the turn. Model failure throws ConversationError(502) — the
 * caller records it on the researcher message (the researcher's words stay).
 * Shared by postConversationMessage and retryConversationTurn.
 */
const runAndLandTurn = async (
  app: App,
  conversationId: string,
  conv: Conversation,
  researcherMsgId: string,
  deps: ConversationDeps,
  runtime: ConversationTurnRuntime = {},
): Promise<Conversation> => {
  const idx = conv.messages.findIndex((m) => m.id === researcherMsgId);
  if (idx < 0) throw new ConversationError(404, 'not_found', `message not found: ${researcherMsgId}`);
  const researcherMsg = conv.messages[idx]!;

  const provider = resolveConversationProvider(app, conv);
  // Conversation gear > config default; null when the route declares no capability.
  const turnReasoning = effectiveConversationReasoning(app, conv);
  // Rollout durability: deterministic session id per (conversation, message) —
  // a crashed turn leaves an unfinished rollout that retry RESUMES instead of
  // restarting from scratch (fresh sessions get the same id and start clean).
  const resumePlan = planConversationResume(conversationRolloutDir(app), conversationId, researcherMsgId);
  let draft = researcherMsg.replyDraft ?? '';
  // A retry/resumed provider attempt replaces an older interrupted prefix once
  // its first schema-projected byte arrives. Until then, retain the old prefix
  // durably so a failure-before-output does not erase useful researcher-visible
  // evidence from the prior attempt.
  let replaceDraftOnNextDelta = draft.length > 0;
  let lastDraftWrite = 0;
  const flushDraft = (force = false): void => {
    const now = Date.now();
    if (!force && now - lastDraftWrite < 400) return;
    writeReplyDraft(app, conversationId, researcherMsgId, draft);
    lastDraftWrite = now;
  };
  const onProgress = (event: ConversationTurnProgress): void => {
    if (event.type === 'reply_reset') {
      draft = '';
      replaceDraftOnNextDelta = false;
      flushDraft(true);
    } else if (event.type === 'reply_delta') {
      if (replaceDraftOnNextDelta) {
        draft = '';
        replaceDraftOnNextDelta = false;
        runtime.onProgress?.({ type: 'reply_reset' });
      }
      draft = `${draft}${event.text}`.slice(0, 40_000);
      flushDraft();
    }
    runtime.onProgress?.(event);
  };

  let generation: Awaited<ReturnType<typeof generateConversationTurn>>;
  try {
    generation = await generateConversationTurn(app, provider, conv, {
      text: researcherMsg.content,
      seeds: researcherMsg.seeds ?? [],
      history: conv.messages.filter((m) => m.id !== researcherMsgId).slice(-HISTORY_TURNS),
      source: 'researcher',
      sessionId: conversationSessionId(conversationId, researcherMsgId),
      ...(resumePlan !== null ? { resumePlan } : {}),
      ...(turnReasoning !== null ? { reasoning: turnReasoning } : {}),
      ...(runtime.signal !== undefined ? { signal: runtime.signal } : {}),
      ...(runtime.steer !== undefined ? { steer: runtime.steer } : {}),
      onProgress,
    });
  } finally {
    flushDraft(true);
  }
  if (generation.status !== 'completed' || generation.reply === undefined) {
    if (generation.status === 'aborted') {
      throw new ConversationError(409, 'turn_cancelled', 'resident agent turn cancelled; the received reply prefix was preserved');
    }
    throw new ConversationError(
      502,
      'conversation_model_failed',
      `resident agent turn failed (${generation.status}): ${generation.error ?? 'no reply'}`,
    );
  }
  const reply = generation.reply;

  // re-read: other writes (automation records, proposal resolutions) may have
  // landed while the model ran — never build the final doc from a stale read.
  const fresh = mustGetConversation(app, conversationId);
  const at = fresh.messages.findIndex((m) => m.id === researcherMsgId);
  if (at < 0) throw new ConversationError(409, 'validation', 'the answered message disappeared while the turn ran');
  const answered = fresh.messages[at]!;
  if (answered.replyError !== undefined) delete answered.replyError;
  if (answered.replyDraft !== undefined) delete answered.replyDraft;

  // candidate ids are assigned by the service (monotonic per conversation)
  const candSeq = fresh.messages.reduce((n, m) => n + (m.candidates?.length ?? 0), 0);
  const candidates: CandidateQuestion[] = reply.candidates.map((c, i) => ({
    id: `cand_${candSeq + i + 1}`,
    text: c.text,
    rationale: c.rationale,
  }));

  const updated = ConversationSchema.parse({
    ...fresh,
    messages: [
      ...fresh.messages.slice(0, at),
      answered,
      ConversationSchema.shape.messages.element.parse({
        id: newId('cmsg'),
        role: 'agent',
        content: [
          reply.reply,
          ...(reply.clarifyingQuestions.length > 0 ? [`\n**需要澄清：**\n${reply.clarifyingQuestions.map((q) => `- ${q}`).join('\n')}`] : []),
        ].join('\n'),
        ...(candidates.length > 0 ? { candidates } : {}),
        ...(generation.toolTrace.length > 0 ? { toolTrace: generation.toolTrace } : {}),
        ...(generation.proposals.length > 0 ? { proposals: generation.proposals } : {}),
        ...(generation.usage !== undefined ? { usage: generation.usage } : {}),
        ...(generation.thinking !== undefined && generation.thinking.length > 0
          ? { thinking: generation.thinking }
          : {}),
        createdAt: new Date().toISOString(),
      }),
      ...fresh.messages.slice(at + 1),
    ],
    turns: fresh.turns + 1,
    updatedAt: new Date().toISOString(),
  });
  app.store.putObject('conversation', updated);

  // Remembered grants ("don't ask again for this kind") execute after the turn
  // lands — each execution is its own read-modify-write of the conversation doc.
  for (const proposal of generation.proposals) {
    if (proposal.autoApproved === true && proposal.status === 'pending') {
      await resolveConversationProposal(app, conversationId, proposal.id, { approve: true }, deps);
    }
  }
  return mustGetConversation(app, conversationId);
};

/**
 * One dialogue turn. The researcher's message is persisted BEFORE the model
 * runs — human words are history and survive any model failure (recorded on
 * the message as a visible, retryable failure); the agent reply lands only
 * when the model finished honestly (no fake replies).
 */
export async function postConversationMessage(
  app: App,
  conversationId: string,
  input: { text?: unknown; seeds?: unknown },
  deps: ConversationDeps = {},
  runtime: ConversationTurnRuntime = {},
): Promise<Conversation> {
  return serializeTurn(conversationId, async () => {
    const conv = mustGetConversation(app, conversationId);
    if (conv.messages.length >= MAX_MESSAGES) {
      throw new ConversationError(409, 'conversation_full', 'conversation reached the message limit — start a new conversation');
    }
    if (typeof input.text !== 'string' || input.text.trim().length === 0) {
      throw new ConversationError(400, 'validation', 'field "text" is required (non-empty)');
    }
    const text = input.text.trim().slice(0, 20_000);
    const seeds = parseConversationSeeds(input.seeds);

    const now = new Date().toISOString();
    const researcherMsg = ConversationSchema.shape.messages.element.parse({
      id: newId('cmsg'),
      role: 'researcher',
      content: text,
      ...(seeds.length > 0 ? { seeds } : {}),
      createdAt: now,
    });
    const withMessage = ConversationSchema.parse({
      ...conv,
      title: conv.messages.length === 0 && conv.title === '新对话'
        ? text.slice(0, 60)
        : conv.title,
      messages: [...conv.messages, researcherMsg],
      updatedAt: now,
    });
    app.store.putObject('conversation', withMessage);

    try {
      return await runAndLandTurn(app, conversationId, withMessage, researcherMsg.id, deps, runtime);
    } catch (e) {
      markReplyFailed(app, conversationId, researcherMsg.id, e);
      throw e;
    }
  });
}

/**
 * Re-run the resident agent's reply for the conversation's LAST message while
 * it is an unanswered researcher message (a failed turn, or one whose process
 * died mid-run — the marker is optional evidence, the dangling tail is the
 * rule). Re-answering an already-replied message is refused honestly.
 */
export async function retryConversationTurn(
  app: App,
  conversationId: string,
  messageId: string,
  deps: ConversationDeps = {},
  runtime: ConversationTurnRuntime = {},
): Promise<Conversation> {
  return serializeTurn(conversationId, async () => {
    const conv = mustGetConversation(app, conversationId);
    if (conv.messages.length >= MAX_MESSAGES) {
      throw new ConversationError(409, 'conversation_full', 'conversation reached the message limit — start a new conversation');
    }
    const last = conv.messages.at(-1);
    if (last === undefined || last.id !== messageId || last.role !== 'researcher') {
      throw new ConversationError(409, 'validation', 'only the conversation\'s last message can be retried, and only while it has no reply');
    }
    try {
      return await runAndLandTurn(app, conversationId, conv, messageId, deps, runtime);
    } catch (e) {
      markReplyFailed(app, conversationId, messageId, e);
      throw e;
    }
  });
}

/** Record a launched run on its source conversation (called by the launch route). */
export function attachRunToConversation(app: App, conversationId: string, runId: string): void {
  const conv = mustGetConversation(app, conversationId);
  const updated = ConversationSchema.parse({
    ...conv,
    runIds: [...conv.runIds, runId],
    status: 'converged',
    updatedAt: new Date().toISOString(),
  });
  app.store.putObject('conversation', updated);
}

/** Append a deterministic automation-role record (trigger notices, action outcomes). */
export function appendAutomationRecord(app: App, conversationId: string, content: string): Conversation {
  const conv = mustGetConversation(app, conversationId);
  if (conv.messages.length >= MAX_MESSAGES) {
    throw new ConversationError(409, 'conversation_full', 'conversation reached the message limit — start a new conversation');
  }
  const updated = ConversationSchema.parse({
    ...conv,
    messages: [
      ...conv.messages,
      ConversationSchema.shape.messages.element.parse({
        id: newId('cmsg'),
        role: 'automation',
        content: content.slice(0, 2000),
        createdAt: new Date().toISOString(),
      }),
    ],
    updatedAt: new Date().toISOString(),
  });
  app.store.putObject('conversation', updated);
  return updated;
}

// ---- proposal resolution: the researcher gate for every agent action ----

const findProposal = (conv: Conversation, proposalId: string): { messageIndex: number; proposal: ConversationProposal } | null => {
  for (let i = conv.messages.length - 1; i >= 0; i -= 1) {
    const p = conv.messages[i]?.proposals?.find((x) => x.id === proposalId);
    if (p !== undefined) return { messageIndex: i, proposal: p };
  }
  return null;
};

const executeProposal = async (
  app: App,
  conv: Conversation,
  proposal: ConversationProposal,
  deps: ConversationDeps,
): Promise<{ ok: boolean; result: string }> => {
  const at = new Date().toISOString();
  try {
    if (proposal.kind === 'launch_research') {
      const args = LaunchResearchArgsSchema.parse(proposal.args);
      if (deps.createRun === undefined) {
        return { ok: false, result: 'run creation is unavailable in this context (no createRun bridge)' };
      }
      const runId = await deps.createRun({
        text: args.question,
        seeds: collectConversationSeeds(conv),
        ...(conv.providerConfigId !== undefined ? { providerConfigId: conv.providerConfigId } : {}),
      });
      attachRunToConversation(app, conv.id, runId);
      return { ok: true, result: `已启动研究 ${runId}（携带本对话全部材料）` };
    }
    if (proposal.kind === 'cancel_run') {
      const args = CancelRunArgsSchema.parse(proposal.args);
      const run = app.store.getRun(args.runId);
      if (run === null) return { ok: false, result: `研究 ${args.runId} 不存在（可能已被清理）` };
      if (!conv.runIds.includes(args.runId)) {
        return { ok: false, result: `研究 ${args.runId} 不是本对话启动的，不能从这里取消` };
      }
      // Same atomic flag the API cancel route sets; a live executor honors it at
      // its next checkpoint, and the persisted request survives executor death.
      const ok = app.store.requestCancel(args.runId);
      if (!ok) {
        return { ok: false, result: `研究 ${args.runId} 已处于终态（${run.status}），无需取消` };
      }
      app.store.appendEvent(args.runId, { type: 'run_cancelled', detail: { via: 'conversation-proposal' } });
      return { ok: true, result: `已请求取消研究 ${args.runId}——执行中的进程会在下一个检查点停止，之后可随时恢复` };
    }
    if (proposal.kind === 'create_automation') {
      const args = CreateAutomationArgsSchema.parse(proposal.args);
      const automation: Automation = {
        id: newId('auto'),
        conversationId: conv.id,
        label: args.label ?? args.task.slice(0, 60),
        trigger: args.trigger,
        task: args.task,
        enabled: true,
        maxTurnsPerFire: 6,
        fireCount: 0,
        notifiedRunIds: [],
        createdAt: at,
        updatedAt: at,
      };
      app.store.putObject('automation', automation);
      const triggerText = args.trigger.kind === 'run_completed'
        ? '每当有研究完成时'
        : `每 ${args.trigger.intervalMinutes} 分钟`;
      return { ok: true, result: `已创建自动化「${automation.label}」（${triggerText}触发；仅在本服务进程运行期间生效）` };
    }
    if (proposal.kind === 'create_tool_integration') {
      const args = CreateToolIntegrationArgsSchema.parse(proposal.args);
      const issues = integrationSemanticIssues(args.draft);
      if (issues.length > 0) {
        return { ok: false, result: `配置草稿无效：${issues.join('；')}` };
      }
      // Conversation-staged integrations are ALWAYS disabled: the agent drafts,
      // the researcher activates in settings (explicit gating, no self-enable).
      const integration = ToolIntegrationSchema.parse({
        ...instantiateDraft({ ...args.draft, enabled: false }, {
          id: newId('tint'),
          createdBy: 'conversation',
          provenance: { conversationId: conv.id },
        }),
      });
      app.store.putObject('tool_integration', integration);
      const warnings = args.warnings.length > 0 ? `注意：${args.warnings.join('；')}` : '';
      return { ok: true, result: `已暂存工具「${integration.label}」（默认停用）——到 设置→工具 中审查、填入密钥并启用。${warnings}` };
    }
    if (proposal.kind === 'run_command') {
      const args = RunCommandArgsSchema.parse(proposal.args);
      const root = process.cwd();
      const cwd = resolveInsideRoot(root, args.cwd ?? '.');
      if (cwd === null) {
        return { ok: false, result: `工作目录越界（${args.cwd ?? '.'}）——只允许工作区内的相对路径` };
      }
      // The card shows the exact command (argSummary carries it verbatim); this
      // is the researcher-approved execution — profile-loaded shell, bounded.
      const r = await runInLoginShell({
        command: args.command,
        cwd,
        timeoutMs: args.timeoutMs,
        maxOutputChars: 20_000,
      });
      const out = r.stdout.length > 0 ? `\n stdout:\n${r.stdout}` : '';
      const err = r.stderr.length > 0 ? `\n stderr:\n${r.stderr}` : '';
      const verdict = r.timedOut
        ? `命令超时（${args.timeoutMs}ms）后被终止`
        : `退出码 ${r.exitCode ?? 'unknown'}`;
      return {
        // spawnFailed is an execution failure — never reported as success.
        ok: !r.timedOut && !('spawnFailed' in r) && (r.exitCode === 0 || r.exitCode === null),
        result: `命令：${args.command}\n${verdict}，耗时 ${r.durationMs}ms${r.truncated ? '（输出已截断）' : ''}${out}${err}`,
      };
    }
    const args = CancelAutomationArgsSchema.parse(proposal.args);
    const automation = app.store.getObject('automation', args.automationId);
    if (automation === null) return { ok: false, result: `automation not found: ${args.automationId}` };
    if (automation.conversationId !== conv.id) return { ok: false, result: 'that automation belongs to a different conversation' };
    app.store.putObject('automation', { ...automation, enabled: false, updatedAt: at });
    return { ok: true, result: `已停用自动化「${automation.label}」` };
  } catch (e) {
    return { ok: false, result: `执行失败：${e instanceof Error ? e.message : String(e)}` };
  }
};

/**
 * Approve (optionally remembering the kind for this conversation) or reject a
 * pending proposal. Execution failures are recorded ON the proposal and as an
 * automation-role message — honest and visible, never a silent 500.
 */
export async function resolveConversationProposal(
  app: App,
  conversationId: string,
  proposalId: string,
  opts: { approve: boolean; remember?: boolean },
  deps: ConversationDeps = {},
): Promise<Conversation> {
  let conv = mustGetConversation(app, conversationId);
  const found = findProposal(conv, proposalId);
  if (found === null) throw new ConversationError(404, 'not_found', `proposal not found: ${proposalId}`);
  if (found.proposal.status !== 'pending') {
    throw new ConversationError(409, 'validation', `proposal already ${found.proposal.status}`);
  }

  const at = new Date().toISOString();
  let outcome: { ok: boolean; result: string };
  let status: ConversationProposal['status'];
  if (opts.approve) {
    outcome = await executeProposal(app, conv, found.proposal, deps);
    status = outcome.ok ? 'executed' : 'failed';
  } else {
    outcome = { ok: true, result: '研究者已拒绝该提案' };
    status = 'rejected';
  }

  // re-read: execution itself (e.g. attachRunToConversation) may have written the doc
  conv = mustGetConversation(app, conversationId);
  const updated = ConversationSchema.parse({
    ...conv,
    ...(opts.approve && opts.remember === true && !conv.autoApprove.includes(found.proposal.kind) && conv.autoApprove.length < 10
      ? { autoApprove: [...conv.autoApprove, found.proposal.kind] }
      : {}),
    messages: conv.messages.map((m, i) => i === findProposal(conv, proposalId)?.messageIndex
      ? {
        ...m,
        proposals: (m.proposals ?? []).map((p) => p.id === proposalId
          ? { ...p, status, result: outcome.result.slice(0, 2000), resolvedAt: at }
          : p),
      }
      : m),
    updatedAt: at,
  });
  app.store.putObject('conversation', updated);

  const verb = status === 'executed' ? '✅ 已执行' : status === 'failed' ? '⚠️ 执行失败' : '已拒绝';
  const rememberNote = opts.approve && opts.remember === true ? '（本对话内此类行动不再需要批准）' : '';
  return appendAutomationRecord(app, conversationId, `${verb}：${found.proposal.title} ${outcome.result}${rememberNote}`);
}

function parseConversationSeeds(raw: unknown): NonNullable<Conversation['messages'][number]['seeds']> {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    throw new ConversationError(400, 'validation', 'field "seeds" must be an array');
  }
  if (raw.length > 50) {
    throw new ConversationError(400, 'validation', 'field "seeds" must hold at most 50 items');
  }
  const out: NonNullable<Conversation['messages'][number]['seeds']> = [];
  for (const [i, item] of raw.entries()) {
    if (typeof item !== 'object' || item === null) {
      throw new ConversationError(400, 'validation', `seeds[${i}]: must be an object`);
    }
    const rec = item as Record<string, unknown>;
    if (typeof rec.title !== 'string' || rec.title.trim().length === 0) {
      throw new ConversationError(400, 'validation', `seeds[${i}].title: must be a non-empty string`);
    }
    const parsed = ConversationSeedSchema.safeParse({
      title: rec.title.trim().slice(0, 500),
      identifiers: Array.isArray(rec.identifiers) ? rec.identifiers : [],
      ...(typeof rec.text === 'string' && rec.text.length > 0 && rec.text.length <= 50_000 ? { text: rec.text } : {}),
      ...(typeof rec.year === 'number' && Number.isInteger(rec.year) ? { year: rec.year } : {}),
      authors: Array.isArray(rec.authors) ? rec.authors.filter((a): a is string => typeof a === 'string').slice(0, 50) : [],
    });
    if (!parsed.success) {
      throw new ConversationError(400, 'validation', `seeds[${i}]: shape invalid (${parsed.error.issues[0]?.path.join('.') ?? ''})`);
    }
    out.push(parsed.data);
  }
  return out;
}
