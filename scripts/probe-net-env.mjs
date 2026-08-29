// Empirical probe: how do NODE_USE_ENV_PROXY / NODE_EXTRA_CA_CERTS actually
// behave on this Node build? Decides the net-env wiring design.
import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

const FIX = 'tests/fixtures/net';

// --- TLS server ---
const tls = https.createServer(
  { key: fs.readFileSync(`${FIX}/server.key`), cert: fs.readFileSync(`${FIX}/server.crt`) },
  (req, res) => { res.writeHead(200); res.end('tls-pong'); },
);
await new Promise((r) => tls.listen(0, '127.0.0.1', r));
const tlsPort = tls.address().port;

// --- CONNECT proxy ---
let connectCount = 0;
const proxy = http.createServer();
proxy.on('connect', (req, clientSocket, head) => {
  connectCount += 1;
  const [host, port] = req.url.split(':');
  const upstream = net.connect(Number(port), host, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  clientSocket.on('error', () => upstream.destroy());
  upstream.on('error', () => clientSocket.destroy());
});
await new Promise((r) => proxy.listen(0, '127.0.0.1', r));
const proxyPort = proxy.address().port;

const run = (env, script) => new Promise((resolve) => {
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, ...env },
    windowsHide: true,
  });
  let out = '';
  let err = '';
  child.stdout.on('data', (c) => (out += c));
  child.stderr.on('data', (c) => (err += c));
  child.on('exit', (code) => resolve({ code, out, err }));
});

const url = `https://127.0.0.1:${tlsPort}/ping`;

// A. boot-time NODE_USE_ENV_PROXY + custom CA via boot-time NODE_EXTRA_CA_CERTS
const a = await run(
  { NODE_USE_ENV_PROXY: '1', HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`, NO_PROXY: 'localhost', NODE_EXTRA_CA_CERTS: `${FIX}/ca.crt` },
  `const r = await fetch('${url}'); console.log('A:', r.status, await r.text());`,
);

// B. RUNTIME-set NODE_USE_ENV_PROXY + HTTPS_PROXY + runtime NODE_EXTRA_CA_CERTS (before first fetch)
const b = await run(
  { NO_PROXY: 'localhost' },
  `process.env.NODE_USE_ENV_PROXY='1'; process.env.HTTPS_PROXY='http://127.0.0.1:${proxyPort}'; process.env.NODE_EXTRA_CA_CERTS='${FIX}/ca.crt';
   const r = await fetch('${url}'); console.log('B:', r.status, await r.text());`,
);

// C. no proxy, boot-time CA only (control: CA works without proxy)
const c = await run(
  { NODE_EXTRA_CA_CERTS: `${FIX}/ca.crt` },
  `const r = await fetch('${url}'); console.log('C:', r.status, await r.text());`,
);

// D. no CA at all (control: must fail TLS)
const d = await run(
  {},
  `try { await fetch('${url}'); console.log('D: unexpected-success'); } catch (e) { console.log('D: rejected:', e.cause?.code ?? e.message); }`,
);

console.log('A (boot proxy+ca):', JSON.stringify(a));
console.log('B (runtime proxy+ca):', JSON.stringify(b));
console.log('C (boot ca, no proxy):', JSON.stringify(c));
console.log('D (no ca):', JSON.stringify(d));
console.log('proxy CONNECT count:', connectCount);
tls.close(); proxy.close();
process.exit(0);
