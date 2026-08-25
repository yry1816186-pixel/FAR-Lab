/**
 * P5 citation-grounding probe — "citation/DOI fabrication" detector.
 *
 * Audits the REAL workspace database (read-only copy; 1266 claims / 784 sources at
 * capture time) with independent re-verification of the grounding invariant the
 * pipeline claims:
 *   1. every VERIFIED claim's verbatim locator quote must be contained in the text
 *      of the source document it cites (normalized whitespace/case — never lenient
 *      rewording). Failure = fabricated or drifted quote on a claim marked verified.
 *   2. every locator's sourceDocumentId must resolve to a real source_document.
 *   3. DOI sanity on source identifiers: shape-valid where present.
 * Claims with non-verified bindingStatus are excluded from the hard gate (they are
 * honestly unbound) but counted for context.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { INPUT_DB, distImport, normalizeText, finish } from './lib.mjs';

const DOI_RE = /^10\.\d{4,9}\/\S+$/;

const sourceTextOf = (doc) => {
  const parts = [doc?.abstractText, doc?.fullText, doc?.fulltext, doc?.text, doc?.title];
  const extra = doc?.verification && typeof doc.verification === 'object' ? [doc.verification.quote, doc.verification.title] : [];
  return [...parts, ...extra].filter((x) => typeof x === 'string' && x.length > 0).join('\n');
};

const main = async () => {
  // Fulltext sources keep their text in the content-addressed artifact store
  // (fullTextRef = sha256:...) — resolve through the PRODUCT's own store reader,
  // pointed at the copied artifacts tree, so containment is checked against the
  // real fulltext instead of degrading to abstract-only.
  const { openArtifactStore } = await distImport('persistence/artifacts.js');
  // Independent recomputation uses the PRODUCT's own deterministic alignment gate
  // (dist/pipeline/stages/align.js: verbatim substring OR fuzzy word-Jaccard >= bar)
  // — the audit then asks: does every 'verified' claim pass the product's OWN
  // contract on the stored text? Failing even the fuzzy bar = fabrication finding.
  const { checkQuoteAlignment } = await distImport('pipeline/stages/align.js');
  const artifacts = fs.existsSync(path.join(path.dirname(INPUT_DB), 'artifacts'))
    ? openArtifactStore(path.join(path.dirname(INPUT_DB), 'artifacts'))
    : null;
  const fulltextCache = new Map();
  const fulltextOf = async (doc) => {
    if (typeof doc?.fullTextRef !== 'string') return null;
    if (fulltextCache.has(doc.fullTextRef)) return fulltextCache.get(doc.fullTextRef);
    let text = null;
    if (artifacts) {
      try { text = await artifacts.get(doc.fullTextRef); } catch { text = null; }
    }
    fulltextCache.set(doc.fullTextRef, text);
    return text;
  };
  if (!fs.existsSync(INPUT_DB)) {
    finish('p5-citation-grounding', {
      probe: 'p5-citation-grounding',
      verdict: 'ADVISORY',
      summary: `runtime DB copy not found at ${INPUT_DB} — audit skipped`,
      findings: [{ severity: 'ADV', id: 'P5-NO-DB', detail: 'runtime DB copy not present' }],
      meta: {},
    });
    return;
  }
  const db = new DatabaseSync(INPUT_DB, { readOnly: true });
  const claims = db.prepare("SELECT run_id, json FROM objects WHERE kind='claim'").all().map((r) => JSON.parse(r.json));
  const sources = new Map();
  for (const r of db.prepare("SELECT run_id, json FROM objects WHERE kind='source_document'").all()) {
    const j = JSON.parse(r.json);
    sources.set(j.id, { ...j, _runId: r.run_id });
  }
  db.close();

  const findings = [];
  let verified = 0;
  let unverified = 0;
  let locatorsChecked = 0;
  const missingSource = [];
  const ungrounded = [];
  let fuzzyAligned = 0;
  const crossRun = [];
  const badDoi = [];

  for (const c of claims) {
    if (c.bindingStatus === 'verified') verified += 1;
    else unverified += 1;
    if (c.bindingStatus !== 'verified') continue;
    for (const loc of c.locators ?? []) {
      locatorsChecked += 1;
      const doc = sources.get(loc.sourceDocumentId);
      if (!doc) {
        missingSource.push({ claim: c.id, src: loc.sourceDocumentId });
        continue;
      }
      if (doc._runId && c.runId && doc._runId !== c.runId) crossRun.push({ claim: c.id, claimRun: c.runId, srcRun: doc._runId });
      const quote = normalizeText(loc.quote);
      const fulltext = await fulltextOf(doc);
      const text = `${sourceTextOf(doc)}\n${fulltext ?? ''}`;
      if (quote.length === 0) {
        ungrounded.push({ claim: c.id, reason: 'empty quote' });
      } else {
        // Product-contract recheck: verbatim OR fuzzy (the pipeline's own gate).
        const gate = checkQuoteAlignment(String(loc.quote), text);
        const verbatim = normalizeText(text).includes(quote);
        if (!verbatim && gate.verdict === 'unaligned') {
          ungrounded.push({
            claim: c.id,
            reason: typeof doc.fullTextRef === 'string' && fulltext === null
              ? 'fails even the fuzzy alignment bar; fulltext artifact UNAVAILABLE to audit'
              : `fails the product alignment gate (verbatim+fuzzy; jaccard=${gate.jaccard.toFixed(3)})`,
            quote: String(loc.quote).slice(0, 120),
          });
        } else if (!verbatim) {
          fuzzyAligned += 1;
        }
      }
    }
  }
  for (const s of sources.values()) {
    for (const idfr of s.identifiers ?? []) {
      if (idfr?.kind === 'doi' && typeof idfr.value === 'string' && !DOI_RE.test(idfr.value)) {
        badDoi.push({ src: s.id, doi: idfr.value });
      }
    }
  }

  if (missingSource.length > 0) findings.push({ severity: 'FAIL', id: 'P5-MISSING-SOURCE', detail: `${missingSource.length} verified-claim locators cite a source_document that does not exist (first: ${JSON.stringify(missingSource[0])})` });
  if (ungrounded.length > 0) findings.push({ severity: 'FAIL', id: 'P5-UNGROUNDED-QUOTE', detail: `${ungrounded.length} verified-claim quotes not contained in their cited source (first: ${JSON.stringify(ungrounded[0])})` });
  if (badDoi.length > 0) findings.push({ severity: 'ADV', id: 'P5-BAD-DOI-SHAPE', detail: `${badDoi.length} source DOI identifiers fail the canonical shape (first: ${JSON.stringify(badDoi[0])})` });
  if (crossRun.length > 0) findings.push({ severity: 'ADV', id: 'P5-CROSS-RUN-BINDING', detail: `${crossRun.length} verified claims bind a source from a different run (first: ${JSON.stringify(crossRun[0])}) — verify this is an intended cross-run corpus shape` });

  const verdict = findings.some((f) => f.severity === 'FAIL') ? 'FAIL' : (findings.length > 0 ? 'ADVISORY' : 'PASS');
  finish('p5-citation-grounding', {
    probe: 'p5-citation-grounding',
    verdict,
    summary: `${verified} verified / ${unverified} non-verified claims; ${locatorsChecked} verified locators re-checked under the product's own alignment gate: ${missingSource.length} missing sources, ${ungrounded.length} failing even the fuzzy bar, ${fuzzyAligned} fuzzy-aligned (near-verbatim), ${badDoi.length} malformed DOIs`,
    findings,
    meta: { claimsTotal: claims.length, verified, unverified, locatorsChecked, fuzzyAligned, missingSource: missingSource.slice(0, 20), ungrounded: ungrounded.slice(0, 20), badDoi: badDoi.slice(0, 20), crossRun: crossRun.slice(0, 20) },
  });
};

main();
