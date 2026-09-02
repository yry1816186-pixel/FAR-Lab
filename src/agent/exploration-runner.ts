import { createHash } from 'node:crypto';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';
import { newId } from '../domain/ids.js';
import { ProvenanceReceipt } from '../domain/index.js';
import { analyzeExplorationCode, type ExplorationVerdict } from './exploratory-codeact.js';
import { createExplorationSandbox } from '../experiment/exploration-sandbox.js';
import type { SandboxAttestation, Sidecar } from '../experiment/python.js';

/**
 * Exploratory CodeAct execution wiring (AVO fusion G4, execution half).
 *
 * Pipeline: TS static gate -> sidecar sandbox (run_exploration op, restricted
 * namespace) -> stdout artifact + tool_exec receipt + audit event.
 *
 * Authority rules (AGENTS.md §5/§7):
 * - The gate verdict is computed HERE and enforced BEFORE any process spawn —
 *   a gate failure never reaches the sandbox layer (fail-closed).
 * - Runtime failures inside the sandbox are RESULTS (candidate findings), not
 *   exceptions: a failed analysis is scientific information and is audited.
 * - Outputs are CANDIDATE findings. Nothing here writes hypotheses, claims,
 *   specs or verdicts — promotion stays behind the existing deterministic gates.
 */

export interface ExplorationRunResult {
  gate: ExplorationVerdict;
  execution: {
    ok: boolean;
    stdout?: string;
    stdoutTruncated?: boolean;
    errorKind?: string;
    errorMessage?: string;
  };
  artifactRef?: string;
  receiptId?: string;
}

export interface RunExplorationInput {
  store: Store;
  runId: string;
  artifacts: ArtifactStore;
  /** Why this exploration advances the current scientific state. */
  purpose: string;
  /** Agent-authored analysis Python (exploration allowlist applies). */
  code: string;
  /** Hard wall-clock bound passed to the sidecar call. */
  maxRuntimeMs: number;
  /** Cooperative cancellation polled while the sidecar is warming up or executing. */
  signal?: { readonly aborted: boolean };
  /** Optional stage label on the receipt (defaults to the agent plane convention). */
  stage?: string;
}

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

const makeAbortError = (): Error => {
  const error = new Error('exploration aborted by caller');
  error.name = 'AbortError';
  return error;
};

const isAborted = (signal: { readonly aborted: boolean } | undefined): boolean => signal?.aborted === true;

/** Poll the run-backed cancellation view and close the sidecar before rejecting. */
const awaitWithCooperativeAbort = async <T>(
  operation: () => Promise<T>,
  signal: { readonly aborted: boolean } | undefined,
  onAbort: () => void,
): Promise<T> => {
  if (signal === undefined) return operation();

  const abort = (): Error => {
    const cancellation = makeAbortError();
    try {
      onAbort();
      return cancellation;
    } catch (cleanupError) {
      return new AggregateError(
        [cancellation, cleanupError],
        `${cancellation.message}; sidecar cleanup also failed`,
        { cause: cleanupError },
      );
    }
  };

  if (signal.aborted) throw abort();

  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const poll = setInterval(() => {
      if (!signal.aborted || settled) return;
      const error = abort();
      settled = true;
      clearInterval(poll);
      reject(error);
    }, 10);

    const settle = (finish: () => void): void => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      finish();
    };

    let pending: Promise<T>;
    try {
      pending = operation();
    } catch (error) {
      settle(() => reject(error));
      return;
    }
    // A later rejection after abort/close is consumed here rather than becoming
    // an unhandled rejection from the underlying sidecar promise.
    pending.then(
      (value) => settle(() => resolve(value)),
      (error) => settle(() => reject(error)),
    );
    if (signal.aborted && !settled) {
      const error = abort();
      settled = true;
      clearInterval(poll);
      reject(error);
    }
  });
};

const receiptSandbox = (attestation: SandboxAttestation) => {
  const facts = {
    backend: attestation.backend,
    imageRef: attestation.imageRef,
    imageId: attestation.imageId,
    policyHash: attestation.policyHash,
    policyVersion: attestation.policyVersion,
    uid: attestation.uid,
    gid: attestation.gid,
    noNewPrivs: attestation.noNewPrivs,
    seccompMode: attestation.seccompMode,
    capEff: attestation.capEff,
    rootfsReadOnly: attestation.rootfsReadOnly,
    tmpWritable: attestation.tmpWritable,
    networkDisabled: attestation.networkDisabled,
    cgroup: attestation.cgroup,
  };
  return { ...facts, attestationHash: sha256(JSON.stringify(facts)) };
};

