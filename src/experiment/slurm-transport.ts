import { z } from 'zod';
import type { SSHGateway, ExecResult, ProbeReport } from './gateway.js';

/** Slurm probe = the SSH fingerprint plus the scheduler binaries fact. */
export interface SlurmProbeReport extends ProbeReport {
  slurmBinaries: boolean;
  /** Set when the binaries check failed — the verbatim scheduler stderr. */
  slurmDetail?: string;
}

/**
 * Slurm batch transport (FA-REM-04). Same division of authority as the plain SSH
 * remote executor (P3 D-084/D-087): data identity and statistics stay local; CELL
 * PRODUCTION runs on a Slurm cluster through sbatch/squeue/scancel instead of an
 * interactive ssh exec. The transport implements the SAME narrow seam the remote
 * executor already consumes (`Pick<SSHGateway, 'probe' | 'exec' | 'putFile'>`),
 * so `executeRemoteExperiment` runs on a cluster without knowing the difference —
 * a batch system behind an exec facade: submit, poll to terminal, fetch job output.
 *
 * Cancel semantics ride the existing cooperative flag: the poll loop checks
 * `shouldCancel()` every interval and scancels the job, surfacing as a canceled
 * (non-zero) exit — never a hang, never a silent skip.
 *
 * The sbatch/squeue/scancel invocation itself goes through `runBatch` (an injectable
 * shell seam over the inner gateway): tests script a mock scheduler there — the
 * CLUSTER is the mock, the submit/poll/cancel state machine under test is real.
 */

export const SlurmBatchOptions = z.object({
  /** Partition passed to sbatch -p (unset = cluster default). */
  partition: z.string().min(1).optional(),
  /** Account passed to sbatch -A (unset = cluster default). */
  account: z.string().min(1).optional(),
  /** Walltime for the job script header, e.g. '02:00:00'. */
  timeLimit: z.string().regex(/^\d{1,2}(:\d{2}){0,2}$/, 'timeLimit must be HH:MM or HH:MM:SS').optional(),
  /** Poll interval for squeue (default 10s). */
  pollIntervalMs: z.number().int().positive().max(300_000).optional(),
  /** Hard cap on polling before giving up (default 24h — matches batch reality). */
  maxPollMs: z.number().int().positive().optional(),
});
export type SlurmBatchOptions = z.infer<typeof SlurmBatchOptions>;

/** One scheduler interaction: a shell command executed on the cluster head node. */
export type BatchRunner = (command: string, timeoutMs?: number) => Promise<ExecResult>;

export const SLURM_JOB_ID_RE = /^(\d+)$/;

const sleep = (ms: number) => new Promise((r) => { setTimeout(r, ms); });

export class SlurmTransport {
  private constructor(
    private readonly inner: Pick<SSHGateway, 'probe' | 'exec' | 'putFile'>,
    private readonly runBatch: BatchRunner,
    private readonly opts: SlurmBatchOptions,
    private readonly shouldCancel: () => boolean,
    private readonly monotonicNow: () => number,
  ) {}

  /**
   * Production transport: scheduler commands run on the cluster head node through
   * the SAME ssh gateway the interactive executor uses.
   */
  static overSsh(
    inner: Pick<SSHGateway, 'probe' | 'exec' | 'putFile'>,
    opts: SlurmBatchOptions,
    shouldCancel: () => boolean = () => false,
    monotonicNow: () => number = () => performance.now(),
  ): SlurmTransport {
    return new SlurmTransport(inner, (cmd, t) => inner.exec(cmd, t), opts, shouldCancel, monotonicNow);
  }

  /** Test/batch-adapter transport with a scripted scheduler command runner. */
  static withRunner(runBatch: BatchRunner, opts: SlurmBatchOptions = {}, shouldCancel: () => boolean = () => false, monotonicNow: () => number = () => performance.now()): SlurmTransport {
    const passthrough: Pick<SSHGateway, 'probe' | 'exec' | 'putFile'> = {
      // The outer seam's probe/putFile are cluster-host operations the scripted
      // tests assert separately; exec passthrough must never be hit directly —
      // batch work goes through runBatch. Fail visible if it is.
      probe: async () => { throw new Error('slurm-transport: probe passthrough not available on scripted transport'); },
      putFile: async () => { throw new Error('slurm-transport: putFile passthrough not available on scripted transport'); },
      exec: async () => { throw new Error('slurm-transport: direct exec on a batch device — route through sbatch (runBatch)'); },
    };
    return new SlurmTransport(passthrough, runBatch, opts, shouldCancel, monotonicNow);
  }

