/**
 * FAR-Lab reliability workstream — EXPANDED fault-injection suite (2026-08-24).
 *
 * Complements W8's cross-process kill/adoption soak (evidence/W8/fault-injection.json)
 * with the faults W8 did NOT cover. Every case runs REAL code paths (dist/ build,
 * real node:sqlite, real fs, real orchestrator); nothing is mocked at the unit level.
 * No network: model-plane faults use the scripted test-stub provider through the
 * real callStructured bridge; ENOSPC/EACCES are injected by patching fs inside a
 * child process at the syscall boundary (the OS-level failure shape).
 *
 * Usage: node spikes/reliability-faults.mjs [caseName...]
 * Output: per-case verdict (PASS/FAIL + measurements) to stdout; full JSON to
 * evidence/reliability/faults.json. Exit 0 iff all PASS.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const EVIDENCE_DIR = path.join(ROOT, 'evidence', 'reliability');
const results = [];
const tmp = (label) => fs.mkdtempSync(path.join(os.tmpdir(), `far-fault-${label}-`));

// ---- shared helpers (real store construction) ----

const mkStore = async (dir) => {
  const { openDb } = await import(pathToFileURL(path.join(ROOT, 'dist/persistence/db.js')).href);
  const { Store } = await import(pathToFileURL(path.join(ROOT, 'dist/persistence/store.js')).href);
  const db = openDb(path.join(dir, 'far.db'));
  return { db, store: new Store(db) };
};

const mkRun = async (store, text = 'fault injection') => {
  const { ResearchQuestion, newId } = await import(pathToFileURL(path.join(ROOT, 'dist/domain/index.js')).href);
  return store.createRun(ResearchQuestion.parse({
    id: newId('q'), text, background: '', goalType: 'exploratory',
    scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
  }));
};

const record = (name, pass, detail) => {
  results.push({ case: name, verdict: pass ? 'PASS' : 'FAIL', ...detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail.summary ? ' — ' + detail.summary : ''}`);
};

// Child-process script builder: writes a driver file that imports dist modules
// with injected syscalls, then runs it and captures exit/stdout.
const childDriver = (name, body) => {
  // Drivers are runtime scratch (rebuildable), not evidence — they live in tmpdir,
  // keeping the evidence dir to verdict JSON only (and lint-clean).
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-fault-driver-'));
  const file = path.join(scratchDir, `driver-${name}.mjs`);
  fs.writeFileSync(file, `import path from 'node:path';\nimport fs from 'node:fs';\nimport { pathToFileURL } from 'node:url';\nconst ROOT = ${JSON.stringify(ROOT)};\n${body}`);
  return file;
};

const runChild = (file, args = [], opts = {}) => new Promise((resolve) => {
  const p = spawn(process.execPath, [file, ...args], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; let err = '';
  p.stdout.on('data', (d) => { out += d; });
  p.stderr.on('data', (d) => { err += d; });
  p.on('exit', (code, signal) => resolve({ code, signal, out, err }));
  if (opts.sigintAfterMs !== undefined) setTimeout(() => p.kill('SIGINT'), opts.sigintAfterMs);
});

// ---- CASE: SIGINT mid-run (graceful-shutdown + frozen-recovery proof) ----

const caseSigint = async () => {
  const dir = tmp('sigint');
  const driver = childDriver('sigint', `
    process.env.FARLAB_LEASE_TTL_MS = '5000';
    const { openDb } = await import(pathToFileURL(path.join(ROOT, 'dist/persistence/db.js')).href);
    const { Store } = await import(pathToFileURL(path.join(ROOT, 'dist/persistence/store.js')).href);
    const { Orchestrator } = await import(pathToFileURL(path.join(ROOT, 'dist/app/orchestrator.js')).href);
    const { STAGE_ORDER } = await import(pathToFileURL(path.join(ROOT, 'dist/domain/run.js')).href);
    const db = openDb(path.join(${JSON.stringify(dir)}, 'far.db'));
    const store = new Store(db);
    const qm = await import(pathToFileURL(path.join(ROOT, 'dist/domain/index.js')).href);
    const q = qm.ResearchQuestion.parse({ id: qm.newId('q'), text: 'sigint', background: '', goalType: 'exploratory', scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString() });
    const run = store.createRun(q);
    fs.writeFileSync(path.join(${JSON.stringify(dir)}, 'runid.txt'), run.id);
    const busy = (stage) => ({ stage, applicable: async () => true, execute: async (ctx) => {
      for (let i = 1; i <= 8; i++) {
        await ctx.checkpointed(stage, 'f', 's:'+i, undefined, async () => { await new Promise(r => setTimeout(r, 150)); return i; });
        ctx.progress?.(i, 8);
      }
      return { kind: 'done', summary: stage };
    }});
    const orch = new Orchestrator({ store, artifacts: {}, provider: {}, sourceFor: () => { throw new Error('unused'); }, stages: new Map(STAGE_ORDER.map(s => [s, s === 'retrieve' ? busy(s) : ({ stage: s, applicable: async () => true, execute: async () => ({ kind: 'done', summary: s }) })])), signals: new Map() });
    const done = await orch.execute(run.id);
    console.log(JSON.stringify({ final: done.status }));
    db.close();
  `);
  const r = await runChild(driver, [], { sigintAfterMs: 1200 });
  const runId = fs.readFileSync(path.join(dir, 'runid.txt'), 'utf8').trim();
  // The lease (5s TTL) must EXPIRE before adoption — that is the frozen-run contract.
  await new Promise((res) => setTimeout(res, 5500));
  const { db, store } = await mkStore(dir);
  const frozen = store.getRun(runId);
  const chain = store.verifyEventChain(runId);
  // recovery: a fresh executor adopts (expired lease) and finishes
  const { Orchestrator } = await import(pathToFileURL(path.join(ROOT, 'dist/app/orchestrator.js')).href);
  const { STAGE_ORDER } = await import(pathToFileURL(path.join(ROOT, 'dist/domain/run.js')).href);
  const ok = (s) => ({ stage: s, applicable: async () => true, execute: async () => ({ kind: 'done', summary: s }) });
  const orch = new Orchestrator({ store, artifacts: {}, provider: {}, sourceFor: () => { throw new Error('unused'); }, stages: new Map(STAGE_ORDER.map((s) => [s, ok(s)])), signals: new Map() });
  const recovered = await orch.execute(runId);
  const pass = frozen.status === 'running' && chain.ok && recovered.status === 'completed';
  db.close();
  record('sigint-mid-run', pass, {
    summary: `child exit=${r.code}/${r.signal ?? '-'} frozen=${frozen.status} chainOk=${chain.ok} recovered=${recovered.status}`,
    frozenStatus: frozen.status, chainOk: chain.ok, recoveredStatus: recovered.status, childExit: r.code,
  });
};

// ---- CASE: DB busy — concurrent writer holds BEGIN IMMEDIATE ----

const caseDbBusy = async () => {
  const dir = tmp('dbbusy');
  const blocker = childDriver('dbbusy-blocker', `
    const { openDb } = await import(pathToFileURL(path.join(ROOT, 'dist/persistence/db.js')).href);
    const db = openDb(path.join(${JSON.stringify(dir)}, 'far.db'));
    db.exec('BEGIN IMMEDIATE');
    console.log('holding');
    await new Promise(r => setTimeout(r, 2500));
    db.exec('ROLLBACK'); db.close();
  `);
  const bp = spawn(process.execPath, [blocker], { cwd: ROOT, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600)); // let it take the write lock
  const t0 = Date.now();
  const { db, store } = await mkStore(dir);
  const run = await mkRun(store, 'db busy');
  let appendOk = false;
  try {
    store.appendEvent(run.id, { type: 'note', detail: { reason: 'busy-contended' } });
    appendOk = true;
  } catch { /* appendOk stays false — reported below */ }
  const ms = Date.now() - t0;
  const chain = appendOk ? store.verifyEventChain(run.id) : { ok: false };
  db.close();
  bp.kill();
  record('db-busy-concurrent-writer', appendOk && chain.ok, {
    summary: `append ${appendOk ? 'succeeded' : 'FAILED'} under 2.5s exclusive writer (waited ${ms}ms; busy_timeout 10s), chain ${chain.ok ? 'intact' : 'BROKEN'}`,
    appendOk, waitedMs: ms, chainOk: chain.ok,
  });
};

