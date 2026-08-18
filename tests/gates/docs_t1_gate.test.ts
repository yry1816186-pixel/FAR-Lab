// tests/gates/docs_t1_gate.test.ts
// DOC-DIATAXIS-001：tracked 公开文档面按用户任务组织（14 维覆盖）+ 相对链接完整性 +
// 文档↔CLI 一致性门接线。幽灵根必须红。

import { strict as assert } from 'node:assert';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  DIATAXIS_DIMENSIONS,
  checkDiaxiaStructure,
  extractMarkdownLinks,
  rootLinkIntegrity,
} from '../../src/gates/docs_t1_gate.ts';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const PHANTOM = 'C:/phantom-root-docs';

// ---------------------------------------------------------------------------
// 结构覆盖（真实仓库 tracked 公开面）
// ---------------------------------------------------------------------------

test('DOC-DIATAXIS-001: 13 个任务维度全部由 tracked 公开文档锚点覆盖', () => {
  assert.equal(DIATAXIS_DIMENSIONS.length, 13);
  const r = checkDiaxiaStructure(REPO_ROOT);
  assert.equal(r.ok, true, r.problems.join('; '));
  assert.ok(r.evidence.some((e) => e.includes('13/13')), '维度覆盖计数证据行缺失');
  assert.ok(r.evidence.some((e) => e.includes('doc_command_check')), '文档可测性证据行缺失');
  assert.equal(r.declaredGaps.length >= 1, true, '内容准确性/外链活性不在离线机器判定范围——须声明');
  assert.equal(checkDiaxiaStructure(PHANTOM).ok, false);
});

// ---------------------------------------------------------------------------
// 链接完整性（真实根文档 + 合成夹具双向）
// ---------------------------------------------------------------------------

test('DOC-DIATAXIS-001: 根级公开文档相对链接零断链（含锚点剥离）', () => {
  const r = rootLinkIntegrity(REPO_ROOT);
  assert.equal(r.ok, true, r.broken.map((b) => `${b.file}: ${b.target}`).join('\n'));
  assert.ok(r.checked >= 8, `应检查 ≥8 个根文档，实际 ${r.checked}`);
});

test('DOC-DIATAXIS-001 机制: 断链检出（合成夹具）+ 外链/纯锚点/邮件跳过', () => {
  const tmp = join(tmpdir(), `far-docs-links-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, 'README.md'), [
    '# t',
    '',
    '[good](CONTRIBUTING.md)',
    '[anchor](CONTRIBUTING.md#setup)',
    '[ext](https://example.com/x)',
    '[mail](mailto:a@b.c)',
    '[self](#section)',
    '[broken](MISSING.md)',
    '[dir](docs-sub/)',
    '',
  ].join('\n'));
  mkdirSync(join(tmp, 'docs-sub'));
  writeFileSync(join(tmp, 'CONTRIBUTING.md'), '# c\n');

  const links = extractMarkdownLinks(join(tmp, 'README.md'));
  assert.equal(links.length, 7);
  const r = rootLinkIntegrity(tmp);
  assert.equal(r.ok, false);
  assert.equal(r.broken.length, 1);
  assert.equal(r.broken[0]?.target, 'MISSING.md');
  rmSync(tmp, { recursive: true, force: true });
});

test('DOC-DIATAXIS-001: 缺一个维度的仓库必须被检出（合成缺 SECURITY.md）', () => {
  const tmp = join(tmpdir(), `far-docs-dim-${process.pid}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  // 只给 README——其余维度全缺
  writeFileSync(join(tmp, 'README.md'), '# t\n## 30-second install\n## 2-minute Quickstart\n');
  const r = checkDiaxiaStructure(tmp);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.includes('security')), 'security 维度缺失应点名');
  rmSync(tmp, { recursive: true, force: true });
});
