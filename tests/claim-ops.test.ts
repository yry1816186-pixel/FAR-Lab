import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import {
  annotateClaim,
  ClaimOpError,
  excludeClaim,
  excludedClaimIdsOf,
  pinClaim,
  reclassifyClaim,
  reinstateClaim,
} from '../src/server/claim-ops.js';
import { ResearchQuestion, ScientificClaim } from '../src/domain/index.js';
import type { App } from '../src/app/composition.js';

/**
 * HX §15 evidence annotation/classification — unit-level over the module
 * (HTTP route branches live in the appended describe of tests/api.test.ts).
 * Contract under test: zod body validation (exclude/reclassify REQUIRE a
 * reason/classification), run-ownership guards (404, never cross-run
 * mutation), additive researcher layer (pipeline provenance untouched),
 * idempotent no-ops without audit noise, and the exclusion projection input.
 */

let tmp: string;
let app: App;
let runA = '';
let runB = ''; // ownership adversary
let claimA = '';
let claimB = '';

const mkClaim = (id: string, runId: string, text: string): string => {
  const claim = ScientificClaim.parse({
    id,
    runId,
    text,
    locators: [{ sourceDocumentId: 'src_test000000000000000000000001', quote: text }],
    bindingStatus: 'verified',
    alignmentChecked: true,
  });
  app.store.putObject('claim', claim);
  return claim.id;
};

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-claimops-'));
  app = await createApp({ dataDir: tmp, providerOverride: createTestStubProvider([]) });
  const mkRun = async (text: string): Promise<string> => {
    const q = ResearchQuestion.parse({
      id: `q_${text.replace(/[^a-z]/g, '').padEnd(26, '0').slice(0, 26)}`,
      text,
      background: '',
      goalType: 'explanatory',
      scope: { domain: 'materials', phenomena: ['dendrite growth'] },
      constraints: {},
      createdAt: new Date().toISOString(),
    });
    return app.store.createRun(q).id;
  };
  runA = await mkRun('Why do solid electrolytes fail under dendrite growth A?');
  runB = await mkRun('Why do solid electrolytes fail under dendrite growth B?');
  claimA = mkClaim('clm_a00000000000000000000000001', runA, 'Void density correlates with penetration depth.');
  claimB = mkClaim('clm_b00000000000000000000000001', runB, 'Grain-boundary chemistry dominates failure.');
});

