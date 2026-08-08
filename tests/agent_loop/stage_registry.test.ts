/**
 * P0-3 可插拔 stage 注册表测试（2026-08-07 落地）。
 *
 * 覆盖：
 *   1. 默认注册表 6 阶段·order 1..6 顺序完整·payloadKind/关键性/反馈消费正确；
 *   2. getStage / listStages（order 升序）/ getStageOrder 查询；
 *   3. registerStage 覆写默认阶段（校验通过）→ 查询更新；
 *   4. registerStage 添加扩展阶段（order > 6 并行分支）→ 列表含新阶段；
 *   5. 非法输入 fail-closed：order 越界 / 重复 order / 依赖序破坏（stage3≤stage2·stage4≤stage3）；
 *   6. deregisterStage：默认阶段拒删·扩展阶段可删；
 *   7. 纯元数据不参与裁决：注册表与 fsm_runner 顺序执行语义解耦（防回归快照）。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_STAGE_REGISTRY,
  getStage,
  listStages,
  getStageOrder,
  registerStage,
  deregisterStage,
  resetStageRegistry,
  validateStageOrder,
  type StageDescriptor,
  type StageId,
} from '../../src/agent_loop/stage_registry.ts';

const STAGE_IDS = [
  'stage1_understanding',
  'stage2_integration',
  'stage3_hypothesis',
  'stage4_evidence',
  'stage5_plan',
  'stage6_feedback',
] as const;

test('stage_registry: 默认注册表 6 阶段·顺序 1..6 完整·关键阶段标记正确', () => {
  assert.equal(DEFAULT_STAGE_REGISTRY.length, 6);
  for (let i = 0; i < 6; i++) {
    const stage = DEFAULT_STAGE_REGISTRY[i];
    assert.ok(stage !== undefined);
    assert.equal(stage.order, i + 1, `${stage.stageId} order 须为 ${i + 1}`);
    assert.equal(stage.stageId, STAGE_IDS[i]);
  }
  // 关键性：stage2/3/4/6 裁决关键·stage1/5 非关键
  assert.equal(getStage('stage2_integration')?.verdictCritical, true);
  assert.equal(getStage('stage3_hypothesis')?.verdictCritical, true);
  assert.equal(getStage('stage4_evidence')?.verdictCritical, true);
  assert.equal(getStage('stage6_feedback')?.verdictCritical, true);
  assert.equal(getStage('stage1_understanding')?.verdictCritical, false);
  assert.equal(getStage('stage5_plan')?.verdictCritical, false);
  // 反馈信号消费：仅 stage3
  assert.equal(getStage('stage3_hypothesis')?.consumesFeedbackSignal, true);
  assert.equal(getStage('stage1_understanding')?.consumesFeedbackSignal, false);
});

test('stage_registry: getStage 未注册返回 undefined·listStages 按 order 升序·getStageOrder 顺序正确', () => {
  assert.equal(getStage('not_a_stage' as StageId), undefined);
  const listed = listStages();
  assert.deepEqual(
    listed.map((s) => s.order),
    [1, 2, 3, 4, 5, 6],
  );
  assert.deepEqual(getStageOrder(), [...STAGE_IDS]);
});

test('stage_registry: registerStage 覆写默认阶段生效（校验通过·快照更新）', () => {
  try {
    const custom: StageDescriptor = {
      stageId: 'stage4_evidence',
      order: 4,
      label: 'Evidence (custom probe)',
      payloadKind: 'experiment',
      consumesFeedbackSignal: false,
      verdictCritical: true,
      skippable: false,
      description: '自定义证据阶段（演示运行时覆写）。',
    };
    const snapshot = registerStage(custom);
    assert.equal(snapshot.length, 6, '覆写不改变总数');
    assert.equal(getStage('stage4_evidence')?.label, 'Evidence (custom probe)');
    assert.equal(getStage('stage4_evidence')?.description, '自定义证据阶段（演示运行时覆写）。');
  } finally {
    resetStageRegistry();
  }
});

test('stage_registry: registerStage 添加扩展阶段（order > 6 并行分支·总列表含新阶段）', () => {
  try {
    const extra: StageDescriptor = {
      stageId: 'stage7_audit' as StageId,
      order: 7,
      label: 'Audit probe',
      payloadKind: 'meta',
      consumesFeedbackSignal: false,
      verdictCritical: false,
      skippable: true,
      description: '扩展审计探测阶段（并行分支·不参与裁决输入）。',
    };
    registerStage(extra);
    assert.equal(listStages().length, 7, '添加扩展阶段后列表为 7');
    assert.equal(getStage('stage7_audit' as StageId)?.skippable, true);
  } finally {
    resetStageRegistry();
  }
});

test('stage_registry: 非法输入 fail-closed——order 越界 / 重复 order / 依赖序破坏', () => {
  const base = (overrides: Partial<StageDescriptor>): StageDescriptor => ({
    stageId: 'stage4_evidence',
    order: 4,
    label: 'Evidence',
    payloadKind: 'experiment',
    consumesFeedbackSignal: false,
    verdictCritical: true,
    skippable: false,
    description: 'd',
    ...overrides,
  });

  assert.throws(() => registerStage(base({ order: 0 })), /order must be a positive integer/);
  assert.throws(() => registerStage(base({ order: 1.5 })), /order must be a positive integer/);
  // 重复 order：新 stageId 占用已被主链占用的 order → 抛
  assert.throws(() => registerStage(base({ stageId: 'stage7_audit' as StageId, order: 4 })), /duplicate order 4/);
  // 依赖序：stage3 ≤ stage2（交换 stage2/stage3 的 order）→ 抛
  // 注：主链 1..6 全被占用，单次 registerStage 覆写改序必先触发 duplicate order，
  // 因此依赖序不变量用 validateStageOrder 直测构造数组。
  assert.throws(
    () =>
      validateStageOrder(
        DEFAULT_STAGE_REGISTRY.map((s) => ({
          ...s,
          order:
            s.stageId === 'stage2_integration' ? 3 : s.stageId === 'stage3_hypothesis' ? 2 : s.order,
        })),
      ),
    /stage3 must run after stage2/,
  );
  // 依赖序：stage4 ≤ stage3（交换 stage3/stage4 的 order）→ 抛
  assert.throws(
    () =>
      validateStageOrder(
        DEFAULT_STAGE_REGISTRY.map((s) => ({
          ...s,
          order:
            s.stageId === 'stage3_hypothesis' ? 4 : s.stageId === 'stage4_evidence' ? 3 : s.order,
        })),
      ),
    /stage4 must run after stage3/,
  );
  // 缺 order：全部 1..6 必须存在
  assert.throws(() => validateStageOrder(DEFAULT_STAGE_REGISTRY.slice(0, 5)), /missing order 6/);
});

test('stage_registry: deregisterStage 默认阶段拒删·扩展阶段可删', () => {
  try {
    assert.equal(deregisterStage('stage1_understanding'), false, '默认阶段不可注销');
    assert.equal(getStage('stage1_understanding') !== undefined, true, '默认阶段仍在');
    registerStage({
      stageId: 'stage9_probe' as StageId,
      order: 7,
      label: 'Probe',
      payloadKind: 'meta',
      consumesFeedbackSignal: false,
      verdictCritical: false,
      skippable: true,
      description: 'd',
    });
    assert.equal(deregisterStage('stage9_probe' as StageId), true, '扩展阶段可注销');
    assert.equal(getStage('stage9_probe' as StageId), undefined);
  } finally {
    resetStageRegistry();
  }
});

test('stage_registry: 纯元数据层·不触碰裁决核（回归快照：默认注册表与 fsm 阶段序严格一致）', () => {
  // 该测试作为防回归锚：若未来改动意外打乱默认顺序将在此失败。
  assert.deepEqual(getStageOrder(), [...STAGE_IDS]);
  // 每个阶段都有描述（非空·文档化完整性）
  for (const stage of DEFAULT_STAGE_REGISTRY) {
    assert.ok(stage.description.trim().length > 0, `${stage.stageId} description 非空`);
  }
});
