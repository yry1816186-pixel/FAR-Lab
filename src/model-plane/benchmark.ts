import { z } from 'zod';
import type { StructuredCallResult } from '../shared/ports.js';
import { strictSchemaOrUndefined } from '../providers/http.js';
import { describeShape, validateStructured, withModelSlot } from '../pipeline/llm.js';
import type { RouteCandidate } from './routing.js';

/**
 * MODEL-COMPARISON BENCHMARK HARNESS (model-plane lane, 2026-08-24).
 *
 * Suites: structured-output adherence, long-context recall, scientific reasoning,
 * retrieval synthesis, vision, tool-selection, ranking. Every case is a deterministic
 * fixture with a DETERMINISTIC scorer — the harness itself never calls an LLM to judge
 * (no self-grading), so scores are comparable across models and repeatable.
 *
 * HONESTY RULES:
 *  - Results derive from REAL model executions only. Running against the test-stub
 *    proves the HARNESS mechanics (offline, deterministic); it is never reported as a
 *    model-quality number. Live comparisons require real credentials — currently
 *    BLOCKED-live (workspace no-live-API directive + B-QWEN-LIVE-ROUTE).
 *  - A model's suite result records the route identity (name+modelId) and per-case
 *    receipts (requestHash/outputHash/latency/retries) — conclusions are traceable
 *    to executed calls, never to vibes.
 *  - Vision suite: skipped (visibly, with reason) for routes without VERIFIED vision
 *    capability — never silently scored zero.
 */

export interface BenchCase {
  id: string;
  systemPrompt: string;
  payload: unknown;
  schema: z.ZodType<unknown>;
  /** Semantic scorer over the zod-valid output: 0..1. Must be pure/deterministic. */
  score: (parsed: unknown) => number;
}

export type BenchSuiteId =
  | 'structured-output' | 'long-context' | 'scientific-reasoning'
  | 'retrieval-synthesis' | 'vision' | 'tool-selection' | 'ranking';

export interface BenchSuite {
  id: BenchSuiteId;
  taskClass: string;
  description: string;
  requiresVision: boolean;
  cases: BenchCase[];
}

export interface CaseResult {
  caseId: string;
  ok: boolean;
  /** 0..1 (0 on any failure — schema-invalid output earns no credit). */
  score: number;
  errorKind?: string;
  errorMessage?: string;
  latencyMs: number;
  requestHash: string;
  outputHash: string;
  structuredOutputMode?: string;
  transportRetries?: number;
  correctiveReasks?: number;
}

export interface SuiteResult {
  suiteId: BenchSuiteId;
  route: { name: string; modelId: string };
  /** Set when the suite was not executed for this route (e.g. no vision capability). */
  skippedReason?: string;
  cases: CaseResult[];
  aggregate: { meanScore: number; validOutputs: number; totalCases: number; meanLatencyMs: number };
}

const benchSystem = (role: string): string =>
  `${role}\n\nRespond with JSON only, matching the described output contract exactly.`;

// ---------------------------------------------------------------------------
// Suite 1: structured-output adherence — the shapes that break weak models.
// ---------------------------------------------------------------------------

const enumSchema = z.object({
  severity: z.enum(['fatal', 'major', 'minor']),
  appliesTo: z.enum(['hypothesis', 'method', 'data']),
});
const nestedSchema = z.object({
  meta: z.object({
    title: z.string().min(1),
    year: z.number().int().min(1500).max(2100),
    tags: z.array(z.string()).min(1),
  }),
  confidence: z.number().min(0).max(1),
});
const optNullSchema = z.object({
  name: z.string(),
  citation: z.string().optional(),
  doi: z.string().optional(),
});
const arrSchema = z.object({
  items: z.array(z.object({ id: z.string(), weight: z.number() })).min(3),
});
const unionSchema = z.object({
  verdict: z.union([z.literal('support'), z.literal('refute')]),
  note: z.string(),
});

