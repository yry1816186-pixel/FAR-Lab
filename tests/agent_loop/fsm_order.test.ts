/**
 * agent_loop FSM 顺序 + STAGE_TO_PURPOSE_TAG 覆盖测试。
 *
 * 历史溯源（已归档）: FAR_CHAIN_DEV_SPEC/06_agent_loop.md §2 表 + §3.1 STAGE_ORDER.
 *
 * 测试覆盖：
 *   1. STAGE_ORDER = stage1→stage2→stage3→stage4→stage5→stage6（6 阶段主链·stage0_dialogue 不在主链）
 *   2. STAGE_TO_PURPOSE_TAG 覆盖全部 7 个 StageId（含 stage0_dialogue）
 *   3. purpose_tag 命中 PURPOSE_TAGS 9 值之一（API-1 SSOT·02 §6.6.1）
 *   4. stage3_hypothesis → purpose_tag='hypothesis'（falsifiability_gate 通道）
 *   5. stage0_dialogue → purpose_tag='dialogue'（dialogue layer 通道·eval-ring 互斥）
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  STAGE_ORDER,
  STAGE_TO_PURPOSE_TAG,
} from '../../src/agent_loop/index.ts';
import {
  PURPOSE_TAGS,
} from '../../src/schema/enums.ts';


test('STAGE_ORDER 严格六阶段顺序（不含 stage0_dialogue）', () => {
  assert.deepEqual(
    [...STAGE_ORDER],
    [
      'stage1_understanding',
      'stage2_integration',
      'stage3_hypothesis',
      'stage4_evidence',
      'stage5_plan',
      'stage6_feedback',
    ],
  );
  // stage0_dialogue 是前置旁路·不在主链 STAGE_ORDER 内
  assert.equal(
    (STAGE_ORDER as readonly string[]).includes('stage0_dialogue'),
    false,
    'stage0_dialogue 应不在 STAGE_ORDER 主链内（前置旁路）',
  );
});


test('STAGE_TO_PURPOSE_TAG 覆盖全部 7 个 StageId', () => {
  // StageId union = STAGE_ORDER 6 值 + stage0_dialogue = 7 值
  const expectedStageIds = [
    'stage0_dialogue',
    'stage1_understanding',
    'stage2_integration',
    'stage3_hypothesis',
    'stage4_evidence',
    'stage5_plan',
    'stage6_feedback',
  ];
  const actualStageIds = Object.keys(STAGE_TO_PURPOSE_TAG).sort();
  assert.deepEqual(actualStageIds, [...expectedStageIds].sort());
});


test('STAGE_TO_PURPOSE_TAG 值全部命中 PURPOSE_TAGS 9 值之一', () => {
  for (const [stageId, purposeTag] of Object.entries(STAGE_TO_PURPOSE_TAG)) {
    assert.equal(
      (PURPOSE_TAGS as readonly string[]).includes(purposeTag),
      true,
      `stageId=${stageId} 的 purposeTag="${purposeTag}" 不在 PURPOSE_TAGS 9 值内（API-1 SSOT 违规）`,
    );
  }
});


test('stage3_hypothesis → purpose_tag=hypothesis（falsifiability_gate 通道）', () => {
  assert.equal(STAGE_TO_PURPOSE_TAG.stage3_hypothesis, 'hypothesis');
});


test('stage0_dialogue → purpose_tag=dialogue（dialogue layer 通道·eval-ring 互斥）', () => {
  assert.equal(STAGE_TO_PURPOSE_TAG.stage0_dialogue, 'dialogue');
});


test('主链 6 阶段（stage1-stage6）purpose_tag 不为 dialogue（eval-ring 互斥铁律）', () => {
  // dialogue 通道仅 stage0_dialogue 用·主链 6 阶段禁用（防 eval-ring 串扰）
  for (const stageId of STAGE_ORDER) {
    const tag = STAGE_TO_PURPOSE_TAG[stageId];
    assert.notEqual(tag, 'dialogue', `主链 stageId=${stageId} 不应用 purpose_tag=dialogue`);
  }
});
