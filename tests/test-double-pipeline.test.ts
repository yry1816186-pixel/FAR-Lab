import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { ModelProviderConfig, TEST_DOUBLE_WIRE_BASE_URL, ResearchQuestion, ResearchRun, newId } from '../src/domain/index.js';
import { TEMPLATE_REFUSAL_REASON } from '../src/pipeline/stages/shared.js';
import type { RawSourceRecord, SourceAdapter } from '../src/shared/ports.js';
import type { SourceFamily, SourceIdentifier } from '../src/domain/source.js';

/**
 * IN-PROCESS TEST DOUBLE — full-journey integration. A run bound to a
 * wire='offline' model config traverses the REAL orchestrator end-to-end
 * (scope -> ... -> export) with zero network: the model plane is the
 * deterministic test double and every source family is an in-memory fake
 * (composition adaptersOverride, the test-only seam with the same rule as
 * providerOverride). The stages' own zod schemas are the output authority —
 * this test is the schema-validity proof for every purpose handler.
 *
 * The double is an isolated TEST FIXTURE (automated tests + browser E2E), not a
 * product route: its filler must never be minted as scientific content, which is
 * exactly what the real-content assertions below lock down.
 */

const QUESTION =
  'Does mock intervention X improve outcome Y in population Z compared with standard care?';

/**
 * Substantially distinct fixtures (designs, populations, findings, directions —
 * including an explicit negative result): near-duplicate abstracts would be
 * legitimately minhash/fuzzy-merged by the retrieve stage's dedup and starve
 * build_evidence of usable documents.
 */
const ABSTRACT_VARIANTS: ReadonlyArray<(family: string, i: number) => string> = [
  (f, i) =>
    `Multicentre randomised trial ${i} on the ${f} route: 412 adults in population Z received intervention X for 24 weeks. ` +
    `The primary endpoint outcome Y improved by a standardized difference of 0.41 versus standard care. ` +
    `Adverse events were rare and comparable between arms. Follow-up completion reached 96 percent.`,
  (f, i) =>
    `Prospective cohort study ${i} from the ${f} registry: 1,204 participants exposed to intervention X were matched to unexposed controls. ` +
    `Outcome Y occurred less frequently in the exposed group after adjustment for baseline severity. ` +
    `Residual confounding by indication cannot be excluded. Attrition was 11 percent at two years.`,
  (f, i) =>
    `Randomised placebo-controlled trial ${i} via ${f}: 198 participants in population Z. ` +
    `No significant benefit of intervention X on outcome Y was observed; the adjusted estimate was close to zero with wide intervals. ` +
    `The trial was stopped early for futility, limiting precision. This negative finding tempers enthusiasm from earlier positive reports.`,
];

const abstractFor = (family: string, i: number): string => ABSTRACT_VARIANTS[i % ABSTRACT_VARIANTS.length]!(family, i);

const recordsFor = (family: SourceFamily, count: number): RawSourceRecord[] =>
  Array.from({ length: count }, (_, i) => ({
    identifiers: [{ kind: 'doi', value: `10.5555/${family}-${i}` }],
    title: `${['Randomised trial', 'Cohort study', 'Futility trial'][i % 3]!} ${i} on intervention X and outcome Y (${family} line)`,
    publicationYear: 2026,
    authors: ['A. Fixture'],
    contentDepth: 'abstract',
    accessState: 'open',
    abstractText: abstractFor(family, i),
    normalized: { DOI: `10.5555/${family}-${i}`, fixture: true },
  }));

/**
 * Verify_sources resolves every DOI through the CROSSREF family (canonical DOI
 * authority) regardless of which family retrieved the document — so the crossref
 * fake must resolve the whole pooled DOI space, not just its own records.
 */
const fakeAdapter = (family: SourceFamily, resolveSpace: RawSourceRecord[]): SourceAdapter => {
  const records = recordsFor(family, 3);
  return {
    family,
    async search(query, opts) {
      void opts;
      return { family, query, httpStatus: 200, records, latencyMs: 1 };
    },
    async resolve(identifier: SourceIdentifier) {
      const hit = resolveSpace.find((r) => r.identifiers.some((id) => id.value === identifier.value));
      return hit === undefined ? { found: false, httpStatus: 404 } : { found: true, record: hit, httpStatus: 200 };
    },
  };
};

const allRecords = (): RawSourceRecord[] =>
  (['openalex', 'crossref', 'arxiv'] as const).flatMap((f) => recordsFor(f, 3));

/**
 * EVERY pipeline-reachable family is overridden — counter-evidence searches also
 * hit europepmc, and one uncovered family would leak a REAL network call into a
 * test (observed once: 6 real-world DOIs entered the pool via europepmc). The
 * fake for a family returns no records but still resolves the whole pooled DOI
 * space, so verification semantics stay uniform.
 */
