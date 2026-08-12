/**
 * env_fingerprint —— .far-proof 运行环境指纹（评委07 Q3 mitigation）。
 *
 * 诚实背景：.far-proof 锁证据（内容寻址 hash + 篡改可检测），**但不锁运行环境**——这是相对
 * Docker capsule（锁整个环境）的真实硬伤（评委07 Q3：「Docker capsule 锁整个环境，FAR-Lab 的
 * bundle 只锁证据，运行环境仍可能漂移」）。本模块不做（也不假装做）完整环境锁定——它做的是
 * **让环境漂移可检测**：导出时捕获一个环境指纹写入 bundle，验证时比对当前环境，漂移即披露。
 *
 * 【本机制不能证明什么】（§7 诚实声明）：
 *   - 不锁运行环境（非 Docker capsule）——同 node/python 版本仍可能因底层依赖差异而结果漂移。
 *   - 指纹只覆盖 node/python 版本 + 平台/架构；未覆盖全部传递依赖（那是 Docker 的领域）。
 *   - 漂移检测是 warn（披露），非 fail（不同环境复算轻微数值差异不应判整包无效）。
 *
 * 模型中立。零容忍合规。
 */

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const ENV_FINGERPRINT_SCHEMA_VERSION = 'far.proof_bundle.env_fingerprint.v1';
export const ENV_FINGERPRINT_FILE = 'env_fingerprint.json';

/** 环境指纹（写入 bundle 的 data_manifest.envFingerprint）。 */
export interface EnvFingerprint {
  // 注：字面量类型（非 `typeof CONST`）以兼容 generate_json_schema 转换器（kind 187 fail-closed）。
  readonly schemaVersion: 'far.proof_bundle.env_fingerprint.v1';
  /** 捕获时间（ISO·仅审计用，**不**进 fingerprintHash——时间变化不代表环境漂移）。 */
  readonly capturedAt: string;
  readonly node: string;
  readonly platform: string;
  readonly arch: string;
  /** python 版本（best-effort；不可用为 null）。 */
  readonly python: string | null;
  /** sha256(canonical(node|platform|arch|python))——漂移检测锚。 */
  readonly fingerprintHash: string;
}

/** best-effort 探测 python 版本（python3 优先；超时/失败 → null，不阻塞导出）。 */
function probePythonVersion(): string | null {
  for (const cmd of ['python3', 'python']) {
    try {
      const r = spawnSync(cmd, ['--version'], { encoding: 'utf8', timeout: 4000 });
      const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
      const m = /Python\s+(\d+\.\d+\.\d+)/.exec(out);
      if (m !== null) {
        return m[1] ?? null;
      }
    } catch {
      // best-effort: try next candidate
    }
  }
  return null;
}

/** 计算环境指纹（捕获当下运行环境）。 */
export function computeEnvFingerprint(capturedAt: string = new Date().toISOString()): EnvFingerprint {
  const node = process.version;
  const platform = process.platform;
  const arch = process.arch;
  const python = probePythonVersion();
  const canonical = JSON.stringify({ node, platform, arch, python });
  const fingerprintHash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return { schemaVersion: ENV_FINGERPRINT_SCHEMA_VERSION, capturedAt, node, platform, arch, python, fingerprintHash };
}

/** 比对录制指纹与当前指纹 → {match, differences}（differences 人类可读，进 verify warning）。 */
export function compareEnvFingerprint(
  recorded: EnvFingerprint,
  current: EnvFingerprint,
): { readonly match: boolean; readonly differences: readonly string[] } {
  const differences: string[] = [];
  if (recorded.node !== current.node) {
    differences.push(`node: recorded ${recorded.node} vs current ${current.node}`);
  }
  if (recorded.platform !== current.platform) {
    differences.push(`platform: recorded ${recorded.platform} vs current ${current.platform}`);
  }
  if (recorded.arch !== current.arch) {
    differences.push(`arch: recorded ${recorded.arch} vs current ${current.arch}`);
  }
  if (recorded.python !== current.python) {
    differences.push(`python: recorded ${recorded.python ?? 'n/a'} vs current ${current.python ?? 'n/a'}`);
  }
  return { match: differences.length === 0, differences };
}
