/**
 * Typed HTTP access to the FAR-Lab /api/v1 contract (TUI v3: read-only
 * browsing + live run attach + resident conversations). The base URL is
 * mutable so tests/e2e can point the client at an ephemeral local server;
 * production reads FAR_URL (default loopback workbench).
 */

let baseUrl = process.env.FAR_URL ?? 'http://127.0.0.1:3196/api/v1';

/** Retarget the client (tests). Trailing slash tolerated, stripped. */
export function setBaseUrl(url: string): void {
  baseUrl = url.replace(/\/+$/, '');
}
export function getBaseUrl(): string {
  return baseUrl;
}

async function jsonFetch(pathName: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${baseUrl}${pathName}`, init);
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message !== undefined ? `: ${body.error.message}` : '';
    } catch { /* non-JSON error body — status alone is the honest signal */ }
    throw new Error(`${init.method ?? 'GET'} ${pathName} → ${res.status}${detail}`);
  }
  return res.json();
}

// ---- runs -------------------------------------------------------------------

export interface RunSummary {
  id: string;
  status: string;
  currentStage: string;
  createdAt: string;
  questionText?: string;
  domain?: string;
}

export interface RunEvent {
  seq: number;
  at: string;
  type: string;
  stage?: string;
  detail?: Record<string, unknown>;
}

export interface RunDetail {
  id: string;
  status: string;
  currentStage: string;
  createdAt: string;
  updatedAt?: string;
  lastError?: string;
  lease?: { holder: string | null; expiresAt?: string | null; live?: boolean };
}

export async function listRuns(signal?: AbortSignal): Promise<RunSummary[]> {
  const data = await jsonFetch('/runs', { signal });
  const arr = (data as { runs?: RunSummary[] } | RunSummary[]);
  return Array.isArray(arr) ? arr : (arr.runs ?? []);
}

export async function getRun(runId: string, signal?: AbortSignal): Promise<RunDetail> {
  const data = await jsonFetch(`/runs/${encodeURIComponent(runId)}`, { signal });
  const d = data as RunDetail & Record<string, unknown>;
  if (typeof d.id !== 'string') throw new Error(`GET /runs/${runId}: unexpected payload`);
  return d;
}

export async function getEvents(runId: string, signal?: AbortSignal): Promise<RunEvent[]> {
  const data = await jsonFetch(`/runs/${encodeURIComponent(runId)}/events?afterSeq=0`, { signal });
  const arr = (data as { events?: RunEvent[] } | RunEvent[]);
  return Array.isArray(arr) ? arr : (arr.events ?? []);
}

/** SSE attach URL (Last-Event-ID handled by the sse client, not fetch headers here). */
export function eventStreamUrl(runId: string, afterSeq = 0): string {
  return `${baseUrl}/runs/${encodeURIComponent(runId)}/events/stream?afterSeq=${afterSeq}`;
}

export async function cancelRun(runId: string): Promise<void> {
  await jsonFetch(`/runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' });
}

/** Resume enqueues execution server-side (create-and-poll; watch via the stream). */
export async function resumeRun(runId: string): Promise<void> {
  await jsonFetch(`/runs/${encodeURIComponent(runId)}/resume`, { method: 'POST' });
}

export async function forkRun(runId: string, reason?: string): Promise<{ runId: string }> {
  const data = await jsonFetch(`/runs/${encodeURIComponent(runId)}/fork`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...(reason !== undefined ? { reason } : {}) }),
  });
  const out = data as { run?: { id?: string }; runId?: string };
  const id = out.run?.id ?? out.runId;
  if (typeof id !== 'string') throw new Error('fork: unexpected payload');
  return { runId: id };
}

/** Structured-but-loose run object views (hypotheses/evidence renderers narrow). */
export async function getHypotheses(runId: string, signal?: AbortSignal): Promise<unknown[]> {
  const data = await jsonFetch(`/runs/${encodeURIComponent(runId)}/hypotheses`, { signal });
  const arr = (data as { hypotheses?: unknown[] } | unknown[]);
  return Array.isArray(arr) ? arr : (arr.hypotheses ?? []);
}

export async function getEvidence(runId: string, signal?: AbortSignal): Promise<{ claims: unknown[]; relations: unknown[] }> {
  const data = await jsonFetch(`/runs/${encodeURIComponent(runId)}/evidence`, { signal });
  const d = data as { claims?: unknown[]; evidenceRelations?: unknown[]; relations?: unknown[] };
  return { claims: d.claims ?? [], relations: d.evidenceRelations ?? d.relations ?? [] };
}

