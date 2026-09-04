/**
 * FA-EVAL-03 failure-taxonomy regression: replay canonical failure SHAPES
 * through the real classifyError boundary and pin the verdict matrix. The
 * taxonomy is an operator-facing contract (obs console routing, retry vs
 * needs-human) — a mapping drift is a regression even when all code paths
 * stay green. Offline/deterministic; no model calls.
 *
 * Usage: node eval/taxonomy-regression.mjs   (writes eval/results/taxonomy-regression.json)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(process.cwd());
const { classifyError } = await import(pathToFileURL(join(ROOT, 'dist/app/observability.js')).href);

/** Canonical shapes: each is a REAL error construction observed in the system. */
const SHAPES = [
  // provider-plane result errors (ports.ts kind carriers)
  { name: 'provider rate_limited', make: () => Object.assign(new Error('dashscope: rate limited'), { kind: 'rate_limited', retryable: true }), want: { category: 'rate_limited', retryable: true, needsHuman: false } },
  { name: 'provider auth_error', make: () => Object.assign(new Error('dashscope: 401 invalid api key'), { kind: 'auth_error', retryable: false }), want: { category: 'auth_error', retryable: false, needsHuman: true } },
  { name: 'provider quota_exceeded', make: () => Object.assign(new Error('dashscope: quota'), { kind: 'quota_exceeded', retryable: false }), want: { category: 'quota_exceeded', retryable: false, needsHuman: true } },
  { name: 'provider timeout', make: () => Object.assign(new Error('dashscope: deadline'), { kind: 'timeout', retryable: true }), want: { category: 'timeout', retryable: true, needsHuman: false } },
  { name: 'provider invalid_output', make: () => Object.assign(new Error('dashscope: schema reject'), { kind: 'invalid_output', retryable: true }), want: { category: 'invalid_output', retryable: true, needsHuman: false } },
  // execution ownership (thrown as Error subclasses by name)
  { name: 'RunLeaseLostError', make: () => { const e = new Error('lease lost'); e.name = 'RunLeaseLostError'; return e; }, want: { category: 'lease_lost', retryable: false, needsHuman: false } },
  { name: 'RunLeaseHeldError', make: () => { const e = new Error('lease held'); e.name = 'RunLeaseHeldError'; return e; }, want: { category: 'lease_held', retryable: false, needsHuman: false } },
  { name: 'RunBudgetExhaustedError', make: () => { const e = new Error('run token budget exhausted'); e.name = 'RunBudgetExhaustedError'; return e; }, want: { category: 'budget_exhausted', retryable: false, needsHuman: true } },
  { name: 'budget message shape', make: () => new Error('run token budget exhausted after 3 stages'), want: { category: 'budget_exhausted', retryable: false, needsHuman: true } },
  { name: 'spend limit message', make: () => new Error('workspace spend limit reached (10.00 USD)'), want: { category: 'spend_limit', retryable: false, needsHuman: true } },
  { name: 'cancelled message', make: () => new Error('cancelled by researcher'), want: { category: 'cancelled', retryable: false, needsHuman: false } },
  // source adapters (errno already lost; normalized kind)
  { name: 'SourceAdapterError network', make: () => { const e = new Error('[arxiv] network httpStatus=0 query="q": down'); e.name = 'SourceAdapterError'; e.kind = 'network'; return e; }, want: { category: 'network_error', retryable: true, needsHuman: false } },
  // errno system plane (direct + undici cause-carried)
  ...[
    ['SQLITE_BUSY direct', 'SQLITE_BUSY', false, { category: 'db_busy', retryable: true, needsHuman: false }],
    ['database locked message', null, false, { category: 'db_busy', retryable: true, needsHuman: false }],
    ['SQLITE_CORRUPT direct', 'SQLITE_CORRUPT', false, { category: 'db_corrupt', retryable: false, needsHuman: true }],
    ['ENOSPC direct', 'ENOSPC', false, { category: 'disk_full', retryable: false, needsHuman: true }],
    ['EACCES direct', 'EACCES', false, { category: 'permission_denied', retryable: false, needsHuman: true }],
    ['ENOENT direct', 'ENOENT', false, { category: 'io_error', retryable: false, needsHuman: false }],
    ['ECONNRESET direct', 'ECONNRESET', false, { category: 'network_error', retryable: true, needsHuman: false }],
    ['EAI_AGAIN cause-carried', 'EAI_AGAIN', true, { category: 'network_error', retryable: true, needsHuman: false }],
    ['ENOTFOUND cause-carried', 'ENOTFOUND', true, { category: 'network_error', retryable: true, needsHuman: false }],
    // TLS family (added FA-PRF-03 2026-09-04) — cause-carried undici shape
    ['CERT_HAS_EXPIRED cause', 'CERT_HAS_EXPIRED', true, { category: 'network_error', retryable: true, needsHuman: false }],
    ['UNABLE_TO_VERIFY_LEAF cause', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', true, { category: 'network_error', retryable: true, needsHuman: false }],
    ['ERR_TLS_CERT_ALTNAME_INVALID cause', 'ERR_TLS_CERT_ALTNAME_INVALID', true, { category: 'network_error', retryable: true, needsHuman: false }],
  ].map(([name, errno, wrapped, want]) => ({
    name: String(name),
    make: () => {
      if (String(name).includes('message')) return new Error('database is locked');
      const base = new Error('system fault ' + String(errno));
      if (errno !== null) base.code = String(errno);
      if (!wrapped) return base;
      const t = new TypeError('fetch failed');
      t.cause = base;
      return t;
    },
    want,
  })),
  // stringified provider failures recovered from text (llm.ts throw shape)
  { name: 'inline kind text', make: () => new Error('model call failed (auth_error) in scope/plan'), want: { category: 'auth_error', retryable: false, needsHuman: true } },
  { name: 'unknown fallback', make: () => new Error('something novel broke'), want: { category: 'provider_error', retryable: true, needsHuman: false } },
];

const results = [];
let failures = 0;
for (const shape of SHAPES) {
  const got = classifyError(shape.make());
  const pass = got.category === shape.want.category && got.retryable === shape.want.retryable && got.needsHuman === shape.want.needsHuman;
  if (!pass) failures++;
  results.push({ name: shape.name, pass, got, want: shape.want });
  if (!pass) console.error(`FAIL ${shape.name}: got ${got.category}/${got.retryable}/${got.needsHuman} want ${shape.want.category}/${shape.want.retryable}/${shape.want.needsHuman}`);
}
const out = { measuredAt: new Date().toISOString(), shapes: SHAPES.length, failures, results };
mkdirSync(join(ROOT, 'eval/results'), { recursive: true });
writeFileSync(join(ROOT, 'eval/results/taxonomy-regression.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`taxonomy-regression: ${SHAPES.length - failures}/${SHAPES.length} shapes pinned`);
process.exit(failures > 0 ? 1 : 0);
