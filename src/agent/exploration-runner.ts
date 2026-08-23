import { createHash } from 'node:crypto';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';
import { newId } from '../domain/ids.js';
import { ProvenanceReceipt } from '../domain/index.js';
import { analyzeExplorationCode, type ExplorationVerdict } from './exploratory-codeact.js';
import type { SidecarFactory } from '../experiment/python.js';

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
  /** Injectable for tests; production uses createSidecar(). */
  sidecarFactory: SidecarFactory;
  /** Optional stage label on the receipt (defaults to the agent plane convention). */
  stage?: string;
}

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export const runExploration = async (input: RunExplorationInput): Promise<ExplorationRunResult> => {
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

  const sidecar = input.sidecarFactory();
  try {
    // warmup is best-effort: it verifies the env and caches SidecarEnvInfo, but
    // a family env that answers run_exploration does not need the extra ping.
    await sidecar.warmup(input.maxRuntimeMs).catch(() => undefined);

    // ---- 2. sandboxed execution ----
    const startedAt = Date.now();
    const r = await sidecar.call<{ exploration: { ok: boolean; stdout?: string; stdoutTruncated?: boolean; errorKind?: string; errorMessage?: string } }>(
      'run_exploration',
      { code: input.code },
      input.maxRuntimeMs,
    );
    const durationMs = Date.now() - startedAt;

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
      },
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
      },
    });

    return { gate, execution, artifactRef: artifact.ref, receiptId: full.id };
  } finally {
    sidecar.close();
  }
};
