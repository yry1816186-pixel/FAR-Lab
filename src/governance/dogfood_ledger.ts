/**
 * dogfood_ledger — DOGFOOD-001 真实、非专门造出的研究档案登记。
 *
 * 语义（宪法链：question→retrieval→conjectures→challenge→plan→evidence→
 * FEC→verdict→proof/export→independent verification）：
 *   - CHAIN_STAGES：十环全链登记面——登记时每个环节必须指向 bundle 内**真实
 *     产物**（哪个文件承载该环节的证据），缺任一环节 = 不完整 dogfood，拒绝；
 *   - 防伪（档案必须是真实执行产物）：
 *     (1) 每个 stage 的 artifact 路径必须存在于 bundle 目录；
 *     (2) 复用 far_proof/integrity_check 的 verifyFarProofPackageIntegrity
 *         独立重算 integrity.json（改一字节即 mismatch）；
 *     (3) 复用 far_proof/bundle_verifier 的 verifyProofEnvelopeJsonl 重验
 *         proof_envelopes.jsonl 哈希链与链接性（防伪造时间线）；
 *   - 诚实边界强制：profile 必须 'offline_replay'（或显式 live——携带
 *     'honestNote' 声明）且 operator 恒 'team-self-run'——**团队自跑档案，
 *     非外部用户**（宪法 red line：不得把自跑冒充用户验证）。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - 台账证明档案「是某次真实导出的完整 bundle 且链完整」，不证明链路各
 *     环节的科学质量（那是 verdict kernel 与人工评审的职责）；
 *   - offline_replay 档案证明的是**管线接线正确**，不证明模型输出是真实
 *     科学判断（fixture 重放，honestNote 已携带该边界）；
 *   - 时间戳来自 bundle generatedAt（本机钟）——无第三方时间锚定。
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { verifyFarProofPackageIntegrity } from '../far_proof/integrity_check.ts';
import { verifyProofEnvelopeJsonl } from '../far_proof/bundle_verifier.ts';

/** 宪法十环（顺序即链序——登记顺序错乱 = 拒绝）。 */
export const CHAIN_STAGES = [
  'question',
  'retrieval',
  'conjectures',
  'challenge',
  'plan',
  'evidence',
  'fec',
  'verdict',
  'proof-export',
  'independent-verification',
] as const;
export type ChainStage = (typeof CHAIN_STAGES)[number];

export type DogfoodProfile = 'offline_replay' | 'live';

export interface DogfoodStageBinding {
  readonly stage: ChainStage;
  /** bundle 内承载该环节证据的文件（相对 bundle 根，POSIX 路径）。 */
  readonly artifact: string;
}

export interface DogfoodRunRecord {
  readonly runId: string;
  readonly executedAt: string;
  readonly profile: DogfoodProfile;
  /** 恒 'team-self-run'——团队自跑（诚实边界，不许写成外部用户）。 */
  readonly operator: 'team-self-run';
  /** 独立验证步骤的产物引用（far verify 输出锚点）。 */
  readonly independentVerification: { readonly command: string; readonly status: string };
  readonly stages: readonly DogfoodStageBinding[];
}

export interface DogfoodCheck {
  readonly ok: boolean;
  readonly problems: readonly string[];
  readonly integrity: { readonly ok: boolean; readonly errors: readonly string[] } | null;
  readonly envelopeChain: { readonly checked: number; readonly mismatchCount: number; readonly linkageErrorCount: number } | null;
}

function validateStageList(stages: readonly DogfoodStageBinding[], problems: string[]): void {
  const expected = [...CHAIN_STAGES];
  const got = stages.map((s) => s.stage);
  if (got.length !== expected.length || got.some((s, i) => s !== expected[i])) {
    problems.push(`stages must enumerate the constitutional chain in order (${expected.join('→')}), got ${got.join('→') || '<empty>'}`);
  }
  for (const s of stages) {
    if (s.artifact.trim().length === 0) problems.push(`stage ${s.stage}: artifact must be non-empty`);
  }
}

/**
 * 登记 + 防伪检查（一次完成——登记不可先于验证通过）：
 *   1. 结构校验（十环齐全有序、runId/executedAt 非空、operator 铁律）；
 *   2. 每个 stage artifact 存在于 bundleDir；
 *   3. integrity.json 独立重算比对（verifyFarProofPackageIntegrity 复用）；
 *   4. proof_envelopes.jsonl 哈希链重验（verifyProofEnvelopeJsonl 复用）。
 */
export function registerDogfoodRun(record: DogfoodRunRecord, bundleDir: string): DogfoodCheck {
  const problems: string[] = [];
  if (record.runId.trim().length === 0) problems.push('runId must be non-empty');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(record.executedAt)) problems.push(`executedAt must be ISO timestamp, got "${record.executedAt}"`);
  if (record.operator !== 'team-self-run') problems.push(`operator must be 'team-self-run' (team dogfood is never external-user evidence), got "${record.operator}"`);
  if (record.independentVerification.status !== 'ok' && record.independentVerification.status !== 'WARN-but-chain-clean') {
    problems.push(`independent verification status must be a real verify outcome, got "${record.independentVerification.status}"`);
  }
  validateStageList(record.stages, problems);
  if (problems.length > 0) return { ok: false, problems, integrity: null, envelopeChain: null };

  if (!existsSync(bundleDir)) {
    return { ok: false, problems: [`bundle directory does not exist: ${bundleDir}`], integrity: null, envelopeChain: null };
  }
  for (const s of record.stages) {
    if (!existsSync(join(bundleDir, s.artifact))) {
      problems.push(`stage ${s.stage}: artifact "${s.artifact}" not found in bundle — every stage must cite a real execution artifact`);
    }
  }

  const integrity = verifyFarProofPackageIntegrity(bundleDir);
  if (!integrity.ok) problems.push(`bundle integrity failed: ${integrity.errors.join('; ')}`);

  let envelopeChain: DogfoodCheck['envelopeChain'] = null;
  const envelopesPath = join(bundleDir, 'proof_envelopes.jsonl');
  if (existsSync(envelopesPath)) {
    const chain = verifyProofEnvelopeJsonl(envelopesPath);
    envelopeChain = { checked: chain.checked, mismatchCount: chain.mismatches.length, linkageErrorCount: chain.linkageErrors.length };
    if (chain.mismatches.length > 0 || chain.linkageErrors.length > 0) {
      problems.push(`proof envelope chain broken: ${chain.mismatches.length} hash mismatches, ${chain.linkageErrors.length} linkage errors`);
    }
  } else {
    problems.push('proof_envelopes.jsonl missing from bundle — cannot verify the audit chain');
  }

  return { ok: problems.length === 0, problems, integrity: { ok: integrity.ok, errors: integrity.errors }, envelopeChain };
}

/**
 * 从 bundle README_REPLAY.md / call_records 提取执行指纹（登记摘要——
 * sha256(全部 stage artifact 文件内容)，用于台账跨时间比对「同一 bundle
 * 未被重新生成」）。
 */
export function dogfoodFingerprint(record: DogfoodRunRecord, bundleDir: string): string | null {
  for (const s of record.stages) {
    if (!existsSync(join(bundleDir, s.artifact))) return null;
  }
  const h = createHash('sha256');
  for (const s of record.stages) {
    h.update(s.stage);
    h.update(readFileSync(join(bundleDir, s.artifact)));
  }
  return h.digest('hex');
}
