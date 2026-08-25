/**
 * P8 agent-isolation probe — "multi-agent that is only multiple prompts" detector.
 *
 * 1. BEHAVIORAL: the real PermissionEngine must gate execute-class tools ('ask' or
 *    'deny', never silent 'allow') in default mode with no matching rule; explicit
 *    deny must survive an allow rule (strictest-wins); explore mode must deny
 *    non-read tools; a read-class allow rule must let read tools through.
 * 2. STATIC: the engine's decide() must be invoked on the agent tool-execution
 *    path (dist/agent/loop.js references the permission decision) — otherwise the
 *    engine is a disconnected library.
 * 3. STATIC: runSubagents must route children through the SAME dependency plane
 *    (childDeps derive from parent deps + fail-closed depth cap) — verified by
 *    source markers, since driving a full subagent rollout requires a live model.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, distImport, finish } from './lib.mjs';

const main = async () => {
  const { PermissionEngine } = await distImport('agent/permissions.js');
  const findings = [];
  const checks = [];

  // 1a. execute-class tool, default mode, no rules -> ask or deny, never allow.
  const e1 = new PermissionEngine({ mode: 'default', rules: [] });
  const d1 = await e1.decide('run_command', { cmd: 'whoami' }, 'execute');
  const ok1 = d1.effect !== 'allow';
  checks.push({ id: 'execute-default', effect: d1.effect, ok: ok1 });
  if (!ok1) findings.push({ severity: 'FAIL', id: 'P8-SILENT-ALLOW', detail: `execute-class tool silently allowed in default mode (${JSON.stringify(d1)})` });

  // 1b. explicit deny outranks allow (strictest-wins composition).
  const e2 = new PermissionEngine({
    mode: 'default',
    rules: [
      { effect: 'allow', tool: 'run_command' },
      { effect: 'deny', tool: 'run_command', note: 'policy-blacklist' },
    ],
  });
  const d2 = await e2.decide('run_command', {}, 'execute');
  const ok2 = d2.effect === 'deny';
  checks.push({ id: 'deny-beats-allow', effect: d2.effect, ok: ok2 });
  if (!ok2) findings.push({ severity: 'FAIL', id: 'P8-RULE-ORDER', detail: `allow rule overrode explicit deny (${JSON.stringify(d2)}) — rule order changes security` });

  // 1c. explore mode refuses non-read tools.
  const e3 = new PermissionEngine({ mode: 'explore', rules: [] });
  const d3 = await e3.decide('write_file', { path: 'x' }, 'edit');
  const ok3 = d3.effect === 'deny';
  checks.push({ id: 'explore-nonread', effect: d3.effect, ok: ok3 });
  if (!ok3) findings.push({ severity: 'FAIL', id: 'P8-EXPLOPE-ESCAPE', detail: `explore mode allowed a non-read tool (${JSON.stringify(d3)})` });

  // 1d. read-class allow rule still works (permission system is functional, not blanket-deny).
  const e4 = new PermissionEngine({ mode: 'default', rules: [{ effect: 'allow', tool: 'read_file' }] });
  const d4 = await e4.decide('read_file', { path: 'x' }, 'read');
  const ok4 = d4.effect === 'allow';
  checks.push({ id: 'read-allow', effect: d4.effect, ok: ok4 });
  if (!ok4) findings.push({ severity: 'ADV', id: 'P8-BLANKET-DENY', detail: `read-class allow rule did not take effect (${JSON.stringify(d4)}) — permission system over-blocking` });

  // 2. enforcement point on the real agent loop tool path.
  const loopSrc = fs.readFileSync(path.join(ROOT, 'dist', 'agent', 'loop.js'), 'utf8');
  const wired = /permission/i.test(loopSrc);
  if (!wired) findings.push({ severity: 'FAIL', id: 'P8-ENGINE-DISCONNECTED', detail: 'agent loop never references the permission engine — gate exists but is not on the execution path' });

  // 3. subagents share the parent dependency plane (same permission surface) + depth cap.
  const subSrc = fs.readFileSync(path.join(ROOT, 'dist', 'agent', 'subagents.js'), 'utf8');
  const sharesDeps = /childDeps\s*=\s*\{\s*\.\.\.deps/.test(subSrc);
  const depthCap = /exceeds maxDepth/.test(subSrc);
  if (!sharesDeps) findings.push({ severity: 'FAIL', id: 'P8-SUBAGENT-ESCAPES-POLICY', detail: 'subagents do not derive from parent deps — child could carry a different (weaker) permission plane' });
  if (!depthCap) findings.push({ severity: 'ADV', id: 'P8-NO-DEPTH-CAP', detail: 'no fail-closed depth cap text marker in runSubagents' });

  const verdict = findings.some((f) => f.severity === 'FAIL') ? 'FAIL' : (findings.length > 0 ? 'ADVISORY' : 'PASS');
  finish('p8-agent-isolation', {
    probe: 'p8-agent-isolation',
    verdict,
    summary: `permission decisions: ${checks.filter((c) => c.ok).length}/${checks.length} as expected; loop enforcement ${wired ? 'wired' : 'DISCONNECTED'}; subagent policy inheritance ${sharesDeps ? 'present' : 'ABSENT'}, depth cap ${depthCap ? 'present' : 'absent'}`,
    findings,
    meta: { checks, loopWired: wired, subagentSharesDeps: sharesDeps, depthCap },
  });
};

main();
