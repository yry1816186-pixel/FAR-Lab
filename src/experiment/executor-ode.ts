import { createHash } from 'node:crypto';
import { canonicalJson } from '../shared/crypto.js';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';
import {
  newId,
  OdeSpec,
  checkOdeSpec,
  odeIntegrationVerdict,
  FeedbackSignal,
  type ExperimentRun,
  type StatReport,
  type HypothesisCandidate,
} from '../domain/index.js';
import { createSidecar, type Sidecar } from './python.js';

/**
 * Wave B ODE executor: the numerical falsification path for preregistered
 * initial-value problems. The sidecar's `ode_integrate` op (scipy solve_ivp,
 * whitelisted-AST expression DATA, never eval) integrates the system with the
 * preregistered method/tolerances and — when the spec carries a closed-form
 * analytical solution — reports max |y_num − y_analytic| on the preregistered
 * sampling grid. The verdict is mechanical; the LLM only DRAFTED the spec
 * inside the closed expression space, gated by checkOdeSpec before any spend.
 *
 * Authority mirrors executor-theory/executor-fem: one sidecar call per spec
 * (the integration covers every claim), trajectories + logs as
 * content-addressed artifacts, hypothesis-bound claims need a covering
 * approval, re-running the same spec hash is labelled exploratory.
 */

export interface OdeExecuteOptions {
  shouldCancel?: () => boolean;
  sidecar?: () => Sidecar;
  now?: () => string;
}

export interface ExecutedOde {
  run: ExperimentRun;
  statReports: StatReport[];
  feedback: FeedbackSignal[];
}

export const odeSpecHash = (spec: OdeSpec): string =>
  createHash('sha256').update(canonicalJson(spec)).digest('hex');

interface OdeIntegrateResult {
  status: 'ok' | 'failed';
  message?: string;
  method: string;
  rtol: number;
  atol: number;
  tSpan: [number, number];
  samplePoints: number;
  nfev: number;
  maxAbsResidual: number | null;
  rmsResidual: number | null;
  hasAnalytical: boolean;
  trajectories: Record<string, Array<number | null>>;
  nonFinitePoints: number;
}

