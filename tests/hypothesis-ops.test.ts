import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import { createTestStubProvider } from '../src/providers/test-stub.js';
import {
  connectClaim,
  forkHypothesis,
  HypothesisOpError,
  promoteHypothesis,
  rejectHypothesis,
} from '../src/server/hypothesis-ops.js';
import { HypothesisCandidate, ResearchQuestion, ScientificClaim } from '../src/domain/index.js';
import type { App } from '../src/app/composition.js';

/**
 * B5 hypothesis lifecycle operations — unit-level over the module (HTTP route
 * branches live in the appended describe of tests/api.test.ts). Contract under
 * test: zod body validation, run-ownership guards (404, never cross-run
 * mutation), status transitions with audit events, fork identity fields, and
 * connect dedup + EvidenceRelation persistence with '[human] ' provenance.
 */

let tmp: string;
let app: App;
let runA = ''; // run A: hyp1 (with distinctnessRationale), hyp2 (without), claimA
let runB = ''; // run B: hypB + claimB — the ownership adversary
let claimA = '';
let claimB = '';
let hyp1 = '';
let hyp2 = '';
let hypB = '';

const seedHypothesis = (id: string, runId: string, extras: { distinctnessRationale?: string; supportingClaimIds?: string[] }) =>
  HypothesisCandidate.parse({
    id,
    runId,
    statement: 'Interfacial void accumulation initiates lithium dendrite penetration.',
    mechanism: 'Voids concentrate current at contact-loss points.',
    derivation: { strategy: 'mechanism_driven', rationale: 'from interface failure literature', inputClaimIds: [] },
    assumptions: [{ id: 'a1', statement: 'voids form before penetration', kind: 'empirical', backingClaimIds: [] }],
    predictions: ['Void density precedes dendrite initiation in imaging'],
    supportingClaimIds: extras.supportingClaimIds ?? [],
    counterClaimIds: [],
    uncertainties: [],
    noveltyLabel: 'evidence_grounded',
    testability: 'testable_with_data',
    clusterKey: 'void-mechanism',
    version: 3,
    ...(extras.distinctnessRationale !== undefined ? { distinctnessRationale: extras.distinctnessRationale } : {}),
    createdAt: new Date().toISOString(),
  });

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-hypops-'));
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
  claimA = mkClaim('clm_a00000000000000000000000001', runA, 'Void density correlates with penetration depth.');
  claimB = mkClaim('clm_b00000000000000000000000001', runB, 'Grain-boundary chemistry dominates failure.');

  hyp1 = 'hyp_1000000000000000000000001';
  app.store.putObject('hypothesis', seedHypothesis(hyp1, runA, {
    distinctnessRationale: 'differs by temporal ordering of void formation',
    supportingClaimIds: [claimA],
  }));
  hyp2 = 'hyp_2000000000000000000000001';
  app.store.putObject('hypothesis', seedHypothesis(hyp2, runA, {}));
  hypB = 'hyp_b0000000000000000000000001';
  app.store.putObject('hypothesis', seedHypothesis(hypB, runB, {}));
});

