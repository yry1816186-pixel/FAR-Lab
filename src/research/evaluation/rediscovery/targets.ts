/**
 * research/evaluation/rediscovery/targets — the v1 target-set registry (≥3
 * domains, ≥2 verified post-cutoff discoveries each) plus the loader that
 * turns the frozen JSON fixtures into runnable TemporalHoldoutSpec objects.
 *
 * HONESTY MODEL OF THIS FILE:
 *   - The TARGET DISCOVERIES are real, established, post-cutoff science.
 *     Each carries verificationStatus; anything not fully pinned (exact DOI
 *     or day-precision date) carries doi: null + doiStatus UNCONFIRMED and a
 *     mandatory unverifiedNote. DOIs are NEVER fabricated.
 *   - The CORPUS documents and the REPLAYED HYPOTHESES are SYNTHETIC
 *     reconstructions of pre-cutoff literature context (each title/abstract
 *     is prefixed [SYNTHETIC]). They let the offline framework prove its
 *     wiring deterministically; they are NOT real retrieved literature and
 *     must never enter a representative result. Live historical retrieval is
 *     the follow-up work this framework is the skeleton for.
 *
 * Loader determinism: documentIds are COMPUTED (computeDocumentId over
 * source|persistentIdentifier), and hypothesis fixtures cite those computed
 * ids — citation binding inside the replay stays a real set-membership check,
 * never a hand-written id coincidence.
 */

import { readFileSync } from 'node:fs';

import { computeDocumentId, normalizedDocumentHash, rawSha256Hex } from '../../../retrieval/hash.ts';
import { RETRIEVAL_PARSER_VERSION } from '../../../retrieval/types.ts';
import type { RetrievedDocument } from '../../../retrieval/types.ts';
import type {
  DoiStatus,
  TargetDiscovery,
  TargetVerificationStatus,
  TemporalHoldoutSpec,
} from './types.ts';

// ─── Raw JSON fixture shapes (what lives in ./fixtures/*.json) ──────────────

interface FixtureDocJson {
  readonly pid: string;
  readonly title: string;
  readonly abstract: string;
  readonly publicationDate: string;
}

interface FixtureTargetJson {
  readonly id: string;
  readonly statement: string;
  readonly publishedAfter: string;
  readonly doi: string | null;
  readonly doiStatus: DoiStatus;
  readonly verificationStatus: TargetVerificationStatus;
  readonly unverifiedNote: string | null;
  readonly matchKeywords: readonly string[];
  readonly synonyms: Readonly<Record<string, readonly string[]>>;
  readonly groundingDocPids: readonly string[];
}

interface FixtureHypothesisJson {
  readonly statement: string;
  readonly mechanism: string;
  readonly falsificationMethod: {
    readonly prediction: string;
    readonly metric: string;
    readonly comparator: 'gt' | 'lt';
    readonly value: number;
  };
  readonly citePids: readonly string[];
  readonly counterCitePids: readonly string[];
  readonly relationToExistingTheory: string;
  readonly alternativeExplanations: readonly string[];
  readonly observablePredictions: readonly string[];
  readonly distinguishingObservations: readonly string[];
  readonly noveltyRelativeToCorpus: string;
  readonly assumptions: readonly string[];
  readonly risks: readonly string[];
}

interface SpecFixtureJson {
  readonly syntheticNotice: string;
  readonly specId: string;
  readonly domain: string;
  readonly researchQuestion: string;
  readonly cutoffDate: string;
  readonly corpus: readonly FixtureDocJson[];
  readonly targets: readonly FixtureTargetJson[];
  readonly hypotheses: readonly FixtureHypothesisJson[];
}

// ─── Synthetic-doc construction (hash-computed ids; mirrors the demo pattern) ─

/** Fixed, deterministic replay provenance for fixture documents. */
const REPLAY_RETRIEVED_AT = '2000-01-01T00:00:00.000Z';

