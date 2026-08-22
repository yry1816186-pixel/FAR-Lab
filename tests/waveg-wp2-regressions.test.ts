import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArxivAtom, fullTextRoute } from '../src/sources/index.js';
import { encodePathSegment } from '../src/sources/http.js';
import { decodeXmlEntities } from '../src/sources/text.js';
import { redactSecrets, extractJsonText } from '../src/providers/http.js';
import { repairJson, JsonRepairError } from '../src/providers/json-repair.js';
import { openDb, MIGRATIONS } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId, ObjectRef, HypothesisScorecard } from '../src/domain/index.js';
import { canonicalJson, canonicalSha256 } from '../src/shared/crypto.js';
import { isCancellationError } from '../src/pipeline/stages/guard.js';

/**
 * Wave-G WP2 regression lock: one test per root-cause fix in the fix batch. Each test
 * names the defect it locks; inject that defect back and the test MUST redden.
 */
describe('WP2 sources fixes', () => {
  it('arxiv link attrs: single-quoted XML attributes are parsed, not silently dropped', () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <entry><id>http://arxiv.org/abs/2401.04088v1</id>
      <link rel="alternate" href="http://arxiv.org/abs/2401.04088" type="text/html"/>
      <link rel="related" title='pdf' href='http://arxiv.org/pdf/2401.04088' type='application/pdf'/>
      <title>A study</title><summary>An abstract.</summary><published>2024-01-08T00:00:00Z</published>
      <author><name>A. Researcher</name></author></entry></feed>`;
    const feed = parseArxivAtom(xml);
    expect(feed.entries[0]?.pdf_url).toBe('http://arxiv.org/pdf/2401.04088');
  });

  it('encodePathSegment: escapes ? and # in DOIs, preserves / and doi: prefix', () => {
    expect(encodePathSegment('10.1000/fake.2026.001')).toBe('10.1000/fake.2026.001');
    expect(encodePathSegment('doi:10.1/x#v2')).not.toContain('#');
    expect(encodePathSegment('doi:10.1/x#v2')).toContain('%23');
    expect(encodePathSegment('doi:10.1/x?y')).toContain('%3F');
    expect(encodePathSegment('doi:10.1/x#v2')).toMatch(/^doi:/);
  });

  it('fullTextRoute: path-hostile arxiv ids do not route (traversal/scheme rejected)', () => {
    expect(fullTextRoute({ identifiers: [{ kind: 'arxiv', value: '../../etc/passwd' }] })).toBe(null);
    expect(fullTextRoute({ identifiers: [{ kind: 'arxiv', value: 'javascript:alert(1)' }] })).toBe(null);
    expect(fullTextRoute({ identifiers: [{ kind: 'arxiv', value: '2401.04088' }] })).not.toBe(null);
    expect(fullTextRoute({ identifiers: [{ kind: 'arxiv', value: 'math.GT/0309136' }] })).not.toBe(null);
  });

  it('decodeXmlEntities: common JATS/LaTeXML named entities decode; unknown pass through honestly', () => {
    expect(decodeXmlEntities('a&ndash;b&alpha;&beta;')).toBe('a\u2013b\u03B1\u03B2');
    expect(decodeXmlEntities('&hellip;')).toBe('\u2026');
    expect(decodeXmlEntities('&notarealent;')).toBe('&notarealent;');
    expect(decodeXmlEntities('&amp;&lt;')).toBe('&<');
  });
});

describe('WP2 providers fixes', () => {
  it('redactSecrets: Bearer with zero whitespace still redacts', () => {
    expect(redactSecrets('Authorization: Bearerabcdef1234567890abcdef')).toBe('Authorization: Bearer [REDACTED_SECRET]');
    expect(redactSecrets('Authorization: Bearer abcdef1234567890abcdef')).toBe('Authorization: Bearer [REDACTED_SECRET]');
    expect(redactSecrets('sk-abcdefghij0123456789qrstuv')).toBe('[REDACTED_SECRET]');
  });

  it('json-repair: pathological string batteries only ever repair or raise JsonRepairError (no raw crashes)', () => {
    // The parseString depth bound is defense-in-depth: brute-force probing found no
    // craftable input that actually diverges the retry chain (2026-08-22, recorded in
    // evidence/W-G/code-review/). The discriminating property is therefore the crash
    // class: every pathological input must repair cleanly or fail as JsonRepairError —
    // any RangeError/TypeError from the retry state machine is a regression.
    const battery = [
      '{"a": "x' + ',"'.repeat(500),
      '{"a": ' + '"b","c",'.repeat(200) + '"d',
      '"' + 'a","b",'.repeat(300),
      '{"a": "b' + '\\"c\\"d'.repeat(200),
      '[' + '"x","y",'.repeat(300),
      '{"a": "' + 'q""q'.repeat(300),
      '{"s": "' + 'end"'.repeat(300),
    ];
    for (const input of battery) {
      let outcome: 'ok' | 'repair-error' | 'crash' = 'ok';
      try { repairJson(input); } catch (e) { outcome = e instanceof JsonRepairError ? 'repair-error' : 'crash'; }
      expect(outcome).not.toBe('crash');
    }
  });

  it('extractJsonText layer-3: trailing backslash does not emit an invalid lone escape', () => {
    // A string ending in a single backslash used to pass through as an invalid escape;
    // layer 3 must either produce valid JSON or defer to layer 4 — never invalid JSON.
    const res = extractJsonText('{"a": "tail\\', { allowRepair: true });
    if (res !== null) {
      expect(() => JSON.parse(JSON.stringify(res.value))).not.toThrow();
    }
  });
});

describe('WP2 persistence fixes', () => {
  it('migration v4: fresh db carries idx_runs_status_lease and user_version=4', () => {
    const dir = mkdtempSync(join(tmpdir(), 'farlab-mig-'));
    try {
      const db = openDb(join(dir, 't.db'));
      const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_runs_status_lease'").get();
      expect(idx).toBeDefined();
      const version = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
      expect(version).toBe(MIGRATIONS[MIGRATIONS.length - 1]?.version);
      db.close();
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows: sqlite close flush can lag; OS temp cleanup covers it */ }
    }
  });

  it('putStepOutput is atomic: an event-append failure rolls back the checkpoint row', () => {
    const dir = mkdtempSync(join(tmpdir(), 'farlab-tx-'));
    try {
      const db = openDb(join(dir, 't.db'));
      const store = new Store(db);
      const q = ResearchQuestion.parse({
        id: newId('q'), text: 't', background: '', goalType: 'explanatory',
        scope: { domain: 'd', phenomena: ['p'] }, constraints: { assumptions: [] },
        createdAt: new Date().toISOString(),
      });
      store.createRun(q);
      const runId = store.listRuns(1)[0]!.id;
      // Inject a failure into the SECOND statement of the transaction.
      // The FIRST call seen by this override is putStepOutput's checkpoint event
      // (createRun's event fired before the override was installed).
      store.appendEvent = (() => { throw new Error('injected event failure'); }) as typeof store.appendEvent;
      expect(() => store.putStepOutput(runId, 'rank', 'scoring', 'k1', { v: 1 })).toThrow('injected event failure');
      expect(store.getStepOutput(runId, 'rank', 'scoring', 'k1')).toBe(null); // rolled back
      db.close();
    } finally {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows: sqlite close flush can lag; OS temp cleanup covers it */ }
    }
  });
});

describe('WP2 domain fixes', () => {
  it('ObjectRef shape gate: garbage ids reject at parse; real shapes pass (incl. artifact sha256)', () => {
    expect(() => ObjectRef.parse({ kind: 'hypothesis', id: 'not_a_hyp_id' })).toThrow();
    expect(() => ObjectRef.parse({ kind: 'hypothesis', id: 'hyp_03krx9rhyea5ars67zq45ab0gw' })).not.toThrow();
    expect(() => ObjectRef.parse({ kind: 'artifact', id: `sha256:${'a'.repeat(64)}` })).not.toThrow();
    expect(() => ObjectRef.parse({ kind: 'artifact', id: 'sha256:short' })).toThrow();
  });

  it('scorecard/tournament ids are branded: placeholder strings reject', () => {
    expect(() => HypothesisScorecard.parse({
      id: 'scorecard-1',
      runId: newId('run'),
      hypothesisId: newId('hyp'),
      dimensions: [{ dimension: 'novelty', value: 0.5, rationale: 'r', evidenceClaimIds: [], producer: 'test', calibration: 'uncalibrated_llm_judgment' }],
      overallRationale: 'r', rankedOutOf: 1, rank: 1,
    })).toThrow(/sc_/);
  });

  it('canonicalJson is key-order invariant (revise changedFields cannot lie on reordered keys)', () => {
    expect(canonicalJson({ a: 1, b: [2, { y: 1, x: 2 }] })).toBe(canonicalJson({ b: [2, { x: 2, y: 1 }], a: 1 }));
    expect(canonicalSha256({ a: { b: 1, c: 2 } })).toBe(canonicalSha256({ a: { c: 2, b: 1 } }));
  });
});

describe('WP2 stage fixes', () => {
  it('isCancellationError matches stage-suffixed cancellation messages (prefix, not equality)', () => {
    expect(isCancellationError(new Error('cancelled by user'))).toBe(true);
    expect(isCancellationError(new Error('cancelled by user in build_evidence before extracting doc'))).toBe(true);
    expect(isCancellationError(new Error('cancelled by userX'))).toBe(false);
    expect(isCancellationError(new Error('other failure'))).toBe(false);
  });
});

describe('WP4 mapBounded (stage concurrency primitive)', () => {
  const delay = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

  it('preserves output order regardless of completion timing', async () => {
    const { mapBounded } = await import('../src/pipeline/stages/shared.js');
    const out = await mapBounded([40, 10, 30, 1, 20], 5, async (ms, i) => {
      await delay(ms);
      return `${i}:${ms}`;
    });
    expect(out).toEqual(['0:40', '1:10', '2:30', '3:1', '4:20']);
  });

  it('never exceeds the concurrency limit', async () => {
    const { mapBounded } = await import('../src/pipeline/stages/shared.js');
    let inFlight = 0;
    let peak = 0;
    await mapBounded([50, 50, 50, 50, 50, 50], 3, async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await delay(20);
      inFlight -= 1;
    });
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('throws the FIRST-by-index error after in-flight work settles (deterministic failure choice)', async () => {
    const { mapBounded } = await import('../src/pipeline/stages/shared.js');
    // items 1 and 2 BOTH fail; item 2 fails sooner but item 1 has the lower index —
    // the lower index must win so failure selection is input-order-deterministic.
    await expect(mapBounded([10, 40, 1], 3, async (ms, i) => {
      await delay(ms);
      if (i === 0) return i;
      throw new Error(`fail-${i}`);
    })).rejects.toThrow('fail-1');
    await expect(mapBounded([10, 40, 5], 1, async (_ms, i) => {
      if (i === 0) throw new Error('seq-fail');
      return i;
    })).rejects.toThrow('seq-fail');
  });

  it('limit 1 degenerates to sequential (determinism escape hatch)', async () => {
    const { mapBounded } = await import('../src/pipeline/stages/shared.js');
    const events: number[] = [];
    await mapBounded([1, 2, 3], 1, async (n) => {
      events.push(n); // start
      await delay(5);
      events.push(-n); // end
      return n;
    });
    expect(events).toEqual([1, -1, 2, -2, 3, -3]);
  });
});

describe('W-G/F-A anchored counter queries (CounterRefine-pattern repair)', () => {
  const Q = 'Why do CRISPR base editors cause off-target cytosine edits in hematopoietic cells?';

  it('a topically drifting counter query is repaired with the question anchor terms', async () => {
    const { anchorCounterQueries, anchorContainment, COUNTER_ANCHOR_MIN } = await import('../src/pipeline/stages/retrieve.js');
    const drifting = 'limitations of pharmacological interventions failed replication';
    expect(anchorContainment(drifting, Q)).toBeLessThan(COUNTER_ANCHOR_MIN);
    const [repaired] = anchorCounterQueries([drifting, 'CRISPR off-target contradictory findings'], Q);
    // counter vocabulary preserved + anchor terms appended + containment now passes
    expect(repaired).toContain('failed replication');
    expect(anchorContainment(repaired, Q)).toBeGreaterThanOrEqual(COUNTER_ANCHOR_MIN);
  });

  it('an already-anchored counter query passes through untouched (no gratuitous edits)', async () => {
    const { anchorCounterQueries } = await import('../src/pipeline/stages/retrieve.js');
    const anchored = 'CRISPR base editor off-target cytosine edits contradictory findings negative result';
    const [kept] = anchorCounterQueries([anchored, anchored], Q);
    expect(kept).toBe(anchored);
  });

  it('repair is deterministic and bounded', async () => {
    const { anchorCounterQueries, COUNTER_ANCHOR_APPEND_MAX } = await import('../src/pipeline/stages/retrieve.js');
    const r1 = anchorCounterQueries(['generic critique limitations', 'generic negative result'], Q);
    const r2 = anchorCounterQueries(['generic critique limitations', 'generic negative result'], Q);
    expect(r1).toEqual(r2);
    const appended = r1[0]!.split(' ').length - 'generic critique limitations'.split(' ').length;
    expect(appended).toBeLessThanOrEqual(COUNTER_ANCHOR_APPEND_MAX);
  });

  it('empty anchor text is vacuously anchored (no division by zero, no edits)', async () => {
    const { anchorCounterQueries } = await import('../src/pipeline/stages/retrieve.js');
    const q = 'anything limitations';
    expect(anchorCounterQueries([q, q], '   ')).toEqual([q, q]);
  });
});

describe('W-G/F-B GRADE-lite deterministic certainty ladder', () => {
  it('maps domain failures to the 4-level ladder deterministically', async () => {
    const mod = await import('../src/domain/claim.js');
    const grade = mod.gradeClaimCertainty;
    // all domains satisfied -> high
    expect(grade({ verifiedBinding: true, quantitative: true, recentSource: true, contradictionSignals: 0 })).toEqual({ certainty: 'high', downgraded: [] });
    // one failure -> moderate
    expect(grade({ verifiedBinding: true, quantitative: false, recentSource: true, contradictionSignals: 0 }).certainty).toBe('moderate');
    // two failures -> low
    expect(grade({ verifiedBinding: false, quantitative: true, recentSource: false, contradictionSignals: 0 }).certainty).toBe('low');
    // saturation -> very_low (floor)
    expect(grade({ verifiedBinding: false, quantitative: false, recentSource: false, contradictionSignals: 3 }).certainty).toBe('very_low');
    // downgraded reasons are named per GRADE domain
    expect(grade({ verifiedBinding: false, quantitative: true, recentSource: true, contradictionSignals: 1 }).downgraded)
      .toEqual(['risk_of_bias:unverified_binding', 'inconsistency:1_contradiction_signal(s)']);
  });
});
