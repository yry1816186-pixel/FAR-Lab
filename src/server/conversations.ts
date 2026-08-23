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
} from './conversation-agent.js';

/**
 * Conversation service (resident-agent flow, PROPOSAL-resident-agent): the
 * durable dialogue between the researcher and the resident agent. Every agent
 * turn is a REAL kernel tool-loop (conversation-agent.ts) — reads are free,
 * actions land as researcher-gated proposals. A turn is only persisted when
 * the model finished honestly (fail-visible, retryable); nothing about a
 * failed turn is kept.
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

export type ConversationErrorCode = 'not_found' | 'validation' | 'conversation_model_failed' | 'conversation_full';

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

export function getConversation(app: App, id: string): Conversation {
  return mustGetConversation(app, id);
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

/** One dialogue turn: persist the researcher message, run the resident agent, persist its reply. */
export async function postConversationMessage(
  app: App,
  conversationId: string,
  input: { text?: unknown; seeds?: unknown },
  deps: ConversationDeps = {},
): Promise<Conversation> {
  const conv = mustGetConversation(app, conversationId);
  if (conv.messages.length >= MAX_MESSAGES) {
    throw new ConversationError(409, 'conversation_full', 'conversation reached the message limit — start a new conversation');
  }
  if (typeof input.text !== 'string' || input.text.trim().length === 0) {
    throw new ConversationError(400, 'validation', 'field "text" is required (non-empty)');
  }
  const text = input.text.trim().slice(0, 20_000);
  const seeds = parseConversationSeeds(input.seeds);

  const provider = resolveConversationProvider(app, conv);
  const generation = await generateConversationTurn(app, provider, conv, {
    text,
    seeds,
    history: conv.messages.slice(-HISTORY_TURNS),
    source: 'researcher',
    ...(effectiveConversationReasoning(app, conv) ?? {}),
  });
  if (generation.status !== 'completed' || generation.reply === undefined) {
    throw new ConversationError(
      502,
      'conversation_model_failed',
      `resident agent turn failed (${generation.status}): ${generation.error ?? 'no reply'}`,
    );
  }
  const reply = generation.reply;

  const now = new Date().toISOString();
  const researcherMsg = ConversationSchema.shape.messages.element.parse({
    id: newId('cmsg'),
    role: 'researcher',
    content: text,
    ...(seeds.length > 0 ? { seeds } : {}),
    createdAt: now,
  });

  // candidate ids are assigned by the service (monotonic per conversation)
  const candSeq = conv.messages.reduce((n, m) => n + (m.candidates?.length ?? 0), 0);
  const candidates: CandidateQuestion[] = reply.candidates.map((c, i) => ({
    id: `cand_${candSeq + i + 1}`,
    text: c.text,
    rationale: c.rationale,
  }));

  const updated = ConversationSchema.parse({
    ...conv,
    title: conv.messages.length === 0 && conv.title === '新对话'
      ? text.slice(0, 60)
      : conv.title,
    messages: [
      ...conv.messages,
      researcherMsg,
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
        createdAt: new Date().toISOString(),
      }),
    ],
    turns: conv.turns + 1,
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
