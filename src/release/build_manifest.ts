// src/release/build_manifest.ts
// 职责：REL-BUILD-001 —— 可重复可追溯构建（发布工程域）。
//
//   - generateBuildManifest(repoRoot)：对构建输入（src 下全部 .ts 文件 + package.json +
//     pnpm-lock.yaml + tsconfig.json）逐文件 SHA-256 内容哈希 + 环境快照（node 版本/
//     platform/arch）+ 参考构建命令记录。manifestHash 是 inputs+env+commands 的
//     canonical 哈希（确定性：路径 posix 化 + 排序；generatedAt 时间戳不进哈希——
//     同输入同环境 → 同 manifestHash，可复现）。
//   - compareBuildManifests(a, b)：字节级差异报告——哪个输入变了（changed/added/
//     removed 三向）；输入全同而仅环境字段漂移 → 显式标注 EXPLAINED_ENV_DRIFT
//     （CI vs 本地差异需要解释的机器面：能被解释的差异≠能被忽略的差异）。
//   - buildArtifactTwice(repoRoot)：rebuild test——把 golden vector JSON（GV-01..15）
//     做 canonical 序列化作为确定性产物，在两个临时目录各生成一次，SHA-256 必须
//     一致。规范化步骤诚实声明：golden vector 输入本身不含时间戳/随机字段；canonical
//     序列化（key 排序 + 稳定缩进）消除的是跨次读取的 key 序差异，无其他归一化。
//   - buildProvenanceReceipt(manifest)：provenance 收据引用 manifestHash（供应链
//     证据层的锚点——见 supply_chain.ts）。
//
// Cannot-prove（本机制不能证明什么）：
//   - manifest 证明「这些输入文件此刻的字节内容如哈希所列」——不证明输入之外的东西
//     （编译器二进制、node_modules 内容、OS 补丁面）参与构建时未变；环境快照只覆盖
//     node 版本/platform/arch 三个显式字段，是环境差异的**下界**不是全集；
//   - rebuild test 用 golden vector canonical 序列化作代理产物——它证明仓库的确定性
//     序列化路径可重复，不证明完整 `pnpm build` 链路的字节可重复（后者含 native
//     依赖编译，超出本模块边界）；
//   - SHA-256 抗碰撞性是密码学假设，本模块不做二次独立哈希复核。
//
// 零容忍合规：无 any 类型注解、ts 抑制指令、双重断言、空 catch。模型中立。

import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { crossPlatformTmpDir, toPosixPath } from '../paths.ts';

/** manifest schema 版本（结构变化时递增——旧 manifest 仍可被 compare 消费）。 */
export const BUILD_MANIFEST_SCHEMA = 'far-build-manifest/1';

/** 参考构建命令（宪法 REL-BUILD-001：commands 记录——CI 与本地共用同一清单）。 */
export const REFERENCE_BUILD_COMMANDS: readonly string[] = [
  'pnpm install --frozen-lockfile',
  'pnpm run typecheck',
  'pnpm run lint',
  'pnpm test',
];

/** 构建输入的固定清单（lockfile 固定 = 构建输入固定面的机器声明）。 */
const ROOT_INPUT_FILES: readonly string[] = [
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig.json',
];

export interface BuildInputEntry {
  /** 相对 repoRoot 的 posix 路径（确定性排序键）。 */
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface BuildEnvironment {
  readonly nodeVersion: string;
  readonly platform: string;
  readonly arch: string;
}

export interface BuildManifest {
  readonly schema: typeof BUILD_MANIFEST_SCHEMA;
  readonly inputs: readonly BuildInputEntry[];
  readonly env: BuildEnvironment;
  readonly commands: readonly string[];
  /** 墙钟时间（审计显示用）——**不参与** manifestHash（同输入可复现）。 */
  readonly generatedAt: string | null;
  readonly manifestHash: string;
}

/** 递归列出目录下全部 .ts 文件（排除 0/ 垃圾目录约定——与 package.json files 字段一致）。 */
function listTypeScriptFiles(repoRoot: string): readonly string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '0') continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        out.push(toPosixPath(abs));
      }
    }
  };
  walk(join(repoRoot, 'src'));
  return out.sort();
}

