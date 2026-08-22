/**
 * Safe secrets loader (user-provided .far-run/secrets.env): parses KEY=VALUE lines in
 * node (no shell interpretation, no echo of malformed lines), sets process.env, and
 * exports nothing. Malformed lines are counted, never printed.
 * Usage: import './load-secrets-env.mjs' (side-effect) — or node -e "import(...)"
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ENV_FILE = resolve(process.cwd(), '.far-run', 'secrets.env');
let loaded = 0;
let skipped = 0;
for (const line of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
  const trimmed = line.trim();
  if (trimmed === '' || trimmed.startsWith('#')) continue;
  const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
  if (!m || m[1] === undefined || m[2] === undefined) { skipped++; continue; }
  let value = m[2];
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  process.env[m[1]] = value;
  loaded++;
}
if (skipped > 0) console.error(`[secrets] loaded ${loaded} key(s); skipped ${skipped} malformed line(s) (content not shown)`);
