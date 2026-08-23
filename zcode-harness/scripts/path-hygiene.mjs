// Deterministic workspace-path hygiene checks for the FAR-Lab workspace.
// Verifies: required state files valid; ACCEPTANCE_STATUS vocabulary; no .env;
// no test fixtures or demo/mock markers inside production roots; generated-artifact
// and oversized-file warnings; .gitignore coverage.
// Errors => exit 1. Warnings/info reported but do not fail.
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const errors = [];
const warnings = [];
const info = [];
const EXCLUDE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.cache', 'tmp', '.tmp', '.playwright-mcp', 'clones', 'staging', '.far-run']);
const STATUS_VOCAB = new Set(['not_started', 'implemented', 'integrated', 'tested', 'live_verified', 'blocked', 'failed']);
const PRODUCTION_ROOTS = ['src','lib','core','app','apps','packages','web','frontend','backend','server','services','runtime','gateway','domain','cli'];
const CODE_EXT = new Set(['.ts', '.js', '.mjs', '.cjs', '.json', '.yaml', '.yml', '.py', '.go', '.toml']);
const FIXTURE_DIR_NAMES = new Set(['__fixtures__', 'fixtures', 'testdata', 'test-data', 'mockdata']);
const TEST_DIR_NAMES = new Set(['test','tests','__tests__','spec','specs']);
// Vendored binary artifacts (local ASR model weights/vocab, placed by
// fetch:asr-model): scanning a Hugging Face tokenizer vocabulary with
// text-pattern rules is meaningless — the demo-marker regex once matched the
// legitimate BPE token "Ġdemo": 10723. Scope fix, not gate weakening.
const VENDORED_ARTIFACT_DIRS = ['web/public/models'];
const isVendored = full => {
  const rel = path.relative(root, full).split(path.sep).join('/');
  return VENDORED_ARTIFACT_DIRS.some(p => rel === p || rel.startsWith(`${p}/`));
};
const isTestPath = full => path.relative(root, full).split(path.sep).some(part => TEST_DIR_NAMES.has(part));
const isTestFile = name => /(?:\.|_)(?:test|spec)\.[^.]+$/i.test(name);

const exists = rel => fs.existsSync(path.join(root, rel));

// 1. Required files
const REQUIRED = [
  'AGENTS.md',
  'START_HERE.md',
  'FINAL_BUILD_PROMPT.md',
  '.control/EXECUTION_STATE.json',
  '.control/ACCEPTANCE_STATUS.json',
  '.control/BLOCKERS.json',
  '.control/DECISIONS.jsonl',
  'research/EVIDENCE_INDEX.md',
  'project-spec/policies/README.md',
  'project-spec/policies/ENGINEERING_CONDUCT.md',
  'project-spec/policies/PRODUCT_HCI.md',
  'project-spec/policies/TESTING_EVALUATION.md',
  'project-spec/policies/SCIENTIFIC_TRUTH.md',
  'project-spec/policies/RELIABILITY_SECURITY.md',
  'project-spec/policies/RELEASE_OPERATIONS.md',
];
for (const rel of REQUIRED) {
  if (!exists(rel)) {
    // CI checkouts have no .control/ or other gitignored workspace state by
    // design — missing-required is a workspace invariant, not a repo one.
    if (process.env.CI !== undefined && rel.startsWith('.control/')) {
      warnings.push(`ci-skipped-missing-required:${rel}`);
    } else {
      errors.push(`missing-required:${rel}`);
    }
  }
}

// 2. JSON validity + ACCEPTANCE_STATUS contract
const parseJson = rel => {
  try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }
  catch (e) {
    // Absence is section 1's concern (missing-required / CI degradation); the
    // invalid-json class is strictly for files that EXIST but fail to parse.
    if (e.code === 'ENOENT') return null;
    errors.push(`invalid-json:${rel}:${e.message}`); return null;
  }
};
for (const rel of ['.control/EXECUTION_STATE.json', '.control/ACCEPTANCE_STATUS.json', '.control/BLOCKERS.json']) parseJson(rel);
if (exists('.control/DECISIONS.jsonl')) {
  const lines = fs.readFileSync(path.join(root, '.control/DECISIONS.jsonl'), 'utf8').split('\n').filter(l => l.trim());
  for (const [i, l] of lines.entries()) {
    try { JSON.parse(l); } catch { errors.push(`invalid-jsonl:.control/DECISIONS.jsonl:line-${i + 1}`); }
  }
}
const gate = parseJson('.control/ACCEPTANCE_STATUS.json');
if (gate) {
  if (!Array.isArray(gate.items)) errors.push('acceptance-status-items-not-array');
  else for (const it of gate.items) {
    if (!STATUS_VOCAB.has(it.status)) errors.push(`acceptance-status-invalid-status:${it.id}:${it.status}`);
    if (!Array.isArray(it.evidence)) errors.push(`acceptance-status-evidence-not-array:${it.id}`);
    if (['integrated', 'tested', 'live_verified'].includes(it.status) && (!it.evidence || it.evidence.length === 0)) {
      errors.push(`acceptance-status-evidence-empty:${it.id}`);
    }
  }
  if (!Array.isArray(gate.gates)) errors.push('acceptance-status-gates-not-array');
  else for (const g of gate.gates) {
    if (typeof g.satisfied !== 'boolean') errors.push(`acceptance-gate-satisfied-not-boolean:${g.id}`);
  }
}

