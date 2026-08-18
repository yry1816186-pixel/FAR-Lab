// src/evaluation/open_eval.ts
// 职责：EVAL-OPEN-001 第三方重跑与挑战支持（评估资产开放机制层）。
//
// 宪法条款：公开条件允许时提供 protocol / task manifest / lawful data
// access instructions / configs+seeds / runners / raw results / analysis
// code / known limitations / negative results / issue+appeal process。
//
// 机制：
//   buildRerunManifest       10 项资产齐全才成册 → canonical hash（manifest
//                            指纹——第三方可对收到的册子独立重算）
//   verifyManifestIntegrity  册子篡改检出（重算 hash vs 声明 hash）
//   generateRerunCommands    确定性重跑指令文本（从册子生成，不手写——
//                            指令与册子不可能漂移）
//   lawfulAccessCheck        许可边界：受限数据只允许「访问指引」不允许
//                            内联再分发（restricted 资产携带 inlineContent
//                            → 违规拒绝）
//   parseChallengeSubmission 挑战 intake 格式（issue/appeal/replication-
//                            mismatch 三类 + 证据引用必填）——外部挑战的
//                            结构化入口；挑战的处理本身是人工流程（机制
//                            只保证入口格式与必填面）
//
// 确定性纪律：纯函数；hash 复用 evidence_log/hasher 的 canonical SSOT；
// 指令生成按资产 kind 固定顺序（册内顺序即命令顺序）。
//
// Cannot-prove：本机制证明「册子的完整性可校验、重跑指令与册子一致、
// 受限资产的再分发禁令被机器检查」，不证明 (a) 第三方真的能取到数据
// （数据可及性是许可方/网络的现实约束——册子只能给出指引）；(b) 挑战
// 内容的真实性（intake 只验格式与必填，不验断言真伪）；(c) 资产内容与
// 其声明 kind 相符（协议文档是否真是协议由人工审核）。

import { hashCanonicalJson } from '../evidence_log/hasher.ts';

// ---------------------------------------------------------------------------
// 册子 schema：10 项资产（宪法原文枚举）
// ---------------------------------------------------------------------------

export const OPEN_EVAL_ASSET_KINDS = [
  'protocol',
  'task-manifest',
  'data-access-instructions',
  'configs-and-seeds',
  'runner',
  'raw-results',
  'analysis-code',
  'known-limitations',
  'negative-results',
  'issue-appeal-process',
] as const;
export type OpenEvalAssetKind = (typeof OPEN_EVAL_ASSET_KINDS)[number];

/** 资产许可类别：public = 可随册分发；restricted = 只给访问指引。 */
export type AccessClass = 'public' | 'restricted';

export interface OpenEvalAsset {
  readonly kind: OpenEvalAssetKind;
  /** 资产定位（路径/URL/DOI——第三方可解析的引用）。 */
  readonly ref: string;
  /** 内容 hash（第三方下载后可校验拿到的是册子指认的版本）。 */
  readonly contentHash: string;
  readonly access: AccessClass;
  /** 内联内容（仅 public 资产允许携带；restricted 携带 → 违规）。 */
  readonly inlineContent?: string;
}

export interface RerunManifest {
  readonly evalId: string;
  readonly assets: readonly OpenEvalAsset[];
  /** canonical hash over {evalId, assets 投影}——册子指纹。 */
  readonly manifestHash: string;
}

function manifestProjection(evalId: string, assets: readonly OpenEvalAsset[]): unknown {
  return {
    evalId,
    assets: assets.map((a) => ({ kind: a.kind, ref: a.ref, contentHash: a.contentHash, access: a.access, inlineContent: a.inlineContent ?? null })),
  };
}

// ---------------------------------------------------------------------------
// 建册 + 完整性
// ---------------------------------------------------------------------------

export type ManifestBuildResult =
  | { readonly ok: true; readonly manifest: RerunManifest }
  | { readonly ok: false; readonly missing: readonly OpenEvalAssetKind[]; readonly reason: string };

/** 建册：10 kind 齐全（每 kind 至少 1 项）才成功；缺失清单如实返回。 */
export function buildRerunManifest(evalId: string, assets: readonly OpenEvalAsset[]): ManifestBuildResult {
  const present = new Set(assets.map((a) => a.kind));
  const missing = OPEN_EVAL_ASSET_KINDS.filter((k) => !present.has(k));
  if (missing.length > 0) {
    return { ok: false, missing, reason: `manifest incomplete: missing ${missing.join(', ')}` };
  }
  return {
    ok: true,
    manifest: { evalId, assets, manifestHash: hashCanonicalJson(manifestProjection(evalId, assets)) },
  };
}

