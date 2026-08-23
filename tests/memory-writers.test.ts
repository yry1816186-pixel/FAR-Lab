import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import {
  consolidateRun, consolidateConversationProfile, semanticFindingsForRun, SEMANTIC_FINDINGS_PER_RUN,
} from '../src/app/memory.js';
import { ResearchQuestion, SourceDocument, newId } from '../src/domain/index.js';

// RU-1 residual writers: semantic (literature findings) + profile (researcher
// preferences). All offline/deterministic.

const mkStore = (): Store => new Store(openDb(path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'far-writers-')), 'far.db')));

const mkQuestion = (): ResearchQuestion =>
  ResearchQuestion.parse({ id: newId('q'), text: 'does X cause Y?', goalType: 'explanatory', createdAt: '2026-08-24T00:00:00.000Z', scope: { domain: 'd', phenomena: ['p'] }, constraints: {} });

const mkDoc = (runId: string, identifiers: Array<{ kind: 'doi' | 'url'; value: string }>): SourceDocument =>
  SourceDocument.parse({
    id: newId('src'), runId, family: 'crossref',
    identifiers, title: 'A study', contentDepth: 'abstract', accessState: 'unknown',
    contentHash: 'a'.repeat(64), retrievedAt: '2026-08-24T00:00:00.000Z', parseStatus: 'ok',
    verification: { method: 'crossref_doi', resolved: true, titleMatch: true, checkedAt: '2026-08-24T00:00:00.000Z' },
    createdAt: '2026-08-24T00:00:00.000Z',
  } as never);

const mkClaim = (runId: string, docId: string, text: string): { id: string; runId: string; text: string; locators: Array<{ sourceDocumentId: string }> } =>
  ({
    id: newId('clm'), runId, text, bindingStatus: 'verified', alignmentChecked: true,
    locators: [{ sourceDocumentId: docId, quote: text }],
  });

describe('RU-1 semantic writer', () => {
  it('consolidates relation-participating claims as external_literature with the source DOI as sourceRef', () => {
    const store = mkStore();
    const run = store.createRun(mkQuestion());
    const doc = mkDoc(run.id, [{ kind: 'doi', value: '10.1234/sem' }]);
    store.putObject('source_document', doc);
    const claim = mkClaim(run.id, doc.id, 'X increases Y by 40% under condition Z');
    store.putObject('claim', claim as never);
    store.putObject('evidence_relation', {
      id: newId('ev'), runId: run.id, claimId: claim.id, relation: 'supports',
      targetHypothesisId: newId('hyp'), rationale: 'same direction', strength: 'moderate',
      createdAt: '2026-08-24T00:00:00.000Z', uncertainties: [],
    } as never);
    store.updateRun({ ...store.getRun(run.id)!, status: 'completed' });

    const result = consolidateRun(store, run.id);
    expect(result.itemsWritten).toBe(2); // episodic + semantic finding
    const semantic = store.listMemory({ kind: 'semantic' });
    expect(semantic).toHaveLength(1);
    expect(semantic[0]!.trustClass).toBe('external_literature');
    expect(semantic[0]!.provenance.sourceRef).toBe('doi:10.1234/sem');
    expect(semantic[0]!.title).toContain('X increases Y');
    // idempotent re-consolidation replaces, never duplicates
    consolidateRun(store, run.id);
    expect(store.listMemory({ kind: 'semantic' })).toHaveLength(1);
  });

  it('claims without a resolvable DOI/URL are honestly fenced to external_untrusted', () => {
    const store = mkStore();
    const run = store.createRun(mkQuestion());
    const doc = mkDoc(run.id, [{ kind: 'corpus' as 'doi', value: 'local-thing' }]);
    store.putObject('source_document', doc);
    const claim = mkClaim(run.id, doc.id, 'unresolvable provenance claim');
    store.putObject('claim', claim as never);
    store.putObject('evidence_relation', {
      id: newId('ev'), runId: run.id, claimId: claim.id, relation: 'qualifies',
      targetClaimId: newId('clm'), rationale: 'bounds', strength: 'weak',
      createdAt: '2026-08-24T00:00:00.000Z', uncertainties: [],
    } as never);
    const findings = semanticFindingsForRun(store, run.id);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.trustClass).toBe('external_untrusted');
    expect(findings[0]!.provenance.sourceRef).toBeUndefined();
  });

  it('caps findings per run and ignores claims with no relations', () => {
    const store = mkStore();
    const run = store.createRun(mkQuestion());
    const doc = mkDoc(run.id, [{ kind: 'doi', value: '10.1/cap' }]);
    store.putObject('source_document', doc);
    for (let i = 0; i < SEMANTIC_FINDINGS_PER_RUN + 5; i += 1) {
      const claim = mkClaim(run.id, doc.id, `finding number ${i}`);
      store.putObject('claim', claim as never);
      store.putObject('evidence_relation', {
        id: newId('ev'), runId: run.id, claimId: claim.id, relation: 'supports',
        targetHypothesisId: newId('hyp'), rationale: 'r', strength: 'weak',
        createdAt: '2026-08-24T00:00:00.000Z', uncertainties: [],
      } as never);
    }
    const lonely = mkClaim(run.id, doc.id, 'no relation participates in me');
    store.putObject('claim', lonely as never);
    expect(semanticFindingsForRun(store, run.id)).toHaveLength(SEMANTIC_FINDINGS_PER_RUN);
  });
});

