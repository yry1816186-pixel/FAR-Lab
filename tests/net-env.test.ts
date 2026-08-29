import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { planNetworkEnv, validateCaFile, probeNetwork } from '../src/shared/net-env.js';

/**
 * Network plane (proxy + custom CA) — REAL verification:
 * - plan logic is pure env→plan;
 * - CA validation parses the REAL test CA with node:tls;
 * - probeNetwork runs the REAL loopback self-test (local TLS server + local
 *   CONNECT proxy + a real child fetch through the tunnel);
 * - the boot re-exec is verified end-to-end through the compiled CLI in a
 *   child process (same pattern as tests/cli-spawn.test.ts).
 */

const FIX = path.resolve('tests/fixtures/net');
const CA = path.join(FIX, 'ca.crt');

describe('planNetworkEnv', () => {
  it('translates FARLAB_* proxy config into the Node-native boot env', () => {
    const plan = planNetworkEnv({ FARLAB_HTTPS_PROXY: 'http://127.0.0.1:7890', FARLAB_NO_PROXY: 'localhost' } as NodeJS.ProcessEnv);
    expect(plan.envVars.HTTPS_PROXY).toBe('http://127.0.0.1:7890');
    expect(plan.envVars.NO_PROXY).toBe('localhost');
    expect(plan.envVars.NODE_USE_ENV_PROXY).toBe('1');
    expect(plan.restartRequired).toBe(true);
  });

  it('no proxy/CA config → empty plan, no restart', () => {
    const plan = planNetworkEnv({} as NodeJS.ProcessEnv);
    expect(Object.keys(plan.envVars)).toHaveLength(0);
    expect(plan.restartRequired).toBe(false);
  });

  it('an already-boot-applied plan does not restart', () => {
    const env = {
      FARLAB_HTTPS_PROXY: 'http://127.0.0.1:7890',
      HTTPS_PROXY: 'http://127.0.0.1:7890',
      https_proxy: 'http://127.0.0.1:7890',
      NO_PROXY: 'localhost',
      no_proxy: 'localhost',
      NODE_USE_ENV_PROXY: '1',
    } as NodeJS.ProcessEnv;
    expect(planNetworkEnv(env).restartRequired).toBe(false);
  });

  it('falls back to standard HTTPS_PROXY when FARLAB_* is absent', () => {
    const plan = planNetworkEnv({ HTTPS_PROXY: 'http://proxy:8080' } as NodeJS.ProcessEnv);
    expect(plan.envVars.HTTPS_PROXY).toBe('http://proxy:8080');
    expect(plan.envVars.NODE_USE_ENV_PROXY).toBe('1');
  });

  it('applies FARLAB_CA_CERT only when NODE_EXTRA_CA_CERTS is not already set at boot', () => {
    const plan = planNetworkEnv({ FARLAB_CA_CERT: CA } as NodeJS.ProcessEnv);
    expect(plan.envVars.NODE_EXTRA_CA_CERTS).toBe(CA);
    const clash = planNetworkEnv({ FARLAB_CA_CERT: CA, NODE_EXTRA_CA_CERTS: '/elsewhere/ca.pem' } as NodeJS.ProcessEnv);
    expect(clash.envVars.NODE_EXTRA_CA_CERTS).toBeUndefined();
    expect(clash.notes.some((n) => n.includes('already set at boot'))).toBe(true);
  });
});

describe('validateCaFile', () => {
  it('accepts the real test CA', () => {
    expect(validateCaFile(CA)).toEqual({ ok: true });
  });

  it('rejects garbage with a reason', () => {
    const junk = fs.mkdtempSync(path.join(os.tmpdir(), 'far-ca-'));
    const junkFile = path.join(junk, 'junk.pem');
    fs.writeFileSync(junkFile, 'definitely not a certificate\n');
    const v = validateCaFile(junkFile);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason.length).toBeGreaterThan(0);
    expect(validateCaFile(path.join(junk, 'missing.pem')).ok).toBe(false);
    fs.rmSync(junk, { recursive: true, force: true });
  });
});

describe('probeNetwork (real loopback self-test)', () => {
  const prevProxy = process.env.FARLAB_HTTPS_PROXY;
  const prevCa = process.env.FARLAB_CA_CERT;

  beforeAll(() => {
    delete process.env.FARLAB_HTTPS_PROXY;
    process.env.FARLAB_CA_CERT = CA;
  });

  afterAll(() => {
    if (prevProxy === undefined) delete process.env.FARLAB_HTTPS_PROXY; else process.env.FARLAB_HTTPS_PROXY = prevProxy;
    if (prevCa === undefined) delete process.env.FARLAB_CA_CERT; else process.env.FARLAB_CA_CERT = prevCa;
  });

  it('validates the CA and tunnels a real fetch through a real CONNECT proxy', async () => {
    const r = await probeNetwork();
    expect(r.caConfigured).toBe(true);
    expect(r.caValid?.ok).toBe(true);
    expect(r.selfTest.ok).toBe(true);
    expect(r.selfTest.detail).toContain('CONNECT');
  }, 30_000);

  it('reports honestly when nothing is configured', async () => {
    delete process.env.FARLAB_CA_CERT;
    const r = await probeNetwork();
    expect(r.proxyConfigured).toBe(false);
    expect(r.caConfigured).toBe(false);
    expect(r.selfTest.ok).toBe(false);
    expect(r.selfTest.detail).toContain('nothing to verify');
  });
});

describe('boot re-exec (compiled CLI, real child process)', () => {
  it('far probe net reports the configured proxy and passes the loopback self-test', () => {
    const dist = path.resolve('dist/cli/main.js');
    if (!fs.existsSync(dist)) return; // dist not built in this environment — cli-spawn covers the gate
    const res = spawnSync(process.execPath, [dist, 'probe', 'net'], {
      env: { ...process.env, FARLAB_HTTPS_PROXY: 'http://127.0.0.1:9', FARLAB_CA_CERT: CA, FAR_DOTENV: 'off' },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60_000,
    });
    // The self-test uses its own loopback proxy + the real CA: PASS (exit 0)
    // even though the configured upstream is unreachable — probe reports the
    // config honestly and verifies the MECHANISM, not the upstream.
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('proxy configured : yes');
    expect(res.stdout).toContain('self-test');
  }, 90_000);

  it('a non-probe command re-execs exactly once with the proxy env applied (observable on stderr)', () => {
    const dist = path.resolve('dist/cli/main.js');
    if (!fs.existsSync(dist)) return;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'far-reexec-'));
    try {
      const res = spawnSync(process.execPath, [dist, 'runs', '--json'], {
        env: { ...process.env, FARLAB_HTTPS_PROXY: 'http://127.0.0.1:9', FAR_DOTENV: 'off', FARLAB_DATA_DIR: tmp },
        encoding: 'utf8',
        windowsHide: true,
        timeout: 60_000,
      });
      expect(res.status).toBe(0);
      expect(res.stderr).toContain('restarting once');
      expect(res.stderr.match(/restarting once/g)?.length).toBe(1); // never a loop
      JSON.parse(res.stdout); // the re-exec'd child produced the real document
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  }, 90_000);
});