const fakeAdapters = (): Partial<Record<string, SourceAdapter>> => {
  const space = allRecords();
  const empty: SourceAdapter = {
    family: 'europepmc',
    async search(query) {
      return { family: 'europepmc', query, httpStatus: 200, records: [], latencyMs: 1 };
    },
    async resolve(identifier: SourceIdentifier) {
      const hit = space.find((r) => r.identifiers.some((id) => id.value === identifier.value));
      return hit === undefined ? { found: false, httpStatus: 404 } : { found: true, record: hit, httpStatus: 200 };
    },
  };
  return {
    openalex: fakeAdapter('openalex', space),
    crossref: fakeAdapter('crossref', space),
    arxiv: fakeAdapter('arxiv', space),
    europepmc: empty,
  };
};

let tmp: string;
let app: App;
let cfgId: string;

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-test-double-run-'));
  app = await createApp({ dataDir: tmp, adaptersOverride: fakeAdapters() });
  const cfg = ModelProviderConfig.parse({
    id: newId('mcfg'),
    label: 'test double route',
    wire: 'offline',
    baseUrl: TEST_DOUBLE_WIRE_BASE_URL,
    modelId: 'offline-dev',
    apiKey: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  cfgId = cfg.id;
  app.store.putObject('model_config', cfg);
});

afterAll(() => {
  app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const runOffline = async (): Promise<ResearchRun> => {
  const q = ResearchQuestion.parse({
    id: newId('q'),
    text: QUESTION,
    background: '',
    goalType: 'exploratory',
    scope: { domain: 'offline development', phenomena: ['intervention X and outcome Y'] },
    constraints: {},
    createdAt: new Date().toISOString(),
  });
  const run = app.store.createRun(q, { providerConfigId: cfgId });
  return app.orchestrator.execute(run.id);
};

describe('offline dev run: full journey through the real orchestrator', () => {
  it(
    'real-content discipline: real retrieval stands, deterministic-wire science is refused honestly (all receipts test-mode, zero live calls)',
    async () => {
      const final = await runOffline();
      expect(final.status).toBe('completed');
      expect(final.lastError ?? '').toBe('');
      // No stage may FAIL; visible skips are the honest vocabulary.
      for (const s of final.stages) {
        expect(s.state, `stage ${s.stage}`).not.toBe('failed');
      }

      // Truth plane: every model call went through the offline route as test-mode.
      const receipts = app.store.listObjects('receipt', final.id);
      const modelReceipts = receipts.filter((r) => r.kind === 'model_call');
      expect(modelReceipts.length).toBeGreaterThan(0);
      for (const r of modelReceipts) {
        expect(r.executionMode, `receipt ${r.id}`).toBe('test');
        expect(r.modelCall?.provider).toBe(`custom:${cfgId}`);
      }
      expect(receipts.some((r) => r.kind === 'model_call' && r.executionMode === 'live')).toBe(false);

      // REAL content stands: retrieval + claim extraction minted real, quoted,
      // locator-anchored claims from the (fake-routed) corpus.
      const claims = app.store.listObjects('claim', final.id);
      expect(claims.length).toBeGreaterThan(0);
      for (const c of claims.slice(0, 8)) {
        expect(c.locators.length, `claim ${c.id} must carry a locator`).toBeGreaterThan(0);
      }

      // REFUSED content: template scope and template hypotheses never mint —
      // the stages skip with the real-content refusal as their recorded reason
      // (owner directive 2026-08-29: no demonstration content in the product).
      const scopeRec = final.stages.find((s) => s.stage === 'scope');
      expect(scopeRec?.state).toBe('skipped');
      expect(String(scopeRec?.error)).toContain(TEMPLATE_REFUSAL_REASON);
      const hypStageRec = final.stages.find((s) => s.stage === 'generate_hypotheses');
      expect(hypStageRec?.state).toBe('skipped');
      expect(String(hypStageRec?.error)).toContain(TEMPLATE_REFUSAL_REASON);
      expect(app.store.listObjects('hypothesis', final.id)).toHaveLength(0);
      expect(app.store.listObjects('plan', final.id)).toHaveLength(0);

      // The run still closes its loop: export bundles the real evidence base.
      expect(app.store.listObjects('bundle', final.id).length).toBe(1);

      // Determinism of the whole offline pipeline: same question, same shape.
      const second = await runOffline();
      expect(second.status).toBe('completed');
      expect(app.store.listObjects('hypothesis', second.id)).toHaveLength(0);
      expect(app.store.listObjects('claim', second.id).length).toBe(claims.length);
    },
    120_000,
  );
});
