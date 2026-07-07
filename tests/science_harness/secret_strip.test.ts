// tests/science_harness/secret_strip.test.ts
//
// FUSION-OS-8 端到端 RED→GREEN：spawn env secret 白名单剥离（TS 侧 buildVenvPythonEnv）+
// Python 侧 addaudithook 拒绝 dlopen/spawn（apply_env_hardening 二次 secret 剥离）。
//
// 单一真实依赖（CLAUDE.md §1）：
//   - 真实 buildVenvPythonEnv（src/science_harness/sandbox_runner.ts:159）白名单 + SECRET_ENV_PATTERN 剥离
//     （非 Fake·真实 process.env 遍历 + 正则匹配 + 白名单过滤）。
//   - 真实 venvSandboxAdapter.executeAsync（sandbox_runner.ts:388）spawn repro/science_harness/sandbox_runner.py
//     → 真实 sys.addaudithook(_far_sandbox_audit) 在用户脚本 exec 前注册（非桩·真实 PEP 578 hook）。
//
// RED→GREEN 论证：
//   RED（接线前）：buildVenvPythonEnv = { ...process.env } 全量透传 → 用户脚本经 os.environ 读到
//     OPENAI_API_KEY/DASHSCOPE_API_KEY/GITHUB_TOKEN；Python 侧无 audit hook → ctypes.CDLL/subprocess 直通。
//   GREEN（接线后）：buildVenvPythonEnv 白名单（VENV_ENV_ALLOWLIST）+ SECRET_ENV_PATTERN 剥离；
//     sandbox_runner.py apply_env_hardening 二次剥离 + addaudithook 拒绝 dlopen/spawn 事件 → sys.exit(126)。
//
// 反剧场红线（FUSION-OS-8 + CLAUDE.md §5）：来源不可自填。secret env 不透传给沙箱子进程，
// 用户脚本无法经 os.environ 读到凭证；dlopen/spawn 被审计 hook 拒绝（确定性科学复算不应加载原生库/派生子进程）。
//
// Authority: FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md §C FUSION-OS-8 +
//            FAR_LAB_MASTER_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md §4 FUSION-OS-8（secret-strip + dlopen guard 范式）。

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { delimiter, resolve } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildVenvPythonEnv, venvSandboxAdapter } from '../../src/science_harness/sandbox_runner.ts';
import type { SandboxResourceSpec } from '../../src/science_harness/types.ts';

const RESOURCES: SandboxResourceSpec = {
  cpu: { limitMillicores: 1000 },
  memory: { limitMb: 512 },
  timeoutMs: 15_000,
};

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// FUSION-OS-8 主证：TS 侧 secret 剥离 + 白名单（确定性·不 spawn·不依赖 python）。
test('api_key_not_in_sandbox_env: buildVenvPythonEnv 剥离 secret + 白名单过滤（FUSION-OS-8）', () => {
  const SECRETS: ReadonlyArray<readonly [string, string]> = [
    ['OPENAI_API_KEY', 'sk-test-openai'],
    ['PROVIDER_API_KEY', 'sk-test-provider'],
    ['ANTHROPIC_API_KEY', 'sk-ant-test'],
    ['GITHUB_TOKEN', 'ghp_test_token'],
    ['MY_SERVICE_SECRET', 'service-secret-val'],
    ['DB_PASSWORD', 'pw-test'],
    ['CLOUD_CREDENTIAL', 'cred-test'],
    ['SSH_PRIVATE_KEY', 'ssh-priv-test'],
    ['AWS_ACCESS_KEY_ID', 'AKIAtest'],
  ];
  const previousValues: Record<string, string | undefined> = {};
  for (const [key, value] of SECRETS) {
    previousValues[key] = process.env[key];
    process.env[key] = value;
  }
  try {
    const env = buildVenvPythonEnv();
    // 1. 所有 secret key 不得出现在沙箱 env（来源不可自填）。
    for (const [key] of SECRETS) {
      assert.equal(
        env[key],
        undefined,
        `secret env ${key} must be stripped from sandbox env (got: ${env[key]})`,
      );
    }
    // 2. 白名单基础项保留（Python 启动所需）。
    assert.ok(env.PYTHONPATH !== undefined, 'PYTHONPATH must be injected (whitelist)');
    assert.match(
      env.PYTHONPATH ?? '',
      /repro/,
      'PYTHONPATH must include repro/ + .python-deps/',
    );
    // 3. 非白名单、非 secret 的随机 env 也不透传（白名单严格·最小权限）。
    process.env.FAR_OS8_PROBE_NONSECRET_RANDOM = 'should-be-filtered';
    try {
      const env2 = buildVenvPythonEnv();
      assert.equal(
        env2.FAR_OS8_PROBE_NONSECRET_RANDOM,
        undefined,
        'non-whitelisted non-secret env must be filtered (strict whitelist)',
      );
    } finally {
      delete process.env.FAR_OS8_PROBE_NONSECRET_RANDOM;
    }
  } finally {
    for (const [key] of SECRETS) {
      const prev = previousValues[key];
      if (prev === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prev;
      }
    }
  }
});

