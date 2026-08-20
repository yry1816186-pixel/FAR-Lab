// tests/falsifiability/verifier_gate.test.ts
//
// FUSION-OS-5 端到端物证：verifier 加载期 AST 结构门（src/falsifiability/verifier_structural_gate.ts）
// 用 TS Compiler API 扫描确定性内核 + detector 源码，禁 forbidden network/IO/LLM call·fail-closed。
//
// 真实依赖：scanSourceForForbiddenCalls 调 ts.createSourceFile 真实解析 TS AST（非正则/非桩）；
// scanDeterministicModules 读真实 verdict_kernel_v2.ts + anti_theater/{lint,constraint,score} + 23 detector 源。
// proof_caller = src/anti_theater/lint.ts runAntiTheaterLint 入口（assertVerifierModulesClean 接线·每次 verdict 路径）。
// 反假绿：dirty fixture 必抛 + 真实 kernel/detector 模块基线必空（GREEN）。
//
// Authority: FUSION-OS-5 + FUSION_OPEN_SCIENCE_DESIGN.md §F-5（kernel.py AST 白名单范式）。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  VerifierStructuralGateError,
  assertSourceClean,
  assertVerifierModulesClean,
  createVerifierStructuralGate,
  listDeterministicModules,
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

  // mutation 补杀：合法 dynamic import / 合法 require 零命中（&&→|| 会把一切非 null
  // 说明符误判 forbidden——三分支各需正例）。
  const cleanDynamic = scanSourceForForbiddenCalls("const m = import('./local.ts');", 'dyn-clean.ts');
  assert.equal(cleanDynamic.length, 0, '合法动态 import 不得误报');
  const cleanRequire = scanSourceForForbiddenCalls("const u = require('./util.ts');", 'req-clean.ts');
  assert.equal(cleanRequire.length, 0, '合法 require 不得误报');

  // mutation 补杀：NoSubstitutionTemplateLiteral 说明符同受拦截（literalText 第二
  // === 位点——模板字符串与普通字符串说明符语义等价，不得绕过门）。
  const tmplImport = scanSourceForForbiddenCalls('import fs from `fs`;', 'tmpl-imp.ts');
  assert.ok(tmplImport.some((h) => h.kind === 'forbidden-import' && h.specifier === 'fs'),
    '模板字符串 import 说明符（`fs`）须同样被拦截');
  const tmplDynamic = scanSourceForForbiddenCalls('const m = import(`node:child_process`);', 'tmpl-dyn.ts');
  assert.ok(tmplDynamic.some((h) => h.kind === 'forbidden-dynamic-import' && h.specifier === 'node:child_process'),
    '模板字符串动态 import 说明符须同样被拦截');

  // mutation 补杀：assertSourceClean 干净源不抛（hits.length > 0 → >= 变异会连干净源也抛）。
  assert.doesNotThrow(() => assertSourceClean("export const x = 1;", 'clean-assert.ts'),
    '干净源过 assertSourceClean 不得抛');
});

