#!/usr/bin/env node
/**
 * endgame-sweep adjudication applier.
 *
 * Ingests agent/auditor verdict JSON ({verdicts:[{path,status,note,findingIds}]})
 * into .control/SWEEP-LOG.json under the ledger's own invariants:
 *   - only pending entries are touched (re-adjudication goes through sync/fresh review);
 *   - finding ids must already exist in FINAL_ACCEPTANCE.json — unknown ids are
 *     REJECTED and listed for human triage (register the FA item first);
 *   - reviewed_blob binding is stamped so `check` accepts the state.
 * Usage: node zcode-harness/scripts/sweep-apply.mjs <verdicts.json>
 */
import fs from 'node:fs';

const verdictFile = process.argv[2];
if (verdictFile === undefined) {
  process.stderr.write('usage: sweep-apply.mjs <verdicts.json>\n');
  process.exit(2);
}
const logPath = '.control/SWEEP-LOG.json';
const faIds = new Set(JSON.parse(fs.readFileSync('FINAL_ACCEPTANCE.json', 'utf8')).items.map((i) => i.id));
const log = JSON.parse(fs.readFileSync(logPath, 'utf8'));
const { verdicts } = JSON.parse(fs.readFileSync(verdictFile, 'utf8'));

const byPath = new Map();
for (const table of Object.keys(log.tables)) {
  for (const entry of log.tables[table]) byPath.set(entry.path, entry);
}

const rejected = [];
let applied = 0;
for (const v of verdicts) {
  const entry = byPath.get(v.path);
  if (entry === undefined) { rejected.push({ path: v.path, reason: 'not-in-ledger' }); continue; }
  if (entry.status !== 'pending') { rejected.push({ path: v.path, reason: `already-${entry.status}` }); continue; }
  const badFindings = (v.findingIds ?? []).filter((id) => !faIds.has(id));
  if (badFindings.length > 0) { rejected.push({ path: v.path, reason: `unknown-findingIds:${badFindings.join(',')}`, note: v.note }); continue; }
  entry.status = v.status;
  if (v.note !== undefined && v.note !== '') entry.rationale = v.note;
  if (v.findingIds !== undefined && v.findingIds.length > 0) entry.findingIds = v.findingIds;
  entry.reviewedAt = new Date().toISOString();
  entry.reviewedBlobSha256 = entry.blobSha256;
  applied += 1;
}

const tmp = `${logPath}.tmp-${process.pid}`;
fs.writeFileSync(tmp, `${JSON.stringify(log, null, 2)}\n`);
fs.renameSync(tmp, logPath);
process.stdout.write(`${JSON.stringify({ applied, rejectedCount: rejected.length, rejected }, null, 2)}\n`);
