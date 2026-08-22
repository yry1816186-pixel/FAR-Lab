/**
 * Local route-credential loader (Wave-9 unlock path).
 *
 * Reads `.far-run/secrets.env` (gitignored; secret-scan excludes the dir) and injects
 * KEY=VALUE lines into process.env WITHOUT overriding values already present in the
 * environment. The user's only action is pasting a key into that file; every key-using
 * eval script imports this loader first. Values are never printed — only key NAMES
 * that were loaded (so command output stays secret-free).
 *
 * Format: `KEY=value` per line; `#` comments and blank lines ignored; whitespace
 * trimmed; empty values skipped (an unfilled template slot loads nothing).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const loadLocalSecrets = (file = resolve(process.cwd(), '.far-run/secrets.env')) => {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return { loaded: [], note: 'no local secrets file (env-only mode)' };
  }
  const loaded = [];
  for (const line of text.split('\n')) {
    const raw = line.trim();
    if (raw === '' || raw.startsWith('#')) continue;
    const eq = raw.indexOf('=');
    if (eq <= 0) continue;
    const key = raw.slice(0, eq).trim();
    const value = raw.slice(eq + 1).trim();
    if (value === '') continue; // unfilled template slot
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
      loaded.push(key); // NAME only — never the value
    }
  }
  return { loaded, note: loaded.length === 0 ? 'no filled keys in local file' : `loaded ${loaded.length} key(s) from local file` };
};
