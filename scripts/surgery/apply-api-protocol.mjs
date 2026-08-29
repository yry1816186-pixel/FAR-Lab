#!/usr/bin/env node
/**
 * Anchored insertion patch for src/server/api.ts — mounts the protocol plane
 * (convergence 2026-08-29): GET /runs/:id/protocol + POST /runs/:id/protocol/records
 * delegated to protocol-ops. Fail-loud unique anchors; idempotent re-runs.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const PATH = 'src/server/api.ts';
let src = readFileSync(PATH, 'utf8');

if (src.includes("segments[4] === 'protocol'")) {
  console.log('[surgery:api] protocol routes already mounted — nothing to do');
  process.exit(0);
}

const importAnchor = "import { runResearchAction, ActionError } from './actions.js';\n";
const importInsertion = "import { getProtocolState, recordProtocolEvent, ProtocolOpError } from './protocol-ops.js';\n";

const routeAnchor = [
  "      if (segments.length === 5 && segments[4] === 'truth' && method === 'GET') {",
  '        // Execution-truth projection (goal §5.5): deterministic receipt-derived',
  '        // view of HOW this run executed (live / mixed / synthetic / recorded_replay),',
  '        // incl. retrieval cache/replay composition. Read-only; receipts stay authoritative.',
  '        mustGetRun(runId);',
  '        sendJson(res, 200, runTruthProfile(app.store, runId));',
  '        return;',
  '      }',
  '',
].join('\n');
const routeInsertion = [
  "      if (segments.length === 5 && segments[4] === 'protocol' && method === 'GET') {",
  '        // Protocol plane (convergence 2026-08-29): the frozen preregistration +',
  '        // human-attested ledger for the plan\'s real-world legs (bench/field/human/',
  '        // engineering/archive/theory). Read-only projection; the deterministic',
  '        // state machine lives in protocol-ops/domain — never in the router.',
  '        mustGetRun(runId);',
  '        try {',
  '          sendJson(res, 200, getProtocolState(app, runId));',
  '          return;',
  '        } catch (e) {',
  '          if (e instanceof ProtocolOpError) {',
  '            throw new HttpError(e.status, {',
  "              code: e.code === 'state_conflict' ? 'validation' : e.code,",
  '              message: e.message,',
  '              retryable: false,',
  "              ...(e.code === 'not_found' ? { runId } : {}),",
  '            });',
  '          }',
  '          throw e;',
  '        }',
  '      }',
  "      if (segments.length === 6 && segments[4] === 'protocol' && segments[5] === 'records' && method === 'POST') {",
  '        // One human-attested protocol record: step start/complete, measurement,',
  '        // deviation, approval, block/unblock, abort. Deterministic validation',
  '        // (ethics gate, dependency order, typing, QC); completion publishes the',
  '        // outcome as an experiment FeedbackSignal exactly once.',
  '        mustGetRun(runId);',
  '        const body = await readJsonObject(req);',
  '        try {',
  '          sendJson(res, 200, recordProtocolEvent(app, runId, body));',
  '          return;',
  '        } catch (e) {',
  '          if (e instanceof ProtocolOpError) {',
  '            throw new HttpError(e.status, {',
  "              code: e.code === 'state_conflict' ? 'validation' : e.code,",
  '              message: e.message,',
  '              retryable: false,',
  "              ...(e.code === 'not_found' ? { runId } : {}),",
  '            });',
  '          }',
  '          throw e;',
  '        }',
  '      }',
  '',
].join('\n');

const edits = [
  { anchor: importAnchor, insertion: importInsertion, where: 'actions import line' },
  { anchor: routeAnchor, insertion: routeInsertion, where: 'truth route block' },
];

for (const e of edits) {
  const count = src.split(e.anchor).length - 1;
  if (count !== 1) {
    console.error(`[surgery:api] anchor in ${e.where} not unique (found ${count}): ${JSON.stringify(e.anchor.slice(0, 120))}`);
    process.exit(1);
  }
  src = src.replace(e.anchor, e.anchor + e.insertion);
}

writeFileSync(PATH, src);
console.log('[surgery:api] protocol routes mounted: GET /runs/:id/protocol + POST /runs/:id/protocol/records');
