/**
 * compaction.test.ts —— agent_loop 上下文压缩（批次 2-E·借鉴 opencode session compact）。
 *
 * 覆盖：
 *   1. stage3/stage4 裁决关键产物完整保留（永不压缩）。
 *   2. stage1/2/5/6 长文本字段截断 + hash 锚可溯源；短文本不扰动。
 *   3. 纯函数：不 mutate 原数组（原 artifacts 字节不变）。
 *   4. StageArtifact 结构保留（stageId/payloadKind/callResult/structured.kind 不变）——
 *      stage 执行器 findPrev* 判别收窄不受影响。
 *   5. estimateArtifactsBytes 压缩前后体积估算递减。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactArtifacts, estimateArtifactsBytes } from '../../src/agent_loop/compaction.ts';
import type { StageArtifact } from '../../src/agent_loop/types.ts';

const LONG = 'x'.repeat(2000);

function artifact(stageId: StageArtifact['stageId'], structured: StageArtifact['structured']): StageArtifact {
  return {
    stageId,
    payloadKind: stageId === 'stage3_hypothesis' || stageId === 'stage4_evidence' ? 'hypothesis' : 'meta',
    structured,
    callResult: {
      credential: {
        providerProfile: 'offline_replay',
        providerRequestId: null,
        modelId: 'offline',
        modelVersion: null,
        capability: 'structured',
        isoTimestamp: '2026-01-01T00:00:00.000Z',
        tokenUsage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      },
      content: 'reply',
      raw: { replayed: true },
    },
    degraded: false,
    degradationReason: null,
  };
}

function understandingArtifact(long: string): StageArtifact {
  return artifact('stage1_understanding', {
    kind: 'understanding',
    problemStatement: long,
    scope: 'short scope',
    keyTerms: ['a', 'b'],
    falsifiableAngle: long,
  });
}

function integrationArtifact(): StageArtifact {
  return artifact('stage2_integration', {
    kind: 'integration',
    citations: [
      { evidenceId: 'ev-1', source: 'arxiv', doi: '10.1', title: LONG },
    ],
    knowledgeGraphSummary: LONG,
    gaps: ['g1'],
  });
}

function hypothesisArtifact(): StageArtifact {
  return artifact('stage3_hypothesis', {
    kind: 'hypothesis',
    claim: 'H: X causes Y',
    falsificationMethod: {
      prediction: 'Y increases',
      metric: 'delta',
      comparator: 'gt',
      value: 0.5,
    },
    supportingCitations: ['ev-1'],
    scopeSlipText: 'none',
  });
}

function evidenceArtifact(): StageArtifact {
  return artifact('stage4_evidence', {
    kind: 'evidence',
    evidenceRecords: [
      { evidenceId: 'ev-1', supportsOrRefutes: 'supports', entailmentScore: 0.9, source: { evidenceId: 'ev-1', source: 'arxiv', doi: '10.1', title: 't' } },
    ],
    conflictingEvidenceCount: 0,
  });
}

function planArtifact(): StageArtifact {
  return artifact('stage5_plan', {
    kind: 'plan',
    datasetChoices: ['d1'],
    methodChoices: ['m1'],
    scheduleOrFeedback: LONG,
    executableChecks: [],
  });
}

function feedbackArtifact(): StageArtifact {
  return artifact('stage6_feedback', {
    kind: 'feedback',
    feedbackSignal: { continueIteration: true, iterationNumber: 1, maxIterations: 3, refinements: ['more evidence'] },
    iterationSummary: LONG,
  });
}

function fullRound(): readonly StageArtifact[] {
  return [
    understandingArtifact(LONG),
    integrationArtifact(),
    hypothesisArtifact(),
    evidenceArtifact(),
    planArtifact(),
    feedbackArtifact(),
  ];
}

test('stage3/stage4 verdict-critical artifacts are preserved verbatim', () => {
  const out = compactArtifacts(fullRound(), { maxChars: 50, compactThresholdChars: 10 });
  const h = out.find((a) => a.stageId === 'stage3_hypothesis');
  const e = out.find((a) => a.stageId === 'stage4_evidence');
  assert.ok(h && e);
  assert.equal(h.structured.kind === 'hypothesis' ? h.structured.claim : '', 'H: X causes Y');
  const hyp = h.structured;
  if (hyp.kind === 'hypothesis') {
    assert.equal(hyp.claim, 'H: X causes Y', 'hypothesis claim must be verbatim');
    assert.equal(hyp.falsificationMethod.value, 0.5);
  }
  const ev = e.structured;
  if (ev.kind === 'evidence') {
    assert.equal(ev.evidenceRecords.length, 1);
    assert.equal(ev.conflictingEvidenceCount, 0);
  }
});

test('narrative fields are clipped with hash anchor; short fields untouched', () => {
  const out = compactArtifacts(fullRound(), { maxChars: 50, compactThresholdChars: 50 });
  const u = out.find((a) => a.stageId === 'stage1_understanding');
  assert.ok(u);
  const us = u.structured;
  if (us.kind === 'understanding') {
    assert.ok(us.problemStatement.length < 100, 'long problemStatement must be clipped');
    assert.match(us.problemStatement, /\[compact:[0-9a-f]{12}\]/);
    assert.equal(us.scope, 'short scope', 'short scope untouched');
    assert.deepEqual(us.keyTerms, ['a', 'b']);
  }
  const i = out.find((a) => a.stageId === 'stage2_integration');
  assert.ok(i);
  const is = i.structured;
  if (is.kind === 'integration') {
    assert.match(is.knowledgeGraphSummary, /\[compact:/);
    assert.ok(is.citations[0]!.title.length < 100);
    assert.match(is.citations[0]!.title, /\[compact:/);
  }
});

test('default options: long fields clipped at 800, short fields kept', () => {
  const out = compactArtifacts([understandingArtifact('y'.repeat(1200))]);
  const u = out[0]!.structured;
  if (u.kind === 'understanding') {
    assert.ok(u.problemStatement.length <= 800 + 60, 'default maxChars=800 respected');
    assert.match(u.problemStatement, /\[compact:/);
  }
});

test('pure function: input artifacts are not mutated', () => {
  const input = fullRound();
  const snapshot = JSON.stringify(input);
  compactArtifacts(input, { maxChars: 20, compactThresholdChars: 5 });
  assert.equal(JSON.stringify(input), snapshot, 'input must be unchanged');
});

test('structure preserved: stageId/payloadKind/callResult/kind survive compaction', () => {
  const input = fullRound();
  const out = compactArtifacts(input, { maxChars: 20, compactThresholdChars: 5 });
  assert.equal(out.length, input.length);
  for (let idx = 0; idx < input.length; idx++) {
    assert.equal(out[idx]!.stageId, input[idx]!.stageId);
    assert.equal(out[idx]!.payloadKind, input[idx]!.payloadKind);
    assert.equal(out[idx]!.callResult, input[idx]!.callResult, 'callResult preserved by reference');
    assert.equal(out[idx]!.structured.kind, input[idx]!.structured.kind, 'discriminant preserved');
  }
});

test('estimateArtifactsBytes decreases after compaction', () => {
  const input = fullRound();
  const before = estimateArtifactsBytes(input);
  const out = compactArtifacts(input, { maxChars: 50, compactThresholdChars: 10 });
  const after = estimateArtifactsBytes(out);
  assert.ok(after < before, `compact should shrink bytes (${after} < ${before})`);
});

test('feedbackSignal survives compaction (stage6 [6]->[3] feedback dependency)', () => {
  const out = compactArtifacts([feedbackArtifact()], { maxChars: 20, compactThresholdChars: 5 });
  const f = out[0]!.structured;
  if (f.kind === 'feedback') {
    assert.deepEqual(f.feedbackSignal, {
      continueIteration: true,
      iterationNumber: 1,
      maxIterations: 3,
      refinements: ['more evidence'],
    });
    assert.match(f.iterationSummary, /\[compact:/);
  }
});
