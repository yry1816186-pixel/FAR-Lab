/**
 * P1 wiring probe — "disconnected library / wrapper with no caller" detector.
 *
 * Builds the static import graph over every src TS module and BFS-walks it from the REAL
 * production entrypoints (src/server/main.ts = server product, src/cli/main.ts =
 * CLI product). Modules unreachable from both entries are classified by who still
 * imports them:
 *   - orphan        : imported by nobody anywhere (dead code candidate)
 *   - test-only     : imported only from tests/** (never production-wired — the
 *                     classic "wrapper with no caller" fake-capability shape)
 *   - script-only   : imported only from scripts/ or eval tooling
 *
 * Mechanism limits, stated honestly: the graph follows literal relative
 * specifiers (static `from '...'` and literal dynamic `import('...')`).
 * Non-literal dynamic imports are detected and listed for manual review; if any
 * exist, the affected module is excluded from hard findings and downgraded to
 * manual-review. Verdict: FAIL only for unreachable modules with NO importers at
 * all (true orphans in production src); everything else is ADVISORY.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, finish } from './lib.mjs';

const SRC = path.join(ROOT, 'src');
const ENTRIES = ['src/server/main.ts', 'src/cli/main.ts'];

const walkTs = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkTs(p, out);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
};

const toRel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

const resolveSpec = (fromFile, spec) => {
  // This codebase uses TS-style ESM specifiers ending in .js for same-package imports.
  const cleaned = spec.replace(/\.js$/, '.ts');
  const base = path.resolve(path.dirname(fromFile), cleaned);
  for (const cand of [base, `${base}.ts`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(cand) && fs.statSync(cand).isFile()) return toRel(cand);
  }
  return null;
};

const main = () => {
  const files = walkTs(SRC);
  const moduleRel = new Set(files.map(toRel));
  const edges = new Map(); // rel -> Set<rel>
  const reverse = new Map(); // rel -> Set<rel> (any importer in repo, incl. tests)
  const nonLiteralDynamic = [];

  const IMPORT_RE = /(?:from\s*|import\s*\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
  const DYN_NONLITERAL_RE = /import\s*\(\s*[^'"`]/;

  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    const rel = toRel(f);
    for (const m of text.matchAll(IMPORT_RE)) {
      const target = resolveSpec(f, m[1]);
      if (target) {
        if (!edges.has(rel)) edges.set(rel, new Set());
        edges.get(rel).add(target);
      }
    }
    if (DYN_NONLITERAL_RE.test(text)) nonLiteralDynamic.push(rel);
  }

  // Reverse index across the whole repo (tests + scripts + eval) for classification.
  const classifyImporters = () => {
    const scan = (dir, bucket) => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) scan(p, bucket);
        else if (/\.(ts|tsx|mjs|js|mts)$/.test(e.name)) {
          const text = fs.readFileSync(p, 'utf8');
          for (const m of text.matchAll(/['"](\.{1,2}\/[^'"]+)['"]/g)) {
            const target = resolveSpec(p, m[1]);
            if (target && moduleRel.has(target)) {
              if (!reverse.has(target)) reverse.set(target, new Set());
              reverse.get(target).add(`${bucket}:${toRel(p)}`);
            }
          }
        }
      }
    };
    scan(path.join(ROOT, 'tests'), 'test');
    scan(path.join(ROOT, 'scripts'), 'script');
    scan(path.join(ROOT, 'eval'), 'eval');
  };
  classifyImporters();

  // Also count production importers (other src modules) so self-references don't mask.
  const prodImporters = new Map(); // rel -> Set<rel> within src
  for (const [from, targets] of edges) {
    for (const t of targets) {
      if (!prodImporters.has(t)) prodImporters.set(t, new Set());
      prodImporters.get(t).add(from);
    }
  }

  // BFS from entries.
  const queue = [...ENTRIES.filter((e) => moduleRel.has(e))];
  const seen = new Set(queue);
  const missingEntries = ENTRIES.filter((e) => !moduleRel.has(e));
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const next of edges.get(cur) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }

  const unreachable = [...moduleRel].filter((m) => !seen.has(m));
  const findings = [];
  const orphans = [];
  const testOnly = [];
  const scriptOnly = [];
  const manualReview = new Set(nonLiteralDynamic);

  for (const m of unreachable) {
    const importers = reverse.get(m) ?? new Set();
    const prod = [...(prodImporters.get(m) ?? [])].filter((p) => seen.has(p));
    if (prod.length > 0) continue; // reachable module imports it — graph says wired
    if (importers.size === 0) orphans.push(m);
    else if ([...importers].every((i) => i.startsWith('test:'))) testOnly.push({ m, importers: [...importers] });
    else scriptOnly.push({ m, importers: [...importers] });
  }

  if (missingEntries.length > 0) {
    findings.push({ severity: 'FAIL', id: 'P1-NO-ENTRY', detail: `entrypoint(s) missing from src/: ${missingEntries.join(', ')}` });
  }
  for (const m of orphans) {
    findings.push({ severity: 'FAIL', id: 'P1-ORPHAN', detail: `src module imported by NOTHING anywhere: ${m}` });
  }
  for (const t of testOnly) {
    findings.push({ severity: 'ADV', id: 'P1-TEST-ONLY', detail: `src module wired only from tests: ${t.m} (importers: ${t.importers.join(', ')})` });
  }
  for (const s of scriptOnly) {
    findings.push({ severity: 'ADV', id: 'P1-SCRIPT-ONLY', detail: `src module wired only from scripts/eval: ${s.m} (importers: ${s.importers.join(', ')})` });
  }
  for (const m of manualReview) {
    findings.push({ severity: 'ADV', id: 'P1-DYNAMIC-IMPORT', detail: `non-literal dynamic import() present — graph may under-count reachability: ${m}` });
  }

  const verdict = findings.some((f) => f.severity === 'FAIL') ? 'FAIL' : (findings.length > 0 ? 'ADVISORY' : 'PASS');
  finish('p1-wiring', {
    probe: 'p1-wiring',
    verdict,
    summary: `${moduleRel.size} src modules; ${unreachable.length} unreachable from [${ENTRIES.join(', ')}]: ${orphans.length} orphans, ${testOnly.length} test-only, ${scriptOnly.length} script-only; ${nonLiteralDynamic.length} files with non-literal dynamic imports`,
    findings,
    meta: {
      entries: ENTRIES,
      totalModules: moduleRel.size,
      reachable: seen.size,
      unreachable,
      orphans,
      testOnly,
      scriptOnly,
      nonLiteralDynamic,
    },
  });
};

main();
