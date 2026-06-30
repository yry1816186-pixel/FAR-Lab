import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  HUMAN_CHECKPOINT_KINDS,
  HUMAN_ROLES,
  SOURCE_CARD_EVIDENCE_LEVELS,
  SOURCE_CARD_SOURCE_TYPES,
  SOURCE_CARD_STABILITY,
  SOURCE_CARD_USED_FOR,
  W1_REQUIRED_HUMAN_CHECKPOINT_KINDS,
  sourceCardNeedsVerifiedFact,
} from '../../src/audit/index.ts';
import {
  AGENT_RUN_EVENT_KINDS,
  TRACE_FAILURE_CODES,
} from '../../src/trace/agent_run_event.ts';
import type { SourceCard } from '../../src/audit/index.ts';

test('SourceCard constants match the W1 contract', () => {
  assert.deepEqual(SOURCE_CARD_SOURCE_TYPES, [
    'official_doc',
    'paper',
    'github_repo',
    'dataset',
    'news',
    'benchmark',
    'other',
  ]);
  assert.deepEqual(SOURCE_CARD_EVIDENCE_LEVELS, ['primary', 'secondary', 'tertiary']);
  assert.deepEqual(SOURCE_CARD_STABILITY, ['stable', 'versioned', 'time_sensitive']);
  assert.deepEqual(SOURCE_CARD_USED_FOR, [
    'design_benchmark',
    'api_contract',
    'scientific_evidence',
    'scoring_context',
  ]);
});

test('SourceCard helper marks SSOT-sensitive uses as requiring verified facts', () => {
  const baseCard: SourceCard = {
    sourceId: 'SC-TEST-001',
    url: 'https://example.invalid/spec',
    title: 'Spec source',
    sourceType: 'official_doc',
    publisher: 'Example',
    fetchedAt: '2026-06-27T00:00:00.000Z',
    claim: 'The example endpoint returns HTTP 200 for a valid request.',
    evidenceLevel: 'primary',
    stability: 'versioned',
    usedFor: 'api_contract',
  };

  assert.equal(sourceCardNeedsVerifiedFact(baseCard), true);
  assert.equal(sourceCardNeedsVerifiedFact({ ...baseCard, usedFor: 'scientific_evidence' }), false);
});

test('HumanCheckpoint constants include required HITL kinds', () => {
  assert.ok(HUMAN_CHECKPOINT_KINDS.includes('secret_configured'));
  assert.ok(HUMAN_CHECKPOINT_KINDS.includes('model_snapshot_migration'));
  assert.ok(HUMAN_CHECKPOINT_KINDS.includes('verdict_confirmed_review'));
  assert.deepEqual(HUMAN_ROLES, ['computer', 'liberal_arts', 'design', 'team']);
  assert.ok(W1_REQUIRED_HUMAN_CHECKPOINT_KINDS.includes('source_set_accepted'));
});

test('AgentRunEvent and TraceGrade draft constants cover W1.5 hooks', () => {
  assert.ok(AGENT_RUN_EVENT_KINDS.includes('guardrail_blocked'));
  assert.ok(AGENT_RUN_EVENT_KINDS.includes('human_checkpoint_recorded'));
  assert.ok(AGENT_RUN_EVENT_KINDS.includes('verdict_written'));
  assert.ok(AGENT_RUN_EVENT_KINDS.includes('dialogue_turn_completed'));
  assert.ok(TRACE_FAILURE_CODES.includes('provider_boundary_leak'));
  assert.ok(TRACE_FAILURE_CODES.includes('over_confirmed'));
});
