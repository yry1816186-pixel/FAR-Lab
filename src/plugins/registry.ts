// src/plugins/registry.ts
// 插件注册表（SPEC 门槛 3/4 的注册面）：内容哈希锚定 + 黄金向量过检 + 运行时抽验吊销。
//
// 不可协商语义：
//   - 注册即全量过检：manifest 四道门 + contentHash 重算对账 + 每条黄金向量沙箱实跑
//     + 确定性双跑（同输入两次运行 canonical 输出字节相同——纯函数的实测证明，
//     非声明信任）。任何一步失败 = 拒绝注册（不存在"带病注册"）。
//   - 运行时抽验：每次 runDetector 附带抽验一条注册向量（round-robin），输出漂移
//     = 立即吊销 + 本次调用 fail-closed（SPEC「漂移即吊销」原文）。
//   - 调用收据：每次 runDetector 返回 receipt（插件 id/version/contentHash + 漙变
//     向量 id + durationMs）——同一 proof 重算必须命中同版本检测器的可复现性锚点。
//   - 幂等：同 contentHash 重复注册返回同一 registration，不产生第二条记录。

import { hashCanonicalJson, canonicalJson } from '../evidence_log/hasher.ts';
import { reviewManifest, type PluginManifest } from './manifest.ts';
import {
  DetectorInputSchema,
  DetectorResultSchema,
  runPluginOnce,
  pluginContentHash,
  type DetectorInput,
  type DetectorResult,
} from './sandbox.ts';

export type RegisterRejection =
  | { readonly ok: false; readonly reason: 'MANIFEST'; readonly detail: readonly string[] }
  | { readonly ok: false; readonly reason: 'CONTENT_HASH_DRIFT'; readonly detail: readonly string[] }
  | { readonly ok: false; readonly reason: 'GOLDEN_VECTOR_FAIL'; readonly detail: readonly string[] }
  | { readonly ok: false; readonly reason: 'NON_DETERMINISTIC'; readonly detail: readonly string[] };

export interface PluginRegistration {
  readonly id: string;
  readonly version: string;
  readonly kind: 'advisory' | 'gate';
  readonly contentHash: string;
  readonly fixedTimestamp: string;
  readonly vectorCount: number;
  readonly signatureVerified: boolean;
  readonly registeredAt: string;
}

export type RegisterOutcome =
  | { readonly ok: true; readonly registration: PluginRegistration; readonly manifest: PluginManifest }
  | RegisterRejection;

export interface RegistryOptions {
  /** 注入时钟（注册时间戳）；缺省用宿主真实时钟——注册是一次性管理动作，非裁决路径。 */
  readonly now?: () => string;
  /** 签名校验器（manifest.signature 存在时必须提供且返回 true）。 */
  readonly verifySignature?: (manifest: PluginManifest) => boolean;
}

