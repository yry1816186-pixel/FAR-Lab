import type { ProviderWireProtocol } from '../domain/model-config.js';

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
 * guessed. Live use requires real credentials (BLOCKED-live under the current
 * no-live-API directive); the parser itself is fully covered offline.
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

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string> }) => Promise<{
  status: number;
  ok: boolean;
  json(): Promise<unknown>;
}>;

export const discoverModels = async (
  input: { wire: ProviderWireProtocol; baseUrl: string; apiKey: string },
  fetchImpl: FetchLike,
): Promise<DiscoveryResult> => {
  const base = input.baseUrl.replace(/\/+$/, '');
  const url =
    input.wire === 'anthropic' ? `${base}/v1/models`
    : input.wire === 'gemini' ? `${base}/v1beta/models`
    : `${base}/models`;
  const headers: Record<string, string> =
    input.wire === 'anthropic'
      ? { 'x-api-key': input.apiKey, 'anthropic-version': '2023-06-01' }
      : input.wire === 'gemini'
        ? { 'x-goog-api-key': input.apiKey }
        : input.apiKey.length > 0
          ? { authorization: `Bearer ${input.apiKey}` }
          : {};
  const res = await fetchImpl(url, { method: 'GET', headers });
  if (!res.ok) {
    throw new Error(`model discovery failed: HTTP ${res.status} from ${url}`);
  }
  const body = await res.json(); // only parsed after the ok gate — an HTML error page never becomes a parse error
  const models = input.wire === 'gemini' ? parseGeminiModels(body) : parseModels(body);
  return { models, httpStatus: res.status, rawCount: models.length };
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
