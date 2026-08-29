import { createHash } from 'node:crypto';
import { canonicalJson } from '../shared/crypto.js';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';
import {
  newId,
  TheorySpec,
  checkTheorySpec,
  theoryIdentityVerdict,
  FeedbackSignal,
  type ExperimentRun,
  type StatReport,
  type HypothesisCandidate,
} from '../domain/index.js';
import { createSidecar, type Sidecar } from './python.js';

/**
 * Slice-5 theory executor: the theory-type falsification path. A preregistered
 * TheorySpec's identity claims are evaluated NUMERICALLY on the preregistered
 * grid by the real sidecar (`identity_check`: whitelisted-AST expression DATA,
 * never eval); the verdict is mechanical (max |lhs-rhs| vs tolerance, honestly
 * labelled a numerical spot-check — never a symbolic proof). No LLM runs at
 * execution time: the model only DRAFTED the spec inside a closed expression
 * space, and checkTheorySpec gated it deterministically before any spend.
 *
 * Authority mirrors executor-meta/executor-simulation: experiment_run = terminal
 * projection + audit events; residual arrays + sidecar logs = content-addressed
 * artifacts; hypothesis-bound claims need a covering approval; re-running the
 * same spec hash is labelled exploratory (data-peeking discipline, D-086-7).
 */

export interface TheoryExecuteOptions {
  shouldCancel?: () => boolean;
  sidecar?: () => Sidecar;
  now?: () => string;
}

export interface ExecutedTheory {
  run: ExperimentRun;
  statReports: StatReport[];
  feedback: FeedbackSignal[];
}

export const theorySpecHash = (spec: TheorySpec): string =>
  createHash('sha256').update(canonicalJson(spec)).digest('hex');

interface IdentityCheckResult {
  maxAbsResidual: number;
  meanAbsResidual: number;
  nPoints: number;
  nonFinitePoints: number;
  worstPoint: Record<string, number>;
  residuals: number[];
}

const describeWorst = (worst: Record<string, number>): string =>
  Object.entries(worst).map(([k, v]) => `${k}=${Number.isInteger(v) ? String(v) : v.toFixed(4)}`).join(', ');

