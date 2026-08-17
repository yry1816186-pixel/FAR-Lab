/**
 * Executable Science Harness — 类型层契约（M3 TESS / spec 12）。
 *
 * 历史溯源：-§2（已归档·备份 FAR-Lab_Backups/）·运行时 SSOT 以本文件源码实测为准 +
 *            11_FALSIFICATION_ENGINE.md §3 (verdict_mapping 5 路径)。
 *
 * 诚实边界（F4 · 02 §4）：
 *   V1 只做**类型层约束**（purpose_tag 枚举 + CI 审计断言）。
 *   严禁声称进程级物理隔离 / strong isolation / tamper-proof / physically isolated。
 *   正确措辞：resource-bounded & network-restricted venv execution（资源受限 + 禁网的 venv 执行）。
 *   实际 venv 子进程隔离推迟到 V2+；V1 提供确定性 hash 计算与 verdict 映射。
 *
 * 模型中立：本模块不含任何 qwen/dashscope/bailian 字面量。
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。
 */

import type { NetworkPolicy, Verdict } from '../schema/enums.ts';

// ---------------------------------------------------------------------------
// 资源规格（§1.1 · 复用 02/23 ResourceSpec SSOT 三字段）
// ---------------------------------------------------------------------------

/** CPU 资源限制（02 C19 上限：≤8000 millicores = 8 核）。 */
export interface CpuSpec {
  readonly limitMillicores: number;
}

/** 内存资源限制（02 C19 上限：≤8192 MB = 8 GB）。 */
export interface MemorySpec {
  readonly limitMb: number;
}

/**
 * Sandbox 资源规格（§1.1）。
 * 复用 02/23 ResourceSpec 的 cpu/memory/timeoutMs 三字段——本模块是 far-chain 内首定义，
 * 因此此 interface 即 SSOT（后续若 02/23 落地 ResourceSpec 须与此对齐，禁分裂）。
 *
 * C19 硬上限（validateResourceSpec 强制）：
 *   cpu.limitMillicores ≤ 8000
 *   memory.limitMb      ≤ 8192
 *   timeoutMs           ≤ 120000（单检验粒度，非整 AgentRun）
 */
export interface SandboxResourceSpec {
  readonly cpu: CpuSpec;
  readonly memory: MemorySpec;
  readonly timeoutMs: number;
}

/** C19 资源上限常量（validateResourceSpec 引用·禁硬编码散落）。 */
export const RESOURCE_LIMITS = {
  cpuMillicores: 8000,
  memoryMb: 8192,
  timeoutMs: 120_000,
} as const;

// ---------------------------------------------------------------------------
// 产出制品（§1.2）
// ---------------------------------------------------------------------------

/** 单个产出制品（Lightkurve plot / table / CSV 等）。 */
export interface ArtifactManifest {
  /** 制品相对路径（sandbox 工作区内）。 */
  readonly path: string;
  /** sha256(制品内容) — 02 C8 RULE-DATA-001 内容锚。 */
  readonly contentHash: string;
  /** 制品字节数（审计用）。 */
  readonly bytes: number;
}

// ---------------------------------------------------------------------------
// SandboxRunResult（§1.2 · V1 必须的输出 shape）
// ---------------------------------------------------------------------------

/**
 * Sandbox 执行结果（§1.2）。
 *
 * SR-1..SR-7 红线在 V1 的落地：
 *   - SR-2 固定 seed（默认 42，进 reproHash）
 *   - SR-3 stdoutHash + artifactTreeHash（确定性输出锚·reproHash 前置）
 *   - SR-4 timeoutMs 超时 → timedOut=true
 *   - SR-5 默认禁网 → networkBlocked=true（V1 仅类型层声明·F4）
 *   - SR-7 nthread=1（单线程确定性）
 *
 * 注意：V1 不实际 spawn venv 子进程（F4 推迟进程隔离到 V2）。
 * computeSandboxRunResult 接受确定性输入并计算 hash 字段——这是 V1 沙箱层的真实工作。
 */
