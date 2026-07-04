// tests/cli/export_receipt.test.ts

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import Database from 'better-sqlite3';
import {
  buildTrustReceiptFromEnvelope,
  runExportReceipt,
  type TrustReceipt,
} from '../../src/cli/commands/export_receipt.ts';
import { buildDemoChain, computeEnvHash, DEMO_GIT_COMMIT_SHA, DEMO_RUN_ID } from '../../src/far_proof/demo_chain.ts';
import { exportFarProof } from '../../src/far_proof/index.ts';
import { sealProofEnvelopeV2 } from '../../src/proof_envelope/v2/sealer.ts';
import type { ProofEnvelopeV2 } from '../../src/proof_envelope/v2/types.ts';
import { makeValidEnvelopeV2Core } from '../proof_envelope/v2/fixtures.ts';

function sealedEnvelope(): ProofEnvelopeV2 {
  return sealProofEnvelopeV2(makeValidEnvelopeV2Core()).envelope;
}

function readReceipt(path: string): TrustReceipt {
  return JSON.parse(readFileSync(path, 'utf8')) as TrustReceipt;
}

function exportDemoBundle(tmp: string): string {
  const db = new Database(':memory:');
  try {
    buildDemoChain(db);
    const outputDir = join(tmp, '.far-proof demo');
    exportFarProof({
      db,
      outputDir,
      runId: DEMO_RUN_ID,
      modelSnapshot: 'offline-replay-fixture@v1',
      gitCommitSha: DEMO_GIT_COMMIT_SHA,
      envHash: computeEnvHash({ schemaVersion: 11, nodeVersion: process.version, providerProfile: 'offline_replay' }),
      exportedAt: '2026-06-28T00:00:00.000Z',
    });
    return outputDir;
  } finally {
    db.close();
  }
}

test('buildTrustReceiptFromEnvelope projects V2 envelope without creating a new fact source', () => {
  const env = sealedEnvelope();
  const built = buildTrustReceiptFromEnvelope(env, '/tmp/env.json', '2026-07-03T00:00:00.000Z');

  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.receipt.schemaVersion, 'far.trust_receipt.v1');
  assert.equal(built.receipt.generatedAt, '2026-07-03T00:00:00.000Z');
  assert.equal(built.receipt.source.kind, 'proofEnvelopeV2');
  assert.equal(built.receipt.summary.claimSummary, env.claim.naturalLanguage);
  assert.equal(built.receipt.summary.verdict, env.verdictTrace.verdict);
  assert.equal(built.receipt.summary.proofHash, env.proofHash);
  assert.equal(built.receipt.summary.tamperStatus, 'clean');
  assert.ok(
    built.receipt.summary.limitations.some((line) => /not a new fact source/.test(line)),
    'receipt must disclose DOC projection boundary',
  );
});

test('runExportReceipt writes deterministic JSON receipt for ProofEnvelopeV2 input', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-export-receipt-v2-'));
  try {
    const envPath = join(tmp, 'env with spaces.json');
    const outPath = join(tmp, 'receipt.json');
    writeFileSync(envPath, `${JSON.stringify(sealedEnvelope(), null, 2)}\n`, 'utf8');

    const exitCode = runExportReceipt({
      envelopePath: envPath,
      outputPath: outPath,
      format: 'json',
      generatedAt: '2026-07-03T00:00:00.000Z',
    });

    assert.equal(exitCode, 0);
    const receipt = readReceipt(outPath);
    assert.equal(receipt.generatedAt, '2026-07-03T00:00:00.000Z');
    assert.equal(receipt.summary.verifierCommand, `far verify --envelope '${envPath}' --json`);
    assert.equal(receipt.verification.status, 'PASS');
    assert.deepEqual(receipt.verification.verifiedLevels, ['proofEnvelope']);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('far export receipt CLI emits JSON for ProofEnvelopeV2 input', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-export-receipt-cli-'));
  try {
    const envPath = join(tmp, 'env.json');
    writeFileSync(envPath, `${JSON.stringify(sealedEnvelope(), null, 2)}\n`, 'utf8');

    const result = spawnSync(
      process.execPath,
      [
        'src/cli/far.ts',
        'export',
        'receipt',
        '--envelope',
        envPath,
        '--generated-at',
        '2026-07-03T00:00:00.000Z',
        '--json',
      ],
      { cwd: process.cwd(), encoding: 'utf8' },
    );

    assert.equal(result.status, 0, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
    const receipt = JSON.parse(result.stdout) as TrustReceipt;
    assert.equal(receipt.schemaVersion, 'far.trust_receipt.v1');
    assert.equal(receipt.source.kind, 'proofEnvelopeV2');
    assert.equal(receipt.verification.status, 'PASS');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runExportReceipt refuses to issue receipt for tampered ProofEnvelopeV2', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-export-receipt-tamper-'));
  try {
    const env = sealedEnvelope();
    const first = env.statisticalResults[0];
    assert.ok(first, 'fixture must include statisticalResults[0]');
    const tampered: ProofEnvelopeV2 = {
      ...env,
      statisticalResults: [{ ...first, pValue: 0.999 }],
    };
    const envPath = join(tmp, 'tampered.json');
    const outPath = join(tmp, 'receipt.json');
    writeFileSync(envPath, `${JSON.stringify(tampered, null, 2)}\n`, 'utf8');

    const exitCode = runExportReceipt({
      envelopePath: envPath,
      outputPath: outPath,
      format: 'json',
      generatedAt: '2026-07-03T00:00:00.000Z',
    });

    assert.equal(exitCode, 7);
    assert.equal(existsSync(outPath), false, 'tampered input must not write a Trust Receipt');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runExportReceipt projects V1 .far-proof bundle with honest limitations', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-export-receipt-bundle-'));
  try {
    const bundlePath = exportDemoBundle(tmp);
    const outPath = join(tmp, 'receipt.json');

    const exitCode = runExportReceipt({
      bundlePath,
      outputPath: outPath,
      format: 'json',
      generatedAt: '2026-07-03T00:00:00.000Z',
    });

    assert.equal(exitCode, 0);
    const receipt = readReceipt(outPath);
    assert.equal(receipt.source.kind, 'farProofBundleV1');
    assert.equal(receipt.summary.verdict, 'UNTESTED');
    assert.match(receipt.summary.claimSummary, /C-ASTRO-0001/);
    assert.match(receipt.summary.claimSummary, /adapter A achieves macro-F1/);
    assert.equal(receipt.summary.verifierCommand, `far verify --bundle '${bundlePath}' --mode full --json`);
    assert.equal(receipt.verification.status, 'WARN');
    assert.ok(
      receipt.summary.limitations.some((line) => /V1 minimal \.far-proof bundle/.test(line)),
      'V1 bundle receipt must disclose V1 minimal boundary',
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('runExportReceipt writes Markdown receipt', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-export-receipt-md-'));
  try {
    const envPath = join(tmp, 'env.json');
    const outPath = join(tmp, 'receipt.md');
    writeFileSync(envPath, `${JSON.stringify(sealedEnvelope(), null, 2)}\n`, 'utf8');

    const exitCode = runExportReceipt({
      envelopePath: envPath,
      outputPath: outPath,
      format: 'markdown',
      generatedAt: '2026-07-03T00:00:00.000Z',
    });

    assert.equal(exitCode, 0);
    const markdown = readFileSync(outPath, 'utf8');
    assert.match(markdown, /^# FAR-Chain Trust Receipt/m);
    assert.match(markdown, /## Limitations/);
    assert.match(markdown, /proofHash:/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
