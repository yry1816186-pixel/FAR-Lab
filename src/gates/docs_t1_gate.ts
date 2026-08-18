// src/gates/docs_t1_gate.ts
// 职责：DOC-DIATAXIS-001 —— tracked 公开文档面按用户任务组织（Diátaxis 维度覆盖）
// + 根文档相对链接完整性（断链检出）+ 文档可测性（doc↔CLI 一致性门接线）。
//
// 三个判定面（全部对真实仓库文件解析，非存在性橡皮章）：
//   1. 维度覆盖：13 个任务维度（tutorials/how-to/reference/explanation/install/
//      cli-api/methodology/security/limitations/troubleshooting/contributing/
//      proof-verification/migration）逐一映射到 tracked 公开文档的真实锚点
//      （README 章节标题 / SECURITY.md / SUPPORT.md / CONTRIBUTING.md /
//      CHANGELOG.md / public/verify.html / schema/openapi.json）；
//   2. 链接完整性：根级公开文档的相对链接目标必须在磁盘上存在（外链/纯锚点/
//      mailto 不在离线范围——如实声明）；gitignored 的 docs/ 不入公开面；
//   3. 可测性：scripts/doc_command_check.mjs（文档命令 ↔ CLI 真实子命令一致性）
//      + CI 接线 + 自身测试在场——文档宣称的命令被机器约束（防文档腐烂）。
//
// Cannot-prove（本机制不能证明什么）：
//   - 结构门证明「维度锚点在场 + 相对链接可达 + 命令一致性门接线」，不证明
//     文档内容准确/时效/教学效果（需人工评审与真实新用户走查）；
//   - 外链活性（http/https）需联网检查，属发布前外部动作，不在本离线门；
//   - docs/ 为 gitignored 机器本地目录——公开文档面以 git tracked 文件为准，
//     本门不对其内容做任何断言（README 已声明扩展文档不分发）。
// 零容忍合规：无 any/抑制指令/双断言/空 catch。模型中立。

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// ---------------------------------------------------------------------------
// 公共类型
// ---------------------------------------------------------------------------

export interface RequirementCheck {
  readonly requirement: string;
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly evidence: readonly string[];
  readonly declaredGaps: readonly string[];
}

function readText(absPath: string): string {
  if (!existsSync(absPath)) return '';
  return readFileSync(absPath, 'utf8');
}

// ---------------------------------------------------------------------------
// 13 个任务维度 → tracked 公开文档锚点
// ---------------------------------------------------------------------------

export type DimensionSource =
  | { readonly kind: 'readme-heading'; readonly anchor: string }
  | { readonly kind: 'file'; readonly path: string; readonly mustContain?: string };

export interface DiaxiaDimension {
  readonly dimension: string;
  readonly source: DimensionSource;
}

/** 宪法 DOC-DIATAXIS-001 列举的 13 个覆盖项 → 仓库真实锚点（2026-08-17 实测）。 */
export const DIATAXIS_DIMENSIONS: readonly DiaxiaDimension[] = [
  { dimension: 'installation/quick start', source: { kind: 'readme-heading', anchor: '## 30-second install' } },
  { dimension: 'tutorials', source: { kind: 'readme-heading', anchor: '## 2-minute Quickstart' } },
  { dimension: 'how-to guides', source: { kind: 'readme-heading', anchor: '## Live quickstart' } },
  { dimension: 'reference', source: { kind: 'readme-heading', anchor: '## Documentation' } },
  { dimension: 'explanation/concepts', source: { kind: 'readme-heading', anchor: '## Core concepts' } },
  { dimension: 'cli/api/tool protocol', source: { kind: 'file', path: 'schema/openapi.json' } },
  { dimension: 'methodology', source: { kind: 'readme-heading', anchor: '## Live evaluation' } },
  { dimension: 'security/privacy', source: { kind: 'file', path: 'SECURITY.md' } },
  { dimension: 'limitations', source: { kind: 'readme-heading', anchor: '### Known limits' } },
  { dimension: 'troubleshooting', source: { kind: 'file', path: 'SUPPORT.md' } },
  { dimension: 'contributing/architecture', source: { kind: 'file', path: 'CONTRIBUTING.md', mustContain: '## Architecture Authority' } },
  { dimension: 'proof verification', source: { kind: 'file', path: 'frontend/public/verify.html' } },
  { dimension: 'migration/deprecation', source: { kind: 'file', path: 'CHANGELOG.md' } },
];

function dimensionCovered(repoRoot: string, dim: DiaxiaDimension, readme: string): boolean {
  if (dim.source.kind === 'readme-heading') return readme.includes(dim.source.anchor);
  const text = readText(join(repoRoot, dim.source.path));
  if (text.length === 0) return false;
  return dim.source.mustContain === undefined || text.includes(dim.source.mustContain);
}

