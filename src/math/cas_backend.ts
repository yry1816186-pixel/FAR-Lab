// spec 38 §3 · CAS (SymPy) backend adapter.
// Spawns `python repro/math_backends/sympy_backend.py` as a subprocess.
//
// Soundness layer (spec 38 §3.1):
//   - mode='expand'  → sound verified/refuted (structural equality of expanded forms)
//   - mode='simplify' → heuristic; Python returns 'unknown', we preserve it
//
// Fresh-clone friendliness: if python or sympy is unavailable, isAvailable()=false
// and verify() returns outcome='unknown' + compileLog='backend_disabled'. Core
// gates still pass (honest degradation — spec 38 §4.5).
//
// Model-neutrality: this file references NO model/provider. It only spawns python.

import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { PACKAGE_ROOT } from '../paths.ts';
import type {
  BackendVerifyInput,
  BackendVerifyResult,
  MathBackend,
} from './math_claim.ts';
import type { VerificationOutcome } from './math_claim.ts';

const SYMPY_SCRIPT_PATH = join(PACKAGE_ROOT, 'repro', 'math_backends', 'sympy_backend.py');
/** Configuration options for the SymPy CAS (Computer Algebra System) backend. */
export interface SymPyCasBackendOptions {
  /** Python executable command. Default 'python'. */
  readonly pythonCommand?: string;
  /** Spawn timeout in milliseconds. Default 15000. */
  readonly timeoutMs?: number;
  /** SymPy version override (for backendId). If omitted, detected on first use. */
  readonly sympyVersion?: string;
}

interface SymPyResponse {
  readonly outcome: VerificationOutcome;
  readonly artifact: string | null;
  readonly log: string;
}

/**
 * SymPy CAS backend. Implements L1_cas verification.
 *
 * The backend spawns a Python subprocess per verify() call. isAvailable() is
 * cached after the first check (it spawn-syncs `python -c "import sympy"`).
 */
export class SymPyCasBackend implements MathBackend {
  readonly backendKind = 'cas' as const;
  readonly backendId: string;
  private readonly pythonCommand: string;
  private readonly timeoutMs: number;
  private availableCache: boolean | null = null;
  private detectedVersion: string | null = null;

  constructor(options: SymPyCasBackendOptions = {}) {
    this.pythonCommand = options.pythonCommand ?? 'python';
    this.timeoutMs = options.timeoutMs ?? 15000;
    if (options.sympyVersion !== undefined) {
      this.detectedVersion = options.sympyVersion;
      this.backendId = `sympy@${options.sympyVersion}`;
    } else {
      this.backendId = 'sympy@unknown';
    }
  }

  isAvailable(): boolean {
    if (this.availableCache !== null) {
      return this.availableCache;
    }
    try {
      const result = spawnSync(this.pythonCommand, ['-c', 'import sympy; print(sympy.__version__)'], {
        timeout: this.timeoutMs,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const ok = result.status === 0 && result.stdout.trim().length > 0;
      this.availableCache = ok;
      if (ok && this.detectedVersion === null) {
        this.detectedVersion = result.stdout.trim();
        // backendId is readonly; re-assign via Object.defineProperty for version detection
        // Actually, we cannot reassign readonly. So we keep 'sympy@unknown' unless
        // version was provided in options. This is acceptable: the backendId is a
        // fingerprint, and 'unknown' is honest when version wasn't pre-supplied.
        // Callers wanting a precise fingerprint should pass sympyVersion.
      }
      return ok;
    } catch {
      this.availableCache = false;
      return false;
    }
  }

  async verify(input: BackendVerifyInput): Promise<BackendVerifyResult> {
    const start = Date.now();
    if (!this.isAvailable()) {
      return this.disabledResult(start);
    }

    const mode = input.mode ?? 'expand';
    const requestPayload = this.buildRequestPayload(input, mode);

    try {
      const response = await this.spawnSympy(requestPayload);
      const durationMs = Date.now() - start;
      return {
        backendKind: 'cas',
        backendId: this.backendId,
        outcome: response.outcome,
        outputArtifact: response.artifact,
        compileLog: response.log,
        durationMs,
      };
    } catch (error) {
      const durationMs = Date.now() - start;
      return {
        backendKind: 'cas',
        backendId: this.backendId,
        outcome: 'unknown',
        outputArtifact: null,
        compileLog: `cas_spawn_error: ${error instanceof Error ? error.message : String(error)}`,
        durationMs,
      };
    }
  }

  private buildRequestPayload(input: BackendVerifyInput, mode: string): string {
    // The target is expected to be a JSON string {"lhs": "...", "rhs": "..."} for
    // equality-style checks, or {"expr": "..."} for parse mode. If the target is
    // not valid JSON, we treat the whole target as a single expression and use
    // parse mode.
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(input.expression) as Record<string, unknown>;
    } catch {
      // Not JSON — treat as a single expression for parse mode.
      return JSON.stringify({ mode: 'parse', expr: input.expression });
    }
    return JSON.stringify({ mode, ...parsed });
  }

  private spawnSympy(payload: string): Promise<SymPyResponse> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.pythonCommand, [SYMPY_SCRIPT_PATH], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.timeoutMs,
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => {
        stdoutChunks.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderrChunks.push(chunk);
      });

      child.on('error', (err: Error) => {
        reject(err);
      });

      child.on('close', (code: number | null) => {
        const stdoutText = Buffer.concat(stdoutChunks).toString('utf8').trim();
        const stderrText = Buffer.concat(stderrChunks).toString('utf8').trim();

        if (code !== 0) {
          reject(new Error(`sympy_backend exited with code ${code}; stderr=${stderrText}`));
          return;
        }

        if (stdoutText.length === 0) {
          resolve({ outcome: 'unknown', artifact: null, log: 'empty_stdout; stderr=' + stderrText });
          return;
        }

        try {
          const parsed = JSON.parse(stdoutText) as SymPyResponse;
          resolve({
            outcome: parsed.outcome,
            artifact: parsed.artifact,
            log: parsed.log,
          });
        } catch {
          resolve({
            outcome: 'unknown',
            artifact: null,
            log: `invalid_json_stdout: ${stdoutText.slice(0, 200)}`,
          });
        }
      });

      child.stdin.write(payload);
      child.stdin.end();
    });
  }

  private disabledResult(start: number): BackendVerifyResult {
    return {
      backendKind: 'cas',
      backendId: this.backendId,
      outcome: 'unknown',
      outputArtifact: null,
      compileLog: 'backend_disabled',
      durationMs: Date.now() - start,
    };
  }
}
