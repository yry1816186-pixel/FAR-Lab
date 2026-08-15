/**
 * discovery/registry_anchor — 发现优先权的外部时间锚定（2.md §8.9 后 R10 T1）。
 *
 * Newton-Leibniz 问题：本机时间戳在质疑者面前不构成优先权证据。本模块把注册表
 * 的 Merkle 根锚定为可第三方独立验证的凭据：
 *   - computeRegistryMerkleRoot：对全部 recordHash 构造 Merkle 根（确定性纯函数）；
 *   - 锚点台账（append-only 哈希链，与注册表同构）：每条锚 = 根 + 多源时间
 *     （本地 UTC + git HEAD commit 时间）+ prev 锚哈希；
 *   - 凭据导出：第三方可用「同一份注册表 → 重算根 → 对照锚点」验证"何时首次
 *     提出全部这些猜想"（集合级优先权；单条级由 registryId 定位）。
 *
 * 多源时间不一致时显式登记（timeSourceDivergence 字段如实标注秒差）——
 * 治理诚实优先于整洁。
 *
 * Cannot-prove（不可隐藏）：
 *   - 本地 git 变体锚定的是「本仓库 HEAD」，凭据的第三方效力取决于锚点凭据
 *     本身被发布/公证到不可由锚定者单方改写的外部介质（公开仓库 push 后历史
 *     不可变 / RFC 3161 TSA）。本模块只产出锚点与凭据，不替外部介质作保——
 *     TSA 增强未实现（外部服务 + 政策裁决，见 backlog）。
 *   - Merkle 根证明的是注册表内容集合，不证明内容新颖性（新颖性是 REDISCOVERY/
 *     NOVEL 级的检索+人工复核职责，§2.4）。
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import {
  verifyDiscoveryRegistryChain,
  type DiscoveryRegistryRecord,
} from './registry.ts';

/** 锚点台账默认路径（与注册表同目录，append-only）。 */
export const DEFAULT_REGISTRY_ANCHORS_PATH = '.far/discovery/registry-anchors.jsonl';

const MERKLE_DOMAIN = 'far-registry-merkle:';

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * 注册表 Merkle 根：叶 = recordHash（链哈希，绑定整条链状态），
 * 自底向上两两归并（sha256(domain + a + b)），奇数个则复制末叶。
 * 空注册表 → sha256(domain + 'empty')（诚实空根，非 null）。
 * 纯函数：同输入字节恒等（与 canonical 序无关——recordHash 顺序即台账顺序）。
 */
export function computeRegistryMerkleRoot(records: readonly DiscoveryRegistryRecord[]): string {
  if (records.length === 0) return sha256(`${MERKLE_DOMAIN}empty`);
  let level = records.map((r) => r.recordHash);
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const a = level[i]!;
      const b = i + 1 < level.length ? level[i + 1]! : a; // 奇数叶：复制末叶
      next.push(sha256(`${MERKLE_DOMAIN}${a}${b}`));
    }
    level = next;
  }
  return level[0]!;
}

/** 单条锚点（append-only 台账行）。 */
export interface RegistryAnchor {
  readonly kind: 'registry_anchor';
  readonly anchorId: string;
  /** UTC ISO-8601（锚定时刻·本地钟，展示与登记用）。 */
  readonly anchoredAtUtc: string;
  readonly registryMerkleRoot: string;
  readonly recordCount: number;
  readonly chainValid: boolean;
  /** 锚定时仓库 HEAD（40-hex；git 不可用时为 null——如实，不编造）。 */
  readonly gitHeadSha: string | null;
  /** git HEAD commit 的作者外时间（ISO；不可得为 null）。 */
  readonly gitCommitUtc: string | null;
  /** 多源时间分歧（秒）：|本地钟 − git commit 时间|；任一源缺失为 null。 */
  readonly timeSourceDivergenceSec: number | null;
  readonly prevAnchorHash: string;
  readonly anchorHash: string;
}

export interface AnchorInput {
  readonly records: readonly DiscoveryRegistryRecord[];
  readonly anchoredAtUtc: string;
  readonly gitHeadSha: string | null;
  readonly gitCommitUtc: string | null;
  readonly sequence: number;
  readonly prevAnchorHash: string;
}

/** 构造一条锚点（纯函数；时间与 git 源由调用方注入，保证可测确定性）。 */
export function buildRegistryAnchor(input: AnchorInput): RegistryAnchor {
  const chain = verifyDiscoveryRegistryChain(input.records);
  const root = computeRegistryMerkleRoot(input.records);
  const divergence =
    input.gitCommitUtc !== null
      ? Math.abs(
          (Date.parse(input.anchoredAtUtc) - Date.parse(input.gitCommitUtc)) / 1000,
        )
      : null;
  const core = {
    kind: 'registry_anchor' as const,
    anchorId: `anc-${String(input.sequence).padStart(6, '0')}-${root.slice(0, 12)}`,
    anchoredAtUtc: input.anchoredAtUtc,
    registryMerkleRoot: root,
    recordCount: input.records.length,
    chainValid: chain.valid,
    gitHeadSha: input.gitHeadSha,
    gitCommitUtc: input.gitCommitUtc,
    timeSourceDivergenceSec: divergence === null || Number.isFinite(divergence) ? divergence : null,
    prevAnchorHash: input.prevAnchorHash,
  };
  return { ...core, anchorHash: hashCanonicalJson(core) };
}