// FUSION-OS-8 Python 侧物证：audit hook 拒绝 ctypes.CDLL（真实 spawn·python 缺则 skip）。
test('dlopen_rejected_by_audit_hook: ctypes.CDLL in user script → exitCode 126（FUSION-OS-8）', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }
  // libc.so.6 是 POSIX 标准库（Linux）；Windows 无标准 libc 名 → audit hook 物证在 Linux CI 验证。
  if (process.platform === 'win32') {
    t.skip('ctypes.CDLL libc probe is POSIX-only (Windows CI validates via env-strip test)');
    return;
  }
  const previous = process.env.PYTHONPATH;
  process.env.PYTHONPATH = buildPythonPath(previous);
  try {
    // ctypes.CDLL 触发 PEP 578 'ctypes.dlopen' 审计事件 → _far_sandbox_audit sys.exit(126)。
    const result = await venvSandboxAdapter.executeAsync(
      { script: 'import ctypes; ctypes.CDLL("libc.so.6")', pythonCmd: pythonCommand, seed: 42 },
      RESOURCES,
    );
    assert.equal(
      result.exitCode,
      126,
      `ctypes.CDLL must trip audit hook → exitCode 126 (got ${result.exitCode}, stderr-hash=${result.stderrHash})`,
    );
  } finally {
    restorePythonPath(previous);
  }
});

// FUSION-OS-8 Python 侧物证：secret 经 apply_env_hardening 二次剥离（真实 spawn·python 缺则 skip）。
test('secret_stripped_python_side: os.environ cannot read leaked API_KEY（FUSION-OS-8）', async (t) => {
  const pythonCommand = findPythonCommand();
  if (pythonCommand === null) {
    t.skip('python3/python is not available on PATH');
    return;
  }
  const previous = process.env.PYTHONPATH;
  const previousSecret = process.env.FAR_OS8_PROBE_API_KEY;
  // 试图注入 secret —— buildVenvPythonEnv 已剥离，Python 侧 apply_env_hardening 二次剥离。
  process.env.PYTHONPATH = buildPythonPath(previous);
  process.env.FAR_OS8_PROBE_API_KEY = 'leaked-secret-must-not-reach-sandbox';
  try {
    const result = await venvSandboxAdapter.executeAsync(
      {
        script: 'import os; print(os.environ.get("FAR_OS8_PROBE_API_KEY", "NONE"))',
        pythonCmd: pythonCommand,
        seed: 42,
      },
      RESOURCES,
    );
    assert.equal(result.exitCode, 0, `expected exit 0, stderr-hash=${result.stderrHash}`);
    // 用户脚本应打印 NONE（secret 双层剥离）—— stdout = "NONE\n"，正向断言其 sha256。
    // 若 secret 泄漏，stdout 会含 secret 明文，stdoutHash ≠ sha256("NONE\n")，断言失败。
    assert.equal(
      result.stdoutHash,
      sha256Hex('NONE\n'),
      'sandbox must print NONE (secret stripped by buildVenvPythonEnv + apply_env_hardening)',
    );
  } finally {
    restorePythonPath(previous);
    if (previousSecret === undefined) {
      delete process.env.FAR_OS8_PROBE_API_KEY;
    } else {
      process.env.FAR_OS8_PROBE_API_KEY = previousSecret;
    }
  }
});

function findPythonCommand(): string | null {
  for (const command of ['python3', 'python']) {
    const r = spawnSync(command, ['-c', 'import sys; print(sys.version)'], { encoding: 'utf8' });
    if (r.error === undefined && r.status === 0) {
      return command;
    }
  }
  return null;
}

function buildPythonPath(previous: string | undefined): string {
  const parts = [resolve('repro'), resolve('.python-deps')];
  if (previous !== undefined && previous.length > 0) {
    parts.push(previous);
  }
  return parts.join(delimiter);
}

function restorePythonPath(previous: string | undefined): void {
  if (previous === undefined) {
    delete process.env.PYTHONPATH;
  } else {
    process.env.PYTHONPATH = previous;
  }
}