function buildSyntheticDoc(d: FixtureDocJson): RetrievedDocument {
  const doi = null;
  const authors = ['[SYNTHETIC Rediscovery Fixture]'];
  const canonicalUrl = `https://openalex.org/${d.pid}`;
  const licenseMetadata = 'synthetic-rediscovery-fixture';
  return {
    documentId: computeDocumentId('openalex', d.pid),
    sourceType: 'openalex',
    sourceName: 'OpenAlex',
    persistentIdentifier: d.pid,
    doi,
    canonicalUrl,
    title: d.title,
    authors,
    publicationDate: d.publicationDate,
    retrievedAt: REPLAY_RETRIEVED_AT,
    retrievalQuery: 'rediscovery-temporal-holdout-replay',
    retrievalMethod: 'openalex-rest',
    rawHash: rawSha256Hex(`rediscovery:${d.pid}`),
    normalizedHash: normalizedDocumentHash({
      sourceType: 'openalex',
      persistentIdentifier: d.pid,
      doi,
      title: d.title,
      authors,
      publicationDate: d.publicationDate,
      abstract: d.abstract,
      canonicalUrl,
      licenseMetadata,
    }),
    parserVersion: RETRIEVAL_PARSER_VERSION,
    abstract: d.abstract,
    licenseMetadata,
  };
}

// ─── Fixture validation (fail loud on dishonest data) ───────────────────────

const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/;

function validateFixture(json: SpecFixtureJson): void {
  if (!json.syntheticNotice.includes('SYNTHETIC REPLAY FIXTURE')) {
    throw new Error(`rediscovery fixture ${json.specId}: missing syntheticNotice honesty header.`);
  }
  if (json.targets.length < 2) {
    throw new Error(`rediscovery fixture ${json.specId}: needs >= 2 targets per domain (brief requirement).`);
  }
  const pids = new Set(json.corpus.map((d) => d.pid));
  for (const d of json.corpus) {
    if (d.publicationDate > json.cutoffDate) {
      throw new Error(
        `rediscovery fixture ${json.specId}: corpus doc ${d.pid} has publicationDate ${d.publicationDate} ` +
          `after cutoff ${json.cutoffDate} — shipped fixtures must be holdout-clean (the engine would drop it).`,
      );
    }
  }
  const targetIds = new Set<string>();
  for (const t of json.targets) {
    if (targetIds.has(t.id)) {
      throw new Error(`rediscovery fixture ${json.specId}: duplicate target id ${t.id}.`);
    }
    targetIds.add(t.id);
    if (t.publishedAfter <= json.cutoffDate) {
      throw new Error(
        `rediscovery fixture ${json.specId}: target ${t.id} publishedAfter ${t.publishedAfter} ` +
          `must be strictly after cutoff ${json.cutoffDate}.`,
      );
    }
    if (t.doiStatus === 'CONFIRMED' && (t.doi === null || !DOI_PATTERN.test(t.doi))) {
      throw new Error(`rediscovery fixture ${json.specId}: target ${t.id} claims CONFIRMED doi but has none/well-formed none.`);
    }
    if (t.doi !== null && !DOI_PATTERN.test(t.doi)) {
      throw new Error(`rediscovery fixture ${json.specId}: target ${t.id} has malformed doi "${t.doi}".`);
    }
    if (t.verificationStatus === 'UNVERIFIED' && (t.unverifiedNote === null || t.unverifiedNote.length === 0)) {
      throw new Error(`rediscovery fixture ${json.specId}: UNVERIFIED target ${t.id} requires an unverifiedNote.`);
    }
    for (const pid of t.groundingDocPids) {
      if (!pids.has(pid)) {
        throw new Error(`rediscovery fixture ${json.specId}: target ${t.id} grounding pid ${pid} not in corpus.`);
      }
    }
  }
  if (json.hypotheses.length < 3) {
    throw new Error(`rediscovery fixture ${json.specId}: needs >= 3 replayed hypotheses.`);
  }
  for (const h of json.hypotheses) {
    for (const pid of [...h.citePids, ...h.counterCitePids]) {
      if (!pids.has(pid)) {
        throw new Error(`rediscovery fixture ${json.specId}: hypothesis cites unknown pid ${pid}.`);
      }
    }
  }
}

// ─── Loader ─────────────────────────────────────────────────────────────────

