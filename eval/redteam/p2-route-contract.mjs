/**
 * P2 route-contract probe — "UI controls with no effect" detector, server side.
 *
 * Extracts every /api/v1 URL the web client can request (string literals across
 * web/src, plus the api.<verb> call sites in web/src/api/endpoints.ts), then fires
 * each against the REAL booted server and classifies:
 *   OK              2xx — route works end to end on a real kernel
 *   EXISTS_404      404 target_not_found/run_not_found — route EXISTS, id synthetic
 *   EXISTS_VALID    400/409/413/422 — route EXISTS, input rejected
 *   EXISTS_UNAVAIL  503 — route EXISTS, external dependency honestly down
 *   NO_ROUTE        404 with the server's routing envelope 'no route:' — the client
 *                   calls a route the server does not have (CONTRACT BREAK → FAIL)
 *   METHOD_MISMATCH 405 — wrong method (CONTRACT BREAK → FAIL)
 *   SERVER_DEFECT   other 5xx — real defect or unhandled path (FAIL)
 *
 * Method discovery is behavioral: for raw literals we probe GET, then fall back
 * through POST/PUT/DELETE/PATCH until a non-405 response proves the route exists.
 * Also scans web components for obviously dead interactive handlers (advisory).
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, bootApiServer, finish } from './lib.mjs';

const WEB_SRC = path.join(ROOT, 'web', 'src');

const walk = (dir, exts, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
};

const normPath = (raw) => {
  let s = raw
    .replace(/\$\{BASE\}/g, '/api/v1')
    .replace(/\$\{[^}]*\}/g, ':p');
  const q = s.indexOf('?');
  if (q >= 0) s = s.slice(0, q);
  s = s.replace(/[.;,]+$/, '');
  const segs = s.split('/').filter((x) => x.length > 0).map((x) => (x.startsWith(':') ? ':p' : x));
  return segs;
};

/** Route segments must look like real path segments — kills comment prose and
 *  template-string false captures deterministically (e.g. "GET /api/v1/x" doc
 *  text, multiline backtick captures spanning code). */
const SEG_RE = /^[A-Za-z0-9_-]+$/;
const plausibleRoute = (segs) =>
  segs.length >= 3 && segs[0] === 'api' && segs[1] === 'v1' && segs.every((s) => s === ':p' || SEG_RE.test(s));

const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');

