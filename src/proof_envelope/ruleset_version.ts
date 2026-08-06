/**
 * Ruleset 版本治理(ADR-007 H1+H3 · IC-01)。
 *
 * H1: envelope 内嵌 ruleset URI(SemVer 治理):
 *   - MAJOR:规则语义不兼容 → URI 变化(farlab.dev/ruleset/vN,N 升);
 *   - MINOR:单调后向兼容扩展(URI 不变,未知字段忽略,裁决不翻转);
 *   - PATCH:不动语义(URI 不变)。
 * H3: 主版本验证器并存——验证器按 URI 派发:
 *   - 无 URI / NULL = legacy V1 信封,按 v1 默认派发(IC-01 migration 条款);
 *   - v1 → 现有 V1 验证路径(computeProofHash 复算);
 *   - 未知/伪造主版本 → fail-closed 抛错(不得静默按新版处理,不得翻转裁决)。
 *
 * 复算语义:proofHash canonical 输入含 rulesetUri(存在时);legacy 信封无该字段,
 * canonical 输入不变,故旧证明按声明版本(v1)复算结果不变(版本 bump 不追溯)。
 *
 * 模型中立. 零容忍合规: 无 any / @ts-ignore / 空 catch。
 */

export const RULESET_URI_V1 = 'farlab.dev/ruleset/v1';

/** 当前密封规则集 URI(新信封由 sealer 硬编码写入;版本 bump = 改此常量+并存旧验证器) */
export const CURRENT_RULESET_URI = RULESET_URI_V1;

/** 支持派发的规则集 URI 集(主版本验证器并存登记表) */
export const SUPPORTED_RULESET_URIS = [RULESET_URI_V1] as const;

const RULESET_URI_RE = /^farlab\.dev\/ruleset\/v(\d+)$/;

/** 解析 ruleset URI 的主版本号;非 URI 格式返回 null。 */
export function parseRulesetMajor(uri: string): number | null {
  const m = RULESET_URI_RE.exec(uri.trim());
  if (m === null || m[1] === undefined) return null;
  return Number.parseInt(m[1], 10);
}

/** 读取侧解析:NULL/空 = legacy V1 默认派发。 */
export function resolveRulesetUri(uri: string | null | undefined): string {
  if (uri === null || uri === undefined || uri.trim().length === 0) return RULESET_URI_V1;
  return uri.trim();
}

/**
 * is supported ruleset uri.
 */
export function isSupportedRulesetUri(uri: string): boolean {
  return (SUPPORTED_RULESET_URIS as readonly string[]).includes(uri);
}

/** 密封侧断言:URI 须格式合法且主版本受支持(禁密封未来版本/畸形版本)。 */
export function assertSealableRulesetUri(uri: string): void {
  if (parseRulesetMajor(uri) === null) {
    throw new Error(`ruleset_version: malformed ruleset_uri '${uri}'(期望 farlab.dev/ruleset/vN)`);
  }
  if (!isSupportedRulesetUri(uri)) {
    throw new Error(
      `ruleset_version: unsupported ruleset_uri '${uri}'(当前支持: ${SUPPORTED_RULESET_URIS.join(', ')})`,
    );
  }
}

/**
 * 验证侧派发:返回主版本号。
 * 无 URI → 1(legacy v1);未知/伪造主版本 → fail-closed 抛错(不翻转、不静默)。
 * V03-F1 修复:含首尾空白的非规范 URI 一律 MALFORMED——canonical 输入保留原始串,
 * trim 后放行会造成 seal 严/verify 宽不对称(填充形态重算 hash 后可过检)。
 */
export function dispatchRulesetVerifier(uri: string | null | undefined): number {
  if (uri !== null && uri !== undefined && uri !== uri.trim()) {
    throw new Error(`RULESET_VERSION_MALFORMED: '${uri}'(含首尾空白,非规范 URI;fail-closed)`);
  }
  const resolved = resolveRulesetUri(uri);
  if (parseRulesetMajor(resolved) === null) {
    throw new Error(`RULESET_VERSION_MALFORMED: '${resolved}'(期望 farlab.dev/ruleset/vN)`);
  }
  if (!isSupportedRulesetUri(resolved)) {
    throw new Error(
      `RULESET_VERSION_UNSUPPORTED: '${resolved}'(本验证器支持: ${SUPPORTED_RULESET_URIS.join(', ')})`,
    );
  }
  return 1;
}