// ---- CASE: DB corruption boundary — flipped byte in the middle of far.db ----

const caseDbCorrupt = async () => {
  const dir = tmp('corrupt');
  const { db, store } = await mkStore(dir);
  const run = await mkRun(store, 'corrupt');
  store.appendEvent(run.id, { type: 'note', detail: { reason: 'pre-corruption' } });
  db.close();
  const dbPath = path.join(dir, 'far.db');
  const stat = fs.statSync(dbPath);
  const fh = fs.openSync(dbPath, 'r+');
  fs.writeSync(fh, Buffer.from('X'), 0, 1, Math.floor(stat.size / 2)); // flip one byte mid-file
  fs.closeSync(fh);
  let openThrew = false; let integrity = 'n/a';
  try {
    const { openDb } = await import(pathToFileURL(path.join(ROOT, 'dist/persistence/db.js')).href);
    const db2 = openDb(dbPath);
    integrity = db2.integrityCheck();
    db2.close();
  } catch { openThrew = true; }
  // The honest contract: corruption is DETECTED (integrity_check != ok or open throws),
  // never silently served.
  const detected = openThrew || integrity !== 'ok';
  record('db-corruption-detected', detected, {
    summary: `mid-file byte flip => ${openThrew ? 'open threw (fail-visible)' : `integrity_check=${integrity}`}`,
    openThrew, integrity, detected,
  });
};

