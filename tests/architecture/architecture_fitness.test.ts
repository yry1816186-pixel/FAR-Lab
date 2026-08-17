// tests/architecture/architecture_fitness.test.ts
// CORE-ARCH-001：信任边界静态强制——dependency rule / forbidden import / fitness。
// 真实依赖：buildDependencyReport 扫描真实仓库 src/ + frontend/src/ 全量 TS 文件
// （无 mock、无 fixture 代替现实）；规则判别力由合成边夹具双向验证（正负例）。

import { mkdirSync, writeFileSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  NON_DETERMINISTIC_LAYERS,
  TRUST_KERNEL_LAYERS,
  buildDependencyReport,
  classifyEdge,
  scanFileImports,
} from '../../src/architecture/dependency_rules.ts';
import type { ImportEdge } from '../../src/architecture/dependency_rules.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

// ---------------------------------------------------------------------------
// 真实树 fitness（宪法 Acceptance：dependency rule + forbidden import 通过）
// ---------------------------------------------------------------------------

test('CORE-ARCH-001: 真实仓库全量扫描零违规（R1 无 value 反向依赖 / R2 类型仅经契约文件）', () => {
  const report = buildDependencyReport(REPO_ROOT);
  assert.ok(report.kernelFileCount > 50, `kernel files scanned: ${report.kernelFileCount}`);
  assert.equal(
    report.violations.length,
    0,
    `forbidden imports:\n${report.violations.map((v) => `  [${v.code}] ${v.edge.from} → ${v.edge.to} (${v.edge.kind}): ${v.message}`).join('\n')}`,
  );
});

test('CORE-ARCH-001: 类型契约接缝被如实枚举（kernel→适配器仅 type-only 经 types.ts）', () => {
  const report = buildDependencyReport(REPO_ROOT);
  const seams = report.edges.filter((c) => c.classification === 'KERNEL_TYPE_CONTRACT');
  assert.ok(seams.length > 0, '至少存在一条 kernel→llm_gateway/types.ts 契约接缝');
  for (const s of seams) {
    assert.equal(s.edge.kind, 'type');
    const target = s.edge.to;
    assert.ok(
      NON_DETERMINISTIC_LAYERS.some((l) => target.startsWith(l)),
      `seam target must be in a non-deterministic layer: ${target}`,
    );
    const file = target.split('/').pop() ?? '';
    assert.ok(['types.ts', 'contracts.ts', 'index.ts'].includes(file), `seam must target contract file: ${target}`);
  }
});

test('CORE-ARCH-001: R3 正向依赖存在且被计数（适配器→kernel 方向活着）', () => {
  const report = buildDependencyReport(REPO_ROOT);
  assert.ok(report.outboundCount > 20, `outbound edges: ${report.outboundCount}`);
  for (const c of report.edges.filter((x) => x.classification === 'OUTBOUND_OK').slice(0, 50)) {
    assert.ok(TRUST_KERNEL_LAYERS.some((l) => c.edge.to.startsWith(l)));
    assert.ok(!TRUST_KERNEL_LAYERS.some((l) => c.edge.from.startsWith(l)));
  }
});

// ---------------------------------------------------------------------------
// 规则判别力（合成边：正负例双向——规则必须红得出来才算规则）
// ---------------------------------------------------------------------------

function edge(from: string, to: string, kind: 'value' | 'type'): ImportEdge {
  return { from, to, kind };
}

test('CORE-ARCH-001 判别力: kernel→适配器 value import 违规（R1）', () => {
  const c = classifyEdge(edge('src/fec/orchestrator.ts', 'src/llm_gateway/gateway.ts', 'value'));
  assert.equal(c.classification, 'FORBIDDEN_VALUE_IMPORT');
  const c2 = classifyEdge(edge('src/falsifiability/kernel.ts', 'src/agent_loop/loop.ts', 'value'));
  assert.equal(c2.classification, 'FORBIDDEN_VALUE_IMPORT');
});

test('CORE-ARCH-001 判别力: kernel type-import 实现文件违规 / 经 types.ts 放行（R2）', () => {
  const bad = classifyEdge(edge('src/evidence_log/llm_record.ts', 'src/llm_gateway/gateway.ts', 'type'));
  assert.equal(bad.classification, 'FORBIDDEN_TYPE_IMPORT_FROM_IMPL');

  const ok = classifyEdge(edge('src/evidence_log/llm_record.ts', 'src/llm_gateway/types.ts', 'type'));
  assert.equal(ok.classification, 'KERNEL_TYPE_CONTRACT');
});

