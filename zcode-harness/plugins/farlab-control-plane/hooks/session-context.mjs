import fs from 'node:fs';
import path from 'node:path';

let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try { input = JSON.parse(raw || '{}'); } catch {}

const cwd = input.cwd || process.cwd();
const readJson = rel => {
  try { return JSON.parse(fs.readFileSync(path.join(cwd, rel), 'utf8')); }
  catch { return null; }
};

const state = readJson('.control/EXECUTION_STATE.json');
const blockers = readJson('.control/BLOCKERS.json');
const acceptance = readJson('.control/ACCEPTANCE_STATUS.json');

const openBlockers = Array.isArray(blockers?.items)
  ? blockers.items.filter(x => !['RESOLVED', 'CLOSED'].includes(String(x.status || '').toUpperCase())).map(x => x.id)
  : [];
const pendingCritical = Array.isArray(acceptance?.items)
  ? acceptance.items.filter(x => x.critical && x.status !== x.target).length
  : 'unknown';
const constructionActive = !['workspace-handoff', 'workspace-preflight', 'workspace-audit'].includes(String(state?.phase || '').toLowerCase())
  && !String(state?.status || '').startsWith('READY_FOR_ZCODE_RUNTIME_VERIFICATION');
const criticalProblems = Array.isArray(state?.criticalProblemSet)
  ? state.criticalProblemSet.filter(x => !['COMPLETED', 'RESOLVED', 'CLOSED'].includes(String(x.status || '').toUpperCase())).slice(0, 3).map(x => x.id)
  : [];

let context = 'FAR-Lab bootstrap: root AGENTS.md + repository/runtime reality are authoritative; do not preload all policies or cold research. ';
if (!state) {
  context += 'No readable .control/EXECUTION_STATE.json; reconstruct truthful compact state before long-horizon work.';
} else {
  context += `status=${state.status ?? 'UNKNOWN'}; phase=${state.phase ?? 'UNKNOWN'}; `;
  if (constructionActive) context += `pendingCriticalAcceptance=${pendingCritical}; `;
  if (criticalProblems.length) context += `criticalProblems=${criticalProblems.join(',')}; `;
  if (openBlockers.length) context += `openBlockers=${openBlockers.join(',')}; `;
  if (state.nextAction) context += `nextAction=${String(state.nextAction).slice(0, 900)}; `;
  context += 'Reconcile persisted state with the actual workspace/Git/ZCode session before relying on it. Never self-certify completion.';
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: input.hook_event_name || 'SessionStart',
    additionalContext: context.slice(0, 1800)
  }
}));
