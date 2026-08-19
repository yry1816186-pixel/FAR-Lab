// src/plugins/manifest.ts
// 插件 manifest 契约 SSOT（OSS-PLUGIN-001 / OSS-SDK-001；SPEC-verdict-detector-
// plugin-registry 四门槛的声明面）。
//
// 设计裁决（对齐 SPEC 与宪法 DOMAIN_PROTOCOLS I3）：
//   - V1 宿主 API 只有一种能力类型（verdict-detector）；manifest 声明的字段是
//     **拒绝面**——凡与 V1 宿主承诺不符的值（networkAccess≠none、determinismProfile
//     ≠pure-function、trustLevel≠untrusted、failureBehavior≠fail-closed）一律
//     schema 拒绝，不进入"声明了但宿主不执行"的灰色态。
//   - permissions 在 V1 必须为空数组：纯函数检测器没有任何权限需求；声明任何
//     权限 = permission denial 测试的拒绝路径（REQ Acceptance 原文）。
//   - contentHash 由注册器在加载时重算校验（manifest.pluginSource + goldenVectors
//     的 canonical 哈希）；manifest 自带的 contentHash 只是预声明，真相以重算为准。
//   - signature 可选：未签名插件可加载但 conformance report 标注 unsigned；
//     声明了签名则必须通过 ed25519 校验（复用 src/security/ed25519.ts）。
//   - 插件永不能改五值枚举：kind=gate 的 Finding 最多触发 INCONCLUSIVE/UNTESTED
//     信号，裁决权架构上不外包（SPEC 边界原文）。

import { z } from 'zod';

/** 宿主 API 契约版本。major 变更 = 旧插件按 compatibility.hostVersionRange 拒载。 */
export const PLUGIN_HOST_API_VERSION = 'far.plugin-host/v1.2.0';

/** semver 三段式（宽松校验，加载器不做完整 semver 解析——范围匹配见 compatibility）。 */
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
/** 反向域名式插件 ID（SPEC 接口草案约定：org.example.detector-name）。 */
const PLUGIN_ID_RE = /^[a-z0-9]+(\.[a-z0-9-]+){2,}$/;
/** SPDX 许可证表达式（宽松：标识符 + 常见连接符）。 */
const SPDX_RE = /^[A-Za-z0-9.+-]+(?: (?:OR|AND|WITH) [A-Za-z0-9.+-]+)*$/;
/** semver 范围（V1 只支持精确版本与 ^ 波浪精确前缀两种，够用且可判定）。 */
const VERSION_RANGE_RE = /^(\d+\.\d+\.\d+|\^\d+\.\d+\.\d+)$/;

/** 黄金向量：注册时全量跑 + 运行时抽验的确定性锚（SPEC 门槛 3）。 */
export const PluginGoldenVectorSchema = z
  .object({
    vectorId: z.string().min(1).max(64),
    /** DetectorInput 的 JSON 投影（只读证据快照 + 裁决上下文）。 */
    input: z.unknown(),
    /** 期望的 DetectorResult（逐 findings 断言）。 */
    expectedOutput: z.unknown(),
  })
  .strict();
export type PluginGoldenVector = z.infer<typeof PluginGoldenVectorSchema>;