// 3. .env presence (non-example)
const envFiles = [];
(function walkEnv(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (EXCLUDE_DIRS.has(e.name) || e.name === 'clones' || e.name === 'staging') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walkEnv(full); continue; }
    if (/^\.env(\..+)?$/.test(e.name) && e.name !== '.env.example') envFiles.push(path.relative(root, full).split(path.sep).join('/'));
  }
})(root);
if (envFiles.length) errors.push(`env-file-present:${envFiles.join(',')}`);

// 4. Fixtures inside production roots
for (const prod of PRODUCTION_ROOTS) {
  const prodPath = path.join(root, prod);
  if (!fs.existsSync(prodPath)) continue;
  const walkProd = dir => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (isVendored(full)) continue;
      if (e.isDirectory()) {
        if (FIXTURE_DIR_NAMES.has(e.name) && !isTestPath(dir)) {
          errors.push(`test-fixture-in-production-root:${path.relative(root, full).split(path.sep).join('/')}`);
        } else walkProd(full);
      }
    }
  };
  walkProd(prodPath);
}

// 5. Demo/mock markers inside production roots (code/config only)
// Value alternatives are word-bounded: `1` alone must not match the first
// digit of a numeric literal like 10723 (tokenizer-vocab false positive class).
const DEMO_RE = /(?:[\"']?demo(?:Mode|_mode)?[\"']?\s*[:=]\s*(?:true|1)(?=\s*(?:[,;}\]]|$))|[\"']?mode[\"']?\s*[:=]\s*[\"']demo[\"'])/i;
const MOCK_RE = /[\"']?mock[\"']?\s*[:=]\s*(?:true|1)(?=\s*(?:[,;}\]]|$))/i;
for (const prod of PRODUCTION_ROOTS) {
  const prodPath = path.join(root, prod);
  if (!fs.existsSync(prodPath)) continue;
  const walkProd = dir => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (EXCLUDE_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (isVendored(full)) continue;
      if (e.isDirectory()) { walkProd(full); continue; }
      if (!CODE_EXT.has(path.extname(e.name).toLowerCase()) || isTestPath(full) || isTestFile(e.name)) continue;
      const text = fs.readFileSync(full, 'utf8');
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (DEMO_RE.test(lines[i])) errors.push(`demo-marker-in-production:${path.relative(root, full).split(path.sep).join('/')}:${i + 1}`);
        if (MOCK_RE.test(lines[i])) errors.push(`mock-marker-in-production:${path.relative(root, full).split(path.sep).join('/')}:${i + 1}`);
      }
    }
  };
  walkProd(prodPath);
}

// 6. Generated artifacts at root
for (const d of ['dist', 'build', 'coverage', 'node_modules']) {
  if (exists(d)) warnings.push(`generated-artifact-present:${d} (ignored by .gitignore; not a repo file)`);
}

// 7. Oversized files (>5MB)
const BIG_BYTES = 5 * 1024 * 1024;
const big = [];
(function walkBig(dir) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (EXCLUDE_DIRS.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walkBig(full); continue; }
    try { if (fs.statSync(full).size > BIG_BYTES) big.push(path.relative(root, full).split(path.sep).join('/')); } catch {}
  }
})(root);
for (const rel of big) warnings.push(`oversized-file:${rel}`);

// 8. .gitignore coverage
const gi = exists('.gitignore') ? fs.readFileSync(path.join(root, '.gitignore'), 'utf8') : '';
if (!gi.includes('.env')) warnings.push('gitignore-missing-env-rule');

// 9. Git repo status
const git = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
if (git.status !== 0 || git.stdout.trim() !== 'true') {
  info.push('no-git-repo: pre-commit/CI wiring deferred; run secret-scan + path-hygiene manually before release actions (RELEASE_OPERATIONS.md)');
}

console.log(JSON.stringify({
  status: errors.length ? 'FAILED' : (warnings.length ? 'WARN' : 'PASS'),
  root, errors, warnings, info,
}, null, 2));
process.exit(errors.length ? 1 : 0);
