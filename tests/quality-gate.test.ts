import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { Orchestrator } from '../src/app/orchestrator.js';
import {
  evaluateQualityGate,
  deterministicId,
  WEAK_TOP_COMPOSITE,
  MAX_QUALITY_ROUNDS,
} from '../src/app/quality-gate.js';
import { isParaphrase } from '../src/pipeline/stages/hypotheses.js';
import {
  HypothesisScorecard,
  HypothesisTournament,
  ResearchQuestion,
  newId,
} from '../src/domain/index.js';
import type { RunStageName } from '../src/domain/index.js';
import { STAGE_ORDER } from '../src/domain/run.js';
import type { StageHandler } from '../src/pipeline/types.js';
import type { RunStageName } from '../src/domain/run.js';
import type { ArtifactStore, ModelProvider, SourceAdapter } from '../src/shared/ports.js';
import type { StageHandler } from '../src/pipeline/types.js';
import type { RunStageName } from '../src/domain/run.js';
import type { SourceFamily } from '../src/domain/source.js';

/**
 * BP-1 deterministic quality gate. Scripted handlers + real Store: the gate reads
 * scorecards/tournament from the store exactly as production does. Behavioral
 * assertions: signal rules, one bounded regeneration round, no infinite loop,
 * attempts/events truthful.
 */

const dim = (dimension: string, value: number) => ({
  dimension,
  value,
  rationale: `rationale for ${dimension}`,
  evidenceClaimIds: [],
  producer: 'test',
  calibration: 'uncalibrated_llm_judgment' as const,
});

const makeScorecard = (runId: string, hypId: string, rank: number, values: number[]) =>
  HypothesisScorecard.parse({
    id: deterministicId('sc', runId, hypId),
    runId,
    hypothesisId: hypId,
    dimensions: [dim('evidence_grounding', values[0]!), dim('falsifiability', values[1]!), dim('testability', values[2]!)],
    overallRationale: 'test rationale',
    rankedOutOf: 3,
    rank,
    comparisonNote: 'test',
  });

const makeMatch = (aId: string, bId: string, aFirst: 'a' | 'b' | 'tie', bFirst: 'a' | 'b' | 'tie') => ({
  aId,
  bId,
  aFirstVerdict: aFirst,
  bFirstVerdict: bFirst,
  rationale: 'test match rationale long enough',
  producer: 'test',
  outcome: (aFirst === 'incomparable' || bFirst === 'incomparable'
    ? 'no_contest'
    : aFirst === bFirst ? aFirst : 'tie') as 'a' | 'b' | 'tie' | 'no_contest',
});