  async probe(): Promise<SlurmProbeReport> {
    // Slurm binaries are part of the environment fingerprint: a device that claims
    // kind=slurm without sbatch/squeue/scancel on PATH must fail visible here.
    const check = await this.runBatch('command -v sbatch && command -v squeue && command -v scancel');
    if (check.code !== 0) {
      return {
        reachable: false, pythonVersion: null, numpyVersion: null, numpy: false,
        cpuCount: null, gpu: null, pipFreezeSha256: null,
        slurmBinaries: false, slurmDetail: (check.stderr || check.stdout).slice(0, 500),
      };
    }
    const innerProbe = await this.inner.probe();
    return { ...innerProbe, slurmBinaries: true };
  }

  async putFile(localPath: string, remotePath: string): Promise<void> {
    return this.inner.putFile(localPath, remotePath);
  }

  /**
   * Batch exec facade: wrap the command in an sbatch job, poll squeue to a terminal
   * state, then return the job's stdout/stderr exactly like an interactive exec
   * would (non-zero exits are DATA, never thrown — the gateway contract).
   */
  async exec(command: string, timeoutMs = 3_600_000): Promise<ExecResult> {
    const startedAt = this.monotonicNow();
    const deadline = startedAt + Math.min(this.opts.maxPollMs ?? 86_400_000, timeoutMs);
    const output = `/tmp/farlab-slurm-${Date.now()}.out`;
    const sbatchParts = ['sbatch', '--parsable', '--output=' + output];
    if (this.opts.partition !== undefined) sbatchParts.push('-p', this.opts.partition);
    if (this.opts.account !== undefined) sbatchParts.push('-A', this.opts.account);
    if (this.opts.timeLimit !== undefined) sbatchParts.push('-t', this.opts.timeLimit);
    const script = sbatchParts.join(' ') + " <<'FARLAB_SBatch_EOF'\n#!/bin/sh\nset -o pipefail\n" + command + "\nFARLAB_SBatch_EOF";
    const submit = await this.runBatch(script);
    if (submit.code !== 0) {
      return { code: submit.code, stdout: submit.stdout, stderr: `slurm-transport: sbatch failed: ${submit.stderr}` };
    }
    const jobId = submit.stdout.trim().split('\n').at(-1) ?? '';
    if (!SLURM_JOB_ID_RE.test(jobId)) {
      return { code: 1, stdout: submit.stdout, stderr: `slurm-transport: sbatch --parsable returned no job id (got '${jobId.slice(0, 80)}')` };
    }

    const pollInterval = this.opts.pollIntervalMs ?? 10_000;
    for (;;) {
      if (this.shouldCancel()) {
        await this.runBatch(`scancel ${jobId}`);
        return { code: 137, stdout: '', stderr: `slurm-transport: canceled by cooperative cancel flag (job ${jobId} scancelled)` };
      }
      const q = await this.runBatch(`squeue -h -j ${jobId} -o %T`);
      const state = q.stdout.trim();
      const terminal = state === 'COMPLETED' ? 0 : state === 'FAILED' || state === 'CANCELLED' || state === 'TIMEOUT' || state === 'NODE_FAIL' || state === 'OUT_OF_MEMORY' ? 1 : null;
      if (terminal !== null) {
        const out = await this.runBatch(`cat ${output}`);
        return {
          code: terminal === 0 ? 0 : (state === 'FAILED' ? 1 : state === 'TIMEOUT' ? 124 : state === 'CANCELLED' ? 137 : 1),
          stdout: out.stdout,
          stderr: state === 'COMPLETED' ? '' : `slurm-transport: job ${jobId} ended in state ${state}: ${out.stderr.slice(0, 500)}`,
        };
      }
      if (this.monotonicNow() > deadline) {
        await this.runBatch(`scancel ${jobId}`);
        return { code: 124, stdout: '', stderr: `slurm-transport: poll deadline exceeded for job ${jobId} (scancelled)` };
      }
      await sleep(pollInterval);
    }
  }
}