export interface SandboxRunResult {
  /** 退出码（0 成功 / 非 0 失败）。 */
  readonly exitCode: number;
  /** sha256(stdout) — 确定性输出锚（SR-3）。 */
  readonly stdoutHash: string;
  /** sha256(stderr)。 */
  readonly stderrHash: string;
  /** 产出制品清单。 */
  readonly artifacts: readonly ArtifactManifest[];
  /** canonical_hash(artifacts 排序) — 复用 hashCanonicalJson（SR-3）。 */
  readonly artifactTreeHash: string;
  /** 实际墙钟毫秒。 */
  readonly wallClockMs: number;
  /** 超时标志（SR-4）。 */
  readonly timedOut: boolean;
  /** 输出超限强制中断（FUSION-OS-10·P1-2 审计修复）。true = stdout+stderr 超过 MAX_OUTPUT_BYTES 被强杀。 */
  readonly outputLimitExceeded: boolean;
  /** 网络是否被阻（默认 true·SR-5·V1 类型层声明）。 */
  readonly networkBlocked: boolean;
  /** 固定种子（默认 42·SR-2·进 reproHash）。 */
  readonly seed: number;
  /**
   * 受 threadpoolctl 支持的数值线程池是否已限制为 1（SR-7）。
   * 这不是“整个 Python 进程绝对没有其他线程”的证明。
   */
  readonly singleThreaded: boolean;
  /**
   * singleThreaded 的可审计事实来源。字符串使用稳定机器枚举，并进入 repro fingerprint。
   */
  readonly threadLimitReason: ThreadLimitReason;
  /** FUSION-OS-7：用户脚本 CPU 时间毫秒（Python time.process_time·跨平台·非墙钟）。0=未测量。不进 reproHash（非确定性）。 */
  readonly cpuMs: number;
  /** FUSION-OS-7：峰值驻留集 KB（POSIX resource.getrusage·Windows 降级 0）。0=未测量。不进 reproHash。 */
  readonly peakRssKb: number;
}

/**
 * Sandbox 执行的确定性输入（V1：由调用方提供确定性产物，computeSandboxRunResult 计算 hash）。
 * V2+ 将替换为真实 venv 子进程执行（F4）。
 */
export interface SandboxExecutionInput {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly artifacts: readonly ArtifactManifest[];
  readonly wallClockMs: number;
  readonly timedOut: boolean;
  /** FUSION-OS-10：输出超限强制中断（P1-2 审计修复·防失控脚本耗尽宿主内存）。缺省 false。 */
  readonly outputLimitExceeded?: boolean;
  readonly seed?: number;
  readonly networkBlocked?: boolean;
  /**
   * 由真实执行层回传的 SR-7 证据。缺省为 false/not_attested，禁止 hash-only
   * 路径凭空宣称已施加单线程限制。
   */
  readonly singleThreaded?: boolean;
  readonly threadLimitReason?: ThreadLimitReason;
  /** FUSION-OS-7：用户脚本 CPU 时间毫秒（缺省 0=未测量·V1 类型层 caller 不提供）。 */
  readonly cpuMs?: number;
  /** FUSION-OS-7：峰值驻留集 KB（缺省 0=未测量）。 */
  readonly peakRssKb?: number;
}

/** SR-7 数值线程限制回执的稳定失败/成功分类。 */
export type ThreadLimitReason =
  | 'threadpoolctl_verified'
  | 'threadpoolctl_applied_no_supported_pools'
  | 'threadpoolctl_unavailable'
  | 'threadpoolctl_setup_failed'
  | 'threadpoolctl_verification_failed'
  | 'threadpool_limit_not_one'
  | 'manifest_missing_thread_limit_attestation'
  | 'execution_not_started'
  | 'execution_interrupted'
  | 'not_attested';

/** Python 子进程 JSON wire 解析后、hash 计算前的内部执行结果。 */
export interface RawVenvResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly artifacts: readonly ArtifactManifest[];
  readonly wallClockMs: number;
  readonly timedOut: boolean;
  readonly outputLimitExceeded: boolean;
  readonly networkBlocked: boolean;
  readonly singleThreaded: boolean;
  readonly threadLimitReason: ThreadLimitReason;
  readonly cpuMs: number;
  readonly peakRssKb: number;
}

/**
 * Sandbox adapter 最小契约（§0 推断·spec 未明写 interface）。
 * V1 唯一实现：TypeLayerSandboxAdapter（确定性 hash 计算·禁声称进程隔离）。
 */
export interface SandboxAdapter {
  readonly adapterId: string;
  execute(input: SandboxExecutionInput, resources: SandboxResourceSpec): SandboxRunResult;
}

// ---------------------------------------------------------------------------
// V2 venv sandbox（P1-6 · 真实 spawn 子进程）
// ---------------------------------------------------------------------------

/**
 * venv 沙箱执行输入（V2）。
 *
 * 与 V1 `SandboxExecutionInput` 故意分离：V1 接收**预计算**确定性产物（exitCode/stdout/...），
 * V2 接收**待执行的用户脚本** + 环境配置，由真实 Python 子进程产出 `SandboxRunResult`。
 * 合并会与 `exactOptionalPropertyTypes` 冲突（script 与 pre-computed output 同接口互斥），
 * 故分离为两个独立契约，共享 `SandboxRunResult` 输出。
 *
 * 诚实边界（07_RISK_REGISTER §188）：进程级 OS 隔离（cgroups/netns）非本层职责——
 * `networkPolicy` 仅驱动 Python 侧 `_check_host` best-effort + 禁网 env var，**非强隔离**。
 */