/** 注册全流程：manifest 门 → contentHash 对账 → 向量全量跑 + 确定性双跑。 */
export function registerPlugin(
  rawManifest: unknown,
  opts: RegistryOptions = {},
): RegisterOutcome {
  const reviewed = reviewManifest(rawManifest, {
    ...(opts.verifySignature !== undefined ? { verifySignature: opts.verifySignature } : {}),
  });
  if (!reviewed.ok) {
    return { ok: false, reason: 'MANIFEST', detail: [`${reviewed.reason}: ${reviewed.errors.join('; ')}`] };
  }
  const manifest = reviewed.manifest;

  const recomputed = pluginContentHash(manifest);
  if (recomputed !== manifest.provenance.contentHash) {
    return {
      ok: false,
      reason: 'CONTENT_HASH_DRIFT',
      detail: [`declared ${manifest.provenance.contentHash.slice(0, 16)}… but recomputed ${recomputed.slice(0, 16)}… — manifest/pluginSource/vectors 改动后必须重算并同步 contentHash`],
    };
  }

  const fixedTimestamp = opts.now ? opts.now() : new Date().toISOString();
  for (const vec of manifest.goldenVectors) {
    const parsedInput = DetectorInputSchema.safeParse(vec.input);
    if (!parsedInput.success) {
      return { ok: false, reason: 'GOLDEN_VECTOR_FAIL', detail: [`vector ${vec.vectorId}: input 不符合 far.detector-input/v1 — ${parsedInput.error.issues[0]?.message ?? ''}`] };
    }
    const first = runPluginOnce(manifest, parsedInput.data, fixedTimestamp);
    if (!first.ok) {
      return { ok: false, reason: 'GOLDEN_VECTOR_FAIL', detail: [`vector ${vec.vectorId}: sandbox ${first.failure} — ${first.detail}`] };
    }
    const expected = DetectorResultSchema.safeParse(vec.expectedOutput);
    if (!expected.success) {
      return { ok: false, reason: 'GOLDEN_VECTOR_FAIL', detail: [`vector ${vec.vectorId}: expectedOutput 不符合 far.detector-result/v1`] };
    }
    if (canonicalJson(first.result) !== canonicalJson(expected.data)) {
      return { ok: false, reason: 'GOLDEN_VECTOR_FAIL', detail: [`vector ${vec.vectorId}: 实跑输出与期望输出 canonical 不一致`] };
    }
    // 确定性双跑：同输入第二次运行必须字节相同（零时钟/随机/IO 的实测证明）。
    const second = runPluginOnce(manifest, parsedInput.data, fixedTimestamp);
    if (!second.ok || canonicalJson(second.result) !== canonicalJson(first.result)) {
      return { ok: false, reason: 'NON_DETERMINISTIC', detail: [`vector ${vec.vectorId}: 同输入两次运行输出不同——插件违反 pure-function 门槛`] };
    }
  }

  return {
    ok: true,
    manifest,
    registration: {
      id: manifest.id,
      version: manifest.version,
      kind: manifest.kind,
      contentHash: recomputed,
      fixedTimestamp,
      vectorCount: manifest.goldenVectors.length,
      signatureVerified: reviewed.signatureVerified,
      registeredAt: fixedTimestamp,
    },
  };
}

export interface DetectorRunReceipt {
  readonly pluginId: string;
  readonly pluginVersion: string;
  readonly contentHash: string;
  readonly kind: 'advisory' | 'gate';
  readonly spotCheckedVectorId: string | null;
  readonly durationMs: number;
}

export type DetectorRun =
  | { readonly ok: true; readonly receipt: DetectorRunReceipt; readonly result: DetectorResult }
  | { readonly ok: false; readonly failure: 'NOT_REGISTERED' | 'REVOKED' | 'SANDBOX' | 'DRIFT_DETECTED'; readonly detail: string };

/**
 * 抽验判定核心（导出供深度防御单测）：manifest 对一条黄金向量的当前沙箱实跑输出
 * 是否与注册时锚定的期望 canonical 一致。v2 子进程架构下同输入恒同输出（进程隔离
 * 消灭状态型非确定性），此函数是防御纵深——覆盖未来架构演进（进程内复用 runner、
 * 常驻 worker）与内存篡改场景。
 */
export function vectorOutputMatches(
  manifest: PluginManifest,
  vector: { readonly vectorId: string; readonly input: unknown; readonly expectedOutput: unknown },
  fixedTimestamp: string,
): { readonly matches: boolean; readonly reason: string } {
  const vecInput = DetectorInputSchema.safeParse(vector.input);
  if (!vecInput.success) {
    return { matches: false, reason: `vector ${vector.vectorId}: input invalid` };
  }
  const expected = DetectorResultSchema.safeParse(vector.expectedOutput);
  if (!expected.success) {
    return { matches: false, reason: `vector ${vector.vectorId}: expectedOutput invalid` };
  }
  const probe = runPluginOnce(manifest, vecInput.data, fixedTimestamp);
  if (!probe.ok) {
    return { matches: false, reason: `vector ${vector.vectorId}: sandbox ${probe.failure}` };
  }
  if (canonicalJson(probe.result) !== canonicalJson(expected.data)) {
    return { matches: false, reason: `vector ${vector.vectorId}: output drift` };
  }
  return { matches: true, reason: 'ok' };
}

