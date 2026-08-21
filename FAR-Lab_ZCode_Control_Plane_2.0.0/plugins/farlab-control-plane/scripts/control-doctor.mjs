#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { summarizeWorkspace } from '../lib/control.mjs';

const cwd = process.argv[2] || process.cwd();
const required = [
  '.control/EXECUTION_STATE.json',
  '.control/ACCEPTANCE_STATUS.json',
  '.control/BLOCKERS.json'
];
const optional = [
  '.control/DECISIONS.jsonl',
  '.control/DELEGATION_LEDGER.json',
  '.control/FRONTIER_STATUS.json',
  '.control/CONTROL_PROTOCOL.json'
];
const missingRequired = required.filter(rel => !fs.existsSync(path.join(cwd, rel)));
const missingOptional = optional.filter(rel => !fs.existsSync(path.join(cwd, rel)));
const summary = summarizeWorkspace(cwd, { requireFrontier: true });
const parseErrors = [
  ...summary.acceptance.errors.filter(x => x.includes('malformed')),
  ...summary.blockers.errors,
  ...summary.problems.errors,
  ...summary.frontier.errors.filter(x => x.includes('malformed')),
  ...summary.protocol.errors
];

console.log(`FAR-Lab control doctor @ ${cwd}`);
console.log(`protocol=${summary.protocol.version ?? 'legacy/unspecified'} compatibility=${summary.protocol.compatibility}`);
console.log(`acceptanceFloorReady=${summary.acceptanceFloorReady}`);
console.log(`frontierReady=${summary.frontier.ready}`);
if (missingRequired.length) console.log(`missing required: ${missingRequired.join(', ')}`);
if (missingOptional.length) console.log(`missing optional: ${missingOptional.join(', ')}`);
if (parseErrors.length) console.log(`parse errors: ${parseErrors.join(' | ')}`);
if (summary.protocol.compatibility === 'newer_unverified') console.log('warning: workspace control protocol is newer than this plugin; use best-effort parsing and require project-native gate verification.');

if (missingRequired.length || parseErrors.length) process.exit(1);
process.exit(0);
