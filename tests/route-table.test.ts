import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createApiServer } from '../src/server/api.js';
import type { ApiServer } from '../src/server/api.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';
import { createConversation } from '../src/server/conversations.js';

// BC-002/BC-011 route-table characterization: the full dispatch matrix of the
// HTTP API, frozen as (method, path) → (status, error code) pairs over a fixed
// fixture workspace. This is the per-route equivalence net for the api.ts →
// routes/* split: every dispatch branch (including method-mismatch 404s and
// malformed-id 400s) is pinned, so moving a family into its own module cannot
// change which handler a request reaches. Expectations were captured from the
// pre-split monolith and verified against the dispatch code by inspection.

let tmp: string;
let staticRoot: string;
let app: App;
let api: ApiServer;
let port: number;

/** Executor test seam (documented in ApiServerOptions): completes the run. */
const executor = (runId: string): Promise<unknown> =>
  new Promise((resolve) => {
    const run = app.store.getRun(runId);
    if (run) {
      const now = new Date().toISOString();
      for (const s of run.stages) {
        s.state = 'done';
        s.endedAt = now;
      }
      run.status = 'completed';
      run.currentStage = 'export';
      delete run.lastError;
      app.store.updateRun(run);
    }
    resolve(run);
  });

let draftRun = '';
let doneRun = '';
let convId = '';

interface ProbeResult {
  status: number;
  code: string | null;
  contentType: string | null;
}

