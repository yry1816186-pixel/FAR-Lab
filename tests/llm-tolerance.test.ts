/**
 * callStructured tolerance-chain unit tests (llm.ts parse layer).
 *
 * Live incident 2026-08-22 (eval batch P2, run_z8xetk84z399yzedftkygr1je5):
 * DeepSeek wrapped the falsification spec in an envelope key named after the
 * task — {"falsification-spec": {...}} — and schema validation rejected it
 * twice (initial + corrective retry), failing the run. These tests pin the
 * fourth tolerance layer (single-key envelope unwrap) plus regressions for the
 * existing layers (null-strip, enum-variant normalization) and the no-false-
 * positive property (unwrapping never validates content that fails the schema).
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { StageContext } from '../src/pipeline/types.js';
import { callStructured } from '../src/pipeline/llm.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';

const Spec = z.object({
  observable: z.string().min(1),
  measurement: z.string().min(1),
  decisionRuleProvenance: z.enum(['evidence-derived', 'community-standard', 'model-stipulated']),
  confounders: z.array(z.string()).default([]),
});

const makeCtx = (steps: StubStep[]): StageContext => {
  const ctx = {
    provider: createTestStubProvider(steps),
    recordReceipt: () => {},
    run: { id: 'run_test000000000000000000000001' },
  };
  return ctx as unknown as StageContext;
};

const call = (ctx: StageContext) =>
  callStructured(ctx, {
    stage: 'critique_falsify',
    purpose: 'falsification-spec:test',
    systemPrompt: 'test system prompt',
    payload: { input: 1 },
    schema: Spec,
  }).then((r) => r.data);

describe('callStructured tolerance chain', () => {
  it('unwraps a single-key envelope named after the task (live P2 incident shape)', async () => {
    const ctx = makeCtx([
      {
        rawOutput: JSON.stringify({
          'falsification-spec': {
            observable: 'Interaction effect between host genotype and gut bacterial abundance on ICI response',
            measurement: 'Progression-free survival difference across genotype x abundance strata',
            decisionRuleProvenance: 'evidence-derived',
            confounders: ['antibiotic exposure'],
          },
        }),
      },
    ]);
    const data = await call(ctx);
    expect(data.observable).toBe('Interaction effect between host genotype and gut bacterial abundance on ICI response');
    expect(data.decisionRuleProvenance).toBe('evidence-derived');
  });

  it('unwraps a double envelope (depth 2)', async () => {
    const ctx = makeCtx([
      {
        rawOutput: JSON.stringify({
          result: {
            output: {
              observable: 'o'.repeat(20),
              measurement: 'm'.repeat(20),
              decisionRuleProvenance: 'model-stipulated',
            },
          },
        }),
      },
    ]);
    const data = await call(ctx);
    expect(data.observable).toBe('o'.repeat(20));
  });

  it('envelope unwrap combines with null-stripping and enum-variant normalization', async () => {
    const ctx = makeCtx([
      {
        rawOutput: JSON.stringify({
          'falsification-spec': {
            observable: 'observable text',
            measurement: 'measurement text',
            decisionRuleProvenance: 'Evidence Derived',
            confounders: null,
          },
        }),
      },
    ]);
    const data = await call(ctx);
    expect(data.decisionRuleProvenance).toBe('evidence-derived');
    expect(data.confounders).toEqual([]);
  });

  it('plain null-strip and enum normalization still work without an envelope', async () => {
    const ctx = makeCtx([
      {
        rawOutput: JSON.stringify({
          observable: 'observable text',
          measurement: 'measurement text',
          decisionRuleProvenance: 'community standard',
          confounders: null,
        }),
      },
    ]);
    const data = await call(ctx);
    expect(data.decisionRuleProvenance).toBe('community-standard');
    expect(data.confounders).toEqual([]);
  });

  it('underscore enum values still normalize (regression: testable now -> testable_now)', async () => {
    const Underscore = z.object({ status: z.enum(['testable_now', 'testable_with_data']) });
    const ctx = makeCtx([{ rawOutput: JSON.stringify({ status: 'Testable Now' }) }]);
    const r = await callStructured(ctx, {
      stage: 'critique_falsify',
      purpose: 'enum-regression',
      systemPrompt: 's',
      payload: {},
      schema: Underscore,
    });
    expect(r.data.status).toBe('testable_now');
  });

  it('ambiguous enum folds stay untouched (content text is never rewritten)', async () => {
    const Ambiguous = z.object({
      variant: z.enum(['evidence-derived', 'evidence derived']),
      observable: z.string().min(1),
      measurement: z.string().min(1),
      decisionRuleProvenance: z.enum(['model-stipulated']),
    });
    const ctx = makeCtx([
      {
        rawOutput: JSON.stringify({
          variant: 'Evidence-Derived',
          observable: 'observable text',
          measurement: 'measurement text',
          decisionRuleProvenance: 'model-stipulated',
        }),
      },
    ]);
    // 'evidence-derived' and 'evidence derived' fold to the same canon, so the
    // variant field must NOT be rewritten; the schema rejects it rather than guess.
    await expect(callStructured(ctx, {
      stage: 'critique_falsify',
      purpose: 'enum-ambiguous',
      systemPrompt: 's',
      payload: {},
      schema: Ambiguous,
    })).rejects.toThrow(/schema validation failed: variant/);
  });

  it('path-aware normalization: free text colliding with an enum member at ANOTHER path is never rewritten', async () => {
    // Adversarial-audit P2 (2026-08-22): the flat-enum-set version rewrote any string
    // anywhere that canon-folds to some member; 'Evidence Derived' in a free-text field
    // would silently become 'evidence-derived'. Path-aware folding must leave it alone
    // while still normalizing genuine enum-position variants.
    const PathAware = z.object({
      provenance: z.enum(['evidence-derived', 'model-stipulated']),
      confounderNote: z.string().min(1),
      nested: z.object({ status: z.enum(['testable_now']) }).default({ status: 'testable_now' }),
    });
    const ctx = makeCtx([
      {
        rawOutput: JSON.stringify({
          provenance: 'Model Stipulated', // enum position: SHOULD fold
          confounderNote: 'Evidence Derived', // free-text position: must stay verbatim
          nested: { status: 'Testable Now' }, // nested enum position: SHOULD fold
        }),
      },
    ]);
    const r = await callStructured(ctx, {
      stage: 'critique_falsify',
      purpose: 'enum-path-aware',
      systemPrompt: 's',
      payload: {},
      schema: PathAware,
    });
    expect(r.data.provenance).toBe('model-stipulated');
    expect(r.data.confounderNote).toBe('Evidence Derived');
    expect(r.data.nested.status).toBe('testable_now');
  });

  it('no false positive: wrapped content that still fails the schema is rejected', async () => {
    const ctx = makeCtx([
      {
        rawOutput: JSON.stringify({
          'falsification-spec': {
            observable: '',
            measurement: 'measurement text',
            decisionRuleProvenance: 'not-a-real-variant',
          },
        }),
      },
    ]);
    await expect(call(ctx)).rejects.toThrow(/schema validation failed: observable/);
  });

  it('single-key-shaped schema parses as-is (unwrap only runs after as-is failure)', async () => {
    const Inner = z.object({ ok: z.boolean(), note: z.string() });
    const ctx = makeCtx([{ rawOutput: JSON.stringify({ result: { ok: true, note: 'n' } }) }]);
    const r = await callStructured(ctx, {
      stage: 'critique_falsify',
      purpose: 'shape-test',
      systemPrompt: 's',
      payload: {},
      schema: z.object({ result: Inner }),
    });
    expect(r.data.result.ok).toBe(true);
  });
});
