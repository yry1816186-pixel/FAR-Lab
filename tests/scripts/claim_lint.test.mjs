/**
 * claim_lint 测试（CORE-REALITY-001 / CORE-CLAIM-001 执法面）。
 *
 * 覆盖：
 *   R1 无收据声明 → FAIL；R2 陈旧收据（pattern 不再匹配）→ FAIL；
 *   R3 superlative 缺 fcsRef → FAIL，带合法 fcsRef + FCS 存在 → PASS；
 *   R4 evidence 空 / lastVerifiedAt 缺失 → FAIL；
 *   真实仓库面：README 双语声明全部绑定（manifest tracked，恒可执行）。
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 桩返回。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkClaims } from '../../scripts/claim_lint.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');

const BASE_MANIFEST = `surfaces:
  - README.md
receipts:
  - id: T-CLAIM-1
    file: README.md
    pattern: "23 detectors"
    summary: " detectors"
    superlative: false
    fcsRef: null
    lastVerifiedAt: "2026-08-17"
    evidence:
      - "node -e 1"
`;

const BASE_FILES = {
  'README.md': '# readme\n\nWe have 23 detectors and 42 CLI commands here.\n',
};

test('R1: bound claim line passes', () => {
  const result = checkClaims({ manifestText: BASE_MANIFEST, files: BASE_FILES, fcsFiles: {} });
  assert.equal(result.ok, false, 'unbound 42 CLI commands line must fail');
  assert.ok(result.findings.some((f) => f.includes('无收据声明')), JSON.stringify(result.findings));
});

test('R1: full binding passes when every detected line is receipted', () => {
  const manifest = BASE_MANIFEST.replace(
    'evidence:\n      - "node -e 1"',
    'evidence:\n      - "node -e 1"\n  - id: T-CLAIM-2\n    file: README.md\n    pattern: "42 CLI commands"\n    summary: "cli"\n    superlative: false\n    fcsRef: null\n    lastVerifiedAt: "2026-08-17"\n    evidence:\n      - "node src/cli/far.ts --help"'
  );
  const result = checkClaims({ manifestText: manifest, files: BASE_FILES, fcsFiles: {} });
  assert.equal(result.ok, true, JSON.stringify(result.findings));
  assert.equal(result.stats.claimOccurrences, 2, '一行两个声明 = 两个出现处');
});

test('R2: stale receipt (pattern no longer matches) fails', () => {
  const manifest = BASE_MANIFEST.replace('pattern: "23 detectors"', 'pattern: "99 detectors"');
  const result = checkClaims({ manifestText: manifest, files: BASE_FILES, fcsFiles: {} });
  assert.ok(result.findings.some((f) => f.includes('陈旧收据')), JSON.stringify(result.findings));
});

test('R3: superlative occurrence requires superlative:true receipt + valid fcsRef', () => {
  const superlativeFiles = { 'README.md': 'Our kernel is world-class and has 23 detectors.\n' };
  const manifest = BASE_MANIFEST.replace('pattern: "23 detectors"', 'pattern: "world-class"');
  const dodged = checkClaims({ manifestText: manifest, files: superlativeFiles, fcsFiles: {} });
  assert.ok(
    dodged.findings.some((f) => f.includes('superlative 声明无合法收据')),
    'superlative:false 自报不得逃逸 FCS 绑定: ' + JSON.stringify(dodged.findings)
  );

  const lawful = manifest
    .replace('superlative: false', 'superlative: true')
    .replace('fcsRef: null', 'fcsRef: milestone-competition-2026')
    .concat(
      '  - id: T-CLAIM-UNIT\n    file: README.md\n    pattern: "23 detectors"\n    summary: "u"\n    superlative: false\n    fcsRef: null\n    lastVerifiedAt: "2026-08-17"\n    evidence:\n      - "node -e 1"\n'
    );
  const okResult = checkClaims({
    manifestText: lawful,
    files: superlativeFiles,
    fcsFiles: { 'ci/FCS-milestone-competition-2026.yaml': true },
  });
  assert.equal(okResult.ok, true, JSON.stringify(okResult.findings));

  const missingFcsFile = checkClaims({ manifestText: lawful, files: superlativeFiles, fcsFiles: {} });
  assert.ok(missingFcsFile.findings.some((f) => f.includes('无合法收据') || f.includes('无对应 FCS')), JSON.stringify(missingFcsFile.findings));
});

test('R4: empty evidence or missing lastVerifiedAt fails', () => {
  const noEvidence = BASE_MANIFEST.replace('    evidence:\n      - "node -e 1"\n', '    evidence: []\n');
  const result = checkClaims({ manifestText: noEvidence, files: BASE_FILES, fcsFiles: {} });
  assert.ok(result.findings.some((f) => f.includes('evidence 为空')), JSON.stringify(result.findings));
  const noDate = BASE_MANIFEST.replace('lastVerifiedAt: "2026-08-17"', 'lastVerifiedAt: ""');
  const result2 = checkClaims({ manifestText: noDate, files: BASE_FILES, fcsFiles: {} });
  assert.ok(result2.findings.some((f) => f.includes('lastVerifiedAt 缺失')));
});

test('real repo: README surfaces fully bound and CLI exits 0', () => {
  const manifestText = readFileSync(join(repoRoot, 'ci', 'CLAIM_RECEIPTS.yaml'), 'utf8');
  const files = {
    'README.md': readFileSync(join(repoRoot, 'README.md'), 'utf8'),
    'README.zh-CN.md': readFileSync(join(repoRoot, 'README.zh-CN.md'), 'utf8'),
  };
  const result = checkClaims({
    manifestText,
    files,
    fcsFiles: { 'ci/FCS-milestone-competition-2026.yaml': true },
  });
  assert.equal(result.ok, true, JSON.stringify(result.findings, null, 2));
  // 阈值=4（2026-08-18 治理修剪：README 移除 LIVE snapshot 表后，unit 直连模式
  // （数字+单位词）命中从 5 降至 4——"14 golden vectors"/"42 CLI commands" 因中间词
  // 不属直连不计。断言意图=声明面非空洞，机制验证由 ok=true + 下方 CLI PASS 承担。
  assert.ok(result.stats.claimOccurrences >= 4, 'README 双语声明面应有 >=4 个声明出现处被检测');

  const stdout = execFileSync('node', [join(repoRoot, 'scripts', 'claim_lint.mjs')], { cwd: repoRoot, encoding: 'utf8' });
  assert.match(stdout, /claim_lint: PASS/);
});