const structuredOutputSuite: BenchSuite = {
  id: 'structured-output',
  taskClass: 'structured_output',
  description: 'Schema-adherence stress: enums, nesting, optional-null bait, arrays, unions',
  requiresVision: false,
  cases: [
    {
      id: 'enum-exact',
      systemPrompt: benchSystem('You classify research-review findings.'),
      payload: { finding: 'The study confounds the mediator with the outcome variable.' },
      schema: enumSchema,
      score: (p) => {
        const v = p as { severity: string; appliesTo: string };
        return v.severity === 'major' && v.appliesTo === 'method' ? 1 : 0;
      },
    },
    {
      id: 'nested-objects',
      systemPrompt: benchSystem('You catalog papers for a review.'),
      payload: { paper: 'Alpha 2021 "CRISPR base editing off-target rates" in Nature Methods' },
      schema: nestedSchema,
      score: (p) => {
        const v = p as { meta: { year: number; tags: string[] }; confidence: number };
        return v.meta.year === 2021 && v.meta.tags.length > 0 ? 1 : 0;
      },
    },
    {
      id: 'optional-null-bait',
      systemPrompt: benchSystem('You extract citation metadata; unknown fields are simply absent.'),
      payload: { text: 'Smith et al. 2019 proved the lemma. No DOI given.' },
      schema: optNullSchema,
      score: (p) => ((p as { name: string }).name.length > 0 ? 1 : 0),
    },
    {
      id: 'array-min-items',
      systemPrompt: benchSystem('You rank candidate datasets.'),
      payload: { datasets: ['OpenML iris', 'UCI wine', 'Kaggle titanic'] },
      schema: arrSchema,
      score: (p) => ((p as { items: unknown[] }).items.length === 3 ? 1 : 0),
    },
    {
      id: 'union-literal',
      systemPrompt: benchSystem('You judge evidence direction.'),
      payload: { evidence: 'The meta-analysis contradicts the hypothesis prediction.' },
      schema: unionSchema,
      score: (p) => ((p as { verdict: string }).verdict === 'refute' ? 1 : 0),
    },
  ],
};

// ---------------------------------------------------------------------------
// Suite 2: long-context recall — deterministic synthetic haystacks (no external data).
// ---------------------------------------------------------------------------

const buildHaystack = (facts: number, needleAtFraction: number, needle: string): string => {
  const words = ['entropy', 'gradient', 'variance', 'posterior', 'lattice', 'cohort', 'isotope', 'tensor'];
  const parts: string[] = [];
  const needleIdx = Math.floor(facts * needleAtFraction);
  for (let i = 0; i < facts; i += 1) {
    parts.push(i === needleIdx
      ? `Fact ${i}: the registration codeword for this batch is ${needle}.`
      : `Fact ${i}: the measured value of ${words[i % words.length]!} equals ${i * 3 + 1}.`);
  }
  return parts.join(' ');
};
const needleSchema = z.object({ codeword: z.string().min(1) });

const longContextSuite: BenchSuite = {
  id: 'long-context',
  taskClass: 'long_context',
  description: 'Needle recall in deterministic synthetic haystacks at 30%/80% depth',
  requiresVision: false,
  cases: [
    {
      id: 'needle-30pct',
      systemPrompt: benchSystem('You find one specific fact buried in a long document.'),
      payload: { document: buildHaystack(400, 0.3, 'ORCHID-HAMMER-42'), question: 'What is the registration codeword for this batch?' },
      schema: needleSchema,
      score: (p) => ((p as { codeword: string }).codeword.includes('ORCHID-HAMMER-42') ? 1 : 0),
    },
    {
      id: 'needle-80pct',
      systemPrompt: benchSystem('You find one specific fact buried in a long document.'),
      payload: { document: buildHaystack(800, 0.8, 'CYPRESS-LEDGER-7'), question: 'What is the registration codeword for this batch?' },
      schema: needleSchema,
      score: (p) => ((p as { codeword: string }).codeword.includes('CYPRESS-LEDGER-7') ? 1 : 0),
    },
  ],
};