/** 读取锚点台账（缺失 → 空数组；行损坏 → 抛错 fail-closed，不静默截断）。 */
export function readRegistryAnchors(anchorsPath: string): RegistryAnchor[] {
  if (!existsSync(anchorsPath)) return [];
  const lines = readFileSync(anchorsPath, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  return lines.map((line, idx) => {
    try {
      return JSON.parse(line) as RegistryAnchor;
    } catch (error) {
      throw new Error(
        `readRegistryAnchors: corrupt anchor line ${idx} in ${anchorsPath}: ${(error as Error).message}`,
        { cause: error },
      );
    }
  });
}

/** 验证锚点台账自身的哈希链（与注册表链同构的防篡改语义）。 */
export function verifyRegistryAnchorsChain(anchors: readonly RegistryAnchor[]): {
  valid: boolean;
  firstBrokenIndex: number | null;
  reason: string | null;
} {
  let prev = '';
  for (let i = 0; i < anchors.length; i += 1) {
    const anchor = anchors[i]!;
    const { anchorHash: _ignored, ...core } = anchor;
    if (hashCanonicalJson(core) !== anchor.anchorHash) {
      return { valid: false, firstBrokenIndex: i, reason: `anchor ${i}: anchorHash mismatch (content tampered)` };
    }
    if (anchor.prevAnchorHash !== prev) {
      return { valid: false, firstBrokenIndex: i, reason: `anchor ${i}: prevAnchorHash breaks the chain` };
    }
    prev = anchor.anchorHash;
  }
  return { valid: true, firstBrokenIndex: null, reason: null };
}

export interface AnchorAppendResult {
  readonly anchor: RegistryAnchor;
  readonly anchorsPath: string;
  /** 本锚与上一锚的根是否相同（相同 = 期间注册表零变更，如实登记）。 */
  readonly rootUnchanged: boolean;
}

/** 追加一条锚点到台账（文件锁简化为原子整写——锚频率低，无并发场景）。 */
export function appendRegistryAnchor(input: {
  readonly anchorsPath: string;
  readonly records: readonly DiscoveryRegistryRecord[];
  readonly anchoredAtUtc: string;
  readonly gitHeadSha: string | null;
  readonly gitCommitUtc: string | null;
}): AnchorAppendResult {
  const existing = readRegistryAnchors(input.anchorsPath);
  const chain = verifyRegistryAnchorsChain(existing);
  if (!chain.valid) {
    throw new Error(
      `appendRegistryAnchor: anchors ledger chain broken at ${chain.firstBrokenIndex} (${chain.reason}) — refuse to anchor onto a tampered ledger`,
    );
  }
  const anchor = buildRegistryAnchor({
    records: input.records,
    anchoredAtUtc: input.anchoredAtUtc,
    gitHeadSha: input.gitHeadSha,
    gitCommitUtc: input.gitCommitUtc,
    sequence: existing.length + 1,
    prevAnchorHash: existing.at(-1)?.anchorHash ?? '',
  });
  mkdirSync(dirname(input.anchorsPath), { recursive: true });
  const line = `${JSON.stringify(anchor)}\n`;
  writeFileSync(
    input.anchorsPath,
    existsSync(input.anchorsPath)
      ? readFileSync(input.anchorsPath, 'utf8').replace(/\n*$/, '\n') + line
      : line,
  );
  return {
    anchor,
    anchorsPath: input.anchorsPath,
    rootUnchanged:
      existing.length > 0 && existing.at(-1)!.registryMerkleRoot === anchor.registryMerkleRoot,
  };
}

/**
 * 导出锚定凭据（第三方验证包）：凭据 + 验证步骤说明。
 * 验证方式：取得同版本注册表 → verifyDiscoveryRegistryChain →
 * computeRegistryMerkleRoot → 对照凭据 root 与锚定时间。
 */
export function exportAnchorCredential(
  anchor: RegistryAnchor,
  outputPath: string,
): { outputPath: string; bytes: number } {
  const credential = {
    farLabAnchorCredential: 1,
    anchor,
    verification: {
      steps: [
        '1. Obtain the same version of the discovery registry ledger (registry.jsonl).',
        '2. Verify its internal hash chain (verifyDiscoveryRegistryChain).',
        '3. Recompute the Merkle root (computeRegistryMerkleRoot) and compare with anchor.registryMerkleRoot.',
        '4. Independent time evidence: match anchor.gitHeadSha against the public repository history (commit timestamps), or a future RFC 3161 TSA token.',
      ],
      cannotProve: [
        'The root proves the registry CONTENT SET at anchor time, not the novelty of its content.',
        'Local-git variant: third-party force depends on the credential itself being published to media the anchorer cannot unilaterally rewrite.',
      ],
    },
  };
  const text = JSON.stringify(credential, null, 2);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, text, 'utf8');
  return { outputPath, bytes: Buffer.byteLength(text, 'utf8') };
}
