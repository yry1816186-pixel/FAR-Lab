// tests/cli/doctor_credentials.test.ts
// far doctor 凭证健康检查族（night-r4 §11C / T1）：
//   1) 四 provider（DASHSCOPE/DEEPSEEK/NUAA/GITHUB_PAT）presence + 掩码回显 + 形状校验；
//   2) 掩码绝不能泄露完整 key（负向断言：完整值与中段子串都不出现在 stdout/stderr）；
//   3) 缺 key → WARN（R9：不 fail、不改 exit code，确定性端点完全可用）；
//   4) --probe-credentials 无 key → 结构化 skip，绝不伪造探针结果；
//      默认（无 flag）完全不出现探针行（零网络）。
//
// 设计纪律：
//   - env 变量名从生产 spec（CREDENTIAL_SPECS）派生 —— SSOT：测试不复制第二份
//     env 名字面量（防漂移；行为断言仍全部钉死：状态映射/掩码/防泄露/exit code）。
//   - 假 key 为显式占位符（fake/NoLeak 标记，长度 < 真实密钥形状阈值）；绝不疑似真值。
//   - E2E 用例先清空全部凭证 env 再注入 —— 开发机真实 .env / shell 状态不得影响测试。
//   - detail 断言一律绑定「name 行紧随的 detail 行」（\n\s+…[^\n]*），禁止跨行懒匹配。

import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CREDENTIAL_SPECS, maskCredential } from '../../src/cli/commands/doctor.ts';

/** 全部凭证 env 名（含别名），从生产 spec 派生 —— 测试 hermetic 清扫用。 */
const CRED_ENV_VARS: readonly string[] = [...new Set(CREDENTIAL_SPECS.flatMap((s) => s.envNames))];

/** spec.name → spec（断言用；找不到即测试自身装配错误）。非 DASHSCOPE spec 用。 */
function specOf(name: string): (typeof CREDENTIAL_SPECS)[number] {
  const spec = CREDENTIAL_SPECS.find((s) => s.name === name);
  assert.ok(spec !== undefined, `test wiring: unknown spec ${name}`);
  return spec;
}

/**
 * DASHSCOPE 主力 spec —— 按能力契约选取（"LIVE 主链"唯一定名该 spec），
 * 不在测试里复制 env 变量名字面量（SSOT：env 名唯一来源是生产 spec）。
 */
const DASH = CREDENTIAL_SPECS.find((s) => s.capability.includes('LIVE research/ask/judge'))!;
assert.ok(DASH !== undefined && DASH.envNames.length === 2, 'test wiring: DASHSCOPE spec must have an alias pair');

const DEEP = specOf('DEEPSEEK_API_KEY');

// 假 key（占位符，改值时同步改长度相关断言）。
const FAKE_DASHSCOPE = 'sk-fakeDocNoLeak1'; // len 18
const FAKE_DEEPSEEK = 'sk-dsFakeNoLeak2'; // len 17
const FAKE_NUAA = 'campus-nuaa-fake-no-leak-abc'; // 无形状约束
const FAKE_GHP = 'ghp_fakePatNoLeak3';

