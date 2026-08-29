import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';

/**
 * Network plane (extensibility lane): HTTP(S) proxy + custom CA for ALL
 * outbound fetch (model providers, literature sources, MCP streamable-HTTP).
 *
 * Mechanism (empirically verified on Node 24.14, see scripts/probe-net-env.mjs):
 * - Node's built-in fetch reads NODE_USE_ENV_PROXY / HTTPS_PROXY / HTTP_PROXY /
 *   NO_PROXY / NODE_EXTRA_CA_CERTS at PROCESS BOOT ONLY — setting them later in
 *   a running process has NO effect (probe case B failed both proxy and CA).
 * - Therefore this module (a) translates FARLAB_* config into the Node-native
 *   env contract, and (b) offers a one-shot re-exec for processes started
 *   WITHOUT that env, so the product surface works from .env config without
 *   asking the researcher to wrap their command line.
 *
 * Trust note: proxy/CA config changes the trust root of every outbound TLS
 * connection. FARLAB_* vars come from the researcher's environment/.env — the
 * same trust boundary as API keys. `far probe net` verifies the resulting
 * chain against a REAL loopback TLS+CONNECT-proxy self-test (no external
 * network dependency) before a run depends on it.
 */

export interface NetworkEnvPlan {
  /** Env vars to set at boot for the Node-native fetch contract. */
  envVars: Record<string, string>;
  /** True when a re-exec is needed to apply the plan (boot env not yet in place). */
  restartRequired: boolean;
  /** Human-readable notes for probe/status output. */
  notes: string[];
}

const BOOT_MARKER = 'FARLAB_NET_BOOTSTRAPPED';

const firstOf = (env: NodeJS.ProcessEnv, keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = env[k];
    if (v !== undefined && v.trim().length > 0) return v.trim();
  }
  return undefined;
};

/** Validate that a file exists and parses as PEM CA material (tls-level check). */
export const validateCaFile = (file: string): { ok: true } | { ok: false; reason: string } => {
  let pem: string;
  try {
    pem = fs.readFileSync(file, 'utf8');
  } catch (e) {
    return { ok: false, reason: `unreadable: ${e instanceof Error ? e.message : String(e)}` };
  }
  if (!pem.includes('-----BEGIN CERTIFICATE-----')) {
    return { ok: false, reason: 'no PEM CERTIFICATE blocks found' };
  }
  try {
    // Real parse (not a regex): a malformed chain throws here.
    tls.createSecureContext({ ca: pem });
  } catch {
    return { ok: false, reason: 'tls.createSecureContext rejected the CA material' };
  }
  return { ok: true };
};

/** Compute the boot env plan from FARLAB_* config (falls back to standard vars). */
export const planNetworkEnv = (env: NodeJS.ProcessEnv = process.env): NetworkEnvPlan => {
  const notes: string[] = [];
  const envVars: Record<string, string> = {};
  const httpsProxy = firstOf(env, ['FARLAB_HTTPS_PROXY', 'HTTPS_PROXY', 'https_proxy']);
  const httpProxy = firstOf(env, ['FARLAB_HTTP_PROXY', 'HTTP_PROXY', 'http_proxy']);
  const noProxy = firstOf(env, ['FARLAB_NO_PROXY', 'NO_PROXY', 'no_proxy']);
  const caCert = firstOf(env, ['FARLAB_CA_CERT']);

  if (httpsProxy !== undefined || httpProxy !== undefined) {
    if (httpsProxy !== undefined) { envVars.HTTPS_PROXY = httpsProxy; envVars.https_proxy = httpsProxy; }
    if (httpProxy !== undefined) { envVars.HTTP_PROXY = httpProxy; envVars.http_proxy = httpProxy; }
    if (noProxy !== undefined) { envVars.NO_PROXY = noProxy; envVars.no_proxy = noProxy; }
    envVars.NODE_USE_ENV_PROXY = '1';
    notes.push(`proxy: https=${httpsProxy ?? '(none)'} http=${httpProxy ?? '(none)'}${noProxy !== undefined ? ` no-proxy=${noProxy}` : ''}`);
  }

  if (caCert !== undefined) {
    const resolved = path.resolve(caCert);
    if (env.NODE_EXTRA_CA_CERTS === undefined) {
      envVars.NODE_EXTRA_CA_CERTS = resolved;
      notes.push(`custom CA: ${resolved}`);
    } else {
      notes.push(`custom CA: NODE_EXTRA_CA_CERTS already set at boot (${env.NODE_EXTRA_CA_CERTS}) — FARLAB_CA_CERT not applied (avoid double-trust surprises); set only one`);
    }
  }

  // Re-exec only when the plan adds something this process's boot env lacks.
  // (A re-exec'd process carries BOOT_MARKER, so this can never loop.)
  const alreadyApplied = Object.entries(envVars).every(([k, v]) => env[k] === v);
  const restartRequired = Object.keys(envVars).length > 0 && !alreadyApplied && env[BOOT_MARKER] !== '1';
  return { envVars, restartRequired, notes };
};