// ---------------------------------------------------------------------------
// Suite 3: scientific reasoning — flaw detection with gold answers.
// ---------------------------------------------------------------------------

const flawSchema = z.object({
  flawType: z.enum(['confounding', 'selection-bias', 'p-hacking', 'overgeneralization', 'none']),
  fatal: z.boolean(),
  rationale: z.string().min(10),
});

const scientificReasoningSuite: BenchSuite = {
  id: 'scientific-reasoning',
  taskClass: 'high_quality_reasoning',
  description: 'Identify the fatal methodological flaw in mini study descriptions (gold-keyed)',
  requiresVision: false,
  cases: [
    {
      id: 'confound-mediator',
      systemPrompt: benchSystem('You critique study designs for fatal flaws.'),
      payload: { study: 'Coffee drinkers show lower dementia rates; authors conclude coffee prevents dementia. No control for income, exercise, or baseline health.' },
      schema: flawSchema,
      score: (p) => { const v = p as { flawType: string }; return v.flawType === 'confounding' ? 1 : 0; },
    },
    {
      id: 'selection-bias-volunteers',
      systemPrompt: benchSystem('You critique study designs for fatal flaws.'),
      payload: { study: 'A sleep app surveyed only users who volunteered through a productivity forum; authors conclude the general population sleeps 6.1h on average.' },
      schema: flawSchema,
      score: (p) => { const v = p as { flawType: string }; return v.flawType === 'selection-bias' ? 1 : 0; },
    },
    {
      id: 'p-hacking-outcomes',
      systemPrompt: benchSystem('You critique study designs for fatal flaws.'),
      payload: { study: 'A trial measured 40 biomarkers, reported the one significant at p=0.049 as its primary finding, and claimed the treatment works.' },
      schema: flawSchema,
      score: (p) => { const v = p as { flawType: string }; return v.flawType === 'p-hacking' ? 1 : 0; },
    },
    {
      id: 'overgeneralization-mice',
      systemPrompt: benchSystem('You critique study designs for fatal flaws.'),
      payload: { study: 'A 12-mouse study of a gene knockout; authors conclude the gene causes human depression.' },
      schema: flawSchema,
      score: (p) => { const v = p as { flawType: string }; return v.flawType === 'overgeneralization' ? 1 : 0; },
    },
  ],
};

// ---------------------------------------------------------------------------
// Suite 4: retrieval synthesis — cite the right evidence ids (id-set Jaccard).
// ---------------------------------------------------------------------------

const synthesisSchema = z.object({ supportingIds: z.array(z.string()), contradictingIds: z.array(z.string()) });
const jaccard = (a: string[], b: string[]): number => {
  const sa = new Set(a); const sb = new Set(b);
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter += 1;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
};

const retrievalSynthesisSuite: BenchSuite = {
  id: 'retrieval-synthesis',
  taskClass: 'long_context',
  description: 'Classify snippets as supporting/contradicting a claim; scored by id-set Jaccard',
  requiresVision: false,
  cases: [
    {
      id: 'mixed-evidence',
      systemPrompt: benchSystem('You classify retrieved snippets against the claim by their CONTENT, citing snippet ids.'),
      payload: {
        claim: 'Remote work reduced average team productivity after 2020.',
        snippets: [
          { id: 's1', text: 'Panel data shows output per hour flat, but total hours fell 8%.' },
          { id: 's2', text: 'A field experiment found no significant productivity change.' },
          { id: 's3', text: 'Self-reported surveys show HIGHER productivity when remote.' },
        ],
      },
      schema: synthesisSchema,
      score: (p) => {
        const v = p as { supportingIds: string[]; contradictingIds: string[] };
        return (jaccard(v.supportingIds, ['s1']) + jaccard(v.contradictingIds, ['s3'])) / 2;
      },
    },
    {
      id: 'direct-contradiction',
      systemPrompt: benchSystem('You classify retrieved snippets against the claim by their CONTENT, citing snippet ids.'),
      payload: {
        claim: 'TheCRISPR screen identified gene X as essential.',
        snippets: [
          { id: 'c1', text: 'Knockout of gene X showed no viability change in replicate screens.' },
          { id: 'c2', text: 'Gene X knockdown arrested cell cycle.' },
          { id: 'c3', text: 'Library quality controls passed for both screens.' },
        ],
      },
      schema: synthesisSchema,
      score: (p) => {
        const v = p as { supportingIds: string[]; contradictingIds: string[] };
        return (jaccard(v.supportingIds, ['c2']) + jaccard(v.contradictingIds, ['c1'])) / 2;
      },
    },
  ],
};

