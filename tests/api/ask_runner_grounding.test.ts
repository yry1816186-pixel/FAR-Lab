/**
 * tests/api/ask_runner_grounding.test.ts — Phase 4b opt-in grounded mode.
 *
 * Two invariants:
 *   1. WITH grounding (replay adapter built from the recorded OpenAlex fixture)
 *      → the run produces a GroundingReport (corpus snapshotId/rootHash/docCount
 *      + counter-evidence strategies + perQueryCounts) attached to the result.
 *   2. WITHOUT grounding (default) → result.grounding is undefined; the loop is
 *      byte-identical to before (zero-regression for the existing agent_loop).
 *
 * Hermetic: the grounding uses an injected REPLAY adapter (no network). The CLI's
 * live-adapter path is the same code with a real adapter.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { executeAskRun } from '../../src/api/internal/ask_runner.ts';
import { runMigrations } from '../../src/db/index.ts';
import { createOfflineReplayAdapter } from '../../src/llm_gateway/adapters/offline_replay/client.ts';
import {
  createReplayAdapter,
  parseOpenAlexResults,
} from '../../src/retrieval/index.ts';
import type { LlmGateway } from '../../src/llm_gateway/gateway.ts';
import type { LlmRequest, LlmResponse } from '../../src/llm_gateway/types.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_BODY = readFileSync(join(__dirname, '..', 'fixtures', 'retrieval', 'openalex_osc_query.json'), 'utf8');
const FIXTURE_DOCS = parseOpenAlexResults(FIXTURE_BODY, 'estimating reproducibility psychological science', '2026-08-12T00:00:00.000Z', 3);

const GIT_SHA = 'a'.repeat(40);
const QUESTION = 'estimating reproducibility psychological science';

function openDb(): Database.Database {
  const db = new Database(':memory:');
  runMigrations(db);
  db.pragma('foreign_keys = ON');
  return db;
}

function defaultGateway(): LlmGateway {
  const adapter = createOfflineReplayAdapter();
  return {
    register: () => {},
    callLlm: async (_profile: string, request: LlmRequest): Promise<LlmResponse> => adapter.call(request),
    registeredProfiles: () => ['offline_replay'],
  };
}

test('Phase 4b: WITH --ground → result carries a GroundingReport (corpus + counter-evidence)', async () => {
  const db = openDb();
  try {
    const result = await executeAskRun(
      db,
      QUESTION,
      'quick',
      GIT_SHA,
      undefined,
      undefined,
      defaultGateway(),
      undefined,
      undefined,
      undefined,
      'offline_replay',
      // grounding opts — inject a REPLAY adapter so the test is hermetic (no network)
      { question: QUESTION, source: 'openalex', maxPerQuery: 3, adapter: createReplayAdapter('openalex', 'OpenAlex', FIXTURE_DOCS) },
    );
    assert.ok(result.grounding, 'grounded run MUST attach a GroundingReport');
    const g = result.grounding;
    assert.equal(g.supportingQuery, QUESTION);
    assert.equal(g.fetchMode, 'replay', 'injected adapter → replay mode');
    assert.equal(g.counterEvidenceStrategies.length, 5, '5 counter-evidence strategies issued (§16)');
    assert.equal(g.perQueryCounts.length, 6, '1 supporting + 5 counter-evidence queries');
    assert.ok(g.documentCount > 0, 'corpus must contain the retrieved documents');
    assert.match(g.corpusSnapshotId, /^[0-9a-f]{64}$/, 'snapshotId is a sha256');
    assert.match(g.corpusRootHash, /^[0-9a-f]{64}$/, 'rootHash is a sha256');
    assert.ok(g.groundedAt.length > 0);
  } finally {
    db.close();
  }
});

test('Phase 4b: WITHOUT grounding (default) → result.grounding is undefined (zero-regression)', async () => {
  const db = openDb();
  try {
    const result = await executeAskRun(
      db,
      QUESTION,
      'quick',
      GIT_SHA,
      undefined,
      undefined,
      defaultGateway(),
      undefined,
      undefined,
      undefined,
      'offline_replay',
      undefined, // no grounding → default path
    );
    assert.equal(result.grounding, undefined, 'default run must NOT attach a grounding report');
    // The loop itself still runs identically.
    assert.ok(result.runId.length > 0);
    assert.ok(result.loopState.iterationsCompleted >= 1);
  } finally {
    db.close();
  }
});

test('Phase 4b: grounded mode is fail-closed — a retrieval error rejects the run', async () => {
  const db = openDb();
  try {
    const failingGrounding = {
      question: QUESTION,
      source: 'openalex' as const,
      maxPerQuery: 2,
      adapter: { source: 'openalex' as const, sourceName: 'OpenAlex', async retrieve() { throw new Error('network down'); } },
    };
    await assert.rejects(
      () => executeAskRun(db, QUESTION, 'quick', GIT_SHA, undefined, undefined, defaultGateway(), undefined, undefined, undefined, 'offline_replay', failingGrounding),
      /network down/,
    );
  } finally {
    db.close();
  }
});
