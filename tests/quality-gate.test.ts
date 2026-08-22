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
import type { ArtifactStore, ModelProvider, SourceAdapter } from '../src/shared/ports.js';
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
