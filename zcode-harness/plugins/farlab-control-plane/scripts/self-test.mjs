#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
let passed = 0;
let failed = 0;

function assert(condition, name, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`PASS ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL ${name}${detail ? ` :: ${detail}` : ''}`);
  }
}

function run(rel, input = {}, args = [], opts = {}) {
  const result = spawnSync(process.execPath, [path.join(root, rel), ...args], {
    input: `${JSON.stringify(input)}\n`,
    encoding: 'utf8',
    env: { ...process.env, ...(opts.env || {}) },
    cwd: opts.cwd || root
  });
  let json = null;
  try { json = JSON.parse((result.stdout || '').trim() || '{}'); } catch {}
  return { ...result, json };
}

function writeJson(base, rel, value) {
  const file = path.join(base, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeWorkspace({ ready = false, frontierReady = false, missionActive = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-cp-'));
  writeJson(dir, '.control/EXECUTION_STATE.json', {
    status: missionActive ? 'ACTIVE' : 'PAUSED',
    mission: { active: missionActive, status: missionActive ? 'ACTIVE' : 'PAUSED' },
    criticalProblemSet: ready ? [] : [{ id: 'P0-core', priority: 'P0', status: 'ACTIVE' }],
    nextAction: ready ? 'Run frontier audit.' : 'Repair real core path.'
  });
  writeJson(dir, '.control/BLOCKERS.json', { items: [] });
  writeJson(dir, '.control/ACCEPTANCE_STATUS.json', {
    items: [
      {
        id: 'A1',
        critical: true,
        target: 'live_verified',
        status: ready ? 'live_verified' : 'implemented',
        evidence: ready ? ['real-path:test:exit0'] : []
      }
    ],
    gates: [{ id: 'build', required: true, status: ready ? 'pass' : 'failed' }]
  });
  const dimensions = ['scientific', 'engineering', 'performance', 'product', 'architecture', 'evaluation', 'innovation', 'ecosystem', 'reproducibility'].map(id => ({
    id,
    required: true,
    target: 'verified',
    status: frontierReady ? 'verified' : 'not_started',
    evidence: frontierReady ? [`${id}:evidence`] : []
  }));
  writeJson(dir, '.control/FRONTIER_STATUS.json', {
    dimensions,
    independentAudit: { status: frontierReady ? 'verified' : 'not_started', evidence: frontierReady ? ['audit:accepted'] : [] },
    opportunitySweep: { status: frontierReady ? 'verified' : 'not_started', decisionSaturation: frontierReady, highValueOpportunities: [], evidence: frontierReady ? ['sweep:queries'] : [] },
    marginalValue: { status: frontierReady ? 'saturated' : 'not_started', remainingHighValueWork: [], reason: frontierReady ? 'No material executable in-scope work remains after sweep.' : '', evidence: frontierReady ? ['marginal:value:review'] : [] }
  });
  return dir;
}

const doctor = spawnSync(process.execPath, [path.join(root, 'scripts/plugin-doctor.mjs')], { encoding: 'utf8' });
assert(doctor.status === 0, 'plugin doctor', doctor.stdout + doctor.stderr);

let r = run('hooks/destructive-guard.mjs', { hook_event_name: 'PreToolUse', cwd: root, tool_input: { command: 'rm -rf /' } });
assert(r.json?.hookSpecificOutput?.permissionDecision === 'deny', 'deny catastrophic rm -rf /', r.stdout);

r = run('hooks/destructive-guard.mjs', { hook_event_name: 'PreToolUse', cwd: root, tool_input: { command: 'git reset --hard HEAD' } });
assert(r.json?.hookSpecificOutput?.permissionDecision === 'ask', 'ask before git reset --hard', r.stdout);

r = run('hooks/destructive-guard.mjs', { hook_event_name: 'PreToolUse', cwd: root, tool_input: { command: 'npm test' } });
assert(r.json && !r.json.hookSpecificOutput, 'allow ordinary command', r.stdout);

r = run('hooks/destructive-guard.mjs', { hook_event_name: 'PreToolUse', cwd: root, tool_input: { command: 'Remove-Item node_modules -Recurse -Force' } });
assert(r.json && !r.json.hookSpecificOutput, 'allow targeted PowerShell cleanup', r.stdout);

const failureData = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-fail-'));
r = run('hooks/failure-discipline.mjs', { hook_event_name: 'PostToolUseFailure', session_id: 's1', tool_name: 'Bash', error: 'Authorization: Bearer secret123 api_key=supersecret failed' }, [], { env: { ZCODE_PLUGIN_DATA: failureData } });
assert(!String(r.stdout).includes('secret123') && !String(r.stdout).includes('supersecret'), 'failure hook redacts secrets', r.stdout);
r = run('hooks/failure-discipline.mjs', { hook_event_name: 'PostToolUseFailure', session_id: 's1', tool_name: 'Bash', error: 'Authorization: Bearer secret123 api_key=supersecret failed' }, [], { env: { ZCODE_PLUGIN_DATA: failureData } });
assert(String(r.json?.hookSpecificOutput?.additionalContext || '').includes('occurred 2 times'), 'failure hook detects repeated fingerprint', r.stdout);

const notReady = makeWorkspace({ ready: false, frontierReady: false, missionActive: true });
r = run('hooks/session-context.mjs', { hook_event_name: 'SessionStart', cwd: notReady }, ['true']);
assert(String(r.json?.hookSpecificOutput?.additionalContext || '').includes('acceptanceFloorReady=false'), 'session context reports truthful gate state', r.stdout);

r = run('hooks/stop-guard.mjs', { hook_event_name: 'Stop', cwd: notReady, last_assistant_message: 'The mission is complete.' }, ['completion_claims', 'true']);
assert(r.json?.decision === 'block', 'stop guard blocks premature completion claim', r.stdout);

r = run('hooks/stop-guard.mjs', { hook_event_name: 'Stop', cwd: notReady, last_assistant_message: 'Here is the requested bounded status explanation.' }, ['completion_claims', 'true']);
assert(!r.json?.decision, 'completion-claim mode does not hijack bounded stop', r.stdout);

r = run('hooks/stop-guard.mjs', { hook_event_name: 'Stop', cwd: notReady, last_assistant_message: 'Checkpoint reached; remaining work exists.' }, ['mission_strict', 'true']);
assert(r.json?.decision === 'block', 'mission-strict guard continues explicit active mission', r.stdout);

const paused = makeWorkspace({ ready: false, frontierReady: false, missionActive: false });
r = run('hooks/stop-guard.mjs', { hook_event_name: 'Stop', cwd: paused, last_assistant_message: 'Checkpoint reached; remaining work exists.' }, ['mission_strict', 'true']);
assert(!r.json?.decision, 'stop guard allows explicitly paused mission', r.stdout);

const overrideOff = makeWorkspace({ ready: false, frontierReady: false, missionActive: true });
const overrideStatePath = path.join(overrideOff, '.control/EXECUTION_STATE.json');
const overrideState = JSON.parse(fs.readFileSync(overrideStatePath, 'utf8'));
overrideState.stopGuard = 'off';
fs.writeFileSync(overrideStatePath, `${JSON.stringify(overrideState, null, 2)}\n`, 'utf8');
r = run('hooks/stop-guard.mjs', { hook_event_name: 'Stop', cwd: overrideOff, last_assistant_message: 'The mission is complete.' }, ['mission_strict', 'true']);
assert(!r.json?.decision, 'workspace state can explicitly disable stop guard', r.stdout);

const acceptanceReady = makeWorkspace({ ready: true, frontierReady: false, missionActive: true });
let gate = spawnSync(process.execPath, [path.join(root, 'scripts/completion-gate.mjs'), acceptanceReady], { encoding: 'utf8' });
assert(gate.status === 0 && gate.stdout.includes('ACCEPTANCE_READY'), 'acceptance gate separates floor from mission', gate.stdout + gate.stderr);
gate = spawnSync(process.execPath, [path.join(root, 'scripts/frontier-gate.mjs'), acceptanceReady], { encoding: 'utf8' });
assert(gate.status === 1 && gate.stdout.includes('NOT_READY'), 'frontier gate rejects acceptance-only completion', gate.stdout + gate.stderr);

const allReady = makeWorkspace({ ready: true, frontierReady: true, missionActive: true });
gate = spawnSync(process.execPath, [path.join(root, 'scripts/frontier-gate.mjs'), allReady], { encoding: 'utf8' });
assert(gate.status === 0 && gate.stdout.includes('FRONTIER_READY'), 'frontier gate passes evidence-ready mission', gate.stdout + gate.stderr);
r = run('hooks/stop-guard.mjs', { hook_event_name: 'Stop', cwd: allReady, last_assistant_message: 'The mission is complete.' }, ['mission_strict', 'true']);
assert(!r.json?.decision, 'stop guard allows frontier-ready mission completion', r.stdout);

console.log(`SELF_TEST_RESULT passed=${passed} failed=${failed}`);
if (failed) process.exit(1);
