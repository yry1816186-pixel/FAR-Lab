import { createHash } from 'node:crypto';
import { canonicalJson } from '../shared/crypto.js';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';
import {
  newId,
  FemSpec,
  checkFemSpec,
  femConvergenceVerdict,
  femAdaptiveVerdict,
  FEM_ADAPTIVE_DEFAULTS,
  type FemMeasurement,
  type FemAdaptiveMeasurement,
  FeedbackSignal,
  type ExperimentRun,
  type StatReport,
  type HypothesisCandidate,
} from '../domain/index.js';
import { createSidecar, type Sidecar } from './python.js';

/**
 * Slice-6 numerical-PDE executor: the numerical_simulation falsification path.
 * A preregistered FemSpec's convergence claim is measured by the real sidecar
 * (`fem_poisson_2d`: P1 elements, mixed boundary assembly, uniform refinement
 * ladder; sympy derives the forcing exactly from the manufactured solution);
 * the verdict is MECHANICAL (observed orders vs the theoretical P1 rates with
 * a disclosed tolerance). No LLM runs at execution time: the model only
 * DRAFTED the manufactured solution + boundary split inside a closed
 * expression space, and checkFemSpec gated it deterministically before spend.
 *
 * Authority mirrors executor-theory: experiment_run = terminal projection +
 * audit events; the per-level error table + sidecar logs = content-addressed
 * artifacts; hypothesis-bound specs need a covering approval; re-running the
 * same spec hash is labelled exploratory (data-peeking discipline, D-086-7).
 */

export interface FemExecuteOptions {
  shouldCancel?: () => boolean;
  sidecar?: () => Sidecar;
  now?: () => string;
}

export interface ExecutedFem {
  run: ExperimentRun;
  statReports: StatReport[];
  feedback: FeedbackSignal[];
  measurement: FemMeasurement | FemAdaptiveMeasurement;
}

export const femSpecHash = (spec: FemSpec): string =>
  createHash('sha256').update(canonicalJson(spec)).digest('hex');

