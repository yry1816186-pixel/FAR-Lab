// tests/platform/release_compat_matrix.test.ts
// REL-COMPAT-001：兼容矩阵从真实源读取 / sync fail-closed（未登记命令/版本漂移）/
// 历史证明兼容实证（legacy V1 × 当前验证器）/ CHANGELOG 结构。无 mock。

import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  COMPAT_SURFACES,
  buildCompatMatrix,
  checkChangelog,
  checkCompatMatrixSync,
  readApiVersion,
  readCliCommands,
  readExportFormats,
  readSchemaVersion,
  readSurfaceFacts,
  verifyHistoricalProof,
  type DeclaredSurfaceSnapshot,
} from '../../src/release/compat_matrix.ts';
import { CURRENT_RULESET_URI } from '../../src/proof_envelope/ruleset_version.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

test('REL-COMPAT-001 真实源读取: CLI 命令/schema 版本（测试侧独立交叉验证）', () => {
  // CLI：从 far.ts COMMANDS 声明提取（无选项名混入）
  const commands = readCliCommands(REPO_ROOT);
  assert.ok(commands.length >= 35, `CLI commands: ${commands.length}`);
  assert.ok(commands.includes('demo') && commands.includes('verify') && commands.includes('export'));
  assert.ok(commands.every((c) => !c.startsWith('-')), '无 --option 混入');
  assert.deepEqual([...commands], [...commands].sort());

  // schema：与 migrations 目录独立交叉验证（readdir 重算 max）
  const files = readdirSync(join(REPO_ROOT, 'schema', 'migrations')).filter((f) => /^\d{4}_/.test(f));
  const expectedMax = Math.max(...files.map((f) => Number.parseInt(f.slice(0, 4), 10)));
  assert.equal(readSchemaVersion(REPO_ROOT), expectedMax);
});

test('REL-COMPAT-001 真实源读取（续）: API 版本/export 格式交叉验证', () => {
  const openapi = JSON.parse(readFileSync(join(REPO_ROOT, 'schema', 'openapi.json'), 'utf8')) as {
    info: { version: string };
  };
  assert.equal(readApiVersion(REPO_ROOT), openapi.info.version);
  // 2026-08-20 起 info.version = package.json semver（SSOT·曾为硬编码日期会随发布漂移）
  assert.match(readApiVersion(REPO_ROOT), /^\d+\.\d+\.\d+$/);
  assert.deepEqual([...readExportFormats(REPO_ROOT)], ['citations', 'far-proof', 'receipt', 'receipt-v2']);
});

test('REL-COMPAT-001 矩阵: 9 surface 全覆盖 + current 来自真实源 + 迁移注记/边界非空', () => {
  const matrix = buildCompatMatrix(REPO_ROOT);
  assert.equal(matrix.length, 9);
  assert.deepEqual([...matrix.map((m) => m.surface)], [...COMPAT_SURFACES]);
  for (const entry of matrix) {
    assert.ok(entry.current.length > 0, `${entry.surface} current empty`);
    assert.ok(entry.minConsumer.length > 0, `${entry.surface} minConsumer empty`);
    assert.ok(entry.migrationNote.length > 0, `${entry.surface} migrationNote empty`);
    assert.ok(entry.breakingBoundary.length > 0, `${entry.surface} breakingBoundary empty`);
  }
  // proof surface 的 current 必须含真实 ruleset URI（非硬编码重复）
  const proof = matrix.find((m) => m.surface === 'proof');
  assert.ok(proof?.current.includes(CURRENT_RULESET_URI));
  // database surface 含真实 schema 版本号
  const db = matrix.find((m) => m.surface === 'database');
  assert.ok(db?.current.includes(`v${readSchemaVersion(REPO_ROOT)}`));
  // 未发布 surface 诚实登记 NOT_SHIPPED（非缺口掩盖）
  const sdk = matrix.find((m) => m.surface === 'sdk');
  assert.ok(sdk?.current.includes('NOT_SHIPPED'));
});

test('REL-COMPAT-001 sync: 真实源自校验过 + 未登记命令/版本漂移 fail-closed', () => {
  const facts = readSurfaceFacts(REPO_ROOT);
  assert.ok(checkCompatMatrixSync(REPO_ROOT).ok, '默认 = 真实源一致');

  const snapshot: DeclaredSurfaceSnapshot = {
    cliCommands: facts.cliCommands,
    schemaVersion: facts.schemaVersion,
    proofRulesetUri: facts.proofRulesetUri,
    apiVersion: facts.apiVersion,
    exportFormats: facts.exportFormats,
  };

  // CLI 出现矩阵未登记命令 → fail（点名该命令）
  const unregistered = checkCompatMatrixSync(REPO_ROOT, {
    ...snapshot,
    cliCommands: snapshot.cliCommands.slice(0, -1),
  });
  assert.equal(unregistered.ok, false);
  assert.ok(unregistered.problems.some((p) => p.includes('exists in source but not registered')));

  // 登记命令消失（改名/删除未同步矩阵）→ fail
  const ghost = checkCompatMatrixSync(REPO_ROOT, {
    ...snapshot,
    cliCommands: [...snapshot.cliCommands, 'far-ghost-cmd'],
  });
  assert.equal(ghost.ok, false);
  assert.ok(ghost.problems.some((p) => p.includes("'far-ghost-cmd' registered in compat matrix but missing")));

  // schema/proof/api 版本漂移 → fail
  assert.equal(checkCompatMatrixSync(REPO_ROOT, { ...snapshot, schemaVersion: snapshot.schemaVersion - 1 }).ok, false);
  assert.equal(checkCompatMatrixSync(REPO_ROOT, { ...snapshot, proofRulesetUri: 'farlab.dev/ruleset/v9' }).ok, false);
  assert.equal(checkCompatMatrixSync(REPO_ROOT, { ...snapshot, apiVersion: '1999-01-01' }).ok, false);
  // export 格式漂移 → fail
  assert.equal(checkCompatMatrixSync(REPO_ROOT, { ...snapshot, exportFormats: [...snapshot.exportFormats.slice(1)] }).ok, false);
});

test('REL-COMPAT-001 历史证明兼容: legacy V1 信封在当前验证器下重验通过', () => {
  const result = verifyHistoricalProof();
  assert.equal(result.ok, true, result.problems.join('; '));
  assert.ok(result.envelopeCount >= 1, `envelope count: ${result.envelopeCount}`);
  assert.equal(result.legacyRulesetDispatch, 'v1 (null URI → legacy dispatch)');
});

test('REL-COMPAT-001 CHANGELOG: 存在性 + Keep-a-Changelog 结构', () => {
  const check = checkChangelog(REPO_ROOT);
  assert.equal(check.ok, true, check.problems.join('; '));
  // 负向：不存在的 repo root → fail-closed
  assert.equal(checkChangelog(join(REPO_ROOT, '.far', 'nonexistent-root')).ok, false);
});
