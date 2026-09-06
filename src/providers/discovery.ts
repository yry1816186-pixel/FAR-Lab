import type { ProviderWireProtocol } from '../domain/model-config.js';
import { assertFetchDestination } from '../shared/destination-guard.js';

/**
 * BP-4 model discovery: list the models an endpoint actually serves.
 *
 * Wire-specific endpoints (verified against official API docs 2026-08):
 * - openai wire:      GET {baseUrl}/models       — baseUrl already carries /v1
 *                     (custom.ts appends /chat/completions the same way)
 * - anthropic wire:   GET {baseUrl}/v1/models    — x-api-key + anthropic-version
 * - gemini wire:      GET {baseUrl}/v1beta/models — x-goog-api-key; response is
 *                     {models:[{name:'models/<id>', displayName?}]} (REST v1beta)
 *
 * The parser is tolerant and HONEST: only fields present in the response are
 * reported; missing context windows / capabilities surface as undefined, never
 * guessed. Live use requires the endpoint's credentials when authentication is enabled.
 */

export interface DiscoveredModel {
  id: string;
  ownedBy?: string;
  displayName?: string;
  createdAt?: string;
}

export interface DiscoveryResult {
  models: DiscoveredModel[];
  httpStatus: number;
  /** Raw count before dedup — a diagnostic, not a UI number. */
  rawCount: number;
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<{
  status: number;
  ok: boolean;
  json(): Promise<unknown>;
}>;

export const discoverModels = async (
  input: { wire: ProviderWireProtocol; baseUrl: string; apiKey: string; signal?: AbortSignal; timeoutMs?: number },
  fetchImpl: FetchLike,
): Promise<DiscoveryResult> => {
  if (!['openai', 'openai_responses', 'anthropic', 'gemini'].includes(input.wire)) {
    throw new Error('model discovery: unsupported wire protocol');
  }
  let url: URL;
  try {
    url = new URL(input.baseUrl);
  } catch {
    throw new Error('model discovery: invalid base URL');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username.length > 0 || url.password.length > 0) {
    throw new Error('model discovery: base URL must use HTTP(S) without embedded credentials');
  }
  try {
    assertFetchDestination(url.href);
  } catch {
    throw new Error('model discovery: base URL rejected by destination policy');
  }
  const base = url.pathname.replace(/\/+$/, '');
  url.pathname =
    input.wire === 'anthropic' ? `${base}/v1/models`
    : input.wire === 'gemini' ? `${base}/v1beta/models`
    : `${base}/models`;
  url.hash = '';
  const timeoutMs = input.timeoutMs ?? 15_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120_000) {
    throw new Error('model discovery: timeout must be between 1 and 120000 milliseconds');
  }
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = input.signal === undefined ? timeoutSignal : AbortSignal.any([input.signal, timeoutSignal]);
  const transportError = (): Error => new Error(
    input.signal?.aborted === true ? 'model discovery cancelled'
    : timeoutSignal.aborted ? 'model discovery timed out'
    : 'model discovery: endpoint request failed',
  );
  if (signal.aborted) throw transportError();
  const headers: Record<string, string> =
    input.wire === 'anthropic'
      ? { 'x-api-key': input.apiKey, 'anthropic-version': '2023-06-01' }
      : input.wire === 'gemini'
        ? { 'x-goog-api-key': input.apiKey }
        : input.apiKey.length > 0
          ? { authorization: `Bearer ${input.apiKey}` }
          : {};
  const res = await fetchImpl(url.href, { method: 'GET', headers, signal, redirect: 'error' }).catch(() => {
    throw transportError();
  });
  if (!res.ok) {
    throw new Error(`model discovery failed: HTTP ${res.status}`);
  }
  const body = await res.json().catch(() => {
    if (signal.aborted) throw transportError();
    throw new Error('model discovery: endpoint returned invalid JSON');
  });
  const models = input.wire === 'gemini' ? parseGeminiModels(body) : parseModels(body);
  const catalog = body as { models?: unknown[]; data?: unknown[] };
  const rawCount = (input.wire === 'gemini' ? catalog.models : catalog.data)?.length ?? 0;
  return { models, httpStatus: res.status, rawCount };
};

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

/**
 * Parse OpenAI-wire `{data:[{id, owned_by?, created?}]}` or Anthropic-wire
 * `{data:[{type:'model', id, display_name?, created_at?}]}`. Unknown shapes throw —
 * fail closed rather than presenting an empty catalog as "this endpoint has no models".
 */
export const parseModels = (body: unknown): DiscoveredModel[] => {
  if (body === null || typeof body !== 'object' || !Array.isArray((body as { data?: unknown }).data)) {
    throw new Error('model discovery: response is not a {data:[...]} catalog');
  }
  const seen = new Set<string>();
  const out: DiscoveredModel[] = [];
  for (const raw of (body as { data: unknown[] }).data) {
    if (raw === null || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = str(r.id);
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      ...(str(r.owned_by) !== undefined ? { ownedBy: str(r.owned_by) } : {}),
      ...(str(r.display_name) !== undefined ? { displayName: str(r.display_name) } : {}),
      ...(str(r.created_at) !== undefined ? { createdAt: str(r.created_at) } : {}),
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
};

/**
 * Parse Gemini v1beta `{models:[{name:'models/<id>', displayName?, description?}]}`.
 * The REST name carries the 'models/' prefix; the config form wants the bare model
 * id (what :generateContent's URL segment takes). Same fail-closed rule as
 * parseModels: an unexpected shape throws instead of presenting an empty catalog.
 */
export const parseGeminiModels = (body: unknown): DiscoveredModel[] => {
  if (body === null || typeof body !== 'object' || !Array.isArray((body as { models?: unknown }).models)) {
    throw new Error('model discovery: response is not a {models:[...]} catalog');
  }
  const seen = new Set<string>();
  const out: DiscoveredModel[] = [];
  for (const raw of (body as { models: unknown[] }).models) {
    if (raw === null || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const name = str(r.name);
    if (name === undefined) continue;
    const id = name.replace(/^models\//, '');
    if (id.length === 0 || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      ...(str(r.displayName) !== undefined ? { displayName: str(r.displayName) } : {}),
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
};
