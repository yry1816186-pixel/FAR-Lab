import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ModelProviderConfig, TEST_DOUBLE_WIRE_BASE_URL, newId } from '../src/domain/index.js';
import { createTestDoubleProvider } from '../src/providers/test-double.js';
import { createCustomProvider } from '../src/providers/custom.js';
import { defaultLiveProvider, getProvider } from '../src/providers/index.js';
import type { StructuredCallRequest } from '../src/shared/ports.js';

/**
 * IN-PROCESS TEST DOUBLE — provider mechanics. Pipeline-shape correctness of
 * every purpose handler is proven by tests/test-double-pipeline.test.ts (the real
 * orchestrator + the stages' own zod schemas are the authority); this file locks
 * the provider-level invariants: truth-plane stamping, determinism, the generic
 * schema-walker fallback, fail-visible behaviour and config-boundary rules.
 *
 * The double is an isolated TEST FIXTURE: it exists so automated tests and the
 * browser E2E suite can drive the real pipeline without model quota. It is not a
 * product route and serves no demonstration or acceptance purpose.
 */

const doubleCfg = (): ModelProviderConfig =>
  ModelProviderConfig.parse({
    id: newId('mcfg'),
    label: 'test double route',
    wire: 'offline',
    baseUrl: TEST_DOUBLE_WIRE_BASE_URL,
    modelId: 'offline-dev',
    apiKey: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

const req = (purpose: string, extra: Partial<StructuredCallRequest> = {}): StructuredCallRequest => ({
  task: 'test',
  userPayload: { questionText: 'Does X improve Y in population Z?' },
  outputKind: 'json',
  purpose,
  ...extra,
});

describe('test double provider: config boundary', () => {
  it('accepts a plain test-double config', () => {
    expect(doubleCfg().wire).toBe('offline');
  });

  it('rejects a reasoning declaration on the test-double wire (it speaks no dialect)', () => {
    const base = doubleCfg();
    const r = ModelProviderConfig.safeParse({ ...base, reasoning: { style: 'enable_thinking', defaultGear: 'medium' } });
    expect(r.success).toBe(false);
  });

  it('is NOT a registry name: getProvider resolves nothing, defaultLiveProvider refuses it', () => {
    expect(getProvider('offline')).toBeUndefined();
    const prev = process.env.FARLAB_MODEL_PROVIDER;
    process.env.FARLAB_MODEL_PROVIDER = 'offline';
    try {
      expect(() => defaultLiveProvider()).toThrow(/does not name a live provider/);
    } finally {
      if (prev === undefined) delete process.env.FARLAB_MODEL_PROVIDER;
      else process.env.FARLAB_MODEL_PROVIDER = prev;
    }
  });
});

describe('test double provider: receipts and determinism', () => {
  it('stamps every receipt executionMode=test with the custom:<id> provider name (no key needed)', async () => {
    const cfg = doubleCfg();
    const p = createCustomProvider(cfg);
    expect(p.liveReady).toBe(true);
    const res = await p.structuredCall(req('model-config-test'), (raw) => raw);
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.data).toEqual({ ok: true });
    expect(res.receipt.executionMode).toBe('test');
    expect(res.receipt.provider).toBe(`custom:${cfg.id}`);
    expect(res.receipt.modelId).toBe('offline-dev');
  });

  it('is deterministic: identical requests produce identical output hashes', async () => {
    const p = createTestDoubleProvider(doubleCfg());
    const parse = (raw: unknown): unknown => raw;
    const a = await p.structuredCall(req('query-planning'), parse);
    const b = await p.structuredCall(req('query-planning'), parse);
    if (!a.ok || !b.ok) throw new Error('expected both calls to succeed');
    expect(a.receipt.outputHash).toBe(b.receipt.outputHash);
    expect(a.data).toEqual(b.data);
  });

  it('covers the pipeline purposes with schema-valid payloads (spot check via inline parse)', async () => {
    const p = createTestDoubleProvider(doubleCfg());
    const QueryPlan = z.object({
      discovery: z.array(z.string().min(1)).length(2),
      supporting: z.array(z.string().min(1)).min(1).max(2),
      counter: z.array(z.string().min(1)).min(2).max(2),
    });
    const res = await p.structuredCall(
      req('query-planning'),
      (raw) => {
        const r = QueryPlan.safeParse(raw);
        return r.success ? r.data : new Error(r.error.message);
      },
    );
    expect(res.ok).toBe(true);
  });
});

describe('test double provider: generic fallback and fail-visible', () => {
  const walkerSchema = {
    type: 'object',
    properties: {
      a: { type: 'string' },
      b: { type: 'array', items: { type: 'integer' } },
      c: { type: 'string', enum: ['p', 'q'] },
    },
    required: ['a', 'b', 'c'],
    additionalProperties: false,
  };

  it('unknown purposes fall back to a minimal instance from the strict JSON-Schema projection', async () => {
    const p = createTestDoubleProvider(doubleCfg());
    const Parse = z.object({ a: z.string(), b: z.array(z.number().int()), c: z.enum(['p', 'q']) });
    const res = await p.structuredCall(
      req('some-future-purpose', { jsonSchema: walkerSchema }),
      (raw) => {
        const r = Parse.safeParse(raw);
        return r.success ? r.data : new Error(r.error.message);
      },
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.c).toBe('p');
  });

  it('fails visible with invalid_output when nothing can satisfy the caller schema (never fabricated success)', async () => {
    const p = createTestDoubleProvider(doubleCfg());
    const Impossible = z.object({ a: z.string().refine(() => false, 'never') });
    const res = await p.structuredCall(
      req('unparseable-purpose', { jsonSchema: walkerSchema }),
      (raw) => {
        const r = Impossible.safeParse(raw);
        return r.success ? r.data : new Error(r.error.message);
      },
    );
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.error.kind).toBe('invalid_output');
    expect(res.error.message).toContain('unparseable-purpose');
    expect(res.receipt.executionMode).toBe('test');
  });
});

