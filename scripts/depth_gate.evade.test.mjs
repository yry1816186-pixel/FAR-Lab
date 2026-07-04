// scripts/depth_gate.evade.test.mjs
//
// 对抗式回归测试：验证 hardened depth_gate 捕获每条红队规避（W1-W7 + L2）。
//
// 为什么需要它：真实仓库已诚实接线（W1-W7 合法 PASS），无法在其上测「规避→失败」。
// 故建临时桩仓（含全部规避），用 DEPTH_GATE_ROOT=<桩> 跑门，断言每条规避被 [FAIL] 命中。
// 桩仓 ledger 结构合法（L1 须通过）以隔离 L2（仅 L2 因伪造 evidence 失败）。
//
// 运行：node scripts/depth_gate.evade.test.mjs（CI 可挂为 depth-gate 自身的回归门）

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..');

const fixture = mkdtempSync(join(tmpdir(), 'depth-gate-evade-'));
const write = (rel, content) => {
  const abs = join(fixture, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, content);
};

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

  // L1 占位：让 WIRED_GREEN 行引用的 proof_test 存在（隔离 L2，使 L1 通过、L2 因伪造 evidence 失败）
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

  const r = spawnSync('node', ['scripts/depth_gate.mjs'], {
    cwd: REPO,
    env: { ...process.env, DEPTH_GATE_ROOT: fixture },
    encoding: 'utf8',
  });
  const combined = (r.stdout ?? '') + (r.stderr ?? '');
  const exitCode = r.status;

  const expectations = [
    'CHECK-W1', 'CHECK-W2', 'CHECK-W3', 'CHECK-W4',
    'CHECK-W5', 'CHECK-W6', 'CHECK-W7', 'CHECK-L2',
  ];
  const failures = [];
  for (const check of expectations) {
    if (!combined.includes(`[FAIL] ${check}`)) {
      failures.push(`${check} 未触发 FAIL——对应红队规避未被 hardened gate 捕获（回归）`);
    }
  }
  // L1 须通过（桩仓 ledger 结构合法：proof_test 存在 + caller 存在 + no-git 跳过 sha 校验）
  if (combined.includes('[FAIL] CHECK-L1')) {
    failures.push('CHECK-L1 不应失败——桩仓 ledger 结构合法，用于隔离 L2 归因');
  }
  if (exitCode === 0) {
    failures.push(`门应 exit 1（桩仓含 8 条规避），实际 exit 0`);
  }

  if (failures.length > 0) {
    console.error('=== depth_gate.evade.test: FAIL ===');
    for (const f of failures) console.error('  ✗ ' + f);
    console.error('\n--- gate output (桩仓) ---\n' + combined);
    process.exit(1);
  }
  console.log('=== depth_gate.evade.test: PASS（8 条红队规避 W1-W7+L2 全部被 hardened gate 捕获，L1 隔离通过） ===');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
