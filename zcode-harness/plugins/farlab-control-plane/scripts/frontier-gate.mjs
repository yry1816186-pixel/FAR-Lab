#!/usr/bin/env node
import { summarizeWorkspace, compactGateReason } from '../lib/control.mjs';

const cwd = process.argv[2] || process.cwd();
const summary = summarizeWorkspace(cwd, { requireFrontier: true });
if (summary.missionReady) {
  console.log('FRONTIER_READY');
  console.log('Acceptance floor, independent audit, frontier dimensions, opportunity saturation and marginal-value conditions are evidence-ready.');
  process.exit(0);
}
console.log('NOT_READY');
console.log(compactGateReason(summary, { requireFrontier: true }));
process.exit(1);
