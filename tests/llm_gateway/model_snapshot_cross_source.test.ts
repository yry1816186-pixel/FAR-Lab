/**
 * 模型快照跨源 / 跨语言一致性测试（[E] 红线 #2 守护）。
 *
 * Authority: COMPETITION_MODEL_SNAPSHOT 不是 core-wide 常量 /
 *            03_确定性规范 §10（repro 七分量·modelId 进 repro_hash）/
 *            00_项目宪法 §8.6（TS/Python 跨语言 canonicalHash byte-equal）。
 *
 * 演进（model-neutral 修复落地）：原设计 core（agent_loop/create_params.ts）持模型 ID 副本，本测试
 *   守护 core↔adapter↔Python 三源一致性。但 core 持 Qwen 字面量违反 R9-2-14 CI 模型中立门禁
 *   （src/agent_loop 在核心扫描目录），且 core buildCreateParams 是死代码（运行时 R1 守卫已在 adapter
 *   完整实现·src/llm_gateway/adapters/aliyun_qwen/create_params.ts assertQwenModel + 路由）。故 core 删除
 *   模型 ID 常量 + R1 模型守卫下沉 adapter——core 真正 model-neutral（零模型字面量）。本测试随之退化为
 *   adapter↔Python 两源一致性（adapter 是 primary source·Python 是跨语言镜像）。
 *
 * 捕获目标：adapter（snapshot.ts）与 Python（model_snapshot.py）单边升级模型版本时，此测试 fail-fast——
 *   阻止 modelId 漂移静默破坏 00 §8.6 跨语言 canonicalHash byte-equal 红线（modelId 经 03 §10 进 repro_hash）。
 *
 * 设计依据：
 *   - adapter 是模型身份真相源（运行时 LLM 调用经 adapter·snapshot.ts primary source）。
 *   - Python model_snapshot.py 是跨语言 hash 镜像（repro 端复现 TS 的 repro_hash）。
 *   - core 不持模型 ID（模型中立红线·R9-2-14 守护）——core↔adapter 双源已随 core 删除常量而消除。
 *
 * 零容忍合规：无 any / @ts-ignore / 双重断言 / 空 catch / 桩返回。正则提取后用显式 null 收窄。
 */

import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// adapter 源（llm_gateway·模型身份真相源·snapshot.ts:1,4 + legacy alias:2）
import {
  COMPETITION_MODEL_SNAPSHOT as ADAPTER_COMPETITION,
  MODEL_SNAPSHOT as ADAPTER_MODEL_ALIAS,
  STRUCTURED_SAFE_MODEL as ADAPTER_STRUCTURED,
} from '../../src/llm_gateway/adapters/aliyun_qwen/snapshot.ts';


// ---------- adapter 内部一致性 ----------

test('[E] adapter.MODEL_SNAPSHOT === adapter.COMPETITION_MODEL_SNAPSHOT（legacy alias 完整性）', () => {
  // competition profile 兼容别名——须与主常量同值（Python model_snapshot.py 同构别名）
  assert.equal(ADAPTER_MODEL_ALIAS, ADAPTER_COMPETITION);
});

test('[E] R1 路由矩阵两分支：adapter.STRUCTURED_SAFE_MODEL !== COMPETITION_MODEL_SNAPSHOT', () => {
  // 06§2.2 R1 路由矩阵须有两个不同 modelId（structured / thinking 两分支不可坍缩）
  assert.notEqual(ADAPTER_STRUCTURED, ADAPTER_COMPETITION);
});


// ---------- TS adapter ↔ Python 跨语言一致性 ----------
//
// Python 侧（repro/far_chain_repro/model_snapshot.py:17）是 COMPETITION_MODEL_SNAPSHOT 镜像——
// test_model_snapshot.py 仅比对 Python 自身硬编码字面量，无法捕获 TS↔Python 漂移。
// 此处读 Python 源文件提取字面量，断言与 TS adapter 一致——闭环跨语言镜像。
//
// 用文件读取（非 spawn）·TS 测试运行时总可读同 repo Python 源·无环境依赖。

test('[E] 跨语言一致：Python COMPETITION_MODEL_SNAPSHOT 字面量 === TS adapter', () => {
  const pySource = readFileSync(
    new URL('../../repro/far_chain_repro/model_snapshot.py', import.meta.url),
    'utf8',
  );
  // 匹配 Python 模块级常量赋值（COMPETITION_MODEL_SNAPSHOT: str = "..."）
  const match = /^COMPETITION_MODEL_SNAPSHOT:\s*str\s*=\s*"([^"]+)"/m.exec(pySource);
  if (match === null) {
    throw new Error(
      'Python model_snapshot.py: 未找到 COMPETITION_MODEL_SNAPSHOT 字面量赋值（源格式已变？正则需更新）',
    );
  }
  // noUncheckedIndexedAccess 下 match[1] 是 string | undefined——显式收窄（禁 as 强转 / ! 非空断言）
  const pyCompetition = match[1];
  if (pyCompetition === undefined) {
    throw new Error('Python model_snapshot.py: COMPETITION_MODEL_SNAPSHOT 捕获组为空（正则匹配异常）');
  }
  assert.equal(
    pyCompetition,
    ADAPTER_COMPETITION,
    `Python COMPETITION_MODEL_SNAPSHOT="${pyCompetition}" 与 TS adapter="${ADAPTER_COMPETITION}" 漂移——破坏 00§8.6 跨语言 canonicalHash byte-equal`,
  );
});

test('[E] 跨语言一致：Python MODEL_SNAPSHOT legacy alias 字面量 === TS adapter', () => {
  const pySource = readFileSync(
    new URL('../../repro/far_chain_repro/model_snapshot.py', import.meta.url),
    'utf8',
  );
  const match = /^MODEL_SNAPSHOT:\s*str\s*=\s*COMPETITION_MODEL_SNAPSHOT/m.exec(pySource);
  if (match === null) {
    throw new Error(
      'Python model_snapshot.py: 未找到 MODEL_SNAPSHOT legacy alias 赋值（源格式已变？）',
    );
  }
  // alias 在 Python 内部已绑定 COMPETITION_MODEL_SNAPSHOT；TS 侧断言 adapter alias 等价（上方 COMPETITION 跨语言已守值）
  assert.equal(ADAPTER_MODEL_ALIAS, ADAPTER_COMPETITION);
});