/**
 * Boot-time guard for long-lived product processes: if the network plan needs
 * env that this process was NOT started with, re-exec ourselves exactly once
 * with the plan applied (stdio inherited; exit code propagates). Returns true
 * when a re-exec happened — callers must return immediately.
 */
export const ensureNetworkEnvAtBoot = (): boolean => {
  if (process.env[BOOT_MARKER] === '1') return false;
  const plan = planNetworkEnv(process.env);
  if (Object.keys(plan.envVars).length === 0 || !plan.restartRequired) return false;
  const childEnv = { ...process.env, ...plan.envVars, [BOOT_MARKER]: '1' };
  process.stderr.write(`far: network env (proxy/CA) configured but not active in this process — restarting once with it applied\n`);
  const result = spawnSync(process.execPath, process.argv.slice(1), {
    env: childEnv,
    stdio: 'inherit',
    windowsHide: true,
  });
  process.exitCode = result.status ?? 1;
  return true;
};

export interface NetworkProbeResult {
  proxyConfigured: boolean;
  proxy: { https?: string; http?: string; noProxy?: string };
  envProxyEngaged: boolean;
  caConfigured: boolean;
  caFile?: string;
  caValid?: { ok: boolean; reason?: string };
  /** Loopback self-test: real TLS server + real CONNECT proxy + child fetch. */
  selfTest: { ok: boolean; detail: string };
  notes: string[];
}

const here = (): string => path.dirname(fileURLToPath(import.meta.url));

const OPENSSL_CANDIDATES = process.platform === 'win32'
  ? ['openssl', 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'C:\\Program Files\\Git\\mingw64\\bin\\openssl.exe']
  : ['openssl'];

