// tests/cli/export_far_proof.test.ts

import { strict as assert } from 'node:assert';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import Database from 'better-sqlite3';

import {
  runExportFarProof,
  type ExportFarProofCliResult,
} from '../../src/cli/commands/export_far_proof.ts';
import { buildDemoChain } from '../../src/far_proof/demo_chain.ts';
import { verifyFarProofBundle } from '../../src/far_proof/bundle_verifier.ts';

const EXPORTED_AT = '2026-06-28T00:00:00.000Z';
const TEST_GIT_SHA = 'a'.repeat(40);
const TEST_ENV_HASH = 'b'.repeat(64);

function parseResult(raw: string): ExportFarProofCliResult {
  return JSON.parse(raw) as ExportFarProofCliResult;
}

function spawnFarExport(args: readonly string[], tmp: string): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ['src/cli/far.ts', 'export', 'far-proof', ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, NODE_COMPILE_CACHE: join(tmp, 'node-compile-cache') },
    maxBuffer: 20 * 1024 * 1024,
  });
}

function createDemoDb(path: string): void {
  const db = new Database(path);
  try {
    buildDemoChain(db);
  } finally {
    db.close();
  }
}

test('runExportFarProof exports demo chain and optional offline package', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-export-proof-run-'));
  try {
    const outDir = join(tmp, '.far-proof cli');
    const exitCode = runExportFarProof({
      source: { kind: 'demoChain' },
      outputDir: outDir,
      exportedAt: EXPORTED_AT,
      packageBundle: true,
      force: false,
      json: false,
    });

    assert.equal(exitCode, 0);
    assert.equal(existsSync(join(outDir, 'proof_envelopes.jsonl')), true);
    assert.equal(existsSync(join(outDir, 'verify.sh')), true);
    assert.equal(existsSync(`${outDir}.tar.zst`), true);
    const verify = verifyFarProofBundle(outDir, 'full');
    assert.equal(verify.ok, true, verify.errors.join(' | '));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('far export far-proof CLI emits JSON for demo chain package', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-export-proof-cli-demo-'));
  try {
    const outDir = join(tmp, 'proof bundle');
    const archivePath = join(tmp, 'proof bundle.tar.zst');
    const result = spawnFarExport(
      ['--demo-chain', '--out', outDir, '--archive', archivePath, '--exported-at', EXPORTED_AT, '--json'],
      tmp,
    );

    assert.equal(result.status, 0, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
    const parsed = parseResult(result.stdout);
    assert.equal(parsed.schemaVersion, 'far.export_far_proof.result.v1');
    assert.equal(parsed.source, 'demoChain');
    assert.equal(parsed.chainVerified, true);
    assert.ok(parsed.filesWritten.length >= 10);
    assert.ok(parsed.package !== null, 'package metadata should be present when --archive is provided');
    assert.equal(parsed.package?.archivePath, archivePath);
    assert.equal(existsSync(archivePath), true);
    assert.equal(existsSync(join(outDir, 'integrity.json')), true);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('far export far-proof CLI can export an existing DB with explicit metadata', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-export-proof-cli-db-'));
  try {
    const dbPath = join(tmp, 'demo.sqlite');
    const outDir = join(tmp, '.far-proof-db');
    createDemoDb(dbPath);

    const result = spawnFarExport(
      [
        '--db',
        dbPath,
        '--out',
        outDir,
        '--run-id',
        'cli_db_run',
        '--model-snapshot',
        'offline-replay-fixture@cli',
        '--git-commit',
        TEST_GIT_SHA,
        '--env-hash',
        TEST_ENV_HASH,
        '--exported-at',
        EXPORTED_AT,
        '--json',
      ],
      tmp,
    );

    assert.equal(result.status, 0, `stderr:\n${result.stderr}\nstdout:\n${result.stdout}`);
    const parsed = parseResult(result.stdout);
    assert.equal(parsed.source, 'db');
    assert.equal(parsed.chainVerified, true);
    assert.equal(parsed.package, null);
    assert.equal(existsSync(join(outDir, 'ro-crate-metadata.json')), true);
    const roCrate = readFileSync(join(outDir, 'ro-crate-metadata.json'), 'utf8');
    assert.match(roCrate, new RegExp(TEST_GIT_SHA));
    assert.match(roCrate, new RegExp(TEST_ENV_HASH));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('far export far-proof refuses to overwrite non-empty output without --force', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'far-export-proof-force-'));
  try {
    const outDir = join(tmp, 'existing');
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'stale.txt'), 'stale\n', 'utf8');

    const result = spawnFarExport(['--demo-chain', '--out', outDir], tmp);

    assert.equal(result.status, 2);
    assert.match(result.stderr, /--force/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
