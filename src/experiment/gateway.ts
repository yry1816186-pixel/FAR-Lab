import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Remote execution gateway (P3, D-084/D-087). Transport = the system OpenSSH client
 * (ssh/scp subprocesses) instead of a vendored ssh2 npm package: keeps the Node runtime
 * zod-only (protected invariant), uses the OS-audited crypto path, and follows the
 * architecture-critic's Windows-native fallback recommendation. The remote target is a
 * REAL SSH boundary: key-only auth, host-key verification via a pinned known_hosts
 * file, no ambient trust.
 *
 * Honest boundary note (red-team): an SSH container on the same host is an environment
 * boundary, not a security sandbox — code templates stay reviewed (D-086-5) regardless
 * of where they execute.
 */

export interface SSHTarget {
  host: string;
  port: number;
  user: string;
  /** Private key file (dedicated per-target key; never a shared default). */
  identityFile: string;
  /** Pinned known_hosts file — StrictHostKeyChecking=yes, TOFU recorded once. */
  knownHostsFile: string;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

const baseArgs = (t: SSHTarget): string[] => [
  '-i', t.identityFile,
  '-o', `UserKnownHostsFile=${t.knownHostsFile}`,
  '-o', 'StrictHostKeyChecking=yes',
  '-o', 'BatchMode=yes',
  '-o', 'ConnectTimeout=10',
  '-p', String(t.port),
  `${t.user}@${t.host}`,
];

export class SSHGateway {
  constructor(private readonly target: SSHTarget) {}

  /** Verbatim command execution; non-zero exits are DATA (returned), not thrown. */
  async exec(command: string, timeoutMs = 60_000): Promise<ExecResult> {
    try {
      const { stdout, stderr } = await run('ssh', [...baseArgs(this.target), command], { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
      return { code: 0, stdout, stderr };
    } catch (e) {
      const err = e as { code?: number; stdout?: string; stderr?: string; message: string };
      if (err.stdout !== undefined || err.stderr !== undefined || typeof err.code === 'number') {
        return { code: typeof err.code === 'number' ? err.code : -1, stdout: err.stdout ?? '', stderr: err.stderr ?? '' };
      }
      throw new Error(`ssh exec failed to start: ${err.message}`, { cause: e });
    }
  }

  async putFile(localPath: string, remotePath: string): Promise<void> {
    const t = this.target;
    await run('scp', [
      '-i', t.identityFile,
      '-o', `UserKnownHostsFile=${t.knownHostsFile}`,
      '-o', 'StrictHostKeyChecking=yes',
      '-o', 'BatchMode=yes',
      '-P', String(t.port),
      localPath, `${t.user}@${t.host}:${remotePath}`,
    ], { timeout: 60_000 });
  }

  /** Capability probe: interpreter presence + core scientific stack. */
  async probe(): Promise<{ reachable: boolean; pythonVersion: string | null; numpy: boolean }> {
    const r = await this.exec('python3 -c "import sys;print(sys.version.split()[0]);import numpy;print(\'numpy\',numpy.__version__)"');
    if (r.code !== 0) return { reachable: false, pythonVersion: null, numpy: false };
    const [versionLine, numpyLine] = r.stdout.trim().split('\n');
    return { reachable: true, pythonVersion: versionLine ?? null, numpy: numpyLine?.startsWith('numpy ') ?? false };
  }

  /**
   * Real remote computation: bootstrap CI over per-row outcomes using the remote
   * interpreter (numpy). Cross-device bit-identity is NOT claimed (D-086-3: same-device
   * only) — callers compare within tolerance.
   */
  async remoteBootstrap(rows: number[], alpha: number, nBoot: number, seed: number, timeoutMs = 120_000): Promise<{ point: number; low: number; high: number }> {
    const payload = JSON.stringify({ rows, alpha, nBoot, seed });
    const script = `import json,sys\nimport numpy as np\nd=json.loads(sys.argv[1])\nr=np.asarray(d["rows"],dtype=np.float64)\nrng=np.random.default_rng(d["seed"])\nidx=rng.integers(0,len(r),size=(d["nBoot"],len(r)))\nmeans=r[idx].mean(axis=1)\nlo,hi=np.quantile(means,[d["alpha"]/2,1-d["alpha"]/2])\nprint(json.dumps({"point":float(r.mean()),"low":float(lo),"high":float(hi)}))`;
    const r = await this.exec(`python3 -c ${shellQuote(script)} ${shellQuote(payload)}`, timeoutMs);
    if (r.code !== 0) throw new Error(`remote bootstrap failed (${r.code}): ${r.stderr.trim().slice(0, 400)}`);
    const out = JSON.parse(r.stdout.trim()) as { point: number; low: number; high: number };
    return out;
  }
}

/** POSIX single-quoting safe for ssh command strings (the remote side runs POSIX sh). */
export const shellQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/** Generate a dedicated ed25519 keypair for a target (test/ops helper). */
export const generateTargetKey = async (identityFile: string): Promise<void> => {
  if (fs.existsSync(identityFile)) return;
  await run('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', identityFile, '-C', 'farlab-experiment-target']);
};
