// spec 38 §3.2 · SMT (Z3) backend adapter.
// Spawns the `z3` CLI binary in SMT-LIB v2 mode (stdin → stdout).
//
// Protocol: target is a JSON string {"script": "<SMT-LIB assertions>",
//           "query": "unsat"|"sat"}.
//   - query='unsat': the claim is universally valid → z3 should report unsat.
//       unsat → verified, sat → refuted, unknown → unknown.
//   - query='sat': the claim is satisfiable → z3 should report sat.
//       sat → verified, unsat → refuted, unknown → unknown.
//
// Fresh-clone friendliness: if z3 is not on PATH, isAvailable()=false and
// verify() returns outcome='unknown' + compileLog='backend_disabled'.
//
// Model-neutrality: this file references NO model/provider.

import { spawn, spawnSync } from 'node:child_process';
import type {
  BackendVerifyInput,
  BackendVerifyResult,
  MathBackend,
} from './math_claim.ts';

export interface Z3SmtBackendOptions {
  readonly z3Command?: string;
  readonly timeoutMs?: number;
  readonly versionOverride?: string;
}

interface SmtTarget {
  readonly script: string;
  readonly query: 'unsat' | 'sat';
}

export class Z3SmtBackend implements MathBackend {
  readonly backendKind = 'smt' as const;
  readonly backendId: string;
  private readonly z3Command: string;
  private readonly timeoutMs: number;
  private availableCache: boolean | null = null;

  constructor(options: Z3SmtBackendOptions = {}) {
    this.z3Command = options.z3Command ?? 'z3';
    this.timeoutMs = options.timeoutMs ?? 20000;
    this.backendId = options.versionOverride !== undefined ? `z3@${options.versionOverride}` : 'z3@unknown';
  }

  isAvailable(): boolean {
    if (this.availableCache !== null) {
      return this.availableCache;
    }
    try {
      const result = spawnSync(this.z3Command, ['--version'], {
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

    let target: SmtTarget;
    try {
      const parsed = JSON.parse(input.expression) as Partial<SmtTarget>;
      if (typeof parsed.script !== 'string' || parsed.script.length === 0) {
        throw new Error('smt target missing "script"');
      }
      if (parsed.query !== 'unsat' && parsed.query !== 'sat') {
        throw new Error('smt target "query" must be "unsat" or "sat"');
      }
      target = { script: parsed.script, query: parsed.query };
    } catch (error) {
      return {
        backendKind: 'smt',
        backendId: this.backendId,
        outcome: 'unknown',
        outputArtifact: null,
        compileLog: `smt_parse_error: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }

    try {
      const z3Result = await this.runZ3(target.script);
      const durationMs = Date.now() - start;
      const outcome = this.mapZ3Result(z3Result.sat, target.query);
      return {
        backendKind: 'smt',
        backendId: this.backendId,
        outcome,
        outputArtifact: z3Result.rawOutput,
        compileLog: z3Result.stderr.length > 0 ? z3Result.stderr : null,
        durationMs,
      };
    } catch (error) {
      return {
        backendKind: 'smt',
        backendId: this.backendId,
        outcome: 'unknown',
        outputArtifact: null,
        compileLog: `smt_spawn_error: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  }

  private mapZ3Result(sat: 'sat' | 'unsat' | 'unknown', query: 'unsat' | 'sat'): 'verified' | 'refuted' | 'unknown' {
    if (sat === 'unknown') {
      return 'unknown';
    }
    if (query === 'unsat') {
      return sat === 'unsat' ? 'verified' : 'refuted';
    }
    // query === 'sat'
    return sat === 'sat' ? 'verified' : 'refuted';
  }

  private runZ3(script: string): Promise<{ sat: 'sat' | 'unsat' | 'unknown'; rawOutput: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const fullScript = `${script}\n(check-sat)\n`;
      const child = spawn(this.z3Command, ['-in'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.timeoutMs,
      });

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

      child.on('error', (err: Error) => reject(err));

      child.on('close', (code: number | null) => {
        const stdoutText = Buffer.concat(stdoutChunks).toString('utf8').trim();
        const stderrText = Buffer.concat(stderrChunks).toString('utf8').trim();

        if (code !== null && code !== 0 && stdoutText.length === 0) {
          reject(new Error(`z3 exited with code ${code}; stderr=${stderrText}`));
          return;
        }

        const lower = stdoutText.toLowerCase();
        let sat: 'sat' | 'unsat' | 'unknown';
        if (lower.includes('unsat')) {
          sat = 'unsat';
        } else if (lower.includes('sat') && !lower.includes('unsat')) {
          sat = 'sat';
        } else {
          sat = 'unknown';
        }
        resolve({ sat, rawOutput: stdoutText, stderr: stderrText });
      });

      child.stdin.write(fullScript);
      child.stdin.end();
    });
  }

  private disabledResult(start: number): BackendVerifyResult {
    return {
      backendKind: 'smt',
      backendId: this.backendId,
      outcome: 'unknown',
      outputArtifact: null,
      compileLog: 'backend_disabled',
      durationMs: Date.now() - start,
    };
  }
}