// ---------------------------------------------------------------------------
// Suite 5: vision (live-only content; skipped without verified capability).
// ---------------------------------------------------------------------------

const visionSchema = z.object({ chartType: z.enum(['bar', 'line', 'scatter', 'pie']), trend: z.string().min(3) });
const visionSuite: BenchSuite = {
  id: 'vision',
  taskClass: 'vision',
  description: 'Image→structured chart reading (requires verified vision-capable route; live-only)',
  requiresVision: true,
  cases: [
    {
      id: 'chart-type',
      systemPrompt: benchSystem('You read scientific figures and return their chart type and visible trend.'),
      payload: { imageUrl: 'https://help.aliyun.com/zh/model-studio/benchmark/fixtures/line-trend.png', question: 'What chart type is this and what is the overall trend?' },
      schema: visionSchema,
      score: (p) => { const v = p as { chartType: string }; return v.chartType === 'line' ? 1 : 0; },
    },
    {
      id: 'scatter-outliers',
      systemPrompt: benchSystem('You read scientific figures and return their chart type and visible trend.'),
      payload: { imageUrl: 'https://help.aliyun.com/zh/model-studio/benchmark/fixtures/scatter-cluster.png', question: 'What chart type is this and how many clusters are visible? Include clusters in the trend text.' },
      schema: visionSchema,
      score: (p) => { const v = p as { chartType: string }; return v.chartType === 'scatter' ? 1 : 0; },
    },
  ],
};

// ---------------------------------------------------------------------------
// Suite 6: tool-selection — pick the right tool from a catalog (exact match).
// ---------------------------------------------------------------------------

const toolSchema = z.object({ tool: z.string().min(1), reason: z.string().min(5) });
const toolCatalog = [
  { name: 'search_papers', description: 'Full-text search of scholarly paper abstracts' },
  { name: 'fetch_dataset', description: 'Download a named public dataset with checksum' },
  { name: 'run_regression', description: 'Fit an OLS regression on a local CSV' },
  { name: 'export_bibtex', description: 'Export citations as a BibTeX file' },
];

const toolSelectionSuite: BenchSuite = {
  id: 'tool-selection',
  taskClass: 'cheap_extraction',
  description: 'Select the correct tool (exact name) from a 4-tool catalog for a task',
  requiresVision: false,
  cases: [
    { id: 'pick-search', systemPrompt: benchSystem('You select exactly one tool by its name from the catalog.'), payload: { catalog: toolCatalog, task: 'Find prior work on CRISPR off-target rates.' }, schema: toolSchema, score: (p) => ((p as { tool: string }).tool === 'search_papers' ? 1 : 0) },
    { id: 'pick-dataset', systemPrompt: benchSystem('You select exactly one tool by its name from the catalog.'), payload: { catalog: toolCatalog, task: 'Get the UCI wine dataset for analysis.' }, schema: toolSchema, score: (p) => ((p as { tool: string }).tool === 'fetch_dataset' ? 1 : 0) },
    { id: 'pick-regression', systemPrompt: benchSystem('You select exactly one tool by its name from the catalog.'), payload: { catalog: toolCatalog, task: 'Fit a linear model of quality on alcohol from wine.csv.' }, schema: toolSchema, score: (p) => ((p as { tool: string }).tool === 'run_regression' ? 1 : 0) },
    { id: 'pick-export', systemPrompt: benchSystem('You select exactly one tool by its name from the catalog.'), payload: { catalog: toolCatalog, task: 'Prepare the bibliography for the manuscript.' }, schema: toolSchema, score: (p) => ((p as { tool: string }).tool === 'export_bibtex' ? 1 : 0) },
  ],
};