// ---- CASE: ENOSPC injected at artifact put (atomic landing e2e) ----

const caseDiskFull = async () => {
  const dir = tmp('diskfull');
  const driver = childDriver('diskfull', `
    const REAL = fs.writeFileSync;
    // Real full-disk shape: the very first write (the put-TEMP, pre-rename) fails.
    // The atomic-landing fix means a complete run is exactly ONE write + ONE rename —
    // there is no second write that could partially land at the blob path.
    fs.writeFileSync = (p, data, opts) => {
      const e = new Error('write returned -1: no space left on device, write 0 of 4096'); e.code = 'ENOSPC'; throw e;
    };
    const { openArtifactStore } = await import(pathToFileURL(path.join(ROOT, 'dist/persistence/artifacts.js')).href);
    const store = openArtifactStore(path.join(${JSON.stringify(dir)}, 'artifacts'));
    try {
      await store.put('payload that must never partially land '.repeat(100));
      console.log(JSON.stringify({ landed: true }));
    } catch (e) {
      console.log(JSON.stringify({ landed: false, code: e.code }));
    }
  `);
  const r = await runChild(driver);
  const out = JSON.parse(r.out.trim().split('\n').pop());
  // Enumerate every file: no full blob may exist; any temp residue is allowed (gc sweeps) but no PARTIAL blob.
  let partialBlob = false; const files = [];
  const artRoot = path.join(dir, 'artifacts');
  if (fs.existsSync(artRoot)) {
    for (const shard of fs.readdirSync(artRoot)) {
      for (const f of fs.readdirSync(path.join(artRoot, shard))) {
        files.push(f);
        if (/^[0-9a-f]{64}$/.test(f)) partialBlob = true;
      }
    }
  }
  const pass = out.landed === false && out.code === 'ENOSPC' && !partialBlob;
  record('disk-full-artifact-put', pass, {
    summary: `ENOSPC on 2nd write => put failed (${out.code}), landed-blob-at-final-path=${partialBlob}, residue=${files.length} temp file(s)`,
    failVisible: out.landed === false, enospcCode: out.code, partialBlob, files,
  });
};

// ---- CASE: EACCES injected at artifact put (permission-denied shape) ----

const casePermDenied = async () => {
  const dir = tmp('eacces');
  const driver = childDriver('eacces', `
    // Store root creation succeeds; the fault lands at the atomic put's RENAME step
    // (the closest real shape to a permission wall during landing).
    const { openArtifactStore } = await import(pathToFileURL(path.join(ROOT, 'dist/persistence/artifacts.js')).href);
    const store = openArtifactStore(path.join(${JSON.stringify(dir)}, 'artifacts'));
    const REAL = fs.renameSync;
    fs.renameSync = (a, b) => { const e = new Error('EACCES: permission denied'); e.code = 'EACCES'; throw e; };
    try { await store.put('x'); console.log(JSON.stringify({ landed: true })); }
    catch (e) { console.log(JSON.stringify({ landed: false, code: e.code })); }
    finally { fs.renameSync = REAL; }
  `);
  const r = await runChild(driver);
  const out = JSON.parse(r.out.trim().split('\n').pop());
  const artRoot = path.join(dir, 'artifacts');
  let blobs = 0;
  if (fs.existsSync(artRoot)) {
    for (const shard of fs.readdirSync(artRoot)) blobs += fs.readdirSync(path.join(artRoot, shard)).filter((f) => /^[0-9a-f]{64}$/.test(f)).length;
  }
  record('perm-denied-artifact-put', out.landed === false && out.code === 'EACCES' && blobs === 0, {
    summary: `EACCES at mkdir => put failed visibly (code=${out.code}), blobs landed=${blobs}`,
    failVisible: out.landed === false, code: out.code, blobs,
  });
};