interface DoctorRun {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** 以受控凭证环境跑 far doctor（清空全部凭证 env 后注入 creds）。 */
function runDoctorWithCreds(args: readonly string[], creds: Record<string, string> = {}): DoctorRun {
  const env: Record<string, string | undefined> = { ...process.env };
  for (const v of CRED_ENV_VARS) delete env[v];
  for (const [k, v] of Object.entries(creds)) env[k] = v;
  const r = spawnSync(process.execPath, ['src/cli/far.ts', 'doctor', ...args], {
    encoding: 'utf8',
    timeout: 120000,
    env,
  });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** 断言 spec 检查行的紧随 detail 行匹配 rest（单行绑定，防跨行误配）。 */
function detailLine(specName: string, rest: string): RegExp {
  return new RegExp(`credential: ${specName}\\n\\s+[^\\n]*${rest}`);
}

// ---------------------------------------------------------------------------
// 单元：maskCredential 掩码格式与防泄露边界
// ---------------------------------------------------------------------------

test('maskCredential: len>=8 显示 first4…last2 + 长度；8 字符边界两侧行为正确', () => {
  assert.equal(maskCredential('sk-12345'), 'sk-1…45 (len 8)'); // 恰好 8 → 走掩码分支
  const masked = maskCredential(FAKE_DASHSCOPE);
  assert.equal(
    masked,
    `${FAKE_DASHSCOPE.slice(0, 4)}…${FAKE_DASHSCOPE.slice(-2)} (len ${FAKE_DASHSCOPE.length})`,
  );
  // 中段子串绝不出现（first4/last2 之外的任何字符都算泄露）。
  assert.ok(!masked.includes(FAKE_DASHSCOPE.slice(4, -2)), 'interior chars must never appear in the mask');
});

test('maskCredential: len<8 全隐藏（first4+last2 会拼出完整短 key，必须不泄露任何 ≥3 连续字符块）', () => {
  const short = 'sk-123'; // len 6 < 8
  const masked = maskCredential(short);
  assert.equal(masked, 'hidden (len 6 — too short to mask)');
  // 安全属性:输出不含 key 的任何连续 ≥3 字符块(模板词如 "mask" 天然含单字母 's'/'k',
  // 单字符出现不构成泄露;≥3 连续块才可能被用于重建 key)。
  for (let i = 0; i + 3 <= short.length; i++) {
    assert.ok(!masked.includes(short.slice(i, i + 3)), `3-char chunk "${short.slice(i, i + 3)}" leaked`);
  }
});

// ---------------------------------------------------------------------------
// E2E：四 provider presence / 掩码 / 形状 / 别名 / exit code / 探针
// ---------------------------------------------------------------------------

test('四个凭证全部配置且形状正确 → 每个 spec 一行 [OK ] 掩码回显；完整 key 任何地方不出现', () => {
  const r = runDoctorWithCreds([], {
    [DASH.envNames[1]!]: FAKE_DASHSCOPE,
    [DEEP.envNames[0]!]: FAKE_DEEPSEEK,
    [specOf('NUAA_API_KEY').envNames[0]!]: FAKE_NUAA,
    [specOf('GITHUB_PAT').envNames[0]!]: FAKE_GHP,
  });
  assert.ok(r.status === 0 || r.status === 1 || r.status === 2, `unexpected exit ${r.status}`);
  for (const spec of CREDENTIAL_SPECS) {
    assert.match(r.stdout, new RegExp(`\\[OK +\\] credential: ${spec.name}\\n\\s+${spec.name} set[^\n]*masked: `));
  }
  // 负向断言：4 个完整假 key 与各自中段子串都不出现在 stdout/stderr。
  for (const k of [FAKE_DASHSCOPE, FAKE_DEEPSEEK, FAKE_NUAA, FAKE_GHP]) {
    assert.ok(!r.stdout.includes(k), `full credential value leaked: ${k.slice(0, 6)}…`);
    assert.ok(!r.stderr.includes(k), 'full credential value leaked to stderr');
    assert.ok(!r.stdout.includes(k.slice(5, -3)), 'interior of credential value leaked');
  }
  // DASHSCOPE 行必须带掩码回显。
  assert.ok(r.stdout.includes(maskCredential(FAKE_DASHSCOPE)), 'masked echo must appear for DASHSCOPE');
});

test('全部缺失 → 每个 provider 一行 [WARN] + 能力说明 + 可执行修复指引（URL/命令）', () => {
  const r = runDoctorWithCreds([]);
  const warnLines = r.stdout.split('\n').filter((l) => l.includes('[WARN] credential:'));
  assert.equal(warnLines.length, CREDENTIAL_SPECS.length, 'one WARN line per credential spec');
  assert.match(r.stdout, detailLine(DASH.name, 'not configured \\(optional provider\\)[^\n]*LIVE research/ask/judge[^\n]*bailian\\.console\\.aliyun\\.com'));
  assert.match(r.stdout, detailLine(DEEP.name, 'not configured[^\n]*heterogeneous verification arm[^\n]*platform\\.deepseek\\.com'));
  assert.match(r.stdout, detailLine('NUAA_API_KEY', 'not configured[^\n]*heterogeneous verification arm'));
  assert.match(r.stdout, detailLine('GITHUB_PAT', 'not configured[^\n]*release/publish tooling[^\n]*github\\.com/settings/tokens'));
});

test('R9 纪律：缺 key 不改 doctor exit code（缺 key vs 全 key 两次运行退出码一致，且无 credential FAIL 行）', () => {
  const absent = runDoctorWithCreds([]);
  const present = runDoctorWithCreds([], {
    [DASH.envNames[1]!]: FAKE_DASHSCOPE,
    [DEEP.envNames[0]!]: FAKE_DEEPSEEK,
    [specOf('NUAA_API_KEY').envNames[0]!]: FAKE_NUAA,
    [specOf('GITHUB_PAT').envNames[0]!]: FAKE_GHP,
  });
  assert.equal(absent.status, present.status, 'credential presence must not change the doctor exit code');
  assert.ok(!absent.stdout.includes('[FAIL] credential'), 'absent optional keys must never FAIL (R9)');
});

test('形状错位 → WARN + 期望前缀提示与修复指引（ghp_ 值放 DASHSCOPE 槽 / sk- 值放 GITHUB_PAT 槽）', () => {
  const wrongDash = 'ghp_wrongSlotFake9';
  const wrongPat = 'sk-wrongSlotFake8';
  const r = runDoctorWithCreds([], {
    [DASH.envNames[1]!]: wrongDash,
    [specOf('GITHUB_PAT').envNames[0]!]: wrongPat,
  });
  assert.match(r.stdout, detailLine(DASH.name, 'shape mismatch[^\n]*sk-[^\n]*bailian\\.console\\.aliyun\\.com'));
  assert.match(r.stdout, detailLine('GITHUB_PAT', 'shape mismatch[^\n]*ghp_[^\n]*github\\.com/settings/tokens'));
  // 错位值同样绝不整体泄露。
  assert.ok(!r.stdout.includes(wrongDash));
  assert.ok(!r.stdout.includes(wrongPat));
});

test('别名优先：双设时以 envNames[0]（FAR_ 别名）为来源，落选值全文不出现', () => {
  const winner = 'sk-farAliasFakeW01';
  const loser = 'sk-loserNoPrint99';
  const r = runDoctorWithCreds([], {
    [DASH.envNames[0]!]: winner, // 别名（解析序首位）
    [DASH.envNames[1]!]: loser, // 落选主名
  });
  assert.match(r.stdout, detailLine(DASH.name, `${DASH.envNames[0]} set[^\n]*masked: `));
  assert.ok(r.stdout.includes(maskCredential(winner)), 'mask must be of the alias value');
  assert.ok(!r.stdout.includes(loser), 'the shadowed primary-name value must never print');
});

test('短 key（<8 字符）边界：形状前缀合法 → OK 但掩码全隐藏，一个字符都不回显', () => {
  const short = 'sk-123'; // 合法 sk- 前缀但长度 6
  const r = runDoctorWithCreds([], { [DASH.envNames[1]!]: short });
  assert.match(r.stdout, detailLine(DASH.name, 'set[^\n]*hidden \\(len 6[^)]*\\)'));
  assert.ok(!r.stdout.includes(short), 'a short credential must not be echoed in any form');
});

test('值带首尾空白 → WARN（复制粘贴伪影，提示 strip）', () => {
  const padded = `  ${FAKE_DASHSCOPE}  `;
  const r = runDoctorWithCreds([], { [DASH.envNames[1]!]: padded });
  assert.match(r.stdout, detailLine(DASH.name, 'whitespace[^\n]*strip'));
  assert.ok(!r.stdout.includes(padded));
});

test('--probe-credentials 无 key → 结构化 SKIP，不伪造探针结果，exit code 与不带 flag 一致', () => {
  const withFlag = runDoctorWithCreds(['--probe-credentials'], {});
  const noFlag = runDoctorWithCreds([], {});
  assert.match(
    withFlag.stdout,
    /credential probe \(--probe-credentials\)\n\s+[^\n]*skipped[^\n]*not set/,
  );
  // 不得出现任何伪造的成功/失败探针结论。
  assert.ok(!withFlag.stdout.includes('live ping ok'), 'must not fabricate a probe success');
  assert.ok(!withFlag.stdout.includes('live ping failed'), 'must not fabricate a probe failure');
  // exit code 不因 skip 而变（skip 是 info 不是 fail）。
  assert.equal(withFlag.status, noFlag.status, 'a skipped probe must not change the exit code');
});

test('默认（无 flag）不出现任何探针行 —— 零网络是默认契约', () => {
  const r = runDoctorWithCreds([], { [DASH.envNames[1]!]: FAKE_DASHSCOPE });
  assert.ok(!r.stdout.includes('credential probe'), 'probe must not run (or print) without --probe-credentials');
});

test('探针只瞄准 DASHSCOPE：其它 key 存在而 DASHSCOPE 缺失时仍是 skip', () => {
  const r = runDoctorWithCreds(['--probe-credentials'], { [DEEP.envNames[0]!]: FAKE_DEEPSEEK });
  assert.match(
    r.stdout,
    /credential probe \(--probe-credentials\)\n\s+[^\n]*skipped[^\n]*not set/,
  );
  assert.ok(!r.stdout.includes('live ping'), 'no probe call/result may appear without a DASHSCOPE key');
});
