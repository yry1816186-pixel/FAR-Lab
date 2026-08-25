import { describe, it, expect } from 'vitest';
import { diffArtifacts } from '../src/domain/artifact-diff.js';
import { VersionDiffEntry } from '../src/domain/feedback.js';

// RU-12 GO-1 — id-anchored structured diff (RFC 6902). Deterministic.

describe('diffArtifacts (id-anchored walker)', () => {
  it('scalar/replace + nested object ops with RFC 6902 paths', () => {
    const before = { statement: 'X causes Y', mechanism: 'via M', meta: { threshold: 0.05, n: 30 } };
    const after = { statement: 'X causes Y under condition Z', mechanism: 'via M', meta: { threshold: 0.01, n: 30 } };
    const d = diffArtifacts(before, after);
    expect(d.ops).toContainEqual({ op: 'replace', path: '/statement', value: 'X causes Y under condition Z' });
    expect(d.ops).toContainEqual({ op: 'replace', path: '/meta/threshold', value: 0.01 });
    expect(d.changedFields).toContain('statement');
    expect(d.changedFields).toContain('meta');
    expect(d.semanticFlags.some((f) => f.includes('decision-rule change'))).toBe(true); // threshold flag
  });

  it('id-keyed arrays: reorder = no delete/add storm; add/remove by identity', () => {
    const before = { predictions: [{ id: 'p1', t: 'a' }, { id: 'p2', t: 'b' }] };
    const after = { predictions: [{ id: 'p2', t: 'b' }, { id: 'p1', t: 'a' }, { id: 'p3', t: 'c' }] };
    const d = diffArtifacts(before, after);
    expect(d.ops.some((op) => op.op === 'remove')).toBe(false); // reorder ≠ delete
    expect(d.ops).toContainEqual({ op: 'add', path: '/predictions/-', value: { id: 'p3', t: 'c' } });
    const removed = diffArtifacts(before, { predictions: [{ id: 'p1', t: 'a' }] });
    expect(removed.ops).toContainEqual({ op: 'remove', path: '/predictions/id:p2' });
  });

  it('index fallback for unkeyed arrays; identical inputs produce zero ops', () => {
    expect(diffArtifacts({ a: [1, 2, 3] }, { a: [1, 3] }).ops).toEqual([{ op: 'replace', path: '/a/1', value: 3 }, { op: 'remove', path: '/a/2' }]);
    expect(diffArtifacts({ a: [1, 2] }, { a: [1, 2] }).ops).toEqual([]);
    expect(diffArtifacts({ x: 'same' }, { x: 'same' }).changedFields).toEqual([]);
  });

  it('VersionDiffEntry round-trips ops (schema contract)', () => {
    const entry = VersionDiffEntry.parse({
      objectType: 'hypothesis', objectId: 'hyp_diff000000000000000000000',
      summary: 'counter-evidence weakened claim', changedFields: ['statement'],
      patchOps: [{ op: 'replace', path: '/statement', value: 'weakened' }],
      semanticFlags: ['mechanism statement changed at /statement'],
    });
    expect(entry.patchOps[0]!.op).toBe('replace');
    // legacy entries (pre-walker) parse with empty defaults
    const legacy = VersionDiffEntry.parse({ objectType: 'plan', objectId: 'pln_x', summary: 's', changedFields: [] });
    expect(legacy.patchOps).toEqual([]);
    expect(legacy.semanticFlags).toEqual([]);
  });
});
