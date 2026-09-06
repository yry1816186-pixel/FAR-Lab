// Anti-Fake-Completion Gate for the FAR-Lab construction phase.
// Reads .control/ACCEPTANCE_STATUS.json (+ .control/BLOCKERS.json) and verifies:
//   - every non-optional item reached its target status (or beyond);
//   - no item stuck in blocked/failed terminal state;
//   - items at integrated/tested/live_verified carry non-empty evidence;
//   - every gate question is satisfied with evidence;
//   - every critical blocker is RESOLVED.
// Default: acceptance floor only. --final additionally requires every item in
// FINAL_ACCEPTANCE.json to pass. Neither mode proves scientific validity itself.
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
const finalMode = process.argv.includes('--final');
for (const arg of process.argv.slice(2)) if (arg !== '--final') errors.push(`unknown-argument:${arg}`);

const ORDER = { not_started: 0, implemented: 1, integrated: 2, tested: 3, live_verified: 4 };
const TERMINAL_FAILURE = new Set(['blocked', 'failed']);
const stats = {};
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonblank = value => typeof value === 'string' && value.trim().length > 0;
const hasEvidence = value => nonblank(value) || (Array.isArray(value) && value.length > 0 && value.every(nonblank));
const statusLevel = status => Object.hasOwn(ORDER, status) ? ORDER[status] : undefined;

function inventory(document, field, label, allowEmpty = false) {
  if (document?.__error) {
    errors.push(`unreadable:${label}:${document.__error}`);
    return [];
  }
  if (!isObject(document) || !Array.isArray(document[field]) || (!allowEmpty && document[field].length === 0)) {
    errors.push(`invalid-inventory:${label}`);
    return [];
  }
  const seen = new Set();
  return document[field].filter((entry, index) => {
    if (!isObject(entry) || !nonblank(entry.id)) {
      errors.push(`invalid-entry:${label}:${index}`);
      return false;
    }
    if (seen.has(entry.id)) errors.push(`duplicate-id:${label}:${entry.id}`);
    seen.add(entry.id);
    return true;
  });
}

const items = inventory(gate, 'items', 'acceptance-items');
const gates = inventory(gate, 'gates', 'acceptance-gates');
const blockerItems = inventory(blockers, 'items', 'blockers', true);

// The status ledger records evidence, not permission to delete requirements or
// lower their targets. Read IDs and minimum levels from the canonical contract.
try {
  const contract = fs.readFileSync(path.join(root, 'project-spec/ACCEPTANCE.md'), 'utf8');
  const rows = contract.split(/\r?\n/).filter(line => /^\|\s*ACC-\d+\s*\|/.test(line));
  if (rows.length === 0) errors.push('empty-canonical-contract');
  const ids = new Set();
  for (const row of rows) {
    const [, rawId, , rawTarget] = row.split('|');
    const id = rawId.trim();
    const target = rawTarget?.trim().split(/\s+/)[0];
    if (ids.has(id)) errors.push(`duplicate-canonical-id:${id}`);
    ids.add(id);
    if (statusLevel(target) === undefined) { errors.push(`invalid-canonical-target:${id}:${target}`); continue; }
    const item = items.find(it => it.id === id);
    if (!item) { errors.push(`missing-canonical-item:${id}`); continue; }
    if (item.optional === true) errors.push(`canonical-item-marked-optional:${id}`);
    if (statusLevel(item.target) < statusLevel(target)) errors.push(`target-below-contract:${id}:${item.target}:${target}`);
  }
} catch (error) {
  errors.push(`unreadable:project-spec/ACCEPTANCE.md:${error.message}`);
}

for (const it of items) {
  if (it.optional !== undefined && typeof it.optional !== 'boolean') errors.push(`invalid-optional:${it.id}`);
  if (typeof it.status !== 'string' || (!TERMINAL_FAILURE.has(it.status) && statusLevel(it.status) === undefined)) {
    errors.push(`unknown-status:${it.id}:${it.status}`);
    continue;
  }
  stats[it.status] = (stats[it.status] || 0) + 1;
  if (statusLevel(it.target) === undefined) { errors.push(`unknown-target:${it.id}:${it.target}`); continue; }
  if (it.optional === true) continue;
  if (TERMINAL_FAILURE.has(it.status)) {
    failed.push({ id: it.id, status: it.status, reason: 'terminal-failure-state' });
    continue;
  }
  const got = statusLevel(it.status);
  const need = statusLevel(it.target);
  if (got < need) missing.push({ id: it.id, status: it.status, target: it.target });
  if (got >= ORDER.integrated && (!Array.isArray(it.evidence) || !hasEvidence(it.evidence))) {
    errors.push(`status-without-evidence:${it.id}`);
  }
}

for (const g of gates) {
  if (g.satisfied !== true) missing.push({ id: g.id, kind: 'gate', status: 'unsatisfied' });
  else if (!hasEvidence(g.evidence)) errors.push(`gate-without-evidence:${g.id}`);
}

for (const b of blockerItems) {
  if (typeof b.critical !== 'boolean' || !nonblank(b.status)) errors.push(`invalid-blocker:${b.id}`);
  if (b.critical === true && b.status !== 'RESOLVED') failed.push({ id: b.id, status: b.status, reason: 'critical-blocker-unresolved' });

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

let finalItemStats = null;
if (finalMode) {
  finalItemStats = {};
  for (const item of inventory(readJson('FINAL_ACCEPTANCE.json'), 'items', 'final-acceptance')) {
    if (!['PASS', 'FAIL', 'PARTIAL', 'BLOCKED_EXTERNAL'].includes(item.status)) {
      errors.push(`unknown-final-status:${item.id}:${item.status}`);
      continue;
    }
    finalItemStats[item.status] = (finalItemStats[item.status] || 0) + 1;
    if (item.status !== 'PASS') missing.push({ id: item.id, kind: 'final-acceptance', status: item.status, target: 'PASS' });
    else if (!Array.isArray(item.evidence) || !hasEvidence(item.evidence)) errors.push(`final-pass-without-evidence:${item.id}`);
  }
}

const notReady = errors.length > 0 || missing.length > 0 || failed.length > 0;
const verdict = notReady ? 'NOT_READY' : 'VERIFIED_READY';
console.log(JSON.stringify({
  verdict,
  scope: finalMode ? 'final_mission' : 'acceptance_floor',
  gateFile: '.control/ACCEPTANCE_STATUS.json',
  itemStats: stats,
  ...(finalMode ? { finalGateFile: 'FINAL_ACCEPTANCE.json', finalItemStats } : {}),
  missing, failed, errors,
  message: notReady
    ? 'Do NOT declare completion: resolve the listed items with real evidence, update the corresponding ledger, and re-run.'
    : finalMode
      ? 'Final recorded acceptance passed. Real workflow, scientific validity and independent acceptance still require verification.'
      : 'Acceptance floor passed only; this is not final mission completion. Run with --final to include FINAL_ACCEPTANCE.json.',
}, null, 2));
process.exit(notReady ? 1 : 0);
