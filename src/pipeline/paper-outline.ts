import { PaperOutline, RELATION_POLARITY } from '../domain/index.js';
import type { EvidenceRelation, ScientificClaim, SourceDocument } from '../domain/index.js';
import type { Store } from '../persistence/store.js';

/**
 * BP-3 research-product layer. `buildPaperOutline` projects the STORED run objects into
 * an IMRaD paper outline; `renderPaperMarkdown` renders it to markdown. Both are pure
 * and deterministic: zero LLM calls, zero network, no wall-clock reads inside the
 * projection (the caller supplies `now`). Missing store objects degrade honestly — null
 * refs, empty sections and disclosed counts — and dangling references are dropped, never
 * rendered as if they resolved.
 */

export interface BuildPaperOutlineOptions {
  /** Timestamp recorded in provenance.generatedAt; the caller owns the clock. */
  now?: string;
}

/** Max abstract points per source kind — the abstract summarizes, sections enumerate. */
const ABSTRACT_MAX_HYPOTHESES = 3;
const ABSTRACT_MAX_VERDICTS = 3;
const ABSTRACT_MAX_CLAIMS = 2;
/** Introduction contributions = top-N ranked hypotheses (paper convention). */
const TOP_N_HYPOTHESES = 3;

const PROVENANCE_NOTE =
  'Deterministic projection of stored run objects (question, sources, claims, evidence relations, ' +
  'hypotheses, scorecards, tournament, evidence bodies, ACH analysis, plan, experiment stat reports); ' +
  'zero LLM/network calls; missing objects degrade to null refs and disclosed counts.';

// ---------------------------------------------------------------------------
// deterministic helpers
// ---------------------------------------------------------------------------

/** Stable order for rank-sorted scorecards: rank asc, then id asc (tie-break). */
const byRankThenId = (a: { rank: number; hypothesisId: string }, b: { rank: number; hypothesisId: string }): number =>
  a.rank - b.rank || (a.hypothesisId < b.hypothesisId ? -1 : 1);

/** Stable order for stat reports: createdAt asc, then id asc. */
const byCreatedAtThenId = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number =>
  (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0) || (a.id < b.id ? -1 : 1);

// ---------------------------------------------------------------------------
// BibTeX (deterministic, from stored metadata only — no network, no invented fields)
// ---------------------------------------------------------------------------

