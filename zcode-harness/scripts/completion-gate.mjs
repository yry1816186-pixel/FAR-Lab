// Anti-Fake-Completion Gate for the FAR-Lab construction phase.
// Reads .control/ACCEPTANCE_STATUS.json (+ .control/BLOCKERS.json) and verifies:
//   - every non-optional item reached its target status (or beyond);
//   - no item stuck in blocked/failed terminal state;
//   - items at integrated/tested/live_verified carry non-empty evidence;
//   - every gate question is satisfied with evidence;
//   - no critical blocker remains OPEN.
// VERIFIED_READY => exit 0. NOT_READY => exit 1 (do not declare completion).
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const readJson = rel => {
  try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }
  catch (e) { return { __error: e.message }; }
};

const gate = readJson('.control/ACCEPTANCE_STATUS.json');
const blockers = readJson('.control/BLOCKERS.json');
const missing = [];
const failed = [];
const errors = [];

if (gate.__error) errors.push(`unreadable:ACCEPTANCE_STATUS.json:${gate.__error}`);
if (blockers.__error) errors.push(`unreadable:BLOCKERS.json:${blockers.__error}`);

const ORDER = { not_started: 0, implemented: 1, integrated: 2, tested: 3, live_verified: 4 };
const TERMINAL_FAILURE = new Set(['blocked', 'failed']);
const stats = {};

if (!gate.__error && Array.isArray(gate.items)) {
  for (const it of gate.items) {
    stats[it.status] = (stats[it.status] || 0) + 1;
    if (it.optional) continue;
    if (TERMINAL_FAILURE.has(it.status)) {
      failed.push({ id: it.id, status: it.status, reason: 'terminal-failure-state' });
      continue;
    }
    const got = ORDER[it.status];
    const need = ORDER[it.target];
    if (got === undefined) { errors.push(`unknown-status:${it.id}:${it.status}`); continue; }
    if (need === undefined) { errors.push(`unknown-target:${it.id}:${it.target}`); continue; }
    if (got < need) missing.push({ id: it.id, status: it.status, target: it.target });
    if (got >= ORDER.integrated && (!Array.isArray(it.evidence) || it.evidence.length === 0)) {
      errors.push(`status-without-evidence:${it.id}`);
    }
  }
}

if (!gate.__error && Array.isArray(gate.gates)) {
  for (const g of gate.gates) {
    if (g.satisfied !== true) missing.push({ id: g.id, kind: 'gate', status: 'unsatisfied' });
    else if (!g.evidence) errors.push(`gate-without-evidence:${g.id}`);
  }
}

if (!blockers.__error && Array.isArray(blockers.items)) {
  for (const b of blockers.items) {
    if (b.critical === true && b.status === 'OPEN') failed.push({ id: b.id, status: b.status, reason: 'critical-blocker-open' });

    // Some release blockers carry a machine-checkable evidence contract.  An
    // arbitrary non-OPEN status must not be enough to launder an unresolved
    // hosted-validation gap into a green completion verdict.
    if (b.requiredEvidence !== undefined) {
      const required = b.requiredEvidence;
      if (required === null || typeof required !== 'object' || Array.isArray(required)) {
        errors.push(`invalid-blocker-required-evidence:${b.id}`);
        continue;
      }
      if (b.status !== 'OPEN') {
        const resolved = b.resolutionEvidence;
        if (resolved === null || typeof resolved !== 'object' || Array.isArray(resolved)) {
          errors.push(`resolved-blocker-without-resolution-evidence:${b.id}`);
          continue;
        }
        if (typeof required.workflow === 'string' && resolved.workflow !== required.workflow) {
          errors.push(`resolved-blocker-workflow-mismatch:${b.id}`);
        }
        if (typeof required.runner === 'string' && resolved.runner !== required.runner) {
          errors.push(`resolved-blocker-runner-mismatch:${b.id}`);
        }
        if ('runUrl' in required && (typeof resolved.runUrl !== 'string' || !/^https?:\/\/\S+$/.test(resolved.runUrl))) {
          errors.push(`resolved-blocker-run-url-missing:${b.id}`);
        }
        if ('sourceSha' in required && (typeof resolved.sourceSha !== 'string' || !/^[0-9a-f]{40}$/i.test(resolved.sourceSha))) {
          errors.push(`resolved-blocker-source-sha-missing:${b.id}`);
        }
        if ('imageId' in required && (typeof resolved.imageId !== 'string' || !/^sha256:[0-9a-f]{64}$/i.test(resolved.imageId))) {
          errors.push(`resolved-blocker-image-id-missing:${b.id}`);
        }
        if ('linuxProcAttachCleanup' in required && resolved.linuxProcAttachCleanup !== true) {
          errors.push(`resolved-blocker-linux-proc-cleanup-unproven:${b.id}`);
        }
      }
    }
  }
}

const notReady = errors.length > 0 || missing.length > 0 || failed.length > 0;
const verdict = notReady ? 'NOT_READY' : 'VERIFIED_READY';
console.log(JSON.stringify({
  verdict,
  gateFile: '.control/ACCEPTANCE_STATUS.json',
  itemStats: gate.__error ? null : stats,
  missing, failed, errors,
  message: notReady
    ? 'Do NOT declare completion: resolve the listed items with real evidence, update .control/ACCEPTANCE_STATUS.json, and re-run.'
    : 'Completion gate passed: all critical items at target status with evidence, gates satisfied, no critical blocker.',
}, null, 2));
process.exit(notReady ? 1 : 0);