function loadSpec(file: string): TemporalHoldoutSpec {
  const raw = JSON.parse(readFileSync(new URL(`./fixtures/${file}`, import.meta.url), 'utf8')) as SpecFixtureJson;
  validateFixture(raw);
  const docs = raw.corpus.map(buildSyntheticDoc);
  const idByPid = new Map(docs.map((d) => [d.persistentIdentifier, d.documentId]));

  const targets: TargetDiscovery[] = raw.targets.map((t) => ({
    id: t.id,
    statement: t.statement,
    publishedAfter: t.publishedAfter,
    doi: t.doi,
    doiStatus: t.doiStatus,
    verificationStatus: t.verificationStatus,
    unverifiedNote: t.unverifiedNote,
    matchKeywords: t.matchKeywords,
    synonyms: t.synonyms,
    groundingDocumentIds: t.groundingDocPids.map((pid) => idByPid.get(pid)!),
  }));

  const llmFixtures: Record<string, string> = {
    ...buildSharedPipelineFixtures(),
    research_hypotheses: JSON.stringify({
      hypotheses: raw.hypotheses.map((h) => ({
        statement: h.statement,
        mechanism: h.mechanism,
        falsificationMethod: h.falsificationMethod,
        supportingCitations: h.citePids.map((pid) => idByPid.get(pid)!),
        counterEvidenceCitations: h.counterCitePids.map((pid) => idByPid.get(pid)!),
        relationToExistingTheory: h.relationToExistingTheory,
        alternativeExplanations: h.alternativeExplanations,
        observablePredictions: h.observablePredictions,
        distinguishingObservations: h.distinguishingObservations,
        noveltyRelativeToCorpus: h.noveltyRelativeToCorpus,
        assumptions: h.assumptions,
        risks: h.risks,
      })),
    }),
  };

  return {
    specId: raw.specId,
    domain: raw.domain,
    researchQuestion: raw.researchQuestion,
    cutoffDate: raw.cutoffDate,
    corpusFixture: docs,
    targetDiscoveries: targets,
    runConfig: {
      targetHypothesisCount: raw.hypotheses.length,
      hypothesisGenerationStrategy: 'legacy',
      maxPerQuery: 8,
    },
    llmFixtures,
  };
}

/**
 * Domain-neutral replay fixtures for the pipeline stages that do not influence
 * matching (decomposition, critique, plan, plan revision). Clearly labeled
 * synthetic; reused verbatim across specs so per-domain JSON stays data-only.
 */