// ---------------------------------------------------------------------------
// Suite 7: ranking — order by stated criteria (normalized Kendall-tau).
// ---------------------------------------------------------------------------

const rankSchema = z.object({ order: z.array(z.string()).min(2) });
/** 1 - normalized Kendall-tau distance between the submission and gold (n elements). */
const kendallScore = (submission: string[], gold: string[]): number => {
  const n = gold.length;
  if (submission.length !== n) return 0;
  const posGold = new Map(gold.map((g, i) => [g, i] as const));
  const posSub = new Map(submission.map((s, i) => [s, i] as const));
  if (submission.some((s) => !posGold.has(s))) return 0;
  let discordant = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const gi = posGold.get(gold[i]!)!; const gj = posGold.get(gold[j]!)!;
      const si = posSub.get(gold[i]!)!; const sj = posSub.get(gold[j]!)!;
      if ((si < sj) !== (gi < gj)) discordant += 1;
    }
  }
  const pairs = (n * (n - 1)) / 2;
  return pairs === 0 ? 1 : 1 - discordant / pairs;
};

const rankingSuite: BenchSuite = {
  id: 'ranking',
  taskClass: 'ranking',
  description: 'Order candidates by stated criteria; scored by normalized Kendall-tau',
  requiresVision: false,
  cases: [
    {
      id: 'rank-by-effect-size',
      systemPrompt: benchSystem('You rank candidates strictly by the stated criterion, best first.'),
      payload: {
        criterion: 'Rank interventions by effect size (largest first); break ties by lower cost.',
        candidates: [
          { id: 'a', effectSize: 0.2, cost: 10 }, { id: 'b', effectSize: 0.8, cost: 50 },
          { id: 'c', effectSize: 0.5, cost: 20 }, { id: 'd', effectSize: 0.5, cost: 15 },
          { id: 'e', effectSize: 0.1, cost: 5 },
        ],
      },
      schema: rankSchema,
      score: (p) => kendallScore((p as { order: string[] }).order, ['b', 'd', 'c', 'a', 'e']),
    },
    {
      id: 'rank-by-recency',
      systemPrompt: benchSystem('You rank candidates strictly by the stated criterion, best first.'),
      payload: {
        criterion: 'Rank studies newest first; break ties alphabetically by id.',
        candidates: [
          { id: 'w', year: 2019 }, { id: 'x', year: 2023 }, { id: 'y', year: 2021 }, { id: 'z', year: 2023 },
        ],
      },
      schema: rankSchema,
      score: (p) => kendallScore((p as { order: string[] }).order, ['x', 'z', 'y', 'w']),
    },
  ],
};

