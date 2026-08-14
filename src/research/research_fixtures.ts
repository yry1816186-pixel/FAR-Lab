/**
 * research/research_fixtures — offline_replay fixtures for the Track-1A slice.
 *
 * These are SYNTHETIC DEMO fixtures: they let `far research` run end-to-end
 * WITHOUT an API key (offline_replay profile), proving the pipeline wiring
 * (ground → generate → critique → score → plan → ResearchRun) is real — NOT
 * that any scientific conclusion is true. They must NEVER enter a
 * representative result (directive §3.1/§11.4): a live run uses
 * --profile competition_aliyun_qwen + a real retrieval adapter.
 *
 * The synthetic documents' documentIds are COMPUTED (computeDocumentId), never
 * hand-written, and the hypothesis fixtures cite those exact ids — so citation
 * binding in the offline demo is a real set-membership check, not a string
 * coincidence.
 */

import { computeDocumentId, normalizedDocumentHash, rawSha256Hex } from '../retrieval/hash.ts';
import { RETRIEVAL_PARSER_VERSION } from '../retrieval/types.ts';
import type { RetrievedDocument } from '../retrieval/types.ts';

/** Build a synthetic demo document with a deterministic, computed documentId. */
function syntheticDoc(pid: string, title: string, abstract: string): RetrievedDocument {
  const persistentIdentifier = pid;
  const doi = null;
  const authors = ['Synthetic Demo Author'];
  const publicationDate = '2020-01-01';
  const canonicalUrl = `https://openalex.org/${pid}`;
  const licenseMetadata = 'synthetic-demo';
  return {
    documentId: computeDocumentId('openalex', persistentIdentifier),
    sourceType: 'openalex',
    sourceName: 'OpenAlex',
    persistentIdentifier,
    doi,
    canonicalUrl,
    title,
    authors,
    publicationDate,
    retrievedAt: '2020-01-01T00:00:00.000Z',
    retrievalQuery: 'synthetic-demo',
    retrievalMethod: 'openalex-rest',
    rawHash: rawSha256Hex(`synthetic:${pid}`),
    normalizedHash: normalizedDocumentHash({
      sourceType: 'openalex',
      persistentIdentifier,
      doi,
      title,
      authors,
      publicationDate,
      abstract,
      canonicalUrl,
      licenseMetadata,
    }),
    parserVersion: RETRIEVAL_PARSER_VERSION,
    abstract,
    licenseMetadata,
  };
}

/** Synthetic demo document A. */
export const DOC_A: RetrievedDocument = syntheticDoc(
  'W-demo-a',
  '[SYNTHETIC DEMO] Starspot contamination inflates hot-Jupiter radii',
  'A synthetic demo abstract about how unocculted starspots bias transit depth and inflate measured radii.',
);

/** Synthetic demo document B. */
export const DOC_B: RetrievedDocument = syntheticDoc(
  'W-demo-b',
  '[SYNTHETIC DEMO] Correlated noise mimics radius inflation in light curves',
  'A synthetic demo abstract about how red noise in transit light curves mimics inflated planetary radii.',
);

/** The demo corpus: two synthetic documents (clearly labeled). */
export const RESEARCH_DEMO_DOCS: readonly RetrievedDocument[] = [DOC_A, DOC_B];

/** The offline_replay fixture registry for the research module (stageId → JSON). */
/**
 * Offline demo fixtures for the discovery strategy fan-out (one candidate per
 * strategy, distinct topics so the deterministic merge gates stay real:
 * nothing here is a near-duplicate, so dedup/paraphrase gates do NOT fire on
 * the demo path — their behavior is pinned by tests/discovery/generate.test.ts).
 * Synthetic: same rules as the rest of this file — wiring proof, never truth.
 */