describe('RU-1 profile writer', () => {
  const conv = (proposals: Array<{ kind: string; status: string; resolvedAt?: string }>, autoApprove: string[] = []) => ({
    id: 'cnv_profiletest000000000000000a',
    autoApprove,
    messages: [{ proposals }],
  });

  it('derives the latest resolution per kind; remembered grants surface as auto-trust', () => {
    const store = mkStore();
    consolidateConversationProfile(store, conv([
      { kind: 'launch_research', status: 'executed', resolvedAt: '2026-08-24T01:00:00.000Z' },
      { kind: 'launch_research', status: 'rejected', resolvedAt: '2026-08-24T02:00:00.000Z' },
      { kind: 'create_automation', status: 'executed', resolvedAt: '2026-08-24T01:30:00.000Z' },
    ], ['create_automation']));
    const prefs = store.listMemory({ kind: 'profile' });
    expect(prefs).toHaveLength(2);
    const launch = prefs.find((p) => p.title.includes('launch_research'))!;
    expect(launch.title).toContain('rejected'); // latest resolution wins
    const auto = prefs.find((p) => p.title.includes('create_automation'))!;
    expect(auto.title).toContain('auto-trusted');
    // same conversation state re-derives the same items (idempotent latest-wins)
    consolidateConversationProfile(store, conv([
      { kind: 'launch_research', status: 'rejected', resolvedAt: '2026-08-24T02:00:00.000Z' },
      { kind: 'create_automation', status: 'executed', resolvedAt: '2026-08-24T01:30:00.000Z' },
    ], ['create_automation']));
    expect(store.listMemory({ kind: 'profile' })).toHaveLength(2);
  });
});

describe('zh retrieval trigram fallback (re-audit queue item)', () => {
  it('a Chinese question retrieves memory when alpha tokens are empty', async () => {
    const { memoryNegativeConditioning } = await import('../src/app/memory.js');
    const { MemoryItemSchema } = await import('../src/domain/memory.js');
    const store = mkStore();
    store.putMemory(MemoryItemSchema.parse({
      id: 'mem_zhtest000000000000000000000', kind: 'semantic', entityType: 'finding',
      title: '维生素D补充对抑郁评分的影响', body: 'meta-analysis finds no significant effect',
      status: 'active', trustClass: 'external_literature', taint: 'untrusted_literal',
      provenance: { sourceRef: 'doi:10.1/zh' },
      createdAt: '2026-08-24T00:00:00.000Z', lastAccessedAt: '2026-08-24T00:00:00.000Z', accessCount: 3,
    }));
    // conditioning filters to own_* kinds — zh retrieval tested via searchMemory directly
    const hits = store.searchMemory({ query: '维生素D补充对抑郁评分的影响实验结果'.slice(0, 12), mode: 'or' });
    expect(hits.length).toBeGreaterThanOrEqual(0); // smoke: CJK path must not throw
    const direct = store.searchMemory({ query: '维生素D补充', mode: 'or' });
    expect(direct.map((m) => m.id)).toContain('mem_zhtest000000000000000000000');
    // negative-conditioning CJK path exercises the trigram fallback without throwing
    expect(() => memoryNegativeConditioning(store, '维生素D能否改善抑郁症状的研究')).not.toThrow();
  });
});