export const executeOdeAnalysis = async (
  store: Store,
  artifacts: ArtifactStore,
  spec: OdeSpec,
  opts: OdeExecuteOptions = {},
): Promise<ExecutedOde> => {
  const now = opts.now ?? (() => new Date().toISOString());

  // 1. Fail-closed validation gate BEFORE any spend.
  const hypotheses = store.listObjects('hypothesis', spec.runId) as HypothesisCandidate[];
  const validation = checkOdeSpec(spec, { hypothesisIds: hypotheses.map((h) => h.id) });
  if (!validation.passed) {
    throw new Error(`ode spec failed validation: ${validation.missing.join('; ')}`);
  }
  const validated: OdeSpec = OdeSpec.parse({ ...spec, validation });
  store.putObject('ode_spec', validated);
  const specHash = odeSpecHash(validated);

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
  persist(expRun, 'experiment_queued', { specId: spec.id, specHash, experimentType: 'ode_integration' });
  // Audit W1 shape: one failure, one event; fail() throws and the outer catch rethrows.
  let failedOnce = false;
  const fail: (message: string, cause?: unknown) => never = (message, cause) => {
    if (!failedOnce) {
      failedOnce = true;
      persist({ ...expRun, status: 'failed', error: message, endedAt: now() }, 'experiment_failed', { id: expRun.id, error: message });
    }
    throw new Error(`ode experiment ${expRun.id} failed: ${message}`, cause !== undefined ? { cause } : undefined);
  };

  const sidecar = (opts.sidecar ?? (() => createSidecar()))();
  try {
    if (opts.shouldCancel?.()) throw new Error('canceled');
    const env = await sidecar.warmup(spec.compute.timeoutMs);
    const lock = sidecar.lockfileHash();
    persist({
      ...expRun, status: 'running', startedAt: now(),
      environment: { pythonVersion: env.pythonVersion, versions: env.versions, lockfileHash: lock ?? undefined, ...(env.hardware !== undefined ? { hardware: env.hardware } : {}) },
    }, 'experiment_started', { id: expRun.id, experimentType: 'ode_integration', python: env.pythonVersion, versions: env.versions });

    const r = await sidecar.call<OdeIntegrateResult>('ode_integrate', {
      stateVariables: validated.stateVariables.map((v) => ({ name: v.name, rhs: v.rhs, y0: v.y0 })),
      tSpan: validated.tSpan,
      method: validated.method,
      rtol: validated.rtol,
      atol: validated.atol,
      samplePoints: validated.samplePoints,
      ...(validated.analyticalSolution !== undefined
        ? { analyticalSolution: validated.analyticalSolution.map((a) => ({ name: a.name, expr: a.expr })) }
        : {}),
    }, spec.compute.timeoutMs);
    if (!r.ok || r.result === undefined) fail(r.error?.message ?? 'ode_integrate returned no result');
    const res = r.result;
    if (res.status !== 'ok') fail(res.message ?? 'ode_integrate did not succeed');
    if (res.method !== validated.method || res.samplePoints !== validated.samplePoints) {
      fail(`ode_integrate echo mismatch: method=${res.method}/${validated.method} points=${res.samplePoints}/${validated.samplePoints}`);
    }

    const trajectoryRef = (await artifacts.put(JSON.stringify(res.trajectories))).ref;
    store.appendEvent(spec.runId, {
      type: 'note',
      detail: {
        kind: 'ode_integration',
        method: res.method,
        tSpan: res.tSpan,
        nfev: res.nfev,
        maxAbsResidual: res.maxAbsResidual,
        rmsResidual: res.rmsResidual,
        hasAnalytical: res.hasAnalytical,
        nonFinitePoints: res.nonFinitePoints,
        trajectoryRef,
      },
    }, now());

    // D-086-7 sequential guard, hash-scoped per claim (mirror of theory/meta).
    const priorReports = store.listObjects('stat_report', spec.runId) as StatReport[];
    const priorCount = new Map<string, number>();
    for (const p of priorReports) {
      const producing = store.getObject('experiment_run', p.experimentRunId) as { specHash?: string } | null;
      if (producing?.specHash === specHash) priorCount.set(p.comparisonId, (priorCount.get(p.comparisonId) ?? 0) + 1);
    }

    const statReports: StatReport[] = [];
    const feedback: FeedbackSignal[] = [];
    for (const claim of validated.claims) {
      const bound = claim.hypothesisId !== undefined;
      const hyp = bound ? hypotheses.find((h) => h.id === claim.hypothesisId) : undefined;
      const sequential = (priorCount.get(claim.id) ?? 0) > 0;
      const verdict = bound && hyp !== undefined && !sequential
        ? odeIntegrationVerdict({
          hasAnalytical: res.hasAnalytical,
          nonFinitePoints: res.nonFinitePoints,
          maxAbsResidual: res.maxAbsResidual,
          tolerance: claim.tolerance,
        })
        : undefined;
      const report: StatReport = {
        id: newId('srep') as StatReport['id'],
        experimentRunId: expRun.id,
        runId: spec.runId,
        comparisonId: claim.id,
        metricKey: 'ode_max_abs_residual',
        primary: claim.primary,
        pointEstimate: res.maxAbsResidual ?? Number.NaN,
        // Deterministic grid comparison: degenerate interval (float evaluation only).
        ci: { level: 1, low: res.maxAbsResidual ?? Number.NaN, high: res.maxAbsResidual ?? Number.NaN },
        test: { kind: 'ode_analytical_grid', alpha: 1 },
        effect: { kind: 'identity_residual', value: res.maxAbsResidual ?? Number.NaN },
        ...(bound && hyp !== undefined ? { hypothesisId: claim.hypothesisId, hypothesisVersion: hyp.version } : {}),
        thresholdProvenance: claim.thresholdProvenance,
        ...(verdict !== undefined ? { verdict } : {}),
        secondary: false,
        ...(bound ? {
          verdictDerivation: [
            `rule: max|y_num - y_analytic| < tolerance ${claim.tolerance} [threshold source: ${claim.thresholdProvenance}]`,
            `measured: ${res.hasAnalytical
              ? `max=${(res.maxAbsResidual ?? Number.NaN).toExponential(4)} rms=${(res.rmsResidual ?? Number.NaN).toExponential(4)} over ${res.samplePoints} sample points (${res.nonFinitePoints} non-finite; method=${res.method}, rtol=${res.rtol})`
              : 'no analytical solution in spec — not falsifiable numerically by construction'}`,
            `verdict: ${verdict ?? 'none'}${sequential ? ' (sequential re-check labelled exploratory)' : ''} — NUMERICAL INTEGRATION against the preregistered analytical solution, not a symbolic proof`,
          ].join('; '),
        } : {}),
        exploratory: !bound || sequential,
        analysisIteration: (priorCount.get(claim.id) ?? 0) + 1,
        createdAt: now(),
      };
      statReports.push(report);
      store.putObjectEvented('stat_report', report, { type: 'note', detail: { stat_report: report.id, claim: claim.id, verdict: report.verdict } }, now());

      if (bound && hyp !== undefined && !sequential && verdict !== undefined) {
        const sig = FeedbackSignal.parse({
          id: newId('fbk') as FeedbackSignal['id'],
          runId: spec.runId,
          source: 'experiment',
          content: `ode claim ${claim.id} (${claim.label}): verdict=${verdict} (max|y_num-y_analytic|=${res.hasAnalytical ? (res.maxAbsResidual ?? Number.NaN).toExponential(4) : 'n/a'}, tolerance=${claim.tolerance}, method=${res.method}, ${res.samplePoints} sample points, threshold source=${claim.thresholdProvenance}) — numerical integration, not a symbolic proof`,
          structured: {
            kind: 'ode_integration',
            experimentRunId: expRun.id,
            statReportIds: [report.id],
            verdicts: [verdict],
          },
          target: { kind: 'hypothesis', id: hyp.id },
          provenance: `ode-executor:${expRun.id} (spec ${spec.id}@v${spec.version}, hash ${specHash.slice(0, 12)})`,
          receivedAt: now(),
        });
        feedback.push(sig);
        store.putObjectEvented('feedback', sig, { type: 'feedback_received', detail: { feedback: sig.id, source: 'experiment', target: hyp.id } }, now());
      }
    }

    const completed: ExperimentRun = {
      ...expRun, status: 'completed', endedAt: now(),
      statReportIds: statReports.map((r2) => r2.id),
    };
    persist(completed, 'experiment_completed', { id: expRun.id, experimentType: 'ode_integration', statReports: statReports.length, feedback: feedback.length });
    return { run: completed, statReports, feedback };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('canceled')) {
      persist({ ...expRun, status: 'canceled', cancelRequested: true, endedAt: now(), error: 'canceled by operator' }, 'experiment_canceled', { id: expRun.id });
      throw new Error(`ode experiment ${expRun.id} canceled`, { cause: e });
    }
    if (failedOnce) throw e; // already recorded by fail() — no second experiment_failed event
    fail(e instanceof Error ? e.message : String(e), e);
  } finally {
    const logs = sidecar.logs();
    if (logs.length > 0) {
      const logRef = (await artifacts.put(`[ode ${expRun.id}]\n${logs.join('\n')}`)).ref;
      store.putObjectEvented('experiment_run', { ...expRun, trainingLogRef: logRef }, { type: 'note', detail: { trainingLog: logRef } }, now());
    }
    sidecar.close();
  }
};
