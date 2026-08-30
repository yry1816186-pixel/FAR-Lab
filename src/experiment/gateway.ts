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

/** Full remote-environment fingerprint emitted by probe() (absence = null, honestly). */
export interface ProbeReport {
  reachable: boolean;
  pythonVersion: string | null;
  numpyVersion: string | null;
  /** Back-compat boolean view of numpyVersion. */
  numpy: boolean;
  cpuCount: number | null;
  gpu: string | null;
  /** sha256 of the remote `pip freeze` output — dependency identity for fingerprints. */
  pipFreezeSha256: string | null;
}

/** Parse the probe's json payload; null on any malformation (fail-visible to caller). */
export const parseProbeReport = (stdout: string): Omit<ProbeReport, 'reachable' | 'gpu'> | null => {
  try {
    const line = stdout.trim().split('\n').find((l) => l.startsWith('{'));
    if (line === undefined) return null;
    const j = JSON.parse(line) as { python?: string; numpy?: string | null; cpu?: number | null; pipFreeze?: string | null };
    if (typeof j.python !== 'string') return null;
    return {
      pythonVersion: j.python,
      numpyVersion: typeof j.numpy === 'string' ? j.numpy : null,
      numpy: typeof j.numpy === 'string',
      cpuCount: typeof j.cpu === 'number' ? j.cpu : null,
      pipFreezeSha256: typeof j.pipFreeze === 'string' ? j.pipFreeze : null,
    };
  } catch {
    return null;
  }
};

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
    // Retry transient scp failures ("Connection closed by ::1"): under load the
    // Windows Docker port-forward occasionally RESETs an established connection.
    // The file transfer is idempotent, so a bounded retry is safe and honest.
    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await run('scp', [
          '-i', t.identityFile,
          '-o', `UserKnownHostsFile=${t.knownHostsFile}`,
          '-o', 'StrictHostKeyChecking=yes',
          '-o', 'BatchMode=yes',
          '-P', String(t.port),
          localPath, `${t.user}@${t.host}:${remotePath}`,
        ], { timeout: 60_000 });
        return;
      } catch (e) {
        lastErr = e;
        await new Promise<void>((r) => setTimeout(r, 500 * (attempt + 1)));
      }
    }
    throw lastErr;
  }

  /**
   * Capability & environment fingerprint probe (FA-REM-03, endgame audit: probe
   * used to check two booleans; provenance needs versions + hardware). The remote
   * side emits ONE json object; every optional field degrades to null (minimal
   * containers lack pip/nvidia-smi — absence is honest data, not failure).
   */
  async probe(): Promise<ProbeReport> {
    // Retry the capability probe: a single transient connection reset (Windows
    // Docker NAT under load) would otherwise report a healthy device as
    // unreachable and fail the whole experiment. The probe is read-only.
    const script = [
      'import json,sys,os,hashlib',
      'out={"python":sys.version.split()[0],"numpy":None,"cpu":os.cpu_count(),"pipFreeze":None}',
      'try:',
      ' import numpy; out["numpy"]=numpy.__version__',
      'except Exception: pass',
      'try:',
      ' import subprocess as sp',
      ' fr=sp.run([sys.executable,"-m","pip","freeze"],capture_output=True,text=True,timeout=60)',
      ' if fr.returncode==0: out["pipFreeze"]=hashlib.sha256(fr.stdout.encode()).hexdigest()',
      'except Exception: pass',
      'print(json.dumps(out))',
    ].join('\n');
    let r = { code: -1, stdout: '', stderr: '' };
    for (let attempt = 0; attempt < 3; attempt++) {
      r = await this.exec(`python3 -c ${shellQuote(script)}`);
      if (r.code === 0) break;
      await new Promise<void>((res) => setTimeout(res, 500 * (attempt + 1)));
    }
    if (r.code !== 0) return { reachable: false, pythonVersion: null, numpyVersion: null, numpy: false, cpuCount: null, gpu: null, pipFreezeSha256: null };
    const parsed = parseProbeReport(r.stdout);
    if (parsed === null) return { reachable: false, pythonVersion: null, numpyVersion: null, numpy: false, cpuCount: null, gpu: null, pipFreezeSha256: null };
    // GPU presence is a separate, strictly optional exec (most targets have none).
    const gpu = await this.exec('nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -n 1');
    const gpuName = gpu.code === 0 ? gpu.stdout.trim().split('\n')[0] ?? null : null;
    return { ...parsed, reachable: true, gpu: gpuName !== '' ? gpuName : null };
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

/**
 * Wave-S ag2 (s2 #5) — remote-side kill discipline. A LOCAL ssh timeout kills only the
 * ssh client; the remote python keeps burning as an orphan. Wrapping the command in GNU
 * coreutils `timeout` (TERM then SIGKILL after 5s) makes the kill happen ON THE DEVICE:
 * exit 124 = remote TERM timeout, 137 = SIGKILL escalation. Both are honest, distinct
 * failure data the caller can report.
 */
export const remoteTimeoutWrap = (command: string, timeoutMs: number): string => {
  const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
  return `timeout --signal=TERM --kill-after=5 ${seconds} sh -c ${shellQuote(command)}`;
};

/** ag2 output discipline: cap any persisted raw output with a FIXED truncation marker —
 * silent clipping is indistinguishable from corruption, a marker is not. */
export const TRUNCATION_MARKER = '[... output truncated at limit ...]';
export const truncateOutput = (s: string, maxChars = 100_000): string =>
  s.length <= maxChars ? s : `${s.slice(0, maxChars)}\n${TRUNCATION_MARKER}`;

/** Generate a dedicated ed25519 keypair for a target (test/ops helper). */
export const generateTargetKey = async (identityFile: string): Promise<void> => {
  if (fs.existsSync(identityFile)) return;
  await run('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', identityFile, '-C', 'farlab-experiment-target']);
};