export interface VenvSandboxInput {
  /** 待执行的用户 Python 脚本源码（sandbox_runner.py exec）。 */
  readonly script: string;
  /** 固定 seed（SR-2，默认 42，进 reproHash）。 */
  readonly seed?: number;
  /** 网络策略（默认 'off' · SR-5）。allowlist 时须配 allowedHosts。 */
  readonly networkPolicy?: NetworkPolicy;
  /** networkPolicy='allowlist' 时允许的主机白名单（其余阻塞）。 */
  readonly allowedHosts?: readonly string[];
  /** 制品工作区（执行后扫描 artifacts manifest；不提供则无 artifacts）。 */
  readonly workingDir?: string;
  /** Python 命令（默认按平台 python/python3）。 */
  readonly pythonCmd?: string;
  /** 墙钟超时毫秒（SR-4，超时 spawn 强杀子进程）。 */
  readonly timeoutMs?: number;
}

/**
 * V2 venv 沙箱适配器契约（P1-6）。
 *
 * 与 V1 `SandboxAdapter.execute`（同步·确定性 hash）共存：`executeAsync` 真起 venv 子进程，
 * `isAvailable` 让调用方对缺失环境诚实 skip（不当代码 bug）。
 */
export interface VenvSandboxAdapter {
  readonly adapterId: string;
  /** venv 是否可用（spawn 探针）。不可用 → 调用方 skip。 */
  isAvailable(): boolean;
  executeAsync(input: VenvSandboxInput, resources: SandboxResourceSpec): Promise<SandboxRunResult>;
}

// ---------------------------------------------------------------------------
// 数据集解析（§2.1-§2.2）
// ---------------------------------------------------------------------------

/** 数据集解析策略（§2.1 三值）。 */
export type DatasetResolverKind = 'lightkurve' | 'astroquery.mast' | 'cached_fixture';

/** 数据集引用（§2.1）。 */
export interface DatasetRef {
  readonly resolver: DatasetResolverKind;
  /** lightkurve/astroquery 版本号（进 reproHash）。 */
  readonly version: string;
  /** ISO 8601 获取时间。 */
  readonly retrievedAt: string;
  /** sha256(canonical_json(数据内容)) — 02 C8 RULE-DATA-001。 */
  readonly contentHash: string;
  /** TESS Input Catalog ID（TESS 专用·可选）。 */
  readonly ticId?: string;
  /** TESS sector（可选）。 */
  readonly sector?: number;
}

/** 数据集解析结果三态（§2.2 决策树）。 */
export type DatasetResolutionStatus = 'resolved' | 'degraded' | 'untested';
/** Dataset resolution result (spec 12 S2.2 three-valued decision tree).
 * Tracks status (resolved/degraded/untested), reference, exempt flag, and reason. */
export interface DatasetResolution {
  readonly status: DatasetResolutionStatus;
  readonly ref: DatasetRef | null;
  /**
   * 是否豁免基线（02 C20）。
   * resolved（真实在线数据）→ false（非豁免）；degraded cached_fixture / untested → true。
   * 上游记录 call_record 时，exempt=true 映射为 purpose_tag='baseline_exempt'。
   */
  readonly exempt: boolean;
  /** 降级/未测试原因（诚实声明·禁伪造）。 */
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// 检验项 + verdict_mapping（§3 / §3.1）
// ---------------------------------------------------------------------------

/** 单个可证伪检验项的判定结果（M1-M4 等）。 */
export type ScienceCheckOutcome = 'PASS' | 'WARN' | 'FAIL' | 'SKIP';

/** 检验项阈值（§1.1 · 注入参数·V1 不 hardcode 数值）。 */
export interface ScienceThreshold {
  readonly op: '<' | '<=' | '>' | '>=' | '==';
  readonly value: number;
  readonly unit: string;
}

/** 单个检验项（如 C-ASTRO-0001 的 M1 BLS 周期搜索）。 */
export interface ScienceCheck {
  readonly id: string;
  readonly label: string;
  readonly primaryMetric: string;
  readonly outcome: ScienceCheckOutcome;
  readonly metricValue: number | null;
  readonly threshold: ScienceThreshold;
  readonly detail: string;
}

/**
 * verdict_mapping 触发路径（§3 · 5 verdict · AT-01 修复增 partial_skip 子路径）。
 * verdict 映射见 ROUTE_TO_VERDICT：partial_skip → INCONCLUSIVE
 * （含 PASS 但有 SKIP 未测项 → 未全覆盖 → 禁升 CONFIRMED · 反 theater · SKIP≠PASS）。
 */
export type VerdictRoute =
  | 'all_pass'
  | 'any_refute'
  | 'data_missing'
  | 'scope_narrow'
  | 'mixed'
  | 'partial_skip';

/** verdict_mapping 决策结果。 */
export interface VerdictMappingResult {
  readonly verdict: Verdict;
  readonly route: VerdictRoute;
  readonly integrityFlags: readonly string[];
}
