// spec 38 §3.3 · Formal (Lean 4) backend adapter.
// Spawns the `lean` compiler to type-check / elaborate a Lean 4 source file.
//
// Lean 4 is almost never available in fresh-clone environments. By design this
// backend degrades to outcome='unknown' + compileLog='backend_disabled' when
// the `lean` binary is not on PATH (spec 38 §4.5 honest degradation).
//
// When available, the target string is treated as a Lean 4 source snippet. The
// backend writes it to a temp .lean file and runs `lean <file>`. A clean exit
// (no errors, "no goals" or no output) → verified. A compile error mentioning
// "goals left" or a type mismatch → refuted. Any other error → unknown.
//
// Model-neutrality: this file references NO model/provider.

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  BackendVerifyInput,
  BackendVerifyResult,
  MathBackend,
} from './math_claim.ts';
/** Configuration options for the Lean 4 formal verification backend. */
export interface Lean4FormalBackendOptions {
  readonly leanCommand?: string;
  readonly timeoutMs?: number;
  readonly versionOverride?: string;
}
/** Lean 4 formal verification backend (spec 38 S3.3).
 * Spawns the lean compiler on a temp .lean file. Degrades to
 * outcome='unknown' when the lean binary is not on PATH. */
export class Lean4FormalBackend implements MathBackend {
  readonly backendKind = 'lean4' as const;
  readonly backendId: string;
  private readonly leanCommand: string;
  private readonly timeoutMs: number;
  private availableCache: boolean | null = null;

  constructor(options: Lean4FormalBackendOptions = {}) {
    this.leanCommand = options.leanCommand ?? 'lean';
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.backendId = options.versionOverride !== undefined ? `lean4@${options.versionOverride}` : 'lean4@unknown';
  }

  isAvailable(): boolean {
    if (this.availableCache !== null) {
      return this.availableCache;
    }
    try {
      const result = spawnSync(this.leanCommand, ['--version'], {
        timeout: this.timeoutMs,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      this.availableCache = result.status === 0;
      return this.availableCache;
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
    if (input.expression.length === 0) {
      return {
        backendKind: 'lean4',
        backendId: this.backendId,
        outcome: 'unknown',
        outputArtifact: null,
        compileLog: 'empty_lean_source',
        durationMs: Date.now() - start,
      };
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'far-chain-lean-'));
    const leanFile = join(tempDir, 'claim.lean');
    try {
      writeFileSync(leanFile, input.expression, 'utf8');
      const result = spawnSync(this.leanCommand, [leanFile], {
        timeout: this.timeoutMs,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const stdout = result.stdout ?? '';
      const stderr = result.stderr ?? '';
      const combined = stdout + stderr;
      const durationMs = Date.now() - start;

      // Lean exit code 0 with no error output → verified (no goals remaining).
      // Error output containing "type mismatch" or "goals" → refuted.
      // Anything else → unknown.
      if (result.status === 0 && stderr.trim().length === 0) {
        return {
          backendKind: 'lean4',
          backendId: this.backendId,
          outcome: 'verified',
          outputArtifact: stdout.trim().length > 0 ? stdout : null,
          compileLog: null,
          durationMs,
        };
      }
      const lower = combined.toLowerCase();
      if (lower.includes('type mismatch') || lower.includes('goals left')) {
        return {
          backendKind: 'lean4',
          backendId: this.backendId,
          outcome: 'refuted',
          outputArtifact: null,
          compileLog: combined,
          durationMs,
        };
      }
      return {
        backendKind: 'lean4',
        backendId: this.backendId,
        outcome: 'unknown',
        outputArtifact: null,
        compileLog: combined,
        durationMs,
      };
    } catch (error) {
      return {
        backendKind: 'lean4',
        backendId: this.backendId,
        outcome: 'unknown',
        outputArtifact: null,
        compileLog: `lean_spawn_error: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private disabledResult(start: number): BackendVerifyResult {
    return {
      backendKind: 'lean4',
      backendId: this.backendId,
      outcome: 'unknown',
      outputArtifact: null,
      compileLog: 'backend_disabled',
      durationMs: Date.now() - start,
    };
  }
}
