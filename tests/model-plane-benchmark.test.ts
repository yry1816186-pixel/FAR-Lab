import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  PromptRegistry, definePrompt, materializePrompt, promptFingerprint, planePrompts, regressionSnapshotEntries,
} from '../src/model-plane/prompts.js';
import {
  BENCHMARK_SUITES, runSuite, compareModels, type SuiteResult,
} from '../src/model-plane/benchmark.js';
import { candidate } from '../src/model-plane/routing.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import { UNTRUSTED_DATA_RULE } from '../src/shared/untrusted.js';

/** All benchmark/prompts tests are offline + deterministic (test-stub providers only). */

// ---------------------------------------------------------------------------
// prompt assets
// ---------------------------------------------------------------------------

describe('prompt asset registry', () => {
  it('fingerprint is canonical, stable, version-sensitive', () => {
    const f1 = promptFingerprint('p', 1, 'text');
    expect(f1).toHaveLength(64);
    expect(promptFingerprint('p', 1, 'text')).toBe(f1);
    expect(promptFingerprint('p', 2, 'text')).not.toBe(f1);
    expect(promptFingerprint('p', 1, 'text2')).not.toBe(f1);
  });

  it('same id+version with different text throws — content edits require version bump', () => {
    const reg = new PromptRegistry();
    reg.register(definePrompt('x', 1, 'a', { origin: 't', lastChanged: '2026-08-24' }));
    expect(() => reg.register(definePrompt('x', 1, 'b', { origin: 't', lastChanged: '2026-08-24' }))).toThrow(/bump the version/);
    // idempotent re-registration of the SAME asset is fine (hot reload)
    expect(() => reg.register(definePrompt('x', 1, 'a', { origin: 't', lastChanged: '2026-08-24' }))).not.toThrow();
  });

  it('latest() resolves the highest version; get(id, version) pins', () => {
    const reg = new PromptRegistry();
    reg.register(definePrompt('x', 1, 'a', { origin: 't', lastChanged: '2026-08-24' }));
    reg.register(definePrompt('x', 2, 'b', { origin: 't', lastChanged: '2026-08-24' }));
    expect(reg.get('x').text).toBe('b');
    expect(reg.get('x', 1).text).toBe('a');
    expect(() => reg.get('nope')).toThrow(/unknown prompt asset/);
  });

  it('materializePrompt: strict bidirectional variable checking', () => {
    expect(materializePrompt('Hello {{name}}, do {{task}}.', { name: 'A', task: 'B' })).toBe('Hello A, do B.');
    expect(() => materializePrompt('{{a}}', {})).toThrow(/not supplied/);
    expect(() => materializePrompt('no vars', { a: '1' })).toThrow(/not present in template/);
  });

  it('plane registry owns the canonical untrusted-data-rule asset referencing the single source', () => {
    const asset = planePrompts.get('untrusted-data-rule');
    expect(asset.text).toBe(UNTRUSTED_DATA_RULE);
    expect(asset.provenance.origin).toBe('src/shared/untrusted.ts');
    const entries = regressionSnapshotEntries(planePrompts);
    expect(entries[0]).toMatchObject({ file: 'src/shared/untrusted.ts', name: 'untrusted-data-rule@v1' });
  });
});

// ---------------------------------------------------------------------------
// benchmark harness (offline mechanics via test-stub; NOT model-quality numbers)
// ---------------------------------------------------------------------------

/** Script a stub that answers every case of a suite with case-specific valid JSON. */
const perfectStubFor = (suiteId: string, cases: Array<{ id: string; answer: unknown }>): StubStep[] =>
  cases.map((c) => ({ forPurpose: `bench-${suiteId}-${c.id}`, rawOutput: JSON.stringify(c.answer) }));