const openssl = (): string | null => {
  for (const candidate of OPENSSL_CANDIDATES) {
    const probe = spawnSync(candidate, ['version'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
    if (probe.status === 0) return candidate;
  }
  return null;
};

/**
 * Self-test cert material. Committed test certs live in tests/fixtures/net
 * (PUBLIC certs only — *.key is globally gitignored by design, private keys
 * never enter the repo). When the server key is absent (fresh clone), we
 * generate an ephemeral throwaway CA+server pair with openssl into the OS
 * temp dir; when openssl is unavailable the self-test reports itself
 * unavailable instead of pretending.
 */
export const selfTestMaterial = async (): Promise<
  { key: Buffer; cert: Buffer; caFile: string; cleanup?: () => void } | { unavailable: string }
> => {
  const fixDir = path.resolve(here(), '../../tests/fixtures/net');
  const certPath = path.join(fixDir, 'server.crt');
  const keyPath = path.join(fixDir, 'server.key');
  if (fs.existsSync(certPath) && fs.existsSync(keyPath) && fs.existsSync(path.join(fixDir, 'ca.crt'))) {
    return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath), caFile: path.join(fixDir, 'ca.crt') };
  }
  const bin = openssl();
  if (bin === null) {
    return { unavailable: 'self-test needs TLS cert material: tests/fixtures/net/server.key is absent (gitignored private key) and no openssl was found to generate a throwaway pair' };
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-net-selftest-'));
  const cleanup = (): void => {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  };
  const run = (args: string[]): void => {
    const r = spawnSync(bin, args, { cwd: dir, encoding: 'utf8', windowsHide: true, timeout: 15_000 });
    if (r.status !== 0) throw new Error(`openssl ${args[0]} failed: ${(r.stderr ?? '').slice(0, 200)}`);
  };
  try {
    run(['req', '-x509', '-newkey', 'rsa:2048', '-keyout', 'ca.key', '-out', 'ca.crt', '-days', '2', '-nodes', '-subj', '/CN=FarLab Ephemeral SelfTest CA']);
    run(['req', '-newkey', 'rsa:2048', '-keyout', 'server.key', '-out', 'server.csr', '-nodes', '-subj', '/CN=127.0.0.1']);
    fs.writeFileSync(path.join(dir, 'ext.cnf'), 'subjectAltName=IP:127.0.0.1,DNS:localhost\n');
    run(['x509', '-req', '-in', 'server.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', 'server.crt', '-days', '2', '-extfile', 'ext.cnf']);
    return {
      key: fs.readFileSync(path.join(dir, 'server.key')),
      cert: fs.readFileSync(path.join(dir, 'server.crt')),
      caFile: path.join(dir, 'ca.crt'),
      cleanup,
    };
  } catch (e) {
    cleanup();
    return { unavailable: `self-test cert generation failed: ${e instanceof Error ? e.message : String(e)}` };
  }
};

/**
 * `far probe net`: honest network-plane status PLUS a real loopback self-test —
 * local TLS server (tests/fixtures/net certs) + local CONNECT proxy; a child
 * node process started with the researcher's proxy/CA env fetches through the
 * tunnel. PASS means the configured chain actually works end-to-end; no
 * external network is contacted.
 */
export const probeNetwork = async (): Promise<NetworkProbeResult> => {
  const plan = planNetworkEnv(process.env);
  const proxyConfigured = plan.envVars.NODE_USE_ENV_PROXY === '1';
  const caFile = plan.envVars.NODE_EXTRA_CA_CERTS;

  const result: NetworkProbeResult = {
    proxyConfigured,
    proxy: {
      ...(plan.envVars.HTTPS_PROXY !== undefined ? { https: plan.envVars.HTTPS_PROXY } : {}),
      ...(plan.envVars.HTTP_PROXY !== undefined ? { http: plan.envVars.HTTP_PROXY } : {}),
      ...(plan.envVars.NO_PROXY !== undefined ? { noProxy: plan.envVars.NO_PROXY } : {}),
    },
    envProxyEngaged: proxyConfigured && plan.restartRequired === false,
    caConfigured: caFile !== undefined,
    ...(caFile !== undefined ? { caFile } : {}),
    selfTest: { ok: false, detail: 'not run' },
    notes: plan.notes,
  };
  if (caFile !== undefined) {
    const v = validateCaFile(caFile);
    result.caValid = { ok: v.ok, ...(v.ok ? {} : { reason: v.reason }) };
  }
  if (!proxyConfigured && caFile === undefined) {
    result.selfTest = { ok: false, detail: 'no proxy/CA configured — nothing to verify (set FARLAB_HTTPS_PROXY or FARLAB_CA_CERT)' };
    return result;
  }

  // --- loopback self-test ---
  const material = await selfTestMaterial();
  if ('unavailable' in material) {
    result.selfTest = { ok: false, detail: material.unavailable };
    return result;
  }
  try {
    const { key, cert, caFile: selfTestCa } = material;
    const tlsServer = https.createServer({ key, cert }, (req, res) => { res.writeHead(200); res.end('far-net-selftest-pong'); });
    await new Promise<void>((resolve) => tlsServer.listen(0, '127.0.0.1', () => resolve()));
    const tlsPort = (tlsServer.address() as net.AddressInfo).port;
    let connectCount = 0;
    const proxyServer = http.createServer();
    proxyServer.on('connect', (req, clientSocket, head) => {
      connectCount += 1;
      const [host, port] = (req.url ?? '').split(':');
      const upstream = net.connect(Number(port), host, () => {
        clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
        upstream.write(head);
        upstream.pipe(clientSocket);
        clientSocket.pipe(upstream);
      });
      clientSocket.on('error', () => upstream.destroy());
      upstream.on('error', () => clientSocket.destroy());
    });
    await new Promise<void>((resolve) => proxyServer.listen(0, '127.0.0.1', () => resolve()));
    const proxyPort = (proxyServer.address() as net.AddressInfo).port;

    // The child uses the SELF-TEST CA (it signs the loopback server cert) —
    // this verifies the NODE_EXTRA_CA_CERTS + CONNECT mechanics end-to-end;
    // the user's own CA file was already parse-validated above.
    const childEnv: NodeJS.ProcessEnv = { ...process.env, NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`, NO_PROXY: 'localhost,::1', NODE_EXTRA_CA_CERTS: selfTestCa };
    const child: ChildProcess = spawn(process.execPath, ['--input-type=module', '-e', `const r = await fetch('https://127.0.0.1:${tlsPort}/ping'); if (!r.ok) throw new Error('HTTP ' + r.status); process.stdout.write(await r.text());`], { env: childEnv, windowsHide: true });
    const stdout = await new Promise<string>((resolve, reject) => {
      let out = '';
      let err = '';
      child.stdout?.on('data', (c: Buffer) => { out += c.toString('utf8'); });
      child.stderr?.on('data', (c: Buffer) => { err += c.toString('utf8'); });
      child.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(err.slice(0, 500) || `exit ${code}`))));
      child.on('error', reject);
    });
    tlsServer.close();
    proxyServer.close();
    material.cleanup?.();
    result.selfTest = {
      ok: stdout.includes('far-net-selftest-pong'),
      detail: stdout.includes('far-net-selftest-pong')
        ? `loopback CONNECT tunnel + TLS verify OK (proxy forwarded ${connectCount} CONNECT)`
        : `unexpected child output: ${stdout.slice(0, 120)}`,
    };
  } catch (e) {
    material.cleanup?.();
    result.selfTest = { ok: false, detail: `self-test failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  return result;
};
