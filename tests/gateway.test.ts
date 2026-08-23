import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { execFileSync as _execSync } from 'node:child_process';
// Host-side numpy gate: the local bootstrap mirror shells out to `python -c` with numpy.
const hostNumpy = (): boolean => { try { _execSync('python', ['-c', 'import numpy'], { stdio: 'ignore' }); return true; } catch { return false; } };

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SSHGateway, generateTargetKey } from '../src/experiment/gateway.js';

/**
 * Real-path gateway verification (D-084): builds the SSH target image, runs it, pins
 * its host key, then executes a REAL remote training (sklearn logistic on CSV shipped
 * via scp) and a REAL remote bootstrap, comparing against local computation within
 * tolerance (cross-device bit-identity is explicitly not claimed, D-086-3).
 * Skipped honestly when the Docker daemon is not running (user-side condition).
 */

const dockerReady = (): boolean => {
  try {
    execFileSync('docker', ['info', '--format', '{{.ServerVersion}}'], { stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
};

const hostNumpyOk = hostNumpy();

const CONTAINER = 'farlab-ssh-target-test';
const PORT = 2223;

const trainScript = `import json,sys
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score
import csv
rows=list(csv.reader(open(sys.argv[1])))
header=rows[0]; body=rows[1:]
ti=header.index('label')
X=np.array([[float(r[i]) for i in range(len(header)) if i!=ti] for r in body])
y=np.array([1 if r[ti]=='pos' else 0 for r in body])
n=len(body); tr=slice(0,int(n*0.7)); te=slice(int(n*0.7),None)
m=LogisticRegression(max_iter=1000).fit(X[tr],y[tr])
per_row=(m.predict(X[te])==y[te]).astype(int).tolist()
print(json.dumps({'accuracy':float(accuracy_score(y[te],m.predict(X[te]))),'per_row':per_row}))
`;

describe('P3 ssh2-gateway on a real Docker/WSL2 Linux target (D-084)', { timeout: 600_000 }, () => {
  let dir: string;
  const ready = dockerReady();

  beforeAll(() => {
    if (!ready) return;
    dir = mkdtempSync(join(tmpdir(), 'farlab-gw-'));
  });

  afterAll(() => {
    if (!ready) return;
    try { execFileSync('docker', ['rm', '-f', CONTAINER], { stdio: 'ignore' }); } catch { /* already gone */ }
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows lag */ }
  });

  it.runIf(ready && hostNumpyOk)('real Linux target: key-only SSH, remote training, host-key pinning', async () => {
    // 1. Dedicated keypair + target image + container (root login only via this key).
    const identity = join(dir, 'id_ed25519');
    await generateTargetKey(identity);
    execFileSync('docker', ['build', '-t', 'farlab-ssh-target', join(import.meta.dirname, '..', 'experiment-runtime', 'ssh-target')], { stdio: 'inherit' });
    const pub = readFileSync(`${identity}.pub`, 'utf8').trim();
    execFileSync('docker', [
      'run', '-d', '--name', CONTAINER, '-p', `${PORT}:22`,
      '-e', `AUTHORIZED_KEY=${pub}`,
      'farlab-ssh-target',
      'sh', '-c', `echo "$AUTHORIZED_KEY" > /root/.ssh/authorized_keys && chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys && exec /usr/sbin/sshd -D -e`,
    ]);
    // Wait for sshd to accept connections.
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    await wait(1500);

    // 2. TOFU host-key pinning: capture the container's host key into a dedicated
    //    known_hosts (docker exec reads it straight from the source), then enforce
    //    StrictHostKeyChecking=yes for every gateway operation.
    const hostKey = execFileSync('docker', ['exec', CONTAINER, 'cat', '/etc/ssh/ssh_host_ed25519_key.pub'], { encoding: 'utf8' }).trim();
    const knownHosts = join(dir, 'known_hosts');
    writeFileSync(knownHosts, `[localhost]:${PORT} ${hostKey}\n`);

    const gw = new SSHGateway({ host: 'localhost', port: PORT, user: 'root', identityFile: identity, knownHostsFile: knownHosts });

    // 3. Capability probe on the real remote interpreter.
    const probe = await gw.probe();
    expect(probe.reachable).toBe(true);
    expect(probe.pythonVersion).toMatch(/^\d+\.\d+/);
    expect(probe.numpy).toBe(true);

    // 4. Real remote training: ship CSV + script via scp, execute, retrieve metrics.
    const csv: string[] = ['x0,x1,label'];
    // Interleaved construction: every 5th pair is wrong-side, so train AND test both
    // carry overlap (appending overlap at the tail would bias the row-order split).
    for (let i = 0; i < 72; i += 1) {
      const wrongSide = i % 5 === 0;
      csv.push(`${wrongSide ? 0.1 + (i % 5) * 0.1 : 2 + (i % 9) * 0.1},${(i % 5) * 0.3},pos`);
      csv.push(`${wrongSide ? 2 + (i % 6) * 0.1 : 0.1 + (i % 7) * 0.1},${(i % 4) * 0.3},neg`);
    }
    const csvPath = join(dir, 'data.csv');
    writeFileSync(csvPath, csv.join('\n') + '\n', 'utf8');
    const scriptPath = join(dir, 'remote_train.py');
    writeFileSync(scriptPath, trainScript, 'utf8');
    await gw.putFile(csvPath, '/tmp/data.csv');
    await gw.putFile(scriptPath, '/tmp/remote_train.py');
    const train = await gw.exec('python3 /tmp/remote_train.py /tmp/data.csv', 120_000);
    expect(train.code, train.stderr).toBe(0);
    const result = JSON.parse(train.stdout.trim()) as { accuracy: number; per_row: number[] };
    expect(result.per_row).toHaveLength(44); // 144 rows, int(0.7*144)=100 train -> 44 test
    // Beats majority guessing decisively despite the injected overlap.
    expect(result.accuracy).toBeGreaterThan(0.7);

    // 5. Real remote bootstrap; cross-check against local computation within tolerance.
    const remote = await gw.remoteBootstrap(result.per_row, 0.05, 2000, 11);
    expect(remote.low).toBeLessThan(remote.point);
    expect(remote.high).toBeGreaterThan(remote.point);
    // Local mirror of the same seeded computation (numpy on this host).
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const runP = promisify(execFile);
    const localPy = await runP('python', ['-c', `import json,numpy as np;r=np.asarray(json.loads('${JSON.stringify(result.per_row)}'),dtype=np.float64);rng=np.random.default_rng(11);idx=rng.integers(0,len(r),size=(2000,len(r)));m=r[idx].mean(axis=1);lo,hi=np.quantile(m,[0.025,0.975]);print(json.dumps({'point':float(r.mean()),'low':float(lo),'high':float(hi)}))`]);
    const local = JSON.parse(localPy.stdout.trim()) as { point: number; low: number; high: number };
    expect(Math.abs(remote.point - local.point)).toBeLessThan(1e-12);
    // CI bounds may differ slightly across numpy/BLAS builds — tolerance, not identity.
    expect(Math.abs(remote.low - local.low)).toBeLessThan(0.02);
    expect(Math.abs(remote.high - local.high)).toBeLessThan(0.02);

    // 6. Fail-closed: a tampered host key must be REJECTED (real MITM detection).
    const tampered = join(dir, 'known_hosts_bad');
    writeFileSync(tampered, `[localhost]:${PORT} ${hostKey.replace(/AAAA[a-zA-Z0-9+/]*/, 'AAAAFAKEHOSTKEY')}\n`);
    const badGw = new SSHGateway({ host: 'localhost', port: PORT, user: 'root', identityFile: identity, knownHostsFile: tampered });
    const rejected = await badGw.exec('echo hi');
    expect(rejected.code).not.toBe(0);
    // Either rejection message is a host-key verification failure: a changed key OR a
    // pinned file that knows none — both refuse the connection before any command runs.
    expect(rejected.stderr).toMatch(/REMOTE HOST IDENTIFICATION HAS CHANGED|No ED25519 host key is known/);
  });

  it.skipIf(ready)('docker daemon not running — remote-path verification stays honestly skipped (user-side condition, D-084)', () => {
    expect(true).toBe(true);
  });
});
