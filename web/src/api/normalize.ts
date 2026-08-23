/**
 * Response envelope normalization — THE single place that adapts whatever the
 * /api/v1 server actually returns into the shapes the UI renders.
 *
 * The parallel API group owns the server; the agreed contract fixes endpoint
 * paths and the error body, while list/collection envelopes may be wrapped
 * ({ runs: [...] }, { items: [...] }) or bare arrays. These helpers accept the
 * known variants and FAIL VISIBLY (unexpected_schema ApiError) when a payload
 * matches nothing — an unknown shape must surface as an error, never as an
 * empty list that would silently look like "no data".
 */
import { ApiError } from './client';
import type {
  AchAnalysis, EvidenceBody, EvidenceRelation, FeedbackSignal, HypothesisCandidate, HypothesisScorecard, HypothesisTournament,
  ProvenanceReceipt, ResearchPlan, ResearchQuestion, ResearchRun, RunEvent,
  RunSummary, ScientificClaim, SearchResponse, SearchHit, SourceDocument, VersionDiff, Revision,
} from './types';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function firstArray(data: unknown, keys: string[]): unknown[] {
  if (Array.isArray(data)) return data;
  if (isRecord(data)) {
    for (const key of keys) {
      const v = data[key];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

/**
 * Strict list extraction: the payload must be (or contain) an array. An object
 * envelope without any recognized array key is a schema mismatch and FAILS
 * VISIBLY — it must never render as an empty list that looks like "no data".
 */
function requireArray(data: unknown, keys: string[], what: string): unknown[] {
  if (Array.isArray(data)) return data;
  if (isRecord(data)) {
    for (const key of keys) {
      const v = data[key];
      if (Array.isArray(v)) return v;
    }
  }
  throw schemaError(what);
}

/** Filter with fail-visible semantics: non-empty input that matches nothing = schema mismatch. */
function filterOrThrow<T>(items: unknown[], guard: (v: unknown) => v is T, what: string): T[] {
  const out = items.filter(guard);
  if (items.length > 0 && out.length === 0) throw schemaError(what);
  return out;
}

function schemaError(what: string): ApiError {
  return new ApiError({
    code: 'unexpected_schema',
    message: `API 响应结构与预期不符（${what}）— 前端归一层无法识别该信封，请对照 /api/v1 契约检查`,
    status: 200,
    retryable: false,
    i18nKey: 'err.schema',
    i18nVars: { what },
  });
}

// ---- runs ----

const looksLikeRun = (v: unknown): v is ResearchRun =>
  isRecord(v) && typeof v.id === 'string' && typeof v.status === 'string' && Array.isArray(v.stages);

const looksLikeRunSummary = (v: unknown): v is RunSummary =>
  isRecord(v) && typeof v.id === 'string' && typeof v.status === 'string' && typeof v.currentStage === 'string';

/** GET /runs list items are SUMMARY objects (no stages) — validated against the summary shape. */
export function normalizeRunSummaries(data: unknown): RunSummary[] {
  return filterOrThrow(requireArray(data, ['runs', 'items', 'data'], 'runs list'), looksLikeRunSummary, 'runs list');
}

export function normalizeRun(data: unknown): ResearchRun {
  const candidate = isRecord(data) ? (data.run ?? data) : data;
  if (looksLikeRun(candidate)) return candidate;
  throw schemaError('run detail');
}

// ---- events ----

const looksLikeEvent = (v: unknown): v is RunEvent =>
  isRecord(v) && typeof v.seq === 'number' && typeof v.type === 'string' && typeof v.at === 'string';

export function normalizeEvents(data: unknown): RunEvent[] {
  return filterOrThrow(requireArray(data, ['events', 'items', 'data'], 'events'), looksLikeEvent, 'events');
}

// ---- question / plan (single object or wrapped) ----

const looksLikeQuestion = (v: unknown): v is ResearchQuestion =>
  isRecord(v) && typeof v.id === 'string' && typeof v.text === 'string' && isRecord(v.scope);

export function normalizeQuestion(data: unknown): ResearchQuestion {
  const candidate = isRecord(data) ? (data.question ?? data) : data;
  if (looksLikeQuestion(candidate)) return candidate;
  throw schemaError('question');
}

const looksLikePlan = (v: unknown): v is ResearchPlan =>
  isRecord(v) && typeof v.id === 'string' && typeof v.objective === 'string' && Array.isArray(v.steps);

/** The server answers {plan: null} (200) when no plan exists yet — that is an honest empty, not an error. */
export function normalizePlan(data: unknown): ResearchPlan | null {
  const candidate = isRecord(data) && data.plan !== undefined ? data.plan : data;
  if (candidate === null) return null;
  if (looksLikePlan(candidate)) return candidate;
  throw schemaError('plan');
}

// ---- sources ----

const looksLikeSource = (v: unknown): v is SourceDocument =>
  isRecord(v) && typeof v.id === 'string' && typeof v.title === 'string' && typeof v.contentDepth === 'string';

export function normalizeSources(data: unknown): SourceDocument[] {
  return filterOrThrow(requireArray(data, ['sources', 'items', 'documents', 'data'], 'sources'), looksLikeSource, 'sources');
}

// ---- evidence (claims + relations, possibly mixed in one collection) ----

const looksLikeClaim = (v: unknown): v is ScientificClaim =>
  isRecord(v) && typeof v.id === 'string' && typeof v.bindingStatus === 'string' && Array.isArray(v.locators);

const looksLikeRelation = (v: unknown): v is EvidenceRelation =>
  isRecord(v) && typeof v.relation === 'string' && typeof v.rationale === 'string';

export interface EvidenceBundle {
  claims: ScientificClaim[];
  relations: EvidenceRelation[];
  /** Items matching neither discriminator — displayed as a visible warning, never dropped silently. */
  unclassified: number;
}

export function normalizeEvidence(data: unknown): EvidenceBundle {
  if (isRecord(data)) {
    // Object envelope with explicit claims/relations arrays.
    if (Array.isArray(data.claims) || Array.isArray(data.relations)) {
      return {
        claims: Array.isArray(data.claims) ? data.claims.filter(looksLikeClaim) : [],
        relations: Array.isArray(data.relations) ? data.relations.filter(looksLikeRelation) : [],
        unclassified: 0,
      };
    }
  }
  // Bare mixed array: classify each item by domain discriminators. Fail-closed: an
  // object envelope without a recognized array key is a schema error, never "no data".
  const items = requireArray(data, ['evidence', 'items', 'data'], 'evidence collection');
  const claims: ScientificClaim[] = [];
  const relations: EvidenceRelation[] = [];
  let unclassified = 0;
  for (const item of items) {
    if (looksLikeClaim(item)) claims.push(item);
    else if (looksLikeRelation(item)) relations.push(item);
    else unclassified += 1;
  }
  return { claims, relations, unclassified };
}

// ---- hypotheses + scorecards ----

const looksLikeHypothesis = (v: unknown): v is HypothesisCandidate =>
  isRecord(v) && typeof v.id === 'string' && typeof v.statement === 'string' && typeof v.mechanism === 'string';

const looksLikeScorecard = (v: unknown): v is HypothesisScorecard =>
  isRecord(v) && typeof v.rank === 'number' && Array.isArray(v.dimensions);

const looksLikeTournament = (v: unknown): v is HypothesisTournament =>
  isRecord(v) && Array.isArray(v.matches) && Array.isArray(v.standings) && typeof v.algorithm === 'string';

/** Wave-S g8: hypothesis-level evidence body (deterministic, no LLM in the rating). */
const looksLikeEvidenceBody = (v: unknown): v is EvidenceBody =>
  isRecord(v) && typeof v.hypothesisId === 'string' && typeof v.qbafScore === 'number'
  && typeof v.logLrBand === 'string' && typeof v.promotion === 'string';

/** Wave-S g9: ACH diagnosticity/removal-sensitivity audit (Heuer steps 4-6). */
const looksLikeAchAnalysis = (v: unknown): v is AchAnalysis =>
  isRecord(v) && Array.isArray(v.diagnosticity) && isRecord(v.removalSensitivity);

export interface HypothesesBundle {
  hypotheses: HypothesisCandidate[];
  scorecards: HypothesisScorecard[];
  /** D-016 pairwise tournament behind the final ordering; null when absent. */
  tournament: HypothesisTournament | null;
  /** Wave-S g8 evidence bodies per hypothesis; empty on older runs. */
  evidenceBodies: EvidenceBody[];
  /** Wave-S g9 ACH audit; null on older runs. */
  achAnalysis: AchAnalysis | null;
}

export function normalizeHypotheses(data: unknown): HypothesesBundle {
  if (isRecord(data)) {
    const hasHypKey = Array.isArray(data.hypotheses) || Array.isArray(data.candidates);
    const hasCardKey = Array.isArray(data.scorecards) || Array.isArray(data.cards);
    if (hasHypKey || hasCardKey) {
      return {
        hypotheses: firstArray(data, ['hypotheses', 'candidates']).filter(looksLikeHypothesis),
        scorecards: firstArray(data, ['scorecards', 'cards']).filter(looksLikeScorecard),
        tournament: looksLikeTournament(data.tournament) ? data.tournament : null,
        evidenceBodies: Array.isArray(data.evidenceBodies) ? data.evidenceBodies.filter(looksLikeEvidenceBody) : [],
        achAnalysis: looksLikeAchAnalysis(data.achAnalysis) ? data.achAnalysis : null,
      };
    }
  }
  // Bare mixed array: classify each item. Fail-closed (WP2 F-01): unknown envelope
  // shapes are schema errors, never a silently empty hypothesis list.
  const items = requireArray(data, ['hypotheses', 'items', 'data'], 'hypotheses collection');
  const hypotheses: HypothesisCandidate[] = [];
  const scorecards: HypothesisScorecard[] = [];
  for (const item of items) {
    if (looksLikeHypothesis(item)) hypotheses.push(item);
    else if (looksLikeScorecard(item)) scorecards.push(item);
  }
  if (items.length > 0 && hypotheses.length + scorecards.length === 0) throw schemaError('hypotheses');
  return { hypotheses, scorecards, tournament: null, evidenceBodies: [], achAnalysis: null };
}

// ---- feedbacks / revisions / version diffs ----

const looksLikeFeedback = (v: unknown): v is FeedbackSignal =>
  isRecord(v) && typeof v.source === 'string' && typeof v.receivedAt === 'string';

const looksLikeRevision = (v: unknown): v is Revision =>
  isRecord(v) && typeof v.triggerFeedbackId === 'string' && Array.isArray(v.operations);

const looksLikeDiff = (v: unknown): v is VersionDiff =>
  isRecord(v) && typeof v.semanticSummary === 'string' && Array.isArray(v.entries);

export interface RevisionsBundle {
  feedbacks: FeedbackSignal[];
  revisions: Revision[];
  diffs: VersionDiff[];
}

export function normalizeRevisions(data: unknown): RevisionsBundle {
  if (isRecord(data)) {
    // Fail-closed (WP2 F-01): the API envelope always carries all three arrays (empty
    // runs carry empty arrays, not absent keys) — a missing key is a shape change and
    // must surface as an error, never as a silently empty tab.
    return {
      feedbacks: requireArray(data, ['feedbacks', 'feedback', 'feedbackSignals'], 'revisions collection (feedbacks)').filter(looksLikeFeedback),
      revisions: requireArray(data, ['revisions'], 'revisions collection (revisions)').filter(looksLikeRevision),
      diffs: requireArray(data, ['versionDiffs', 'diffs'], 'revisions collection (diffs)').filter(looksLikeDiff),
    };
  }
  const items = requireArray(data, ['items', 'data'], 'revisions collection');
  return {
    feedbacks: items.filter(looksLikeFeedback),
    revisions: items.filter(looksLikeRevision),
    diffs: items.filter(looksLikeDiff),
  };
}

// ---- receipts ----

const looksLikeReceipt = (v: unknown): v is ProvenanceReceipt =>
  isRecord(v) && typeof v.kind === 'string' && typeof v.executionMode === 'string';

export function normalizeReceipts(data: unknown): ProvenanceReceipt[] {
  return filterOrThrow(requireArray(data, ['receipts', 'items', 'data'], 'receipts'), looksLikeReceipt, 'receipts');}

// ---- universal search (B2) ----

const looksLikeSearchHit = (v: unknown): v is SearchHit =>
  isRecord(v) && typeof v.runId === 'string' && typeof v.id === 'string' && typeof v.text === 'string'; // snippet/rank optional (FTS path only)

/** Fail-closed: a malformed search payload surfaces as an error, never as silently empty results. */
export function normalizeSearch(data: unknown): SearchResponse {
  if (!isRecord(data)) throw schemaError('search');
  const hits = (key: string): SearchHit[] => {
    if (!Array.isArray(data[key])) throw schemaError(`search.${key}`);
    return data[key].filter(looksLikeSearchHit);
  };
  return {
    query: typeof data.query === 'string' ? data.query : '',
    questions: hits('questions'),
    hypotheses: hits('hypotheses'),
    claims: hits('claims'),
    // Optional since the segment is new (older servers omit it).
    ...(Array.isArray(data.conversations) ? { conversations: data.conversations.filter(looksLikeSearchHit) } : {}),
  };
}
