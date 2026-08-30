#!/usr/bin/env node

/**
 * Endgame sweep ledger — deterministic inventory + adjudication guard.
 *
 * Dynamic review state lives in .control/SWEEP-LOG.json. FINAL_ACCEPTANCE.json
 * remains the authority for findings/status; this ledger only links file reviews
 * and shallow-assertion adjudications to those FA ids.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const SCHEMA = 'endgame-sweep/1';
const REVIEW_STATES = new Set(['pending', 'reviewed_clean', 'finding_open', 'finding_fixed', 'not_applicable']);
const ASSERTION_STATES = new Set(['pending', 'justified', 'strengthened']);
const TABLE_NAMES = [
  'runtime',
  'tests_evaluation_evidence',
  'delivery_operations',
  'product_specs_docs',
  'governance_assets',
];

const argv = process.argv.slice(2);
const command = argv[0] ?? 'status';
const option = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const has = (name) => argv.includes(name);
const root = path.resolve(option('--root') ?? process.cwd());
const logPath = path.resolve(root, option('--log') ?? '.control/SWEEP-LOG.json');
const acceptancePath = path.join(root, 'FINAL_ACCEPTANCE.json');

const fail = (message) => {
  process.stderr.write(`[endgame-sweep] FAIL: ${message}\n`);
  process.exitCode = 1;
};

const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const trackedFiles = () => execFileSync('git', ['ls-files', '-z'], { cwd: root })
  .toString('utf8').split('\0').filter(Boolean).sort();
const head = () => git(['rev-parse', 'HEAD']);
const now = () => new Date().toISOString();
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const readLog = () => fs.existsSync(logPath) ? readJson(logPath) : null;
const writeJsonAtomic = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temp, file);
};

const classify = (file) => {
  if (
    /(^tests\/|^eval\/|^web\/e2e\/|^evidence\/|(^|\/)(test|tests|fixtures)\/|\.(test|spec)\.[cm]?[jt]sx?$)/.test(file)
  ) return 'tests_evaluation_evidence';
  if (/^(src\/|web\/src\/|packages\/tui\/src\/|experiment-runtime\/(farlab_experiment_runtime|remote)\/|desktop\/src-tauri\/src\/)/.test(file)) return 'runtime';
  if (
    /^(\.github\/|scripts\/|zcode-harness\/|desktop\/|docker\/)/.test(file)
    || /(^|\/)(Dockerfile|compose[^/]*\.ya?ml|package(?:-lock)?\.json|pyproject\.toml|uv\.lock|Cargo\.(?:toml|lock)|rust-toolchain\.toml|tsconfig[^/]*\.json|eslint[^/]*|vite\.config\.[^/]+|playwright\.config\.[^/]+)$/.test(file)
  ) return 'delivery_operations';
  if (/^(project-spec\/|docs\/|submission\/|research\/)|(^|\/)(README|DESIGN|PRODUCT|SECURITY|CONTRIBUTING|CHANGELOG|SUPPORT|CODE_OF_CONDUCT|CITATION)(\.|$)/i.test(file)) return 'product_specs_docs';
  return 'governance_assets';
};

const assertionKinds = [
  ['toBeDefined', /\.toBeDefined\s*\(/],
  ['toBeTruthy', /\.toBeTruthy\s*\(/],
  ['not.toThrow', /\.not\.toThrow\s*\(/],
  ['assert.ok', /\bassert\.ok\s*\(/],
];

const hash = (text) => createHash('sha256').update(text).digest('hex');
const workingTreeDigest = (file) => {
  const full = path.join(root, file);
  try {
    const stat = fs.lstatSync(full);
    if (stat.isSymbolicLink()) return hash(`symlink\0${fs.readlinkSync(full)}`);
    if (!stat.isFile()) return `unsupported:${stat.mode}`;
    return hash(fs.readFileSync(full));
  } catch (error) {
    return `missing:${error instanceof Error ? error.code ?? error.name : 'unknown'}`;
  }
};
const scanAssertions = (files, priorById) => {
  const out = [];
  for (const file of files) {
    if (!/\.(?:[cm]?[jt]sx?|py)$/.test(file)) continue;
    let text;
    try { text = fs.readFileSync(path.join(root, file), 'utf8'); } catch { continue; }
    const occurrences = new Map();
    text.split(/\r?\n/).forEach((line, index) => {
      for (const [kind, pattern] of assertionKinds) {
        const count = [...line.matchAll(new RegExp(pattern.source, 'g'))].length;
        if (count === 0) continue;
        const snippet = line.trim().slice(0, 500);
        for (let match = 0; match < count; match += 1) {
          const key = `${file}\0${kind}\0${snippet}`;
          const occurrence = (occurrences.get(key) ?? 0) + 1;
          occurrences.set(key, occurrence);
          const id = hash(`${key}\0${occurrence}`);
          const previous = priorById.get(id);
          out.push({
            id,
            path: file,
            line: index + 1,
            kind,
            snippet,
            occurrence,
            status: previous?.status ?? 'pending',
            ...(previous?.rationale !== undefined ? { rationale: previous.rationale } : {}),
            ...(previous?.evidence !== undefined ? { evidence: previous.evidence } : {}),
            ...(previous?.reviewedAt !== undefined ? { reviewedAt: previous.reviewedAt } : {}),
          });
        }
      }
    });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line || a.kind.localeCompare(b.kind));
};

const acceptance = () => {
  const data = readJson(acceptancePath);
  if (!Array.isArray(data.items)) throw new Error('FINAL_ACCEPTANCE.json: items must be an array');
  return data;
};

const sync = () => {
  const previous = readLog();
  const priorFiles = new Map();
  for (const table of TABLE_NAMES) {
    for (const entry of previous?.tables?.[table] ?? []) priorFiles.set(entry.path, entry);
  }
  const files = trackedFiles();
  const tables = Object.fromEntries(TABLE_NAMES.map((name) => [name, []]));
  for (const file of files) {
    const old = priorFiles.get(file);
    const blobSha256 = workingTreeDigest(file);
    const unchanged = old?.blobSha256 === blobSha256;
    const status = unchanged
      ? old.status
      : old?.status === 'finding_open' ? 'finding_open' : 'pending';
    tables[classify(file)].push({
      path: file,
      blobSha256,
      status: status ?? 'pending',
      findingIds: old?.findingIds ?? [],
      evidence: old?.evidence ?? [],
      ...(old?.rationale !== undefined ? { rationale: old.rationale } : {}),
      ...(unchanged && old?.reviewedAt !== undefined ? { reviewedAt: old.reviewedAt } : {}),
      ...(unchanged && old?.reviewedBlobSha256 !== undefined ? { reviewedBlobSha256: old.reviewedBlobSha256 } : {}),
    });
  }
  const testFiles = tables.tests_evaluation_evidence.map((entry) => entry.path);
  const oldAssertions = new Map([
    ...(previous?.retiredAssertions ?? []),
    ...(previous?.shallowAssertions ?? []),
  ].map((entry) => [entry.id, entry]));
  const shallowAssertions = scanAssertions(testFiles, oldAssertions);
  const currentAssertionIds = new Set(shallowAssertions.map((entry) => entry.id));
  const retiredAssertions = [
    ...(previous?.retiredAssertions ?? []).filter((entry) => !currentAssertionIds.has(entry.id)),
    ...(previous?.shallowAssertions ?? []).filter((entry) => !currentAssertionIds.has(entry.id)).map((entry) => ({ ...entry, retiredAt: now(), retiredAtHead: head() })),
  ].filter((entry, index, all) => all.findIndex((candidate) => candidate.id === entry.id) === index);
  const previousLinks = new Map((previous?.acceptanceLinks ?? []).map((entry) => [entry.faId, entry]));
  const acceptanceLinks = acceptance().items.map((item) => previousLinks.get(item.id) ?? ({ faId: item.id, linkedAt: now(), source: 'acceptance_backfill' }));
  const value = {
    schema: SCHEMA,
    head: head(),
    syncedAt: now(),
    tables,
    shallowAssertions,
    retiredAssertions,
    acceptanceLinks,
  };
  writeJsonAtomic(logPath, value);
  process.stdout.write(`[endgame-sweep] synced ${files.length} tracked files, ${shallowAssertions.length} shallow-assertion candidates, ${acceptanceLinks.length} FA links -> ${logPath}\n`);
  return value;
};

const validate = (log, requireComplete) => {
  const errors = [];
  if (log?.schema !== SCHEMA) errors.push(`schema must be ${SCHEMA}`);
  const current = trackedFiles();
  const currentSet = new Set(current);
  const occurrences = new Map();
  for (const table of TABLE_NAMES) {
    if (!Array.isArray(log?.tables?.[table])) { errors.push(`missing table ${table}`); continue; }
    for (const entry of log.tables[table]) {
      occurrences.set(entry.path, (occurrences.get(entry.path) ?? 0) + 1);
      if (!REVIEW_STATES.has(entry.status)) errors.push(`${entry.path}: invalid status ${entry.status}`);
      const currentDigest = workingTreeDigest(entry.path);
      if (entry.blobSha256 !== currentDigest) errors.push(`${entry.path}: working-tree content changed since sync; run sync`);
      if (entry.status !== 'pending' && entry.status !== 'finding_open' && entry.reviewedBlobSha256 !== entry.blobSha256) {
        errors.push(`${entry.path}: completed review is not bound to the current blob`);
      }
      if ((entry.status === 'finding_open' || entry.status === 'finding_fixed') && (!Array.isArray(entry.findingIds) || entry.findingIds.length === 0)) errors.push(`${entry.path}: ${entry.status} requires findingIds`);
      if (entry.status === 'finding_fixed' && (!Array.isArray(entry.evidence) || entry.evidence.length === 0)) errors.push(`${entry.path}: finding_fixed requires evidence`);
      if (entry.status === 'not_applicable' && !entry.rationale) errors.push(`${entry.path}: not_applicable requires rationale`);
    }
  }
  for (const file of current) {
    const n = occurrences.get(file) ?? 0;
    if (n !== 1) errors.push(`${file}: inventory occurrence ${n}, expected exactly 1`);
  }
  for (const file of occurrences.keys()) if (!currentSet.has(file)) errors.push(`${file}: ledger entry is no longer tracked; run sync`);

  const acceptanceItems = acceptance().items;
  const faIds = new Set(acceptanceItems.map((item) => item.id));
  if (faIds.size !== acceptanceItems.length) errors.push('FINAL_ACCEPTANCE.json contains duplicate ids');
  const linked = new Set((log?.acceptanceLinks ?? []).map((entry) => entry.faId));
  if (linked.size !== (log?.acceptanceLinks ?? []).length) errors.push('acceptanceLinks contains duplicate FA ids');
  for (const id of faIds) if (!linked.has(id)) errors.push(`${id}: missing acceptance backfill link; run sync`);
  for (const id of linked) if (!faIds.has(id)) errors.push(`${id}: linked FA item no longer exists; adjudicate before removal`);
  for (const table of TABLE_NAMES) {
    for (const entry of log?.tables?.[table] ?? []) {
      for (const id of entry.findingIds ?? []) if (!faIds.has(id)) errors.push(`${entry.path}: finding ${id} is absent from FINAL_ACCEPTANCE.json`);
    }
  }
  const allAssertions = [...(log?.shallowAssertions ?? []), ...(log?.retiredAssertions ?? [])];
  const assertionIds = new Set();
  for (const candidate of allAssertions) {
    if (assertionIds.has(candidate.id)) errors.push(`${candidate.id}: duplicate assertion ledger entry`);
    assertionIds.add(candidate.id);
    if (!ASSERTION_STATES.has(candidate.status)) errors.push(`${candidate.id}: invalid assertion status ${candidate.status}`);
    if (candidate.status === 'justified' && !candidate.rationale) errors.push(`${candidate.path}:${candidate.line}: justified requires rationale`);
    if (candidate.status === 'strengthened' && (!Array.isArray(candidate.evidence) || candidate.evidence.length === 0)) errors.push(`${candidate.path}:${candidate.line}: strengthened requires evidence`);
  }
  if (requireComplete) {
    for (const table of TABLE_NAMES) {
      for (const entry of log?.tables?.[table] ?? []) {
        if (entry.status === 'pending' || entry.status === 'finding_open') errors.push(`${entry.path}: incomplete review status ${entry.status}`);
      }
    }
    for (const candidate of allAssertions) if (candidate.status === 'pending') errors.push(`${candidate.path}:${candidate.line}: shallow assertion not adjudicated${candidate.retiredAt !== undefined ? ' (removed but unresolved)' : ''}`);
  }
  return errors;
};

const printStatus = (log) => {
  if (log === null) {
    process.stdout.write(`[endgame-sweep] no ledger at ${logPath}; run sync\n`);
    return;
  }
  for (const table of TABLE_NAMES) {
    const entries = log.tables?.[table] ?? [];
    const done = entries.filter((entry) => entry.status !== 'pending' && entry.status !== 'finding_open').length;
    process.stdout.write(`${table}\t${done}/${entries.length}\t${entries.length === 0 ? '0.0' : (done * 100 / entries.length).toFixed(1)}%\n`);
  }
  const assertions = [...(log.shallowAssertions ?? []), ...(log.retiredAssertions ?? [])];
  const adjudicated = assertions.filter((entry) => entry.status !== 'pending').length;
  process.stdout.write(`shallow_assertions\t${adjudicated}/${assertions.length}\t${assertions.length === 0 ? '0.0' : (adjudicated * 100 / assertions.length).toFixed(1)}%\n`);
  process.stdout.write(`retired_assertions\t${(log.retiredAssertions ?? []).length}\n`);
  process.stdout.write(`acceptance_links\t${(log.acceptanceLinks ?? []).length}\n`);
};

const updateFileReview = () => {
  const log = readLog();
  if (log === null) throw new Error(`no ledger at ${logPath}; run sync first`);
  const target = option('--path');
  const status = option('--status');
  if (!target || !status || !REVIEW_STATES.has(status)) throw new Error('record requires --path and valid --status');
  const entry = TABLE_NAMES.flatMap((table) => log.tables[table]).find((item) => item.path === target);
  if (entry === undefined) throw new Error(`${target}: not present; run sync`);
  const faId = option('--fa');
  if ((status === 'finding_open' || status === 'finding_fixed') && !faId) throw new Error(`${status} requires --fa FA-...`);
  if (faId && !acceptance().items.some((item) => item.id === faId)) throw new Error(`${faId}: add the finding to FINAL_ACCEPTANCE.json before linking it`);
  if (entry.status === 'finding_open' && status !== 'finding_open' && status !== 'finding_fixed') {
    throw new Error(`${target}: open finding must transition through finding_fixed with evidence`);
  }
  if (entry.findingIds.length > 0 && (status === 'reviewed_clean' || status === 'not_applicable')) {
    throw new Error(`${target}: linked findings cannot be bypassed with status ${status}`);
  }
  const evidence = option('--evidence');
  const rationale = option('--rationale');
  if (status === 'finding_fixed' && !evidence) throw new Error('finding_fixed requires --evidence');
  if (status === 'not_applicable' && !rationale) throw new Error('not_applicable requires --rationale');
  entry.status = status;
  if (faId && !entry.findingIds.includes(faId)) entry.findingIds.push(faId);
  if (evidence && !entry.evidence.includes(evidence)) entry.evidence.push(evidence);
  if (rationale) entry.rationale = rationale;
  if (status === 'pending') {
    delete entry.reviewedAt;
    delete entry.reviewedBlobSha256;
  } else {
    entry.reviewedAt = now();
    entry.reviewedBlobSha256 = entry.blobSha256;
  }
  writeJsonAtomic(logPath, log);
  process.stdout.write(`[endgame-sweep] ${target} -> ${status}\n`);
};

const updateAssertion = () => {
  const log = readLog();
  if (log === null) throw new Error(`no ledger at ${logPath}; run sync first`);
  const id = option('--id');
  const status = option('--status');
  if (!id || !status || !ASSERTION_STATES.has(status) || status === 'pending') throw new Error('assertion requires --id and --status justified|strengthened');
  const entry = [...(log.shallowAssertions ?? []), ...(log.retiredAssertions ?? [])].find((item) => item.id === id);
  if (entry === undefined) throw new Error(`${id}: unknown current assertion candidate`);
  const rationale = option('--rationale');
  const evidence = option('--evidence');
  if (status === 'justified' && !rationale) throw new Error('justified requires --rationale');
  if (status === 'strengthened' && !evidence) throw new Error('strengthened requires --evidence');
  entry.status = status;
  if (rationale) entry.rationale = rationale;
  if (evidence) entry.evidence = [...new Set([...(entry.evidence ?? []), evidence])];
  entry.reviewedAt = now();
  writeJsonAtomic(logPath, log);
  process.stdout.write(`[endgame-sweep] assertion ${id.slice(0, 12)} -> ${status}\n`);
};

try {
  if (command === 'sync') sync();
  else if (command === 'status') printStatus(readLog());
  else if (command === 'check') {
    const log = readLog();
    if (log === null) fail(`no ledger at ${logPath}; run sync`);
    else {
      const errors = validate(log, has('--require-complete'));
      if (errors.length > 0) {
        const pendingFiles = errors.filter((error) => error.includes('incomplete review status')).length;
        const pendingAssertions = errors.filter((error) => error.includes('shallow assertion not adjudicated')).length;
        process.stderr.write(`[endgame-sweep] violation summary: pending_files=${pendingFiles} pending_assertions=${pendingAssertions} total=${errors.length}\n`);
        for (const error of errors.slice(0, 100)) process.stderr.write(`[endgame-sweep] ${error}\n`);
        if (errors.length > 100) process.stderr.write(`[endgame-sweep] ... ${errors.length - 100} more\n`);
        fail(`${errors.length} ledger violation(s)`);
      } else process.stdout.write(`[endgame-sweep] PASS${has('--require-complete') ? ' (complete)' : ''}\n`);
    }
  } else if (command === 'record') updateFileReview();
  else if (command === 'assertion') updateAssertion();
  else fail(`unknown command '${command}' (sync|status|check|record|assertion)`);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
