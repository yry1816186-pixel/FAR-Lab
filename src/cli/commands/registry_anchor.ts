/**
 * far registry anchor — 发现注册表时间锚定 CLI（2.md §8.9 后 R10 T1）。
 *
 * 读注册表 → 验链（fail-closed）→ 计算 Merkle 根 → 追加锚点到锚点台账 →
 * 可选导出第三方验证凭据。多源时间（本地 UTC / git HEAD commit UTC）如实登记，
 * 分歧秒数显式标注。
 */

import { spawnSync } from 'node:child_process';

import { PACKAGE_ROOT } from '../paths.ts';
import { resolveGitCommitSha } from '../git_commit_sha.ts';
import {
  DEFAULT_REGISTRY_ANCHORS_PATH,
  appendRegistryAnchor,
  exportAnchorCredential,
} from '../../discovery/registry_anchor.ts';
import { DEFAULT_DISCOVERY_REGISTRY_PATH, readDiscoveryRegistry } from '../../discovery/registry.ts';
import { verifyDiscoveryRegistryChain } from '../../discovery/registry.ts';

function resolveGitCommitUtc(sha: string): string | null {
  const r = spawnSync('git', ['show', '-s', '--format=%cI', sha], {
    encoding: 'utf8',
    cwd: PACKAGE_ROOT,
  });
  if (r.status !== 0) return null;
  const iso = r.stdout.trim();
  return Number.isFinite(Date.parse(iso)) ? iso : null;
}

export interface RegistryAnchorOutcome {
  readonly anchoredAtUtc: string;
  readonly registryMerkleRoot: string;
  readonly recordCount: number;
  readonly chainValid: boolean;
  readonly gitHeadSha: string | null;
  readonly gitCommitUtc: string | null;
  readonly timeSourceDivergenceSec: number | null;
  readonly rootUnchanged: boolean;
  readonly credentialPath: string | null;
}

export function runRegistryAnchor(input: {
  readonly ledgerPath?: string;
  readonly anchorsPath?: string;
  readonly exportPath?: string | undefined;
  readonly now?: () => Date;
}): RegistryAnchorOutcome {
  const ledgerPath = input.ledgerPath ?? DEFAULT_DISCOVERY_REGISTRY_PATH;
  const anchorsPath = input.anchorsPath ?? DEFAULT_REGISTRY_ANCHORS_PATH;
  const now = input.now ?? (() => new Date());

  const records = readDiscoveryRegistry(ledgerPath);
  const chain = verifyDiscoveryRegistryChain(records);
  if (!chain.valid) {
    throw new Error(
      `far registry anchor: registry chain broken at index ${chain.firstBrokenIndex} (${chain.reason}) — refusing to anchor a tampered ledger`,
    );
  }

  const gitHeadSha = resolveGitCommitSha();
  const isRealSha = /^[0-9a-f]{40}$/.test(gitHeadSha);
  // DEMO_GIT_COMMIT_SHA fallback (not a git repo) → record null honestly, not the demo value.
  const gitShaForAnchor = isRealSha ? gitHeadSha : null;
  const gitCommitUtc = gitShaForAnchor !== null ? resolveGitCommitUtc(gitShaForAnchor) : null;

  const { anchor, rootUnchanged } = appendRegistryAnchor({
    anchorsPath,
    records,
    anchoredAtUtc: now().toISOString(),
    gitHeadSha: gitShaForAnchor,
    gitCommitUtc,
  });

  let credentialPath: string | null = null;
  if (input.exportPath !== undefined) {
    credentialPath = exportAnchorCredential(anchor, input.exportPath).outputPath;
  }

  return {
    anchoredAtUtc: anchor.anchoredAtUtc,
    registryMerkleRoot: anchor.registryMerkleRoot,
    recordCount: anchor.recordCount,
    chainValid: anchor.chainValid,
    gitHeadSha: anchor.gitHeadSha,
    gitCommitUtc: anchor.gitCommitUtc,
    timeSourceDivergenceSec: anchor.timeSourceDivergenceSec,
    rootUnchanged,
    credentialPath,
  };
}

export function renderRegistryAnchorHuman(outcome: RegistryAnchorOutcome): string {
  const lines = [
    'Registry anchor appended:',
    `  anchoredAt (UTC)  : ${outcome.anchoredAtUtc}`,
    `  merkleRoot        : ${outcome.registryMerkleRoot}`,
    `  records           : ${outcome.recordCount} (chain valid: ${outcome.chainValid})`,
    `  git HEAD          : ${outcome.gitHeadSha ?? 'unavailable (not a git repo) — recorded as null, honestly'}`,
    `  git commit (UTC)  : ${outcome.gitCommitUtc ?? 'unavailable'}`,
    `  time divergence   : ${
      outcome.timeSourceDivergenceSec === null
        ? 'n/a (single time source)'
        : `${outcome.timeSourceDivergenceSec.toFixed(0)}s between local clock and git commit time (registered, not hidden)`
    }`,
    `  root vs last anchor: ${outcome.rootUnchanged ? 'UNCHANGED (zero registry mutations since last anchor)' : 'changed'}`,
  ];
  if (outcome.credentialPath !== null) {
    lines.push(`  credential        : ${outcome.credentialPath}`);
  }
  return lines.join('\n');
}
