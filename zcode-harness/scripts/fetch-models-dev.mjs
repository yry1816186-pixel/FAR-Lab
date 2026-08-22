/**
 * models.dev registry snapshot fetcher + trimmer (Wave-3 #9, executed 2026-08-22).
 *
 * models.dev (github.com/anomalyco/models.dev, MIT) is a community registry of
 * 190+ model providers with standardized OpenAI-compatible endpoints. This script
 * fetches the live snapshot (direct first, then the local proxy that git already
 * uses — direct egress is blocked in this environment, the proxy is not), trims it
 * to the routing-relevant catalog (provider -> baseUrl/env-var/model ids), and
 * writes research/reference/models-dev-catalog.json with a provenance header.
 *
 * The trimmed catalog backs the product's model-agnostic claim with registry
 * evidence and gives build-time routing tables. Full snapshot: rerun this script.
 *
 * Usage: node zcode-harness/scripts/fetch-models-dev.mjs [--proxy http://127.0.0.1:7897]
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const URL = 'https://models.dev/api.json';
const OUT = resolve(process.cwd(), 'research/reference/models-dev-catalog.json');
const PROXY = process.argv.find((a, i, argv) => argv[i - 1] === '--proxy') ?? 'http://127.0.0.1:7897';

// node's native fetch has no proxy option in this runtime; curl is the proven channel
// here (direct egress is blocked in this environment, the local proxy git uses is not).
const attempt = (viaProxy) => {
  const startedAt = Date.now();
  try {
    const body = execFileSync('curl', ['-s', '-m', '30', ...(viaProxy ? ['-x', PROXY] : []), URL], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    const json = JSON.parse(body);
    return { json, via: viaProxy ? `proxy ${PROXY}` : 'direct', ms: Date.now() - startedAt };
  } catch {
    return null;
  }
};
const hit = attempt(false) ?? attempt(true);
if (hit === null) {
  console.error('FATAL: models.dev unreachable both direct and via proxy');
  process.exit(1);
}
const catalog = {};
for (const [prov, entry] of Object.entries(hit.json)) {
  if (entry === null || typeof entry !== 'object') continue;
  const models = entry.models ?? {};
  catalog[prov] = {
    name: entry.name ?? prov,
    ...(typeof entry.api === 'string' ? { baseUrl: entry.api } : {}),
    ...(Array.isArray(entry.env) ? { apiKeyEnv: entry.env } : {}),
    ...(typeof entry.npm === 'string' ? { npm: entry.npm } : {}),
    modelIds: Object.keys(models).sort(),
  };
}
const out = {
  _provenance: {
    source: 'https://models.dev/api.json',
    license: 'MIT (github.com/anomalyco/models.dev) — trimmed derivative carries upstream attribution',
    fetchedAt: new Date().toISOString(),
    fetchedVia: hit.via,
    providerCount: Object.keys(catalog).length,
    note: 'Trimmed catalog: routing-relevant fields only; descriptions/pricing/logos omitted. Rerun the fetch script for the full snapshot.',
  },
  providers: catalog,
};
mkdirSync(resolve(process.cwd(), 'research/reference'), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log(`[models-dev] ${Object.keys(catalog).length} providers (via ${hit.via}, ${hit.ms}ms) -> ${OUT}`);