export function checkDiaxiaStructure(repoRoot: string): RequirementCheck {
  const problems: string[] = [];
  const evidence: string[] = [];

  const readme = readText(join(repoRoot, 'README.md'));
  if (readme.length === 0) problems.push('README.md missing (public docs face absent)');

  const uncovered = DIATAXIS_DIMENSIONS.filter((d) => !dimensionCovered(repoRoot, d, readme));
  for (const d of uncovered) {
    const where = d.source.kind === 'readme-heading' ? `README anchor '${d.source.anchor}'` : d.source.path;
    problems.push(`${d.dimension}: not covered (${where} missing)`);
  }
  if (uncovered.length === 0) {
    evidence.push(`dimension coverage: 13/13 task-oriented dimensions anchored in tracked public docs`);
  }

  // 双语公开面（非默认语言）
  if (!existsSync(join(repoRoot, 'README.zh-CN.md'))) problems.push('README.zh-CN.md missing (bilingual public face)');
  else evidence.push('bilingual public face: README.md + README.zh-CN.md');

  // 可测性：文档命令一致性门（脚本 + CI 接线 + 自身测试）
  const docGate = readText(join(repoRoot, 'scripts/doc_command_check.mjs'));
  if (docGate.length === 0) problems.push('scripts/doc_command_check.mjs missing (doc↔CLI consistency gate absent)');
  else {
    const ci = readText(join(repoRoot, '.github/workflows/ci.yml'));
    if (!ci.includes('doc_command_check')) problems.push('CI lacks doc_command_check wiring (doc drift unenforced)');
    else if (!existsSync(join(repoRoot, 'tests/scripts/doc_command_check.test.mjs'))) {
      problems.push('doc_command_check lacks its own test');
    } else {
      evidence.push('doc testability: doc_command_check (README commands ⊆ real CLI subcommands) + CI wiring + own drift test');
    }
  }

  return makeDocCheck(problems, evidence);
}

function makeDocCheck(problems: readonly string[], evidence: readonly string[]): RequirementCheck {
  return {
    requirement: 'DOC-DIATAXIS-001',
    ok: problems.length === 0,
    problems,
    evidence,
    declaredGaps: [
      '内容准确性/时效/教学效果不在离线机器判定范围（人工评审 + fresh-user 走查承载）',
      '外链（http/https）活性检查需联网，属发布前外部动作（doc_command_check 同样离线，已在其头注释声明）',
    ],
  };
}

// ---------------------------------------------------------------------------
// 链接完整性：根级公开文档相对链接零断链
// ---------------------------------------------------------------------------

export interface MarkdownLink {
  readonly text: string;
  readonly target: string;
}

/** 提取一个 markdown 文件的全部链接（文本 + 目标；图片链接同样提取）。 */
export function extractMarkdownLinks(absFile: string): MarkdownLink[] {
  const text = readText(absFile);
  if (text.length === 0) return [];
  const links: MarkdownLink[] = [];
  const re = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let m = re.exec(text);
  while (m !== null) {
    if (m[2] !== undefined) links.push({ text: m[1] ?? '', target: m[2] });
    m = re.exec(text);
  }
  return links;
}

/** 根级 tracked 公开文档清单（公开文档面 SSOT；docs/ 是 gitignored 机器本地不入列）。 */
export const ROOT_PUBLIC_DOCS: readonly string[] = [
  'README.md', 'README.zh-CN.md', 'CONTRIBUTING.md', 'SECURITY.md', 'SUPPORT.md',
  'MAINTAINERS.md', 'CHANGELOG.md', 'CODE_OF_CONDUCT.md', 'NOTICE', 'THIRD-PARTY-NOTICES.md',
];

export interface LinkIntegrityReport {
  readonly checked: number;
  readonly broken: readonly { readonly file: string; readonly target: string }[];
  readonly ok: boolean;
}

function isRemoteOrAnchor(target: string): boolean {
  return /^(https?:|mailto:|#)/i.test(target);
}

export function rootLinkIntegrity(repoRoot: string): LinkIntegrityReport {
  const broken: { file: string; target: string }[] = [];
  let checked = 0;
  for (const doc of ROOT_PUBLIC_DOCS) {
    const abs = join(repoRoot, doc);
    if (!existsSync(abs)) continue;
    checked += 1;
    for (const link of extractMarkdownLinks(abs)) {
      if (isRemoteOrAnchor(link.target)) continue;
      const targetPath = link.target.split('#')[0] ?? '';
      if (targetPath.length === 0) continue; // 纯锚点残片
      if (!existsSync(join(dirname(abs), targetPath))) {
        broken.push({ file: doc, target: link.target });
      }
    }
  }
  return { checked, broken, ok: broken.length === 0 };
}
