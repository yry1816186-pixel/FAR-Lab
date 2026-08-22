import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { openArtifactStore } from '../src/persistence/artifacts.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';
import { runEvidenceGapRefinement } from '../src/agent/capabilities/refine.js';
import { ResearchQuestion, HypothesisCandidate } from '../src/domain/index.js';
import { newId } from '../src/domain/ids.js';
import type { SourceAdapter, SourceFamily } from '../src/shared/ports.js';

/**
 * End-to-end refinement slice on a REAL store (temp SQLite + artifact store), scripted
 * model provider (test-only, receipt-marked) and scripted source adapter — asserting the
 * full audit chain: sessions, report, run events and receipts all land.
 */

const fakeAdapter = (family: SourceFamily): SourceAdapter => ({
  family,
  search: async (query, opts) => ({
    family,
    query,
    httpStatus: 200,
    latencyMs: 4,
    records: Array.from({ length: Math.min(opts?.limit ?? 5, 2) }, (_, i) => ({
      identifiers: [{ kind: 'doi' as const, value: `10.9999/${family}/${i}` }],
      title: `${family} record ${i} for ${query}`,
      publicationYear: 2024,
      authors: ['Author A', 'Author B'],
      venue: 'Journal of Tests',
      abstractText: `Abstract about ${query} variant ${i}.`,
      contentDepth: 'abstract' as const,
      accessState: 'open' as const,
      normalized: { title: `${family} record ${i}`, query, family },
    })),
  }),
  resolve: async () => ({ found: false, httpStatus: 404 }),
});

const setup = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-refine-'));
  const store = new Store(openDb(path.join(dir, 'far.db')));
  const artifacts = openArtifactStore(path.join(dir, 'artifacts'));
  const rolloutDir = path.join(dir, 'agent-sessions');
  const question = ResearchQuestion.parse({
    id: newId('q'),
    text: 'What mechanisms drive photosynthetic efficiency in low light?',
    background: 'Prior work on shade adaptation.',
    goalType: 'explanatory',
    scope: { domain: 'plant biology', phenomena: ['shade adaptation'], inScope: [], outScope: [] },
    constraints: {},
    createdAt: new Date().toISOString(),
  });
  const run = store.createRun(question);
  const hyp1 = HypothesisCandidate.parse({
    id: newId('hyp'), runId: run.id, statement: 'Stomatal density mediates shade tolerance via ABA signaling.',
    mechanism: 'ABA-driven stomatal remodeling', testability: 'testable_with_data',
    derivation: { strategy: 'evidence_conditioned', rationale: 'from verified claims about ABA', inputClaimIds: [] },
    supportingClaimIds: [], counterClaimIds: [], predictions: ['Lower stomatal density under shade'], uncertainties: ['ABA measurement noise'],
    assumptions: [], createdAt: new Date().toISOString(),
  });
  const hyp2 = HypothesisCandidate.parse({
    id: newId('hyp'), runId: run.id, statement: 'Chloroplast relocation is the dominant shade response.',
    mechanism: 'blue-light phototropin signaling', testability: 'testable_now',
    derivation: { strategy: 'mechanism_driven', rationale: 'phototropin pathway', inputClaimIds: [] },
    supportingClaimIds: [], counterClaimIds: [], predictions: [], uncertainties: [],
    assumptions: [], createdAt: new Date().toISOString(),
  });
  store.putObject('hypothesis', hyp1);
  store.putObject('hypothesis', hyp2);
  return { store, artifacts, rolloutDir, run, hyp1, hyp2 };
};

const providerFor = (hypId: string): StubStep[] => [
  // parent turn 1: one real literature search through the adapter
  { rawOutput: JSON.stringify({ action: 'use_tool', tool: 'search_sources', args: { query: 'stomatal density shade tolerance ABA', families: ['openalex'], limit: 2 }, reason: 'check current evidence' }) },
  // parent turn 2: finish with a contract-valid report
  { rawOutput: JSON.stringify({ action: 'finish', reason: 'gaps identified', result: {
    summary: 'Both hypotheses lack replication-grade evidence; shade-ABA link is thin.',
    evidenceGaps: [
      { hypothesisId: hypId, missing: 'No replication study links stomatal density to shade tolerance under field conditions.', suggestedQueries: ['stomatal density shade tolerance field replication'], severity: 'high' },
    ],
    counterEvidenceFound: [{ hypothesisId: hypId, finding: 'One record questions ABA dominance in shade response.', sourceHint: 'openalex record 1' }],
    refinedSuggestions: [],
  } }) },
  // children (keyed by purpose, parallel-safe): pro finds one supporting paper, contra finds none
  { rawOutput: JSON.stringify({ action: 'finish', reason: 'searched', result: { findings: [{ title: 'ABA mediates shade stomatal response', year: 2023, verdict: 'supports', note: 'greenhouse study' }], queriesUsed: ['ABA shade stomata'] } }), forPurpose: `agent:refine-evidence-gaps:sub:pro:${hypId}:turn` },
  { rawOutput: JSON.stringify({ action: 'finish', reason: 'none found', result: { findings: [], queriesUsed: ['shade tolerance contradiction'] } }), forPurpose: `agent:refine-evidence-gaps:sub:contra:${hypId}:turn` },
];

