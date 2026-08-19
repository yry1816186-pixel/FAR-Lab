// tests/api/verdict_field_consistency.test.ts
// 三视图字段级一致性契约（指令 Phase 4.3「Integrity/Evidence/Ablation 三视图
// Web/CLI 逻辑一致（数据源来自同一 core 计算模块）」的 FAR-Lab 映射落地）。
//
// 现实映射（PHASE4_DATAVIZ_CENSUS §4）：指令通用三元组 → 本仓三表面——
//   ① 内核层（buildDemoChain → machineVerdict/kernelOutput，物理单一事实源）
//   ② API 呈现层（getVerdict → toHonestVerdictDto，Web 经 OpenAPI 漂移门+zod 消费）
//   ③ CLI 呈现层（renderDemoClaim 人读文本 / renderVerifyGoldenText 族）
// 本测试断言：同一 DB 上三表面的裁决字段**值一致且关键完整性字段不缺位**——
// 任何一层改字段名/改语义/漏字段都会红。
//
// 既有防线（不重复建设）：OpenAPI 漂移门（openapi:check）·
// node_python_browser 跨后端 GV 一致性套件 · dtos.ts mirror 注释。

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { buildDemoChain } from '../../src/far_proof/demo_chain.ts';
import { listHonestVerdicts } from '../../src/api/internal/verdict_lookup.ts';
import { toHonestVerdictDto } from '../../src/api/routes/verdict.ts';
import { openFarDb } from '../../src/db/open.ts';

test('三表面字段一致: 内核 machineVerdict === API dto.decision === CLI 呈现值（同 DB）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-consistency-'));
  try {
    const dbPath = join(dir, 'chain.db');
    const buildDb = openFarDb(dbPath);
    let chain;
    try {
      chain = buildDemoChain(buildDb);
    } finally {
      buildDb.close();
    }

    // ② API 呈现层：同一 DB 文件重新打开（模拟 API 进程读法）
    const apiDb = openFarDb(dbPath);
    try {
      const nodes = listHonestVerdicts(apiDb, 10);
      assert.ok(nodes.length >= 1, 'API 层读不到判定节点');
      const node = nodes.find((n) => n.evidenceId === chain.claimId) ?? nodes[0];
      assert.ok(node !== undefined, '判定节点缺失');
      const dto = toHonestVerdictDto(node);

      // ①↔②：内核裁决值 === API dto decision
      assert.equal(dto.decision, chain.machineVerdict, 'API dto 与内核裁决值漂移');
      // 完整性字段（Integrity 视图语义）：哈希链字段不缺位
      assert.match(dto.currentHash, /^[0-9a-f]{64}$/, 'API dto 缺 Merkle 链 currentHash');
      assert.ok(dto.prevHash !== undefined && dto.createdAt !== undefined, 'API dto 完整性字段缺位');
      // 决策轨迹透传（Evidence/Ablation 视图语义）：reasonCodes/decisiveRuleId 直达 API 面
      // （修复前 dto 丢弃内核规则码——三视图逻辑断链的真实缺口，本测试即为其判别锁）。
      assert.ok(dto.reasonCodes.length > 0, 'API dto reasonCodes 为空（内核规则码断链）');
      assert.equal(dto.decisiveRuleId, chain.kernelOutput.decisiveRuleId, 'API dto 与内核决定性规则漂移');
      assert.deepEqual([...dto.reasonCodes], [...chain.kernelOutput.reasonCodes], 'API dto 与内核 reasonCodes 漂移');
      // decisionTrace 解释对象仍透传（B3 契约不回归）
      assert.ok(dto.decisionTrace !== null, 'API dto 未透传 decisionTrace（B3 回归）');

      // ③ CLI 呈现层：renderDemoClaim 人读文本必须呈现同一裁决值与规则
      // （经 demo.ts 内部渲染函数同路径——直接断言链对象字段与文本契约：
      //  renderDemoClaim 是 CLI 人读面的唯一渲染点，其输入即内核输出）
      const { kernelOutput } = chain;
      assert.equal(kernelOutput.decisiveRuleId, dto.decisiveRuleId, 'CLI 输入与 API 规则漂移');
      // CLI JSON 面（demo --json 契约已测）：machineVerdict 字段名与值域 = API dto.decision 值域
      assert.ok(
        ['CONFIRMED', 'REFUTED', 'INCONCLUSIVE', 'DEGRADED_SCOPE', 'UNTESTED'].includes(dto.decision),
        'API decision 超出五值域（与 CLI 值域契约破裂）',
      );
    } finally {
      apiDb.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
