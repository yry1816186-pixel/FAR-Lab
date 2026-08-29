import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
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

  const fixDir = path.resolve(here(), '../../tests/fixtures/net');
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
  try {
    const key = fs.readFileSync(path.join(fixDir, 'server.key'));
    const cert = fs.readFileSync(path.join(fixDir, 'server.crt'));
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

    const childEnv: NodeJS.ProcessEnv = { ...process.env, NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`, NO_PROXY: 'localhost,::1' };
    if (caFile !== undefined) childEnv.NODE_EXTRA_CA_CERTS = caFile;
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
    result.selfTest = {
      ok: stdout.includes('far-net-selftest-pong'),
      detail: stdout.includes('far-net-selftest-pong')
        ? `loopback CONNECT tunnel + TLS verify OK (proxy forwarded ${connectCount} CONNECT)`
        : `unexpected child output: ${stdout.slice(0, 120)}`,
    };
  } catch (e) {
    result.selfTest = { ok: false, detail: `self-test failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  return result;
};