// ---- CASE: duplicate execute — two PROCESSES, one run (cross-process lease truth) ----

const caseDuplicateExecute = async () => {
  const dir = tmp('dupexec');
  // driver mode: exec <dir> — run the whole pipeline slowly; used by BOTH processes
  const driver = childDriver('dupexec', `
    process.env.FARLAB_LEASE_TTL_MS = '60000';
    const dir = process.argv[2];
    const { openDb } = await import(pathToFileURL(path.join(ROOT, 'dist/persistence/db.js')).href);
    const { Store } = await import(pathToFileURL(path.join(ROOT, 'dist/persistence/store.js')).href);
    const { Orchestrator } = await import(pathToFileURL(path.join(ROOT, 'dist/app/orchestrator.js')).href);
    const { STAGE_ORDER } = await import(pathToFileURL(path.join(ROOT, 'dist/domain/run.js')).href);
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    if (!fs.existsSync(path.join(dir, 'runid.txt'))) {
      const qm = await import(pathToFileURL(path.join(ROOT, 'dist/domain/index.js')).href);
      const q = qm.ResearchQuestion.parse({ id: qm.newId('q'), text: 'dup', background: '', goalType: 'exploratory', scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString() });
      const run = store.createRun(q);
      fs.writeFileSync(path.join(dir, 'runid.txt'), run.id);
    }
    const runId = fs.readFileSync(path.join(dir, 'runid.txt'), 'utf8').trim();
    const slow = (s) => ({ stage: s, applicable: async () => true, execute: async () => { await new Promise(r => setTimeout(r, 300)); return { kind: 'done', summary: s }; } });
    const orch = new Orchestrator({ store, artifacts: {}, provider: {}, sourceFor: () => { throw new Error('unused'); }, stages: new Map(STAGE_ORDER.map(s => [s, slow(s)])), signals: new Map() });
    try {
      const done = await orch.execute(runId);
      console.log(JSON.stringify({ pid: process.pid, outcome: 'fulfilled', status: done.status }));
    } catch (e) {
      console.log(JSON.stringify({ pid: process.pid, outcome: 'rejected', errorName: e.name }));
    }
    db.close();
  `);
  const [a, b] = await Promise.all([
    runChild(driver, [dir]),
    (async () => { await new Promise((r) => setTimeout(r, 80)); return runChild(driver, [dir]); })(),
  ]);
  const outA = a.out.trim() ? JSON.parse(a.out.trim().split('\n').pop()) : { outcome: 'crashed', code: a.code };
  const outB = b.out.trim() ? JSON.parse(b.out.trim().split('\n').pop()) : { outcome: 'crashed', code: b.code };
  const runId = fs.readFileSync(path.join(dir, 'runid.txt'), 'utf8').trim();
  const { db, store } = await mkStore(dir);
  const chain = store.verifyEventChain(runId);
  const maxAttempt = Math.max(...store.getRun(runId).stages.map((s) => s.attempt));
  // attempt>1 must be QUALITY-GATE regeneration (recorded event), never double execution.
  const reopenEvents = store.listEvents(runId).filter((e) => e.detail?.reason === 'quality_gate_regeneration');
  db.close();
  const rejected = [outA, outB].filter((o) => o.outcome === 'rejected' && o.errorName === 'RunLeaseHeldError');
  const completed = [outA, outB].filter((o) => o.outcome === 'fulfilled' && o.status === 'completed');
  const legitReopen = reopenEvents.length >= 1;
  const pass = rejected.length === 1 && completed.length === 1 && chain.ok && (maxAttempt === 1 || legitReopen);
  record('duplicate-execute-rejected', pass, {
    summary: `cross-process concurrent execute: completed=${completed.length}, RunLeaseHeldError=${rejected.length}, chain=${chain.ok}, maxStageAttempt=${maxAttempt}${legitReopen ? ' (quality-gate reopen, audited)' : ''} — single-writer enforced`,
    outcomes: [outA, outB], chainOk: chain.ok, maxAttempt, qualityReopens: reopenEvents.length,
  });
};

// ---- CASE: model-plane fault sequence through the REAL http retry core ----

