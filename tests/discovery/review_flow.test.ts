// tests/discovery/review_flow.test.ts
// NOVEL/REDISCOVERY 人工复核录入（置信度阶梯上两级，§2.4 披露纪律）的契约：
//   - 阶梯门：复用共享状态机——只有 KERNEL_ADJUDICATED 行在案才可晋升；
//     CORROBORATED 直升 NOVEL/REDISCOVERY = 拒绝 + 打印合法阶梯路径（fail-closed，无跳级）
//   - 证据门：→ NOVEL_VALIDATED 需非空 humanReviewRef；→ REDISCOVERY 需非空 matchingLiterature
//   - 台账：state_transition 行携带 additive evidence.review {reviewedAt, reviewer?}；
//     追加后哈希链 VERIFIED；篡改 review 字段可检；旧（无 review 字段）行保持有效
//   - 幂等：同 (contentHash, target) 已在案 → SKIPPED_DUPLICATE，台账不增行
//   - 终态：REDISCOVERY/NOVEL_VALIDATED 之后不再有合法转移（合法目标=空）
//   - CLI：缺参/未知参数 exit 2；refused exit 3；成功 exit 0；
//     NOVEL 追加成功后打印对外披露三条件 reminder（泄漏评估+人工复核+AI 生成标注）

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  recordHumanReview,
  buildDiscoveryRegistryRecord,
  registerRunDiscoveries,
  readDiscoveryRegistry,
  verifyDiscoveryRegistryChain,
  appendDiscoveryRecords,
  hypothesisContentHash,
} from '../../src/discovery/registry.ts';
import { runResearchReview } from '../../src/cli/commands/research.ts';
import type { ResearchRun, HypothesisCandidate } from '../../src/research/types.ts';

const FIXED_NOW = () => new Date('2026-08-15T12:00:00.000Z');

// ── fixtures（与 adjudication.test.ts 同族：LIVE run + 过门 + 已绑引用） ──────

function candidate(id: string): HypothesisCandidate {
  return {
    id,
    statement: `statement ${id}`,
    mechanism: `mechanism ${id}`,
    falsificationMethod: {
      prediction: 'a positive correlation exists between irradiation and radius',
      metric: 'pearson r',
      comparator: 'gt',
      value: 0,
    },
    supportingCitations: ['10.1000/demo'],
    counterEvidenceCitations: [],
    relationToExistingTheory: 'theory',
    alternativeExplanations: [],
    observablePredictions: [],
    distinguishingObservations: [],
    noveltyRelativeToCorpus: 'novel',
    assumptions: [],
    risks: [],
    strategyOrigin: 'induction',
  };
}

function doc(doi: string) {
  return {
    documentId: `doc-${doi}`,
    sourceType: 'openalex' as const,
    sourceName: 'OpenAlex',
    title: 't',
    authors: [],
    year: 2024,
    doi,
    persistentIdentifier: doi,
    url: 'u',
    canonicalUrl: 'https://example.org/canonical',
    publicationDate: '2024-01-01',
    retrievedAt: '2026-08-15T00:00:00.000Z',
    retrievalQuery: 'q',
    retrievalMethod: 'live',
    citation: 'c',
    abstract: null,
    contentHash: 'x'.repeat(64),
    rawHash: 'r'.repeat(64),
    normalizedHash: 'n'.repeat(64),
    parserVersion: 'p1',
    licenseMetadata: null,
  };
}

