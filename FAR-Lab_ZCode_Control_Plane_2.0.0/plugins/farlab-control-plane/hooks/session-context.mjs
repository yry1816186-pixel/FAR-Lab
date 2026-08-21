import { summarizeWorkspace, readJsonDetailed } from '../lib/control.mjs';

let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try { input = JSON.parse(raw || '{}'); } catch {}

const cwd = input.cwd || process.cwd();
const state = readJsonDetailed(cwd, '.control/EXECUTION_STATE.json').value || {};
let requireFrontier = !['false', '0', 'no', 'off'].includes(String(process.argv[2] ?? 'true').toLowerCase());
if (state?.completionPolicy?.frontierRequired === false || state?.mission?.frontierRequired === false) requireFrontier = false;
const summary = summarizeWorkspace(cwd, { requireFrontier });
const a = summary.acceptance;
const b = summary.blockers;
const p = summary.problems;
const f = summary.frontier;

let context = 'FAR-Lab control-plane bootstrap: root AGENTS.md, canonical project-spec and observed repository/runtime evidence outrank plugin guidance. The plugin is an execution control layer, not a second product specification. ';
context += `controlProtocol=${summary.protocol.version ?? 'legacy/unspecified'}(${summary.protocol.compatibility}); `;
context += `acceptanceFloorReady=${summary.acceptanceFloorReady}; criticalAcceptance=${a.criticalItems}; `;
if (a.incomplete.length) context += `acceptanceIncomplete=${a.incomplete.slice(0, 5).join(',')}; `;
if (a.missingEvidence.length) context += `acceptanceEvidenceMissing=${a.missingEvidence.slice(0, 5).join(',')}; `;
if (b.criticalOpen.length) context += `criticalBlockers=${b.criticalOpen.slice(0, 5).join(',')}; `;
if (p.p0p1.length) context += `P0P1=${p.p0p1.slice(0, 5).join(',')}; `;
if (requireFrontier && f) {
  context += `frontierReady=${f.ready}; `;
  if (f.incompleteDimensions.length) context += `frontierIncomplete=${f.incompleteDimensions.slice(0, 5).join(',')}; `;
  if (!f.independentAuditReady) context += 'independentAudit=pending; ';
  if (!f.opportunitySweepReady) context += 'frontierSweep=pending; ';
}
if (p.nextAction) context += `nextAction=${String(p.nextAction).slice(0, 650)}; `;
if (summary.protocol.compatibility === 'newer_unverified') context += 'Workspace control protocol is newer than this plugin: use project-native gates as authority and treat plugin parsing as best-effort. ';
context += 'Reconcile persisted state with actual Git/workspace/runtime before relying on it. Do not self-certify completion. Use useful subagent parallelism when independent work exists; keep architecture/integration authority in the main Agent.';

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: input.hook_event_name || 'SessionStart',
    additionalContext: context.slice(0, 2600)
  }
}));