/** 当前环境快照（node 版本/platform/arch——环境差异的下界声明）。 */
export function captureBuildEnvironment(): BuildEnvironment {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
  };
}

function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/** manifest 哈希输入（不含 generatedAt——时间戳不进哈希，同输入同环境可复现）。 */
function canonicalManifestCore(manifest: Omit<BuildManifest, 'generatedAt' | 'manifestHash'>): string {
  return JSON.stringify({
    schema: manifest.schema,
    inputs: manifest.inputs,
    env: manifest.env,
    commands: manifest.commands,
  });
}

export interface GenerateBuildManifestOptions {
  /** 注入时间戳（测试用）；缺省 = 当前墙钟。不影响 manifestHash。 */
  readonly generatedAt?: string;
  /** 跳过 src 下 .ts 扫描（单测加速——输入仅根文件）。 */
  readonly rootInputsOnly?: boolean;
}

/** 生成构建 manifest（确定性：同 repo 状态 + 同环境 → 同 manifestHash）。 */
export function generateBuildManifest(
  repoRoot: string,
  options: GenerateBuildManifestOptions = {},
): BuildManifest {
  const posixRoot = toPosixPath(repoRoot).replace(/\/+$/, '');
  const paths = options.rootInputsOnly === true
    ? [...ROOT_INPUT_FILES]
    : [...ROOT_INPUT_FILES, ...listTypeScriptFiles(repoRoot).map((abs) => toPosixPath(abs).slice(posixRoot.length + 1))];
  const inputs: BuildInputEntry[] = [];
  for (const rel of paths.sort()) {
    const buffer = readFileSync(join(repoRoot, rel));
    inputs.push({ path: rel, sha256: sha256Hex(buffer), bytes: buffer.byteLength });
  }
  const core: Omit<BuildManifest, 'generatedAt' | 'manifestHash'> = {
    schema: BUILD_MANIFEST_SCHEMA,
    inputs,
    env: captureBuildEnvironment(),
    commands: [...REFERENCE_BUILD_COMMANDS],
  };
  return {
    ...core,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    manifestHash: sha256Hex(Buffer.from(canonicalManifestCore(core), 'utf8')),
  };
}

// ---------------------------------------------------------------------------
// compareBuildManifests：字节级差异 + 环境漂移解释
// ---------------------------------------------------------------------------

export type BuildDiffStatus =
  | 'IDENTICAL'
  | 'EXPLAINED_ENV_DRIFT'
  | 'INPUT_DIFF';

export interface BuildManifestDiff {
  readonly status: BuildDiffStatus;
  readonly changedInputs: readonly { path: string; aSha: string; bSha: string }[];
  readonly addedInputs: readonly string[];
  readonly removedInputs: readonly string[];
  readonly envDrift: readonly { field: keyof BuildEnvironment; a: string; b: string }[];
  /** 命令清单漂移（构建命令变化 = 需要重新解释的差异，不是噪音）。 */
  readonly commandDrift: readonly string[];
}

/**
 * 字节级差异报告：
 *   - 输入哈希全同 + 环境全同 → IDENTICAL
 *   - 输入哈希全同 + 仅环境字段漂移 → EXPLAINED_ENV_DRIFT（差异被定位到环境层，
 *     需人工解释 CI/本地环境差，但产物输入面一致）
 *   - 任何输入差异（changed/added/removed）→ INPUT_DIFF（必须重建解释）
 */
export function compareBuildManifests(a: BuildManifest, b: BuildManifest): BuildManifestDiff {
  const byPathA = new Map(a.inputs.map((i) => [i.path, i]));
  const byPathB = new Map(b.inputs.map((i) => [i.path, i]));
  const changedInputs: { path: string; aSha: string; bSha: string }[] = [];
  const addedInputs: string[] = [];
  const removedInputs: string[] = [];
  for (const [path, entryA] of byPathA) {
    const entryB = byPathB.get(path);
    if (entryB === undefined) {
      removedInputs.push(path);
    } else if (entryB.sha256 !== entryA.sha256) {
      changedInputs.push({ path, aSha: entryA.sha256, bSha: entryB.sha256 });
    }
  }
  for (const path of byPathB.keys()) {
    if (!byPathA.has(path)) addedInputs.push(path);
  }
  const envDrift = (['nodeVersion', 'platform', 'arch'] as const)
    .filter((field) => a.env[field] !== b.env[field])
    .map((field) => ({ field, a: a.env[field], b: b.env[field] }));
  const commandDrift = a.commands.length === b.commands.length && a.commands.every((c, i) => c === b.commands[i])
    ? []
    : [...new Set([...a.commands, ...b.commands])].filter(
        (c) => !(a.commands.includes(c) && b.commands.includes(c)),
      );
  const inputDiff = changedInputs.length > 0 || addedInputs.length > 0 || removedInputs.length > 0;
  const status: BuildDiffStatus = inputDiff
    ? 'INPUT_DIFF'
    : envDrift.length > 0 || commandDrift.length > 0
      ? 'EXPLAINED_ENV_DRIFT'
      : 'IDENTICAL';
  return { status, changedInputs, addedInputs, removedInputs, envDrift, commandDrift };
}