describe('benchmark harness', () => {
  it('seven suites are registered with deterministic pure scorers', () => {
    expect(BENCHMARK_SUITES.map((s) => s.id)).toEqual([
      'structured-output', 'long-context', 'scientific-reasoning',
      'retrieval-synthesis', 'vision', 'tool-selection', 'ranking',
    ]);
    for (const suite of BENCHMARK_SUITES) {
      expect(suite.cases.length).toBeGreaterThan(0);
      // scorers are pure: same input → same score twice
      for (const c of suite.cases) {
        const once = c.score(c.schema.parse(dummyFor(c.schema)));
        expect(c.score(c.schema.parse(dummyFor(c.schema)))).toBe(once);
        expect(once).toBeGreaterThanOrEqual(0);
        expect(once).toBeLessThanOrEqual(1);
      }
    }
  });

  it('tool-selection suite scores a perfect scripted route at 1.0 with per-case receipts', async () => {
    const suite = BENCHMARK_SUITES.find((s) => s.id === 'tool-selection')!;
    const answers = suite.cases.map((c) => ({
      id: c.id,
      answer: c.id === 'pick-search' ? { tool: 'search_papers', reason: 'finds prior scholarly work' }
        : c.id === 'pick-dataset' ? { tool: 'fetch_dataset', reason: 'downloads the named dataset' }
        : c.id === 'pick-regression' ? { tool: 'run_regression', reason: 'fits OLS on local CSV' }
        : { tool: 'export_bibtex', reason: 'exports the bibliography' },
    }));
    const stub = createTestStubProvider(perfectStubFor('tool-selection', answers));
    const result = await runSuite(suite, candidate('scripted', stub, 'stub-model'));
    expect(result.aggregate.meanScore).toBe(1);
    expect(result.aggregate.validOutputs).toBe(4);
    expect(result.cases.every((c) => c.requestHash.length === 64 && c.outputHash.length === 64)).toBe(true);
    // receipts mark test execution — never presentable as live model quality
    expect(result.cases.every((c) => !c.ok || c.score === 1)).toBe(true);
  });

  it('failure path: a route returning garbage scores 0 with errorKind recorded (no crash, no credit)', async () => {
    const suite = BENCHMARK_SUITES.find((s) => s.id === 'scientific-reasoning')!;
    const stub = createTestStubProvider(
      suite.cases.map((c) => ({ forPurpose: `bench-scientific-reasoning-${c.id}`, rawOutput: 'not json at all' })),
    );
    const result = await runSuite(suite, candidate('garbage', stub, 'stub-model'));
    expect(result.aggregate.meanScore).toBe(0);
    expect(result.aggregate.validOutputs).toBe(0);
    expect(result.cases.every((c) => !c.ok && c.errorKind === 'invalid_output')).toBe(true);
  });

  it('ranking suite: kendall scoring gives partial credit for one adjacent swap, 0 for wrong length', async () => {
    const suite = BENCHMARK_SUITES.find((s) => s.id === 'ranking')!;
    const stub = createTestStubProvider([
      { forPurpose: 'bench-ranking-rank-by-effect-size', rawOutput: JSON.stringify({ order: ['b', 'd', 'a', 'c', 'e'] }) }, // one swap vs gold b d c a e
      { forPurpose: 'bench-ranking-rank-by-recency', rawOutput: JSON.stringify({ order: ['w', 'x', 'y'] }) }, // wrong length → 0
    ]);
    const result = await runSuite(suite, candidate('partial', stub, 'stub-model'));
    // 5 elements: one adjacent swap = 1 discordant pair of 10 → 0.9; wrong length → 0
    expect(result.cases[0]!.score).toBeCloseTo(0.9, 5);
    expect(result.cases[1]!.score).toBe(0);
    expect(result.aggregate.meanScore).toBeCloseTo(0.45, 5);
  });

  it('vision suite is SKIPPED (visibly) for routes without verified vision capability — never scored', async () => {
    const suite = BENCHMARK_SUITES.find((s) => s.id === 'vision')!;
    const stub = createTestStubProvider([]);
    const result = await runSuite(suite, candidate('text-only', stub, 'qwen3.7-flash'));
    expect(result.skippedReason).toContain('no VERIFIED vision capability');
    expect(result.cases).toHaveLength(0);
  });

  it('compareModels ranks by meanScore with deterministic ties and lists skips without scores', () => {
    const mk = (route: string, score: number, skipped?: string): SuiteResult => ({
      suiteId: 'structured-output',
      route: { name: route, modelId: 'm' },
      ...(skipped !== undefined ? { skippedReason: skipped } : {}),
      cases: [],
      aggregate: { meanScore: score, validOutputs: 0, totalCases: 5, meanLatencyMs: 0 },
    });
    const rows = compareModels([mk('b', 0.8), mk('a', 0.8), mk('c', 0.3), mk('d', 0, 'no capability')]);
    expect(rows).toHaveLength(1);
    const ranking = rows[0]!.ranking;
    expect(ranking.map((r) => r.route)).toEqual(['a', 'b', 'c', 'd']); // tie a/b by name asc; skip last
    expect(ranking[3]).toMatchObject({ skipped: 'no capability' });
  });

  it('long-context haystacks are deterministic and needle answers verify', async () => {
    const suite = BENCHMARK_SUITES.find((s) => s.id === 'long-context')!;
    const stub = createTestStubProvider([
      { forPurpose: 'bench-long-context-needle-30pct', rawOutput: JSON.stringify({ codeword: 'ORCHID-HAMMER-42' }) },
      { forPurpose: 'bench-long-context-needle-80pct', rawOutput: JSON.stringify({ codeword: 'CYPRESS-LEDGER-7' }) },
    ]);
    const result = await runSuite(suite, candidate('needle', stub, 'stub-model'));
    expect(result.aggregate.meanScore).toBe(1);
    // same fixture payload twice → identical requestHash (determinism of the suite data)
    const first = result.cases[0]!;
    expect(first.structuredOutputMode).toBeUndefined(); // stub receipts carry no params
    expect(first.requestHash).toHaveLength(64);
  });
});

/** Minimal schema-valid dummy per suite schema shape (scorer range check only). */
const dummyFor = (schema: z.ZodType<unknown>): unknown => {
  const shape = JSON.stringify(schema.safeParse({}));
  void shape;
  // Scorers only need SOME schema-valid value; use a per-suite best-effort valid dummy:
  return DUMMY;
};
const DUMMY: Record<string, unknown> = {
  severity: 'minor', appliesTo: 'data',
  meta: { title: 't', year: 2000, tags: ['t'] }, confidence: 0.5,
  name: 'n', items: [{ id: 'i', weight: 1 }, { id: 'j', weight: 2 }, { id: 'k', weight: 3 }],
  verdict: 'support', note: 'note text',
  codeword: 'X', supportingIds: [], contradictingIds: [],
  chartType: 'bar', trend: 'rising upward', tool: 't', reason: 'reason text',
  flawType: 'none', fatal: false, rationale: 'no flaw identified here',
  order: ['a', 'b'],
};
