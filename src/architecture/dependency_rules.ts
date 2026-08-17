// src/architecture/dependency_rules.ts
// 职责：CORE-ARCH-001 —— 信任边界静态强制（dependency rule / forbidden import /
// architecture fitness 的源代码化）。
//
// 宪法三规则的机器化：
//   R1 非确定性适配器不得被 Trust Kernel 反向依赖：
//      kernel 文件 → 非确定性层的 VALUE import 一律禁止（运行时耦合 = 适配器决定内核语义）。
//   R2 模型/框架/网络/UI/数据库实现细节不得决定 kernel 语义：
//      kernel 对非确定性层的 TYPE import 只允许指向契约文件（*/types.ts 或 index 契约），
//      禁止指向实现文件（gateway.ts / orchestrator.ts / adapter.ts ...）——类型耦合也是语义耦合，
//      但纯契约形状（接口）是可接受的接缝。
//   R3 依赖方向（适配器 → kernel）合法且被报告枚举（正向依赖是设计的存在证明）。
//
// Cannot-prove：静态 import 扫描证明模块级依赖方向合规；不证明运行时无动态耦合
// （字符串拼路径的 require、依赖注入的隐藏实现细节）——那由 zero-tolerance 扫描与
// 运行时守卫（guards.ts）覆盖。数据库边界：kernel 依赖 better-sqlite3 的类型签名
// 属持久化接缝（写路径经 AGENT_WRITE_MANIFEST 约束），不判定裁决语义，如实入报告。

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Trust Kernel 层（AGENTS.md §7 高风险模块 + spec.ts TRUST_KERNEL_PATHS 对齐）。 */
export const TRUST_KERNEL_LAYERS: readonly string[] = [
  'src/falsifiability/',
  'src/evidence_log/',
  'src/fec/',
  'src/far_proof/',
  'src/proof_envelope/',
  'src/canonical/',
];

/** 非确定性/适配器层（模型、编排、网络、UI、CLI、研究流程）。 */
export const NON_DETERMINISTIC_LAYERS: readonly string[] = [
  'src/llm_gateway/',
  'src/agent_loop/',
  'src/research/',
  'src/discovery/',
  'src/campaign/',
  'src/cli/',
  'src/api/',
  'frontend/',
];

/** 非确定性层内的契约文件名（kernel 允许的 type-import 唯一目标）。 */
export const CONTRACT_FILE_NAMES: readonly string[] = ['types.ts', 'contracts.ts', 'index.ts'];

export type ImportKind = 'value' | 'type';

export interface ImportEdge {
  /** 导入方文件（仓库相对路径，/ 分隔）。 */
  readonly from: string;
  /** 被导入模块（仓库相对路径，/ 分隔）。 */
  readonly to: string;
  /** value = 运行时绑定；type = 仅类型。 */
  readonly kind: ImportKind;
}

export type EdgeClassification =
  | 'KERNEL_INTERNAL'
  | 'KERNEL_TO_DETERMINISTIC'
  | 'KERNEL_TYPE_CONTRACT'
  | 'FORBIDDEN_VALUE_IMPORT'
  | 'FORBIDDEN_TYPE_IMPORT_FROM_IMPL'
  | 'OUTBOUND_OK'
  | 'EXTERNAL_PACKAGE'
  | 'NODE_BUILTIN';

export interface ClassifiedEdge {
  readonly edge: ImportEdge;
  readonly classification: EdgeClassification;
  readonly reason: string;
}

export interface ArchitectureViolation {
  readonly code: 'FORBIDDEN_VALUE_IMPORT' | 'FORBIDDEN_TYPE_IMPORT_FROM_IMPL';
  readonly edge: ImportEdge;
  readonly message: string;
}

export interface DependencyReport {
  readonly kernelFileCount: number;
  readonly edges: readonly ClassifiedEdge[];
  readonly violations: readonly ArchitectureViolation[];
  readonly outboundCount: number;
}

// ---------------------------------------------------------------------------
// import 语句扫描（正则、确定性；覆盖 import/from 与 export...from 再导出）
// ---------------------------------------------------------------------------

const IMPORT_RE = /^\s*import\s+(type\s+)?[{*}0-9A-Za-z_$,\s]*?\s*from\s+['"]([^'"]+)['"]/;
const EXPORT_FROM_RE = /^\s*export\s+(type\s+)?[{*}0-9A-Za-z_$,\s]*?\s*from\s+['"]([^'"]+)['"]/;

/** 解析单个 TS 文件的 import 边（相对路径解析到仓库相对路径；裸包名归一化）。 */
export function scanFileImports(path: string, text: string): readonly ImportEdge[] {
  const edges: ImportEdge[] = [];
  for (const line of text.split('\n')) {
    for (const re of [IMPORT_RE, EXPORT_FROM_RE]) {
      const m = re.exec(line);
      if (m === null) continue;
      const isType = (m[1] ?? '') === 'type ';
      const spec = m[2] ?? '';
      if (spec.startsWith('.')) {
        edges.push({ from: normalize(path), to: normalize(resolveFrom(path, spec)), kind: isType ? 'type' : 'value' });
      } else if (spec.startsWith('node:')) {
        edges.push({ from: normalize(path), to: `node:${spec.slice(5)}`, kind: isType ? 'type' : 'value' });
      } else {
        edges.push({ from: normalize(path), to: `pkg:${spec}`, kind: isType ? 'type' : 'value' });
      }
      break;
    }
  }
  return edges;
}

