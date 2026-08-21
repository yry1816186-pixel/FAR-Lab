import { summarizeWorkspace, hasCompletionClaim, compactGateReason, normalizeStatus, readJsonDetailed } from '../lib/control.mjs';

let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try { input = JSON.parse(raw || '{}'); } catch {}

const cwd = input.cwd || process.cwd();
const state = readJsonDetailed(cwd, '.control/EXECUTION_STATE.json').value || {};
const configuredMode = normalizeStatus(state?.stopGuard ?? state?.mission?.stopGuard);
const argMode = String(process.argv[2] ?? 'mission_strict').trim().toLowerCase();
let mode = ['off', 'completion_claims', 'mission_strict'].includes(argMode) ? argMode : 'completion_claims';
if (configuredMode === 'off') mode = 'off';
if (configuredMode === 'completion_claims') mode = 'completion_claims';
if (configuredMode === 'strict' || configuredMode === 'mission_strict') mode = 'mission_strict';
let requireFrontier = !['false', '0', 'no', 'off'].includes(String(process.argv[3] ?? 'true').toLowerCase());
if (state?.completionPolicy?.frontierRequired === false || state?.mission?.frontierRequired === false) requireFrontier = false;
if (mode === 'off') {
  process.stdout.write('{}');
  process.exit(0);
}

const summary = summarizeWorkspace(cwd, { requireFrontier });
if (summary.missionReady || summary.problems.globallyPausedOrBlocked) {
  process.stdout.write('{}');
  process.exit(0);
}

const last = input.last_assistant_message ?? input.lastAssistantMessage ?? '';
const completionClaim = hasCompletionClaim(last);
const strictMission = mode === 'mission_strict' && summary.problems.missionActive;

if (!completionClaim && !strictMission) {
  process.stdout.write('{}');
  process.exit(0);
}

const reason = `FAR-Lab stop guard: mission completion is not evidence-ready. ${compactGateReason(summary, { requireFrontier })}. Continue the highest-value executable repair/verification path; if the whole mission is genuinely paused, externally blocked, waiting for required authorization, or budget-limited, persist that global state instead of fabricating completion.`;
process.stdout.write(JSON.stringify({
  decision: 'block',
  reason: reason.slice(0, 1900)
}));