/** Fire one probe with loopback Host and JSON body discipline (F-1 parity). */
const probe = (method: string, pathname: string, body?: unknown, headers?: Record<string, string>): Promise<ProbeResult> =>
  new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method,
        path: pathname,
        headers: {
          host: `127.0.0.1:${port}`,
          ...(payload !== undefined ? { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(payload)) } : {}),
          ...headers,
        },
      },
      (res) => {
        const contentType = res.headers['content-type'] ?? null;
        if ((contentType ?? '').includes('text/event-stream')) {
          // SSE: headers are the dispatch contract; destroy before the body flows.
          res.destroy();
          resolve({ status: res.statusCode ?? 0, code: null, contentType });
          return;
        }
        let raw = '';
        res.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')));
        res.on('end', () => {
          let code: string | null = null;
          try {
            const parsed: unknown = JSON.parse(raw);
            if (parsed !== null && typeof parsed === 'object' && 'error' in parsed) {
              const err = (parsed as { error: { code?: unknown } }).error;
              code = typeof err.code === 'string' ? err.code : null;
            }
          } catch {
            code = null; // non-JSON body (markdown/static) — status is the contract
          }
          resolve({ status: res.statusCode ?? 0, code, contentType });
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(20_000, () => {
      req.destroy(new Error(`probe timeout: ${method} ${pathname}`));
    });
    req.end(payload);
  });

const sha = (n: number): string => `sha256:${'a'.repeat(n)}`;

// The frozen matrix. `S(code)` is shorthand for a status-only expectation.
interface Expect {
  status: number;
  code?: string | null;
}

const matrix: Array<{ label: string; method: string; path: () => string; body?: unknown; expect: Expect }> = [
  // ---- static / hint surface (non-/api) ----
  { label: 'static root index', method: 'GET', path: () => '/', expect: { status: 200 } },
  { label: 'static HEAD', method: 'HEAD', path: () => '/', expect: { status: 200 } },
  { label: 'static asset with etag cache', method: 'GET', path: () => '/assets/app.js', expect: { status: 200 } },
  { label: 'static missing extension-less path 404s (no SPA fallback)', method: 'GET', path: () => '/models/missing', expect: { status: 404, code: 'not_found' } },
  { label: 'static POST refused', method: 'POST', path: () => '/', body: {}, expect: { status: 404, code: 'not_found' } },
  { label: 'static traversal 404s', method: 'GET', path: () => '/%2e%2e/api.ts', expect: { status: 404, code: 'not_found' } },
  // ---- prefix discipline ----
  { label: 'no /v1', method: 'GET', path: () => '/api/health', expect: { status: 404, code: 'not_found' } },
  { label: 'unknown family', method: 'GET', path: () => '/api/v1/unknown', expect: { status: 404, code: 'not_found' } },
  // ---- system ----
  { label: 'health', method: 'GET', path: () => '/api/v1/health', expect: { status: 200 } },
  { label: 'meta', method: 'GET', path: () => '/api/v1/meta', expect: { status: 200 } },
  { label: 'search valid', method: 'GET', path: () => '/api/v1/search?q=off-target', expect: { status: 200 } },
  { label: 'search too short', method: 'GET', path: () => '/api/v1/search?q=o', expect: { status: 400, code: 'validation' } },
  { label: 'verify missing ref is a fail-closed 200 report', method: 'GET', path: () => '/api/v1/verify/bun_missing', expect: { status: 200 } },
  // ---- ingest ----
  { label: 'ingest unknown kind', method: 'POST', path: () => '/api/v1/ingest', body: { kind: 'bogus', fileName: 'a.txt' }, expect: { status: 400, code: 'validation' } },
  { label: 'ingest empty body', method: 'POST', path: () => '/api/v1/ingest', body: {}, expect: { status: 400, code: 'validation' } },
  { label: 'ingest bad ref format', method: 'GET', path: () => '/api/v1/ingest/not-a-ref', expect: { status: 400, code: 'validation' } },
  { label: 'ingest well-formed missing ref', method: 'GET', path: () => `/api/v1/ingest/${sha(64)}`, expect: { status: 404, code: 'not_found' } },
  { label: 'ingest DELETE not routed', method: 'DELETE', path: () => '/api/v1/ingest', body: {}, expect: { status: 404, code: 'not_found' } },
  // ---- library ----
  { label: 'library sources', method: 'GET', path: () => '/api/v1/library/sources', expect: { status: 200 } },
  { label: 'library other leaf', method: 'GET', path: () => '/api/v1/library/other', expect: { status: 404, code: 'not_found' } },
  // ---- science ----
  { label: 'science operations catalog', method: 'GET', path: () => '/api/v1/science/operations', expect: { status: 200 } },
  { label: 'science compute invalid body', method: 'POST', path: () => '/api/v1/science/compute', body: {}, expect: { status: 400, code: 'validation' } },
  { label: 'science compute GET not routed', method: 'GET', path: () => '/api/v1/science/compute', expect: { status: 404, code: 'not_found' } },
  { label: 'science unknown leaf', method: 'GET', path: () => '/api/v1/science/other', expect: { status: 404, code: 'not_found' } },
  // ---- terminal ----
  { label: 'terminal sessions list', method: 'GET', path: () => '/api/v1/terminal/sessions', expect: { status: 200 } },
  { label: 'terminal PUT method not allowed', method: 'PUT', path: () => '/api/v1/terminal/sessions', body: {}, expect: { status: 404, code: 'not_found' } },
  { label: 'terminal missing session get', method: 'GET', path: () => '/api/v1/terminal/sessions/tmissing', expect: { status: 200 } },
  { label: 'terminal delete missing', method: 'DELETE', path: () => '/api/v1/terminal/sessions/tmissing', expect: { status: 200 } },
  { label: 'terminal input empty text', method: 'POST', path: () => '/api/v1/terminal/sessions/tmissing/input', body: { text: '' }, expect: { status: 400, code: 'validation' } },
  // ---- runs: collection ----
  { label: 'runs list', method: 'GET', path: () => '/api/v1/runs', expect: { status: 200 } },
  { label: 'runs method not allowed', method: 'PUT', path: () => '/api/v1/runs', body: {}, expect: { status: 404, code: 'not_found' } },
  { label: 'runs create missing text', method: 'POST', path: () => '/api/v1/runs', body: {}, expect: { status: 400, code: 'validation' } },
  { label: 'runs create bad goalType', method: 'POST', path: () => '/api/v1/runs', body: { text: 'why?', goalType: 'bogus' }, expect: { status: 400, code: 'validation' } },
  { label: 'runs create bad providerConfigId', method: 'POST', path: () => '/api/v1/runs', body: { text: 'why?', providerConfigId: 'mcfg_nope' }, expect: { status: 400, code: 'validation' } },
  // ---- runs: malformed id gate ----
  { label: 'runs malformed id format gate', method: 'GET', path: () => '/api/v1/runs/not-a-run-id', expect: { status: 400, code: 'validation' } },
  { label: 'runs malformed id deep path', method: 'GET', path: () => '/api/v1/runs/not-a-run-id/science', expect: { status: 400, code: 'validation' } },
  { label: 'runs missing run 404', method: 'GET', path: () => `/api/v1/runs/${'run_' + 'x'.repeat(24)}`, expect: { status: 404, code: 'not_found' } },
  // ---- runs: detail & lifecycle ----
  { label: 'run detail', method: 'GET', path: () => `/api/v1/runs/${draftRun}`, expect: { status: 200 } },
  { label: 'run delete settled', method: 'DELETE', path: () => `/api/v1/runs/${draftRun}`, expect: { status: 200 } },
  { label: 'run delete missing', method: 'DELETE', path: () => `/api/v1/runs/${'run_' + 'x'.repeat(24)}`, expect: { status: 404, code: 'not_found' } },
  // ---- runs: events ----
  { label: 'run events list', method: 'GET', path: () => `/api/v1/runs/${doneRun}/events`, expect: { status: 200 } },
  { label: 'run events bad afterSeq', method: 'GET', path: () => `/api/v1/runs/${doneRun}/events?afterSeq=abc`, expect: { status: 400, code: 'validation' } },
  { label: 'run events bad tag', method: 'GET', path: () => `/api/v1/runs/${doneRun}/events?tag=bogus`, expect: { status: 400, code: 'validation' } },
  { label: 'run events bad limit', method: 'GET', path: () => `/api/v1/runs/${doneRun}/events?tag=kind:note&limit=x`, expect: { status: 400, code: 'validation' } },
  { label: 'run events stream SSE', method: 'GET', path: () => `/api/v1/runs/${doneRun}/events/stream`, expect: { status: 200, code: null } },
  { label: 'run events stream POST not allowed', method: 'POST', path: () => `/api/v1/runs/${doneRun}/events/stream`, body: {}, expect: { status: 404, code: 'not_found' } },
  // ---- runs: research-ops plane ----
  { label: 'screening view without corpus', method: 'GET', path: () => `/api/v1/runs/${doneRun}/screening`, expect: { status: 404, code: 'no_corpus' } },
  { label: 'screening decision missing srcId', method: 'POST', path: () => `/api/v1/runs/${doneRun}/screening/decisions`, body: { verdict: 'include' }, expect: { status: 400, code: 'validation' } },
  { label: 'method override bad body escapes zod parse as 500', method: 'POST', path: () => `/api/v1/runs/${doneRun}/method-selections/m-bad/override`, body: {}, expect: { status: 500, code: 'internal' } },
  { label: 'hypothesis op missing hyp', method: 'POST', path: () => `/api/v1/runs/${doneRun}/hypotheses/hyp_missing/promote`, body: {}, expect: { status: 404, code: 'target_not_found' } },
  { label: 'claims op missing claim', method: 'POST', path: () => `/api/v1/runs/${doneRun}/claims/claim_missing/pin`, body: {}, expect: { status: 404, code: 'target_not_found' } },
  { label: 'protocol state without registered protocol', method: 'GET', path: () => `/api/v1/runs/${doneRun}/protocol`, expect: { status: 404, code: 'target_not_found' } },
  { label: 'protocol records bad body', method: 'POST', path: () => `/api/v1/runs/${doneRun}/protocol/records`, body: {}, expect: { status: 400, code: 'validation' } },
  { label: 'counter-search bad body', method: 'POST', path: () => `/api/v1/runs/${doneRun}/counter-search`, body: {}, expect: { status: 400, code: 'invalid_counter_search' } },
  // ---- runs: projections ----
  { label: 'evaluations', method: 'GET', path: () => `/api/v1/runs/${doneRun}/evaluations`, expect: { status: 200 } },
  { label: 'lineage', method: 'GET', path: () => `/api/v1/runs/${doneRun}/lineage`, expect: { status: 200 } },
  { label: 'supervision', method: 'GET', path: () => `/api/v1/runs/${doneRun}/supervision`, expect: { status: 200 } },
  { label: 'truth', method: 'GET', path: () => `/api/v1/runs/${doneRun}/truth`, expect: { status: 200 } },
  { label: 'state-at seq', method: 'GET', path: () => `/api/v1/runs/${doneRun}/state-at/1`, expect: { status: 200 } },
  { label: 'state-at bad seq', method: 'GET', path: () => `/api/v1/runs/${doneRun}/state-at/x`, expect: { status: 400, code: 'validation' } },
  { label: 'datasets sample missing', method: 'GET', path: () => `/api/v1/runs/${doneRun}/datasets/ds_missing/sample`, expect: { status: 404, code: 'not_found' } },
  { label: 'prov', method: 'GET', path: () => `/api/v1/runs/${doneRun}/prov`, expect: { status: 200 } },
  { label: 'question', method: 'GET', path: () => `/api/v1/runs/${doneRun}/question`, expect: { status: 200 } },
  { label: 'report without bundle', method: 'GET', path: () => `/api/v1/runs/${doneRun}/report`, expect: { status: 404, code: 'not_found' } },
  { label: 'paper without bundle', method: 'GET', path: () => `/api/v1/runs/${doneRun}/paper`, expect: { status: 404, code: 'not_found' } },
  { label: 'package without bundle', method: 'GET', path: () => `/api/v1/runs/${doneRun}/package`, expect: { status: 404, code: 'not_found' } },
  { label: 'sources', method: 'GET', path: () => `/api/v1/runs/${doneRun}/sources`, expect: { status: 200 } },
  { label: 'evidence', method: 'GET', path: () => `/api/v1/runs/${doneRun}/evidence`, expect: { status: 200 } },
  { label: 'hypotheses', method: 'GET', path: () => `/api/v1/runs/${doneRun}/hypotheses`, expect: { status: 200 } },
  { label: 'plan', method: 'GET', path: () => `/api/v1/runs/${doneRun}/plan`, expect: { status: 200 } },
  { label: 'revisions', method: 'GET', path: () => `/api/v1/runs/${doneRun}/revisions`, expect: { status: 200 } },
  { label: 'experiments', method: 'GET', path: () => `/api/v1/runs/${doneRun}/experiments`, expect: { status: 200 } },
  { label: 'receipts', method: 'GET', path: () => `/api/v1/runs/${doneRun}/receipts`, expect: { status: 200 } },
  { label: 'calibration', method: 'GET', path: () => `/api/v1/runs/${doneRun}/calibration`, expect: { status: 200 } },
  { label: 'bundles', method: 'GET', path: () => `/api/v1/runs/${doneRun}/bundles`, expect: { status: 200 } },
  { label: 'corpus', method: 'GET', path: () => `/api/v1/runs/${doneRun}/corpus`, expect: { status: 200 } },
  { label: 'science projection', method: 'GET', path: () => `/api/v1/runs/${doneRun}/science`, expect: { status: 200 } },
  { label: 'unknown leaf under run', method: 'GET', path: () => `/api/v1/runs/${doneRun}/nope`, expect: { status: 404, code: 'not_found' } },
  // ---- runs: lifecycle verbs ----
  { label: 'dispatch bad actionType', method: 'POST', path: () => `/api/v1/runs/${doneRun}/dispatch`, body: { actionType: 'NOPE' }, expect: { status: 400, code: 'validation' } },
  { label: 'cancel completed run', method: 'POST', path: () => `/api/v1/runs/${doneRun}/cancel`, body: {}, expect: { status: 202 } },
  { label: 'resume completed run', method: 'POST', path: () => `/api/v1/runs/${doneRun}/resume`, body: {}, expect: { status: 202 } },
  { label: 'feedback valid', method: 'POST', path: () => `/api/v1/runs/${doneRun}/feedback`, body: { source: 'human_expert', content: 'looks wrong' }, expect: { status: 201 } },
  { label: 'feedback bad source', method: 'POST', path: () => `/api/v1/runs/${doneRun}/feedback`, body: { source: 'bogus', content: 'x' }, expect: { status: 400, code: 'validation' } },
  { label: 'reexport without bundle', method: 'POST', path: () => `/api/v1/runs/${doneRun}/reexport`, body: {}, expect: { status: 400, code: 'validation' } },
  { label: 'actions bad body', method: 'POST', path: () => `/api/v1/runs/${doneRun}/actions`, body: {}, expect: { status: 400, code: 'invalid_action_request' } },
  { label: 'scope proposal on completed run', method: 'POST', path: () => `/api/v1/runs/${doneRun}/scope-proposal`, body: {}, expect: { status: 409, code: 'already_launched' } },
  // ---- tools ----
  { label: 'tools list', method: 'GET', path: () => '/api/v1/tools', expect: { status: 200 } },
  { label: 'tools create bad body', method: 'POST', path: () => '/api/v1/tools', body: { kind: 'bogus' }, expect: { status: 400, code: 'validation' } },
  { label: 'tools import-plugin unreviewed', method: 'POST', path: () => '/api/v1/tools/import-plugin', body: { dir: 'x' }, expect: { status: 400, code: 'validation' } },
  { label: 'tools malformed id', method: 'GET', path: () => '/api/v1/tools/t123', expect: { status: 400, code: 'validation' } },
  { label: 'tools test malformed id', method: 'POST', path: () => '/api/v1/tools/t123/test', body: {}, expect: { status: 400, code: 'validation' } },
  { label: 'tools update malformed id', method: 'PUT', path: () => '/api/v1/tools/t123', body: {}, expect: { status: 400, code: 'validation' } },
  { label: 'tools delete malformed id', method: 'DELETE', path: () => '/api/v1/tools/t123', body: {}, expect: { status: 400, code: 'validation' } },
  // ---- model-configs ----
  { label: 'model-configs list', method: 'GET', path: () => '/api/v1/model-configs', expect: { status: 200 } },
  { label: 'model-configs create invalid body', method: 'POST', path: () => '/api/v1/model-configs', body: { label: 'x', wire: 'bogus', baseUrl: 'http://x', modelId: 'm' }, expect: { status: 400, code: 'validation' } },
  { label: 'model-configs malformed id', method: 'GET', path: () => '/api/v1/model-configs/mcfg_bad', expect: { status: 400, code: 'validation' } },
  { label: 'model-configs active clear', method: 'PUT', path: () => '/api/v1/model-configs/active', body: { id: null }, expect: { status: 200 } },
  { label: 'model-configs active missing id field', method: 'PUT', path: () => '/api/v1/model-configs/active', body: {}, expect: { status: 400, code: 'validation' } },
  { label: 'model-configs test bad body', method: 'POST', path: () => '/api/v1/model-configs/test', body: {}, expect: { status: 400, code: 'validation' } },
  { label: 'model-configs usage', method: 'GET', path: () => '/api/v1/model-configs/usage', expect: { status: 200 } },
  { label: 'model-configs templates', method: 'GET', path: () => '/api/v1/model-configs/templates', expect: { status: 200 } },
  { label: 'model-configs spend-limit get', method: 'GET', path: () => '/api/v1/model-configs/spend-limit', expect: { status: 200 } },
  { label: 'model-configs spend-limit clear', method: 'PUT', path: () => '/api/v1/model-configs/spend-limit', body: { limitUsd: null }, expect: { status: 200 } },
  { label: 'model-configs spend-limit bad value', method: 'PUT', path: () => '/api/v1/model-configs/spend-limit', body: { limitUsd: 'x' }, expect: { status: 400, code: 'validation' } },
  { label: 'model-configs discover bad body', method: 'POST', path: () => '/api/v1/model-configs/discover', body: {}, expect: { status: 400, code: 'validation' } },
  { label: 'model-configs builtin-routes list', method: 'GET', path: () => '/api/v1/model-configs/builtin-routes', expect: { status: 200 } },
  { label: 'model-configs builtin-routes default clear', method: 'PUT', path: () => '/api/v1/model-configs/builtin-routes', body: { name: null }, expect: { status: 200 } },
  { label: 'model-configs builtin-routes unknown name', method: 'PUT', path: () => '/api/v1/model-configs/builtin-routes/nope', body: { modelId: 'm' }, expect: { status: 400, code: 'validation' } },
  { label: 'model-configs builtin-routes leaf GET not routed', method: 'GET', path: () => '/api/v1/model-configs/builtin-routes/zai', expect: { status: 404, code: 'not_found' } },
  { label: 'model-configs unknown leaf hits id-format gate', method: 'GET', path: () => '/api/v1/model-configs/nope', expect: { status: 400, code: 'validation' } },
  { label: 'model-configs method not allowed', method: 'POST', path: () => '/api/v1/model-configs', body: {}, expect: { status: 400, code: 'validation' } },
  // ---- zotero ----
  { label: 'zotero library unavailable', method: 'GET', path: () => '/api/v1/zotero/library', expect: { status: 503, code: 'provider_unreachable' } },
  { label: 'zotero other leaf', method: 'GET', path: () => '/api/v1/zotero/other', expect: { status: 404, code: 'not_found' } },
  // ---- conversations ----
  { label: 'conversations list', method: 'GET', path: () => '/api/v1/conversations', expect: { status: 200 } },
  { label: 'conversations create with defaults', method: 'POST', path: () => '/api/v1/conversations', body: {}, expect: { status: 201 } },
  { label: 'conversation missing 404', method: 'GET', path: () => '/api/v1/conversations/conv_missing', expect: { status: 404, code: 'not_found' } },
  { label: 'conversation patch missing', method: 'PATCH', path: () => '/api/v1/conversations/conv_missing', body: { title: 'x' }, expect: { status: 404, code: 'not_found' } },
  { label: 'conversation delete missing', method: 'DELETE', path: () => '/api/v1/conversations/conv_missing', body: {}, expect: { status: 404, code: 'not_found' } },
  { label: 'conversation turn stream none active', method: 'GET', path: () => `/api/v1/conversations/${convId}/turns/active/stream`, expect: { status: 404, code: 'not_found' } },
  { label: 'conversation turn cancel none active', method: 'POST', path: () => `/api/v1/conversations/${convId}/turns/active/cancel`, body: {}, expect: { status: 202 } },
  { label: 'conversation steer no active turn', method: 'POST', path: () => `/api/v1/conversations/${convId}/steer`, body: { text: 'redirect' }, expect: { status: 409, code: 'no_active_turn' } },
  { label: 'conversation steer empty text', method: 'POST', path: () => `/api/v1/conversations/${convId}/steer`, body: { text: '' }, expect: { status: 400, code: 'validation' } },
  { label: 'conversation message stream empty text', method: 'POST', path: () => `/api/v1/conversations/${convId}/messages/stream`, body: { text: '' }, expect: { status: 400, code: 'validation' } },
  { label: 'conversation message non-stream bad body', method: 'POST', path: () => `/api/v1/conversations/${convId}/messages`, body: { text: 42 }, expect: { status: 400, code: 'validation' } },
  { label: 'conversation retry missing message', method: 'POST', path: () => `/api/v1/conversations/${convId}/messages/msg_missing/retry`, body: {}, expect: { status: 409, code: 'validation' } },
  { label: 'conversation retry-stream opens SSE', method: 'POST', path: () => `/api/v1/conversations/${convId}/messages/msg_missing/retry/stream`, body: {}, expect: { status: 200 } },
  { label: 'conversation reasoning-gear put bad', method: 'PUT', path: () => `/api/v1/conversations/${convId}/reasoning-gear`, body: { gear: 'bogus' }, expect: { status: 400, code: 'validation' } },
  { label: 'conversation reasoning-gear get', method: 'GET', path: () => `/api/v1/conversations/${convId}/reasoning-gear`, expect: { status: 200 } },
  { label: 'conversation launch empty text', method: 'POST', path: () => `/api/v1/conversations/${convId}/launch`, body: { text: '' }, expect: { status: 400, code: 'validation' } },
  { label: 'conversation proposals bad id', method: 'POST', path: () => `/api/v1/conversations/${convId}/proposals/bad-id`, body: { approve: true }, expect: { status: 400, code: 'validation' } },
  { label: 'conversation proposals missing', method: 'POST', path: () => `/api/v1/conversations/${convId}/proposals/act_missing`, body: { approve: true }, expect: { status: 404, code: 'not_found' } },
  { label: 'conversation automations list', method: 'GET', path: () => `/api/v1/conversations/${convId}/automations`, expect: { status: 200 } },
  { label: 'conversations method not allowed', method: 'PUT', path: () => '/api/v1/conversations', body: {}, expect: { status: 404, code: 'not_found' } },
  // ---- automations ----
  { label: 'automations list', method: 'GET', path: () => '/api/v1/automations', expect: { status: 200 } },
  { label: 'automations malformed id', method: 'GET', path: () => '/api/v1/automations/auto-bad', expect: { status: 400, code: 'validation' } },
  { label: 'automations well-formed missing', method: 'GET', path: () => '/api/v1/automations/auto_abc123', expect: { status: 404, code: 'not_found' } },
  { label: 'automations patch missing', method: 'PATCH', path: () => '/api/v1/automations/auto_abc123', body: { enabled: true }, expect: { status: 404, code: 'not_found' } },
  { label: 'automations patch missing ignores body order', method: 'PATCH', path: () => '/api/v1/automations/auto_abc123', body: {}, expect: { status: 404, code: 'not_found' } },
  { label: 'automations delete missing', method: 'DELETE', path: () => '/api/v1/automations/auto_abc123', body: {}, expect: { status: 404, code: 'not_found' } },
  // ---- agent-policy ----
  { label: 'agent-policy posture', method: 'GET', path: () => '/api/v1/agent-policy', expect: { status: 200 } },
  { label: 'agent-policy remember unknown conv', method: 'DELETE', path: () => '/api/v1/agent-policy/remember/conv_missing', body: {}, expect: { status: 404, code: 'not_found' } },
  { label: 'agent-policy other leaf', method: 'GET', path: () => '/api/v1/agent-policy/other', expect: { status: 404, code: 'not_found' } },
  // ---- competition-route ----
  { label: 'competition-route get', method: 'GET', path: () => '/api/v1/competition-route', expect: { status: 200 } },
  { label: 'competition-route put on', method: 'PUT', path: () => '/api/v1/competition-route', body: { on: true }, expect: { status: 200 } },
  { label: 'competition-route put bad', method: 'PUT', path: () => '/api/v1/competition-route', body: { on: 'x' }, expect: { status: 400, code: 'validation' } },
  { label: 'competition-route method not allowed', method: 'POST', path: () => '/api/v1/competition-route', body: {}, expect: { status: 404, code: 'not_found' } },
  // ---- memory ----
  { label: 'memory list', method: 'GET', path: () => '/api/v1/memory', expect: { status: 200 } },
  { label: 'memory bad kind', method: 'GET', path: () => '/api/v1/memory?kind=bogus', expect: { status: 400, code: 'validation' } },
  { label: 'memory export', method: 'GET', path: () => '/api/v1/memory/export', expect: { status: 200 } },
  { label: 'memory malformed id', method: 'GET', path: () => '/api/v1/memory/mem-BAD', expect: { status: 400, code: 'validation' } },
  { label: 'memory well-formed missing', method: 'GET', path: () => '/api/v1/memory/mem_abc', expect: { status: 404, code: 'not_found' } },
  { label: 'memory edit missing validates body first', method: 'POST', path: () => '/api/v1/memory/mem_abc/edit', body: {}, expect: { status: 400, code: 'validation' } },
  { label: 'memory archive missing validates body first', method: 'POST', path: () => '/api/v1/memory/mem_abc/archive', body: {}, expect: { status: 400, code: 'validation' } },
  // ---- cross-cutting request discipline ----
  { label: 'bodied verb with non-JSON content-type', method: 'POST', path: () => '/api/v1/runs', body: undefined, expect: { status: 400, code: 'validation' } },
];

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-routetable-'));
  staticRoot = path.join(tmp, 'web-dist');
  fs.mkdirSync(path.join(staticRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(staticRoot, 'index.html'), '<!doctype html><title>far</title>');
  fs.writeFileSync(path.join(staticRoot, 'assets', 'app.js'), 'console.log("far")');
  app = await createApp({
    dataDir: tmp,
    providerOverride: createTestStubProvider([]), // empty script fails loudly if called
  });
  api = createApiServer(app, { port: 0, staticRoot, executor });
  port = await api.start();

  // Fixtures: one created-status draft run, one completed run, one conversation.
  const mkQuestion = (text: string) => ResearchQuestion.parse({
    id: newId('q'),
    text,
    background: '',
    goalType: 'explanatory',
    scope: { domain: 'd', phenomena: [text] },
    constraints: {},
    createdAt: new Date().toISOString(),
  });
  draftRun = app.store.createRun(mkQuestion('Draft question for dispatch matrix')).id;
  const done = app.store.createRun(mkQuestion('Settled question for dispatch matrix'));
  for (const s of done.stages) {
    s.state = 'done';
    s.endedAt = new Date().toISOString();
  }
  done.status = 'completed';
  done.currentStage = 'export';
  app.store.updateRun(done);
  app.store.appendEvent(done.id, { type: 'note', detail: { text: 'seeded' } });
  doneRun = done.id;

  const conv = createConversation(app, { title: 'dispatch matrix fixture' });
  convId = conv.id;
});