afterAll(() => {
  app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('annotate', () => {
  it('appends a researcher annotation + audit event, provenance fields untouched', () => {
    const before = app.store.getObject('claim', claimA)!;
    const res = annotateClaim(app, runA, claimA, { text: 'Sample size n=12 — weak imprecision, flag for review.' });
    expect(res.researcher.annotations).toHaveLength(1);
    expect(res.researcher.annotations[0]?.text).toContain('n=12');
    expect(res.eventId).toBeGreaterThan(0);
    const after = app.store.getObject('claim', claimA)!;
    expect(after.researcher.annotations).toHaveLength(1);
    // Additive layer: pipeline provenance is byte-identical.
    expect(after.locators).toEqual(before.locators);
    expect(after.bindingStatus).toBe(before.bindingStatus);
    expect(after.gradeCertainty).toBe(before.gradeCertainty);
    expect(after.taint).toBe(before.taint);
    const ev = app.store.listEvents(runA).find((e) => e.detail?.reason === 'claim_annotated_human');
    expect(ev?.detail).toMatchObject({ claimId: claimA, actor: 'human' });
  });

  it('rejects empty text (400 validation)', () => {
    expect(() => annotateClaim(app, runA, claimA, { text: '' })).toThrowError(ClaimOpError);
  });
});

describe('pin / unpin', () => {
  it('pins, then idempotent no-op, then unpins — one event per real transition', () => {
    const on = pinClaim(app, runA, claimA, true, {});
    expect(on.researcher.pinned).toBe(true);
    expect(on.researcher.pinnedAt).toBeDefined();
    const again = pinClaim(app, runA, claimA, true, {});
    expect(again.eventId).toBeNull(); // no-op, no audit noise
    const off = pinClaim(app, runA, claimA, false, {});
    expect(off.researcher.pinned).toBe(false);
    expect(off.researcher.pinnedAt).toBeUndefined();
    const events = app.store.listEvents(runA).filter((e) => e.detail?.reason === 'claim_pinned_human');
    expect(events).toHaveLength(1);
  });
});

describe('exclude / reinstate', () => {
  it('excludes with a required reason, idempotent, then reinstates clearing active state', () => {
    expect(() => excludeClaim(app, runA, claimA, {})).toThrowError(ClaimOpError); // reason REQUIRED
    const res = excludeClaim(app, runA, claimA, { reason: 'Retracted after publication (notice 2026-08).' });
    expect(res.researcher.excluded).toBe(true);
    expect(res.researcher.excludedReason).toContain('Retracted');
    const dup = excludeClaim(app, runA, claimA, { reason: 'different reason must not overwrite' });
    expect(dup.eventId).toBeNull();
    expect(dup.researcher.excludedReason).toContain('Retracted'); // first reason stays authoritative
    const ev = app.store.listEvents(runA).find((e) => e.detail?.reason === 'claim_excluded_human');
    expect(ev?.detail).toMatchObject({ claimId: claimA, actor: 'human', excludedReason: expect.stringContaining('Retracted') });
    const back = reinstateClaim(app, runA, claimA, { note: 'retraction was a mislink' });
    expect(back.researcher.excluded).toBe(false);
    expect(back.researcher.excludedReason).toBeUndefined();
    expect(app.store.listEvents(runA).filter((e) => e.detail?.reason === 'claim_reinstated_human')).toHaveLength(1);
  });
});

describe('reclassify', () => {
  it('sets the researcher classification with from/to audit; same-value is a no-op', () => {
    const res = reclassifyClaim(app, runA, claimA, { classification: 'methodological-concern', note: 'mouse model, weak external validity' });
    expect(res.researcher.classification).toBe('methodological-concern');
    const again = reclassifyClaim(app, runA, claimA, { classification: 'methodological-concern' });
    expect(again.eventId).toBeNull();
    const ev = app.store.listEvents(runA).find((e) => e.detail?.reason === 'claim_reclassified_human');
    expect(ev?.detail).toMatchObject({ from: null, to: 'methodological-concern', actor: 'human' });
  });

  it('rejects an unknown classification value (400 validation)', () => {
    expect(() => reclassifyClaim(app, runA, claimA, { classification: 'definitely-real-evidence' as never })).toThrowError(ClaimOpError);
  });
});

describe('ownership guard', () => {
  it('cross-run claim op is a 404 target_not_found, never a cross-run mutation', () => {
    expect(() => annotateClaim(app, runA, claimB, { text: 'cross-run attempt' })).toThrowError(ClaimOpError);
    try {
      excludeClaim(app, runA, claimB, { reason: 'x' });
      expect.unreachable('must throw');
    } catch (e) {
      expect(e).toBeInstanceOf(ClaimOpError);
      expect((e as ClaimOpError).code).toBe('target_not_found');
    }
    expect(app.store.getObject('claim', claimB)?.researcher.excluded).toBe(false); // run B untouched
    const ghost = `run_${'9'.repeat(26)}`;
    try {
      pinClaim(app, ghost, claimA, true, {});
      expect.unreachable('must throw');
    } catch (e) {
      expect((e as ClaimOpError).code).toBe('not_found');
    }
  });
});

describe('exclusion projection input', () => {
  it('excludedClaimIdsOf lists only actively excluded claims', () => {
    excludeClaim(app, runA, claimA, { reason: 'temporarily out' });
    const ids = excludedClaimIdsOf(app.store.listObjects('claim', runA));
    expect(ids).toEqual([claimA]);
    reinstateClaim(app, runA, claimA, {});
    expect(excludedClaimIdsOf(app.store.listObjects('claim', runA))).toEqual([]);
    expect(excludedClaimIdsOf(app.store.listObjects('claim', runB))).toEqual([]);
  });
});