export interface LineageGraph {
  nodes: Array<{ id: string; kind: string }>;
  edges: Array<{ from: string; to: string; kind: string }>;
}

export async function getLineage(runId: string, signal?: AbortSignal): Promise<LineageGraph> {
  const data = await jsonFetch(`/runs/${encodeURIComponent(runId)}/lineage`, { signal });
  const g = data as LineageGraph;
  if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) throw new Error('lineage: unexpected payload');
  return g;
}

/** Markdown research report (export stage output) — null when none stored. */
export async function getReport(runId: string): Promise<string | null> {
  const res = await fetch(`${baseUrl}/runs/${encodeURIComponent(runId)}/report`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GET report → ${res.status}`);
  return res.text();
}

// ---- conversations (resident agent) ------------------------------------------

export interface ConversationProposal {
  id: string;
  kind: string;
  title: string;
  args: Record<string, unknown>;
  status: 'pending' | 'executed' | 'rejected' | 'failed';
  result?: string;
  autoApproved?: boolean;
  riskLevel?: 'low' | 'moderate' | 'high';
  argSummary?: Record<string, string>;
  createdAt: string;
  resolvedAt?: string;
}

export interface ConversationMessage {
  id: string;
  role: 'researcher' | 'agent' | 'automation';
  content: string;
  seeds?: Array<{ title: string; identifiers: Array<{ kind: string; value: string }> }>;
  candidates?: Array<{ id: string; text: string; rationale: string }>;
  toolTrace?: Array<{ tool: string; ok: boolean; summary?: string; durationMs?: number }>;
  proposals?: ConversationProposal[];
  usage?: { provider: string; modelId: string; latencyMs: number; inputTokens?: number; outputTokens?: number; modelCalls?: number; toolCalls?: number };
  replyError?: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  status: 'open' | 'converged';
  messages: ConversationMessage[];
  runIds: string[];
  turns: number;
  updatedAt: string;
  createdAt: string;
}

export async function listConversations(signal?: AbortSignal): Promise<Conversation[]> {
  const data = await jsonFetch('/conversations', { signal });
  const arr = (data as { conversations?: Conversation[] } | Conversation[]);
  return Array.isArray(arr) ? arr : (arr.conversations ?? []);
}

export async function getConversation(id: string, signal?: AbortSignal): Promise<Conversation> {
  const data = await jsonFetch(`/conversations/${encodeURIComponent(id)}`, { signal });
  const c = data as { conversation?: Conversation } | Conversation;
  const conv = 'conversation' in c ? c.conversation : c;
  if (conv === undefined || typeof conv.id !== 'string') throw new Error(`GET /conversations/${id}: unexpected payload`);
  return conv;
}

export async function createConversation(title?: string): Promise<Conversation> {
  const data = await jsonFetch('/conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...(title !== undefined && title.trim().length > 0 ? { title: title.trim() } : {}) }),
  });
  const c = data as { conversation?: Conversation };
  if (c.conversation === undefined) throw new Error('create conversation: unexpected payload');
  return c.conversation;
}

export interface SeedInput {
  title: string;
  identifiers: Array<{ kind: 'doi' | 'arxiv' | 'url'; value: string }>;
  text?: string;
  year?: number;
  authors?: string[];
}

export async function postConversationMessage(
  id: string, text: string, opts: { seeds?: SeedInput[]; signal?: AbortSignal } = {},
): Promise<Conversation> {
  const data = await jsonFetch(`/conversations/${encodeURIComponent(id)}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, ...(opts.seeds !== undefined && opts.seeds.length > 0 ? { seeds: opts.seeds } : {}) }),
    ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
  });
  const c = data as { conversation?: Conversation };
  if (c.conversation === undefined) throw new Error('post message: unexpected payload');
  return c.conversation;
}

export async function resolveProposal(
  conversationId: string, proposalId: string, approve: boolean, remember: boolean,
): Promise<Conversation> {
  const data = await jsonFetch(`/conversations/${encodeURIComponent(conversationId)}/proposals/${encodeURIComponent(proposalId)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ approve, remember }),
  });
  const c = data as { conversation?: Conversation };
  if (c.conversation === undefined) throw new Error('resolve proposal: unexpected payload');
  return c.conversation;
}

/** Crystallize the research question and launch a real run (202 async). */
export async function launchFromConversation(conversationId: string, text: string): Promise<{ runId: string }> {
  const data = await jsonFetch(`/conversations/${encodeURIComponent(conversationId)}/launch`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const out = data as { runId?: string };
  if (typeof out.runId !== 'string') throw new Error('launch: unexpected payload');
  return { runId: out.runId };
}
