// tests/cli/export_receipt_v2.test.ts
// V2 Receipt export: manifest + six-dimension verification + ContractBindingSet.

import { strict as assert } from 'node:assert';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { sealProofEnvelopeV2 } from '../../src/proof_envelope/v2/sealer.ts';
import type { ProofEnvelopeV2 } from '../../src/proof_envelope/v2/types.ts';
import { makeValidEnvelopeV2Core } from '../proof_envelope/v2/fixtures.ts';
import { runExportReceiptV2 } from '../../src/cli/commands/export_receipt_v2.ts';
import type { ExportReceiptV2Options } from '../../src/cli/commands/export_receipt_v2.ts';

function sealedEnvelope(): ProofEnvelopeV2 {
  return sealProofEnvelopeV2(makeValidEnvelopeV2Core()).envelope;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function writeEnvelopeToTmp(tmp: string, envelope: ProofEnvelopeV2): string {
  const envPath = join(tmp, 'envelope.json');
  writeFileSync(envPath, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
  return envPath;
}

// ---------------------------------------------------------------------------
// Tests — JSON format
// ---------------------------------------------------------------------------

test('JSON format output includes manifest, verification result, and contract binding set', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-export-receipt-v2-'));
  try {
    const envPath = writeEnvelopeToTmp(tmp, sealedEnvelope());
    const options: ExportReceiptV2Options = { envelopePath: envPath, format: 'json' };
    const result = await runExportReceiptV2(options);

    assert.equal(result.exitCode, 0);
    const parsed = JSON.parse(result.output);

    // manifest present
    assert.ok(parsed.manifest);
    assert.equal(parsed.manifest.schemaVersion, 'far.receipt-manifest.v1');
    assert.ok(Array.isArray(parsed.manifest.members));
    assert.ok(typeof parsed.manifest.rootDigest === 'string');
    assert.match(parsed.manifest.rootDigest, /^[0-9a-f]{64}$/);

    // verification result present
    assert.ok(parsed.verificationResult);
    assert.equal(parsed.verificationResult.resultVersion, 1);
    assert.ok(parsed.verificationResult.dimensions);
    assert.ok('provenance' in parsed.verificationResult.dimensions);
    assert.ok('integrity' in parsed.verificationResult.dimensions);
    assert.ok('identity' in parsed.verificationResult.dimensions);
    assert.ok('processConformance' in parsed.verificationResult.dimensions);
    assert.ok('executionReproduction' in parsed.verificationResult.dimensions);
    assert.ok('scientificVerdict' in parsed.verificationResult.dimensions);

    // contract binding set present
    assert.ok(parsed.contractBindingSet);
    assert.equal(parsed.contractBindingSet.version, 1);
    assert.ok(typeof parsed.contractBindingSet.digest === 'string');
    assert.match(parsed.contractBindingSet.digest, /^[0-9a-f]{64}$/);
    assert.ok(parsed.contractBindingSet.bindings);
    assert.ok(typeof parsed.contractBindingSet.bindings.canonicalizationAlgorithmId === 'string');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('JSON format verification dimensions include all six assurance dimensions', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-export-receipt-v2-dims-'));
  try {
    const envPath = writeEnvelopeToTmp(tmp, sealedEnvelope());
    const result = await runExportReceiptV2({ envelopePath: envPath, format: 'json' });

    assert.equal(result.exitCode, 0);
    const parsed = JSON.parse(result.output);
    const dims = parsed.verificationResult.dimensions;

    const expectedDims = [
      'provenance', 'integrity', 'identity',
      'processConformance', 'executionReproduction', 'scientificVerdict',
    ];
    for (const dim of expectedDims) {
      assert.ok(dims[dim], `missing dimension: ${dim}`);
      assert.ok(typeof dims[dim].dimension === 'string');
      assert.ok(['PASS', 'FAIL', 'WARN', 'NOT_APPLICABLE', 'SKIP'].includes(dims[dim].outcome));
      assert.ok(typeof dims[dim].detail === 'string');
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests — Markdown format
// ---------------------------------------------------------------------------

test('Markdown format output includes six-dimension table', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-export-receipt-v2-md-'));
  try {
    const envPath = writeEnvelopeToTmp(tmp, sealedEnvelope());
    const result = await runExportReceiptV2({ envelopePath: envPath, format: 'markdown' });

    assert.equal(result.exitCode, 0);
    const md = result.output;

    // Table header present
    assert.ok(md.includes('# FAR-Lab V2 Receipt'), 'should have V2 Receipt header');
    assert.ok(md.includes('Assurance Dimension'), 'should have dimension table header');
    assert.ok(md.includes('provenance'), 'should list provenance dimension');
    assert.ok(md.includes('integrity'), 'should list integrity dimension');
    assert.ok(md.includes('identity'), 'should list identity dimension');
    assert.ok(md.includes('processConformance'), 'should list processConformance dimension');
    assert.ok(md.includes('executionReproduction'), 'should list executionReproduction dimension');
    assert.ok(md.includes('scientificVerdict'), 'should list scientificVerdict dimension');
    assert.ok(md.includes('Outcome'), 'should have Outcome column');
    assert.ok(md.includes('|'), 'should use markdown table pipes');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests — error cases
// ---------------------------------------------------------------------------

test('missing envelope file returns exit code 2', async () => {
  const result = await runExportReceiptV2({
    envelopePath: '/nonexistent/path/envelope.json',
    format: 'json',
  });

  assert.equal(result.exitCode, 2);
  assert.ok(result.output.includes('not found'), `error message should mention "not found": ${result.output}`);
});

test('invalid JSON in envelope file returns exit code 1', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-export-receipt-v2-bad-'));
  try {
    const badPath = join(tmp, 'bad.json');
    writeFileSync(badPath, 'this is not valid json {{{\n', 'utf8');

    const result = await runExportReceiptV2({
      envelopePath: badPath,
      format: 'json',
    });

    assert.equal(result.exitCode, 1);
    assert.ok(result.output.includes('parse'), `error message should mention "parse": ${result.output}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Tests — outputPath
// ---------------------------------------------------------------------------

test('outputPath writes result to file instead of returning it', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-export-receipt-v2-out-'));
  try {
    const envPath = writeEnvelopeToTmp(tmp, sealedEnvelope());
    const outPath = join(tmp, 'receipt-v2.json');

    const result = await runExportReceiptV2({
      envelopePath: envPath,
      outputPath: outPath,
      format: 'json',
    });

    assert.equal(result.exitCode, 0);
    // When outputPath is given, the function writes to file and returns a short confirmation
    const fileContent = readFileSync(outPath, 'utf8');
    const parsed = JSON.parse(fileContent);
    assert.ok(parsed.manifest, 'file should contain manifest');
    assert.ok(parsed.verificationResult, 'file should contain verificationResult');
    assert.ok(parsed.contractBindingSet, 'file should contain contractBindingSet');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
