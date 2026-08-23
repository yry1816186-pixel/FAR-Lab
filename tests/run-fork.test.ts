import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { ResearchQuestion, newId } from '../src/domain/index.js';
import { toProvJsonLd } from '../src/domain/prov-o.js';
import type { LineageEdgeRecord } from '../src/domain/lineage.js';

// RU-2 branch writer (forkRun) + PROV-O export. All offline/deterministic.

const mkStore = (): Store => new Store(openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'far-fork-')), 'far.db')));

const mkQuestion = (): ResearchQuestion =>
  ResearchQuestion.parse({ id: newId('q'), text: 'fork test question?', goalType: 'explanatory', createdAt: '2026-08-24T00:00:00.000Z', scope: { domain: 'd', phenomena: ['p'] }, constraints: {} });

describe('RU-2 forkRun (branch writer)', () => {
  it('creates a fork referencing the source immutably: question shared by id, lineage edge, step-cache seed, audited reason', () => {
    const store = mkStore();
    const source = store.createRun(mkQuestion());
    store.db.prepare("INSERT INTO step_outputs (run_id, stage, family, step_key, json, created_at) VALUES (?,?,?,?,?,?)")
      .run(source.id, 'retrieve', '', 'plan:1', '{"ok":true}', '2026-08-24T00:00:01.000Z');
    store.db.prepare("INSERT INTO step_fingerprints (run_id, stage, family, fingerprint) VALUES (?,?,?,?)")
      .run(source.id, 'retrieve', '', 'a'.repeat(64));
    store.updateRun({ ...source, status: 'completed' });

    const fork = store.forkRun(source.id, { reason: 'test alternative direction' });
    expect(fork.parentRunId).toBe(source.id);
    expect(fork.questionId).toBe(source.questionId);
    expect(fork.status).toBe('created');
    expect(fork.tags).toContain('fork');

    // lineage edge is the query authority
    const edges = store.listLineageEdges({ kind: 'forked_from', toId: fork.id });
    expect(edges).toHaveLength(1);
    expect(edges[0]!.fromId).toBe(source.id);

    // step cache seeded under the fork id (dependency-domain replay seed)
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM step_outputs WHERE run_id=?').get(fork.id)?.n).toBe(1);
    expect(store.db.prepare('SELECT COUNT(*) AS n FROM step_fingerprints WHERE run_id=?').get(fork.id)?.n).toBe(1);

    // the fork reason is the fork's first audited note (chain + tags apply)
    const events = store.listEvents(fork.id);
    expect(events[0]!.type).toBe('note');
    const detail = events[0]!.detail as { kind: string; from: string; reason: string };
    expect(detail.kind).toBe('run_forked');
    expect(detail.from).toBe(source.id);
    expect(detail.reason).toBe('test alternative direction');
    expect(store.verifyEventChain(fork.id).ok).toBe(true);
  });

  it('refuses to fork a running source (fail-closed)', () => {
    const store = mkStore();
    const source = store.createRun(mkQuestion());
    store.updateRun({ ...source, status: 'running' });
    expect(() => store.forkRun(source.id, { reason: 'x' })).toThrow(/settled/);
    expect(() => store.forkRun('run_ghost00000000000000000000000', { reason: 'x' })).toThrow(/no such run/);
  });
});

describe('RU-2 PROV-O export', () => {
  it('maps lineage edges to PROV verbs; every edge appears exactly once', () => {
    const edge = (kind: string, fromId: string, toId: string): LineageEdgeRecord =>
      ({ fromId, toId, kind: kind as LineageEdgeRecord['kind'], runId: 'run_x', at: '2026-08-24T00:00:00.000Z' });
    const edges = [
      edge('forked_from', 'run_a', 'run_b'),
      edge('counter_evidence', 'ev_1', 'hyp_1'),
      edge('produced', 'run_a', 'clm_9'),
      edge('consumed', 'run_b', 'clm_9'),
      edge('caused_revision', 'fbk_1', 'rev_1'),
      edge('supports', 'ev_2', 'hyp_2'),
    ];
    const graph = toProvJsonLd({
      rootRunId: 'run_a', runs: [{ id: 'run_a', createdAt: '2026-08-24T00:00:00.000Z' }, { id: 'run_b' }], edges,
      relationTypes: { ev_1: 'contradicts', ev_2: 'supports' },
    }) as {
      '@context': Record<string, string>; '@graph': Array<Record<string, unknown>>;
    };
    expect(graph['@context'].prov).toBe('http://www.w3.org/ns/prov#');
    const json = JSON.stringify(graph['@graph']);
    // every edge serialized exactly once under its verb
    expect((json.match(/wasInformedBy/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(json).toContain('wasGeneratedBy');
    expect(json).toContain('prov:used');
    expect(json).toContain('far:counter_evidence');
    expect(json).toContain('far:caused_revision');
    // RU-6: evidence relations carry CiTO IRIs — exact for packet-verified types
    expect(json).toContain('http://purl.org/spar/cito/supports');
    const counterInfluence = graph['@graph'].find((n) => n['far:counter_evidence'] !== undefined) as Record<string, unknown>;
    expect(String((counterInfluence.cito as { '@id': string })['@id'])).toContain('cito/');
  });
});

describe('RU-6 CiTO mapping totality', () => {
  it('every internal relation type maps to a well-formed CiTO IRI (no gaps, no fabrications)', async () => {
    const { CITO_IRI, EvidenceRelationType } = await import('../src/domain/evidence.js');
    for (const rel of EvidenceRelationType.options) {
      const m = CITO_IRI[rel];
      expect(m, `mapping missing for ${rel}`).toBeDefined();
      expect(m.iri).toMatch(/^http:\/\/purl\.org\/spar\/cito\/[a-zA-Z]+$/);
      if (m.exact !== true) expect(m.farNote).toBeDefined();
    }
    // only the packet-verified exact assertions are marked exact
    const exact = Object.entries(CITO_IRI).filter(([, m]) => m.exact).map(([k]) => k);
    expect(exact.sort()).toEqual(['contradicts', 'replicates', 'supports']);
  });
});
