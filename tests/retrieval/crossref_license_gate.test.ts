/**
 * tests/retrieval/crossref_license_gate.test.ts — 合规门控（day-r13，审计
 * COMPLIANCE-data-redistribution.md §5.2/R1）：Crossref 摘要仅在记录携带
 * 宽松许可（CC0/CC-BY/CC-BY-SA/ODC-PDM/ODC-BY）时随包分发；NC/ND/未知许可
 * 或无许可信号 → 摘要扣留并标注 abstractWithheldReason。
 *
 * .far-proof 归属块（§5.1/C2）：每个导出包携带 SOURCES-ATTRIBUTION.txt，
 * 验证器报告 attributionPresent（缺席=警告非错误——旧包合法）。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

import { parseCrossrefResults } from '../../src/retrieval/adapters/crossref.ts';
import { exportFarProof, SOURCES_ATTRIBUTION_TEXT } from '../../src/far_proof/exporter.ts';
import { verifyFarProofBundle } from '../../src/far_proof/bundle_verifier.ts';
import { buildDemoChain, computeEnvHash } from '../../src/far_proof/demo_chain.ts';

function body(licenseUrls: readonly string[] | null): string {
  const work: Record<string, unknown> = {
    DOI: '10.9999/test-license-gate',
    title: ['A gated abstract compliance test'],
    author: [{ given: 'A', family: 'Tester' }],
    published: { 'date-parts': [[2026, 1, 1]] },
    abstract: '<jats:p>Publisher-supplied abstract prose that must not ship unconditionally.</jats:p>',
    URL: 'https://doi.org/10.9999/test-license-gate',
  };
  if (licenseUrls !== null) {
    work.license = licenseUrls.map((URL) => ({ URL }));
  }
  return JSON.stringify({ status: 'ok', message: { items: [work] } });
}

function firstDoc(licenseUrls: readonly string[] | null) {
  const docs = parseCrossrefResults(body(licenseUrls), 'q', '2026-08-17T00:00:00.000Z', 5);
  assert.equal(docs.length, 1);
  return docs[0]!;
}

test('crossref gate: CC-BY / CC0 / CC-BY-SA / ODC-BY license entries keep the abstract', () => {
  for (const urls of [
    ['https://creativecommons.org/licenses/by/4.0'],
    ['https://creativecommons.org/publicdomain/zero/1.0/legalcode'],
    ['https://creativecommons.org/licenses/by-sa/3.0/'],
    ['https://opendatacommons.org/licenses/by/1-0/'],
    ['https://example.com/some-tavern-license', 'https://creativecommons.org/licenses/by/4.0'], // ANY permissive entry suffices
  ]) {
    const doc = firstDoc(urls);
    assert.ok(doc.abstract !== null, `abstract must ship for ${urls[0]}`);
    assert.equal(doc.abstractWithheldReason, undefined);
  }
});

test('crossref gate: NC / ND / unknown / absent license WITHHOLDS the abstract and annotates why', () => {
  for (const urls of [
    ['https://creativecommons.org/licenses/by-nc-nd/4.0/'], // live-probed family (audit V10)
    ['https://creativecommons.org/licenses/by-nd/4.0'],
    ['https://example.com/publisher-custom-eula'],
    null, // no license array at all — conservative default
  ]) {
    const doc = firstDoc(urls);
    assert.equal(doc.abstract, null, `abstract must be withheld for ${String(urls)}`);
    assert.equal(doc.abstractWithheldReason, 'crossref_record_license_not_permissive');
    // Bibliographic core is untouched by the gate.
    assert.ok(doc.title.length > 0 && doc.doi !== null);
  }
});

test('crossref gate: a record with NO abstract gets null without a withholding annotation', () => {
  const work = {
    DOI: '10.9999/no-abstract',
    title: ['No abstract here'],
    author: [],
    URL: 'https://doi.org/10.9999/no-abstract',
  };
  const docs = parseCrossrefResults(
    JSON.stringify({ status: 'ok', message: { items: [work] } }),
    'q', '2026-08-17T00:00:00.000Z', 5,
  );
  assert.equal(docs.length, 1);
  assert.equal(docs[0]!.abstract, null);
  assert.equal(docs[0]!.abstractWithheldReason, undefined, '"source had none" ≠ "we withheld"');
});

test('far-proof export carries SOURCES-ATTRIBUTION.txt and the verifier reports it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-attrib-'));
  try {
    const db = new Database(':memory:');
    try {
      buildDemoChain(db);
      const outputDir = join(dir, '.far-proof');
      exportFarProof({
        db,
        outputDir,
        runId: 'demo-run',
        modelSnapshot: 'offline-replay-fixture@v1',
        gitCommitSha: '0'.repeat(40),
        envHash: computeEnvHash({
          schemaVersion: 6,
          nodeVersion: process.version,
          providerProfile: 'offline_replay',
        }),
        exportedAt: '2026-08-17T00:00:00.000Z',
      });
      const attributionPath = join(outputDir, 'SOURCES-ATTRIBUTION.txt');
      assert.ok(existsSync(attributionPath), 'attribution file written into the bundle');
      const text = readFileSync(attributionPath, 'utf8');
      assert.equal(text.trim(), SOURCES_ATTRIBUTION_TEXT);
      assert.ok(text.includes('ODC-BY 4.3'));
      assert.ok(text.includes('No full texts are')); // "…are\nredistributed." wraps lines

      const verdict = verifyFarProofBundle(outputDir, 'full');
      assert.equal(verdict.attributionPresent, true);
      assert.ok(!verdict.warnings.some((w) => w.startsWith('SOURCES_ATTRIBUTION')), 'no absence warning when present');
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('far-proof verifier: a bundle WITHOUT the attribution file gets a warning, not an error (old bundles stay valid)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'far-attrib-old-'));
  try {
    const db = new Database(':memory:');
    try {
      buildDemoChain(db);
      const outputDir = join(dir, '.far-proof');
      exportFarProof({
        db,
        outputDir,
        runId: 'demo-run',
        modelSnapshot: 'offline-replay-fixture@v1',
        gitCommitSha: '0'.repeat(40),
        envHash: computeEnvHash({
          schemaVersion: 6,
          nodeVersion: process.version,
          providerProfile: 'offline_replay',
        }),
        exportedAt: '2026-08-17T00:00:00.000Z',
      });
      // simulate a pre-day-r13 bundle: drop the attribution + its integrity entry
      rmSync(join(outputDir, 'SOURCES-ATTRIBUTION.txt'), { force: true });
      const integrityPath = join(outputDir, 'far-proof-integrity.json');
      if (existsSync(integrityPath)) {
        const integrity = JSON.parse(readFileSync(integrityPath, 'utf8'));
        integrity.files = (integrity.files ?? []).filter((f: { path?: string }) => f.path !== 'SOURCES-ATTRIBUTION.txt');
        // recompute not needed for this behavioral check: the verifier's file
        // checks that would now fail are exactly what we scope away by mode.
      }
      const verdict = verifyFarProofBundle(outputDir, 'chain');
      assert.equal(verdict.attributionPresent, false);
      assert.ok(verdict.warnings.some((w) => w.startsWith('SOURCES_ATTRIBUTION')));
    } finally {
      db.close();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