/** Escape LaTeX specials in field values. Single pass — inserted backslashes are not rescanned. */
const escapeBibtex = (s: string): string => s.replace(/[\\{}%&#_$~]/g, (c) => `\\${c}`);

/** Keep only chars legal in a BibTeX key. */
const sanitizeKeyPart = (s: string): string => s.replace(/[^a-zA-Z0-9_-]/g, '');

/** Last whitespace-separated token of the first author ("A. Researcher" -> "Researcher"). */
const surnameOf = (authors: readonly string[]): string => {
  const first = authors[0];
  if (first === undefined || first.trim().length === 0) return 'anonymous';
  const token = sanitizeKeyPart(first.trim().split(/\s+/).at(-1) ?? '');
  return token.length > 0 ? token : 'anonymous';
};

/** First sanitized word of the title; 'untitled' when nothing usable remains. */
const firstTitleWord = (title: string): string => {
  const word = sanitizeKeyPart(title.trim().split(/\s+/)[0] ?? '');
  return word.length > 0 ? word : 'untitled';
};

interface BibtexEntry {
  key: string;
  bibtex: string;
  sourceDocumentId: string;
}

/**
 * One @article/@misc entry per cited source. @article only when BOTH venue and year are
 * on file; otherwise @misc with an honest note. Fields with no stored value are omitted —
 * authors/years are never invented.
 */
const buildBibtexEntry = (source: SourceDocument, disambiguate: (base: string) => string): BibtexEntry => {
  const doi = source.identifiers.find((i) => i.kind === 'doi')?.value;
  const arxiv = source.identifiers.find((i) => i.kind === 'arxiv')?.value;
  const hasVenue = source.venue !== undefined && source.venue.trim().length > 0;
  const isArticle = hasVenue && source.publicationYear !== undefined;

  const key = disambiguate(
    `${surnameOf(source.authors)}${source.publicationYear !== undefined ? source.publicationYear : 'nd'}${firstTitleWord(source.title)}`,
  );

  const fields: string[] = [];
  if (source.authors.length > 0) fields.push(`  author = {${escapeBibtex(source.authors.join(' and '))}}`);
  fields.push(`  title = {${escapeBibtex(source.title)}}`);
  if (isArticle && source.venue !== undefined) fields.push(`  journal = {${escapeBibtex(source.venue)}}`);
  if (source.publicationYear !== undefined) fields.push(`  year = {${source.publicationYear}}`);
  if (doi !== undefined) fields.push(`  doi = {${escapeBibtex(doi)}}`);

  const noteParts: string[] = [];
  if (arxiv !== undefined) noteParts.push(`arXiv: ${arxiv}`);
  if (!isArticle && hasVenue && source.venue !== undefined) noteParts.push(`venue on file (year unknown): ${source.venue}`);
  if (!isArticle && doi === undefined && arxiv === undefined && !hasVenue) {
    noteParts.push('no DOI/arXiv identifier or venue on file');
  }
  if (!isArticle || noteParts.length > 0) {
    const note = noteParts.length > 0 ? noteParts.join('; ') : 'no additional publication metadata on file';
    fields.push(`  note = {${escapeBibtex(note)}}`);
  }

  const type = isArticle ? 'article' : 'misc';
  return { key, bibtex: `@${type}{${key},\n${fields.join(',\n')}\n}`, sourceDocumentId: source.id };
};

/** Deterministic key allocation: first come first served; collisions get a/b/c suffixes. */
const keyAllocator = (): ((base: string) => string) => {
  const used = new Set<string>();
  return (base: string): string => {
    if (!used.has(base)) {
      used.add(base);
      return base;
    }
    for (let i = 0; ; i += 1) {
      const candidate = `${base}${String.fromCharCode(97 + i)}`; // basea, baseb, ...
      if (!used.has(candidate)) {
        used.add(candidate);
        return candidate;
      }
    }
  };
};

// ---------------------------------------------------------------------------
// builder
// ---------------------------------------------------------------------------

export const buildPaperOutline = (store: Store, runId: string, opts: BuildPaperOutlineOptions = {}): PaperOutline => {
  const run = store.getRun(runId);
  if (run === null) throw new Error(`buildPaperOutline: run not found: ${runId}`);

  const question = store.getObject('question', run.questionId);
  const sources = store.listObjects('source_document', runId);
  const claims = store.listObjects('claim', runId);
  const relations = store.listObjects('evidence_relation', runId);
  const hypotheses = store.listObjects('hypothesis', runId);
  const scorecards = store.listObjects('scorecard', runId).sort(byRankThenId);
  const tournament = store.listObjects('tournament', runId).at(-1) ?? null;
  const evidenceBodies = store.listObjects('evidence_body', runId);
  const ach = store.listObjects('ach_analysis', runId).at(-1) ?? null;
  const plan = store.listObjects('plan', runId).at(-1) ?? null;
  const experimentRuns = store.listObjects('experiment_run', runId);
  const statReports = store.listObjects('stat_report', runId).sort(byCreatedAtThenId);
  const experimentSpecs = store.listObjects('experiment_spec', runId);

  const hypById = new Map(hypotheses.map((h) => [h.id as string, h] as const));
  const claimById = new Map(claims.map((c) => [c.id as string, c] as const));
  const sourceById = new Map(sources.map((s) => [s.id as string, s] as const));

  // Ranked representatives: scorecard order when ranking happened; otherwise every stored
  // hypothesis in store order with rank=null (honest: unranked, not invented ranks).
  const representatives =
    scorecards.length > 0
      ? scorecards.flatMap((sc) => {
          const hyp = hypById.get(sc.hypothesisId);
          return hyp !== undefined ? [{ hyp, rank: sc.rank as number | null }] : [];
        })
      : hypotheses.map((hyp) => ({ hyp, rank: null as number | null }));
  const representativeIds = new Set(representatives.map((r) => r.hyp.id as string));
  const top = representatives.slice(0, TOP_N_HYPOTHESES);

  // Stat-report joins: tournament standings, evidence bodies, spec comparison thresholds.
  const standingsByHyp = new Map((tournament?.standings ?? []).map((s) => [s.hypothesisId as string, s] as const));
  const bodyByHyp = new Map(evidenceBodies.map((b) => [b.hypothesisId as string, b] as const));
  const thresholdByComparison = new Map<string, number>();
  for (const spec of experimentSpecs) {
    for (const cmp of spec.comparisons) thresholdByComparison.set(cmp.id, cmp.threshold);
  }

  const results = representatives.map(({ hyp, rank }) => ({
    hypothesisId: hyp.id,
    statement: hyp.statement,
    rank,
    btScore: standingsByHyp.get(hyp.id)?.btScore ?? null,
    winRate: standingsByHyp.get(hyp.id)?.winRate ?? null,
    evidenceBand: bodyByHyp.get(hyp.id)?.logLrBand ?? null,
    experimentVerdicts: statReports
      .filter((rep) => rep.hypothesisId === hyp.id)
      .map((rep) => ({
        comparison: rep.comparisonId,
        metric: rep.metricKey,
        verdict: rep.verdict ?? null,
        ciLow: rep.ci.low,
        ciHigh: rep.ci.high,
        threshold: thresholdByComparison.get(rep.comparisonId) ?? null,
      })),
  }));

  // ---- abstract: bounded, every point citing its source object ----
  const experimentRunIds = new Set(experimentRuns.map((x) => x.id as string));
  const abstractPoints: PaperOutline['abstractPoints'] = [];
  for (const { hyp, rank } of top) {
    abstractPoints.push({
      text: `Top-ranked hypothesis (rank ${rank ?? 'unranked'}): ${hyp.statement}`,
      sourceRef: { kind: 'hypothesis', id: hyp.id },
    });
  }
  const topIds = new Set(top.map((t) => t.hyp.id as string));
  for (const rep of statReports) {
    if (abstractPoints.length >= ABSTRACT_MAX_HYPOTHESES + ABSTRACT_MAX_VERDICTS) break;
    if (rep.hypothesisId === undefined || !topIds.has(rep.hypothesisId)) continue;
    if (!experimentRunIds.has(rep.experimentRunId)) continue; // dangling run ref — dropped
    if (rep.verdict === undefined) continue;
    abstractPoints.push({
      text: `Experiment verdict "${rep.verdict}" on comparison ${rep.comparisonId} (${rep.metricKey}; ${rep.ci.level.toFixed(2)} CI [${rep.ci.low.toFixed(4)}, ${rep.ci.high.toFixed(4)}])`,
      sourceRef: { kind: 'experiment', id: rep.experimentRunId },
    });
  }
  const seenClaimRefs = new Set<string>();
  for (const { hyp } of top) {
    if (abstractPoints.length >= ABSTRACT_MAX_HYPOTHESES + ABSTRACT_MAX_VERDICTS + ABSTRACT_MAX_CLAIMS) break;
    for (const cid of hyp.supportingClaimIds) {
      const claim = claimById.get(cid);
      if (claim === undefined || claim.bindingStatus !== 'verified' || seenClaimRefs.has(cid)) continue;
      seenClaimRefs.add(cid);
      abstractPoints.push({
        text: `Grounded in verified literature claim: ${claim.text}`,
        sourceRef: { kind: 'claim', id: claim.id },
      });
      break; // one verified claim per hypothesis is enough for an abstract
    }
  }

  // ---- introduction: gap statement (counts only) + contributions ----
  const supportingRelations = relations.filter(
    (r) => r.targetHypothesisId !== undefined && RELATION_POLARITY[r.relation] === 'supporting',
  ).length;
  const counterRelations = relations.filter(
    (r) => r.targetHypothesisId !== undefined && RELATION_POLARITY[r.relation] === 'counter',
  ).length;
  const gapStatement = question === null
    ? 'The research question object is missing from the store; the gap statement cannot be projected from stored objects (honest degradation).'
    : `Within this run's retrieved corpus (${sources.length} sources, ${claims.length} claims), the question "${question.text}" remains open: ${supportingRelations} supporting and ${counterRelations} counter-evidence relations are on record against its hypotheses.`;

  // ---- methods: plan projection ----
  const methods: PaperOutline['methods'] = {
    planRef: plan?.id ?? null,
    stepsSummary: plan !== null
      ? plan.steps.map((s) => ({ stepTitle: s.title, description: s.method }))
      : [],
    preregistration: {
      frozen: plan?.frozenAt !== undefined,
      ...(plan?.planHash !== undefined ? { planHash: plan.planHash } : {}),
      ...(plan?.multipleTestingPolicy !== undefined ? { multipleTestingPolicy: plan.multipleTestingPolicy } : {}),
    },
  };

  // ---- discussion: ACH-derived ordering interpretation + counter evidence ----
  const orderingInterpretation = ach === null
    ? 'No ACH analysis object is stored for this run: hypothesis-ordering fragility (diagnosticity and removal sensitivity) could not be assessed.'
    : ach.removalSensitivity.stable
      ? `ACH removal sensitivity: removing the top-${ach.removalSensitivity.removedTopK} most diagnostic claims causes ${ach.removalSensitivity.inversions} ordering inversion(s) — the evidence-total ordering is stable under that stress test; ${ach.diagnosticity.length} claim(s) carry diagnosticity scores.`
      : `ACH removal sensitivity: removing the top-${ach.removalSensitivity.removedTopK} most diagnostic claims causes ${ach.removalSensitivity.inversions} ordering inversion(s) — the ordering is FRAGILE under that stress test; ${ach.diagnosticity.length} claim(s) carry diagnosticity scores.`;

  const counterEvidenceHighlights = relations
    .filter(
      (r): r is EvidenceRelation & { claimId: string; targetHypothesisId: string } =>
        r.claimId !== undefined && r.targetHypothesisId !== undefined
        && representativeIds.has(r.targetHypothesisId)
        && RELATION_POLARITY[r.relation] === 'counter',
    )
    .flatMap((r) => {
      const claim = claimById.get(r.claimId);
      if (claim === undefined) return []; // dangling claim ref — dropped, never rendered
      return [{ claimId: claim.id, text: claim.text, relation: r.relation }];
    });

  // ---- conclusion: open falsifications + FULL uncertainty inventory (monotonic) ----
  const conclusion: PaperOutline['conclusion'] = {
    openFalsificationConditions: representatives
      .filter(({ hyp }) => hyp.falsification !== undefined)
      .map(({ hyp }) => ({ hypothesisId: hyp.id, condition: hyp.falsification!.falsificationCondition })),
    openUncertainties: hypotheses.flatMap((h) =>
      h.uncertainties.map((text) => ({ hypothesisId: h.id, text })),
    ),
  };

  // ---- limitations: deterministic synthesis, every line citing real counts ----
  const limitations: PaperOutline['limitations'] = [];
  {
    const metadataOnly = sources.filter((s) => s.contentDepth === 'metadata_only').length;
    const abstractOnly = sources.filter((s) => s.contentDepth === 'abstract').length;
    const fullTextOrData = sources.filter((s) => s.contentDepth === 'full_text' || s.contentDepth === 'data').length;
    limitations.push({
      category: 'evidence_ceiling',
      detail: `${metadataOnly} metadata-only and ${abstractOnly} abstract-only of ${sources.length} retrieved sources; only ${fullTextOrData} reached full-text/data depth. Claim extraction and every downstream judgment are capped at that depth.`,
      counts: { sources: sources.length, metadataOnly, abstractOnly, fullTextOrData },
    });
  }
  {
    const dims = scorecards.flatMap((s) => s.dimensions);
    const uncalibrated = dims.filter((d) => d.calibration === 'uncalibrated_llm_judgment').length;
    const share = dims.length > 0 ? Math.round((100 * uncalibrated) / dims.length) : 0;
    limitations.push({
      category: 'uncalibrated_judgment_density',
      detail: `${uncalibrated}/${dims.length} scorecard dimension scores carry calibration='uncalibrated_llm_judgment' (${share}%): inspectable decision aids, not calibrated probabilities.`,
      counts: { dimensions: dims.length, uncalibratedLlmJudgment: uncalibrated },
    });
  }
  {
    const withSpec = hypotheses.filter((h) => h.falsification !== undefined);
    const modelStipulated = withSpec.filter((h) => h.falsification?.decisionRuleProvenance === 'model-stipulated').length;
    const mixed = withSpec.filter((h) => h.falsification?.decisionRuleProvenance === 'mixed').length;
    limitations.push({
      category: 'stipulated_thresholds',
      detail: `${modelStipulated + mixed}/${hypotheses.length} hypotheses have decision-rule thresholds of model-stipulated or mixed provenance (${modelStipulated} model-stipulated, ${mixed} mixed) — such thresholds carry no evidence source.`,
      counts: { hypotheses: hypotheses.length, modelStipulated, mixed },
    });
  }
  {
    const verified = claims.filter((c) => c.bindingStatus === 'verified').length;
    const resolvedUnaligned = claims.filter((c) => c.bindingStatus === 'resolved_unaligned').length;
    const unresolved = claims.filter((c) => c.bindingStatus === 'unresolved').length;
    const missing = claims.filter((c) => c.bindingStatus === 'missing').length;
    limitations.push({
      category: 'unresolved_source_verification',
      detail: `${verified}/${claims.length} claims are bindingStatus='verified'; ${claims.length - verified} are not: ${resolvedUnaligned} resolved_unaligned (source resolved but retrieved content does not cover the claim — called out separately), ${unresolved} unresolved, ${missing} missing.`,
      counts: { claims: claims.length, verified, resolvedUnaligned, unresolved, missing },
    });
  }
  {
    const singleSource = evidenceBodies.filter((b) => b.independentSources < 2).length;
    limitations.push({
      category: 'single_source_evidence_bodies',
      detail: `${singleSource}/${evidenceBodies.length} evidence bodies rest on fewer than 2 independent sources; single-source evidence is explicitly downgraded, never presented as independent confirmation.`,
      counts: { evidenceBodies: evidenceBodies.length, singleSource },
    });
  }
  {
    const withVerdict = representatives.filter(({ hyp }) =>
      statReports.some((rep) => rep.hypothesisId === hyp.id && rep.verdict !== undefined),
    ).length;
    limitations.push({
      category: 'experiment_coverage',
      detail: `Only ${withVerdict}/${representatives.length} ranked hypotheses have any persisted experiment verdict (stat_report); the remaining ${representatives.length - withVerdict} are ranked on literature evidence alone.`,
      counts: {
        rankedHypotheses: representatives.length,
        withExperimentVerdict: withVerdict,
        withoutExperimentVerdict: representatives.length - withVerdict,
      },
    });
  }
  {
    const hypsWithUncertainty = hypotheses.filter((h) => h.uncertainties.length > 0).length;
    limitations.push({
      category: 'uncertainty_inventory',
      detail: `${conclusion.openUncertainties.length} uncertainty entries across ${hypsWithUncertainty} hypotheses remain open; they are monotonic (never silently resolved) and carried verbatim in Section 6.`,
      counts: { hypotheses: hypotheses.length, hypothesesWithUncertainties: hypsWithUncertainty, uncertaintyEntries: conclusion.openUncertainties.length },
    });
  }

  // ---- references: cited sources (top hypotheses' claim grounding), BibTeX from stored metadata ----
  const citedClaimIds = new Set<string>();
  for (const { hyp } of top) {
    for (const cid of [...hyp.supportingClaimIds, ...hyp.counterClaimIds]) citedClaimIds.add(cid);
  }
  const citedSourceIds: string[] = [];
  const seenSourceIds = new Set<string>();
  for (const cid of [...citedClaimIds].sort()) {
    const claim: ScientificClaim | undefined = claimById.get(cid);
    const sourceId = claim?.locators[0]?.sourceDocumentId;
    if (sourceId === undefined || seenSourceIds.has(sourceId)) continue;
    seenSourceIds.add(sourceId);
    citedSourceIds.push(sourceId);
  }
  // Deterministic encounter order INDEPENDENT of random object ids (a claim-id sort is
  // per-store stable but run-to-run random, which made DOI dedupe flip winners).
  // Canonical record wins: resolved verification first, then earliest retrieval, then
  // content hash — a fully derived total order.
  citedSourceIds.sort((a, b) => {
    const sa = sourceById.get(a);
    const sb = sourceById.get(b);
    if (sa === undefined || sb === undefined) return a < b ? -1 : 1;
    const ra = sa.verification?.resolved === true ? 0 : 1;
    const rb = sb.verification?.resolved === true ? 0 : 1;
    if (ra !== rb) return ra - rb;
    const ta = sa.retrievedAt ?? '';
    const tb = sb.retrievedAt ?? '';
    if (ta !== tb) return ta < tb ? -1 : 1;
    return sa.contentHash < sb.contentHash ? -1 : sa.contentHash > sb.contentHash ? 1 : 0;
  });
  const allocateKey = keyAllocator();
  const seenIdentifierKeys = new Set<string>();
  const references = citedSourceIds
    .flatMap((sid) => {
      const source = sourceById.get(sid);
      if (source === undefined) return []; // locator points outside this run's corpus — dropped
      // Dedupe by DOI/arXiv: the same paper surfaced by two families yields ONE entry.
      const identifier =
        source.identifiers.find((i) => i.kind === 'doi')?.value
        ?? source.identifiers.find((i) => i.kind === 'arxiv')?.value;
      const dedupeKey = identifier !== undefined ? identifier : source.id;
      if (seenIdentifierKeys.has(dedupeKey)) return [];
      seenIdentifierKeys.add(dedupeKey);
      return [buildBibtexEntry(source, allocateKey)];
    })
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ key, bibtex, sourceDocumentId }) => ({ key, bibtex, sourceDocumentId }));

  return PaperOutline.parse({
    title: question !== null ? question.text : `Untitled research product (question object missing for run ${run.id})`,
    runId: run.id,
    abstractPoints,
    introduction: {
      gapStatement,
      contributions: top.map(({ hyp }) => ({ hypothesisId: hyp.id, statement: hyp.statement })),
    },
    methods,
    results,
    discussion: { orderingInterpretation, counterEvidenceHighlights },
    conclusion,
    limitations,
    references,
    provenance: {
      generatedAt: opts.now ?? new Date().toISOString(),
      deterministic: true,
      note: PROVENANCE_NOTE,
    },
  });
};