/** 进程内注册表。生产接线时由调用方持有单例；测试各持独立实例。 */
export class PluginRegistry {
  #entries = new Map<string, { manifest: PluginManifest; registration: PluginRegistration; revoked: string | null; spotCursor: number }>();

  register(rawManifest: unknown, opts: RegistryOptions = {}): RegisterOutcome {
    const outcome = registerPlugin(rawManifest, opts);
    if (!outcome.ok) return outcome;
    const existing = this.#entries.get(outcome.manifest.id);
    if (existing !== undefined) {
      if (existing.registration.contentHash === outcome.registration.contentHash) {
        // 幂等：同 contentHash 重注册返回原 registration（registeredAt 不变）。
        return { ok: true, manifest: existing.manifest, registration: existing.registration };
      }
      // 同 id 不同 contentHash = 新版本顶替旧版本（旧版本先吊销）。
      existing.revoked = `superseded by content ${outcome.registration.contentHash.slice(0, 16)}…`;
    }
    this.#entries.set(outcome.manifest.id, {
      manifest: outcome.manifest,
      registration: outcome.registration,
      revoked: null,
      spotCursor: 0,
    });
    return outcome;
  }

  lookup(id: string): PluginRegistration | null {
    return this.#entries.get(id)?.registration ?? null;
  }

  revokedReason(id: string): string | null {
    return this.#entries.get(id)?.revoked ?? null;
  }

  /** 运行检测器 + round-robin 向量抽验；漂移即吊销并 fail-closed 本次。 */
  runDetector(id: string, input: DetectorInput): DetectorRun {
    const entry = this.#entries.get(id);
    if (entry === undefined) {
      return { ok: false, failure: 'NOT_REGISTERED', detail: `plugin ${id} not registered` };
    }
    if (entry.revoked !== null) {
      return { ok: false, failure: 'REVOKED', detail: `plugin ${id} revoked: ${entry.revoked}` };
    }
    const run = runPluginOnce(entry.manifest, input, entry.registration.fixedTimestamp);
    if (!run.ok) {
      return { ok: false, failure: 'SANDBOX', detail: `${run.failure}: ${run.detail}` };
    }
    // 抽验一条注册向量：当前沙箱输出必须仍与注册时锚定的期望一致。
    const vec = entry.manifest.goldenVectors[entry.spotCursor % entry.manifest.goldenVectors.length];
    entry.spotCursor += 1;
    if (vec === undefined) {
      return { ok: false, failure: 'SANDBOX', detail: 'registry invariant broken: no golden vectors on registered manifest' };
    }
    const verdict = vectorOutputMatches(entry.manifest, vec, entry.registration.fixedTimestamp);
    if (!verdict.matches) {
      entry.revoked = `golden vector ${vec.vectorId} drift detected at runtime`;
      return { ok: false, failure: 'DRIFT_DETECTED', detail: `${verdict.reason}——插件已吊销，本次调用 fail-closed` };
    }
    return {
      ok: true,
      receipt: {
        pluginId: entry.manifest.id,
        pluginVersion: entry.manifest.version,
        contentHash: entry.registration.contentHash,
        kind: entry.manifest.kind,
        spotCheckedVectorId: vec.vectorId,
        durationMs: run.durationMs,
      },
      result: run.result,
    };
  }
  /** conformance report 的稳定哈希出口（报告防篡改锚点；快照只含 id/version/hash/吊销态）。 */
  snapshotHash(): string {
    return hashCanonicalJson(
      [...this.#entries.keys()].sort().map((id) => {
        const r = this.lookup(id)!;
        return { id: r.id, version: r.version, contentHash: r.contentHash, revoked: this.revokedReason(id) };
      }),
    );
  }
}