describe('evaluateQualityGate signal rules', () => {
  const runId = newId('run');
  const h = (i: number) => `hyp_${String(i).padStart(2, '0')}${'a'.repeat(20)}`;

  it('flags fewer than 2 ranked hypotheses', () => {
    const s = evaluateQualityGate([makeScorecard(runId, h(1), 1, [0.8, 0.8, 0.8])], null);
    expect(s.weak).toBe(true);
    expect(s.reasons[0]).toContain('no genuine competition');
    expect(s.metrics.ranked).toBe(1);
  });

  it('flags a thin top hypothesis (mean dimension below threshold)', () => {
    const cards = [
      makeScorecard(runId, h(1), 1, [0.3, 0.2, 0.4]),
      makeScorecard(runId, h(2), 2, [0.2, 0.2, 0.2]),
      makeScorecard(runId, h(3), 3, [0.1, 0.1, 0.1]),
    ];
    const s = evaluateQualityGate(cards, null);
    expect(s.weak).toBe(true);
    expect(s.metrics.topComposite).not.toBeNull();
    expect(s.metrics.topComposite!).toBeLessThan(WEAK_TOP_COMPOSITE);
    // critique payload carries the two lowest dimensions of the top hypothesis
    const top = s.weakDimensions.find((w) => w.rank === 1);
    expect(top?.dimensions.map((d) => d.dimension)).toEqual(['falsifiability', 'evidence_grounding']);
  });

  it('flags order-swap disagreement above threshold', () => {
    const cards = [
      makeScorecard(runId, h(1), 1, [0.9, 0.9, 0.9]),
      makeScorecard(runId, h(2), 2, [0.8, 0.8, 0.8]),
      makeScorecard(runId, h(3), 3, [0.7, 0.7, 0.7]),
    ];
    // 2 of 3 matches are disagreement-ties -> 66% > 40%
    const tournament = HypothesisTournament.parse({
      id: newId('trn'),
      runId,
      participantIds: [h(1), h(2), h(3)],
      matches: [
        makeMatch(h(1), h(2), 'a', 'b'), // disagreement -> tie
        makeMatch(h(1), h(3), 'a', 'b'), // disagreement -> tie
        makeMatch(h(2), h(3), 'a', 'a'), // consistent -> a
      ],
      standings: [
        { hypothesisId: h(1), btScore: 1.5, wins: 0, losses: 0, ties: 2, winRate: 0.5, rank: 1 },
        { hypothesisId: h(2), btScore: 1.2, wins: 0, losses: 0, ties: 2, winRate: 0.5, rank: 2 },
        { hypothesisId: h(3), btScore: 0.8, wins: 0, losses: 2, ties: 0, winRate: 0, rank: 3 },
      ],
      algorithm: 'bradley-terry-ilsr-v1',
      uncertainty: 'test uncertainty disclosure',
      createdAt: new Date().toISOString(),
    });
    const s = evaluateQualityGate(cards, tournament);
    expect(s.weak).toBe(true);
    expect(s.metrics.swapDisagreementRate).toBeCloseTo(2 / 3, 5);
    expect(s.reasons.join(' ')).toContain('order-swap disagreement');
  });

  it('healthy ranked set produces no weak signal', () => {
    const cards = [
      makeScorecard(runId, h(1), 1, [0.9, 0.8, 0.9]),
      makeScorecard(runId, h(2), 2, [0.8, 0.8, 0.8]),
      makeScorecard(runId, h(3), 3, [0.7, 0.7, 0.7]),
    ];
    const tournament = HypothesisTournament.parse({
      id: newId('trn'),
      runId,
      participantIds: [h(1), h(2), h(3)],
      matches: [
        makeMatch(h(1), h(2), 'a', 'a'),
        makeMatch(h(1), h(3), 'a', 'a'),
        makeMatch(h(2), h(3), 'b', 'b'),
      ],
      standings: [
        { hypothesisId: h(1), btScore: 2.0, wins: 2, losses: 0, ties: 0, winRate: 1, rank: 1 },
        { hypothesisId: h(2), btScore: 1.1, wins: 1, losses: 1, ties: 0, winRate: 0.5, rank: 2 },
        { hypothesisId: h(3), btScore: 0.7, wins: 0, losses: 2, ties: 0, winRate: 0, rank: 3 },
      ],
      algorithm: 'bradley-terry-ilsr-v1',
      uncertainty: 'test uncertainty disclosure',
      createdAt: new Date().toISOString(),
    });
    const s = evaluateQualityGate(cards, tournament);
    expect(s.weak).toBe(false);
    expect(s.reasons).toEqual([]);
    expect(s.metrics.swapDisagreementRate).toBe(0);
  });

  it('deterministicId is stable, id-shaped, and content-sensitive', () => {
    const a = deterministicId('sc', 'run1', 'hyp1');
    expect(a).toBe(deterministicId('sc', 'run1', 'hyp1'));
    expect(a).toMatch(/^sc_[0-9a-z]{20,32}$/);
    expect(a).not.toBe(deterministicId('sc', 'run1', 'hyp2'));
  });

  it('MAX_QUALITY_ROUNDS bounds regeneration to one extra round', () => {
    expect(MAX_QUALITY_ROUNDS).toBe(2);
  });
});

describe('regeneration paraphrase guard', () => {
  it('drops near-identical restatements and keeps materially different statements', () => {
    const prior = ['Random forest beats logistic regression on cytology features because of axis-orthogonal splits'];
    const rephrase = 'Random forest beats logistic regression on cytology features because of axis-orthogonal splits overall';
    const nearMiss = 'Random forest beats logistic regression on cytology features because of axis-orthogonal split';
    const different = 'Class imbalance, not decision-boundary geometry, drives the accuracy gap between tree ensembles and linear baselines';
    expect(isParaphrase(rephrase, prior)).toBe(true); // near-verbatim restatement
    expect(isParaphrase(nearMiss, prior)).toBe(false); // one-token drift falls below the near-verbatim bar
    expect(isParaphrase(different, prior)).toBe(false);
  });
});

