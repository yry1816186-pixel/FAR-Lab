/**
 * registry_anchor.test.ts — Merkle 根 + 锚点链 + 凭据导出（night-r2 T1）。
 * 纯逻辑测试：全部用合成 records（合法链），零网络零 git。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  computeRegistryMerkleRoot,
  buildRegistryAnchor,
  readRegistryAnchors,
  verifyRegistryAnchorsChain,
  appendRegistryAnchor,
  exportAnchorCredential,
} from '../../src/discovery/registry_anchor.ts';
import { hashCanonicalJson } from '../../src/evidence_log/hasher.ts';
import type { DiscoveryRegistryRecord } from '../../src/discovery/registry.ts';

function fakeRecord(i: number, prevHash: string): DiscoveryRegistryRecord {
  const core = {
    kind: 'registration' as const,
    registryId: `dsc-${String(i).padStart(6, '0')}-aaaaaaaaaaaa`,
    contentHash: `c${i}`.padEnd(64, '0'),
    registeredAt: '2026-08-16T00:00:00.000Z',
    state: 'CORROBORATED' as const,
    question: 'q',
    runId: 'r',
    provenance: {
      corpusSnapshotId: 'snap-test',
      corpusRootHash: 'r'.repeat(64),
      modelProfile: 'test-profile',
      supportingCitations: [],
      counterEvidenceCitations: [],
      receiptsDigest: 'd'.repeat(64),
      strategySignatureHash: 'x',
      modelId: 'm',
      provider: 'p',
      temperature: 0,
      seed: 1,
    },
    evidence: {},
    prevRecordHash: prevHash,
  };
  return { ...core, recordHash: hashCanonicalJson(core) };
}

function fakeChain(n: number): DiscoveryRegistryRecord[] {
  const out: DiscoveryRegistryRecord[] = [];
  let prev = '';
  for (let i = 0; i < n; i += 1) {
    const r = fakeRecord(i, prev);
    out.push(r);
    prev = r.recordHash;
  }
  return out;
}

test('merkle root: empty registry → domain-separated empty root (honest, not null)', () => {
  const root = computeRegistryMerkleRoot([]);
  assert.match(root, /^[0-9a-f]{64}$/);
  assert.notEqual(root, computeRegistryMerkleRoot(fakeChain(1)));
});

test('merkle root: determinism + leaf-count sensitivity', () => {
  for (const n of [1, 2, 3, 4, 5, 8, 16, 31]) {
    const a = computeRegistryMerkleRoot(fakeChain(n));
    const b = computeRegistryMerkleRoot(fakeChain(n));
    assert.equal(a, b, `n=${n} root must be deterministic`);
  }
  const roots = new Set([1, 2, 3, 4, 5, 8].map((n) => computeRegistryMerkleRoot(fakeChain(n))));
  assert.equal(roots.size, 6, 'distinct leaf counts → distinct roots');
});

test('merkle root: flipping any leaf hash flips the root (tamper sensitivity)', () => {
  const records = fakeChain(7);
  const base = computeRegistryMerkleRoot(records);
  for (let i = 0; i < 7; i += 1) {
    // The root binds recordHash leaves; un-hashed content edits are the chain
    // verifier's job (verifyDiscoveryRegistryChain), not the root's.
    const tampered = records.map((r, j) => (j === i ? { ...r, recordHash: `ff${r.recordHash.slice(2)}` } : r));
    assert.notEqual(computeRegistryMerkleRoot(tampered), base, `flip leaf ${i}`);
  }
});

test('anchor build: field wiring + time divergence math', () => {
  const anchor = buildRegistryAnchor({
    records: fakeChain(3),
    anchoredAtUtc: '2026-08-16T12:00:00Z',
    gitHeadSha: 'a'.repeat(40),
    gitCommitUtc: '2026-08-16T11:59:30Z',
    sequence: 1,
    prevAnchorHash: '',
  });
  assert.equal(anchor.recordCount, 3);
  assert.equal(anchor.timeSourceDivergenceSec, 30);
  assert.match(anchor.anchorId, /^anc-000001-[0-9a-f]{12}$/);
  assert.equal(anchor.prevAnchorHash, '');
  // single-source (no git time) → divergence null, honestly
  const single = buildRegistryAnchor({
    records: fakeChain(3),
    anchoredAtUtc: '2026-08-16T12:00:00Z',
    gitHeadSha: null,
    gitCommitUtc: null,
    sequence: 2,
    prevAnchorHash: anchor.anchorHash,
  });
  assert.equal(single.timeSourceDivergenceSec, null);
});

test('anchor ledger: append + chain verify + tamper detection + root-unchanged flag', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anchor-'));
  const anchorsPath = join(dir, 'anchors.jsonl');
  const records = fakeChain(3);

  const first = appendRegistryAnchor({
    anchorsPath,
    records,
    anchoredAtUtc: '2026-08-16T10:00:00Z',
    gitHeadSha: null,
    gitCommitUtc: null,
  });
  assert.equal(first.rootUnchanged, false); // first anchor has no predecessor

  const second = appendRegistryAnchor({
    anchorsPath,
    records, // unchanged registry
    anchoredAtUtc: '2026-08-16T11:00:00Z',
    gitHeadSha: null,
    gitCommitUtc: null,
  });
  assert.equal(second.rootUnchanged, true, 'same records → same root → unchanged');
  assert.equal(second.anchor.prevAnchorHash, first.anchor.anchorHash);

  const read = readRegistryAnchors(anchorsPath);
  assert.equal(read.length, 2);
  assert.equal(verifyRegistryAnchorsChain(read).valid, true);

  // Tamper: rewrite a middle field of line 2 → chain verification fails
  const lines = readFileSync(anchorsPath, 'utf8').split('\n').filter((l) => l.trim());
  const tamperedLine = JSON.parse(lines[1]!);
  tamperedLine.recordCount = 99;
  writeFileSync(anchorsPath, `${lines[0]}\n${JSON.stringify(tamperedLine)}\n`);
  const broken = verifyRegistryAnchorsChain(readRegistryAnchors(anchorsPath));
  assert.equal(broken.valid, false);
  assert.equal(broken.firstBrokenIndex, 1);

  rmSync(dir, { recursive: true, force: true });
});

test('anchor append: refuses to extend a tampered ledger (fail-closed)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anchor-'));
  const anchorsPath = join(dir, 'anchors.jsonl');
  appendRegistryAnchor({ anchorsPath, records: fakeChain(1), anchoredAtUtc: '2026-08-16T10:00:00Z', gitHeadSha: null, gitCommitUtc: null });
  const lines = readFileSync(anchorsPath, 'utf8').trim().split('\n');
  const forged = JSON.parse(lines[0]!);
  forged.gitHeadSha = 'f'.repeat(40); // tamper without rehashing
  writeFileSync(anchorsPath, `${JSON.stringify(forged)}\n`);
  assert.throws(
    () =>
      appendRegistryAnchor({ anchorsPath, records: fakeChain(1), anchoredAtUtc: '2026-08-16T10:05:00Z', gitHeadSha: null, gitCommitUtc: null }),
    /anchors ledger chain broken/,
  );
  rmSync(dir, { recursive: true, force: true });
});

test('credential export: JSON shape + cannot-prove statements present', () => {
  const dir = mkdtempSync(join(tmpdir(), 'anchor-'));
  const outPath = join(dir, 'cred.json');
  const anchor = buildRegistryAnchor({
    records: fakeChain(2),
    anchoredAtUtc: '2026-08-16T10:00:00Z',
    gitHeadSha: null,
    gitCommitUtc: null,
    sequence: 1,
    prevAnchorHash: '',
  });
  exportAnchorCredential(anchor, outPath);
  const cred = JSON.parse(readFileSync(outPath, 'utf8'));
  assert.equal(cred.farLabAnchorCredential, 1);
  assert.equal(cred.anchor.anchorHash, anchor.anchorHash);
  assert.equal(cred.verification.steps.length, 4);
  assert.ok(cred.verification.cannotProve.length >= 2);
  assert.ok(cred.verification.cannotProve.some((c: string) => c.includes('not the novelty')));
  rmSync(dir, { recursive: true, force: true });
});