export const executeTheoryAnalysis = async (
  store: Store,
  artifacts: ArtifactStore,
  spec: TheorySpec,
  opts: TheoryExecuteOptions = {},
): Promise<ExecutedTheory> => {
  const now = opts.now ?? (() => new Date().toISOString());

  // 1. Fail-closed validation gate BEFORE any spend (lexical/free-variable/grid/approvals).
  const hypotheses = store.listObjects('hypothesis', spec.runId) as HypothesisCandidate[];
  const validation = checkTheorySpec(spec, { hypothesisIds: hypotheses.map((h) => h.id) });
  if (!validation.passed) {
    throw new Error(`theory spec failed validation: ${validation.missing.join('; ')}`);
  }
  const validated: TheorySpec = TheorySpec.parse({ ...spec, validation });
  store.putObject('theory_spec', validated);
  const specHash = theorySpecHash(validated);
  const expectedPoints = validated.variables.reduce((a, v) => a * v.n, 1);

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
  persist(expRun, 'experiment_queued', { specId: spec.id, specHash, experimentType: 'theory_identity' });
  const fail: (message: string, cause?: unknown) => never = (message, cause) => {
    persist({ ...expRun, status: 'failed', error: message, endedAt: now() }, 'experiment_failed', { id: expRun.id, error: message });
    throw new Error(`theory experiment ${expRun.id} failed: ${message}`, cause !== undefined ? { cause } : undefined);
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
    }, 'experiment_started', { id: expRun.id, experimentType: 'theory_identity', python: env.pythonVersion, versions: env.versions });

    // D-086-7 sequential guard, hash-scoped per claim (mirror of the meta executor):
    // re-running the SAME analysis is labelled exploratory; a genuinely new
    // preregistered spec has a different hash and is confirmatory.
    const priorReports = store.listObjects('stat_report', spec.runId) as StatReport[];
    const priorCount = new Map<string, number>(); // claimId -> prior reports on THIS spec hash
    for (const r of priorReports) {
      const producing = store.getObject('experiment_run', r.experimentRunId) as { specHash?: string } | null;
      if (producing?.specHash === specHash) priorCount.set(r.comparisonId, (priorCount.get(r.comparisonId) ?? 0) + 1);
    }

    const statReports: StatReport[] = [];
    const feedback: FeedbackSignal[] = [];
    for (const claim of validated.claims) {
      if (opts.shouldCancel?.()) throw new Error('canceled');
      const r = await sidecar.call<IdentityCheckResult>('identity_check', {
        lhs: claim.lhs,
        rhs: claim.rhs,
        variables: validated.variables.map((v) => ({ name: v.name, low: v.low, high: v.high, n: v.n })),
      }, spec.compute.timeoutMs);
      if (!r.ok || r.result === undefined) fail(r.error?.message ?? 'identity_check returned no result');
      const res = r.result;
      if (res.nPoints !== expectedPoints) {
        fail(`identity_check point-count mismatch for ${claim.id}: ${res.nPoints} != ${expectedPoints}`);
      }
      const residualRef = (await artifacts.put(JSON.stringify(res.residuals))).ref;
      store.appendEvent(spec.runId, {
        type: 'note',
        detail: { kind: 'theory_claim', claim: claim.id, label: claim.label, maxAbsResidual: res.maxAbsResidual, meanAbsResidual: res.meanAbsResidual, nonFinitePoints: res.nonFinitePoints, nPoints: res.nPoints, worstPoint: res.worstPoint, residualRef },
      }, now());

      const bound = claim.hypothesisId !== undefined;
      const hyp = bound ? hypotheses.find((h) => h.id === claim.hypothesisId) : undefined;
      const sequential = (priorCount.get(claim.id) ?? 0) > 0;
      const verdict = bound && hyp !== undefined && !sequential
        ? theoryIdentityVerdict({ maxAbsResidual: res.maxAbsResidual, nonFinitePoints: res.nonFinitePoints, tolerance: claim.tolerance })
        : undefined;
      const report: StatReport = {
        id: newId('srep') as StatReport['id'],
        experimentRunId: expRun.id,
        runId: spec.runId,
        comparisonId: claim.id,
        metricKey: 'identity_max_abs_residual',
        primary: claim.primary,
        pointEstimate: res.maxAbsResidual,
        // Deterministic grid evaluation: the interval is degenerate (exact value,
        // no sampling uncertainty — float evaluation only). Disclosed in the derivation.
        ci: { level: 1, low: res.maxAbsResidual, high: res.maxAbsResidual },
        test: { kind: 'identity_grid', alpha: 1 },
        effect: { kind: 'identity_residual', value: res.maxAbsResidual },
        ...(bound && hyp !== undefined ? { hypothesisId: claim.hypothesisId, hypothesisVersion: hyp.version } : {}),
        thresholdProvenance: claim.thresholdProvenance,
        ...(verdict !== undefined ? { verdict } : {}),
        secondary: false,
        ...(bound ? {
          verdictDerivation: [
            `rule: max|lhs-rhs| < tolerance ${claim.tolerance} [threshold source: ${claim.thresholdProvenance}]`,
            `measured: max=${res.maxAbsResidual.toExponential(4)} mean=${res.meanAbsResidual.toExponential(4)} over ${res.nPoints} grid points (${res.nonFinitePoints} non-finite; worst at ${describeWorst(res.worstPoint)})`,
            `verdict: ${verdict ?? 'none'}${sequential ? ' (sequential re-check labelled exploratory)' : ''} — NUMERICAL SPOT-CHECK on the preregistered grid, not a symbolic proof`,
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
          content: `theory identity claim ${claim.id} (${claim.label}): verdict=${verdict} (max|lhs-rhs|=${res.maxAbsResidual.toExponential(4)}, tolerance=${claim.tolerance}, ${res.nPoints} grid points, ${res.nonFinitePoints} non-finite, threshold source=${claim.thresholdProvenance}) — numerical spot-check, not a symbolic proof`,
          structured: {
            kind: 'theory_identity',
            experimentRunId: expRun.id,
            statReportIds: [report.id],
            verdicts: [verdict],
          },
          target: { kind: 'hypothesis', id: hyp.id },
          provenance: `theory-executor:${expRun.id} (spec ${spec.id}@v${spec.version}, hash ${specHash.slice(0, 12)})`,
          receivedAt: now(),
        });
        feedback.push(sig);
        store.putObjectEvented('feedback', sig, { type: 'feedback_received', detail: { feedback: sig.id, source: 'experiment', target: hyp.id } }, now());
      }
    }

    const completed: ExperimentRun = {
      ...expRun, status: 'completed', endedAt: now(),
      statReportIds: statReports.map((r) => r.id),
    };
    persist(completed, 'experiment_completed', { id: expRun.id, experimentType: 'theory_identity', statReports: statReports.length, feedback: feedback.length });
    return { run: completed, statReports, feedback };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('canceled')) {
      persist({ ...expRun, status: 'canceled', cancelRequested: true, endedAt: now(), error: 'canceled by operator' }, 'experiment_canceled', { id: expRun.id });
      throw new Error(`theory experiment ${expRun.id} canceled`, { cause: e });
    }
    fail(e instanceof Error ? e.message : String(e), e);
  } finally {
    const logs = sidecar.logs();
    if (logs.length > 0) {
      const logRef = (await artifacts.put(`[theory ${expRun.id}]\n${logs.join('\n')}`)).ref;
      store.putObjectEvented('experiment_run', { ...expRun, trainingLogRef: logRef }, { type: 'note', detail: { trainingLog: logRef } }, now());
    }
    sidecar.close();
  }
};
