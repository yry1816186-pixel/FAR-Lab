// spec 38 §3.4 · Dafny backend adapter.
// Spawns the `dafny` CLI to verify a Dafny source file.
//
// Like Lean 4, Dafny is rarely available in fresh-clone environments. This
// backend degrades to outcome='unknown' + compileLog='backend_disabled' when
// the `dafny` binary is not on PATH.
//
// When available, the target string is treated as a Dafny source snippet. The
// backend writes it to a temp .dfy file and runs `dafny verify`. A clean exit
// → verified. A verification error → refuted. Other errors → unknown.
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

export interface DafnyBackendOptions {
  readonly dafnyCommand?: string;
  readonly timeoutMs?: number;
  readonly versionOverride?: string;
}

export class DafnyBackend implements MathBackend {
  readonly backendKind = 'dafny' as const;
  readonly backendId: string;
  private readonly dafnyCommand: string;
  private readonly timeoutMs: number;
  private availableCache: boolean | null = null;

  constructor(options: DafnyBackendOptions = {}) {
    this.dafnyCommand = options.dafnyCommand ?? 'dafny';
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.backendId = options.versionOverride !== undefined ? `dafny@${options.versionOverride}` : 'dafny@unknown';
  }

  isAvailable(): boolean {
    if (this.availableCache !== null) {
      return this.availableCache;
    }
    try {
      const result = spawnSync(this.dafnyCommand, ['--version'], {
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
        backendKind: 'dafny',
        backendId: this.backendId,
        outcome: 'unknown',
        outputArtifact: null,
        compileLog: 'empty_dafny_source',
        durationMs: Date.now() - start,
      };
    }

    const tempDir = mkdtempSync(join(tmpdir(), 'far-chain-dafny-'));
    const dafnyFile = join(tempDir, 'claim.dfy');
    try {
      writeFileSync(dafnyFile, input.expression, 'utf8');
      const result = spawnSync(this.dafnyCommand, ['verify', dafnyFile], {
        timeout: this.timeoutMs,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const stdout = result.stdout ?? '';
      const stderr = result.stderr ?? '';
      const combined = stdout + stderr;
      const durationMs = Date.now() - start;

      // Dafny verify exit code 0 → all assertions verified.
      // Exit code 1 with "verification of" + "timed out" or "could not" → refuted/unknown.
      if (result.status === 0) {
        return {
          backendKind: 'dafny',
          backendId: this.backendId,
          outcome: 'verified',
          outputArtifact: stdout.trim().length > 0 ? stdout : null,
          compileLog: null,
          durationMs,
        };
      }
      const lower = combined.toLowerCase();
      if (lower.includes('verification error') || lower.includes('assertion might not hold')) {
        return {
          backendKind: 'dafny',
          backendId: this.backendId,
          outcome: 'refuted',
          outputArtifact: null,
          compileLog: combined,
          durationMs,
        };
      }
      return {
        backendKind: 'dafny',
        backendId: this.backendId,
        outcome: 'unknown',
        outputArtifact: null,
        compileLog: combined,
        durationMs,
      };
    } catch (error) {
      return {
        backendKind: 'dafny',
        backendId: this.backendId,
        outcome: 'unknown',
        outputArtifact: null,
        compileLog: `dafny_spawn_error: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  private disabledResult(start: number): BackendVerifyResult {
    return {
      backendKind: 'dafny',
      backendId: this.backendId,
      outcome: 'unknown',
      outputArtifact: null,
      compileLog: 'backend_disabled',
      durationMs: Date.now() - start,
    };
  }
}