/** 插件 manifest（OSS-PLUGIN-001 要求的字段全清单，拒绝未声明字段）。 */
export const PluginManifestSchema = z
  .object({
    /** 反向域名式 ID。 */
    id: z.string().regex(PLUGIN_ID_RE),
    /** semver；major 变更需重新过检（注册器不强制，conformance 报告披露）。 */
    version: z.string().regex(SEMVER_RE),
    /** 能力类型；V1 宿主仅实现 verdict-detector。 */
    capabilityType: z.literal('verdict-detector'),
    /** advisory=只标注不阻断；gate=可产生 INCONCLUSIVE/UNTESTED 信号。 */
    kind: z.enum(['advisory', 'gate']),
    /** 输入/输出契约版本声明；V1 必须匹配宿主契约。 */
    schemas: z
      .object({
        input: z.literal('far.detector-input/v1'),
        output: z.literal('far.detector-result/v1'),
      })
      .strict(),
    /** 权限清单；V1 纯函数宿主只接受空清单（非空=拒绝加载）。 */
    permissions: z.array(z.never()).max(0),
    /** 确定性档位；V1 仅纯函数（零 IO/网络/时钟/随机）。 */
    determinismProfile: z.literal('pure-function'),
    /** 网络访问声明；V1 仅 none（沙箱也无网络面，声明非 none 双重拒绝）。 */
    networkAccess: z.literal('none'),
    /** 数据访问边界：仅输入快照。 */
    dataAccess: z.literal('input-snapshot-only'),
    /** 资源限额：沙箱执行硬超时 + 输出字节上限。 */
    resourceLimits: z
      .object({
        maxDurationMs: z.number().int().min(1).max(10_000),
        maxOutputBytes: z.number().int().min(1).max(1_048_576),
      })
      .strict(),
    /** 信任级别：第三方插件恒为 untrusted（内核内置检测器不进注册表）。 */
    trustLevel: z.literal('untrusted'),
    /** 宿主兼容范围；不匹配当前宿主 API 版本 = version mismatch 拒载。 */
    compatibility: z
      .object({
        hostApi: z.string().min(1),
        hostVersionRange: z.string().regex(VERSION_RANGE_RE),
      })
      .strict(),
    /** 溯源钩子：作者 + 源地址 + 内容哈希预声明（真相以注册器重算为准）。 */
    provenance: z
      .object({
        author: z.string().min(1).max(128),
        sourceUrl: z.string().url().max(512).optional(),
        contentHash: z.string().length(64),
      })
      .strict(),
    /** 失败行为：异常=fail-closed 吊销本次（唯一合法值）。 */
    failureBehavior: z.literal('fail-closed'),
    /** SPDX 许可证表达式。 */
    license: z.string().regex(SPDX_RE).max(128),
    /** ed25519 签名（可选；声明则注册时必须校验通过）。 */
    signature: z
      .object({
        algorithm: z.literal('ed25519'),
        /** base64 签名值，对 canonical(manifest 除 signature 外全部字段) 签。 */
        value: z.string().min(1).max(512),
      })
      .strict()
      .optional(),
    /** 注册门槛：≥1 条黄金向量（SPEC 门槛 3：注册时全量跑，漂移即吊销）。 */
    goldenVectors: z.array(PluginGoldenVectorSchema).min(1).max(256),
    /** 插件源码（纯函数 evaluate 的 JS 文本；沙箱内编译执行）。 */
    pluginSource: z.string().min(1).max(262_144),
  })
  .strict();

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

/** semver 范围匹配（精确或 ^ 主版本兼容；V1 支持面见 VERSION_RANGE_RE）。 */
export function hostVersionInRange(hostVersion: string, range: string): boolean {
  if (range === hostVersion) return true;
  if (!range.startsWith('^')) return false;
  const [wMaj, wMin = 0, wPat = 0] = range.slice(1).split('.').map(Number);
  const [hMaj, hMin = 0, hPat = 0] = hostVersion.split('.').map(Number);
  // ^ 语义：同 major 且 host ≥ 基线（minor/patch 字典序不小于）。
  return wMaj === hMaj && (hMin > wMin || (hMin === wMin && hPat >= wPat));
}

/** manifest 解析失败的结构化错误（conformance report 消费）。 */
export interface ManifestRejection {
  readonly ok: false;
  readonly reason: 'SCHEMA_INVALID' | 'HOST_API_MISMATCH' | 'HOST_VERSION_MISMATCH' | 'SIGNED_BUT_INVALID';
  readonly errors: readonly string[];
}

export interface ManifestAcceptance {
  readonly ok: true;
  readonly manifest: PluginManifest;
  readonly signatureVerified: boolean;
}

/**
 * 解析并裁决 manifest 是否可加载（schema → 宿主 API → 版本范围 → 签名 四道门，
 * 全部通过才返回 acceptance）。任何拒绝都带机器可读 reason + 人读 errors。
 */
export function reviewManifest(
  raw: unknown,
  opts: { readonly verifySignature?: (manifest: PluginManifest) => boolean } = {},
): ManifestAcceptance | ManifestRejection {
  const parsed = PluginManifestSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'SCHEMA_INVALID',
      errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }
  const manifest = parsed.data;
  const hostMajor = (PLUGIN_HOST_API_VERSION.split('/')[1] ?? '').replace(/^v/, '').split('.')[0] ?? '';
  const wantApiMajor = `far.plugin-host/v${hostMajor}`;
  if (manifest.compatibility.hostApi !== wantApiMajor) {
    return {
      ok: false,
      reason: 'HOST_API_MISMATCH',
      errors: [`hostApi major contract must be ${wantApiMajor}, got ${manifest.compatibility.hostApi}`],
    };
  }
  const hostSemver = (PLUGIN_HOST_API_VERSION.split('/')[1] ?? '').replace(/^v/, '');
  if (!hostVersionInRange(hostSemver, manifest.compatibility.hostVersionRange)) {
    return {
      ok: false,
      reason: 'HOST_VERSION_MISMATCH',
      errors: [`host ${PLUGIN_HOST_API_VERSION} outside declared range ${manifest.compatibility.hostVersionRange}`],
    };
  }
  if (manifest.signature !== undefined) {
    const ok = opts.verifySignature ? opts.verifySignature(manifest) : false;
    if (!ok) {
      return { ok: false, reason: 'SIGNED_BUT_INVALID', errors: ['declared ed25519 signature failed verification'] };
    }
  }
  return { ok: true, manifest, signatureVerified: manifest.signature !== undefined };
}