export type ManifestIntegrity =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/** 册子完整性：重算投影 hash 与声明 manifestHash 比对（篡改检出）。 */
export function verifyManifestIntegrity(manifest: RerunManifest): ManifestIntegrity {
  const recomputed = hashCanonicalJson(manifestProjection(manifest.evalId, manifest.assets));
  if (recomputed !== manifest.manifestHash) {
    return { ok: false, reason: `manifest hash mismatch: declared ${manifest.manifestHash.slice(0, 12)}… recomputed ${recomputed.slice(0, 12)}… — manifest tampered or corrupted` };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 许可边界：restricted 资产禁止内联再分发
// ---------------------------------------------------------------------------

/** 受限资产再分发检查：restricted + inlineContent 非空 → 违规（fail-closed）。 */
export function lawfulAccessCheck(assets: readonly OpenEvalAsset[]): { readonly ok: boolean; readonly violations: readonly string[] } {
  const violations = assets
    .filter((a) => a.access === 'restricted' && a.inlineContent !== undefined && a.inlineContent.length > 0)
    .map((a) => `asset kind="${a.kind}" is access=restricted but carries inlineContent — lawful redistribution requires access instructions only (ref: ${a.ref})`);
  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// 重跑指令生成（确定性）
// ---------------------------------------------------------------------------

/** 单资产的重跑指令行（按 kind 生成——指令与册子不可能漂移）。 */
function assetCommand(asset: OpenEvalAsset): string {
  switch (asset.kind) {
    case 'protocol':
      return `# 1. read the frozen protocol: ${asset.ref}`;
    case 'task-manifest':
      return `node dist/cli/far.js bench --manifest ${asset.ref}`;
    case 'data-access-instructions':
      return `# 2. obtain data lawfully per instructions: ${asset.ref}${asset.access === 'restricted' ? ' (RESTRICTED — apply for access, do not expect redistribution)' : ''}`;
    case 'configs-and-seeds':
      return `node dist/cli/far.js bench --config ${asset.ref} --seeds-from ${asset.ref}`;
    case 'runner':
      return `node ${asset.ref}`;
    case 'raw-results':
      return `# 3. compare your raw results against published: ${asset.ref} (contentHash ${asset.contentHash.slice(0, 12)})`;
    case 'analysis-code':
      return `node ${asset.ref} --results-dir .far/eval-results`;
    case 'known-limitations':
      return `# 4. read known limitations before interpreting: ${asset.ref}`;
    case 'negative-results':
      return `# 5. check negative-results register before claiming novelty: ${asset.ref}`;
    case 'issue-appeal-process':
      return `# 6. challenges: submit via the intake format (see parseChallengeSubmission) — process doc: ${asset.ref}`;
  }
}

/** 生成重跑指令（确定性文本：资产顺序即指令顺序）。 */
export function generateRerunCommands(manifest: RerunManifest): string {
  const lines = [`# rerun instructions for eval "${manifest.evalId}" (manifest ${manifest.manifestHash.slice(0, 16)})`];
  for (const asset of manifest.assets) lines.push(assetCommand(asset));
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 挑战 intake
// ---------------------------------------------------------------------------

export type ChallengeKind = 'issue' | 'appeal' | 'replication-mismatch';

export interface ChallengeSubmission {
  readonly kind: ChallengeKind;
  /** 挑战者标识（匿名 handle 可）。 */
  readonly challenger: string;
  /** 被挑战的评估 id。 */
  readonly evalId: string;
  /** 挑战主张（一句话）。 */
  readonly claim: string;
  /** 证据引用（≥1——无证据的挑战不受理）。 */
  readonly evidenceRefs: readonly string[];
}

export type IntakeResult =
  | { readonly ok: true; readonly submission: ChallengeSubmission; readonly ticketId: string }
  | { readonly ok: false; readonly problems: readonly string[] };

/**
 * 挑战 intake：kind/challenger/evalId/claim 非空 + evidenceRefs ≥1 才受理；
 * ticketId = 输入的确定性 hash（同挑战同号——可追踪，防重复受理分歧）。
 * Cannot-prove：受理 ≠ 成立——挑战的裁决是人工流程，本机制只做入口门。
 */
export function parseChallengeSubmission(input: {
  readonly kind?: unknown;
  readonly challenger?: unknown;
  readonly evalId?: unknown;
  readonly claim?: unknown;
  readonly evidenceRefs?: unknown;
}): IntakeResult {
  const problems: string[] = [];
  const kind = input.kind;
  const challenger = input.challenger;
  const evalId = input.evalId;
  const claim = input.claim;
  const evidenceRefs = input.evidenceRefs;

  if (typeof kind !== 'string' || !['issue', 'appeal', 'replication-mismatch'].includes(kind)) {
    problems.push(`kind must be one of issue|appeal|replication-mismatch (got ${JSON.stringify(kind)})`);
  }
  if (typeof challenger !== 'string' || challenger.trim().length === 0) problems.push('challenger must be a non-empty string');
  if (typeof evalId !== 'string' || evalId.trim().length === 0) problems.push('evalId must be a non-empty string');
  if (typeof claim !== 'string' || claim.trim().length === 0) problems.push('claim must be a non-empty string');
  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0 || evidenceRefs.some((e) => typeof e !== 'string' || e.trim().length === 0)) {
    problems.push('evidenceRefs must be a non-empty array of non-empty strings — challenges without evidence are not accepted');
  }
  if (problems.length > 0) return { ok: false, problems };

  const submission: ChallengeSubmission = {
    kind: kind as ChallengeKind,
    challenger: challenger as string,
    evalId: evalId as string,
    claim: claim as string,
    evidenceRefs: evidenceRefs as string[],
  };
  const ticketId = hashCanonicalJson(submission).slice(0, 16);
  return { ok: true, submission, ticketId };
}
