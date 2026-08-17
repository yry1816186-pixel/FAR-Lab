// tests/scripts/novelty_wording_lint.test.mjs
//
// CORE-NOVELTY-001 措辞 lint 测试：判别力（真声明命中/序数与设计用语豁免）+
// 四规则（R1 未绑定/R2 陈旧/R3 分级不足/R4 state 非法·证据为空）+ 真实面实跑。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { lintNovelty, scanSurfaces, CONJECTURE_STATE_ORDER } from '../../scripts/novelty_wording_lint.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const CLEAN_SURFACE = {
  'README.md': [
    '# FAR-Lab',
    'The first release is not yet published.', // 序数用法——豁免
    'human approval gates are first-class records', // 设计用语——豁免
    '(scientific plausibility, novelty, plan executability) are not auto-scored', // 维度讨论——豁免
    '首次 release 发布前', // 序数——豁免
  ].join('\n'),
};

const CLAIM_SURFACE = {
  'README.md': [
    'FAR-Lab is a first-ever verification layer', // 超纲最高级
    'we deliver a breakthrough engine', // 超纲最高级
    'built on a novel approach to evidence', // novel 级（'a novel approach'）
    '本项目首创声明分级体系', // 中文超纲
  ].join('\n'),
};

test('novelty lint: 序数与设计用语零误伤（特异性反例锁定）', () => {
  const { hits, failures } = lintNovelty(CLEAN_SURFACE, null);
  assert.deepEqual(hits, []);
  assert.deepEqual(failures, []);
});

test('novelty lint: 真新颖性声明全部命中且按级要求 state', () => {
  const hits = scanSurfaces(CLAIM_SURFACE);
  assert.equal(hits.length, 4);
  const byDet = new Map(hits.map((h) => [h.detector, h]));
  assert.equal(byDet.get('first-ever').minState, 'KERNEL_ADJUDICATED');
  assert.equal(byDet.get('breakthrough').minState, 'KERNEL_ADJUDICATED');
  assert.equal(byDet.get('首创').minState, 'KERNEL_ADJUDICATED');
  assert.equal(byDet.get('novel-grade-claim').minState, 'CORROBORATED');
});

test('novelty lint R1: 无收据的新颖性声明 fail-closed', () => {
  const { failures } = lintNovelty(CLAIM_SURFACE, null);
  assert.equal(failures.length, 4);
  assert.ok(failures.every((f) => f.startsWith('R1')));
  assert.match(failures[0], /NOVELTY_RECEIPTS\.yaml/);
});

test('novelty lint R3: 收据 state 低于声明级别 → FAIL（novel 级词需 ≥CORROBORATED，first-ever 需 ≥KERNEL_ADJUDICATED）', () => {
  const receipts = `
receipts:
  - id: NV-TEST-1
    file: README.md
    pattern: "first-ever"
    state: CORROBORATED
    evidence: ["discovery registry row"]
`;
  const { failures } = lintNovelty(CLAIM_SURFACE, receipts);
  const r3 = failures.filter((f) => f.startsWith('R3'));
  assert.equal(r3.length, 1); // 只有 first-ever 那条被 CORROBORATED 收据覆盖但级别不足
  assert.match(r3[0], /KERNEL_ADJUDICATED/);
});

test('novelty lint R2/R4: 陈旧收据与非法 state/空证据 → FAIL', () => {
  const receipts = `
receipts:
  - id: NV-STALE
    file: README.md
    pattern: "never-appears-anymore"
    state: CORROBORATED
    evidence: ["x"]
  - id: NV-BADSTATE
    file: README.md
    pattern: "novel approach"
    state: SUPER_NOVEL
    evidence: ["x"]
  - id: NV-EMPTY
    file: README.md
    pattern: "breakthrough"
    state: NOVEL_VALIDATED
    evidence: []
`;
  const { failures } = lintNovelty(CLEAN_SURFACE, receipts);
  assert.ok(failures.some((f) => f.startsWith('R2') && f.includes('NV-STALE')));
  assert.ok(failures.some((f) => f.startsWith('R4') && f.includes('NV-BADSTATE')));
  assert.ok(failures.some((f) => f.startsWith('R4') && f.includes('NV-EMPTY')));
});

test('novelty lint: 足级收据全绑定 → 零失败（合法路径）', () => {
  const receipts = `
receipts:
  - id: NV-OK-1
    file: README.md
    pattern: "first-ever"
    state: KERNEL_ADJUDICATED
    evidence: ["discovery registry: KERNEL_ADJUDICATED row"]
  - id: NV-OK-2
    file: README.md
    pattern: "breakthrough"
    state: NOVEL_VALIDATED
    evidence: ["human review hr-001"]
  - id: NV-OK-3
    file: README.md
    pattern: "novel approach"
    state: CORROBORATED
    evidence: ["corroborated conjecture row"]
  - id: NV-OK-4
    file: README.md
    pattern: "首创"
    state: REDISCOVERY
    evidence: ["matching literature review"]
`;
  const { failures } = lintNovelty(CLAIM_SURFACE, receipts);
  assert.deepEqual(failures, []);
});

test('novelty lint: 梯度序与 discovery ConjectureState 同源（漂移即红）', () => {
  // 对拍 src/discovery/types.ts 的 CONJECTURE_STATES
  const discoverySrc = readFileSync(join(REPO, 'src', 'discovery', 'types.ts'), 'utf8');
  const m = /export const CONJECTURE_STATES = \[([^\]]+)\]/s.exec(discoverySrc);
  assert.ok(m !== null, 'CONJECTURE_STATES anchor moved — update lint mirror');
  const states = [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
  assert.deepEqual(CONJECTURE_STATE_ORDER, states, 'lint 梯度镜像与 discovery SSOT 漂移');
});

test('novelty lint: 真实 README 双语面实跑 PASS', () => {
  const out = execFileSync('node', [join(REPO, 'scripts', 'novelty_wording_lint.mjs')], { encoding: 'utf8' });
  assert.match(out, /PASS — \d+ novelty claim\(s\)/);
});