function liveRun(): ResearchRun {
  const primary = candidate('h-1');
  return {
    runId: 'run-review',
    question: 'do hot jupiters inflate with irradiation?',
    gateReport: {
      question: 'q?',
      verdict: 'RESEARCHABLE',
      reasons: [],
      safetyRisks: [],
      scope: { domain: 'astronomy', domainHints: [], questionLength: 2 },
      decomposition: null,
      requiresEthicsGate: false,
      assessedAt: 't',
      schemaVersion: 1,
    },
    corpus: {
      snapshotId: 'snap',
      rootHash: 'h'.repeat(64),
      documentCount: 1,
      documents: [doc('10.1000/a')],
      sourceQueries: ['q'],
      createdAt: 't',
    },
    hypotheses: [primary],
    bindings: {
      'h-1': {
        supportingIds: ['10.1000/a'],
        counterIds: [],
        boundSupporting: [doc('10.1000/a')],
        boundCounter: [],
        unbound: [],
        allBound: true,
        snapshotId: 'snap',
        relations: [],
      },
    },
    critiques: {},
    scorecards: {},
    discovery: null,
    plan: {
      objectives: [],
      primaryHypothesisId: 'h-1',
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
    citationGate: {
      boundRate: 1, totalCited: 0, boundCount: 0, unboundEvidenceCount: 0,
      resolvedViaRetrieval: [], perHypothesis: {},
      primaryRequiresAllBound: true, primaryAllBound: true, gateVerdict: 'PASS',
    },
    falsifiabilityGate: { perHypothesis: { 'h-1': { passed: true, errors: [] } }, allPassed: true },
    environment: { gitCommit: null, gitDirty: null, nodeVersion: 'v', platform: 't', lockfileHash: null, packageVersion: null },
    modes: { modelExecutionMode: 'LIVE', retrievalExecutionMode: 'LIVE', experimentExecutionMode: 'NOT_EXECUTED' },
    runMode: 'LIVE',
    startedAt: 't',
    schemaVersion: 4,
  } satisfies ResearchRun;
}

/** Build a ledger whose last line for the hypothesis is KERNEL_ADJUDICATED. */
function adjudicatedLedger(dir: string, run: ResearchRun, adjudicated = true): string {
  const ledger = join(dir, 'registry.jsonl');
  const registered = registerRunDiscoveries(run, { ledgerPath: ledger, now: FIXED_NOW });
  assert.equal(registered.skippedMode, false);
  if (adjudicated) {
    const record = buildDiscoveryRegistryRecord({
      kind: 'state_transition',
      sequence: 1,
      contentHash: hypothesisContentHash(run.hypotheses[0]!),
      registeredAt: FIXED_NOW().toISOString(),
      state: 'KERNEL_ADJUDICATED',
      question: run.question,
      runId: run.runId,
      provenance: {
        corpusSnapshotId: run.corpus.snapshotId,
        corpusRootHash: run.corpus.rootHash,
        modelProfile: 'kernel',
        supportingCitations: [],
        counterEvidenceCitations: [],
        receiptsDigest: 'adjudication:obs-test-0001',
      },
      evidence: { deterministicCheckRef: 'verdict:obs-test-0001@run-review' },
      prevRecordHash: '',
    });
    appendDiscoveryRecords(ledger, [record]);
  }
  return ledger;
}

// ── CLI output capture（tests/cli/planning.test.ts 同款） ─────────────────────

let stdout: string;
let stderr: string;

function capture(fn: () => number): number {
  const prevOut = process.stdout.write.bind(process.stdout);
  const prevErr = process.stderr.write.bind(process.stderr);
  let out = '';
  let err = '';
  process.stdout.write = ((chunk: unknown): boolean => {
    out += typeof chunk === 'string' ? chunk : String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown): boolean => {
    err += typeof chunk === 'string' ? chunk : String(chunk);
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = fn();
    stdout = out;
    stderr = err;
    return code;
  } finally {
    process.stdout.write = prevOut;
    process.stderr.write = prevErr;
  }
}

// ── recordHumanReview — 阶梯门 + 台账追加 ────────────────────────────────────

describe('recordHumanReview — registry ladder promotion', () => {
  it('APPENDED → NOVEL_VALIDATED: line carries humanReviewRef + review.reviewedAt; chain stays valid', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-'));
    try {
      const run = liveRun();
      const ledger = adjudicatedLedger(dir, run);
      const out = recordHumanReview({
        run,
        hypothesisId: 'h-1',
        toState: 'NOVEL_VALIDATED',
        humanReviewRef: 'hr-2026-08-15-001',
        ledgerPath: ledger,
        now: FIXED_NOW,
      });
      assert.equal(out.status, 'APPENDED');
      assert.equal(out.fromState, 'KERNEL_ADJUDICATED');
      const records = readDiscoveryRegistry(ledger);
      assert.equal(records.length, 3); // registration + adjudicated + novel
      const novel = records[2]!;
      assert.equal(novel.kind, 'state_transition');
      assert.equal(novel.state, 'NOVEL_VALIDATED');
      assert.equal(novel.evidence.humanReviewRef, 'hr-2026-08-15-001');
      assert.equal(novel.evidence.review?.reviewedAt, FIXED_NOW().toISOString());
      assert.equal(novel.evidence.review?.reviewer, undefined);
      assert.ok(verifyDiscoveryRegistryChain(records).valid);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('APPENDED → NOVEL_VALIDATED with reviewer: the reviewer name is recorded on the line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-'));
    try {
      const run = liveRun();
      const ledger = adjudicatedLedger(dir, run);
      const out = recordHumanReview({
        run,
        hypothesisId: 'h-1',
        toState: 'NOVEL_VALIDATED',
        humanReviewRef: 'hr-001',
        reviewer: 'dr-reviewer',
        ledgerPath: ledger,
        now: FIXED_NOW,
      });
      assert.equal(out.status, 'APPENDED');
      const novel = readDiscoveryRegistry(ledger)[2]!;
      assert.equal(novel.evidence.review?.reviewer, 'dr-reviewer');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('APPENDED → REDISCOVERY: line carries matchingLiterature (the matching work is named)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-'));
    try {
      const run = liveRun();
      const ledger = adjudicatedLedger(dir, run);
      const out = recordHumanReview({
        run,
        hypothesisId: 'h-1',
        toState: 'REDISCOVERY',
        matchingLiterature: '10.1234/rediscovered-2019',
        ledgerPath: ledger,
        now: FIXED_NOW,
      });
      assert.equal(out.status, 'APPENDED');
      const records = readDiscoveryRegistry(ledger);
      const rediscovery = records[2]!;
      assert.equal(rediscovery.state, 'REDISCOVERY');
      assert.equal(rediscovery.evidence.matchingLiterature, '10.1234/rediscovered-2019');
      assert.ok(verifyDiscoveryRegistryChain(records).valid);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('REFUSED illegal_transition: CORROBORATED (no adjudicated line) cannot jump straight to NOVEL_VALIDATED', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-'));
    try {
      const run = liveRun();
      const ledger = adjudicatedLedger(dir, run, false); // registration only
      const out = recordHumanReview({
        run,
        hypothesisId: 'h-1',
        toState: 'NOVEL_VALIDATED',
        humanReviewRef: 'hr-001',
        ledgerPath: ledger,
        now: FIXED_NOW,
      });
      assert.equal(out.status, 'REFUSED');
      assert.equal(out.reason, 'illegal_transition');
      assert.match(out.detail ?? '', /KERNEL_ADJUDICATED/, 'the legal next step must be printed');
      assert.equal(readDiscoveryRegistry(ledger).length, 1, 'no line appended on refusal');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('REFUSED illegal_transition: a terminal state has no legal targets (REDISCOVERY after NOVEL_VALIDATED)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-'));
    try {
      const run = liveRun();
      const ledger = adjudicatedLedger(dir, run);
      assert.equal(
        recordHumanReview({
          run, hypothesisId: 'h-1', toState: 'NOVEL_VALIDATED',
          humanReviewRef: 'hr-001', ledgerPath: ledger, now: FIXED_NOW,
        }).status,
        'APPENDED',
      );
      const out = recordHumanReview({
        run,
        hypothesisId: 'h-1',
        toState: 'REDISCOVERY',
        matchingLiterature: '10.1/x',
        ledgerPath: ledger,
        now: FIXED_NOW,
      });
      assert.equal(out.status, 'REFUSED');
      assert.equal(out.reason, 'illegal_transition');
      assert.equal(readDiscoveryRegistry(ledger).length, 3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('REFUSED not_registered: an empty ledger never promotes unregistered content', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-'));
    try {
      const run = liveRun();
      const ledger = join(dir, 'fresh.jsonl');
      const out = recordHumanReview({
        run,
        hypothesisId: 'h-1',
        toState: 'NOVEL_VALIDATED',
        humanReviewRef: 'hr-001',
        ledgerPath: ledger,
        now: FIXED_NOW,
      });
      assert.equal(out.status, 'REFUSED');
      assert.equal(out.reason, 'not_registered');
      assert.equal(readDiscoveryRegistry(ledger).length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('REFUSED hypothesis_not_in_run: an unknown hypothesis id never reaches the ledger', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-'));
    try {
      const run = liveRun();
      const ledger = adjudicatedLedger(dir, run);
      const out = recordHumanReview({
        run,
        hypothesisId: 'h-missing',
        toState: 'NOVEL_VALIDATED',
        humanReviewRef: 'hr-001',
        ledgerPath: ledger,
        now: FIXED_NOW,
      });
      assert.equal(out.status, 'REFUSED');
      assert.equal(out.reason, 'hypothesis_not_in_run');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('idempotent: a second review of the same (contentHash, target) SKIPS and adds no line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-'));
    try {
      const run = liveRun();
      const ledger = adjudicatedLedger(dir, run);
      const first = recordHumanReview({
        run, hypothesisId: 'h-1', toState: 'NOVEL_VALIDATED',
        humanReviewRef: 'hr-001', ledgerPath: ledger, now: FIXED_NOW,
      });
      assert.equal(first.status, 'APPENDED');
      const second = recordHumanReview({
        run, hypothesisId: 'h-1', toState: 'NOVEL_VALIDATED',
        humanReviewRef: 'hr-002-different-ref', ledgerPath: ledger, now: FIXED_NOW,
      });
      assert.equal(second.status, 'SKIPPED_DUPLICATE');
      assert.equal(readDiscoveryRegistry(ledger).length, 3, 'no extra line for a duplicate');
      assert.ok(verifyDiscoveryRegistryChain(readDiscoveryRegistry(ledger)).valid);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('fail-closed evidence gate: an empty/whitespace humanReviewRef throws (never launders a promotion)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-'));
    try {
      const run = liveRun();
      const ledger = adjudicatedLedger(dir, run);
      assert.throws(
        () =>
          recordHumanReview({
            run, hypothesisId: 'h-1', toState: 'NOVEL_VALIDATED',
            humanReviewRef: '   ', ledgerPath: ledger, now: FIXED_NOW,
          }),
        /humanReviewRef/,
      );
      assert.equal(readDiscoveryRegistry(ledger).length, 2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('tamper detection: editing a review line after the fact breaks the chain and blocks further appends', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-'));
    try {
      // Two qualifying hypotheses, both registered + adjudicated: h-2's review
      // must reach the append stage, where the broken chain is refused.
      const run = liveRunTwoHypotheses();
      const ledger = join(dir, 'registry.jsonl');
      registerRunDiscoveries(run, { ledgerPath: ledger, now: FIXED_NOW });
      for (const hyp of run.hypotheses) {
        appendDiscoveryRecords(ledger, [
          buildDiscoveryRegistryRecord({
            kind: 'state_transition',
            sequence: 1,
            contentHash: hypothesisContentHash(hyp),
            registeredAt: FIXED_NOW().toISOString(),
            state: 'KERNEL_ADJUDICATED',
            question: run.question,
            runId: run.runId,
            provenance: {
              corpusSnapshotId: run.corpus.snapshotId,
              corpusRootHash: run.corpus.rootHash,
              modelProfile: 'kernel',
              supportingCitations: [],
              counterEvidenceCitations: [],
              receiptsDigest: `adjudication:obs-${hyp.id}`,
            },
            evidence: { deterministicCheckRef: `verdict:obs-${hyp.id}@${run.runId}` },
            prevRecordHash: '',
          }),
        ]);
      }
      recordHumanReview({
        run, hypothesisId: 'h-1', toState: 'NOVEL_VALIDATED',
        humanReviewRef: 'hr-001', ledgerPath: ledger, now: FIXED_NOW,
      });
      const lines = readFileSync(ledger, 'utf8').trimEnd().split('\n');
      const reviewLineIndex = 4; // 2 registrations + 2 adjudications + review line
      const tampered = JSON.parse(lines[reviewLineIndex]!) as { evidence: { review: { reviewedAt: string } } };
      tampered.evidence.review.reviewedAt = '1999-01-01T00:00:00.000Z'; // forge the review date
      lines[reviewLineIndex] = JSON.stringify(tampered);
      writeFileSync(ledger, lines.join('\n') + '\n', 'utf8');

      const records = readDiscoveryRegistry(ledger);
      const chain = verifyDiscoveryRegistryChain(records);
      assert.equal(chain.valid, false);
      assert.equal(chain.firstBrokenIndex, reviewLineIndex);

      assert.throws(
        () =>
          recordHumanReview({
            run, hypothesisId: 'h-2', toState: 'NOVEL_VALIDATED',
            humanReviewRef: 'hr-x', ledgerPath: ledger, now: FIXED_NOW,
          }),
        /refusing to append to a broken discovery registry/,
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('additive field: pre-b6 records without evidence.review stay valid and chain-verifiable', () => {
    const legacy = buildDiscoveryRegistryRecord({
      kind: 'state_transition', sequence: 1, contentHash: 'c'.repeat(64),
      registeredAt: FIXED_NOW().toISOString(), state: 'KERNEL_ADJUDICATED',
      question: 'q', runId: 'r',
      provenance: {
        corpusSnapshotId: 's', corpusRootHash: 'a'.repeat(64), modelProfile: 'kernel',
        supportingCitations: [], counterEvidenceCitations: [], receiptsDigest: 'b'.repeat(64),
      },
      evidence: { deterministicCheckRef: 'x' }, prevRecordHash: '',
    });
    assert.equal(legacy.evidence.review, undefined, 'absent on legacy lines = not recorded then');
    assert.ok(verifyDiscoveryRegistryChain([legacy]).valid);
  });
});

/** A LIVE run with TWO qualifying hypotheses (h-1 + h-2, different content hashes). */
function liveRunTwoHypotheses(): ResearchRun {
  const base = liveRun();
  const first = base.hypotheses[0]!;
  const second: HypothesisCandidate = {
    ...first,
    id: 'h-2',
    statement: 'a materially different statement (different content hash)',
    mechanism: 'a materially different mechanism',
  };
  return {
    ...base,
    hypotheses: [base.hypotheses[0]!, second],
    bindings: {
      ...base.bindings,
      'h-2': base.bindings['h-1']!,
    },
    falsifiabilityGate: {
      perHypothesis: {
        'h-1': { passed: true, errors: [] },
        'h-2': { passed: true, errors: [] },
      },
      allPassed: true,
    },
  };
}

// ── runResearchReview — CLI 入口 ─────────────────────────────────────────────

describe('runResearchReview — CLI gates and outputs', () => {
  function writeRun(dir: string, run: ResearchRun = liveRun()): string {
    const path = join(dir, 'run.json');
    writeFileSync(path, JSON.stringify(run), 'utf8');
    return path;
  }

  it('missing <run.json> → exit 2 with usage', () => {
    const code = capture(() => runResearchReview(['--to', 'NOVEL_VALIDATED']));
    assert.equal(code, 2);
    assert.match(stderr, /usage: far research review/);
  });

  it('missing --to → exit 2', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-cli-'));
    try {
      const runPath = writeRun(dir);
      const code = capture(() =>
        runResearchReview([runPath, '--hypothesis', 'h-1', '--human-review-ref', 'hr-001']),
      );
      assert.equal(code, 2);
      assert.match(stderr, /--to/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('invalid --to value → exit 2 listing the two review targets', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-cli-'));
    try {
      const runPath = writeRun(dir);
      const code = capture(() =>
        runResearchReview([runPath, '--hypothesis', 'h-1', '--to', 'CORROBORATED', '--human-review-ref', 'hr-001']),
      );
      assert.equal(code, 2);
      assert.match(stderr, /NOVEL_VALIDATED/);
      assert.match(stderr, /REDISCOVERY/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('NOVEL without --human-review-ref → exit 2 (no review without a named human record)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-cli-'));
    try {
      const runPath = writeRun(dir);
      const code = capture(() =>
        runResearchReview([runPath, '--hypothesis', 'h-1', '--to', 'NOVEL_VALIDATED']),
      );
      assert.equal(code, 2);
      assert.match(stderr, /--human-review-ref/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('REDISCOVERY without --matching-literature → exit 2', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-cli-'));
    try {
      const runPath = writeRun(dir);
      const code = capture(() =>
        runResearchReview([runPath, '--hypothesis', 'h-1', '--to', 'REDISCOVERY']),
      );
      assert.equal(code, 2);
      assert.match(stderr, /--matching-literature/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('missing --hypothesis → exit 2; unknown flag → exit 2', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-cli-'));
    try {
      const runPath = writeRun(dir);
      assert.equal(
        capture(() => runResearchReview([runPath, '--to', 'NOVEL_VALIDATED', '--human-review-ref', 'hr-1'])),
        2,
      );
      assert.match(stderr, /--hypothesis/);
      assert.equal(
        capture(() =>
          runResearchReview([runPath, '--hypothesis', 'h-1', '--to', 'NOVEL_VALIDATED', '--human-review-ref', 'r', '--bogus']),
        ),
        2,
      );
      assert.match(stderr, /unknown argument/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('unreadable run file → exit 1', () => {
    const code = capture(() =>
      runResearchReview([
        join(tmpdir(), 'far-review-nonexistent-run.json'),
        '--hypothesis', 'h-1', '--to', 'NOVEL_VALIDATED', '--human-review-ref', 'hr-1',
      ]),
    );
    assert.equal(code, 1);
    assert.match(stderr, /cannot read/);
  });

  it('success → NOVEL_VALIDATED: exit 0, ledger line appended, disclosure checklist printed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-cli-'));
    try {
      const run = liveRun();
      const runPath = writeRun(dir, run);
      const ledger = adjudicatedLedger(dir, run);
      const code = capture(() =>
        runResearchReview([
          runPath, '--hypothesis', 'h-1', '--to', 'NOVEL_VALIDATED',
          '--human-review-ref', 'hr-2026-001', '--reviewer', 'dr-reviewer', '--ledger', ledger,
        ]),
      );
      assert.equal(code, 0);
      assert.match(stdout, /NOVEL_VALIDATED/);
      assert.match(stdout, /state_transition/);
      assert.match(stdout, /hr-2026-001/);
      // 披露三条件 reminder（§2.4 对外声称 NOVEL_* 级发现的先决条件）
      assert.match(stdout, /泄漏评估|leakage/i);
      assert.match(stdout, /人工复核|human review/i);
      assert.match(stdout, /AI 生成|AI-generated/i);
      const records = readDiscoveryRegistry(ledger);
      assert.equal(records.length, 3);
      assert.equal(records[2]!.state, 'NOVEL_VALIDATED');
      assert.equal(records[2]!.evidence.review?.reviewer, 'dr-reviewer');
      assert.ok(verifyDiscoveryRegistryChain(records).valid);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('success --json: machine-readable outcome parses with registry id and from/to states', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-cli-'));
    try {
      const run = liveRun();
      const runPath = writeRun(dir, run);
      const ledger = adjudicatedLedger(dir, run);
      const code = capture(() =>
        runResearchReview([
          runPath, '--hypothesis', 'h-1', '--to', 'NOVEL_VALIDATED',
          '--human-review-ref', 'hr-json', '--ledger', ledger, '--json',
        ]),
      );
      assert.equal(code, 0);
      const parsed = JSON.parse(stdout) as {
        hypothesisId: string; fromState: string; toState: string;
        registryId: string; chainValid: boolean;
      };
      assert.equal(parsed.hypothesisId, 'h-1');
      assert.equal(parsed.fromState, 'KERNEL_ADJUDICATED');
      assert.equal(parsed.toState, 'NOVEL_VALIDATED');
      assert.match(parsed.registryId, /^dsc-/);
      assert.equal(parsed.chainValid, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('skip-level (CORROBORATED-only ledger) → exit 3 with the legal ladder path on stderr', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-cli-'));
    try {
      const run = liveRun();
      const runPath = writeRun(dir, run);
      const ledger = adjudicatedLedger(dir, run, false);
      const code = capture(() =>
        runResearchReview([
          runPath, '--hypothesis', 'h-1', '--to', 'NOVEL_VALIDATED',
          '--human-review-ref', 'hr-1', '--ledger', ledger,
        ]),
      );
      assert.equal(code, 3);
      assert.match(stderr, /REFUSED|拒绝|illegal/i);
      assert.match(stderr, /KERNEL_ADJUDICATED/);
      assert.equal(readDiscoveryRegistry(ledger).length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('not registered → exit 3 (the ladder never promotes unregistered content)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-cli-'));
    try {
      const run = liveRun();
      const runPath = writeRun(dir, run);
      const ledger = join(dir, 'fresh.jsonl');
      const code = capture(() =>
        runResearchReview([
          runPath, '--hypothesis', 'h-1', '--to', 'NOVEL_VALIDATED',
          '--human-review-ref', 'hr-1', '--ledger', ledger,
        ]),
      );
      assert.equal(code, 3);
      assert.match(stderr, /no registry line|unregistered/i);
      assert.equal(readDiscoveryRegistry(ledger).length, 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('unknown hypothesis in run → exit 3', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-cli-'));
    try {
      const run = liveRun();
      const runPath = writeRun(dir, run);
      const ledger = adjudicatedLedger(dir, run);
      const code = capture(() =>
        runResearchReview([
          runPath, '--hypothesis', 'h-404', '--to', 'NOVEL_VALIDATED',
          '--human-review-ref', 'hr-1', '--ledger', ledger,
        ]),
      );
      assert.equal(code, 3);
      assert.match(stderr, /h-404/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('idempotent rerun → exit 0 with SKIPPED_DUPLICATE and no extra ledger line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-review-cli-'));
    try {
      const run = liveRun();
      const runPath = writeRun(dir, run);
      const ledger = adjudicatedLedger(dir, run);
      const once = capture(() =>
        runResearchReview([
          runPath, '--hypothesis', 'h-1', '--to', 'REDISCOVERY',
          '--matching-literature', '10.9/known', '--ledger', ledger,
        ]),
      );
      assert.equal(once, 0);
      const twice = capture(() =>
        runResearchReview([
          runPath, '--hypothesis', 'h-1', '--to', 'REDISCOVERY',
          '--matching-literature', '10.9/known', '--ledger', ledger, '--json',
        ]),
      );
      assert.equal(twice, 0);
      assert.match(stdout, /SKIPPED_DUPLICATE|duplicate/i);
      assert.equal(readDiscoveryRegistry(ledger).length, 3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