export const executeFemAnalysis = async (
  store: Store,
  artifacts: ArtifactStore,
  spec: FemSpec,
  opts: FemExecuteOptions = {},
): Promise<ExecutedFem> => {
  const now = opts.now ?? (() => new Date().toISOString());

  // 1. Fail-closed validation gate BEFORE any spend (expression/boundary/approvals).
  const hypotheses = store.listObjects('hypothesis', spec.runId) as HypothesisCandidate[];
  const validation = checkFemSpec(spec, { hypothesisIds: hypotheses.map((h) => h.id) });
  if (!validation.passed) {
    throw new Error(`fem spec failed validation: ${validation.missing.join('; ')}`);
  }
  const validated: FemSpec = FemSpec.parse({ ...spec, validation });
  store.putObject('fem_spec', validated);
  const specHash = femSpecHash(validated);

  let expRun: ExperimentRun = {
    id: newId('xrun') as ExperimentRun['id'],
    runId: spec.runId,
    specId: spec.id,
    specHash,
    status: 'queued',
    attempts: 1,
    executor: 'local',
    cancelRequested: false,
    resultIds: [],
    statReportIds: [],
    createdAt: now(),
  };
  const persist = (run: ExperimentRun, type: 'experiment_queued' | 'experiment_started' | 'experiment_completed' | 'experiment_failed' | 'experiment_canceled', detail: Record<string, unknown>): void => {
    store.putObjectEvented('experiment_run', run, { type, detail }, now());
    expRun = run;
  };
  persist(expRun, 'experiment_queued', { specId: spec.id, specHash, experimentType: 'numerical_pde' });
  const fail: (message: string, cause?: unknown) => never = (message, cause) => {
    persist({ ...expRun, status: 'failed', error: message, endedAt: now() }, 'experiment_failed', { id: expRun.id, error: message });
    throw new Error(`fem experiment ${expRun.id} failed: ${message}`, cause !== undefined ? { cause } : undefined);
  };

  const sidecar = (opts.sidecar ?? (() => createSidecar()))();
  try {
    let env: Awaited<ReturnType<Sidecar['warmup']>>;
    try {
      env = await sidecar.warmup(spec.compute.timeoutMs);
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e), e);
    }
    const lock = sidecar.lockfileHash();
    persist({
      ...expRun, status: 'running', startedAt: now(),
      environment: { pythonVersion: env.pythonVersion, versions: env.versions, lockfileHash: lock ?? undefined, ...(env.hardware !== undefined ? { hardware: env.hardware } : {}) },
    }, 'experiment_started', { id: expRun.id, experimentType: 'numerical_pde', python: env.pythonVersion, versions: env.versions });

    if (opts.shouldCancel?.()) throw new Error('canceled');
    const adaptive = validated.mode === 'adaptive';
    const r = adaptive
      ? await sidecar.call<FemAdaptiveMeasurement>('fem_poisson_2d_adaptive', {
          manufacturedSolution: validated.manufacturedSolution,
          edges: validated.boundary,
          ...(validated.adaptive ?? FEM_ADAPTIVE_DEFAULTS),
        }, spec.compute.timeoutMs)
      : await sidecar.call<FemMeasurement>('fem_poisson_2d', {
          manufacturedSolution: validated.manufacturedSolution,
          edges: validated.boundary,
          levels: validated.levels ?? [],
        }, spec.compute.timeoutMs);
    if (!r.ok || r.result === undefined) fail(r.error?.message ?? 'fem sidecar op returned no result');
    const m = r.result;
    if (m.manufactured !== validated.manufacturedSolution) {
      fail(`sidecar measurement names a different manufactured solution: ${m.manufactured}`);
    }

    // Measurement table + forcing derivation = content-addressed artifacts.
    const tableRef = (await artifacts.put(JSON.stringify(m, null, 2))).ref;
    store.appendEvent(spec.runId, {
      type: 'note',
      detail: {
        kind: 'fem_measurement',
        experimentRun: expRun.id,
        manufactured: m.manufactured,
        forcing: m.forcing,
        edges: m.edges,
        mode: m.mode,
        ...(m.mode === 'adaptive'
          ? { history: m.history, h1SlopeVsNdof: m.h1SlopeVsNdof, effectivities: m.effectivities }
          : { levels: m.levels, l2Orders: m.l2Orders, h1Orders: m.h1Orders }),
        tableRef,
      },
    }, now());

    // D-086-7 sequential guard, spec-hash scoped (mirror of theory/meta).
    const priorReports = store.listObjects('stat_report', spec.runId) as StatReport[];
    let priorSameSpec = 0;
    for (const rep of priorReports) {
      const producing = store.getObject('experiment_run', rep.experimentRunId) as { specHash?: string } | null;
      if (producing?.specHash === specHash) priorSameSpec += 1;
    }
    const sequential = priorSameSpec > 0;

    const hyp = validated.hypothesisId !== undefined
      ? hypotheses.find((h) => h.id === validated.hypothesisId)
      : undefined;
    const bound = validated.hypothesisId !== undefined && hyp !== undefined;

    // Mode-aware mechanical verdict + reported quantities.
    const mA = m.mode === 'adaptive' ? m : null;
    const mU = m.mode === 'uniform' ? m : null;
    const verdict = sequential ? undefined
      : mA !== null ? femAdaptiveVerdict(mA)
      : mU !== null ? femConvergenceVerdict(mU)
      : undefined;
    const finalLevel = mU !== null
      ? [...mU.levels].reverse().find((lv) => !lv.nonFinite && lv.l2Err !== undefined)
      : undefined;
    const lastRound = mA !== null ? [...mA.history].reverse().find((h) => h.nonFinite !== true && h.h1Err !== undefined) : undefined;
    const pointEstimate = mU !== null ? (finalLevel?.l2Err ?? Number.NaN) : (lastRound?.h1Err ?? Number.NaN);
    const effectValue = mU !== null ? (mU.l2Orders[mU.l2Orders.length - 1] ?? Number.NaN) : (mA?.h1SlopeVsNdof ?? Number.NaN);
    const lastEff = [...(mA?.effectivities ?? [])].reverse().find((e): e is number => e !== null && e !== undefined);
    const measuredLine = mU !== null
      ? `L2 orders [${mU.l2Orders.map((o) => o.toFixed(3)).join(', ')}], H1 orders [${mU.h1Orders.map((o) => o.toFixed(3)).join(', ')}] on levels [${mU.levels.map((lv) => lv.n).join(', ')}]`
      : `H1 slope vs ndof ${mA?.h1SlopeVsNdof?.toFixed(3) ?? '?'} (optimal ${mA?.expectedOptimalSlope}), final effectivity ${lastEff?.toFixed(2) ?? '?'}, ${mA?.history.length ?? 0} rounds`;
    const ruleLine = mU !== null
      ? 'errors strictly decrease AND final L2 order >= 2 - 0.25, final H1 order >= 1 - 0.25'
      : 'H1 strictly decreases AND log-log slope <= -0.5 + 0.1 AND final effectivity <= 10';
    const report: StatReport = {
      id: newId('srep') as StatReport['id'],
      experimentRunId: expRun.id,
      runId: spec.runId,
      comparisonId: 'fem_convergence',
      metricKey: mU !== null ? 'fem_l2_error_final_level' : 'fem_h1_error_final_round',
      primary: true,
      pointEstimate,
      ci: { level: 1, low: pointEstimate, high: pointEstimate },
      test: { kind: 'fem_convergence_order', alpha: 1 },
      effect: { kind: 'observed_order', value: effectValue },
      ...(bound ? { hypothesisId: validated.hypothesisId, hypothesisVersion: hyp!.version } : {}),
      thresholdProvenance: validated.thresholdProvenance,
      ...(verdict !== undefined ? { verdict } : {}),
      secondary: false,
      exploratory: !bound || sequential,
      ...(bound || sequential ? {
        verdictDerivation: [
          `rule: ${ruleLine} [threshold source: ${validated.thresholdProvenance}; rates are theory-fixed, not model-chosen]`,
          `measured: ${measuredLine} (forcing derived exactly: ${m.forcing})`,
          `verdict: ${verdict ?? 'none'}${sequential ? ' (sequential re-run labelled exploratory)' : ''} - ${m.mode} P1 refinement on the unit square; not a certification for other geometries/elements`,
        ].join('; '),
      } : {}),
      analysisIteration: priorSameSpec + 1,
      createdAt: now(),
    };
    store.putObjectEvented('stat_report', report, { type: 'note', detail: { stat_report: report.id, verdict: report.verdict } }, now());

    const feedback: FeedbackSignal[] = [];
    if (bound && hyp !== undefined && !sequential && verdict !== undefined) {
      const sig = FeedbackSignal.parse({
        id: newId('fbk') as FeedbackSignal['id'],
        runId: spec.runId,
        source: 'experiment',
        content: `numerical PDE verification (${m.mode}; u = ${m.manufactured}, edges ${JSON.stringify(m.edges)}): verdict=${verdict} (${measuredLine}; threshold source=${validated.thresholdProvenance})`,
        structured: {
          kind: 'numerical_pde',
          experimentRunId: expRun.id,
          statReportIds: [report.id],
          verdicts: [verdict],
        },
        target: { kind: 'hypothesis', id: hyp.id },
        provenance: `fem-executor:${expRun.id} (spec ${spec.id}@v${spec.version}, hash ${specHash.slice(0, 12)})`,
        receivedAt: now(),
      });
      feedback.push(sig);
      store.putObjectEvented('feedback', sig, { type: 'feedback_received', detail: { feedback: sig.id, source: 'experiment', target: hyp.id } }, now());
    }

    const completed: ExperimentRun = {
      ...expRun, status: 'completed', endedAt: now(),
      statReportIds: [report.id],
    };
    persist(completed, 'experiment_completed', { id: expRun.id, experimentType: 'numerical_pde', verdict: report.verdict, feedback: feedback.length });
    return { run: completed, statReports: [report], feedback, measurement: m };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('canceled')) {
      persist({ ...expRun, status: 'canceled', cancelRequested: true, endedAt: now(), error: 'canceled by operator' }, 'experiment_canceled', { id: expRun.id });
      throw new Error(`fem experiment ${expRun.id} canceled`, { cause: e });
    }
    fail(e instanceof Error ? e.message : String(e), e);
  } finally {
    const logs = sidecar.logs();
    if (logs.length > 0) {
      const logRef = (await artifacts.put(`[fem ${expRun.id}]\n${logs.join('\n')}`)).ref;
      store.putObjectEvented('experiment_run', { ...expRun, trainingLogRef: logRef }, { type: 'note', detail: { trainingLog: logRef } }, now());
    }
    sidecar.close();
  }
};


