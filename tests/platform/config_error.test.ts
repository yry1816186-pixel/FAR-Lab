// tests/platform/config_error.test.ts
// ENG-CONFIG-001 + ENG-ERROR-001：五层优先级/敏感 mask/实验默认 OFF/未知键门/默认 diff
// + 八类错误分类/对象契约/序列化/脱敏/目录一致性。纯函数，无 mock。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  CONFIG_LAYERS,
  CONFIG_SPECS,
  checkUnknownKeys,
  configProvenance,
  diffConfigSpecs,
  resolveConfig,
} from '../../src/platform/config.ts';
import type { ConfigSpec } from '../../src/platform/config.ts';
import {
  ERROR_CATALOG,
  ERROR_CLASSES,
  buildFarError,
  classifyErrorClass,
  exitCodeFor,
  redactErrorMessage,
  retryableFor,
  serializeFarError,
  verifyErrorCatalog,
} from '../../src/platform/errors.ts';

// ---------------------------------------------------------------------------
// ENG-CONFIG-001：优先级 / 类型 / 实验门 / 未知键 / mask / diff
// ---------------------------------------------------------------------------

test('ENG-CONFIG-001 优先级: runtime-arg > CLI > env > file > default 五层实测', () => {
  const r = resolveConfig(CONFIG_SPECS, {
    runtimeArg: { PORT: 9999 },
    cli: { PORT: 8888 },
    env: { PORT: '7777' },
    file: { PORT: 6666 },
  });
  assert.equal(r.violations.length, 0);
  const port = r.entries.find((e) => e.key === 'PORT');
  assert.deepEqual(port, { key: 'PORT', value: 9999, source: 'runtime-arg' });

  // 逐层下探
  const noArg = resolveConfig(CONFIG_SPECS, { cli: { PORT: 8888 }, env: { PORT: '7777' }, file: { PORT: 6666 } });
  assert.equal(noArg.entries.find((e) => e.key === 'PORT')?.source, 'cli');
  const noCli = resolveConfig(CONFIG_SPECS, { env: { PORT: '7777' }, file: { PORT: 6666 } });
  assert.deepEqual(noCli.entries.find((e) => e.key === 'PORT'), { key: 'PORT', value: 7777, source: 'env' });
  const onlyFile = resolveConfig(CONFIG_SPECS, { file: { PORT: 6666 } });
  assert.equal(onlyFile.entries.find((e) => e.key === 'PORT')?.source, 'file');
  const nothing = resolveConfig(CONFIG_SPECS, {});
  assert.deepEqual(nothing.entries.find((e) => e.key === 'PORT'), { key: 'PORT', value: 3000, source: 'default' });
});

test('ENG-CONFIG-001 fail-closed: 类型不符列名层位；实验键从 env/file 开启被拒（默认 OFF 红线）', () => {
  const bad = resolveConfig(CONFIG_SPECS, { env: { PORT: 'not-a-number' } });
  assert.equal(bad.violations.length, 1);
  assert.equal(bad.violations[0]?.key, 'PORT');
  assert.equal(bad.violations[0]?.layer, 'env');

  // 实验键 FAR_SESSION_RECORD：env 开 → 拒 + 落回默认 false
  const expEnv = resolveConfig(CONFIG_SPECS, { env: { FAR_SESSION_RECORD: 'true' } });
  assert.ok(expEnv.violations.some((v) => v.key === 'FAR_SESSION_RECORD' && v.message.includes('experimental')));
  assert.equal(expEnv.entries.find((e) => e.key === 'FAR_SESSION_RECORD')?.value, false, '实验键回默认 OFF');

  // CLI 显式开 → 放行（宪法：explicit/CLI 可开）
  const expCli = resolveConfig(CONFIG_SPECS, { cli: { FAR_SESSION_RECORD: true } });
  assert.ok(!expCli.violations.some((v) => v.key === 'FAR_SESSION_RECORD'));
  assert.equal(expCli.entries.find((e) => e.key === 'FAR_SESSION_RECORD')?.value, true);
});

