/**
 * fork_types.test.ts —— M-07 分叉数据结构单元测试。
 *
 * 历史溯源（已归档）: （Forkable replay / counterfactual verdict）。
 *
 * 覆盖：
 *   - AgentRunFork 创建与验证
 *   - VerdictDelta 计算与 verdictChanged 逻辑
 *   - ReplayBranchMetadata 创建与初始状态
 *   - ForkReason 穷举校验
 *   - 边界条件：空 ID、未知 forkReason
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FORK_REASONS,
  createFork,
  computeVerdictDelta,
  createReplayBranch,
} from '../../src/trace/fork_types.ts';
import { VERDICTS } from '../../src/schema/enums.ts';

test('M-07 createFork: produces valid AgentRunFork with all fields', () => {
  const fork = createFork({
    forkId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    baseRunId: '01ARZ3NDEKTSV4RRFFQ69G5FAW',
    baseEventId: '01ARZ3NDEKTSV4RRFFQ69G5FAX',
    forkReason: 'threshold_changed',
    mutation: { threshold: { semantics: 'gt', value: 0.95 } },
    createdByRole: 'builder',
    isoTimestamp: '2026-06-27T00:00:00.000Z',
  });

  assert.equal(fork.forkId, '01ARZ3NDEKTSV4RRFFQ69G5FAV');
  assert.equal(fork.baseRunId, '01ARZ3NDEKTSV4RRFFQ69G5FAW');
  assert.equal(fork.baseEventId, '01ARZ3NDEKTSV4RRFFQ69G5FAX');
  assert.equal(fork.forkReason, 'threshold_changed');
  assert.deepEqual(fork.mutation, { threshold: { semantics: 'gt', value: 0.95 } });
  assert.equal(fork.createdByRole, 'builder');
  assert.equal(fork.isoTimestamp, '2026-06-27T00:00:00.000Z');
});

test('M-07 createFork: validates all six fork reasons', () => {
  for (const reason of FORK_REASONS) {
    const fork = createFork({
      forkId: `fork-${reason}`,
      baseRunId: 'run-base',
      baseEventId: 'evt-base',
      forkReason: reason,
      mutation: {},
      createdByRole: 'verifier_redteam',
      isoTimestamp: '2026-06-27T00:00:00.000Z',
    });
    assert.equal(fork.forkReason, reason);
  }
});

test('M-07 createFork: rejects empty forkId', () => {
  assert.throws(
    () =>
      createFork({
        forkId: '',
        baseRunId: 'run-base',
        baseEventId: 'evt-base',
        forkReason: 'human_review',
        mutation: {},
        createdByRole: 'builder',
        isoTimestamp: '2026-06-27T00:00:00.000Z',
      }),
    /forkId must be non-empty/,
  );
});

test('M-07 createFork: rejects empty baseRunId', () => {
  assert.throws(
    () =>
      createFork({
        forkId: 'fork-1',
        baseRunId: '',
        baseEventId: 'evt-base',
        forkReason: 'human_review',
        mutation: {},
        createdByRole: 'builder',
        isoTimestamp: '2026-06-27T00:00:00.000Z',
      }),
    /baseRunId must be non-empty/,
  );
});

test('M-07 createFork: rejects unknown forkReason', () => {
  // 绕过 TS 编译期检查以测试运行时校验：使用 string 变量赋值给 forkReason
  const badReason = 'not_a_reason' as string;
  assert.throws(
    () =>
      createFork({
        forkId: 'fork-1',
        baseRunId: 'run-base',
        baseEventId: 'evt-base',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- runtime validation test
        forkReason: badReason as (typeof FORK_REASONS)[number],
        mutation: {},
        createdByRole: 'builder',
        isoTimestamp: '2026-06-27T00:00:00.000Z',
      }),
    /unknown forkReason/,
  );
});

test('M-07 createFork: rejects empty createdByRole', () => {
  assert.throws(
    () =>
      createFork({
        forkId: 'fork-1',
        baseRunId: 'run-base',
        baseEventId: 'evt-base',
        forkReason: 'source_set_changed',
        mutation: {},
        createdByRole: '',
        isoTimestamp: '2026-06-27T00:00:00.000Z',
      }),
    /createdByRole must be non-empty/,
  );
});

test('M-07 computeVerdictDelta: detects verdict change from CONFIRMED to INCONCLUSIVE', () => {
  const delta = computeVerdictDelta({
    baseVerdictId: 'v-base',
    forkVerdictId: 'v-fork',
    baseVerdict: 'CONFIRMED',
    forkVerdict: 'INCONCLUSIVE',
    explanation: 'stricter threshold reduced evidence support below significance',
  });

  assert.equal(delta.baseVerdictId, 'v-base');
  assert.equal(delta.forkVerdictId, 'v-fork');
  assert.equal(delta.verdictChanged, true);
  assert.equal(delta.from, 'CONFIRMED');
  assert.equal(delta.to, 'INCONCLUSIVE');
  assert.ok(delta.explanation.length > 0);
});

test('M-07 computeVerdictDelta: verdictChanged=false when same verdict', () => {
  const delta = computeVerdictDelta({
    baseVerdictId: 'v-base',
    forkVerdictId: 'v-fork',
    baseVerdict: 'REFUTED',
    forkVerdict: 'REFUTED',
    explanation: 'same evidence leads to same refutation regardless of source set change',
  });

  assert.equal(delta.verdictChanged, false);
  assert.equal(delta.from, 'REFUTED');
  assert.equal(delta.to, 'REFUTED');
});

test('M-07 computeVerdictDelta: covers all five verdict values', () => {
  for (const baseVerdict of VERDICTS) {
    for (const forkVerdict of VERDICTS) {
      const delta = computeVerdictDelta({
        baseVerdictId: `v-base-${baseVerdict}`,
        forkVerdictId: `v-fork-${forkVerdict}`,
        baseVerdict,
        forkVerdict,
        explanation: `comparing ${baseVerdict} -> ${forkVerdict}`,
      });

      assert.equal(delta.from, baseVerdict);
      assert.equal(delta.to, forkVerdict);
      assert.equal(delta.verdictChanged, baseVerdict !== forkVerdict);
      assert.ok(delta.explanation.length > 0);
    }
  }
});

test('M-07 computeVerdictDelta: rejects empty explanation', () => {
  assert.throws(
    () =>
      computeVerdictDelta({
        baseVerdictId: 'v-base',
        forkVerdictId: 'v-fork',
        baseVerdict: 'CONFIRMED',
        forkVerdict: 'REFUTED',
        explanation: '',
      }),
    /explanation must be non-empty/,
  );
});

test('M-07 createReplayBranch: produces valid ReplayBranchMetadata with initial state', () => {
  const branch = createReplayBranch({
    branchId: '01ARZ3NDEKTSV4RRFFQ69G5FB0',
    forkId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
    parentBranchId: null,
    branchLabel: 'tighter-threshold-replay',
    checkpointKind: 'verdict_written',
    isoTimestamp: '2026-06-27T00:00:00.000Z',
  });

  assert.equal(branch.branchId, '01ARZ3NDEKTSV4RRFFQ69G5FB0');
  assert.equal(branch.forkId, '01ARZ3NDEKTSV4RRFFQ69G5FAV');
  assert.equal(branch.parentBranchId, null);
  assert.equal(branch.branchLabel, 'tighter-threshold-replay');
  assert.equal(branch.checkpointKind, 'verdict_written');
  assert.equal(branch.replayCompleted, false, 'new branch must start with replayCompleted=false');
  assert.equal(branch.replayedRunId, null, 'new branch must start with replayedRunId=null');
});

test('M-07 createReplayBranch: supports chained branches via parentBranchId', () => {
  const root = createReplayBranch({
    branchId: 'branch-root',
    forkId: 'fork-main',
    parentBranchId: null,
    branchLabel: 'root',
    checkpointKind: 'stage_completed',
    isoTimestamp: '2026-06-27T00:00:00.000Z',
  });

  const child = createReplayBranch({
    branchId: 'branch-child',
    forkId: 'fork-child',
    parentBranchId: root.branchId,
    branchLabel: 'child',
    checkpointKind: 'replay_started',
    isoTimestamp: '2026-06-27T00:01:00.000Z',
  });

  assert.equal(child.parentBranchId, 'branch-root');
  assert.notEqual(child.branchId, root.branchId);
});

test('M-07 createReplayBranch: rejects empty branchId', () => {
  assert.throws(
    () =>
      createReplayBranch({
        branchId: '',
        forkId: 'fork-1',
        parentBranchId: null,
        branchLabel: 'test',
        checkpointKind: 'verdict_written',
        isoTimestamp: '2026-06-27T00:00:00.000Z',
      }),
    /branchId must be non-empty/,
  );
});

test('M-07 FORK_REASONS count matches spec', () => {
  assert.equal(FORK_REASONS.length, 6, 'spec §4.2 defines exactly 6 fork reasons');
  assert.deepEqual([...FORK_REASONS].sort(), [
    'baseline_ablation',
    'human_review',
    'provider_profile_changed',
    'security_attack',
    'source_set_changed',
    'threshold_changed',
  ]);
});