function normalize(p: string): string {
  return p.replace(/\\/g, '/');
}

function resolveFrom(fromFile: string, spec: string): string {
  const dir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : '';
  const parts = (dir.length > 0 ? dir.split('/') : []);
  for (const seg of spec.split('/')) {
    if (seg === '.' || seg.length === 0) continue;
    if (seg === '..') {
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join('/');
}

// ---------------------------------------------------------------------------
// 规则分类
// ---------------------------------------------------------------------------

function layerOf(path: string): string | undefined {
  return [...TRUST_KERNEL_LAYERS, ...NON_DETERMINISTIC_LAYERS].find((layer) => path.startsWith(layer));
}

export function classifyEdge(edge: ImportEdge): ClassifiedEdge {
  const fromLayer = layerOf(edge.from);
  const toLayer = layerOf(edge.to);

  if (edge.to.startsWith('node:')) {
    return { edge, classification: 'NODE_BUILTIN', reason: 'node builtin' };
  }
  if (edge.to.startsWith('pkg:')) {
    return { edge, classification: 'EXTERNAL_PACKAGE', reason: 'external package' };
  }
  if (fromLayer !== undefined && TRUST_KERNEL_LAYERS.includes(fromLayer)) {
    if (toLayer !== undefined && TRUST_KERNEL_LAYERS.includes(toLayer)) {
      return { edge, classification: 'KERNEL_INTERNAL', reason: 'kernel→kernel' };
    }
    if (toLayer !== undefined && NON_DETERMINISTIC_LAYERS.includes(toLayer)) {
      if (edge.kind === 'value') {
        return {
          edge,
          classification: 'FORBIDDEN_VALUE_IMPORT',
          reason: `kernel (${fromLayer}) value-imports non-deterministic layer (${toLayer}) — R1 violated`,
        };
      }
      const targetFile = edge.to.split('/').pop() ?? '';
      if (CONTRACT_FILE_NAMES.includes(targetFile)) {
        return { edge, classification: 'KERNEL_TYPE_CONTRACT', reason: `type-only contract import (${targetFile}) — R2 seam` };
      }
      return {
        edge,
        classification: 'FORBIDDEN_TYPE_IMPORT_FROM_IMPL',
        reason: `kernel type-imports implementation file (${edge.to}) — R2 violated; import the contract in ${CONTRACT_FILE_NAMES.join('/')} instead`,
      };
    }
    return { edge, classification: 'KERNEL_TO_DETERMINISTIC', reason: 'kernel→deterministic module (schema/governance/...)' };
  }
  if (toLayer !== undefined && TRUST_KERNEL_LAYERS.includes(toLayer)) {
    return { edge, classification: 'OUTBOUND_OK', reason: 'adapter→kernel (R3 legal direction)' };
  }
  return { edge, classification: 'EXTERNAL_PACKAGE', reason: 'non-kernel internal edge (out of rule scope)' };
}

// ---------------------------------------------------------------------------
// 全树扫描 + 报告
// ---------------------------------------------------------------------------

function walkTsFiles(dir: string, rootLen: number, out: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkTsFiles(full, rootLen, out);
    } else if (entry.endsWith('.ts')) {
      out.push(normalize(full.slice(rootLen)));
    }
  }
}

/** 扫描仓库 src/ 与 frontend/src/ 的全部 import 边并按规则分类（forbidden-import report）。 */
export function buildDependencyReport(repoRoot: string): DependencyReport {
  const prefixLen = repoRoot.endsWith('/') || repoRoot.endsWith('\\') ? repoRoot.length : repoRoot.length + 1;
  const files: string[] = [];
  walkTsFiles(join(repoRoot, 'src'), prefixLen, files);
  walkTsFiles(join(repoRoot, 'frontend', 'src'), prefixLen, files);

  const edges: ClassifiedEdge[] = [];
  let kernelFileCount = 0;
  for (const file of files) {
    if (TRUST_KERNEL_LAYERS.some((layer) => file.startsWith(layer))) kernelFileCount += 1;
    const text = readFileSync(join(repoRoot, ...file.split('/')), 'utf8');
    for (const e of scanFileImports(file, text)) {
      edges.push(classifyEdge(e));
    }
  }

  const violations: ArchitectureViolation[] = edges
    .filter((c): c is ClassifiedEdge & { classification: 'FORBIDDEN_VALUE_IMPORT' | 'FORBIDDEN_TYPE_IMPORT_FROM_IMPL' } =>
      c.classification === 'FORBIDDEN_VALUE_IMPORT' || c.classification === 'FORBIDDEN_TYPE_IMPORT_FROM_IMPL')
    .map((c) => ({ code: c.classification, edge: c.edge, message: c.reason }));

  return {
    kernelFileCount,
    edges,
    violations,
    outboundCount: edges.filter((c) => c.classification === 'OUTBOUND_OK').length,
  };
}
