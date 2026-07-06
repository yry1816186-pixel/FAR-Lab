// scripts/depth_gate.evade.test.mjs
//
// 对抗式回归测试：验证 hardened depth_gate 捕获每条红队规避（W1-W7 + L2 + R3/R7 + R6）。
//
// 为什么需要它：真实仓库已诚实接线（W1-W7 合法 PASS），无法在其上测「规避→失败」。
// 故建临时桩仓（含全部规避），用 DEPTH_GATE_ROOT=<桩> 跑门，断言每条规避被 [FAIL] 命中。
//
// 多 scenario 设计（每个 scenario 独立桩仓，互不污染）：
//   S1  W1-W7 + L2（8 条核心规避，非 git 桩仓；L1 结构合法以隔离 L2 归因）
//   S2  R3 + R7（非 src caller + ::ghost_name；R7 放宽后才进 L1，R3 捕 ghost_name）
//   S3  R6（git 桩仓：closed_by 指向纯治理 commit，diff 不 touch proof_caller → inherent_limits (c) 活体）
//   S4  R12（装饰性 Math.random/空循环伪造 realMathSignal → 须因 realMathSignal=false FAIL）
//   S5  R11（Reflect.apply 第一参 + import 别名动态调度走私 V1 caller → 须被计入使 W4 FAIL）
//
// 运行：node scripts/depth_gate.evade.test.mjs（CI 可挂为 depth-gate 自身的回归门）

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');

const failures = [];

function runGate(fixtureDir) {
  const r = spawnSync('node', ['scripts/depth_gate.mjs'], {
    cwd: REPO,
    env: { ...process.env, DEPTH_GATE_ROOT: fixtureDir },
    encoding: 'utf8',
  });
  return { combined: (r.stdout ?? '') + (r.stderr ?? ''), exitCode: r.status };
}

function makeFixture(prefix) {
  const root = mkdtempSync(join(tmpdir(), prefix));
  const write = (rel, content) => {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  };
  return { root, write };
}

