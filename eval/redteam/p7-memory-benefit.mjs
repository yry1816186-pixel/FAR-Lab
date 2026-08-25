/**
 * P7 memory-benefit probe — "memory that stores but does not improve behavior" detector.
 *
 * Exercises the REAL memory plane end to end on a throwaway store:
 *  1. WRITE: consolidateRun on a completed run with a relation-participating,
 *     DOI-backed claim must persist semantic memory (itemsWritten > 0).
 *  2. IDEMPOTENCE: re-consolidation must replace, never duplicate (FTS row parity).
 *  3. COMPILE: memoryNegativeConditioning on a lexically-related next question
 *     must RETURN the stored finding (the read path a future run would use).
 *  4. CONSUME (static): the hypotheses stage must inject prior memory into the
 *     model call input (dist/pipeline/stages/hypotheses.js contains the
 *     priorResearchMemory wiring) — the stored fact actually reaches generation.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, distImport, finish, tempDir } from './lib.mjs';

const main = async () => {
  const { openDb } = await distImport('persistence/db.js');
  const { Store } = await distImport('persistence/store.js');
  const { consolidateRun, memoryNegativeConditioning } = await distImport('app/memory.js');
  const { newId } = await distImport('domain/index.js');

  const findings = [];
  const dataDir = tempDir('r14-mem-');
  const store = new Store(openDb(path.join(dataDir, 'far.db')));

  const run = store.createRun({
    id: newId('q'), text: 'does resveratrol extend lifespan in mice?', goalType: 'explanatory',
    createdAt: '2026-08-24T00:00:00.000Z', scope: { domain: 'gerontology', phenomena: ['lifespan'] }, constraints: {},
  });
  const doc = {
    id: newId('src'), runId: run.id, family: 'crossref',
    identifiers: [{ kind: 'doi', value: '10.1234/r14' }], title: 'A resveratrol lifespan study',
    contentDepth: 'abstract', accessState: 'unknown', contentHash: 'a'.repeat(64),
    retrievedAt: '2026-08-24T00:00:00.000Z', parseStatus: 'ok',
    verification: { method: 'crossref_doi', resolved: true, titleMatch: true, checkedAt: '2026-08-24T00:00:00.000Z' },
    createdAt: '2026-08-24T00:00:00.000Z',
  };
  store.putObject('source_document', doc);
  const claim = {
    id: newId('clm'), runId: run.id, text: 'resveratrol increases mean lifespan by 40% in mice',
    bindingStatus: 'verified', alignmentChecked: true, locators: [{ sourceDocumentId: doc.id, quote: 'resveratrol increases mean lifespan by 40% in mice' }],
  };
  store.putObject('claim', claim);
  store.putObject('evidence_relation', {
    id: newId('ev'), runId: run.id, claimId: claim.id, relation: 'supports',
    targetHypothesisId: newId('hyp'), rationale: 'same direction', strength: 'moderate',
    createdAt: '2026-08-24T00:00:00.000Z', uncertainties: [],
  });
  store.updateRun({ ...store.getRun(run.id), status: 'completed' });

  // 1. WRITE
  const consolidated = consolidateRun(store, run.id);
  const semantic = store.listMemory({ kind: 'semantic' });
  if (!(consolidated.itemsWritten > 0 && semantic.length === 1)) {
    findings.push({ severity: 'FAIL', id: 'P7-NO-WRITE', detail: `consolidation did not persist semantic memory (itemsWritten=${consolidated.itemsWritten}, semantic=${semantic.length})` });
  }

  // 2. IDEMPOTENCE + FTS parity (delete-then-insert, not accumulate)
  consolidateRun(store, run.id);
  const semantic2 = store.listMemory({ kind: 'semantic' });
  const db = store['db'];
  const memoryRows = db.prepare('SELECT COUNT(*) n FROM memory_items').get();
  const ftsRows = db.prepare('SELECT COUNT(*) n FROM memory_fts').get();
  if (semantic2.length !== 1 || memoryRows.n !== ftsRows.n) {
    findings.push({ severity: 'FAIL', id: 'P7-DUPLICATE', detail: `re-consolidation duplicated memory (semantic=${semantic2.length}, memory rows=${memoryRows.n}, fts rows=${ftsRows.n} — must be equal)` });
  }

  // 3. COMPILE: a lexically-related next question must surface the stored finding.
  const prior = memoryNegativeConditioning(store, 'does resveratrol extend lifespan in rats?');
  if (!Array.isArray(prior) || prior.length === 0) {
    findings.push({ severity: 'FAIL', id: 'P7-NO-COMPILE', detail: 'memoryNegativeConditioning returned nothing for a lexically-related next question — memory stored but never compiled back' });
  } else if (!String(prior[0]?.title ?? '').includes('resveratrol')) {
    findings.push({ severity: 'ADV', id: 'P7-COMPILE-MISMATCH', detail: `compiled memory does not reference the seeded finding: ${JSON.stringify(prior[0]).slice(0, 160)}` });
  }

  // 4. CONSUME: hypotheses stage injects prior memory into the model call input.
  const hypStageSrc = fs.readFileSync(path.join(ROOT, 'dist', 'pipeline', 'stages', 'hypotheses.js'), 'utf8');
  if (!hypStageSrc.includes('priorResearchMemory')) {
    findings.push({ severity: 'FAIL', id: 'P7-NOT-CONSUMED', detail: 'hypotheses stage does not reference priorResearchMemory — compiled memory never reaches generation' });
  }

  db.close();

  const verdict = findings.some((f) => f.severity === 'FAIL') ? 'FAIL' : (findings.length > 0 ? 'ADVISORY' : 'PASS');
  finish('p7-memory-benefit', {
    probe: 'p7-memory-benefit',
    verdict,
    summary: `write ${consolidated.itemsWritten > 0 ? 'OK' : 'BROKEN'}; idempotence ${semantic2.length === 1 && memoryRows.n === ftsRows.n ? 'OK' : 'BROKEN'} (memory=${memoryRows.n}/fts=${ftsRows.n}); compile ${prior.length > 0 ? 'OK' : 'BROKEN'}; consume wiring ${hypStageSrc.includes('priorResearchMemory') ? 'present' : 'MISSING'}`,
    findings,
    meta: { consolidated, semanticCount: semantic2.length, memoryRows: memoryRows.n, ftsRows: ftsRows.n, priorCount: prior.length },
  });
};

main();