test('ENG-CONFIG-001 未知键门 + 敏感 mask + 来源谱系可复现', () => {
  assert.deepEqual(checkUnknownKeys(['FAR_RETRIEVAL_CACHE', 'TOTALLY_UNKNOWN_KEY']), ['TOTALLY_UNKNOWN_KEY']);
  // 扫描器纪律：测试不引用真实凭据键（DASHSCOPE 族全禁）——本地敏感规格走同一代码路径
  const localSpecs: readonly ConfigSpec[] = [
    { key: 'TEST_API_KEY', type: 'string', defaultValue: '', sensitive: true, experimental: false, description: '测试敏感键' },
    { key: 'TEST_CACHE', type: 'boolean', defaultValue: true, sensitive: false, experimental: false, description: '测试开关' },
  ];
  const secretProbe = `${'sk-' + 'realsecretvalue1234567890'}`;
  const r = resolveConfig(localSpecs, { env: { TEST_API_KEY: secretProbe, TEST_CACHE: 'false' } });
  const prov = configProvenance(r, localSpecs);
  const keyProv = prov.find((p) => p.key === 'TEST_API_KEY');
  assert.equal(keyProv?.value, '***', '敏感值全 mask（长度不泄露）');
  assert.equal(keyProv?.sensitive, true);
  const cacheProv = prov.find((p) => p.key === 'TEST_CACHE');
  assert.equal(cacheProv?.value, false);
  assert.equal(cacheProv?.source, 'env');
  // 可复现：同层同值 → 同谱系
  const again = configProvenance(resolveConfig(localSpecs, { env: { TEST_API_KEY: secretProbe, TEST_CACHE: 'false' } }), localSpecs);
  assert.equal(JSON.stringify(again), JSON.stringify(prov));
});

test('ENG-CONFIG-001 默认 diff: 新增/变更/删除全部检出（默认值变化需 diff 的机器面）', () => {
  const before: readonly ConfigSpec[] = [
    { key: 'A', type: 'boolean', defaultValue: true, sensitive: false, experimental: false, description: 'd' },
    { key: 'B', type: 'string', defaultValue: 'x', sensitive: false, experimental: false, description: 'd' },
    { key: 'C', type: 'boolean', defaultValue: false, sensitive: false, experimental: false, description: 'd' },
  ];
  const after: readonly ConfigSpec[] = [
    { key: 'A', type: 'boolean', defaultValue: false, sensitive: false, experimental: false, description: 'd' },
    { key: 'B', type: 'string', defaultValue: 'x', sensitive: false, experimental: false, description: 'd' },
    { key: 'D', type: 'number', defaultValue: 1, sensitive: false, experimental: false, description: 'd' },
  ];
  const diff = diffConfigSpecs(before, after);
  assert.ok(diff.some((d) => d.key === 'A' && d.change.includes('true→false')));
  assert.ok(diff.some((d) => d.key === 'D' && d.change.includes('added')));
  assert.ok(diff.some((d) => d.key === 'C' && d.change.includes('removed')));
  assert.ok(!diff.some((d) => d.key === 'B'), '未变键不出现在 diff');
});

// ---------------------------------------------------------------------------
// ENG-ERROR-001：八类 / 对象契约 / 序列化 / 脱敏 / 分类 / 目录
// ---------------------------------------------------------------------------

test('ENG-ERROR-001: 八类枚举与 retryability/exitCode SSOT 全覆盖', () => {
  assert.equal(ERROR_CLASSES.length, 8);
  assert.deepEqual(CONFIG_LAYERS, ['runtime-arg', 'cli', 'env', 'file', 'default']);
  for (const cls of ERROR_CLASSES) {
    assert.equal(typeof retryableFor(cls), 'boolean');
    assert.ok([1, 2, 3, 7].includes(exitCodeFor(cls)), `${cls} exit code mapped`);
  }
  assert.equal(retryableFor('transient'), true);
  assert.equal(retryableFor('budget_exhausted'), false, '预算耗尽重试无意义');
  assert.equal(exitCodeFor('invalid_input'), 2);
  assert.equal(exitCodeFor('policy_blocked'), 7);
  assert.equal(exitCodeFor('degraded'), 3, '降级不冒充完成（3=IMPLEMENTED_UNVERIFIED 语义）');
});