export const runExploration = async (input: RunExplorationInput): Promise<ExplorationRunResult> => {
  if (isAborted(input.signal)) throw makeAbortError();

  // ---- 1. static gate (fail-closed: no sidecar is ever spawned on violation) ----
  const gate = analyzeExplorationCode({
    code: input.code,
    purpose: input.purpose,
    maxRuntimeMs: input.maxRuntimeMs,
  });
  if (!gate.allowed) {
    const codes = gate.violations.map((v) => v.code).join(',');
    throw new Error(`exploration gate rejected code [${codes}]: ${gate.violations.map((v) => v.message).join('; ')}`);
  }

  if (isAborted(input.signal)) throw makeAbortError();
  // The production runner owns the trust root. Test doubles can replace this
  // module boundary in an isolated test worker, but a runtime caller cannot
  // supply a host process that merely reports attestation-shaped data.
  const sidecar: Sidecar = createExplorationSandbox();
  let sidecarClosed = false;
  const closeSidecar = (): void => {
    if (sidecarClosed) return;
    sidecar.close();
    sidecarClosed = true;
  };
  try {
    // Attestation is mandatory and precedes the first byte of untrusted code.
    await awaitWithCooperativeAbort(
      () => sidecar.warmup(input.maxRuntimeMs),
      input.signal,
      closeSidecar,
    );
    if (isAborted(input.signal)) {
      closeSidecar();
      throw makeAbortError();
    }
    const attestation = sidecar.sandboxAttestation?.() ?? null;
    if (attestation === null) throw new Error('exploration execution requires a verified OS sandbox; host sidecars are refused');
    const sandbox = receiptSandbox(attestation);

    // ---- 2. sandboxed execution ----
    const startedAt = Date.now();
    const r = await awaitWithCooperativeAbort(
      () => sidecar.call<{ exploration: { ok: boolean; stdout?: string; stdoutTruncated?: boolean; errorKind?: string; errorMessage?: string } }>(
        'run_exploration',
        { code: input.code },
        input.maxRuntimeMs,
      ),
      input.signal,
      closeSidecar,
    );
    const durationMs = Date.now() - startedAt;

    if (isAborted(input.signal)) {
      closeSidecar();
      throw makeAbortError();
    }

    if (!r.ok || r.result === undefined) {
      // Protocol-level error (allowlist/parse escape that slipped the TS gate —
      // should be impossible; if it happens, it is loud and visible).
      throw new Error(`sidecar run_exploration failed: ${r.error?.message ?? 'no result'}`);
    }
    const execution = r.result.exploration;

    // ---- 3. provenance: stdout artifact + receipt + audit event ----
    const stdoutText = execution.stdout ?? '';
    const artifact = await input.artifacts.put(stdoutText);

    const outputFingerprint = sha256(JSON.stringify({ ok: execution.ok, stdoutHash: sha256(stdoutText) }));
    // P2 fix (adversarial review 06): inputHash must be sha256 of the RAW code —
    // gate.codeHash already is exactly that; double-hashing broke verifiability.
    const inputHash = gate.codeHash;

    const receipt = {
      id: newId('rcp'),
      kind: 'tool_exec' as const,
      executionMode: 'live' as const,
      toolExec: {
        tool: 'run_exploration',
        inputHash,
        outputHash: outputFingerprint,
        durationMs,
        sandbox,
      },
      environmentFingerprint: `${attestation.backend} ${attestation.imageId} policy:${attestation.policyHash}`,
      stage: input.stage ?? 'agent:exploration',
    };
    // Persist via the store's receipt schema (same discipline as the
    // orchestrator's recordReceipt): zod parse, never a type escape.
    const full = ProvenanceReceipt.parse({
      ...receipt,
      runId: input.runId,
      at: new Date().toISOString(),
      redactionNote: 'raw prompts/responses not retained; hashes only',
    });
    input.store.putObject('receipt', full);

    const noteReason = execution.ok ? 'exploration_completed' : 'exploration_failed';
    input.store.appendEvent(input.runId, {
      type: 'note',
      detail: {
        reason: noteReason,
        purpose: input.purpose,
        codeHash: gate.codeHash,
        artifactRef: artifact.ref,
        ok: execution.ok,
        ...(execution.errorKind !== undefined ? { errorKind: execution.errorKind, errorMessage: execution.errorMessage } : {}),
        durationMs,
        sandbox: {
          backend: attestation.backend,
          imageId: attestation.imageId,
          policyHash: attestation.policyHash,
          attestationHash: sandbox.attestationHash,
        },
      },
    });

    return { gate, execution, artifactRef: artifact.ref, receiptId: full.id };
  } finally {
    closeSidecar();
  }
};
