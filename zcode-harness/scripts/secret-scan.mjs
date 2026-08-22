// Deterministic secret-leak scan for the FAR-Lab workspace.
// HIGH findings (real credential material or .env present) => exit 1.
// MEDIUM findings (assignment-like patterns, may be docs/tests) => reported, exit 0.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.cache', 'tmp', '.tmp', '.playwright-mcp', 'clones', 'staging', '.far-run']);
const EXCLUDE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.woff', '.woff2', '.ttf', '.mp4', '.mov', '.db', '.sqlite', '.pyc', '.exe', '.dll']);
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const HIGH_PATTERNS = [
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/, 'private-key-block'],
  [/\bsk-(?:proj-|ant-api03-)?[A-Za-z0-9-]{20,}\b/, 'openai-style-key'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'aws-access-key'],
  [/\bghp_[A-Za-z0-9]{30,}\b/, 'github-pat'],
  [/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, 'slack-token'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/, 'google-api-key'],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/, 'jwt-like-token'],
];
// Documented synthetic vectors (exact-substring allowlist). These strings are
// deliberately shaped like credentials because they are the TEST CORPUS of the
// credential-redaction feature, quoted verbatim in evidence/research records:
// - evidence/W-H4/fusion-f1-f3-f4.md redaction before/after table
// - research/wave4-reports/deep-secret-redaction.md planted-fakes matrix description
// AKIAIOSFODNN7EXAMPLE is AWS's canonical documentation example key (public by design).
// Exact matching only: a real key never equals any of these byte-for-byte, and the
// private-key entry is the full literal one-line markdown snippet (real PEM files have
// real newlines and base64 bodies, which never match this substring).
const ALLOWED_SYNTHETIC_SUBSTRINGS = [
  'AKIAIOSFODNN7EXAMPLE',
  'sk-abc123def456ghi789jklmn',
  'sk-proj-AbCdEf1234567890GhIjKl',
  'xoxb-123456789-abcdef',
  'AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q',
  // Built by concatenation so this source file never contains a contiguous
  // PEM header (which would self-flag the scanner's own allowlist line).
  ['-----BEGIN RSA PRIVATE ', 'KEY-----\\nMIIE...\\n-----END RSA PRIVATE ', 'KEY-----'].join(''),
];
const stripAllowed = (line) => {
  let out = line;
  for (const s of ALLOWED_SYNTHETIC_SUBSTRINGS) out = out.split(s).join('____SYNTHETIC____');
  return out;
};
const MEDIUM_PATTERN = /\b(api[_-]?key|secret|password|passwd|client[_-]?secret|access[_-]?token|auth[_-]?token|token)\b\s*[:=]\s*["']?([A-Za-z0-9_\-./+]{16,})["']?/gi;
const IGNORED_LINE_HINTS = ['example', 'sample', 'placeholder', 'your-', 'xxx', 'dummy', 'changeme', 'redact'];

function walk(dir, findings, scanned) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (EXCLUDE_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    const rel = path.relative(root, full).split(path.sep).join('/');
    if (e.isDirectory()) { walk(full, findings, scanned); continue; }
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (EXCLUDE_EXT.has(ext)) continue;
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    if (st.size > MAX_FILE_BYTES) { scanned.push(rel + ' (skipped:>2MB)'); continue; }
    scanned.push(rel);
    const isEnvFile = /^\.env(\..+)?$/.test(e.name) && e.name !== '.env.example';
    if (isEnvFile) {
      const content = fs.readFileSync(full, 'utf8');
      if (content.trim()) findings.push({ file: rel, line: 1, severity: 'HIGH', class: 'env-file-present' });
      continue;
    }
    let text;
    try {
      const buf = fs.readFileSync(full);
      if (buf.includes(0)) continue; // binary
      text = buf.toString('utf8');
    } catch { continue; }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const [re, cls] of HIGH_PATTERNS) {
        if (re.test(stripAllowed(line))) findings.push({ file: rel, line: i + 1, severity: 'HIGH', class: cls });
      }
      MEDIUM_PATTERN.lastIndex = 0;
      const m = MEDIUM_PATTERN.exec(line);
      if (m && !IGNORED_LINE_HINTS.some(h => line.toLowerCase().includes(h))) {
        findings.push({ file: rel, line: i + 1, severity: 'MEDIUM', class: 'credential-assignment', valueLen: m[2].length });
      }
    }
  }
}

const findings = [];
const scanned = [];
walk(root, findings, scanned);
const high = findings.filter(f => f.severity === 'HIGH');
console.log(JSON.stringify({
  status: high.length ? 'FAILED' : 'PASS',
  root, scannedFiles: scanned.length, findings,
}, null, 2));
process.exit(high.length ? 1 : 0);