afterAll(() => {
  app.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

const noteEvents = (runId: string, reason: string) =>
  app.store.listEvents(runId).filter((e) => e.type === 'note' && e.detail?.reason === reason);

describe('promote / reject', () => {
  it('transitions active -> promoted, persists, and appends the audit event', () => {
    const res = promoteHypothesis(app, runA, hyp1, {});
    expect(res).toEqual({ hypothesisId: hyp1, status: 'promoted' });
    expect(app.store.getObject('hypothesis', hyp1)?.status).toBe('promoted');
    const events = noteEvents(runA, 'hypothesis_status_changed');
    expect(events).toHaveLength(1);
    expect(events[0]!.detail).toMatchObject({
      hypothesisId: hyp1,
      from: 'active',
      to: 'promoted',
      actor: 'human',
    });
  });

  it('is idempotent: same-status set mutates nothing and events nothing', () => {
    const res = promoteHypothesis(app, runA, hyp1, {});
    expect(res.status).toBe('promoted');
    expect(noteEvents(runA, 'hypothesis_status_changed')).toHaveLength(1); // unchanged
  });

  it('rejects an active hypothesis (active -> rejected)', () => {
    const res = rejectHypothesis(app, runA, hyp2, {});
    expect(res).toEqual({ hypothesisId: hyp2, status: 'rejected' });
    const events = noteEvents(runA, 'hypothesis_status_changed');
    expect(events.some((e) => e.detail?.hypothesisId === hyp2 && e.detail?.from === 'active' && e.detail?.to === 'rejected')).toBe(true);
  });

  it('400s on a malformed body', () => {
    expect(() => promoteHypothesis(app, runA, hyp2, { note: 42 })).toThrowError(HypothesisOpError);
    try {
      rejectHypothesis(app, runA, hyp2, { note: 42 });
      expect.unreachable('must throw');
    } catch (e) {
      expect(e).toMatchObject({ status: 400, code: 'validation' });
    }
  });
});

describe('fork', () => {
  it('creates a fresh-ranked copy: new id, version 0, active, unique clusterKey, forked_from provenance', () => {
    const res = forkHypothesis(app, runA, hyp1, {});
    expect(res.forkedFrom).toBe(hyp1);
    expect(res.hypothesisId).not.toBe(hyp1);
    const fork = app.store.getObject('hypothesis', res.hypothesisId);
    expect(fork).not.toBeNull();
    expect(fork!.statement).toBe('Interfacial void accumulation initiates lithium dendrite penetration.');
    expect(fork!.version).toBe(0); // hyp1 was v3 — the fork starts a fresh lineage
    expect(fork!.status).toBe('active');
    expect(fork!.clusterKey).not.toBe('void-mechanism'); // ranks separately
    expect(fork!.clusterKey).toContain('fork');
    // appended into the existing rationale (not clobbering it)
    expect(fork!.distinctnessRationale).toContain('differs by temporal ordering');
    expect(fork!.distinctnessRationale).toContain(`forked_from:${hyp1}`);
    // supporting/counter claim ids copied
    expect(fork!.supportingClaimIds).toEqual([claimA]);
    expect(noteEvents(runA, 'hypothesis_forked').some((e) => e.detail?.from === hyp1 && e.detail?.to === res.hypothesisId)).toBe(true);
  });

  it('sets (not appends) forked_from when the original had no distinctnessRationale', () => {
    const res = forkHypothesis(app, runA, hyp2, {});
    const fork = app.store.getObject('hypothesis', res.hypothesisId);
    expect(fork!.distinctnessRationale).toBe(`forked_from:${hyp2}`);
  });

  it('two forks never collide: distinct ids AND distinct clusterKeys', () => {
    const a = forkHypothesis(app, runA, hyp1, {});
    const b = forkHypothesis(app, runA, hyp1, {});
    expect(a.hypothesisId).not.toBe(b.hypothesisId);
    const fa = app.store.getObject('hypothesis', a.hypothesisId);
    const fb = app.store.getObject('hypothesis', b.hypothesisId);
    expect(fa!.clusterKey).not.toBe(fb!.clusterKey);
  });
});

describe('connect', () => {
  it('links a run claim as counter evidence: list + relation + event', () => {
    const res = connectClaim(app, runA, hyp1, { claimId: claimA, direction: 'counters' });
    expect(res).toEqual({ hypothesisId: hyp1, claimId: claimA, direction: 'counters' });
    const hyp = app.store.getObject('hypothesis', hyp1);
    expect(hyp!.counterClaimIds).toContain(claimA);
    expect(hyp!.supportingClaimIds).toEqual([claimA]); // untouched side stays
    const relations = app.store.listObjects('evidence_relation', runA);
    const rel = relations.find((r) => r.claimId === claimA && r.targetHypothesisId === hyp1);
    expect(rel).toBeDefined();
    expect(rel!.relation).toBe('contradicts'); // counters -> counter-polarity relation type
    expect(rel!.rationale.startsWith('[human] ')).toBe(true);
    expect(rel!.strength).toBe('unrated');
    expect(noteEvents(runA, 'claim_linked_human').some((e) => e.detail?.claimId === claimA)).toBe(true);
  });

  it('dedups: a second identical connect mutates nothing (no duplicate relation/event)', () => {
    const relationsBefore = app.store.listObjects('evidence_relation', runA).length;
    const eventsBefore = noteEvents(runA, 'claim_linked_human').length;
    const res = connectClaim(app, runA, hyp1, { claimId: claimA, direction: 'counters' });
    expect(res.direction).toBe('counters');
    expect(app.store.getObject('hypothesis', hyp1)!.counterClaimIds).toEqual([claimA]); // length 1
    expect(app.store.listObjects('evidence_relation', runA)).toHaveLength(relationsBefore);
    expect(noteEvents(runA, 'claim_linked_human')).toHaveLength(eventsBefore);
  });

  it('supports direction appends to supportingClaimIds with a supports relation', () => {
    connectClaim(app, runA, hyp2, { claimId: claimA, direction: 'supports', note: 'direct measurement' });
    const hyp = app.store.getObject('hypothesis', hyp2);
    expect(hyp!.supportingClaimIds).toEqual([claimA]);
    const rel = app.store
      .listObjects('evidence_relation', runA)
      .find((r) => r.claimId === claimA && r.targetHypothesisId === hyp2);
    expect(rel!.relation).toBe('supports');
    expect(rel!.rationale).toBe('[human] direct measurement');
  });

  it('400s on an invalid body (bad direction / missing claimId)', () => {
    expect(() => connectClaim(app, runA, hyp1, { claimId: claimA, direction: 'sideways' })).toThrowError(HypothesisOpError);
    try {
      connectClaim(app, runA, hyp1, { direction: 'supports' });
      expect.unreachable('must throw');
    } catch (e) {
      expect(e).toMatchObject({ status: 400, code: 'validation' });
    }
  });
});

describe('ownership guards (404, never cross-run mutation)', () => {
  it('404s for a missing run', () => {
    try {
      promoteHypothesis(app, 'run_missing0000000000000000000x', hyp1, {});
      expect.unreachable('must throw');
    } catch (e) {
      expect(e).toMatchObject({ status: 404, code: 'not_found' });
    }
  });

  it('404s when the hypothesis belongs to another run', () => {
    try {
      rejectHypothesis(app, runA, hypB, {});
      expect.unreachable('must throw');
    } catch (e) {
      expect(e).toMatchObject({ status: 404, code: 'target_not_found' });
    }
    expect(app.store.getObject('hypothesis', hypB)?.status).toBe('active'); // untouched
    expect(noteEvents(runA, 'hypothesis_status_changed').some((e) => e.detail?.hypothesisId === hypB)).toBe(false);
  });

  it('404s for an unknown hypothesis id', () => {
    expect(() => forkHypothesis(app, runA, 'hyp_ghost000000000000000000000x', {})).toThrowError(HypothesisOpError);
  });

  it('404s when connecting a claim that belongs to another run', () => {
    try {
      connectClaim(app, runA, hyp2, { claimId: claimB, direction: 'supports' });
      expect.unreachable('must throw');
    } catch (e) {
      expect(e).toMatchObject({ status: 404, code: 'target_not_found' });
    }
    expect(app.store.getObject('hypothesis', hyp2)!.supportingClaimIds).not.toContain(claimB);
    expect(app.store.listObjects('evidence_relation', runA).some((r) => r.claimId === claimB)).toBe(false);
  });

  it('404s for an unknown claim id', () => {
    expect(() => connectClaim(app, runA, hyp2, { claimId: 'clm_ghost000000000000000000000x', direction: 'supports' })).toThrowError(HypothesisOpError);
  });
});