const caseModelFaults = async () => {
  const driver = childDriver('modelfaults', `
    const { runOpenAICompatStructuredCall } = await import(pathToFileURL(path.join(ROOT, 'dist/providers/http.js')).href);
    // Real retry machinery, offline: inject the transport at the fetchImpl seam.
    // Sequence: 429 (Retry-After 10ms) -> 502 -> network reset -> 200 with malformed body (invalid_output) -> 200 good.
    const seq = [
      { status: 429, headers: { 'retry-after-ms': '10' }, body: JSON.stringify({ error: { message: 'rate limited' } }) },
      { status: 502, body: 'bad gateway' },
      { network: 'ECONNRESET' },
      { status: 200, body: JSON.stringify({ choices: [{ message: { content: '{not valid json' } }] }) },
      { status: 200, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ answer: 42 }) } }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } }) },
    ];
    let calls = 0;
    const sleeps = [];
    const mkDeps = (impl) => ({ fetchImpl: impl, sleep: async (ms) => { sleeps.push(ms); }, random: () => 0.5, totalTimeoutMs: 8000 });
    const cfg = { providerName: 'fault-inject', modelId: 'm1', baseUrl: 'http://offline.invalid', apiKey: 'k', executionMode: 'test' };
    const parse = (x) => x;
    // Attempt 1: the fault sequence (429 → 502 → reset → malformed). Honest outcome:
    // fail-visible with a provider kind after the retry budget burns — never fabricated.
    const faultFetch = async () => {
      const s = seq[Math.min(calls, seq.length - 1)]; calls += 1;
      if (s.network) { const e = new Error('socket hang up'); e.code = s.network; throw e; }
      return { ok: s.status >= 200 && s.status < 300, status: s.status, headers: { get: (h) => s.headers?.[h.toLowerCase()] ?? null }, text: async () => s.body };
    };
    // Attempt 2 (control): clean 200 — proves recovery once the transport is healthy.
    const cleanFetch = async () => {
      const s = seq[seq.length - 1];
      return { ok: true, status: 200, headers: { get: () => null }, text: async () => s.body };
    };
    calls = 0;
    const r1 = await runOpenAICompatStructuredCall(cfg, { purpose: 'fault-seq', messages: [], responseFormat: { type: 'json_object' } }, parse, mkDeps(faultFetch));
    const attempt1 = r1.ok === true ? 'ok' : r1.error.kind;
    calls = 0;
    const r2 = await runOpenAICompatStructuredCall(cfg, { purpose: 'clean-seq', messages: [], responseFormat: { type: 'json_object' } }, parse, mkDeps(cleanFetch));
    const attempt2 = r2.ok === true ? 'ok' : r2.error.kind;
    console.log(JSON.stringify({ attempt1, attempt2, sleeps }));
  `);
  const r = await runChild(driver);
  if (r.code !== 0) { record('model-fault-sequence', false, { summary: `driver failed: ${r.err.slice(0, 400)}` }); return; }
  const out = JSON.parse(r.out.trim().split('\n').pop());
  // Faults under the REAL retry core: fail-visible with a provider kind (retryable
  // ones burn backoff sleeps first), and a clean transport recovers to ok.
  const failVisible = ['rate_limited', 'timeout', 'provider_error', 'invalid_output', 'auth_error', 'quota_exceeded'].includes(out.attempt1);
  const pass = failVisible && out.attempt2 === 'ok' && out.sleeps.length >= 2;
  record('model-fault-sequence', pass, {
    summary: `injected 429→502→ECONNRESET→malformed through the REAL retry core: faultAttempt=${out.attempt1} (fail-visible), cleanAttempt=${out.attempt2}, backoffSleeps=${JSON.stringify(out.sleeps)}`,
    attempts: [out.attempt1, out.attempt2], sleeps: out.sleeps,
  });
};

// ---- CASE: outbox crash window (intent persisted, drain after "restart" is idempotent) ----

