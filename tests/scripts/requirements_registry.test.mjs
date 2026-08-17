/**
 * requirements_registry 编译器测试（GOV-COMPILE-001 / GOV-LINT-001 / GOV-DERIVE-001）。
 *
 * 覆盖契约：
 *   1. 编译：区块提取、稳定排序、requirementSchema 必填字段、源行映射（lineStart/lineEnd/heading）；
 *   2. 推断：modal（MUST/MUST_NOT/SHOULD/MAY）、acceptance.method、evidence.kind、failure.status；
 *   3. 状态：默认 FAIL（无 receipt = 未通过门禁），status_input.json 合并；
 *   4. lint：重复 ID / 悬空引用 / 依赖环 / T0 DEFERRED / T0 缺 evidence 全部被阻断；
 *   5. 确定性：两次编译字节一致；视图文件不含时间戳（GOV-DERIVE-001 再生成无 diff）；
 *   6. CLI：exit 0/1/3 语义 + --check 手工漂移检测；
 *   7. 真实宪法冒烟（.far/constitution 存在时）：180 条、T0=125/T1=49/T2=3/T3=3、lint PASS。
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 桩返回 / 双重断言。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compileRegistry,
  lintRegistry,
  loadBlockPattern,
  renderAcceptanceYaml,
  renderCoverageYaml,
  renderGatesYaml,
  renderOwnerMapYaml,
  renderRequirementsYaml,
} from '../../scripts/requirements_registry.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const fixtureDir = join(here, 'fixtures', 'requirements_registry');
const realConstitutionDir = join(repoRoot, '.far', 'constitution');

const SCHEMA_TEXT = readFileSync(join(fixtureDir, 'MACHINE_SCHEMAS.yaml'), 'utf8');
const CORE_TEXT = readFileSync(join(fixtureDir, 'CORE_CONSTITUTION.md'), 'utf8');
const DOMAIN_TEXT = readFileSync(join(fixtureDir, 'DOMAIN_PROTOCOLS.md'), 'utf8');

function compileFixture(overrides = {}) {
  const pattern = loadBlockPattern(SCHEMA_TEXT);
  assert.equal(pattern.ok, true, `fixture pattern must load: ${pattern.ok ? '' : pattern.error}`);
  return compileRegistry({
    coreText: overrides.coreText ?? CORE_TEXT,
    coreFile: 'CORE_CONSTITUTION.md',
    domainText: overrides.domainText ?? DOMAIN_TEXT,
    domainFile: 'DOMAIN_PROTOCOLS.md',
    pattern: pattern.pattern,
    statusInput: overrides.statusInput ?? null,
  });
}

test('compile: extracts 6 requirements with stable cross-file ordering', () => {
  const registry = compileFixture();
  assert.equal(registry.ok, true);
  assert.deepEqual(
    registry.requirements.map((r) => r.id),
    ['FIC-CORE-001', 'FIC-CORE-002', 'FIC-CORE-003', 'FIC-CORE-004', 'FIC-DOM-001', 'FIC-DOM-002']
  );
});

test('compile: every requirement satisfies requirementSchema required fields', () => {
  const registry = compileFixture();
  const requiredKeys = ['id', 'source', 'title', 'modal', 'tier', 'owner', 'scope', 'requirement', 'acceptance', 'evidence', 'failure', 'status'];
  for (const req of registry.requirements) {
    for (const key of requiredKeys) assert.ok(req[key] !== undefined, `${req.id} missing ${key}`);
    assert.ok(req.id.startsWith('FIC-'));
    assert.deepEqual(Object.keys(req.source).sort(), ['file', 'heading', 'lineEnd', 'lineStart', 'sourceHash']);
    assert.ok(req.source.sourceHash.length === 64, `${req.id} sourceHash must be sha256 hex`);
    for (const acc of req.acceptance) {
      assert.ok(acc.id.length > 0 && acc.expected.length > 0, `${req.id} acceptance entry incomplete`);
      assert.ok(['command', 'test', 'review', 'experiment', 'inspection', 'policy_check', 'external_verification'].includes(acc.method));
    }
    for (const ev of req.evidence) {
      assert.ok(ev.locator.length > 0, `${req.id} evidence locator empty`);
    }
  }
});

test('compile: source-line mapping is exact against fixture text', () => {
  const registry = compileFixture();
  const first = registry.requirements[0];
  const coreLines = CORE_TEXT.split('\n');
  const headingIndex = coreLines.findIndex((l) => l.includes('[REQ:FIC-CORE-001]'));
  assert.equal(first.source.lineStart, headingIndex + 1, 'lineStart must be 1-based heading line');
  assert.equal(first.source.heading, '0. 使用契约 > 0.1 层');
  const bodyLine = coreLines[first.source.lineEnd - 1];
  assert.ok(bodyLine.includes('撤回相关声明'), 'lineEnd must land on the failure bullet, got: ' + JSON.stringify(bodyLine));
});

test('compile: modal inference MUST / MUST_NOT / SHOULD / MAY', () => {
  const registry = compileFixture();
  const modalById = Object.fromEntries(registry.requirements.map((r) => [r.id, r.modal]));
  assert.equal(modalById['FIC-CORE-001'], 'MUST');
  assert.equal(modalById['FIC-CORE-002'], 'MUST_NOT');
  assert.equal(modalById['FIC-CORE-003'], 'SHOULD');
  assert.equal(modalById['FIC-CORE-004'], 'MAY');
});

test('compile: cross-references parse into dependsOn / conflictsWith', () => {
  const registry = compileFixture();
  const byId = Object.fromEntries(registry.requirements.map((r) => [r.id, r]));
  assert.deepEqual(byId['FIC-CORE-002'].dependsOn, ['FIC-CORE-001']);
  assert.deepEqual(byId['FIC-DOM-002'].conflictsWith, ['FIC-CORE-004']);
});

test('compile: bare-status failure line falls back to raw text (no hollow consequence)', () => {
  const registry = compileFixture();
  const byId = Object.fromEntries(registry.requirements.map((r) => [r.id, r]));
  assert.equal(byId['FIC-DOM-001'].failure.status, 'FAIL');
  assert.equal(byId['FIC-DOM-001'].failure.consequence, '`FAIL`。', 'status-only line must keep raw text');
  assert.ok(byId['FIC-CORE-001'].failure.consequence.startsWith('撤回相关声明'), 'long line keeps cleaned consequence');
});

test('compile: status defaults to FAIL and merges status_input.json', () => {
  const defaults = compileFixture();
  assert.ok(defaults.requirements.every((r) => r.status === 'FAIL' && r.lastVerifiedAt === null));
  const merged = compileFixture({
    statusInput: {
      'FIC-CORE-001': { status: 'PASS', lastVerifiedAt: '2026-08-17T00:00:00Z', lastVerifiedCommit: 'abc123', lastEvidence: ['receipt.md'] },
    },
  });
  const pass = merged.requirements.find((r) => r.id === 'FIC-CORE-001');
  assert.equal(pass.status, 'PASS');
  assert.equal(pass.lastVerifiedCommit, 'abc123');
  assert.deepEqual(pass.lastEvidence, ['receipt.md']);
  assert.equal(merged.requirements.find((r) => r.id === 'FIC-CORE-002').status, 'FAIL');
});

test('compile: acceptance method classifier (test / command / inspection)', () => {
  const registry = compileFixture();
  const byId = Object.fromEntries(registry.requirements.map((r) => [r.id, r]));
  assert.equal(byId['FIC-CORE-001'].acceptance[0].method, 'command', 'claim-lint prefix → command');
  assert.equal(byId['FIC-CORE-002'].acceptance[0].method, 'test', '测试 keyword → test');
  assert.equal(byId['FIC-CORE-003'].acceptance[0].method, 'test', 'state machine 测试 → test');
});

test('lint: passes on the clean fixture', () => {
  const lint = lintRegistry(compileFixture());
  assert.equal(lint.ok, true, JSON.stringify(lint.findings));
});

test('lint: blocks duplicate REQ-ID', () => {
  const duplicated = compileFixture({ coreText: CORE_TEXT + CORE_TEXT.split('\n').slice(5, 12).join('\n') + '\n' });
  const lint = lintRegistry(duplicated);
  assert.equal(lint.ok, false);
  assert.ok(lint.findings.some((f) => f.includes('duplicate REQ-ID')), JSON.stringify(lint.findings));
});

test('lint: blocks dangling dependsOn reference', () => {
  const broken = CORE_TEXT.replace('Depends: FIC-CORE-001', 'Depends: FIC-GHOST-999');
  const lint = lintRegistry(compileFixture({ coreText: broken }));
  assert.equal(lint.ok, false);
  assert.ok(lint.findings.some((f) => f.includes('dangling reference "FIC-GHOST-999"')), JSON.stringify(lint.findings));
});

test('lint: blocks dependency cycle', () => {
  const core = CORE_TEXT.replace('Depends: FIC-CORE-001', 'Depends: FIC-DOM-001');
  const domain = DOMAIN_TEXT.replace(
    '- 研究问题必须有边界和验收判据。',
    '- 研究问题必须有边界和验收判据。\n- Depends: FIC-CORE-002'
  );
  const lint = lintRegistry(compileFixture({ coreText: core, domainText: domain }));
  assert.equal(lint.ok, false);
  assert.ok(lint.findings.some((f) => f.includes('dependency cycle')), JSON.stringify(lint.findings));
});

test('lint: blocks T0 DEFERRED and missing evidence (schema minItems applies to all tiers)', () => {
  const deferred = lintRegistry(
    compileFixture({ statusInput: { 'FIC-CORE-001': { status: 'DEFERRED' } } })
  );
  assert.ok(deferred.findings.some((f) => f.includes('FIC-CORE-001: T0 must not be DEFERRED')));
  const noEvidence = CORE_TEXT.replace('- Evidence：claim-lint report、acceptance receipts、commit fingerprint\n', '');
  const stripped = lintRegistry(compileFixture({ coreText: noEvidence }));
  assert.ok(stripped.findings.some((f) => f.includes('FIC-CORE-001: missing evidence')));
});

test('compile: near-miss REQ heading fails the compile (spec source wins)', () => {
  const corrupted = CORE_TEXT + '\n### [REQ:FIC-BROKEN-001][TX][owner:x][scope:y] malformed tier\n';
  const registry = compileFixture({ coreText: corrupted });
  assert.equal(registry.ok, false);
  assert.ok(
    registry.parseErrors.some((e) => e.includes('malformed requirement heading') && e.includes('FIC-BROKEN-001')),
    JSON.stringify(registry.parseErrors)
  );
});

const renderAllViews = (registry) => ({
  REQUIREMENTS: renderRequirementsYaml(registry),
  ACCEPTANCE: renderAcceptanceYaml(registry),
  COVERAGE: renderCoverageYaml(registry),
  OWNER_MAP: renderOwnerMapYaml(registry),
  GATES: renderGatesYaml(registry),
});

test('determinism: double compile renders byte-identical views without timestamps', () => {
  const a = renderAllViews(compileFixture());
  const b = renderAllViews(compileFixture());
  for (const name of Object.keys(a)) {
    assert.equal(a[name], b[name], `${name} must be deterministic`);
    assert.doesNotMatch(a[name], /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, `${name} must not embed timestamps (GOV-DERIVE-001)`);
  }
});

test('views: GATES tier counts and OWNER_MAP grouping derive from registry', () => {
  const views = renderAllViews(compileFixture());
  assert.match(views.GATES, /total: 3/);
  assert.match(views.GATES, /total: 2/);
  assert.match(views.OWNER_MAP, /owner: core/);
  assert.match(views.OWNER_MAP, /requirementCount: 1/);
  assert.match(views.COVERAGE, /requirements: 6/);
  assert.match(views.COVERAGE, /section: A\. 科学协议/);
});

test('YAML structure: top-level requirements list and per-req key ordering', () => {
  const yaml = renderRequirementsYaml(compileFixture());
  assert.match(yaml, /^requirements:\n {2}-\n {4}id: FIC-CORE-001\n/m);
  assert.match(yaml, / {4}tier: T0\n/);
  assert.match(yaml, / {4}scope:\n {6}- all\n/);
  assert.match(yaml, / {4}status: FAIL\n/);
});

function runCli(args, cwd = repoRoot) {
  try {
    const stdout = execFileSync('node', [join(repoRoot, 'scripts', 'requirements_compile.mjs'), ...args], {
      cwd,
      encoding: 'utf8',
    });
    return { code: 0, stdout };
  } catch (err) {
    return { code: err.status ?? 1, stdout: String(err.stdout ?? '') + String(err.stderr ?? '') };
  }
}

test('CLI: happy path writes five views + receipt, rerun and --check are stable', () => {
  const out = mkdtempSync(join(tmpdir(), 'far-req-cli-'));
  try {
    const first = runCli(['--src', fixtureDir, '--out', out]);
    assert.equal(first.code, 0, first.stdout);
    for (const name of ['REQUIREMENTS.yaml', 'ACCEPTANCE.yaml', 'COVERAGE.yaml', 'OWNER_MAP.yaml', 'GATES.yaml', 'COMPILE_RECEIPT.json']) {
      assert.ok(existsSync(join(out, name)), `${name} missing`);
    }
    const receipt = JSON.parse(readFileSync(join(out, 'COMPILE_RECEIPT.json'), 'utf8'));
    assert.equal(receipt.counts.requirements, 6);
    assert.deepEqual(receipt.counts.byTier, { T0: 3, T1: 2, T2: 1, T3: 0 });
    const before = readFileSync(join(out, 'REQUIREMENTS.yaml'), 'utf8');
    runCli(['--src', fixtureDir, '--out', out, '--quiet']);
    assert.equal(readFileSync(join(out, 'REQUIREMENTS.yaml'), 'utf8'), before, 'rerun must be byte-identical');
    const check = runCli(['--src', fixtureDir, '--out', out, '--check']);
    assert.equal(check.code, 0, check.stdout);
    writeFileSync(join(out, 'REQUIREMENTS.yaml'), 'requirements: [] # manual edit\n', 'utf8');
    const drift = runCli(['--src', fixtureDir, '--out', out, '--check']);
    assert.equal(drift.code, 1, 'manual drift must exit 1');
    assert.ok(drift.stdout.includes('DRIFT'));
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

test('CLI: lint failure exits 1, missing constitution exits 3 (fail-closed)', () => {
  const badSrc = mkdtempSync(join(tmpdir(), 'far-req-bad-'));
  const out = mkdtempSync(join(tmpdir(), 'far-req-badout-'));
  try {
    mkdirSync(join(badSrc, 'inner'), { recursive: true });
    writeFileSync(join(badSrc, 'inner', 'MACHINE_SCHEMAS.yaml'), SCHEMA_TEXT, 'utf8');
    writeFileSync(
      join(badSrc, 'inner', 'CORE_CONSTITUTION.md'),
      CORE_TEXT.replace('Depends: FIC-CORE-001', 'Depends: FIC-GHOST-999'),
      'utf8'
    );
    writeFileSync(join(badSrc, 'inner', 'DOMAIN_PROTOCOLS.md'), DOMAIN_TEXT, 'utf8');
    const lintFail = runCli(['--src', join(badSrc, 'inner'), '--out', out]);
    assert.equal(lintFail.code, 1);
    assert.ok(lintFail.stdout.includes('dangling reference'));

    const missing = runCli(['--src', join(badSrc, 'nowhere'), '--out', out]);
    assert.equal(missing.code, 3);
    assert.ok(missing.stdout.includes('constitution source missing'));
  } finally {
    rmSync(badSrc, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
  }
});

test('real constitution smoke: 180 requirements, T0=125/T1=49/T2=3/T3=3, lint PASS, idempotent', { skip: !existsSync(realConstitutionDir) }, () => {
  const schemas = readFileSync(join(realConstitutionDir, 'MACHINE_SCHEMAS.yaml'), 'utf8');
  const pattern = loadBlockPattern(schemas);
  assert.equal(pattern.ok, true, pattern.ok ? '' : pattern.error);
  const compileOnce = () =>
    compileRegistry({
      coreText: readFileSync(join(realConstitutionDir, 'CORE_CONSTITUTION.md'), 'utf8'),
      coreFile: 'CORE_CONSTITUTION.md',
      domainText: readFileSync(join(realConstitutionDir, 'DOMAIN_PROTOCOLS.md'), 'utf8'),
      domainFile: 'DOMAIN_PROTOCOLS.md',
      pattern: pattern.pattern,
      statusInput: null,
    });
  const registry = compileOnce();
  assert.equal(registry.requirements.length, 180, 'must match validate_prompt.py requirement count');
  const byTier = { T0: 0, T1: 0, T2: 0, T3: 0 };
  for (const req of registry.requirements) byTier[req.tier] += 1;
  assert.deepEqual(byTier, { T0: 125, T1: 49, T2: 3, T3: 3 }, 'must match validate_prompt.py tier split');
  const lint = lintRegistry(registry);
  assert.equal(lint.ok, true, JSON.stringify(lint.findings.slice(0, 10)));
  assert.equal(renderRequirementsYaml(registry), renderRequirementsYaml(compileOnce()), 'real compile must be idempotent');
  // modal 标题优先的真实反例：正文含「禁止手工双写」但标题主义务是「只能由规范源编译」→ MUST
  const govCompile = registry.requirements.find((r) => r.id === 'GOV-COMPILE-001');
  assert.equal(govCompile.modal, 'MUST', 'title-level obligation must win over in-body prohibition');
  // 短失败行回退：GOV-COMPILE-001 的 Failure 是「T0 `FAIL`。」——consequence 必须保义不空壳
  assert.ok(govCompile.failure.consequence.includes('T0'), 'short failure line falls back to raw text');
});