describe('evidence-gap refinement capability (end-to-end on a real store)', () => {
  it('completes and lands the full audit chain: sessions, report, events, receipts', async () => {
    const { store, artifacts, rolloutDir, run, hyp1 } = setup();
    try {
      const outcome = await runEvidenceGapRefinement(
        { store, artifacts, provider: createTestStubProvider(providerFor(hyp1.id)), sourceFor: fakeAdapter, rolloutDir, skillDirs: [] },
        run.id,
        { topK: 1, maxTurns: 4 },
      );
      expect(outcome.status).toBe('completed');
      expect(outcome.reportId).toMatch(/^agr_/);
      expect(outcome.result?.evidenceGaps.length).toBe(1);
      expect(outcome.subagentSessions.map((s) => s.status)).toEqual(['completed', 'completed']);
      expect(outcome.resumed).toBe(false);
      // 2 parent turns + 2 child single-turn finishes
      expect(outcome.telemetry.modelCalls).toBe(2);

      // persisted domain objects re-validate on read (fail-closed store)
      const report = store.getObject('agent_report', outcome.reportId!);
      expect(report?.result.evidenceGaps.length).toBe(1);
      const sessions = store.listObjects('agent_session', run.id);
      expect(sessions.length).toBe(3); // parent + pro + contra
      expect(sessions.filter((s) => s.parentSessionId !== undefined).length).toBe(2);

      // run event stream: agent lifecycle + tool use + receipts
      const events = store.listEvents(run.id).map((e) => e.type);
      expect(events.filter((t) => t === 'agent_started').length).toBe(3);
      expect(events.filter((t) => t === 'agent_finished').length).toBe(3);
      expect(events).toContain('agent_tool_used');
      expect(events.filter((t) => t === 'receipt_recorded').length).toBeGreaterThanOrEqual(5); // 4 model calls + 1 retrieval

      // receipts: every model call + the real source retrieval
      const receipts = store.listObjects('receipt', run.id);
      expect(receipts.filter((r) => r.kind === 'model_call').length).toBe(4);
      const retrieval = receipts.find((r) => r.kind === 'source_retrieval');
      expect(retrieval?.sourceRetrieval?.family).toBe('openalex');
      expect(retrieval?.sourceRetrieval?.resultCount).toBe(2);
      expect(retrieval?.sourceRetrieval?.contentHashes.length).toBe(2);
    } finally {
      (store as unknown as { db: { close(): void } }).db.close();
    }
  });

  it('refuses a run without hypotheses (usage error, not a silent pass)', async () => {
    const { store, artifacts, rolloutDir } = setup();
    try {
      const question = ResearchQuestion.parse({
        id: newId('q'), text: 'Empty question?', goalType: 'exploratory',
        scope: { domain: 'x', phenomena: ['y'], inScope: [], outScope: [] }, constraints: {}, createdAt: new Date().toISOString(),
      });
      const emptyRun = store.createRun(question);
      await expect(runEvidenceGapRefinement(
        { store, artifacts, provider: createTestStubProvider([]), sourceFor: fakeAdapter, rolloutDir },
        emptyRun.id,
      )).rejects.toThrow(/has no hypotheses/);
    } finally {
      (store as unknown as { db: { close(): void } }).db.close();
    }
  });

  it('a failing child model call does not sink the session — it surfaces as a failed sub-agent', async () => {
    const { store, artifacts, rolloutDir, run, hyp1 } = setup();
    try {
      const steps: StubStep[] = [
        { rawOutput: JSON.stringify({ action: 'finish', reason: 'done', result: {
          summary: 'Gaps identified despite partial sub-agent failure.',
          evidenceGaps: [{ hypothesisId: hyp1.id, missing: 'Missing longitudinal evidence.', suggestedQueries: ['longitudinal shade study'], severity: 'medium' }],
        } }) },
        { rawOutput: JSON.stringify({ action: 'finish', reason: 'ok', result: { findings: [], queriesUsed: [] } }), forPurpose: `agent:refine-evidence-gaps:sub:pro:${hyp1.id}:turn` },
        { fail: { kind: 'auth_error', message: 'route exhausted' }, forPurpose: `agent:refine-evidence-gaps:sub:contra:${hyp1.id}:turn` },
      ];
      const outcome = await runEvidenceGapRefinement(
        { store, artifacts, provider: createTestStubProvider(steps), sourceFor: fakeAdapter, rolloutDir },
        run.id,
        { topK: 1, maxTurns: 2 },
      );
      expect(outcome.status).toBe('completed');
      const contra = outcome.subagentSessions.find((s) => s.label.startsWith('contra'))!;
      expect(contra.status).toBe('failed');
      const childSession = store.listObjects('agent_session', run.id).find((s) => s.id === contra.sessionId);
      expect(childSession?.lastError).toMatch(/auth_error.*route exhausted/);
    } finally {
      (store as unknown as { db: { close(): void } }).db.close();
    }
  });

  it('injects task-relevant skills into the session and reports which were used', async () => {
    const { store, artifacts, rolloutDir, run, hyp1 } = setup();
    const skillDir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-skills-e2e-'));
    fs.writeFileSync(path.join(skillDir, 'relevant.md'), '---\nname: counter-evidence-hunting\ndescription: hunt contradicting evidence and counter evidence systematically\nwhenToUse: refining hypotheses counter evidence\n---\nBe systematic about absence.');
    fs.writeFileSync(path.join(skillDir, 'irrelevant.md'), '---\nname: table-formatting\ndescription: markdown table formatting tricks\n---\nNope.');
    try {
      const outcome = await runEvidenceGapRefinement(
        { store, artifacts, provider: createTestStubProvider(providerFor(hyp1.id)), sourceFor: fakeAdapter, rolloutDir, skillDirs: [{ dir: skillDir, tier: 'builtin' }] },
        run.id, { topK: 1, maxTurns: 4 },
      );
      expect(outcome.status).toBe('completed');
      expect(outcome.skillsUsed).toContain('counter-evidence-hunting');
      expect(outcome.skillsUsed).not.toContain('table-formatting');
    } finally {
      (store as unknown as { db: { close(): void } }).db.close();
    }
  });

  it('resumes a max-turns-exhausted session from its rollout and completes (H6)', async () => {
    const { store, artifacts, rolloutDir, run, hyp1 } = setup();
    try {
      const childFinish = (label: 'pro' | 'contra'): StubStep => ({
        rawOutput: JSON.stringify({ action: 'finish', reason: 'ok', result: { findings: [], queriesUsed: [] } }),
        forPurpose: `agent:refine-evidence-gaps:sub:${label}:${hyp1.id}:turn`,
      });
      const first = await runEvidenceGapRefinement(
        { store, artifacts, provider: createTestStubProvider([
          { rawOutput: JSON.stringify({ action: 'use_tool', tool: 'list_hypotheses', args: {}, reason: 'survey' }) },
          childFinish('pro'), childFinish('contra'),
        ]), sourceFor: fakeAdapter, rolloutDir, skillDirs: [] },
        run.id, { topK: 1, maxTurns: 1 },
      );
      expect(first.status).toBe('max_turns');

      const second = await runEvidenceGapRefinement(
        { store, artifacts, provider: createTestStubProvider([
          { rawOutput: JSON.stringify({ action: 'finish', reason: 'resumed and done', result: {
            summary: 'Resumed refinement identified the missing replication evidence.',
            evidenceGaps: [{ hypothesisId: hyp1.id, missing: 'No replication study exists for the shade mechanism.', suggestedQueries: ['shade tolerance replication'], severity: 'low' }],
          } }) },
        ]), sourceFor: fakeAdapter, rolloutDir, skillDirs: [] },
        run.id, { topK: 1, maxTurns: 4, resumeSessionId: first.sessionId },
      );
      expect(second.resumed).toBe(true);
      expect(second.sessionId).toBe(first.sessionId);
      expect(second.status).toBe('completed');
      expect(second.subagentSessions).toEqual([]); // sub-agent phase is skipped on resume
      const session = store.getObject('agent_session', first.sessionId);
      expect(session?.turns.map((t) => t.turn)).toEqual([1, 2]);
      expect(session?.config.resumed).toBe(true);
    } finally {
      (store as unknown as { db: { close(): void } }).db.close();
    }
  });
});
