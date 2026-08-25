/**
 * P4 stale-web probe — "stale Web assets" detector.
 *
 * The D-031 guard (src/cli/dist-freshness.ts, reused by scripts/serve.mjs) must
 * refuse to serve when any src module is newer than its compiled dist counterpart
 * (or dist is missing). Two layers verified:
 *  (a) unit-level against the REAL compiled guard (staleDistFiles): missing dist,
 *      older dist, and fresh dist must classify correctly;
 *  (b) end-to-end against the REAL serve entrypoint (scripts/serve.mjs) spawned
 *      with a cwd whose tree is stale — the process must exit non-zero without
 *      binding a port; and with the fresh lane worktree cwd it must start (then
 *      we kill it).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ROOT, distImport, finish, tempDir } from './lib.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const serveOnce = (cwd, timeoutMs) => new Promise((resolve) => {
  const proc = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
    cwd,
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let out = '';
  let code = null;
  const timer = setTimeout(() => {
    proc.kill();
    resolve({ code: 'timeout-killed', out });
  }, timeoutMs);
  proc.stdout.on('data', (d) => { out += String(d); });
  proc.stderr.on('data', (d) => { out += String(d); });
  proc.on('exit', (c) => { code = c; clearTimeout(timer); resolve({ code, out }); });
});

const main = async () => {
  const findings = [];
  const { staleDistFiles } = await distImport('cli/dist-freshness.js');

  // (a) guard unit contract on crafted trees.
  const t1 = tempDir('r14-stale1-'); // dist missing entirely
  fs.mkdirSync(path.join(t1, 'src'), { recursive: true });
  fs.writeFileSync(path.join(t1, 'src', 'a.ts'), 'export {};\n');
  const missing = staleDistFiles(t1);
  if (!missing.some((m) => m.includes('missing'))) findings.push({ severity: 'FAIL', id: 'P4-GUARD-MISSING', detail: `guard failed to flag missing dist: ${JSON.stringify(missing)}` });

  const t2 = tempDir('r14-stale2-'); // dist older than src
  fs.mkdirSync(path.join(t2, 'src'), { recursive: true });
  fs.mkdirSync(path.join(t2, 'dist'), { recursive: true });
  const srcP = path.join(t2, 'src', 'a.ts');
  const distP = path.join(t2, 'dist', 'a.js');
  fs.writeFileSync(srcP, 'export {};\n');
  await sleep(30);
  fs.writeFileSync(distP, 'export {};\n');
  await sleep(30);
  fs.utimesSync(srcP, new Date(), new Date()); // src now newer
  const older = staleDistFiles(t2);
  if (!older.includes('a.js')) findings.push({ severity: 'FAIL', id: 'P4-GUARD-OLDER', detail: `guard failed to flag older dist: ${JSON.stringify(older)}` });

  const fresh = staleDistFiles(ROOT); // lane worktree was just built
  if (fresh.length !== 0) findings.push({ severity: 'FAIL', id: 'P4-GUARD-FALSE-POSITIVE', detail: `guard flags a freshly built tree: ${fresh.slice(0, 5).join(', ')}` });

  // (b) real serve entrypoint on a stale cwd must refuse to start.
  const staleServe = await serveOnce(t2, 15000);
  const refused = staleServe.code !== 'timeout-killed' && staleServe.code !== 0;
  if (!refused) findings.push({ severity: 'FAIL', id: 'P4-SERVE-NO-GUARD', detail: `serve.mjs did not refuse a stale tree (code=${staleServe.code}): ${staleServe.out.slice(0, 200)}` });
  if (!/stale|dist/i.test(staleServe.out)) findings.push({ severity: 'ADV', id: 'P4-SERVE-SILENT', detail: `serve refusal message does not mention stale/dist: ${staleServe.out.slice(0, 200)}` });

  // fresh worktree must actually start (and we then kill it).
  const freshServe = await serveOnce(ROOT, 20000);
  const started = freshServe.code === 'timeout-killed' && /far-serve|web workbench|listening|http/i.test(freshServe.out);
  if (!started) findings.push({ severity: 'FAIL', id: 'P4-SERVE-FRESH-REFUSED', detail: `serve.mjs refused the FRESH lane worktree (code=${freshServe.code}): ${freshServe.out.slice(0, 300)}` });

  const verdict = findings.some((f) => f.severity === 'FAIL') ? 'FAIL' : (findings.length > 0 ? 'ADVISORY' : 'PASS');
  finish('p4-stale-web', {
    probe: 'p4-stale-web',
    verdict,
    summary: `D-031 guard: missing-dist ${missing.length > 0 ? 'flagged' : 'MISSED'}, older-dist ${older.includes('a.js') ? 'flagged' : 'MISSED'}, fresh-worktree ${fresh.length === 0 ? 'clean' : `${fresh.length} false positives`}; real serve on stale tree ${refused ? 'refused' : 'SERVED STALE'}, on fresh tree ${started ? 'started' : 'refused'}`,
    findings,
    meta: { missing, older, freshCount: fresh.length, staleServe: { code: staleServe.code, out: staleServe.out.slice(0, 500) }, freshServe: { code: freshServe.code, out: freshServe.out.slice(0, 500) } },
  });
};

main();