test('ENG-ERROR-001 对象: 构造强制脱敏 + retryable 推导 + cause 链一层', () => {
  const e = buildFarError({
    code: 'MODEL_CALL_FAILED',
    cls: 'transient',
    message: `provider 429 with key ${'sk-' + 'abcdef1234567890abcdef'} in header`,
    remediation: '退避重试',
    requestId: 'req-9',
    cause: { code: 'RATE_LIMITED_OR_TIMEOUT', message: 'http 429' },
  });
  assert.ok(!e.message.includes('sk-abcdef'), '构造即脱敏');
  assert.match(e.message, /redacted/);
  assert.equal(e.retryable, true);
  assert.equal(e.cause?.code, 'RATE_LIMITED_OR_TIMEOUT');

  // 坏 code 形状拒
  assert.throws(() => buildFarError({ code: 'bad-code', cls: 'transient', message: 'x', remediation: 'y' }));
});

test('ENG-ERROR-001 序列化: stable key 序确定性（同对象同串）', () => {
  const e1 = buildFarError({ code: 'A_B', cls: 'invalid_input', message: 'm', details: { z: 1, a: 2 }, remediation: 'r' });
  const e2 = buildFarError({ code: 'A_B', cls: 'invalid_input', message: 'm', details: { a: 2, z: 1 }, remediation: 'r' });
  assert.equal(serializeFarError(e1), serializeFarError(e2), 'key 序稳定');
});

test('ENG-ERROR-001 分类: 既有 classifyErrorKind 语义并入 + 八类抽验', () => {
  assert.equal(classifyErrorClass({ message: 'HTTP 429 too many requests' }).cls, 'transient');
  assert.equal(classifyErrorClass({ message: 'rate limit exceeded' }).cls, 'transient');
  assert.equal(classifyErrorClass({ message: 'not valid JSON from model' }).cls, 'invalid_input');
  assert.equal(classifyErrorClass({ message: 'cost budget exceeded: 10000 tokens' }).cls, 'budget_exhausted');
  assert.equal(classifyErrorClass({ message: 'checkpoint schemaVersion 2 is newer than supported 1' }).cls, 'unsupported_version');
  assert.equal(classifyErrorClass({ message: 'hash mismatch at seq 3 (tampered)' }).cls, 'fatal_integrity');
  assert.equal(classifyErrorClass({ message: 'personal data denied by default' }).cls, 'policy_blocked');
  assert.equal(classifyErrorClass({ message: 'something totally unexpected' }).cls, 'permanent');
  // HTTP 结构信号优先
  assert.equal(classifyErrorClass({ message: 'oops', httpStatus: 429 }).cls, 'transient');
});

test('ENG-ERROR-001 目录: 一致性校验过 + 分类产物全在册（目录即契约）', () => {
  const check = verifyErrorCatalog();
  assert.equal(check.ok, true, JSON.stringify(check.problems));
  const codes = new Set(ERROR_CATALOG.map((e) => e.code));
  for (const signal of ['HTTP 429', 'not valid JSON', 'cost budget exceeded', 'newer than supported', 'hash mismatch']) {
    const cls = classifyErrorClass({ message: signal });
    assert.ok(codes.has(cls.code), `分类产物 '${cls.code}' 必须在目录`);
  }
});

test('ENG-ERROR-001 脱敏函数: 密钥形状整体替换；干净消息原样', () => {
  assert.match(redactErrorMessage('failed with ghp_abcdef1234567890abcdef1234567890abcd'), /redacted: github token/);
  assert.equal(redactErrorMessage('plain failure message'), 'plain failure message');
});
