/**
 * anti_theater_attack_corpus —— CI gate 1（APPENDIX_E §6）：21 golden vector 参数化命中校验。
 *
 * Authority: FAR_LAB_MASTER_PLAN/APPENDIX_E_ANTI_THEATER.md §5.1（AttackCase）+ §5.2（17 P0 golden vectors 表）+
 *            §6（CI gate 1：attack corpus·每向量须命中目标 detector + 期望 reasonCode/forcedVerdict/blockSeal）+
 *            06_ROADMAP_AND_DOD.md §5.3（W3 DOD：攻击可重复 / 误报率=0）。
 *
 * 本 gate 消费 tests/fixtures/anti_theater/golden_vectors.ts 的 ALL_GOLDEN_VECTORS（21 向量·覆盖全部
 * 20 attackId）。每个向量 = 干净 base envelope（过全部 20 detector·误报率=0）经单点 mutation 攻击。
 * 断言四元组：(attackKind 命中) + (reasonCode 进 reasonCodes 并集) + (forcedVerdict 匹配) + (blockSeal 匹配)。
 *
 * 设计（GV-D3）：expectedForcedVerdict/expectedBlockSeald 由 src/anti_theater/constraint.ts（支持度降级模型
 * D17 + D16 REFUTED 揭示）确定，已由临时探针（已删）对 21 向量实测回填，与 APPENDIX_E §5.2 设计表逐字对齐。
 *
 * 模型中立。零容忍合规：无 any / @ts-ignore / 双重断言 / 桩。
 */

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { runAntiTheaterLint } from '../../src/anti_theater/lint.ts';
import { ATTACK_ID_TO_KIND } from '../../src/anti_theater/types.ts';
import { ALL_GOLDEN_VECTORS } from '../fixtures/anti_theater/golden_vectors.ts';

test('CI gate 1 · anti-theater attack corpus: each golden vector triggers its target detector', async (t) => {
  for (const gv of ALL_GOLDEN_VECTORS) {
    await t.test(`${gv.id} → ${gv.attackId} / ${gv.reasonCode} (forced=${gv.expectedForcedVerdict ?? '-'}, block=${gv.expectedBlockSeal})`, () => {
      const report = runAntiTheaterLint(gv.build());

      // 1. 目标 attackKind 命中（ATTACK_ID_TO_KIND 投影 attackId → 存储型 attackKind enum）。
      const expectedKind = ATTACK_ID_TO_KIND[gv.attackId];
      const kindHit = report.findings.some((f) => f.attackKind === expectedKind);
      assert.ok(
        kindHit,
        `${gv.id}: expected attackKind '${expectedKind}' (${gv.attackId}) in findings, got [${report.findings.map((f) => f.attackKind).join(', ')}]`,
      );

      // 2. 期望 reasonCode 进入 verdictConstraint.reasonCodes 去重并集（透明披露）。
      const reasonCodes = report.verdictConstraint?.reasonCodes ?? [];
      assert.ok(
        reasonCodes.includes(gv.reasonCode),
        `${gv.id}: expected reasonCode '${gv.reasonCode}' in reasonCodes, got [${reasonCodes.join(', ')}]`,
      );

      // 3. forcedVerdict 精确匹配（支持度降级·D17/D16·undefined=anti-theater 不约束 verdict）。
      assert.deepEqual(
        report.verdictConstraint?.forcedVerdict,
        gv.expectedForcedVerdict,
        `${gv.id}: forcedVerdict mismatch`,
      );

      // 4. blockSeal 精确匹配（BLOCK 类 attack=true·拒绝 seal）。
      assert.equal(
        report.verdictConstraint?.blockSeal,
        gv.expectedBlockSeal,
        `${gv.id}: blockSeal mismatch`,
      );
    });
  }
});

test('CI gate 1 · corpus 覆盖全部 20 attackId（无 detector 漏覆盖）', () => {
  const coveredAttackIds = new Set(ALL_GOLDEN_VECTORS.map((gv) => gv.attackId));
  const allAttackIds = new Set(Object.keys(ATTACK_ID_TO_KIND));
  const missing = [...allAttackIds].filter((id) => !coveredAttackIds.has(id));
  assert.deepEqual(missing, [], `corpus 未覆盖的 attackId（detector 漏测试）: [${missing.join(', ')}]`);
});