test('CORE-ARCH-001 判别力: kernel 内部 / 适配器→kernel / node / 包 各归其类', () => {
  assert.equal(classifyEdge(edge('src/fec/compiler.ts', 'src/evidence_log/hasher.ts', 'value')).classification, 'KERNEL_INTERNAL');
  assert.equal(classifyEdge(edge('src/research/run.ts', 'src/falsifiability/types.ts', 'value')).classification, 'OUTBOUND_OK');
  assert.equal(classifyEdge(edge('src/fec/compiler.ts', 'node:crypto', 'value')).classification, 'NODE_BUILTIN');
  assert.equal(classifyEdge(edge('src/fec/compiler.ts', 'pkg:zod', 'value')).classification, 'EXTERNAL_PACKAGE');
  assert.equal(classifyEdge(edge('src/fec/compiler.ts', 'src/schema/enums.ts', 'value')).classification, 'KERNEL_TO_DETERMINISTIC');
});

// ---------------------------------------------------------------------------
// 扫描器：import 形态覆盖（type/混合/export-from/裸包/node:）
// ---------------------------------------------------------------------------

test('scanFileImports: 各 import 形态正确解析 kind 与目标', () => {
  const text = [
    "import { createHash } from 'node:crypto';",
    "import type { Verdict } from '../schema/enums.ts';",
    "import { hashCanonicalJson, type SourceAnchor } from './hasher.ts';",
    "import z from 'zod';",
    "export { verify } from './verify.ts';",
    "export type { Proof } from '../proof_envelope/index.ts';",
    "const dynamic = 1; // import-like comment should not match: import x from 'y'",
  ].join('\n');
  const edges = scanFileImports('src/fec/compiler.ts', text);
  const find = (to: string) => edges.find((e) => e.to === to);

  assert.ok(find('node:crypto') !== undefined, 'node builtin');
  assert.equal(find('node:crypto')?.kind, 'value');
  assert.ok(find('src/schema/enums.ts') !== undefined);
  assert.equal(find('src/schema/enums.ts')?.kind, 'type');
  // 混合 import（value + inline type）按 value 判——从严
  assert.equal(find('src/fec/hasher.ts')?.kind, 'value');
  assert.ok(find('pkg:zod') !== undefined);
  // export ... from 计为 value 边（再导出=运行时绑定）；export type 计 type
  assert.equal(find('src/fec/verify.ts')?.kind, 'value');
  assert.equal(find('src/proof_envelope/index.ts')?.kind, 'type');
  // 6 条语句全中；注释行里的 import 样式不得匹配（裸目标 'y' 不存在）
  assert.equal(edges.length, 6, `all statements matched: ${edges.length}`);
  assert.ok(!edges.some((e) => e.to === 'y' || e.to === 'pkg:y'));
});

// ---------------------------------------------------------------------------
// 端到端合成树：违规文件必须让全树报告变红（fitness 门真的能拦）
// ---------------------------------------------------------------------------

test('CORE-ARCH-001 e2e: 合成违规树被报告捕获（fitness 门拦截力）', () => {
  const dir = join(tmpdir(), `far-arch-${Date.now()}`);
  try {
    // 合成最小树：kernel 文件 + 适配器文件，kernel value-import 适配器
    mkdirSync(join(dir, 'src', 'falsifiability'), { recursive: true });
    mkdirSync(join(dir, 'src', 'llm_gateway'), { recursive: true });
    writeFileSync(join(dir, 'src', 'falsifiability', 'kernel.ts'), "import { createGateway } from '../llm_gateway/gateway.ts';\nexport const k = 1;\n");
    writeFileSync(join(dir, 'src', 'llm_gateway', 'gateway.ts'), 'export const createGateway = 1;\n');

    const report = buildDependencyReport(dir);
    assert.equal(report.violations.length, 1);
    assert.equal(report.violations[0]?.code, 'FORBIDDEN_VALUE_IMPORT');
    assert.equal(report.violations[0]?.edge.from, 'src/falsifiability/kernel.ts');

    // 修复为 type-contract 后归零
    writeFileSync(join(dir, 'src', 'falsifiability', 'kernel.ts'), "import type { LlmGateway } from '../llm_gateway/types.ts';\nexport const k = 1;\n");
    writeFileSync(join(dir, 'src', 'llm_gateway', 'types.ts'), 'export interface LlmGateway { call(): void }\n');
    const fixed = buildDependencyReport(dir);
    assert.equal(fixed.violations.length, 0);
    assert.equal(fixed.edges.filter((c) => c.classification === 'KERNEL_TYPE_CONTRACT').length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