// ---------------------------------------------------------------------------
// markdown renderer (English IMRaD skeleton; pure function of the outline)
// ---------------------------------------------------------------------------

const STANDING_DISCLOSURE =
  'Standing disclosure: all LLM-produced judgments in this product (scorecard scores, novelty labels, ' +
  'relation rationales) are UNCALIBRATED decision aids — inspectable inputs to a decision, not objective ' +
  'probabilities or established facts.';

const refLabel = (ref: PaperOutline['abstractPoints'][number]['sourceRef']): string =>
  `${ref.kind} \`${ref.id}\``;

const fmt = (n: number): string => Number(n.toFixed(4)).toString();

export const renderPaperMarkdown = (outline: PaperOutline): string => {
  const L: string[] = [];
  const push = (...lines: string[]) => L.push(...lines);

  push(`# ${outline.title}`, '');
  push(`> ${STANDING_DISCLOSURE}`, '');
  push(
    `Run \`${outline.runId}\` · deterministic render (zero LLM calls) · generated ${outline.provenance.generatedAt}`,
    '',
  );

  // ---- Abstract ----
  push('## Abstract', '');
  if (outline.abstractPoints.length === 0) {
    push('(No abstract points: no ranked hypotheses or verified claims are stored for this run.)');
  } else {
    for (const p of outline.abstractPoints) push(`- ${p.text} (source: ${refLabel(p.sourceRef)})`);
  }
  push('');

  // ---- 1 Introduction ----
  push('## 1 Introduction', '');
  push(`**Gap.** ${outline.introduction.gapStatement}`, '');
  push('**Contributions.**', '');
  if (outline.introduction.contributions.length === 0) {
    push('(No contributions: no scorecards are stored, so no ranked hypothesis set can be projected.)');
  } else {
    outline.introduction.contributions.forEach((c, i) => {
      push(`${i + 1}. ${c.statement} (hypothesis \`${c.hypothesisId}\`)`);
    });
  }
  push('');

  // ---- 2 Methods ----
  push('## 2 Methods', '');
  if (outline.methods.planRef !== null) {
    push(`- Research plan: \`${outline.methods.planRef}\``);
  } else {
    push('- Research plan: none stored for this run (the plan stage did not produce an object).');
  }
  if (outline.methods.stepsSummary.length > 0) {
    push('- Steps:');
    outline.methods.stepsSummary.forEach((s, i) => {
      push(`  ${i + 1}. **${s.stepTitle}** — ${s.description}`);
    });
  } else {
    push('- Steps: none recorded.');
  }
  const prereg = outline.methods.preregistration;
  push(
    `- Preregistration: frozen=${prereg.frozen}${prereg.planHash !== undefined ? ` (planHash \`${prereg.planHash.slice(0, 16)}…\`)` : ''}` +
      `${prereg.multipleTestingPolicy !== undefined ? `; multiple-testing policy: ${prereg.multipleTestingPolicy}` : ''}`,
  );
  push('');

  // ---- 3 Results ----
  push('## 3 Results', '');
  push('> Ranking quantities (Bradley-Terry scores, win rates, evidence bands) are uncalibrated decision aids, not probabilities.', '');
  if (outline.results.length === 0) {
    push('(No results: no hypotheses are stored for this run.)');
  } else {
    for (const r of outline.results) {
      push(`### Hypothesis \`${r.hypothesisId}\`${r.rank !== null ? ` (rank ${r.rank})` : ' (unranked)'}`, '');
      push(`- Statement: ${r.statement}`);
      push(
        `- Bradley-Terry: ${r.btScore !== null ? fmt(r.btScore) : 'null (not contested)'} · win rate: ${r.winRate !== null ? fmt(r.winRate) : 'null (not contested)'} · evidence band: ${r.evidenceBand ?? 'null (no evidence body stored)'}`,
      );
      if (r.experimentVerdicts.length === 0) {
        push('- Experiment verdicts: none persisted for this hypothesis.');
      } else {
        push('- Experiment verdicts (field-by-field from persisted stat reports):');
        for (const v of r.experimentVerdicts) {
          push(
            `  - \`${v.comparison}\` [${v.metric}]: verdict=${v.verdict ?? 'null (no verdict recorded)'}; CI [${fmt(v.ciLow)}, ${fmt(v.ciHigh)}] vs threshold ${v.threshold !== null ? fmt(v.threshold) : 'null (spec not stored)'}`,
          );
        }
      }
      push('');
    }
  }

  // ---- 4 Discussion ----
  push('## 4 Discussion', '');
  push(`**Ordering interpretation.** ${outline.discussion.orderingInterpretation}`, '');
  push('**Counter-evidence highlights.**', '');
  if (outline.discussion.counterEvidenceHighlights.length === 0) {
    push(
      '(No counter-evidence relations target the ranked hypotheses within this run\'s retrieved corpus — absence within retrieval scope, not evidence of absence.)',
    );
  } else {
    for (const c of outline.discussion.counterEvidenceHighlights) {
      push(`- [${c.relation}] ${c.text} (claim \`${c.claimId}\`)`);
    }
  }
  push('');

  // ---- 5 Limitations ----
  push('## 5 Limitations', '');
  for (const lim of outline.limitations) {
    const counts = Object.entries(lim.counts).map(([k, v]) => `${k}=${v}`).join(', ');
    push(`- **${lim.category}** — ${lim.detail} (counts: ${counts})`);
  }
  push('');

  // ---- 6 Conclusion and Future Work ----
  push('## 6 Conclusion and Future Work', '');
  push('**Open falsification conditions.**', '');
  if (outline.conclusion.openFalsificationConditions.length === 0) {
    push('(No falsification specs are stored for the ranked hypotheses.)');
  } else {
    for (const f of outline.conclusion.openFalsificationConditions) {
      push(`- Hypothesis \`${f.hypothesisId}\`: ${f.condition}`);
    }
  }
  push('', '**Uncertainty inventory (monotonic — preserved in full, never silently resolved).**', '');
  if (outline.conclusion.openUncertainties.length === 0) {
    push('(No uncertainty entries are recorded on the stored hypotheses.)');
  } else {
    for (const u of outline.conclusion.openUncertainties) {
      push(`- Hypothesis \`${u.hypothesisId}\`: ${u.text}`);
    }
  }
  push('');

  // ---- References ----
  push('## References', '');
  if (outline.references.length === 0) {
    push('(No cited source documents resolved from the top hypotheses\' claim references.)');
  } else {
    push('```bibtex');
    for (const ref of outline.references) push(ref.bibtex);
    push('```');
  }
  push('');

  return L.join('\n');
};