const extractClientRoutes = () => {
  const routes = new Map(); // key: 'METHOD /a/:p/b' normalized joined
  const files = walk(WEB_SRC, ['.ts', '.tsx']);
  for (const f of files) {
    const text = stripComments(fs.readFileSync(f, 'utf8'));
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    // 1) typed client call sites: api.getJson(`...`) / api.post('...', ...) etc.
    const API_CALL_RE = /api\.(getJson|getText|post|put|patch|del)\(\s*[`'"]([^`'"]+)[`'"]/g;
    for (const m of text.matchAll(API_CALL_RE)) {
      const method = { getJson: 'GET', getText: 'GET', post: 'POST', put: 'PUT', patch: 'PATCH', del: 'DELETE' }[m[1]];
      if (!m[2].includes('/api/v1') && !m[2].includes('${BASE}')) continue;
      const segs = normPath(m[2]);
      if (!plausibleRoute(segs)) continue;
      const key = `${method} ${segs.join('/')}`;
      if (!routes.has(key)) routes.set(key, { method, segs, sources: [] });
      routes.get(key).sources.push(rel);
    }
    // 2) raw literals anywhere (fetch or template strings) not already captured
    const LIT_RE = /[`'"](\/[^`'"]*\/api\/v1[^`'"]*|[^`'"]*\/api\/v1\/[^`'"]+)[`'"]/g;
    for (const m of text.matchAll(LIT_RE)) {
      const segs = normPath(m[1]);
      if (!plausibleRoute(segs)) continue;
      const keyAny = segs.join('/');
      const known = [...routes.values()].some((r) => r.segs.join('/') === keyAny);
      if (!known) {
        const key = `PROBE ${keyAny}`;
        if (!routes.has(key)) routes.set(key, { method: 'PROBE', segs, sources: [] });
        routes.get(key).sources.push(`${rel} (raw literal)`);
      }
    }
  }
  return [...routes.values()];
};

const classify = async (base, method, segs) => {
  const url = `${base}/${segs.map((s) => (s === ':p' ? 'probe_x' : encodeURIComponent(s))).join('/')}`;
  const methods = method === 'PROBE' ? ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] : [method];
  const attempts = [];
  for (const m of methods) {
    const res = await fetch(url, {
      method: m,
      headers: m === 'GET' || m === 'HEAD' ? {} : { 'content-type': 'application/json' },
      body: m === 'GET' || m === 'HEAD' ? undefined : JSON.stringify({ probe: 'r2-14' }),
      signal: AbortSignal.timeout(8000),
    }).catch((e) => ({ status: 0, text: async () => String(e) }));
    const bodyText = await res.text().catch(() => '');
    let err = null;
    try { err = JSON.parse(bodyText)?.error ?? null; } catch { /* non-JSON (text/event-stream/markdown) */ }
    attempts.push({ method: m, status: res.status, code: err?.code ?? null, message: err?.message ?? bodyText.slice(0, 120) });
    if (res.status === 405) continue; // try next method
    const noRoute = res.status === 404 && typeof err?.message === 'string' && err.message.startsWith('no route:');
    if (noRoute) return { kind: 'NO_ROUTE', attempts };
    if (res.status === 405) return { kind: 'METHOD_MISMATCH', attempts };
    if (res.status >= 200 && res.status < 300) return { kind: 'OK', attempts };
    if (res.status === 404) return { kind: 'EXISTS_404', attempts };
    if (res.status === 400 || res.status === 409 || res.status === 413 || res.status === 422) return { kind: 'EXISTS_VALID', attempts };
    if (res.status === 503) return { kind: 'EXISTS_UNAVAIL', attempts };
    return { kind: 'SERVER_DEFECT', attempts };
  }
  return { kind: 'ALL_405', attempts };
};

/** Advisory sub-scan: interactive handlers that visibly do nothing. */
const deadHandlerScan = () => {
  const findings = [];
  for (const f of walk(WEB_SRC, ['.tsx'])) {
    const text = fs.readFileSync(f, 'utf8');
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    if (/onClick=\{\(\) => \{\}\}|onClick=\{\(\) => undefined\}|onClick=\{noop\}/.test(text)) {
      findings.push({ severity: 'ADV', id: 'P2-DEAD-HANDLER', detail: `empty onClick handler: ${rel}` });
    }
  }
  return findings;
};

const main = async () => {
  const routes = extractClientRoutes();
  const { base, close } = await bootApiServer();
  const results = [];
  try {
    for (const r of routes) {
      const c = await classify(base, r.method, r.segs);
      results.push({ route: `/${r.segs.join('/')}`, declaredMethod: r.method, kind: c.kind, sources: r.sources, attempts: c.attempts });
    }
  } finally {
    await close();
  }

  const findings = [];
  for (const r of results) {
    if (r.kind === 'NO_ROUTE') findings.push({ severity: 'FAIL', id: 'P2-NO-ROUTE', detail: `client calls a route the server does not expose: ${r.declaredMethod === 'PROBE' ? '' : `${r.declaredMethod} `}${r.route} (from ${r.sources.join(', ')})` });
    else if (r.kind === 'METHOD_MISMATCH' || r.kind === 'ALL_405') findings.push({ severity: 'FAIL', id: 'P2-METHOD', detail: `method contract mismatch: ${r.route} (${r.kind})` });
    else if (r.kind === 'SERVER_DEFECT') findings.push({ severity: 'FAIL', id: 'P2-5XX', detail: `server 5xx on client-declared route: ${r.route} — ${JSON.stringify(r.attempts.at(-1))}` });
  }
  findings.push(...deadHandlerScan());

  const byKind = {};
  for (const r of results) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  const verdict = findings.some((f) => f.severity === 'FAIL') ? 'FAIL' : (findings.length > 0 ? 'ADVISORY' : 'PASS');
  finish('p2-route-contract', {
    probe: 'p2-route-contract',
    verdict,
    summary: `${results.length} client-declared routes probed against the real server: ${JSON.stringify(byKind)}`,
    findings,
    meta: { routes: results },
  });
};

main();