const DISCOVERY_DEMO_FIXTURES: Readonly<Record<string, string>> = Object.freeze({
  discovery_induction: JSON.stringify({
    hypotheses: [
      {
        statement: 'A single activity-contamination mechanism unifies the radius anomaly across both demo corpus regularities.',
        mechanism:
          'REGULARITY_1: radii exceed model predictions at fixed mass [demo-doc-a]; REGULARITY_2: activity proxies correlate with depth residuals [demo-doc-b]; UNIFIED_MECHANISM: unocculted spots bias both observables; EXTRAPOLATION: the bias scales with spot covering fraction.',
        falsificationMethod: {
          prediction: 'Radius anomaly vanishes after spot-correction across the sample.',
          metric: 'residual_rms_ratio',
          comparator: 'lt',
          value: 0.5,
        },
        supportingCitations: [DOC_A.documentId, DOC_B.documentId],
        counterEvidenceCitations: [],
        relationToExistingTheory: 'Unifies contamination-systematics threads of the demo corpus.',
        alternativeExplanations: ['Physical atmospheric inflation.'],
        observablePredictions: ['Corrected radii collapse onto structure models.'],
        distinguishingObservations: ['Multi-band depths disagree before correction only.'],
        noveltyRelativeToCorpus: 'Combines two corpus regularities into one contamination mechanism.',
        assumptions: ['Spot covering fractions are recoverable from light curves.'],
        risks: ['Demo fixture — synthetic content, wiring proof only.'],
      },
    ],
  }),
  discovery_abduction: JSON.stringify({
    hypotheses: [
      {
        statement: 'The minimal explanation for the joint demo phenomena is unocculted spot contamination alone.',
        mechanism:
          'PHENOMENON_1: radius excess at fixed mass [demo-doc-a]; PHENOMENON_2: chromatic depth residuals [demo-doc-b]; MINIMAL_SET: a single spot-covering parameter explains both without invoking inflation.',
        falsificationMethod: {
          prediction: 'A one-parameter spot model fits both observables better than any two-mechanism model.',
          metric: 'bic_delta',
          comparator: 'lt',
          value: 0,
        },
        supportingCitations: [DOC_A.documentId],
        counterEvidenceCitations: [],
        relationToExistingTheory: 'Parsimony argument over the demo corpus mechanisms.',
        alternativeExplanations: ['Two mechanisms coincidentally co-occur.'],
        observablePredictions: ['Spot covering fraction predicts depth residual sign.'],
        distinguishingObservations: ['Occulted-spot events directly measure covering fraction.'],
        noveltyRelativeToCorpus: 'Minimal-set abduction over corpus-reported phenomena.',
        assumptions: ['Model comparison is fair across mechanism counts.'],
        risks: ['Demo fixture — synthetic content, wiring proof only.'],
      },
    ],
  }),
  discovery_analogy: JSON.stringify({
    hypotheses: [
      {
        statement: 'Thermal-blanket physics imported from building insulation explains radius anomalies as trapped internal heat.',
        mechanism:
          'A high-opacity layer traps internal luminosity exactly as insulation traps heat; radius relaxes outward until cooling balances.',
        falsificationMethod: {
          prediction: 'Anomaly size tracks infrared opacity of the inferred layer.',
          metric: 'opacity_anomaly_slope',
          comparator: 'gt',
          value: 0.3,
        },
        supportingCitations: [DOC_B.documentId],
        counterEvidenceCitations: [],
        relationToExistingTheory:
          'SOURCE_DOMAIN: building physics; MAPPING: opacity↔insulation R-value, luminosity↔heating power, radius↔envelope thickness; FAILURE_CONDITIONS: breaks when convection dominates over radiative transfer.',
        alternativeExplanations: ['Tidal heating supplies the extra flux.'],
        observablePredictions: ['Deeper secondary eclipses for opaque layers.'],
        distinguishingObservations: ['Day-night contrast isolates transport mode.'],
        noveltyRelativeToCorpus: 'Distant-domain structural import absent from the demo corpus.',
        assumptions: ['Radiative equilibrium holds in the layer.'],
        risks: ['Demo fixture — synthetic content, wiring proof only.'],
      },
    ],
  }),
  discovery_inversion: JSON.stringify({
    hypotheses: [
      {
        statement: 'If irradiation-driven inflation is false, residual radius scatter should be uncorrelated with incident flux.',
        mechanism:
          'MAINSTREAM_ASSUMPTION: incident flux inflates radii; IF_FALSE_OBSERVABLE: radius residuals vs flux slope ≈ 0 while activity residuals remain structured.',
        falsificationMethod: {
          prediction: 'Radius-vs-flux slope is statistically indistinguishable from zero.',
          metric: 'flux_slope_pvalue',
          comparator: 'gt',
          value: 0.05,
        },
        supportingCitations: [],
        counterEvidenceCitations: [DOC_A.documentId],
        relationToExistingTheory: 'Direct negation of the corpus-dominant inflation explanation.',
        alternativeExplanations: ['Flux range too narrow to expose the slope.'],
        observablePredictions: ['No residual-flux correlation across a wide flux range.'],
        distinguishingObservations: ['Extended-flux sample separates the two predictions.'],
        noveltyRelativeToCorpus: 'Tests the corpus mainstream by its negation signature.',
        assumptions: ['Sample spans a flux range where inflation would show.'],
        risks: ['Demo fixture — synthetic content, wiring proof only.'],
      },
    ],
  }),
  discovery_extreme_conditions: JSON.stringify({
    hypotheses: [
      {
        statement: 'Below a critical incident flux, the radius anomaly mechanism hands over from inflation to observational artifact.',
        mechanism:
          'EXTREME_REGIME: ultra-low incident flux (< 10^6 W/m^2); HANDOVER_PREDICTION: anomaly sign flips as the artifact term dominates the shrinking inflation term.',
        falsificationMethod: {
          prediction: 'Anomaly sign flips within the predicted low-flux band.',
          metric: 'anomaly_sign',
          comparator: 'range',
          lower: -0.05,
          upper: 0.05,
        },
        supportingCitations: [DOC_A.documentId],
        counterEvidenceCitations: [],
        relationToExistingTheory: 'Extends the corpus inflation relation to its extreme regime.',
        alternativeExplanations: ['Selection effects produce the flip.'],
        observablePredictions: ['Transition objects cluster at the critical flux.'],
        distinguishingObservations: ['Completeness-corrected counts test selection effects.'],
        noveltyRelativeToCorpus: 'Extrapolates beyond the corpus-observed flux range.',
        assumptions: ['The two terms are additive.'],
        risks: ['Demo fixture — synthetic content, wiring proof only.'],
      },
    ],
  }),
  discovery_constraint_relaxation: JSON.stringify({
    hypotheses: [
      {
        statement: 'Relaxing the circular-orbit default reveals eccentricity-driven heating as an anomaly source.',
        mechanism:
          'RELAXED_ASSUMPTION: forced e=0 in transit fits; TIGHTENED_ASSUMPTION: (not used — direction: relax); free eccentricity admits tidal dissipation the default fit absorbs into radius.',
        falsificationMethod: {
          prediction: 'Allowing eccentricity reduces the radius anomaly budget by a measurable fraction.',
          metric: 'anomaly_reduction_fraction',
          comparator: 'gt',
          value: 0.2,
        },
        supportingCitations: [DOC_B.documentId],
        counterEvidenceCitations: [],
        relationToExistingTheory: 'Challenges the default-constraint fitting tradition of the corpus.',
        alternativeExplanations: ['Eccentricity priors bias the reduction.'],
        observablePredictions: ['Secondary-eclipse timing offsets appear for non-zero e.'],
        distinguishingObservations: ['RV-independent e estimates cross-check the fits.'],
        noveltyRelativeToCorpus: 'Methodological-default relaxation absent from the corpus.',
        assumptions: ['Eccentricity is recoverable from transit data.'],
        risks: ['Demo fixture — synthetic content, wiring proof only.'],
      },
    ],
  }),
  discovery_counterfactual: JSON.stringify({
    hypotheses: [
      {
        statement: 'Without starspots, the radius anomaly distribution would be marginally anomalous rather than systematic.',
        mechanism:
          'COUNTERFACTUAL_VARIABLE: spot covering fraction set to zero; COLLAPSE_CONSEQUENCE: the systematic radius excess collapses to noise, isolating contamination as the load-bearing factor.',
        falsificationMethod: {
          prediction: 'Spot-free subsample shows no systematic excess.',
          metric: 'excess_significance_pvalue',
          comparator: 'gt',
          value: 0.05,
        },
        supportingCitations: [DOC_A.documentId],
        counterEvidenceCitations: [],
        relationToExistingTheory: 'Counterfactual stress-test of the contamination explanation.',
        alternativeExplanations: ['Spot-free subsample is too small.'],
        observablePredictions: ['Quiet-star sample radii match models.'],
        distinguishingObservations: ['Activity-stratified sample sizes decide power.'],
        noveltyRelativeToCorpus: 'Causal-structure probe via explicit counterfactual.',
        assumptions: ['Quiet stars are otherwise comparable.'],
        risks: ['Demo fixture — synthetic content, wiring proof only.'],
      },
    ],
  }),
  discovery_failure_mining: JSON.stringify({
    hypotheses: [
      {
        statement: 'The corpus-admitted lack of multi-band follow-up conceals a chromatic contamination signature worth chasing.',
        mechanism:
          'The known unknown — no multi-band depths in the demo corpus — is exactly the observation that would separate spot contamination from physical inflation.',
        falsificationMethod: {
          prediction: 'Multi-band depth differences exceed white-light scatter for contaminated targets.',
          metric: 'chromatic_depth_z',
          comparator: 'gt',
          value: 2,
        },
        supportingCitations: [DOC_A.documentId],
        counterEvidenceCitations: [],
        relationToExistingTheory: 'Operationalizes the corpus limitations section.',
        alternativeExplanations: ['Instrumental band-pass systematics mimic the signature.'],
        observablePredictions: ['Spotted targets show band-dependent depths.'],
        distinguishingObservations: ['Simultaneous multi-band rules out systematics.'],
        noveltyRelativeToCorpus: 'Seeded directly from the corpus-admitted gap.',
        assumptions: [
          'LIMITATION_ORIGIN: demo-doc-a: the corpus admits no multi-band follow-up exists yet.',
        ],
        risks: ['Demo fixture — synthetic content, wiring proof only.'],
      },
    ],
  }),
  discovery_contradiction_mining: JSON.stringify({
    hypotheses: [
      {
        statement: 'A stellar-metallicity moderator reconciles the corpus-conflicting inflation reports.',
        mechanism:
          'CONFLICT_A: inflation reported as significant [demo-doc-a]; CONFLICT_B: null result at comparable sample size [demo-doc-b]; RESOLUTION_MECHANISM: metallicity moderates the inflation response, producing both reports in one process.',
        falsificationMethod: {
          prediction: 'Including a metallicity interaction removes the heterogeneity between studies.',
          metric: 'heterogeneity_i2',
          comparator: 'lt',
          value: 25,
        },
        supportingCitations: [DOC_A.documentId, DOC_B.documentId],
        counterEvidenceCitations: [],
        relationToExistingTheory: 'Reconciles two corpus threads instead of picking one.',
        alternativeExplanations: ['Publication bias produces the conflict.'],
        observablePredictions: ['High-metallicity subsample shows the larger effect.'],
        distinguishingObservations: ['Pre-registered moderator analysis on pooled data.'],
        noveltyRelativeToCorpus: 'Conflict-resolution mechanism over corpus disagreement.',
        assumptions: ['Both studies report usable metallicity covariates.'],
        risks: ['Demo fixture — synthetic content, wiring proof only.'],
      },
    ],
  }),
  discovery_data_driven: JSON.stringify({
    hypotheses: [
      {
        statement: 'A power-law scaling between anomaly size and equilibrium temperature underlies the corpus-reported trends.',
        mechanism:
          'EMPIRICAL_PATTERN: reported anomaly grows steeply above ~1500 K [demo-doc-b]; MECHANISM_EXPLANATION: opacity onset near that temperature steepens the thermal-blanket response — a causal story for a correlation, not the correlation itself.',
        falsificationMethod: {
          prediction: 'A single power law fits the anomaly-temperature relation within stated scatter.',
          metric: 'powerlaw_fit_rmse',
          comparator: 'lt',
          value: 0.1,
        },
        supportingCitations: [DOC_B.documentId],
        counterEvidenceCitations: [],
        relationToExistingTheory: 'Gives the corpus empirical trend a causal mechanism.',
        alternativeExplanations: ['Selection effects shape the apparent law.'],
        observablePredictions: ['New targets land on the law within scatter.'],
        distinguishingObservations: ['Out-of-sample prediction contest against a broken trend.'],
        noveltyRelativeToCorpus: 'Mechanism explanation for a corpus-reported regularity.',
        assumptions: ['Reported temperatures are on a common scale.'],
        risks: ['Demo fixture — synthetic content, wiring proof only.'],
      },
    ],
  }),
});

