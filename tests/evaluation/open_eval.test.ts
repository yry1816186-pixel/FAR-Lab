// tests/evaluation/open_eval.test.ts
// EVAL-OPEN-001：10 资产建册 + 篡改检出 + 许可边界（restricted 禁内联）+
// 确定性重跑指令 + 挑战 intake 门。纯函数，无 mock。

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import {
  OPEN_EVAL_ASSET_KINDS,
  buildRerunManifest,
  generateRerunCommands,
  lawfulAccessCheck,
  parseChallengeSubmission,
  verifyManifestIntegrity,
} from '../../src/evaluation/open_eval.ts';
import type { OpenEvalAsset } from '../../src/evaluation/open_eval.ts';

function fullAssets(): OpenEvalAsset[] {
  return OPEN_EVAL_ASSET_KINDS.map((kind) => ({
    kind,
    ref: `eval-assets/${kind}.md`,
    contentHash: `hash-${kind}`,
    access: 'public' as const,
  }));
}

test('EVAL-OPEN-001: 10 资产齐全建册 + hash 确定性 + 缺资产如实列出', () => {
  assert.equal(OPEN_EVAL_ASSET_KINDS.length, 10);
  const built = buildRerunManifest('eval-2026-08-17', fullAssets());
  assert.equal(built.ok, true);
  if (built.ok) {
    assert.equal(built.manifest.manifestHash.length, 64);
    // 确定性：同输入同册
    const again = buildRerunManifest('eval-2026-08-17', fullAssets());
    assert.equal(again.ok && again.manifest.manifestHash === built.manifest.manifestHash, true);
    assert.equal(verifyManifestIntegrity(built.manifest).ok, true);
  }

  // 缺 raw-results 与 negative-results → 建册拒绝并列出缺失
  const incomplete = fullAssets().filter((a) => a.kind !== 'raw-results' && a.kind !== 'negative-results');
  const rejected = buildRerunManifest('eval-x', incomplete);
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.deepEqual([...rejected.missing].sort(), ['negative-results', 'raw-results']);
    assert.match(rejected.reason, /manifest incomplete/);
  }
});

test('EVAL-OPEN-001: 册子篡改检出——换资产 ref/内容后 hash 不符', () => {
  const built = buildRerunManifest('eval-1', fullAssets());
  assert.equal(built.ok, true);
  if (!built.ok) return;
  // 篡改 1：换掉 configs 资产的指向（换成更有利的配置）
  const swapped = {
    ...built.manifest,
    assets: built.manifest.assets.map((a) => (a.kind === 'configs-and-seeds' ? { ...a, ref: 'eval-assets/favorable-config.md' } : a)),
  };
  const r1 = verifyManifestIntegrity(swapped);
  assert.equal(r1.ok, false);
  assert.match(r1.reason, /manifest hash mismatch/);
  // 篡改 2：追加未登记资产
  const appended = { ...built.manifest, assets: [...built.manifest.assets, fullAssets()[0]!] };
  assert.equal(verifyManifestIntegrity(appended).ok, false);
  // 原册恒过
  assert.equal(verifyManifestIntegrity(built.manifest).ok, true);
});

test('EVAL-OPEN-001: 许可边界——restricted 资产携带内联内容 → 再分发违规', () => {
  const clean = lawfulAccessCheck(fullAssets());
  assert.equal(clean.ok, true);
  // 受限数据集给了访问指引（合规）
  const guided = lawfulAccessCheck(fullAssets().map((a) => (a.kind === 'data-access-instructions' ? { ...a, access: 'restricted' as const } : a)));
  assert.equal(guided.ok, true);
  // 受限数据集内联了内容（违规：绕过许可再分发）
  const leaked = lawfulAccessCheck(
    fullAssets().map((a) =>
      a.kind === 'data-access-instructions' ? { ...a, access: 'restricted' as const, inlineContent: 'FULL RESTRICTED DATASET ROWS...' } : a,
    ),
  );
  assert.equal(leaked.ok, false);
  assert.match(leaked.violations[0] ?? '', /access=restricted but carries inlineContent/);
});

test('EVAL-OPEN-001: 重跑指令确定性生成——同册同指令 + 指令引用册内资产 ref', () => {
  const built = buildRerunManifest('eval-1', fullAssets());
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const cmds1 = generateRerunCommands(built.manifest);
  const cmds2 = generateRerunCommands(built.manifest);
  assert.equal(cmds1, cmds2, '指令生成是册子的纯函数');
  assert.ok(cmds1.includes('eval-assets/protocol.md'));
  assert.ok(cmds1.includes('RESTRICTED') === false, '全 public 册无受限提示');
  // 受限册的指令含受限标记
  const restricted = buildRerunManifest(
    'eval-1',
    fullAssets().map((a) => (a.kind === 'data-access-instructions' ? { ...a, access: 'restricted' as const } : a)),
  );
  assert.equal(restricted.ok, true);
  if (restricted.ok) {
    assert.match(generateRerunCommands(restricted.manifest), /RESTRICTED — apply for access/);
  }
});

test('EVAL-OPEN-001: 挑战 intake——合法受理 + 无证据/坏字段拒绝 + ticket 确定性', () => {
  const good = parseChallengeSubmission({
    kind: 'replication-mismatch',
    challenger: 'third-party-lab',
    evalId: 'eval-1',
    claim: 'published accuracy not reproducible under manifest hash abc',
    evidenceRefs: ['rerun-log.txt', 'results-diff.json'],
  });
  assert.equal(good.ok, true);
  if (good.ok) {
    assert.equal(good.ticketId.length, 16);
    // 同输入同 ticket（可追踪防重复受理）
    const again = parseChallengeSubmission({
      kind: 'replication-mismatch',
      challenger: 'third-party-lab',
      evalId: 'eval-1',
      claim: 'published accuracy not reproducible under manifest hash abc',
      evidenceRefs: ['rerun-log.txt', 'results-diff.json'],
    });
    assert.equal(again.ok && again.ticketId === good.ticketId, true);
  }

  // 无证据挑战不受理
  const noEvidence = parseChallengeSubmission({ kind: 'issue', challenger: 'a', evalId: 'e', claim: 'looks wrong', evidenceRefs: [] });
  assert.equal(noEvidence.ok, false);
  if (!noEvidence.ok) assert.ok(noEvidence.problems.some((p) => p.includes('evidenceRefs')));
  // 坏 kind / 空 challenger
  const badKind = parseChallengeSubmission({ kind: 'complaint', challenger: 'a', evalId: 'e', claim: 'x', evidenceRefs: ['r'] });
  assert.equal(badKind.ok, false);
  if (!badKind.ok) assert.ok(badKind.problems.some((p) => p.includes('issue|appeal|replication-mismatch')));
  const anon = parseChallengeSubmission({ kind: 'appeal', challenger: '  ', evalId: 'e', claim: 'x', evidenceRefs: ['r'] });
  assert.equal(anon.ok, false);
  // 证据数组含空串同样拒绝
  const blankRef = parseChallengeSubmission({ kind: 'appeal', challenger: 'a', evalId: 'e', claim: 'x', evidenceRefs: [''] });
  assert.equal(blankRef.ok, false);
});
