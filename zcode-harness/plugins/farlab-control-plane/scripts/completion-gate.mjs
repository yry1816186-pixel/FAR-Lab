#!/usr/bin/env node
import { summarizeWorkspace, compactGateReason } from '../lib/control.mjs';

const cwd = process.argv[2] || process.cwd();
const summary = summarizeWorkspace(cwd, { requireFrontier: false });
if (summary.acceptanceFloorReady) {
  console.log('ACCEPTANCE_READY');
  console.log(`criticalItems=${summary.acceptance.criticalItems}; openCriticalBlockers=0; openP0P1=0`);
  console.log('This is the acceptance floor, not mission-level frontier completion.');
  process.exit(0);
}
console.log('NOT_READY');
console.log(compactGateReason(summary, { requireFrontier: false }));
process.exit(1);
