/**
 * Chat-core (pure, deterministic — node:test): the conversation view model.
 * Maps a Conversation document (domain/conversation.ts shape) to structured
 * render rows the Ink chat view and the line-mode fallback BOTH consume —
 * one semantics, two renderers. Trust rules mirror the web chat: proposal
 * cards always show the SERVER-computed riskLevel/argSummary (never the
 * model-authored title alone), tool traces show outcomes not payloads, and
 * failed turns keep the researcher's words with an honest error banner.
 */
import type { Conversation, ConversationMessage, ConversationProposal } from './api.ts';

export type ChatRow =
  | { kind: 'turn'; role: 'researcher' | 'agent' | 'automation'; label: string; text: string; failed?: boolean }
  | { kind: 'tools'; tools: Array<{ tool: string; ok: boolean; summary?: string; durationMs?: number }> }
  | { kind: 'proposal'; proposal: ConversationProposal }
  | { kind: 'candidates'; items: Array<{ text: string; rationale: string }> }
  | { kind: 'usage'; line: string }
  | { kind: 'error'; text: string; retryHint: boolean };

const ROLE_LABEL: Record<'researcher' | 'agent' | 'automation', string> = {
  researcher: '你',
  agent: '常驻研究',
  automation: '系统',
};

/** Parse one message into its rows (content first, then per-turn extras). */
export function messageRows(m: ConversationMessage): ChatRow[] {
  const rows: ChatRow[] = [];
  const label = ROLE_LABEL[m.role];
  if (m.role === 'researcher' && m.replyError !== undefined) {
    rows.push({ kind: 'turn', role: 'researcher', label, text: m.content, failed: true });
    rows.push({ kind: 'error', text: m.replyError, retryHint: true });
  } else {
    rows.push({ kind: 'turn', role: m.role, label, text: m.content });
  }
  if (m.toolTrace !== undefined && m.toolTrace.length > 0) {
    rows.push({ kind: 'tools', tools: m.toolTrace.map((t) => ({ ...t })) });
  }
  for (const p of m.proposals ?? []) rows.push({ kind: 'proposal', proposal: p });
  if (m.candidates !== undefined && m.candidates.length > 0) {
    rows.push({ kind: 'candidates', items: m.candidates.map((c) => ({ text: c.text, rationale: c.rationale })) });
  }
  if (m.usage !== undefined) {
    const u = m.usage;
    const tokens = u.inputTokens !== undefined || u.outputTokens !== undefined
      ? ` · ${u.inputTokens ?? '?'}→${u.outputTokens ?? '?'} tok` : '';
    const calls = u.modelCalls !== undefined || u.toolCalls !== undefined
      ? ` · ${u.modelCalls ?? 0} 模型/${u.toolCalls ?? 0} 工具` : '';
    rows.push({ kind: 'usage', line: `${u.provider}/${u.modelId} · ${u.latencyMs}ms${tokens}${calls}` });
  }
  return rows;
}

/** Full conversation -> rows (optionally only the last `limit` messages). */
export function conversationRows(conv: Conversation, limit?: number): ChatRow[] {
  const messages = limit === undefined ? conv.messages : conv.messages.slice(-limit);
  return messages.flatMap(messageRows);
}

/** All proposals still awaiting a decision, oldest first. */
export function pendingProposals(conv: Conversation): ConversationProposal[] {
  const out: ConversationProposal[] = [];
  for (const m of conv.messages) for (const p of m.proposals ?? []) if (p.status === 'pending') out.push(p);
  return out;
}

/** Proposal decision vocabulary (Aider io.py lineage, chat variant). */
export type ProposalDecision = { approve: boolean; remember: boolean };

export function proposalDecision(input: string): ProposalDecision | null {
  const k = input.trim().toLowerCase();
  if (k === 'y') return { approve: true, remember: false };
  if (k === 'a') return { approve: true, remember: true };
  if (k === 'n') return { approve: false, remember: false };
  return null;
}

export const PROPOSAL_FOOTER = 'y 批准 · a 批准并记住此类 · n 拒绝';

const RISK_LABEL: Record<string, string> = { low: '低风险', moderate: '中风险', high: '高风险' };
const ACTION_LABEL: Record<string, string> = {
  launch_research: '启动研究',
  create_automation: '创建自动化',
  cancel_automation: '停用自动化',
  create_tool_integration: '接入工具',
};
const STATUS_LABEL: Record<string, string> = {
  pending: '待决定', executed: '已执行', rejected: '已拒绝', failed: '执行失败',
};

/** One-plain-line proposal rendering shared by both renderers' compact modes. */
export function proposalLine(p: ConversationProposal): string {
  const kind = ACTION_LABEL[p.kind] ?? p.kind;
  const risk = p.riskLevel !== undefined ? ` · ${RISK_LABEL[p.riskLevel] ?? p.riskLevel}` : '';
  const auto = p.autoApproved === true ? ' · 按记忆自动执行' : '';
  return `[${kind}] ${p.title} · ${STATUS_LABEL[p.status] ?? p.status}${risk}${auto}${p.status === 'failed' && p.result !== undefined ? ` — ${p.result}` : ''}`;
}

/** Deterministic arg summary lines (server-computed argSummary preferred). */
export function proposalArgLines(p: ConversationProposal): Array<[string, string]> {
  const src = p.argSummary ?? {};
  return Object.entries(src).map(([k, v]) => [k, v] as [string, string]);
}

/** Chat header meta line (turns / status / launched runs count). */
export function conversationMeta(conv: Conversation): string {
  const status = conv.status === 'converged' ? '已收敛' : '进行中';
  return `${conv.turns} 轮 · ${status}${conv.runIds.length > 0 ? ` · 已启动 ${conv.runIds.length} 项研究` : ''}`;
}
