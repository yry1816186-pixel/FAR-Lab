// tests/falsifiability/verifier_gate.test.ts
//
// FUSION-OS-5 端到端物证：verifier 加载期 AST 结构门（src/falsifiability/verifier_structural_gate.ts）
// 用 TS Compiler API 扫描确定性内核 + detector 源码，禁 forbidden network/IO/LLM call·fail-closed。
//
// 真实依赖：scanSourceForForbiddenCalls 调 ts.createSourceFile 真实解析 TS AST（非正则/非桩）；
// scanDeterministicModules 读真实 verdict_kernel_v2.ts + anti_theater/{lint,constraint,score} + 20 detector 源。
// proof_caller = src/anti_theater/lint.ts runAntiTheaterLint 入口（assertVerifierModulesClean 接线·每次 verdict 路径）。
// 反假绿：dirty fixture 必抛 + 真实 kernel/detector 模块基线必空（GREEN）。
//
// Authority: FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §C FUSION-OS-5 + FUSION_OPEN_SCIENCE_DESIGN.md §F-5（kernel.py AST 白名单范式）。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  VerifierStructuralGateError,
  assertSourceClean,
  assertVerifierModulesClean,
  scanDeterministicModules,
  scanSourceForForbiddenCalls,
} from '../../src/falsifiability/verifier_structural_gate.ts';

test('verifier_with_top_level_fetch_rejected', () => {
  // 顶层 fetch call——dirty fixture：模拟有人往 verifier 模块加了网络调用。
  const dirtySource = [
    "import { helper } from './local.ts';",
    "fetch('https://example.com/leak');",
    "export function pure() { return 1; }",
  ].join('\n');

  const hits = scanSourceForForbiddenCalls(dirtySource, 'fake-verifier.ts');
  assert.ok(hits.length > 0, 'dirty source with top-level fetch must produce >=1 hit');
  const fetchHit = hits.find((h) => h.kind === 'forbidden-global-call' && h.callee === 'fetch');
  assert.ok(fetchHit, 'must flag the top-level fetch() global call');
  assert.equal(fetchHit!.line, 2);

  assert.throws(
    () => assertSourceClean(dirtySource, 'fake-verifier.ts'),
    (err: unknown) => err instanceof VerifierStructuralGateError && err.hits.length > 0,
  );
});

test('scanSourceForForbiddenCalls distinguishes import / require / dynamic-import / type-only / clean', () => {
  const hitsImport = scanSourceForForbiddenCalls("import fs from 'fs';\nexport const x = 1;", 'imp.ts');
  assert.ok(hitsImport.some((h) => h.kind === 'forbidden-import' && h.specifier === 'fs'));

  const hitsRequire = scanSourceForForbiddenCalls("const http = require('http');", 'req.ts');
  assert.ok(hitsRequire.some((h) => h.kind === 'forbidden-require' && h.specifier === 'http'));

  const hitsDynamic = scanSourceForForbiddenCalls("const m = import('node:fs');", 'dyn.ts');
  assert.ok(hitsDynamic.some((h) => h.kind === 'forbidden-dynamic-import' && h.specifier === 'node:fs'));

  const hitsLlm = scanSourceForForbiddenCalls(
    "import { callLlm } from '../llm_gateway/gateway.ts';",
    'llm.ts',
  );
  assert.ok(hitsLlm.some((h) => h.kind === 'forbidden-import'), 'runtime llm_gateway import must be flagged');

  // type-only import 编译期擦除、非运行时依赖 → 放行（不误伤 external_facts.ts 的合法 import type）。
  const typeOnly = scanSourceForForbiddenCalls(
    "import type { LlmResponse } from '../llm_gateway/types.ts';",
    'type.ts',
  );
  assert.equal(typeOnly.length, 0, 'type-only import must NOT be flagged (erased at runtime)');

  // 干净源零命中（合法第三方库 + 纯函数）。
  const clean = scanSourceForForbiddenCalls(
    "import { ulid } from 'ulid';\nexport function f() { return ulid(); }",
    'clean.ts',
  );
  assert.equal(clean.length, 0);
});

test('production_deterministic_modules_pass_gate', () => {
  // 真实确定性内核模块（verdict_kernel_v2 + anti_theater/{lint,constraint,score} + 20 detector）
  // 全部无 forbidden call——证明生产路径加载期门通过（GREEN 基线）。
  const hits = scanDeterministicModules();
  assert.equal(
    hits.length,
    0,
    `deterministic core must be clean, got: ${JSON.stringify(hits, null, 2)}`,
  );

  // memoized 生产入口（runAntiTheatorLint 接线）亦不抛。
  assert.doesNotThrow(() => assertVerifierModulesClean());
});
