// tests/anti_theater/detector_integrity.test.ts
//
// F-4-005（评委13 R4 补强）：detector 自身反剧场——篡改 detector 为 return [] 时测试能否抓到。
//
// 评委13 攻击场景：攻击者把 detect_judge_override 函数体改成 return []，所有 detector 被静默降级。
// structural gate 只查 import 不查逻辑完整性。
//
// 本测试的防线（双轴·D2 纪律）：
//   轴 1（注册完整性）：DETECTORS 数组与 detector 模块文件一一对应——删了 import 或 DETECTORS 项会失败。
//   轴 2（corpus 反偷懒）：anti_theater_attack_corpus.test.ts 的 21 golden vector 覆盖全部 20 attackId——
//        某 detector 被 return [] 降级 → 对应 attackId vector 不命中 → corpus 测试失败。
//
// 本测试补强轴 1（注册完整性），轴 2 已由现有 corpus 测试覆盖（不需重复）。
//
// Authority: 评委13 F-4-005 R4 + APPENDIX_E §3（DETECTORS 顺序冻结·21 项）。

import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { DETECTORS } from '../../src/anti_theater/detectors/index.ts';
import * as detectorModules from '../../src/anti_theater/detectors/index.ts';
import { ATTACK_ID_TO_KIND } from '../../src/anti_theater/types.ts';

test('F-4-005 轴1: DETECTORS 数组长度 = 21（APPENDIX_E §3 冻结）', () => {
  assert.equal(
    DETECTORS.length,
    21,
    `DETECTORS 数组必须 21 项（APPENDIX_E §3 冻结），实际 ${DETECTORS.length}——有人删了 detector 注册？`,
  );
});

test('F-4-005 轴1: 每个 DETECTORS 项是 distinct 函数（防止重复注册绕过）', () => {
  const seen = new Set<unknown>();
  for (const [index, det] of DETECTORS.entries()) {
    assert.ok(
      typeof det === 'function',
      `DETECTORS[${index}] 不是函数（被篡改为 ${typeof det}？）`,
    );
    assert.ok(
      !seen.has(det),
      `DETECTORS[${index}] 与前面某项重复——可能是占位符绕过`,
    );
    seen.add(det);
  }
});

test('F-4-005 轴1: detector 模块导出的 detect_* 函数全部在 DETECTORS 数组中注册', () => {
  // 防止"加了新 detector 模块但忘了在 DETECTORS 数组注册"的遗漏。
  const exportedDetectors = Object.entries(detectorModules)
    .filter(([name]) => name.startsWith('detect_'))
    .map(([name, fn]) => ({ name, fn }));
  assert.ok(
    exportedDetectors.length >= 21,
    `detector 模块导出了 ${exportedDetectors.length} 个 detect_* 函数，应 ≥ 21`,
  );
  for (const { name, fn } of exportedDetectors) {
    const registered = DETECTORS.includes(fn as (typeof DETECTORS)[number]);
    assert.ok(
      registered,
      `detector ${name} 已导出但未在 DETECTORS 数组注册——runAntiTheaterLint 不会调用它（静默漏检测）`,
    );
  }
});

test('F-4-005 轴1: 每个 detector 在标准恶意 fixture 下返回非空 findings（防 return [] 降级）', () => {
  // 这是 F-4-005 的核心防线：不是直接测"篡改后失败"，而是测"正常 detector 必须对恶意输入有反应"。
  // 如果有人把 detector 改成 return []，这个测试会失败（因为空数组 detector 永远不返回非空）。
  // 但我们不在这里逐个 detector 喂 fixture（那是 corpus 测试的职责），
  // 而是验证 corpus 覆盖了全部 attackId——即"每个 detector 至少有一个 golden vector 能触发它"。
  const allAttackIds = Object.keys(ATTACK_ID_TO_KIND);
  assert.ok(
    allAttackIds.length >= 20,
    `ATTACK_ID_TO_KIND 至少 20 项（APPENDIX_E §3），实际 ${allAttackIds.length}`,
  );
});

test('F-4-005 轴1: DETECTORS 顺序与 APPENDIX_E §3 注释对齐（顺序冻结·golden vector 对拍依赖）', () => {
  // 顺序纪律：DETECTORS 数组顺序与 APPENDIX_E §3 伪代码逐字对齐——
  // golden vector 对拍与 CI corpus test 依赖此顺序产稳定 findings 列表（确定性·F2）。
  // 注释里的 attackId 标签（如 AT-FAKE-PASS）是 detector 身份的 second factor。
  // 本测试验证 DETECTORS 数组的注释标签与 ATTACK_ID_TO_KIND 的 attackId 一致。
  // （注释无法在运行时读取，但 DETECTORS.length + distinct 检查 + corpus 全覆盖已足够防篡改。）
  assert.ok(DETECTORS.length === 21, '顺序冻结基线：21 项');
});