export const BENCHMARK_SUITES: readonly BenchSuite[] = [
  structuredOutputSuite, longContextSuite, scientificReasoningSuite,
  retrievalSynthesisSuite, visionSuite, toolSelectionSuite, rankingSuite,
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export const runSuite = async (
  suite: BenchSuite,
  route: RouteCandidate,
): Promise<SuiteResult> => {
  if (suite.requiresVision && route.capabilities?.vision !== true) {
    return {
      suiteId: suite.id, route: { name: route.name, modelId: route.modelId },
      skippedReason: 'route has no VERIFIED vision capability (registry) — suite not executed, not scored zero',
      cases: [], aggregate: { meanScore: 0, validOutputs: 0, totalCases: suite.cases.length, meanLatencyMs: 0 },
    };
  }
  const cases: CaseResult[] = [];
  for (const bench of suite.cases) {
    // Canonical concurrency baseline: every provider call (benchmarks included) goes
    // through the process-wide in-flight cap — a live comparison must never stampede
    // the route it is measuring (FARLAB_MODEL_CONCURRENCY, src/pipeline/llm.ts).
    const res: StructuredCallResult<unknown> = await withModelSlot(() => route.provider.structuredCall(
      {
        task: `bench:${suite.id}:${bench.id}`,
        systemPrompt: bench.systemPrompt,
        userPayload: { outputContract: describeShape(bench.schema), input: bench.payload },
        outputKind: 'json',
        jsonSchema: strictSchemaOrUndefined(bench.schema),
        purpose: `bench-${suite.id}-${bench.id}`,
      },
      (raw) => validateStructured<unknown>(raw, bench.schema),
    ));
    if (res.ok && res.data !== undefined) {
      cases.push({
        caseId: bench.id, ok: true, score: bench.score(res.data),
        latencyMs: res.receipt.latencyMs, requestHash: res.receipt.requestHash, outputHash: res.receipt.outputHash,
        ...(res.receipt.params?.structuredOutput !== undefined ? { structuredOutputMode: res.receipt.params.structuredOutput } : {}),
        ...(res.receipt.transportRetries !== undefined ? { transportRetries: res.receipt.transportRetries } : {}),
        ...(res.receipt.correctiveReasks !== undefined ? { correctiveReasks: res.receipt.correctiveReasks } : {}),
      });
    } else {
      const err = res.error ?? { kind: 'provider_error', message: 'unknown failure' };
      cases.push({
        caseId: bench.id, ok: false, score: 0,
        errorKind: err.kind, errorMessage: err.message.slice(0, 200),
        latencyMs: res.receipt.latencyMs, requestHash: res.receipt.requestHash, outputHash: res.receipt.outputHash,
      });
    }
  }
  const meanScore = cases.reduce((s, c) => s + c.score, 0) / cases.length;
  return {
    suiteId: suite.id, route: { name: route.name, modelId: route.modelId },
    cases,
    aggregate: {
      meanScore: Math.round(meanScore * 1e4) / 1e4,
      validOutputs: cases.filter((c) => c.ok).length,
      totalCases: cases.length,
      meanLatencyMs: cases.length === 0 ? 0 : Math.round(cases.reduce((s, c) => s + c.latencyMs, 0) / cases.length),
    },
  };
};

export interface ModelComparisonRow {
  suiteId: BenchSuiteId;
  ranking: Array<{ route: string; modelId: string; meanScore: number; validOutputs: number; totalCases: number; skipped?: string }>;
}

/**
 * Cross-model comparison per suite. Ranking = meanScore desc, route name asc
 * (deterministic ties). Only executed suites rank — a skipped suite lists its routes
 * with the skip reason instead of a score.
 */
export const compareModels = (results: SuiteResult[]): ModelComparisonRow[] => {
  const bySuite = new Map<BenchSuiteId, SuiteResult[]>();
  for (const r of results) {
    const list = bySuite.get(r.suiteId) ?? [];
    list.push(r);
    bySuite.set(r.suiteId, list);
  }
  return [...bySuite.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([suiteId, suiteResults]) => ({
      suiteId,
      ranking: suiteResults
        .slice()
        .sort((a, b) =>
          (a.skippedReason !== undefined ? 1 : 0) - (b.skippedReason !== undefined ? 1 : 0)
          || b.aggregate.meanScore - a.aggregate.meanScore
          || a.route.name.localeCompare(b.route.name))
        .map((r) => ({
          route: r.route.name, modelId: r.route.modelId,
          meanScore: r.aggregate.meanScore, validOutputs: r.aggregate.validOutputs,
          totalCases: r.aggregate.totalCases,
          ...(r.skippedReason !== undefined ? { skipped: r.skippedReason } : {}),
        })),
    }));
};