// ===== S1: W1-W7 + L2（8 条核心红队规避） =====
{
  const { root, write } = makeFixture('depth-gate-evade-');
  try {
    write('package.json', '{"name":"fixture","version":"0.0.0"}');

    // W1 规避：顶部 decoy `const fecV2: unknown`（pre-hardening exec 取首匹配 → decoy 非可选 → 误判 pass）
    //          + 真实可选 `fecV2?`。hardened collect-all 须命中真实可选 → FAIL。
    write('src/fec/orchestrator.ts', [
      'const fecV2: unknown = null;',
      'export interface FecAppendClaimArgs { readonly fecV2?: { contract: unknown }; }',
      'export function fecAppendClaim(db: unknown, args: FecAppendClaimArgs): unknown { return args.fecV2; }',
      '',
    ].join('\n'));

    // W2/W3/W4 规避（每条自包含一行，避免行间 ctx 污染）：
    //   W2: if(1>2) 死分支伪装 V2 caller → hardened 同行恒假比较排除 → 0 caller → FAIL
    //   W3: while(false) 死分支伪装 fallback caller → 排除 → 0 caller → FAIL
    //   W4: (makeVerdict)() parens 包裹 V1 caller → hardened parenWrap 计数 → caller>0 → FAIL
    write('src/foo/wiring.ts', [
      'if (1 > 2) decideFiveValueVerdict({} as never);',
      'while (false) executeFallbackChain({} as never);',
      'const _v = (makeVerdict)({} as never);',
      '',
    ].join('\n'));

    // W5 规避：箭头常量占位（4 文件凑 realFileCount，placeholderCount>0，无 realMathSignal）
    for (let i = 1; i <= 4; i++) {
      write(`src/statistics/p${i}.ts`, `export const computeP${i} = (a: number, b: number): number => 0.0${i};\n`);
    }

    // W6 规避：CONFIRMED + 空证据 + 空理由码（仅 UNTESTED 允许空证据 → 须判 bad）
    for (let i = 1; i <= 12; i++) {
      const id = String(i).padStart(2, '0');
      write(`golden_vectors/cases/GV-${id}.json`, JSON.stringify({
        caseId: `GV-${id}`, scenario: 'evasion',
        input: { evidences: [] },
        expected: { verdict: 'CONFIRMED', reasonCodes: [] },
      }));
    }

    // W7 规避：无 child_process spawn（字符串自洽占位，hardened 须判 hollow）
    write('tests/real_backends/fake.test.ts', [
      "import { test } from 'node:test';",
      "test('evasion', () => { const s = 'a' + 'b'; });",
      '',
    ].join('\n'));

    // L1 占位：让 WIRED_GREEN 行引用的 proof_test 存在 + 测试名 'x' 真实存在（隔离 L2，使 L1 通过、L2 因伪造 evidence 失败）
    write('tests/foo/t.test.ts', "import { test } from 'node:test';\ntest('x', () => {});\n");

    // L2 规避：WIRED_GREEN + 自指伪造 evidence（base=head=depth_gate.ok，非 SHA 格式）
    write('PROJECT_PLAN/DEPTH_LEDGER.md', [
      '# DEPTH_LEDGER',
      '',
      '## §C 深度模块接线表',
      '',
      '| id | dep | caller | test | red | status | sha |',
      '|----|-----|--------|------|-----|--------|-----|',
      '| P0-2a | decideFiveValueVerdict 替换 | src/foo/wiring.ts:1 | tests/foo/t.test.ts::x | (待CI双跑) | WIRED_GREEN | dca79ce6ddedd05928c5808f7319ecf49bbb1191 |',
      '| evidence: depth_gate.ok → depth_gate.ok | — | — | — | — | — | — |',
      '',
    ].join('\n'));

    const { combined, exitCode } = runGate(root);
    const expectations = [
      'CHECK-W1', 'CHECK-W2', 'CHECK-W3', 'CHECK-W4',
      'CHECK-W5', 'CHECK-W6', 'CHECK-W7', 'CHECK-L2',
    ];
    for (const check of expectations) {
      if (!combined.includes(`[FAIL] ${check}`)) {
        failures.push(`S1 ${check} 未触发 FAIL——对应红队规避未被 hardened gate 捕获（回归）`);
      }
    }
    // L1 须通过（桩仓 ledger 结构合法：proof_test 存在 + 名存在 + caller 存在 + no-git 跳过 sha 校验）
    if (combined.includes('[FAIL] CHECK-L1')) {
      failures.push('S1 CHECK-L1 不应失败——桩仓 ledger 结构合法，用于隔离 L2 归因');
    }
    if (exitCode === 0) {
      failures.push('S1 门应 exit 1（桩仓含 8 条规避），实际 exit 0');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ===== S2: R3 + R7（非 src caller 行 + ::ghost_name）=====
// R7（lineRe 放宽 src/ 锚点）：P3-X 用 scripts/probe.ts:1（非 src/），旧 regex 不解析 → 逃过 L1 全字段校验。
//     hardened 放宽后该行进 L1 → R3 才能捕到 ghost_name。
// R3（::test_name 须存在）：proof_test 文件存在（tests/foo/t.test.ts）但测试名 'ghost_name' 编造。
//     防 agent 建「文件存在但测试名不存在」的占位 + 兼防 depth_evidence bot NO_MATCH。
{
  const { root, write } = makeFixture('depth-gate-r3r7-');
  try {
    write('package.json', '{"name":"fixture","version":"0.0.0"}');
    write('tests/foo/t.test.ts', "import { test } from 'node:test';\ntest('real_name', () => {});\n");
    write('scripts/probe.ts', 'export const probePythonAxis = () => 1;\n'); // 非 src caller（R7 放宽后才解析）
    write('PROJECT_PLAN/DEPTH_LEDGER.md', [
      '# DEPTH_LEDGER', '', '## §C 深度模块接线表', '',
      '| id | dep | caller | test | red | status | sha |',
      '|----|-----|--------|------|-----|--------|-----|',
      '| P3-X | probePythonAxis spawn 探针 | scripts/probe.ts:1 | tests/foo/t.test.ts::ghost_name | (待CI双跑) | WIRED_RED | — |',
      '',
    ].join('\n'));

    const { combined, exitCode } = runGate(root);
    if (!combined.includes('ghost_name')) {
      failures.push('S2 R3 未捕获 ::ghost_name（proof_test 文件存在但测试名编造）——R3/R7 回归');
    }
    if (!combined.includes('[FAIL] CHECK-L1')) {
      failures.push('S2 R3/R7 规避须触发 CHECK-L1 FAIL（非 src caller + ghost_name）');
    }
    if (exitCode === 0) {
      failures.push('S2 门应 exit 1（R3 ghost_name）');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// ===== S4: R12（realMathSignal 收紧——装饰性 math / 空 loop 不算）=====
// R12 攻击：4 个 stat 文件凑 realFileCount≥4 + placeholderCount=0（三元 return 非 literal 占位），
//   但 math 信号全是装饰（Math.random / Math.abs 不在 return 路径）或空循环（for(;;){} / while(false){}）。
//   旧口径「文件含 Math.* / for(while)」即过 → 骗过 W5。hardened R12 要求信号在 return 路径或实质循环体 → FAIL。
//   断言 realMathSignal=false（R12 信号失败，非 S1 式 placeholderCount>0）。
{
  const { root, write } = makeFixture('depth-gate-r12-');
  try {
    write('package.json', '{"name":"fixture","version":"0.0.0"}');
    // 4 个 decoy：均 export function + return 前有语句（fnRe1 的 \{\s*return 不匹配 → placeholderCount=0），
    //   return 是 `z > 2 ? 0.05 : 0.5` 三元（无 [+\-*/] / 无 ident(/ / 无 Math.* 在 expr → returnPathMath 不命中）。
    write('src/statistics/p1.ts', [
      'export function pValue1(z: number): number {',
      '  const decoy = Math.random();',   // 装饰性 Math.random（不在 return 路径 + R12 整体排除 random）
      '  return z > 2 ? 0.05 : 0.5;',
      '}',
      '',
    ].join('\n'));
    write('src/statistics/p2.ts', [
      'export function pValue2(z: number): number {',
      '  for (;;) {}',                    // 空循环（header `;;` + 空体 → substantiveLoop 排除）
      '  return z > 2 ? 0.05 : 0.5;',
      '}',
      '',
    ].join('\n'));
    write('src/statistics/p3.ts', [
      'export function pValue3(z: number): number {',
      '  const decoy = Math.abs(z);',     // 装饰性 Math.abs（合法 Math.* 但不在 return 路径 → 旧口径过 / 新口径 FAIL）
      '  return z > 2 ? 0.05 : 0.5;',
      '}',
      '',
    ].join('\n'));
    write('src/statistics/p4.ts', [
      'export function pValue4(z: number): number {',
      '  while (false) { const x = 1; }', // 死循环（header false → substantiveLoop 排除）
      '  return z > 2 ? 0.05 : 0.5;',
      '}',
      '',
    ].join('\n'));

    const { combined, exitCode } = runGate(root);
    if (!combined.includes('[FAIL] CHECK-W5')) {
      failures.push('S4 R12 未触发 CHECK-W5 FAIL（装饰性 math / 空循环骗过 realMathSignal）');
    }
    if (!combined.includes('realMathSignal=false')) {
      failures.push('S4 R12 须因 realMathSignal=false 失败（非 placeholderCount>0——证明是信号收紧生效）');
    }
    if (exitCode === 0) {
      failures.push('S4 门应 exit 1（R12 装饰性 math 伪造 realMathSignal）');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}


// ===== S5: R11（动态调度击穿 caller 计数——Reflect.apply 第一参 + import 别名）=====
// R11 攻击：V1 makeVerdict 仅通过动态调度被调用，逃避「\bsymbol\b 后跟 (」的 CallExpression 计数——
//   (a) Reflect.apply(makeVerdict, null, …)：makeVerdict 后跟 , 非 (，旧 direct/parenWrap/reflectCall 漏判 → 0 caller
//   (b) import {makeVerdict as mv} + mv(…)：旧 \bmakeVerdict\b 字面不匹配别名 mv → 0 caller
//   旧口径 → count=0 → W4 误判 V1 已替换（PASS）。hardened R11：别名收集（全 src 扫 import-as）+
//   reflectFirstArg（head 末尾 Reflect.apply/call(）→ 两路均计数 → count=2 → W4 FAIL（V1 仍活）。
//   防 agent 用 Reflect.apply(makeVerdict,…) 或 import {makeVerdict as dv}+dv() 把 V1 走私回生产。
{
  const { root, write } = makeFixture('depth-gate-r11-');
  try {
    write('package.json', '{"name":"fixture","version":"0.0.0"}');
    // V1 定义文件（detectV1StillAlive 排除 def 文件自身，不计）
    write('src/falsifiability/verdict.ts', 'export function makeVerdict(): number { return 0; }\n');
    // 两路动态调度调用，均在 src/foo/dynamic.ts（非 def 文件 → 计入 caller）
    write('src/foo/dynamic.ts', [
      "import { makeVerdict as mv } from '../falsifiability/verdict.js';",
      'export const runReflect = () => Reflect.apply(makeVerdict, null, [{} as never]);',
      'export const runAlias = () => mv({} as never);',
      '',
    ].join('\n'));

    const { combined, exitCode } = runGate(root);
    if (!combined.includes('[FAIL] CHECK-W4')) {
      failures.push('S5 R11 未触发 CHECK-W4 FAIL（Reflect.apply 第一参 + import 别名动态调度骗过 caller 计数 → V1 仍活却误判 PASS）');
    }
    if (!combined.includes('dynamic.ts')) {
      failures.push('S5 R11 须列出 dynamic.ts 为违规文件（证明 alias mv 调用与 Reflect.apply 第一参都被识别为 V1 caller）');
    }
    if (exitCode === 0) {
      failures.push('S5 门应 exit 1（R11 动态调度走私 V1 makeVerdict）');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

// R6 攻击：WIRED_GREEN + closed_by 指向真实 commit，但该 commit 是纯治理（只 touch docs/x.md），
//   不 touch proof_caller（src/fec/orchestrator.ts）。旧 L1 只校验 sha 真实（R9）→ 骗过。
//   hardened R6 加 `git diff-tree --name-only` 校验：sha 存在 ≠ sha 含接线 diff（dca79ce6 式活体）。
//   须 git 桩仓（commit A 真实可 cat-file -t → R9 过 → 进 R6 diff 校验 → FAIL）。
{
  const { root, write } = makeFixture('depth-gate-r6-');
  try {
    write('package.json', '{"name":"fixture","version":"0.0.0"}');
    // -c core.hooksPath= 禁全局 hook（防环境装了「禁 commit 到 main」hook 致 fixture 建仓失败 →
    //   HEAD 保持 unborn → rev-parse 返回字面 "HEAD" → gate 走 R9（非 sha）而非 R6（diff 校验），
    //   使本场景测不到 R6。桩仓须与全局 git 配置解耦 = 测试 hermetic）。
    const git = (args) => spawnSync('git', ['-c', 'core.hooksPath=', ...args], { cwd: root, encoding: 'utf8' });
    git(['init', '-q', '-b', 'fixture']);
    git(['config', 'user.email', 'evade@test']);
    git(['config', 'user.name', 'evade']);
    // commit A：纯治理（只 touch docs/x.md，不 touch caller）
    write('docs/x.md', '# governance-only commit\n');
    git(['add', 'docs/x.md']);
    git(['commit', '-q', '-m', 'governance-only']);
    const commitA = git(['rev-parse', 'HEAD']).stdout.trim();
    // fail-fast：commit 须真建（40-hex sha）；否则 setup 失败，R6 永不被触达，断言无意义。
    if (!/^[0-9a-f]{40}$/.test(commitA)) {
      throw new Error(`S3 fixture git commit 失败——commitA="${commitA}"（非 40-hex sha；检查 git hook / init）`);
    }
    // caller 文件存在于工作树（L1 existsSync 过），但不在 commit A 的 diff 里（R6 捕）
    write('src/fec/orchestrator.ts', "export function fecAppendClaim(): void {}\nexport interface FecAppendClaimArgs { readonly fecV2: { contract: unknown }; }\n");
    write('tests/foo/t.test.ts', "import { test } from 'node:test';\ntest('real_name', () => {});\n");
    // evidence 行用两个不同的 40-hex（L2 只校验格式 + base≠head；closed_by 才是 R6 校验对象）
    const fakeHead = commitA.replace(/^./, (c) => (c === '0' ? '1' : '0'));
    write('PROJECT_PLAN/DEPTH_LEDGER.md', [
      '# DEPTH_LEDGER', '', '## §C 深度模块接线表', '',
      '| id | dep | caller | test | red | status | sha |',
      '|----|-----|--------|------|-----|--------|-----|',
      `| P0-X | compileFec wiring | src/fec/orchestrator.ts:1 | tests/foo/t.test.ts::real_name | (待CI双跑) | WIRED_GREEN | ${commitA} |`,
      `| evidence: ${commitA} → ${fakeHead} | — | — | — | — | — | — |`,
      '',
    ].join('\n'));

    const { combined, exitCode } = runGate(root);
    if (!combined.includes('未 touch proof_caller')) {
      failures.push('S3 R6 未捕获 closed_by diff 不含 caller（inherent_limits (c) 活体——sha 存在但零接线 diff）');
    }
    if (!combined.includes('[FAIL] CHECK-L1')) {
      failures.push('S3 R6 规避须触发 CHECK-L1 FAIL');
    }
    if (exitCode === 0) {
      failures.push('S3 门应 exit 1（R6 纯治理 closed_by 伪造 WIRED_GREEN）');
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (failures.length > 0) {
  console.error('=== depth_gate.evade.test: FAIL ===');
  for (const f of failures) console.error('  ✗ ' + f);
  process.exit(1);
}
console.log('=== depth_gate.evade.test: PASS（W1-W7+L2+R3/R7+R6+R12+R11 红队规避全部被 hardened gate 捕获） ===');