describe('orchestrator quality-gate regeneration loop', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-qg-'));

  const buildOrchestrator = (store: Store, stages: Map<RunStageName, StageHandler>) =>
    new Orchestrator({
      store,
      artifacts: {} as ArtifactStore,
      provider: {} as ModelProvider,
      sourceFor: ((_f: SourceFamily): SourceAdapter => { throw new Error('no source adapter'); }),
      stages,
      signals: new Map(),
    });

  const okHandler = (stage: RunStageName): StageHandler => ({
    stage,
    applicable: async () => true,
    execute: async () => ({ kind: 'done', summary: `${stage} done` }),
  });

  it('weak first rank triggers exactly one regeneration round; strong second rank proceeds', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = store.createRun(q);
    const h1 = `hyp_${'a'.repeat(21)}`;
    const h2 = `hyp_${'b'.repeat(21)}`;
    const h3 = `hyp_${'c'.repeat(21)}`;

    let genCalls = 0;
    let rankCalls = 0;
    const weakCards = () => [
      makeScorecard(run.id, h1, 1, [0.2, 0.2, 0.2]),
      makeScorecard(run.id, h2, 2, [0.15, 0.15, 0.15]),
      makeScorecard(run.id, h3, 3, [0.1, 0.1, 0.1]),
    ];
    const strongCards = () => [
      makeScorecard(run.id, h1, 1, [0.9, 0.85, 0.9]),
      makeScorecard(run.id, h2, 2, [0.8, 0.8, 0.8]),
      makeScorecard(run.id, h3, 3, [0.7, 0.7, 0.7]),
    ];
    const tournamentFor = () =>
      HypothesisTournament.parse({
        id: newId('trn'),
        runId: run.id,
        participantIds: [h1, h2, h3],
        matches: [
          makeMatch(h1, h2, 'a', 'a'),
          makeMatch(h1, h3, 'a', 'a'),
          makeMatch(h2, h3, 'b', 'b'),
        ],
        standings: [
          { hypothesisId: h1, btScore: 2, wins: 2, losses: 0, ties: 0, winRate: 1, rank: 1 },
          { hypothesisId: h2, btScore: 1.1, wins: 1, losses: 1, ties: 0, winRate: 0.5, rank: 2 },
          { hypothesisId: h3, btScore: 0.7, wins: 0, losses: 2, ties: 0, winRate: 0, rank: 3 },
        ],
        algorithm: 'bradley-terry-ilsr-v1',
        uncertainty: 'test uncertainty disclosure',
        createdAt: new Date().toISOString(),
      });

    const stages = new Map<RunStageName, StageHandler>(
      STAGE_ORDER.map((stage) => [
        stage,
        stage === 'generate_hypotheses'
          ? { stage, applicable: async () => true, execute: async () => { genCalls += 1; return { kind: 'done', summary: `gen round ${genCalls}` }; } }
          : stage === 'rank'
            ? {
                stage,
                applicable: async () => true,
                execute: async () => {
                  rankCalls += 1;
                  for (const c of rankCalls === 1 ? weakCards() : strongCards()) store.putObject('scorecard', c);
                  store.putObject('tournament', tournamentFor());
                  return { kind: 'done', summary: `rank round ${rankCalls}` };
                },
              }
            : okHandler(stage),
      ] as const),
    );
    const orch = buildOrchestrator(store, stages);
    const after = await orch.execute(run.id);

    expect(after.status).toBe('completed');
    expect(genCalls).toBe(2); // exactly one regeneration round
    expect(rankCalls).toBe(2);
    // attempts are provenance facts: both re-opened stages show attempt=2
    expect(after.stages.find((x) => x.stage === 'generate_hypotheses')?.attempt).toBe(2);
    expect(after.stages.find((x) => x.stage === 'rank')?.attempt).toBe(2);
    // audit trail carries the gate decision with its deterministic reasons
    const regenEvent = store.listEvents(run.id).find((e) => e.type === 'note' && e.detail.reason === 'quality_gate_regeneration');
    expect(regenEvent?.detail.round).toBe(2);
    expect(Array.isArray(regenEvent?.detail.signal?.reasons)).toBe(true);
    // plan/export ran exactly once despite the backward jump
    expect(after.stages.find((x) => x.stage === 'plan')?.state).toBe('done');
    expect(after.stages.find((x) => x.stage === 'plan')?.attempt).toBe(1);
    // no third round even though the SECOND rank was evaluated too (strong -> proceed)
    expect(store.listEvents(run.id).filter((e) => e.type === 'note' && e.detail.reason === 'quality_gate_regeneration').length).toBe(1);
    db.close();
  });

  it('persistently weak sets stop after the bounded round instead of looping', async () => {
    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'question', background: '', goalType: 'explanatory',
      scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = store.createRun(q);
    const h1 = `hyp_${'a'.repeat(21)}`;
    const h2 = `hyp_${'b'.repeat(21)}`;
    const h3 = `hyp_${'c'.repeat(21)}`;

    let rankCalls = 0;
    const stages = new Map<RunStageName, StageHandler>(
      STAGE_ORDER.map((stage) => [
        stage,
        stage === 'generate_hypotheses'
          ? { stage, applicable: async () => true, execute: async () => ({ kind: 'done', summary: 'gen' }) }
          : stage === 'rank'
            ? {
                stage,
                applicable: async () => true,
                execute: async () => {
                  rankCalls += 1;
                  // ALWAYS weak: thin top + high swap disagreement
                  for (const c of [
                    makeScorecard(run.id, h1, 1, [0.2, 0.2, 0.2]),
                    makeScorecard(run.id, h2, 2, [0.15, 0.15, 0.15]),
                    makeScorecard(run.id, h3, 3, [0.1, 0.1, 0.1]),
                  ]) store.putObject('scorecard', c);
                  store.putObject(
                    'tournament',
                    HypothesisTournament.parse({
                      id: newId('trn'),
                      runId: run.id,
                      participantIds: [h1, h2, h3],
                      matches: [makeMatch(h1, h2, 'a', 'b'), makeMatch(h1, h3, 'a', 'b'), makeMatch(h2, h3, 'a', 'b')],
                      standings: [
                        { hypothesisId: h1, btScore: 1.2, wins: 0, losses: 0, ties: 2, winRate: 0.5, rank: 1 },
                        { hypothesisId: h2, btScore: 1.1, wins: 0, losses: 0, ties: 2, winRate: 0.5, rank: 2 },
                        { hypothesisId: h3, btScore: 1.0, wins: 0, losses: 0, ties: 2, winRate: 0.5, rank: 3 },
                      ],
                      algorithm: 'bradley-terry-ilsr-v1',
                      uncertainty: 'test uncertainty disclosure',
                      createdAt: new Date().toISOString(),
                    }),
                  );
                  return { kind: 'done', summary: `rank ${rankCalls}` };
                },
              }
            : okHandler(stage),
      ] as const),
    );
    const orch = buildOrchestrator(store, stages);
    const after = await orch.execute(run.id);

    expect(after.status).toBe('completed');
    expect(rankCalls).toBe(2); // bounded: initial + one regeneration, never a third
    // the second weak evaluation is disclosed, not silently swallowed
    const proceeding = store.listEvents(run.id).find((e) => e.detail.reason === 'quality_gate_weak_proceeding');
    expect(proceeding?.detail.round).toBe(MAX_QUALITY_ROUNDS);
    db.close();
  });
});

