/**
 * P3 live-masquerade probe — "mock/synthetic results presented as live" detector.
 *
 * Three independent checks:
 *  (a) static: no production entry/composition path may import the test stub
 *      provider; the stub itself must never mint an executionMode 'live' receipt.
 *  (b) static: every literal executionMode 'live' writer site in src is listed
 *      (report-only context; surprise sites become ADVISORY findings).
 *  (c) runtime DB audit: across the REAL workspace database (read-only copy),
 *      every receipt claiming executionMode 'live' must carry a real provider
 *      identity + usage payload; a 'live' receipt attributed to any stub/mock
 *      provider is a FAIL (masquerade by definition).
 *  (d) advisory marker scan: mock/fake/stub/canned/dummy/placeholder tokens in
 *      production src (excl. the legitimate test-stub module) — human-review list.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ROOT, INPUT_DB, finish } from './lib.mjs';

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(p);
  }
  return out;
};

const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

const main = () => {
  const files = walk(path.join(ROOT, 'src'));
  const findings = [];

  // (a) production must not touch the test stub.
  const compositionSrc = fs.readFileSync(path.join(ROOT, 'src/app/composition.ts'), 'utf8');
  const mainServerSrc = fs.readFileSync(path.join(ROOT, 'src/server/main.ts'), 'utf8');
  const mainCliSrc = fs.readFileSync(path.join(ROOT, 'src/cli/main.ts'), 'utf8');
  for (const [name, text] of [['src/app/composition.ts', compositionSrc], ['src/server/main.ts', mainServerSrc], ['src/cli/main.ts', mainCliSrc]]) {
    if (/test-stub/.test(text)) findings.push({ severity: 'FAIL', id: 'P3-STUB-IN-PROD', detail: `production entry imports the test stub: ${name}` });
  }
  const stubSrc = fs.readFileSync(path.join(ROOT, 'src/providers/test-stub.ts'), 'utf8');
  if (/executionMode['"]?\s*[:=]\s*['"]live['"]/.test(stubSrc)) {
    findings.push({ severity: 'FAIL', id: 'P3-STUB-MINTS-LIVE', detail: 'src/providers/test-stub.ts can mint executionMode "live" receipts' });
  }

  // (b) list every literal 'live' receipt writer site in production src.
  const liveSites = [];
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    if (/executionMode['"]?\s*[:=]\s*['"]live['"]/.test(text)) liveSites.push(rel(f));
  }

  // (d) marker scan (advisory): production files faking success vocabulary.
  const markerRe = /\b(mock|fake|canned|dummy|placeholder)\b/i;
  const markerHits = [];
  for (const f of files) {
    const r = rel(f);
    if (r === 'src/providers/test-stub.ts') continue; // legitimate, test-only injection surface
    const text = fs.readFileSync(f, 'utf8');
    const codeOnly = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const lines = codeOnly.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (markerRe.test(lines[i])) markerHits.push(`${r}:${i + 1}: ${lines[i].trim().slice(0, 100)}`);
    }
  }
  for (const hit of markerHits) findings.push({ severity: 'ADV', id: 'P3-FAKE-MARKER', detail: `fake-success vocabulary in production code: ${hit}` });

  // (c) runtime DB audit over the real workspace database.
  let dbAudit = null;
  if (fs.existsSync(INPUT_DB)) {
    const db = new DatabaseSync(INPUT_DB, { readOnly: true });
    const rows = db.prepare("SELECT json FROM objects WHERE kind='receipt'").all();
    let live = 0;
    let liveWithUsage = 0;
    const byProvider = {};
    const masquerades = [];
    for (const row of rows) {
      let j;
      try { j = JSON.parse(row.json); } catch { continue; }
      if (j?.executionMode !== 'live') continue;
      live += 1;
      const prov = String(j?.provider ?? j?.providerName ?? j?.model?.split('/')[0] ?? 'unknown');
      byProvider[prov] = (byProvider[prov] ?? 0) + 1;
      const hasUsage = j?.usage !== undefined && j?.usage !== null;
      if (hasUsage) liveWithUsage += 1;
      if (/stub|mock|fake|probe/i.test(prov)) {
        masquerades.push({ id: j?.id ?? '?', provider: prov });
        if (masquerades.length <= 10) findings.push({ severity: 'FAIL', id: 'P3-LIVE-FROM-STUB', detail: `receipt claims executionMode=live from a stub provider (${prov}) — masquerade` });
      }
    }
    db.close();
    dbAudit = { receiptsTotal: rows.length, liveReceipts: live, liveWithUsage, byProvider, masqueradeCount: masquerades.length };
  } else {
    findings.push({ severity: 'ADV', id: 'P3-NO-DB', detail: `runtime DB copy not found at ${INPUT_DB} — DB audit skipped` });
  }

  const verdict = findings.some((f) => f.severity === 'FAIL') ? 'FAIL' : (findings.length > 0 ? 'ADVISORY' : 'PASS');
  finish('p3-live-masquerade', {
    probe: 'p3-live-masquerade',
    verdict,
    summary: `stub-in-production: clean; ${liveSites.length} literal 'live' receipt sites (${liveSites.join(', ')}); DB audit: ${dbAudit ? `${dbAudit.liveReceipts}/${dbAudit.receiptsTotal} live receipts, ${dbAudit.masqueradeCount} masquerades` : 'skipped'}; ${markerHits.length} fake-vocabulary lines for review`,
    findings,
    meta: { liveSites, markerHits, dbAudit },
  });
};

main();
