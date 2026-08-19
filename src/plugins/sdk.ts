// src/plugins/sdk.ts
// 插件 SDK 入口（OSS-SDK-001：第三方无需读宿主内部实现即可构建 conformant 插件）。
//
// 最小构建路径（tutorial 的机器面）：
//   const manifest = definePlugin({ ...草稿字段（不含 contentHash） });
//   // → zod 全字段校验 + canonical contentHash 自动回填；任何字段不合规即刻报错，
//   //   报错文本即修复指引（第三方不用猜格式）。
//   const report = runConformance(manifest);  // 五类 Acceptance 探针 + 注册过检
//   // report.verdict === 'PASS' 即 conformance（CI 断言同一函数）。
//
// versioning/migration 契约：HOST API major 变更时 compatibility.hostApi 的 vN 与
// hostVersionRange 同时升 major；旧插件按 HOST_API/HOST_VERSION_MISMATCH 拒载（不静默）。

import { z } from 'zod';
import { PluginManifestSchema, type PluginManifest } from './manifest.ts';
import { pluginContentHash } from './sandbox.ts';

/** 插件草稿：与 PluginManifest 同构但省去 provenance.contentHash（由本函数回填）。 */
export const PluginDraftSchema = PluginManifestSchema.extend({
  provenance: PluginManifestSchema.shape.provenance.omit({ contentHash: true }),
});
export type PluginDraft = z.infer<typeof PluginDraftSchema>;

export type DefinePluginResult =
  | { readonly ok: true; readonly manifest: PluginManifest }
  | { readonly ok: false; readonly issues: readonly string[] };

/**
 * SDK 构建入口：草稿校验 + contentHash 回填。失败时逐字段给出行内修复指引。
 */
export function definePlugin(draft: unknown): DefinePluginResult {
  const parsed = PluginDraftSchema.safeParse(draft);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  }
  const withoutHash: PluginManifest = {
    ...parsed.data,
    provenance: { ...parsed.data.provenance, contentHash: '0'.repeat(64) },
  };
  const contentHash = pluginContentHash(withoutHash);
  return { ok: true, manifest: { ...withoutHash, provenance: { ...parsed.data.provenance, contentHash } } };
}