describe('test double provider: conversation turn and claim->hypothesis edges (2026-08-27 takeover)', () => {
  // Sibling-lane gap A: the resident-agent loop asks with purpose
  // 'conversation:turn:turn' and its validator is the kernel's AgentAction
  // schema — a finish action with the conversation reply contract must parse.
  it('answers the resident-agent conversation turn with a valid finish action + launchable candidate', async () => {
    const p = createTestDoubleProvider(doubleCfg());
    const AgentActionLike = z.object({
      action: z.literal('finish'),
      reason: z.string().min(1),
      result: z.object({
        reply: z.string().min(1),
        clarifyingQuestions: z.array(z.string()).max(3),
        candidates: z.array(z.object({ text: z.string().min(1).max(2000), rationale: z.string().min(1).max(2000) })).max(5),
        readyToConverge: z.boolean(),
      }),
    });
    const res = await p.structuredCall(
      req('conversation:turn:turn', { userPayload: { task: '研究者发来新消息：「What mechanisms drive CRISPR off-target editing?」\n回应它' } }),
      (raw) => {
        const r = AgentActionLike.safeParse(raw);
        return r.success ? r.data : new Error(r.error.message);
      },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.data.result.candidates.length).toBe(1);
    expect(res.data.result.candidates[0]!.text).toContain('CRISPR off-target editing');
  });

  it('conversation turn without an extractable question still finishes honestly (no candidate)', async () => {
    const p = createTestDoubleProvider(doubleCfg());
    const res = await p.structuredCall(
      req('conversation:turn:turn', { userPayload: { task: 'no quoted question here' } }),
      (raw) => {
        const r = z.object({ action: z.string(), result: z.unknown() }).safeParse(raw);
        return r.success ? r.data : new Error(r.error.message);
      },
    );
    expect(res.ok).toBe(true);
  });

  // Sibling-lane gap B: the falsify stage builds EvidenceRelations from the
  // critique links — the offline spec must propose supporting (and, with
  // enough claims, one weakening) link so offline runs carry claim->hypothesis
  // edges for the web binding chips.
  it('falsification-spec proposes supporting links and a counter link when claims allow', async () => {
    const p = createTestDoubleProvider(doubleCfg());
    const LinkReason = z.object({ claimId: z.string().min(1), linkReason: z.string().min(20), sharedFocus: z.string().min(6) });
    const Out = z.object({
      supportingLinks: z.array(LinkReason.extend({ relation: z.enum(['supports', 'qualifies']) })).min(1),
      counterLinks: z.array(LinkReason.extend({ relation: z.enum(['contradicts', 'weakens', 'qualifies']) })),
      supportingClaimIds: z.array(z.string()),
    });
    const res = await p.structuredCall(
      req('falsification-spec:hyp_test1', {
        userPayload: {
          hypothesis: { id: 'hyp_test1', statement: 'X improves Y in Z' },
          availableClaims: [
            { id: 'clm_a', text: 'claim a' }, { id: 'clm_b', text: 'claim b' }, { id: 'clm_c', text: 'claim c' }, { id: 'clm_d', text: 'claim d' },
          ],
        },
      }),
      (raw) => {
        const r = Out.safeParse(raw);
        return r.success ? r.data : new Error(r.error.message);
      },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error('unreachable');
    expect(res.data.supportingLinks.length).toBe(2);
    expect(res.data.counterLinks.length).toBe(1);
    expect(res.data.counterLinks[0]!.relation).toBe('weakens');
  });
});