function buildSharedPipelineFixtures(): Record<string, string> {
  return {
    research_decompose: JSON.stringify({
      knownFacts: ['[SYNTHETIC REPLAY] The pre-cutoff corpus reports unresolved anomalies and upper limits'],
      unknownVariables: ['[SYNTHETIC REPLAY] Which anomaly is nearest a decisive test'],
      keyDefinitions: ['[SYNTHETIC REPLAY] domain terms as used in the corpus'],
      observables: ['[SYNTHETIC REPLAY] survey and archival measurements'],
      candidateMechanisms: ['[SYNTHETIC REPLAY] mechanisms under discussion in the corpus'],
      mainstreamTheories: ['[SYNTHETIC REPLAY] standard interpretation at cutoff'],
      alternativeTheories: ['[SYNTHETIC REPLAY] minority interpretations'],
      retrievalSubquestions: [
        'pre-cutoff anomaly surveys',
        'upper limits and detection thresholds',
        'competing mechanisms',
      ],
      confounders: ['[SYNTHETIC REPLAY] selection effects'],
      dataRequirements: ['[SYNTHETIC REPLAY] archival measurements'],
      falsifiabilityConditions: ['[SYNTHETIC REPLAY] a decade of null results would kill the hypothesis'],
      indistinguishableScenarios: ['[SYNTHETIC REPLAY] systematics versus signal'],
    }),
    research_critique: JSON.stringify({
      findings: [
        { dimension: 'confounding', finding: '[SYNTHETIC REPLAY] selection effects not fully controlled', severity: 'minor' },
        { dimension: 'data_availability', finding: '[SYNTHETIC REPLAY] archival coverage uneven', severity: 'minor' },
      ],
      modelDimensions: [
        { name: 'ScientificPlausibility', grade: 'B', rationale: '[SYNTHETIC REPLAY] corpus-grounded' },
        { name: 'NoveltyRelativeToCorpus', grade: 'B', rationale: '[SYNTHETIC REPLAY] extends corpus claims' },
        { name: 'MethodologicalSoundness', grade: 'B', rationale: '[SYNTHETIC REPLAY] testable' },
        { name: 'ExpectedInformationGain', grade: 'B', rationale: '[SYNTHETIC REPLAY] discriminates mechanisms' },
        { name: 'DataAvailability', grade: 'C', rationale: '[SYNTHETIC REPLAY] partial coverage' },
        { name: 'ExecutionCost', grade: 'B', rationale: '[SYNTHETIC REPLAY] archival re-analysis' },
      ],
      keyEvidenceToChangeConclusion: '[SYNTHETIC REPLAY] a larger homogeneous sample with independent calibrations.',
    }),
    research_plan: JSON.stringify({
      objectives: ['[SYNTHETIC REPLAY] Test the ranked hypothesis against pre-cutoff archival data'],
      preregisteredPredictions: ['[SYNTHETIC REPLAY] predicted signal exceeds survey thresholds'],
      dataRequirements: ['[SYNTHETIC REPLAY] archival survey catalogues'],
      inclusionExclusionCriteria: ['[SYNTHETIC REPLAY] include calibrated samples only'],
      variables: ['[SYNTHETIC REPLAY] primary observable (dimensionless)'],
      design: 'Retrospective analysis of pre-cutoff archival data',
      analysisDag: ['Select sample', 'Calibrate', 'Test prediction', 'Quantify residuals'],
      tools: ['Python 3.12', 'numpy', 'scipy'],
      statisticalMethods: ['Bootstrap confidence intervals'],
      sampleSizeRationale: 'Power analysis for moderate effects at alpha=0.05',
      multiplicityHandling: 'Single pre-registered test',
      missingOutlierStrategy: 'Winsorize at 1 percent',
      stoppingConditions: ['Stop if sample falls below power threshold'],
      checkpoints: ['After sample selection'],
      budget: 'Compute-only',
      risks: ['Calibration heterogeneity'],
      reproducibility: ['Pin versions; seed all stochastic steps'],
      nextRoundDecisionRules: ['Promote surviving hypothesis'],
      humanApprovalRequired: ['Publication of any real conclusion'],
    }),
    research_plan_revision: JSON.stringify({
      objectives: ['[SYNTHETIC REPLAY] Add a control analysis to the pre-registered plan'],
      preregisteredPredictions: ['[SYNTHETIC REPLAY] control subsample shows no signal'],
      dataRequirements: ['[SYNTHETIC REPLAY] control subsample'],
      inclusionExclusionCriteria: ['[SYNTHETIC REPLAY] as main plan'],
      variables: ['[SYNTHETIC REPLAY] control observable'],
      design: 'Addition of a pre-registered control analysis',
      analysisDag: ['Select control', 'Run parallel test'],
      tools: ['Python 3.12'],
      statisticalMethods: ['Equivalence test'],
      sampleSizeRationale: 'Matched to main analysis',
      multiplicityHandling: 'Family-wise correction',
      missingOutlierStrategy: 'Listwise',
      stoppingConditions: ['Stop if control invalid'],
      checkpoints: ['After control selection'],
      budget: 'Compute-only',
      risks: ['Control contamination'],
      reproducibility: ['Seed all steps'],
      nextRoundDecisionRules: ['Proceed if control clean'],
      humanApprovalRequired: ['Publication of any real conclusion'],
    }),
  };
}

// ─── The v1 registry ────────────────────────────────────────────────────────

/** The shipped temporal-holdout specs (4 domains x 2 targets each). */
export const REDISCOVERY_SPECS: readonly TemporalHoldoutSpec[] = Object.freeze([
  loadSpec('rediscovery-cosmology-1994.json'),
  loadSpec('rediscovery-molecular-biology-1997.json'),
  loadSpec('rediscovery-materials-physics-2003.json'),
  loadSpec('rediscovery-gravitational-wave-2015.json'),
]);

/** Distinct domains covered by the registry (brief: >= 3). */
export const REDISCOVERY_DOMAINS: readonly string[] = Object.freeze(
  [...new Set(REDISCOVERY_SPECS.map((s) => s.domain))],
);

/** All target ids flagged UNVERIFIED anywhere in the registry (should stay honest: currently none). */
export function unverifiedTargetIds(): readonly string[] {
  return REDISCOVERY_SPECS.flatMap((s) =>
    s.targetDiscoveries.filter((t) => t.verificationStatus === 'UNVERIFIED').map((t) => t.id),
  );
}

/** All targets lacking a high-confidence DOI (doi null / UNCONFIRMED). */
export function targetsWithoutConfirmedDoi(): readonly { readonly specId: string; readonly id: string }[] {
  return REDISCOVERY_SPECS.flatMap((s) =>
    s.targetDiscoveries
      .filter((t) => t.doiStatus !== 'CONFIRMED' || t.doi === null)
      .map((t) => ({ specId: s.specId, id: t.id })),
  );
}
