// tests/research/export_bundle.test.ts
// Research bundle export round-trip (directive §3.6 / §14.5):
//   - exportResearchBundle writes research-run.json + manifest.json + verify.mjs + README.md
//   - manifest hashes every file; the standalone verify.mjs (spawned, zero deps)
//     reports INTEGRITY PASS on a clean bundle and exit 7 after tampering
//   - manifest is deterministic given a fixed exportedAt

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportResearchBundle } from '../../src/research/export_bundle.ts';
import type { ResearchRun } from '../../src/research/types.ts';

/** A minimal-but-valid ResearchRun shape (fields the bundle needs). */
function minimalRun(overrides: Partial<ResearchRun> = {}): ResearchRun {
  return {
    runId: '01TESTRUN',
    question: 'test question',
    gateReport: {
      question: 'test question',
      verdict: 'RESEARCHABLE',
      reasons: [],
      safetyRisks: [],
      scope: { domain: 'astronomy', domainHints: ['astronomy'], questionLength: 13 },
      decomposition: null,
      requiresEthicsGate: false,
      assessedAt: '2026-08-13T00:00:00.000Z',
      schemaVersion: 1,
    },
    corpus: {
      snapshotId: 'snap',
      rootHash: 'root',
      documentCount: 0,
      documents: [],
      sourceQueries: [],
      createdAt: '2026-08-13T00:00:00.000Z',
    },
    hypotheses: [],
    bindings: {},
    critiques: {},
    scorecards: {},
    plan: {
      objectives: ['o1'],
      primaryHypothesisId: 'none',
      alternativeHypothesisIds: [],
      preregisteredPredictions: [],
      dataRequirements: [],
      inclusionExclusionCriteria: [],
      variables: [],
      design: 'd',
      analysisDag: [],
      tools: [],
      statisticalMethods: [],
      sampleSizeRationale: 's',
      multiplicityHandling: 'm',
      missingOutlierStrategy: 'x',
      stoppingConditions: [],
      checkpoints: [],
      budget: 'b',
      risks: [],
      reproducibility: [],
      nextRoundDecisionRules: [],
      humanApprovalRequired: [],
    },
    revisions: [],
    observations: [],
    stageReceipts: [],
    environment: {
      gitCommit: 'abc123',
      gitDirty: false,
      nodeVersion: 'v24',
      platform: 'win32-x64',
      lockfileHash: 'lockhash',
      packageVersion: '1.1.0',
    },
    modes: {
      modelExecutionMode: 'RECORDED_REPLAY',
      retrievalExecutionMode: 'RECORDED_REPLAY',
      experimentExecutionMode: 'NOT_EXECUTED',
    },
    runMode: 'RECORDED_REPLAY',
    startedAt: '2026-08-13T00:00:00.000Z',
    schemaVersion: 3,
    citationGate: {
      boundRate: 1,
      totalCited: 0,
      boundCount: 0,
      unboundEvidenceCount: 0,
      resolvedViaRetrieval: [],
      perHypothesis: {},
      primaryRequiresAllBound: true,
      primaryAllBound: false,
      gateVerdict: 'PASS',
    },
    falsifiabilityGate: { perHypothesis: {}, allPassed: true },
    ...overrides,
  } satisfies ResearchRun;
}

function runVerifyScript(dir: string): { status: number | null; stdout: string } {
  const r = spawnSync(process.execPath, [join(dir, 'verify.mjs')], {
    encoding: 'utf8',
    timeout: 30000,
  });
  // verify.mjs reports failures (TAMPERED/MISSING) on stderr — merge for assertions.
  return { status: r.status, stdout: `${r.stdout ?? ''}\n${r.stderr ?? ''}` };
}

describe('exportResearchBundle', () => {
  test('writes the four bundle files with a deterministic manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-bundle-test-'));
    try {
      const result = exportResearchBundle(minimalRun(), dir, '2026-08-13T12:00:00.000Z');
      assert.deepEqual(
        [...result.filesWritten].sort(),
        ['README.md', 'manifest.json', 'research-run.json', 'verify.mjs'],
      );
      const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')) as {
        runId: string;
        files: Array<{ path: string; sha256: string }>;
      };
      assert.equal(manifest.runId, '01TESTRUN');
      assert.equal(manifest.files.length, 3);
      for (const f of manifest.files) {
        assert.match(f.sha256, /^[0-9a-f]{64}$/);
      }

      // Determinism: same run + same timestamp → same manifest hash.
      const again = exportResearchBundle(minimalRun(), `${dir}-b`, '2026-08-13T12:00:00.000Z');
      rmSync(`${dir}-b`, { recursive: true, force: true });
      assert.equal(result.manifestHash, again.manifestHash);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('standalone verify.mjs passes on a clean bundle (exit 0)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-bundle-test-'));
    try {
      exportResearchBundle(minimalRun(), dir, '2026-08-13T12:00:00.000Z');
      const { status, stdout } = runVerifyScript(dir);
      assert.equal(status, 0);
      assert.match(stdout, /INTEGRITY PASS/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('standalone verify.mjs detects tampering (exit 7)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-bundle-test-'));
    try {
      exportResearchBundle(minimalRun(), dir, '2026-08-13T12:00:00.000Z');
      const runPath = join(dir, 'research-run.json');
      writeFileSync(runPath, `${readFileSync(runPath, 'utf8')} `, 'utf8'); // append a byte
      const { status, stdout } = runVerifyScript(dir);
      assert.equal(status, 7);
      assert.match(stdout, /INTEGRITY FAIL/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('standalone verify.mjs flags a missing file (exit 7)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-bundle-test-'));
    try {
      exportResearchBundle(minimalRun(), dir, '2026-08-13T12:00:00.000Z');
      rmSync(join(dir, 'README.md'));
      const { status, stdout } = runVerifyScript(dir);
      assert.equal(status, 7);
      assert.match(stdout, /MISSING/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
