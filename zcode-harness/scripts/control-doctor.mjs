import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];
const warnings = [];
const load = rel => {
  try { return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8')); }
  catch (e) { errors.push(`${rel}:${e.message}`); return null; }
};

const state = load('.control/EXECUTION_STATE.json');
const acceptance = load('.control/ACCEPTANCE_STATUS.json');
const blockers = load('.control/BLOCKERS.json');

if (state) {
  if (!state.status) errors.push('state.status missing');
  if (!state.currentObjective) errors.push('state.currentObjective missing');
  if (!state.nextAction && !['COMPLETE', 'BLOCKED_EXTERNAL'].includes(String(state.status))) errors.push('state.nextAction missing while mission incomplete');
  if (!Array.isArray(state.criticalProblemSet)) warnings.push('state.criticalProblemSet is not an array');
}

const vocab = new Set(['not_started','implemented','integrated','tested','live_verified','blocked','failed']);
if (acceptance) {
  if (!Array.isArray(acceptance.items)) errors.push('acceptance.items must be array');
  else {
    const ids = new Set();
    for (const x of acceptance.items) {
      if (!x.id || !x.target || !x.status || !Array.isArray(x.evidence)) errors.push(`invalid acceptance item:${JSON.stringify(x).slice(0,180)}`);
      if (ids.has(x.id)) errors.push(`duplicate acceptance id:${x.id}`); else ids.add(x.id);
      if (!vocab.has(x.status)) errors.push(`invalid acceptance status:${x.id}:${x.status}`);
      if (!vocab.has(x.target)) errors.push(`invalid acceptance target:${x.id}:${x.target}`);
      if (['integrated','tested','live_verified'].includes(x.status) && x.evidence.length === 0) errors.push(`acceptance evidence missing:${x.id}`);
    }
  }
  if (!Array.isArray(acceptance.gates)) errors.push('acceptance.gates must be array');
}

if (blockers) {
  if (!Array.isArray(blockers.items)) errors.push('blockers.items must be array');
  else {
    const ids = new Set();
    for (const b of blockers.items) {
      if (!b.id || !b.status || !b.reason) errors.push(`invalid blocker:${JSON.stringify(b).slice(0,180)}`);
      if (ids.has(b.id)) errors.push(`duplicate blocker id:${b.id}`); else ids.add(b.id);
    }
    if (state?.blockerIds) for (const id of state.blockerIds) if (!ids.has(id)) errors.push(`state references missing blocker:${id}`);
  }
}

const decisions = path.join(root, '.control/DECISIONS.jsonl');
if (!fs.existsSync(decisions)) errors.push('.control/DECISIONS.jsonl missing');
else {
  const seen = new Set();
  for (const [i, line] of fs.readFileSync(decisions, 'utf8').split('\n').entries()) {
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line);
      if (!d.id || !d.decision || !d.problem || !d.choice) errors.push(`invalid decision line:${i + 1}`);
      if (seen.has(d.id)) errors.push(`duplicate decision id:${d.id}`); else seen.add(d.id);
    } catch (e) { errors.push(`invalid decision jsonl line:${i + 1}:${e.message}`); }
  }
}

console.log(JSON.stringify({status: errors.length ? 'FAILED' : 'PASS', warnings, errors}, null, 2));
process.exit(errors.length ? 1 : 0);