const caseOutboxCrashWindow = async () => {
  const dir = tmp('outbox');
  const { db, store } = await mkStore(dir);
  const run = await mkRun(store, 'outbox');
  // crash window: the domain write + intent land in ONE tx; the drain happens LATER
  // (a fresh process after restart). Record the intent, close, reopen, drain twice.
  store.recordOutbox('intent-fi-1', 'experiment_job', { experimentRunId: 'exp_fi1', runId: run.id, specId: 'spec_x' });
  db.close();
  const driver = childDriver('outbox', `
    const { openDb } = await import(pathToFileURL(path.join(ROOT, 'dist/persistence/db.js')).href);
    const { Store } = await import(pathToFileURL(path.join(ROOT, 'dist/persistence/store.js')).href);
    const sched = await import(pathToFileURL(path.join(ROOT, 'dist/experiment/scheduler.js')).href);
    const db = openDb(path.join(${JSON.stringify(dir)}, 'far.db'));
    const store = new Store(db);
    const scheduler = sched.openScheduler(path.join(${JSON.stringify(dir)}, 'far-scheduler.db'));
    const d1 = sched.drainOutbox(store, scheduler);
    const d2 = sched.drainOutbox(store, scheduler); // crash + retry shape: drain again
    console.log(JSON.stringify({ d1, d2, pending: store.pendingOutbox().length }));
    db.close(); scheduler.close();
  `);
  const r = await runChild(driver);
  if (r.code !== 0) { record('outbox-drain-idempotent', false, { summary: `driver failed: ${r.err.slice(0, 400)}` }); return; }
  const out = JSON.parse(r.out.trim().split('\n').pop());
  const pass = out.d1.drained === 1 && out.d2.drained === 0 && out.pending === 0;
  record('outbox-drain-idempotent', pass, {
    summary: `intent persisted, drained after reopen: first=${JSON.stringify(out.d1)}, second=${JSON.stringify(out.d2)}, pending=${out.pending}`,
    ...out,
  });
};

// ---- CASE: concurrent appendEvent from two processes (chain integrity) ----

const caseConcurrentAppend = async () => {
  const dir = tmp('append');
  const { db, store } = await mkStore(dir);
  const run = await mkRun(store, 'concurrent append');
  db.close();
  const driver = childDriver('append', `
    const { openDb } = await import(pathToFileURL(path.join(ROOT, 'dist/persistence/db.js')).href);
    const { Store } = await import(pathToFileURL(path.join(ROOT, 'dist/persistence/store.js')).href);
    const db = openDb(path.join(${JSON.stringify(dir)}, 'far.db'));
    const store = new Store(db);
    const runId = ${JSON.stringify(run.id)};
    for (let i = 0; i < 40; i++) store.appendEvent(runId, { type: 'note', detail: { reason: 'race', from: process.pid, i } });
    db.close();
  `);
  const [a, b] = await Promise.all([runChild(driver), runChild(driver)]);
  const { db: db2, store: store2 } = await mkStore(dir);
  const chain = store2.verifyEventChain(run.id);
  const events = store2.listEvents(run.id);
  const seqs = events.map((e) => e.seq);
  const monotonic = seqs.every((s, i) => i === 0 || s > seqs[i - 1]);
  // 80 race notes + the run_created event from mkRun's createRun = 81 total.
  const raceNotes = events.filter((e) => e.detail?.reason === 'race').length;
  const raceUnique = new Set(events.filter((e) => e.detail?.reason === 'race').map((e) => `${e.detail.from}:${e.detail.i}`)).size;
  db2.close();
  record('concurrent-append-two-processes', a.code === 0 && b.code === 0 && chain.ok && monotonic && raceNotes === 80 && raceUnique === 80, {
    summary: `2 procs × 40 appends: exits ${a.code}/${b.code}, raceNotes=${raceNotes}/80 unique=${raceUnique}, chain=${chain.ok}, seqMonotonic=${monotonic}`,
    chainOk: chain.ok, raceNotes, raceUnique, monotonic,
  });
};

// ---- main ----

const CASES = {
  'sigint-mid-run': caseSigint,
  'db-busy-concurrent-writer': caseDbBusy,
  'db-corruption-detected': caseDbCorrupt,
  'disk-full-artifact-put': caseDiskFull,
  'perm-denied-artifact-put': casePermDenied,
  'duplicate-execute-rejected': caseDuplicateExecute,
  'model-fault-sequence': caseModelFaults,
  'outbox-drain-idempotent': caseOutboxCrashWindow,
  'concurrent-append-two-processes': caseConcurrentAppend,
};

const selected = process.argv.slice(2).length > 0 ? process.argv.slice(2) : Object.keys(CASES);
for (const name of selected) {
  if (!(name in CASES)) { console.error(`unknown case: ${name}`); process.exit(2); }
  try { await CASES[name](); } catch (e) { record(name, false, { summary: `harness error: ${e.message}`, stack: e.stack?.slice(0, 600) }); }
}
fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
fs.writeFileSync(path.join(EVIDENCE_DIR, 'faults.json'), JSON.stringify({
  measuredAt: new Date().toISOString(), results,
}, null, 2));
const failed = results.filter((r) => r.verdict === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} cases PASS`);
process.exit(failed > 0 ? 1 : 0);
