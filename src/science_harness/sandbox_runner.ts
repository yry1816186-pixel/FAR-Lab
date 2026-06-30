/**
 * Sandbox runner — 类型层执行与确定性 hash 计算（spec 12 §1）。
 *
 * 诚实边界（F4 · 02 §4）：
 *   V1 提供 "resource-bounded & network-restricted venv execution" 的**类型层**实现：
 *   资源规格校验（SR-4 timeout · C19 上限）+ 确定性输出 hash 计算（SR-3）。
 *   严禁声称进程级物理隔离 / strong isolation / tamper-proof / physically isolated。
 *   实际 venv 子进程 spawn + 出站封禁 + GT read-only bind-mount 推迟到 V2+。
 *
 * V1 真实工作：computeSandboxRunResult 接受确定性输入，计算 stdoutHash/stderrHash/
 * artifactTreeHash——这些 hash 是 reproHash / ProofEnvelope 的前置锚（SR-3）。
 *
 * 权威 SSOT：FINAL_PACKAGE/12_EXECUTABLE_SCIENCE_HARNESS.md §1.2-§1.3（SR-1..SR-7）。
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。
 */

import { createHash } from 'node:crypto';
import { hashCanonicalJson } from '../evidence_log/index.ts';
import {
  RESOURCE_LIMITS,
  type ArtifactManifest,
  type SandboxAdapter,
  type SandboxExecutionInput,
  type SandboxResourceSpec,
  type SandboxRunResult,
} from './types.ts';

/** V1 默认固定种子（SR-2 · F8 反 p-hacking · 进 reproHash）。 */
export const DEFAULT_SEED = 42;

/**
 * V1 唯一 sandbox adapter：类型层确定性 hash 计算（禁声称进程隔离）。
 * V2+ 将替换为真实 venv 子进程执行。
 */
export const typeLayerSandboxAdapter: SandboxAdapter = {
  adapterId: 'type-layer-sandbox@v1',
  execute(input, resources) {
    return computeSandboxRunResult(input, resources);
  },
};

/**
 * 校验资源规格（02 C19 硬上限 + SR-4 timeout）。
 * 违规抛错——禁静默放宽上限（反假绿）。
 */
export function validateResourceSpec(spec: SandboxResourceSpec): void {
  if (spec.cpu.limitMillicores > RESOURCE_LIMITS.cpuMillicores) {
    throw new Error(
      `sandbox_runner: cpu.limitMillicores ${spec.cpu.limitMillicores} exceeds C19 ceiling ${RESOURCE_LIMITS.cpuMillicores}`,
    );
  }
  if (spec.memory.limitMb > RESOURCE_LIMITS.memoryMb) {
    throw new Error(
      `sandbox_runner: memory.limitMb ${spec.memory.limitMb} exceeds C19 ceiling ${RESOURCE_LIMITS.memoryMb}`,
    );
  }
  if (spec.timeoutMs > RESOURCE_LIMITS.timeoutMs) {
    throw new Error(
      `sandbox_runner: timeoutMs ${spec.timeoutMs} exceeds SR-4 ceiling ${RESOURCE_LIMITS.timeoutMs} (per-check granularity, not whole AgentRun)`,
    );
  }
}

/** sha256(text) — stdout/stderr 内容锚。 */
function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * 计算产出制品树 hash（SR-3 · spec 12 §1.2）。
 * artifacts 按 (path, contentHash) 排序后做 canonical_json → sha256（复用 hashCanonicalJson）。
 */
export function computeArtifactTreeHash(artifacts: readonly ArtifactManifest[]): string {
  const sorted = [...artifacts]
    .map((a) => ({ path: a.path, contentHash: a.contentHash, bytes: a.bytes }))
    .sort((a, b) => {
      const pathCmp = a.path.localeCompare(b.path);
      if (pathCmp !== 0) return pathCmp;
      return a.contentHash.localeCompare(b.contentHash);
    });
  return hashCanonicalJson({ artifacts: sorted });
}

/**
 * 计算 SandboxRunResult（V1 类型层核心）。
 *
 * 输入为确定性产物（exitCode/stdout/stderr/artifacts）；本函数计算所有 hash 字段
 * 并强制 V1 不变量：seed 默认 42（SR-2）、networkBlocked 默认 true（SR-5·类型层声明）、
 * singleThreaded=true（SR-7）。
 *
 * 注意：本函数不 spawn 子进程、不执行真实网络封禁（F4·V1 类型层）。
 * 它只对调用方提供的确定性输入计算 hash 锚——这是 reproHash 的前置条件。
 */
export function computeSandboxRunResult(
  input: SandboxExecutionInput,
  resources: SandboxResourceSpec,
): SandboxRunResult {
  validateResourceSpec(resources);

  const seed = input.seed ?? DEFAULT_SEED;
  const networkBlocked = input.networkBlocked ?? true;

  // SR-4：超时但 exitCode=0 是矛盾的——确定性输入须如实反映。
  // 不强制改写 exitCode（保留调用方真相），但 timedOut 字段独立记录。
  return {
    exitCode: input.exitCode,
    stdoutHash: sha256Hex(input.stdout),
    stderrHash: sha256Hex(input.stderr),
    artifacts: input.artifacts,
    artifactTreeHash: computeArtifactTreeHash(input.artifacts),
    wallClockMs: input.wallClockMs,
    timedOut: input.timedOut,
    networkBlocked,
    seed,
    singleThreaded: true, // SR-7 · nthread=1 单线程确定性
  };
}

/**
 * 由 SandboxRunResult 计算 reproHash 前置指纹（spec 12 §6）。
 * 复用 hashCanonicalJson 对确定性字段做 canonical hash。
 * 注意：此 hash 喂给上游 reproHash / ProofEnvelope，但不等于 proofHash（proofHash 由 sealer 计算）。
 */
export function computeSandboxReproFingerprint(result: SandboxRunResult): string {
  return hashCanonicalJson({
    exitCode: result.exitCode,
    stdoutHash: result.stdoutHash,
    stderrHash: result.stderrHash,
    artifactTreeHash: result.artifactTreeHash,
    seed: result.seed,
    singleThreaded: result.singleThreaded,
    networkBlocked: result.networkBlocked,
  });
}