// ---------------------------------------------------------------------------
// P0-1 regression (red-team): the regeneration loop must work with the REAL
// generate_hypotheses stage handler — stub handlers with applicable:()=>true once
// masked a dead reopen flag. This test drives the orchestrator with the real stage
// and asserts round-2 hypotheses are actually generated and persisted.
// ---------------------------------------------------------------------------

describe('quality-gate regeneration with the REAL generate_hypotheses stage', () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'far-qg-real-'));

  it('reopens, re-runs the real stage, persists NEW hypotheses, consumes the reopen flag', async () => {
    const { createTestStubProvider } = await import('../src/providers/test-stub.js');
    const { generateHypothesesStage } = await import('../src/pipeline/stages/hypotheses.js');
    const { ScientificClaim, SourceDocument } = await import('../src/domain/index.js');
    const { Orchestrator } = await import('../src/app/orchestrator.js');
    const { STAGE_ORDER } = await import('../src/domain/run.js');

    const dir = tmp();
    const db = openDb(path.join(dir, 'far.db'));
    const store = new Store(db);
    const q = ResearchQuestion.parse({
      id: newId('q'), text: 'Why do base editors cause off-target deamination?', background: '', goalType: 'explanatory',
      scope: { domain: 'genome editing', phenomena: ['off-target'] }, constraints: {}, createdAt: new Date().toISOString(),
    });
    const run = store.createRun(q);
    const SRC = newId('src');
    store.putObject('source_document', SourceDocument.parse({
      id: SRC, runId: run.id, family: 'openalex', identifiers: [{ kind: 'doi', value: '10.1/x' }],
      title: 'Source', retrievedAt: new Date().toISOString(), contentHash: 'a'.repeat(64),
      contentDepth: 'abstract', accessState: 'unknown', parseStatus: 'ok',
    }));
    for (const text of ['claim one about deamination windows', 'claim two about inhibitor effects']) {
      store.putObject('claim', ScientificClaim.parse({
        id: newId('clm'), runId: run.id, text, bindingStatus: 'verified', alignmentChecked: true,
        locators: [{ sourceDocumentId: SRC, quote: 'verbatim: ' + text }],
      }));
    }

    // Purpose-keyed dynamic responses: round 1 vs round 2 (payload carries
    // previousRoundCritique in the regeneration round) return DIFFERENT candidates,
    // so round 2 must persist genuinely new hypotheses.
    // Round flavors are MATERIALLY different words (not near-verbatim), so the
    // regeneration paraphrase guard must let round-2 candidates through.
    const cand = (n: string, flavor: string) => ({
      statement: 'Hypothesis ' + n + ': the ' + flavor + ' pathway explains the observed off-target deamination pattern',
      mechanism: 'mechanism via ' + flavor,
      assumptions: ['assumption ' + n + ' a', 'assumption ' + n + ' b'],
      predictions: ['prediction ' + n],
      rationale: 'rationale ' + n,
      distinctnessRationale: 'distinct ' + n,
      evidenceClaimIds: [],
    });
    const flavorOf = (r: 1 | 2): string => (r === 1 ? 'cytosine deamination window widening' : 'polymerase slippage at repeat loci');
    type StubReq = { task?: string; userPayload?: { input?: { previousRoundCritique?: unknown; numberedCandidates?: Array<{ index: number }> } } };
    const rround = (req: StubReq): 1 | 2 => (req.userPayload?.input?.previousRoundCritique !== undefined ? 2 : 1);
    const dynamics: Record<string, (req: StubReq) => unknown> = {
      'hypothesis-search:evidence-conditioned': (req) => ({ candidates: [cand('ec1-r' + rround(req), flavorOf(rround(req))), cand('ec2-r' + rround(req), flavorOf(rround(req)))] }),
      'hypothesis-search:contradiction-driven': (req) => ({ candidates: [cand('cd1-r' + rround(req), flavorOf(rround(req))), cand('cd2-r' + rround(req), flavorOf(rround(req)))] }),
      'hypothesis-search:mechanism-driven': (req) => ({ candidates: [cand('md1-r' + rround(req), flavorOf(rround(req))), cand('md2-r' + rround(req), flavorOf(rround(req)))] }),
      // Cluster/novelty handlers answer with a minimal schema-valid response; the
      // stage's own normalization treats unmentioned candidates as distinct
      // singletons / 'mixed' — no payload introspection needed (and none trusted).
      'hypothesis-search:cluster-dedup': () => ({ clusters: [{ memberIndices: [0], reason: 'scripted singleton; the rest normalize to distinct' }] }),
      'hypothesis-search:novelty-labels': () => ({ labels: [{ index: 0, noveltyLabel: 'mixed' }] }),
      // the scripted single-cluster answer drops the representative count below
      // MIN_REPRESENTATIVES, so the stage asks for a supplement — answer honestly empty
      'hypothesis-search:diversity-supplement': () => ({ candidates: [] }),
      'novelty-check:query-expansion': () => ({ hypotheses: [{ hypothesisId: 'unused', queries: ['q one about editors', 'q two about deamination'] }] }),
    };
    const inner = createTestStubProvider([]);
    const provider: ModelProvider = {
      name: inner.name,
      liveReady: true,
      async structuredCall(req, parse) {
        const dyn = dynamics[req.task];
        if (dyn === undefined) throw new Error('TEST: unexpected purpose ' + String(req.task));
        const data = dyn(req as StubReq);
        const parsed = parse(data);
        if (parsed instanceof Error) throw new Error('TEST dynamic schema fail for ' + String(req.task) + ': ' + parsed.message);
        return {
          ok: true as const, data: parsed as unknown,
          receipt: { provider: inner.name, modelId: 'test-stub', latencyMs: 0, usage: {},
            requestHash: 'a'.repeat(64), outputHash: 'b'.repeat(64), executionMode: 'test' as const },
        };
      },
    };

    const h1 = 'hyp_' + 'd'.repeat(21);
    const h2 = 'hyp_' + 'e'.repeat(21);
    const h3 = 'hyp_' + 'f'.repeat(21);
    let rankCalls = 0;
    const okHandler = (stage: RunStageName): StageHandler => ({
      stage, applicable: async () => true, execute: async () => ({ kind: 'done', summary: String(stage) + ' done' }),
    });
    const stages = new Map<RunStageName, StageHandler>(
      STAGE_ORDER.map((stage) => [
        stage,
        stage === 'generate_hypotheses' ? generateHypothesesStage
          : stage === 'rank'
            ? {
              stage,
              applicable: async () => true,
              execute: async () => {
                rankCalls += 1;
                const cards = rankCalls === 1
                  ? [makeScorecard(run.id, h1, 1, [0.2, 0.2, 0.2]), makeScorecard(run.id, h2, 2, [0.15, 0.15, 0.15]), makeScorecard(run.id, h3, 3, [0.1, 0.1, 0.1])]
                  : [makeScorecard(run.id, h1, 1, [0.9, 0.85, 0.9]), makeScorecard(run.id, h2, 2, [0.8, 0.8, 0.8]), makeScorecard(run.id, h3, 3, [0.7, 0.7, 0.7])];
                for (const c of cards) store.putObject('scorecard', c);
                return { kind: 'done', summary: 'rank ' + rankCalls };
              },
            }
            : okHandler(stage),
      ] as const),
    );
    const artifacts = {
      async put(payload: string | Uint8Array) { return { ref: 'sha256:' + '0'.repeat(64), bytes: typeof payload === 'string' ? payload.length : payload.length }; },
      async get() { throw new Error('no artifacts in this test'); },
    } as unknown as ArtifactStore;
    const orch = new Orchestrator({
      store, artifacts, provider,
      sourceFor: () => { throw new Error('no source adapter - literature novelty degrades honestly'); },
      stages, signals: new Map(),
    });
    const after = await orch.execute(run.id);
    if (after.status !== 'completed') {
      throw new Error('run ended ' + after.status + ' | failed: ' + after.stages.filter((x) => x.state === 'failed').map((x) => x.stage + ' :: ' + String(x.error)).join(' ; '));
    }

    expect(after.status).toBe('completed');
    expect(rankCalls).toBe(2);
    // THE load-bearing assertions: the real stage ran twice and round-2 hypotheses
    // are persisted (6 singleton clusters per round -> 12 hypotheses).
    const hypotheses = store.listObjects('hypothesis', run.id);
    expect(hypotheses.length).toBe(12);
    expect(hypotheses.some((h) => h.statement.includes('r2'))).toBe(true);
    expect(after.stages.find((s) => s.stage === 'generate_hypotheses')?.attempt).toBe(2);
    expect(store.getMeta('qg:active:' + run.id)).toBe('0'); // consumed, never re-loops
    expect(store.listEvents(run.id).some((e) => e.type === 'note' && e.detail.reason === 'quality_gate_regeneration')).toBe(true);
    db.close();
  });
});