export const RESEARCH_DEMO_FIXTURES: Readonly<Record<string, string>> = Object.freeze({
  baseline_direct: JSON.stringify({
    bestHypothesis: '[SYNTHETIC] Direct answer: the anomaly is starspot contamination.',
    mechanism: '[SYNTHETIC] spots bias transit depth.',
    planSummary: '[SYNTHETIC] compare activity indices with radius residuals.',
    hypotheses: [{ statement: '[SYNTHETIC] starspot artifact' }],
  }),
  baseline_rag: JSON.stringify({
    bestHypothesis: '[SYNTHETIC] RAG answer: the anomaly is starspot contamination.',
    mechanism: '[SYNTHETIC] spots bias transit depth.',
    planSummary: '[SYNTHETIC] re-fit radii after spot correction using retrieved context.',
    hypotheses: [{ statement: '[SYNTHETIC] starspot artifact (rag)' }],
  }),
  baseline_no_kernel: JSON.stringify({
    hypotheses: [
      {
        statement: '[SYNTHETIC] starspot artifact (no kernel)',
        mechanism: '[SYNTHETIC] spots bias depth',
        falsificationMethod: { prediction: 'p', metric: 'pearson_r', comparator: 'gt', value: 0.5 },
        modelTotalScore: 8.5,
      },
      {
        statement: '[SYNTHETIC] tidal heating (no kernel)',
        mechanism: '[SYNTHETIC] dissipation inflates',
        falsificationMethod: { prediction: 'p2', metric: 'slope', comparator: 'gt', value: 0 },
        modelTotalScore: 7.0,
      },
      {
        statement: '[SYNTHETIC] red noise artifact (no kernel)',
        mechanism: '[SYNTHETIC] correlated noise broadens transit',
        falsificationMethod: { prediction: 'p3', metric: 'reduction_ratio', comparator: 'lt' },
        modelTotalScore: 6.2,
      },
    ],
    bestHypothesis: '[SYNTHETIC] starspot artifact (no kernel)',
    planSummary: '[SYNTHETIC] self-scored winner chosen; no deterministic binding or scoring ran.',
  }),
  research_decompose: JSON.stringify({
    knownFacts: [
      'Hot Jupiters show measured radii larger than standard structure models predict',
      'Stellar activity (starspots, faculae) biases transit-derived parameters',
    ],
    unknownVariables: [
      'The fraction of the radius anomaly attributable to contamination',
      'The true radius distribution after activity correction',
    ],
    keyDefinitions: [
      'radius anomaly: observed radius minus model radius for a given mass/insolation',
      'activity index: normalized chromospheric emission proxy (e.g. S_HK)',
    ],
    observables: [
      'transit depth time series',
      'stellar activity indices',
      'insolation flux and orbital eccentricity',
    ],
    candidateMechanisms: [
      'unocculted starspot contamination',
      'tidal heating and internal energy deposition',
      'correlated (red) photometric noise',
    ],
    mainstreamTheories: [
      'irradiation-driven atmospheric inflation',
      'tidal dissipation inflation',
    ],
    alternativeTheories: [
      'systematic biases in transit fitting',
    ],
    retrievalSubquestions: [
      'hot Jupiter radius inflation starspot contamination',
      'hot Jupiter tidal heating radius anomaly',
      'transit photometry red noise systematic bias',
    ],
    confounders: [
      'activity-inflation correlation confounded by common dependence on stellar type',
    ],
    dataRequirements: [
      'homogeneous transit sample with activity proxies',
      'multi-band photometry to break degeneracies',
    ],
    falsifiabilityConditions: [
      'inflation persists after spot correction would falsify the artifact hypothesis',
    ],
    indistinguishableScenarios: [
      'tidal inflation and irradiation inflation may be indistinguishable in low-eccentricity samples',
    ],
  }),
  research_hypotheses: JSON.stringify({
    hypotheses: [
      {
        statement: 'Apparent radius inflation in hot Jupiters is an artifact of unocculted starspot contamination, not a physical atmospheric change.',
        mechanism: 'Starspots lower the mean stellar flux, biasing the transit depth; radius is over-estimated by the spot covering fraction.',
        falsificationMethod: {
          prediction: 'Radius inflation correlates with stellar activity index and disappears after spot-modeling correction',
          metric: 'pearson_r',
          comparator: 'gt',
          value: 0.5,
        },
        supportingCitations: [DOC_A.documentId],
        counterEvidenceCitations: [DOC_B.documentId],
        relationToExistingTheory: 'Extends the starspot-contamination literature to the hot-Jupiter radius-anomaly debate.',
        alternativeExplanations: ['Physical tidal heating inflates the atmosphere'],
        observablePredictions: ['Radius residual anti-correlates with activity proxies'],
        distinguishingObservations: ['Activity-blind spectra should still show inflation if physical'],
        noveltyRelativeToCorpus: 'Relative to this corpus, ties radius anomaly to a specific contamination mechanism.',
        assumptions: ['Starspot coverage is uniform enough to bias the mean flux'],
        risks: ['Requires reliable activity proxies and spot models'],
      },
      {
        statement: 'Hot-Jupiter radius inflation is physically caused by enhanced tidal heating in the planet interior.',
        mechanism: 'Close-in irradiation deposits energy; tidal dissipation inflates the radius envelope.',
        falsificationMethod: {
          prediction: 'Inflation increases monotonically with insolation flux and eccentricity',
          metric: 'slope',
          comparator: 'gt',
          value: 0,
        },
        supportingCitations: [],
        counterEvidenceCitations: [DOC_A.documentId],
        relationToExistingTheory: 'Competes with the irradiation-driven inflation model.',
        alternativeExplanations: ['Instrumental systematic inflates the measured radius'],
        observablePredictions: ['Inflation persists after activity correction'],
        distinguishingObservations: ['Inflation correlates with insolation, not activity'],
        noveltyRelativeToCorpus: 'Distinguishes tidal from irradiation inflation using activity-corrected radii.',
        assumptions: ['Tidal dissipation couples to the radius evolution'],
        risks: ['Disentangling irradiation vs tidal contribution is underdetermined'],
      },
      {
        statement: 'Reported radius anomalies are an instrumental artifact of correlated (red) noise in transit light curves.',
        mechanism: 'Time-correlated photometric noise broadens the transit, over-fitting the depth.',
        falsificationMethod: {
          prediction: 'Anomaly prevalence drops when light curves are modeled with a red-noise GP kernel',
          metric: 'reduction_ratio',
          comparator: 'lt',
          value: 1,
        },
        supportingCitations: [DOC_B.documentId],
        counterEvidenceCitations: [DOC_A.documentId],
        relationToExistingTheory: 'Applies the correlated-noise literature to radius-anomaly claims.',
        alternativeExplanations: ['Real atmospheric inflation'],
        observablePredictions: ['Anomaly correlates with noise-reddening metrics'],
        distinguishingObservations: ['Independent (space vs ground) photometry diverges'],
        noveltyRelativeToCorpus: 'Proposes a systematic origin testable with existing archives.',
        assumptions: ['Red noise is common in the relevant surveys'],
        risks: ['Requires re-analysis of heterogeneous archives'],
      },
    ],
  }),
  research_critique: JSON.stringify({
    findings: [
      { dimension: 'confounding', finding: 'Activity correction is not independent of the inflation signal', severity: 'minor' },
      { dimension: 'data_availability', finding: 'Activity proxies are missing for many systems', severity: 'minor' },
    ],
    modelDimensions: [
      { name: 'ScientificPlausibility', grade: 'B', rationale: 'Mechanistically grounded' },
      { name: 'NoveltyRelativeToCorpus', grade: 'B', rationale: 'Incremental over existing models' },
      { name: 'MethodologicalSoundness', grade: 'B', rationale: 'Testable with archival data' },
      { name: 'ExpectedInformationGain', grade: 'B', rationale: 'Discriminates competing mechanisms' },
      { name: 'DataAvailability', grade: 'C', rationale: 'Activity proxies incomplete' },
      { name: 'ExecutionCost', grade: 'B', rationale: 'Archive re-analysis, moderate cost' },
    ],
    keyEvidenceToChangeConclusion: 'A large homogenous sample with independent activity proxies.',
  }),
  research_plan: JSON.stringify({
    objectives: ['Test whether radius inflation persists after starspot correction'],
    preregisteredPredictions: ['Inflation residual anti-correlates with activity index'],
    dataRequirements: ['Homogeneous transit sample with activity proxies'],
    inclusionExclusionCriteria: ['Include hot Jupiters with measured activity index; exclude blended systems'],
    variables: ['radius_ratio (dimensionless)', 'activity_index S_HK (dimensionless)'],
    design: 'Retrospective cross-sectional study; correct for spot contamination, then re-fit radii',
    analysisDag: ['Select sample', 'Compute activity proxies', 'Fit corrected radii', 'Correlate residual vs activity'],
    tools: ['Python 3.12', 'numpy', 'scipy'],
    statisticalMethods: ['Pearson correlation with bootstrap confidence intervals'],
    sampleSizeRationale: 'Power analysis for r>0.5 at alpha=0.05 requires n>=30',
    multiplicityHandling: 'Single pre-registered test; no correction needed',
    missingOutlierStrategy: 'Listwise deletion; winsorize at 1%',
    stoppingConditions: ['Stop if n<30 (under-powered)', 'Stop if correlation insignificant and CI excludes 0.5'],
    checkpoints: ['After sample selection', 'After correction'],
    budget: 'Compute-only; no new observations',
    risks: ['Activity proxy heterogeneity'],
    reproducibility: ['Pin software versions; seed all stochastic steps'],
    nextRoundDecisionRules: ['If artifact hypothesis rejected, promote tidal hypothesis'],
    humanApprovalRequired: ['Publication of any real conclusion'],
  }),
  research_plan_revision: JSON.stringify({
    objectives: [
      'Test whether radius inflation persists after starspot correction',
      'Pre-register a control analysis on activity-corrected vs uncorrected subsamples',
    ],
    preregisteredPredictions: [
      'Inflation residual anti-correlates with activity index',
      'The control subsample shows no residual inflation after correction',
    ],
    dataRequirements: [
      'Homogeneous transit sample with activity proxies',
      'Control subsample with independent multi-band photometry',
    ],
    inclusionExclusionCriteria: [
      'Include hot Jupiters with measured activity index; exclude blended systems',
      'Exclude systems without an independent activity proxy (control analysis)',
    ],
    variables: ['radius_ratio (dimensionless)', 'activity_index S_HK (dimensionless)'],
    design: 'Retrospective cross-sectional study with a pre-registered control subsample; correct for spot contamination, then re-fit radii on both subsamples',
    analysisDag: [
      'Select sample',
      'Split control vs main subsample',
      'Compute activity proxies',
      'Fit corrected radii (both subsamples)',
      'Correlate residual vs activity (main) and test null residual (control)',
    ],
    tools: ['Python 3.12', 'numpy', 'scipy'],
    statisticalMethods: ['Pearson correlation with bootstrap confidence intervals', 'Equivalence test for the control subsample null residual'],
    sampleSizeRationale: 'Power analysis for r>0.5 at alpha=0.05 requires n>=30 per subsample',
    multiplicityHandling: 'Two pre-registered tests; Bonferroni alpha=0.025 each',
    missingOutlierStrategy: 'Listwise deletion; winsorize at 1%',
    stoppingConditions: [
      'Stop if n<30 per subsample (under-powered)',
      'Stop if correlation insignificant and CI excludes 0.5',
      'Stop if the control subsample shows a significant residual (systematics uncontrolled)',
    ],
    checkpoints: ['After sample selection', 'After subsample split', 'After correction'],
    budget: 'Compute-only; no new observations',
    risks: ['Activity proxy heterogeneity', 'Control subsample selection bias'],
    reproducibility: ['Pin software versions; seed all stochastic steps'],
    nextRoundDecisionRules: ['If artifact hypothesis rejected, promote tidal hypothesis', 'If control residual is significant, trigger instrument-systematic review'],
    humanApprovalRequired: ['Publication of any real conclusion', 'Release of the control-subsample selection criteria'],
  }),
  ...DISCOVERY_DEMO_FIXTURES,
});