afterAll(async () => {
  await api.stop();
  app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('route dispatch matrix (BC-002/BC-011 characterization)', () => {
  it('every probe hits the frozen handler (status + error code)', async () => {
    const failures: string[] = [];
    for (const row of matrix) {
      const extraHeaders: Record<string, string> = {};
      let body: unknown = row.body;
      if (row.label === 'bodied verb with non-JSON content-type') {
        extraHeaders['content-type'] = 'text/plain';
        extraHeaders['content-length'] = '3';
        body = 'abc';
      }
      const result = await probe(row.method, row.path(), body, extraHeaders);
      const problems: string[] = [];
      if (result.status !== row.expect.status) problems.push(`status ${result.status} != ${row.expect.status}`);
      const wantCode = row.expect.code === undefined ? null : row.expect.code;
      if (wantCode !== null && result.code !== wantCode) problems.push(`code ${result.code} != ${wantCode}`);
      if (problems.length > 0) failures.push(`${row.label} [${row.method} ${row.path()}]: ${problems.join('; ')}`);
    }
    expect(failures).toEqual([]);
  });

  it('SSE endpoints answer with the event-stream content type', async () => {
    const res = await probe('GET', `/api/v1/runs/${doneRun}/events/stream`);
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('text/event-stream');
  });
});