test('production_deterministic_modules_pass_gate', () => {
  // 真实确定性内核模块（verdict_kernel_v2 + anti_theater/{lint,constraint,score} + 23 detector）
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

// ===== F-4-006（R4）：member-expression 全局 call 捕获（Date.now / Math.random 等） =====

test('F-4-006: Date.now() global call is flagged (member expression)', () => {
  const dirty = "export function f() { return Date.now(); }";
  const hits = scanSourceForForbiddenCalls(dirty, 'time.ts');
  assert.ok(hits.some((h) => h.kind === 'forbidden-global-call' && h.callee === 'Date.now'));
});

test('F-4-006: Math.random() global call is flagged', () => {
  const dirty = "export function r() { return Math.random(); }";
  const hits = scanSourceForForbiddenCalls(dirty, 'rand.ts');
  assert.ok(hits.some((h) => h.kind === 'forbidden-global-call' && h.callee === 'Math.random'));
});

test('F-4-006: performance.now() global call is flagged', () => {
  const dirty = "export function p() { return performance.now(); }";
  const hits = scanSourceForForbiddenCalls(dirty, 'perf.ts');
  assert.ok(hits.some((h) => h.kind === 'forbidden-global-call' && h.callee === 'performance.now'));
});

test('F-4-006: process.hrtime.bigint() global call is flagged', () => {
  const dirty = "export function h() { return process.hrtime.bigint(); }";
  const hits = scanSourceForForbiddenCalls(dirty, 'hrtime.ts');
  assert.ok(hits.some((h) => h.kind === 'forbidden-global-call' && h.callee === 'process.hrtime.bigint'));
});

test('F-4-006: crypto.getRandomValues() global call is flagged', () => {
  const dirty = "const arr = new Uint8Array(8); crypto.getRandomValues(arr);";
  const hits = scanSourceForForbiddenCalls(dirty, 'crypto.ts');
  assert.ok(hits.some((h) => h.kind === 'forbidden-global-call' && h.callee === 'crypto.getRandomValues'));
});

test('F-4-006: legitimate Date constructor (new Date) is NOT flagged', () => {
  const clean = "export function legit() { const d = new Date('2026-01-01'); return d.getFullYear(); }";
  const hits = scanSourceForForbiddenCalls(clean, 'ok.ts');
  assert.equal(hits.length, 0);
});

test('F-4-006: legitimate Math.floor / Math.max are NOT flagged', () => {
  const clean = "export function ok() { return Math.floor(3.7) + Math.max(1, 2); }";
  const hits = scanSourceForForbiddenCalls(clean, 'ok2.ts');
  assert.equal(hits.length, 0);
});

// ===== 2026-08-20 mutation 补杀：门状态机（工厂注入接缝）+ 扫描集合完整性 =====

test('mutation 补杀: 扫描集合完整性（listDeterministicModules 锁定守护范围）', () => {
  const modules = listDeterministicModules();
  const labels = modules.map((m) => m.label);
  assert.ok(labels.includes('falsifiability/verdict_kernel_v2'), '须含裁决内核');
  assert.ok(labels.includes('anti_theater/lint'), '须含 lint');
  assert.ok(labels.includes('anti_theater/constraint'), '须含 constraint');
  assert.ok(labels.includes('anti_theater/score'), '须含 score');
  const detectorLabels = labels.filter((l) => l.startsWith('anti_theater/detectors/'));
  assert.ok(detectorLabels.length >= 20, `detectors 须全量入扫描（实际 ${detectorLabels.length}）——漏扫 = 检查器失效`);
  assert.ok(!labels.includes('anti_theater/detectors/index.ts'), 'index.ts 桶文件不得入扫描（&&→|| 变异会放进）');
  for (const m of modules) {
    assert.ok(m.path.endsWith('.ts'), `仅 .ts 入扫描（${m.path}）`);
  }
});

test('mutation 补杀: dirty 首调抛 + memoized 二调重抛同一错误对象（cachedError 语义）', () => {
  const dirtyFs = {
    existsSync: () => true,
    readdirSync: () => [],
    readFileSync: () => 'export function bad() { return fetch("https://x"); }',
  };
  const gate = createVerifierStructuralGate(dirtyFs, '/fake-gate-dir');
  const caught: unknown[] = [];
  for (let call = 0; call < 2; call += 1) {
    try {
      gate.assertClean();
      assert.fail(call === 0 ? 'dirty 源首调必抛' : 'memoized 二调须重抛（不得静默放过）');
    } catch (e) {
      caught.push(e);
    }
  }
  assert.ok(caught[0] instanceof VerifierStructuralGateError, '首调抛 VerifierStructuralGateError');
  assert.ok(caught[1] instanceof VerifierStructuralGateError, '二调抛 VerifierStructuralGateError');
  assert.equal(caught[1], caught[0], '二调重抛的是缓存错误对象（同一引用）');
  assert.equal(gate.getState().checkCompleted, true);
  assert.equal(gate.getState().cachedError, caught[0]);
});

test('mutation 补杀: clean 首调过 + 二调短路不再读文件（checkCompleted memoize）', () => {
  let readCount = 0;
  const countingFs = {
    existsSync: () => true,
    readdirSync: () => [],
    readFileSync: () => { readCount += 1; return 'export const clean = 1;'; },
  };
  const gate = createVerifierStructuralGate(countingFs, '/fake-gate-dir');
  assert.doesNotThrow(() => gate.assertClean());
  const readsAfterFirst = readCount;
  assert.ok(readsAfterFirst > 0, '首调须真实扫描');
  assert.doesNotThrow(() => gate.assertClean());
  assert.equal(readCount, readsAfterFirst, '二调须短路（memoized·不再读文件）');
  assert.equal(gate.getState().checkCompleted, true, 'clean 路径同样置完成标志');
});

test('mutation 补杀: bundle 模式（无 src 可扫）→ 不抛 + 一次性告警 + 完成标志', () => {
  const writes: string[] = [];
  const originalWrite = process.stderr.write;
  process.stderr.write = ((chunk: unknown) => {
    writes.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    const bundleFs = { existsSync: () => false, readdirSync: () => [], readFileSync: () => { throw new Error('must not read in bundle mode'); } };
    const gate = createVerifierStructuralGate(bundleFs, '/fake-bundle-dir');
    assert.doesNotThrow(() => gate.assertClean(), 'bundle 模式信任转移至 CI depth_gate（G1）·不抛');
    assert.equal(writes.length, 1, '首调告警一次');
    assert.ok(writes[0]?.includes('bundle mode'), '告警内容须说明 bundle 跳过语义');
    assert.equal(gate.getState().checkCompleted, true, 'bundle 分支同样置完成标志');
    assert.equal(gate.getState().bundleModeWarningEmitted, true);
    gate.assertClean(); // 二调：不再告警（一次性）
    assert.equal(writes.length, 1, '二调不得重复告警（防刷屏）');
    assert.equal(gate.getState().bundleModeWarningEmitted, true);
  } finally {
    process.stderr.write = originalWrite;
  }
});

test('mutation 补杀: 读失败 → fail-closed 包装错误（不吞不静默）', () => {
  const brokenFs = {
    existsSync: () => true,
    readdirSync: () => [],
    readFileSync: () => { throw new Error('EACCES: permission denied'); },
  };
  const gate = createVerifierStructuralGate(brokenFs, '/fake-gate-dir');
  assert.throws(() => gate.assertClean(), /cannot scan deterministic modules: EACCES/,
    '无法验证纯度 = 拒绝放行');
});
