#!/usr/bin/env node
/**
 * Anchored insertion patch for src/persistence/store.ts — registers the
 * protocol object kinds (converge/protocol-execution branch). Fail-loud:
 * every anchor must occur EXACTLY once, otherwise exit 1 without writing.
 * Idempotent: skips when the kinds are already registered.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'src/persistence/store.ts';
let src = readFileSync(PATH, 'utf8');

if (src.includes('  protocol: ProtocolSpec,')) {
  console.log('[surgery] store.ts already carries protocol kinds — nothing to do');
  process.exit(0);
}

const edits = [
  {
    anchor: '  ScreeningSession,\n  ScreeningDecision,\n',
    insertion: '  ProtocolSpec, ProtocolExecution,\n',
    where: 'domain import block',
  },
  {
    anchor: '  plan: ResearchPlan,\n',
    insertion: '  protocol: ProtocolSpec,\n  protocol_execution: ProtocolExecution,\n',
    where: 'KIND_SCHEMAS map',
  },
];

for (const e of edits) {
  const count = src.split(e.anchor).length - 1;
  if (count !== 1) {
    console.error(`[surgery] anchor in ${e.where} not unique (found ${count}): ${JSON.stringify(e.anchor)}`);
    process.exit(1);
  }
  src = src.replace(e.anchor, e.anchor + e.insertion);
}

writeFileSync(PATH, src);
console.log('[surgery] store.ts patched: protocol + protocol_execution registered in KIND_SCHEMAS');