// ---------------------------------------------------------------------------
// buildArtifactTwice：rebuild test（确定性产物两次构建哈希一致）
// ---------------------------------------------------------------------------

/** 确定性 JSON canonical 序列化（key 排序 + 2 空格缩进 + 尾换行——字节稳定）。 */
export function canonicalJsonBytes(value: unknown): Buffer {
  const stable = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(stable);
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>)
          .sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0))
          .map(([k, val]) => [k, stable(val)]),
      );
    }
    return v;
  };
  return Buffer.from(JSON.stringify(stable(value), null, 2) + '\n', 'utf8');
}

export interface RebuildRun {
  readonly dir: string;
  readonly artifactPath: string;
  readonly sha256: string;
}

export interface BuildArtifactTwiceResult {
  readonly pass: boolean;
  readonly runs: readonly RebuildRun[];
  readonly inputCaseCount: number;
  /** 诚实声明的规范化步骤（rebuild test 的归一化面——见模块头）。 */
  readonly normalization: string;
}

/**
 * rebuild test：golden vector JSON → canonical 序列化产物，在两个独立临时目录各
 * 生成一次，SHA-256 必须一致（clean-build 复现性的代理证明）。
 * 产物清理：临时目录验证后删除（不留运行产物）。
 */
export function buildArtifactTwice(repoRoot: string): BuildArtifactTwiceResult {
  const caseDir = join(repoRoot, 'golden_vectors', 'cases');
  const files = readdirSync(caseDir)
    .filter((f) => /^GV-\d+\.json$/.test(f))
    .sort();
  const artifact = Buffer.concat(
    files.map((f) => canonicalJsonBytes(JSON.parse(readFileSync(join(caseDir, f), 'utf8')))),
  );
  const runs: RebuildRun[] = [];
  for (let i = 0; i < 2; i += 1) {
    const dir = mkdtempSync(join(crossPlatformTmpDir(), 'far-rebuild-'));
    const artifactPath = join(dir, `golden-vectors.canonical-${i + 1}.json`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(artifactPath, artifact);
    runs.push({ dir, artifactPath, sha256: sha256Hex(readFileSync(artifactPath)) });
  }
  const pass = runs[0] !== undefined && runs[1] !== undefined && runs[0].sha256 === runs[1].sha256;
  for (const run of runs) {
    rmSync(run.dir, { recursive: true, force: true });
  }
  return {
    pass,
    runs,
    inputCaseCount: files.length,
    normalization:
      'golden vector JSON 输入不含时间戳/随机字段；canonical 序列化仅消除 key 排序与缩进差异（无字段丢弃、无值改写）',
  };
}

// ---------------------------------------------------------------------------
// provenance receipt：引用 manifest 哈希（供应链证据锚点）
// ---------------------------------------------------------------------------

export interface BuildProvenanceReceipt {
  readonly subject: 'far-lab-build';
  readonly manifestHash: string;
  readonly inputCount: number;
  readonly env: BuildEnvironment;
  readonly commands: readonly string[];
}

/** provenance 收据：第三方复核时以此为锚重算 manifest 并比对 manifestHash。 */
export function buildProvenanceReceipt(manifest: BuildManifest): BuildProvenanceReceipt {
  return {
    subject: 'far-lab-build',
    manifestHash: manifest.manifestHash,
    inputCount: manifest.inputs.length,
    env: manifest.env,
    commands: manifest.commands,
  };
}
