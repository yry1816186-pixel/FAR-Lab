import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import { createApiServer, type ApiServer } from '../src/server/api.js';
import {
  DEFAULT_SEED,
  estimateStop,
  MIN_LABELED_FOR_STOP,
  RECENT_WINDOW,
  rankQueue,
  tokenize,
  type ScreenDoc,
} from '../src/pipeline/screening.js';
import { ResearchQuestion, SourceDocument } from '../src/domain/index.js';
import { newId } from '../src/domain/ids.js';
import type { App } from '../src/app/composition.js';

/** Deterministic screening core (ASReview-pattern). Pure-function pins first,
 *  then the HTTP surface on a seeded real store. No network, no model calls. */

const doc = (id: string, topic: string): ScreenDoc => ({
  id,
  text: `${topic} study: this ${topic} paper reports ${topic} outcomes in ${topic} cohorts.`,
});

const RELEVANT = 12;
const NOISE = 24;
const docs: ScreenDoc[] = [
  ...Array.from({ length: RELEVANT }, (_, i) => doc(`rel${i}`, 'insulin sensitivity')),
  ...Array.from({ length: NOISE }, (_, i) => doc(`noi${i}`, 'crystal lattice')),
];

describe('screening core (deterministic)', () => {
  it('tokenize: latin runs + CJK bigrams', () => {
    expect(tokenize('Insulin-Resistance 胰岛素抵抗')).toEqual(
      expect.arrayContaining(['insulin-resistance', '胰岛', '岛素', '素抵', '抵抗']),
    );
  });

  it('cold start (<5 labels or no includes): seeded-random phase, null probabilities', () => {
    const q = rankQueue(docs, [], []);
    expect(q).toHaveLength(RELEVANT + NOISE);
    expect(q.every((x) => x.phase === 'random' && x.pRelevant === null)).toBe(true);
  });

  it('same inputs => byte-identical queue (pure, seeded)', () => {
    const inc = ['rel0', 'rel1', 'rel2'];
    const exc = ['noi0', 'noi1'];
    const a = rankQueue(docs, inc, exc, { seed: DEFAULT_SEED });
    const b = rankQueue(docs, inc, exc, { seed: DEFAULT_SEED });
    expect(a).toEqual(b);
    const reshuffledInputs = rankQueue([...docs].reverse(), inc, exc, { seed: DEFAULT_SEED });
    // Input order must not change the model's ranking of the same corpus set.
    expect(reshuffledInputs.map((x) => x.srcId)).toEqual(a.map((x) => x.srcId));
  });

  it('the model learns the relevance signal: relevant docs lead the queue', () => {
    const inc = ['rel0', 'rel1', 'rel2'];
    const exc = ['noi0', 'noi1'];
    const q = rankQueue(docs, inc, exc, { seed: DEFAULT_SEED });
    expect(q[0]?.phase).toBe('model');
    const top5 = q.slice(0, 5).map((x) => x.srcId);
    // After seeing insulin=include / crystal=exclude, the top of the queue must
    // be dominated by insulin docs (allowing 1 stray for tie noise).
    expect(top5.filter((id) => id.startsWith('rel')).length).toBeGreaterThanOrEqual(4);
    const pRel = q.find((x) => x.srcId === 'rel5')?.pRelevant ?? 0;
    const pNoi = q.find((x) => x.srcId === 'noi5')?.pRelevant ?? 1;
    expect(pRel).toBeGreaterThan(pNoi);
  });

  it('stop estimate: honest gate — not eligible before 15 labels', () => {
    const s = estimateStop(docs, ['rel0'], Array.from({ length: 10 }, (_, i) => `noi${i}`), ['exclude', 'include', 'exclude']);
    expect(s.eligible).toBe(false);
    expect(s.coverageEstimate).toBeNull(); // refuses to estimate on thin labels
    expect(s.basis).toContain('标注不足');
  });

  it('stop estimate: eligible at ≥95% coverage + 10 recent excludes', () => {
    const inc = Array.from({ length: RELEVANT }, (_, i) => `rel${i}`);
    const exc = Array.from({ length: NOISE - 2 }, (_, i) => `noi${i}`);
    const verdicts = Array.from({ length: RECENT_WINDOW }, () => 'exclude' as const);
    const s = estimateStop(docs, inc, exc, verdicts);
    expect(s.labeledCount).toBeGreaterThanOrEqual(MIN_LABELED_FOR_STOP);
    expect(s.coverageEstimate).not.toBeNull();
    // model should predict ~0 relevant among the 2 remaining noise docs
    expect(s.coverageEstimate as number).toBeGreaterThanOrEqual(0.95);
    expect(s.eligible).toBe(true);
    expect(s.basis).toContain('边际收益低');
  });

  it('stop estimate: NOT eligible when coverage is clearly incomplete, even after 10 excludes', () => {
    const inc = ['rel0'];
    const exc = Array.from({ length: 20 }, (_, i) => `noi${i}`);
    const verdicts = Array.from({ length: RECENT_WINDOW }, () => 'exclude' as const);
    const s = estimateStop(docs, inc, exc, verdicts);
    expect(s.coverageEstimate as number).toBeLessThan(0.95);
    expect(s.eligible).toBe(false);
    expect(s.basis).toContain('不建议停止');
  });
});

/* ------------------------- HTTP surface (real store) ---------------------- */

let app: App;
let api: ApiServer;
let base: string;
let dataDir: string;
let runId: string;

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-screening-'));
  app = await createApp({ dataDir: dataDir, automations: undefined } as never);
  api = createApiServer(app, { port: 0, automations: { enabled: false } });
  base = `http://127.0.0.1:${await api.start()}`;

  const q = ResearchQuestion.parse({
    id: newId('q'), text: 'screening fixture question', background: '', goalType: 'explanatory',
    scope: { domain: 'nutrition', phenomena: ['x'] }, constraints: {}, createdAt: new Date().toISOString(),
  });
  const run = app.store.createRun(q);
  runId = run.id;
  // Pool: 3 insulin + 5 crystal docs (keys map to real src_<random> ids).
  const poolSpec = [
    ['rel-a', 'insulin sensitivity'], ['rel-b', 'insulin sensitivity'], ['rel-c', 'insulin sensitivity'],
    ['noi-a', 'crystal lattice'], ['noi-b', 'crystal lattice'], ['noi-c', 'crystal lattice'],
    ['noi-d', 'crystal lattice'], ['noi-e', 'crystal lattice'],
  ] as const;
  for (const [key, topic] of poolSpec) {
    const srcId = newId('src');
    srcIds.set(key, srcId);
    app.store.putObject('source_document', SourceDocument.parse({
      id: srcId, runId, family: 'openalex',
      identifiers: [{ kind: 'doi', value: `10.1000/${key}` }],
      title: `${topic} study ${key}`, authors: ['Fixture A'],
      contentDepth: 'abstract', accessState: 'open',
      contentHash: 'ab'.repeat(32), retrievedAt: new Date().toISOString(), parseStatus: 'ok',
      abstractText: `Abstract about ${topic} with distinctive vocabulary.`,
    }));
  }
});

const srcIds = new Map<string, string>();

afterAll(async () => {
  await api.stop();
  app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('screening HTTP surface', () => {
  it('GET lazily creates a session over the pool; decisions append; duplicates are idempotent', async () => {
    const first = await fetch(`${base}/api/v1/runs/${runId}/screening`);
    expect(first.status).toBe(200);
    const view = await first.json() as { session: { poolSize: number; state: string }; next: { srcId: string }[] };
    expect(view.session.poolSize).toBe(8);
    expect(view.session.state).toBe('active');
    expect(view.next.length).toBeGreaterThan(0);

    const decide = await fetch(`${base}/api/v1/runs/${runId}/screening/decisions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ srcId: view.next[0]?.srcId, verdict: 'include' }),
    });
    expect(decide.status).toBe(201);
    const after = await decide.json() as { view: { session: { includeCount: number } } };
    expect(after.view.session.includeCount).toBe(1);

    const dup = await fetch(`${base}/api/v1/runs/${runId}/screening/decisions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ srcId: view.next[0]?.srcId, verdict: 'exclude' }),
    });
    expect(dup.status).toBe(200);
    const dupBody = await dup.json() as { duplicate: boolean; view: { session: { includeCount: number; excludeCount: number } } };
    expect(dupBody.duplicate).toBe(true);
    expect(dupBody.view.session.excludeCount).toBe(0); // original verdict stands
  });

  it('rejects foreign src ids and absent runs with the shared error envelope', async () => {
    const foreign = await fetch(`${base}/api/v1/runs/${runId}/screening/decisions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ srcId: 'src_nonexistent', verdict: 'include' }),
    });    expect(foreign.status).toBe(404);
    expect(((await foreign.json()) as { error: { code: string } }).error.code).toBe('src_not_in_pool');

    const absent = await fetch(`${base}/api/v1/runs/run_aaaaaaaaaaaaaaaaaaaaaaaaa/screening`);
    expect(absent.status).toBe(404);
  });

  it('stop closes the session and records a human_expert feedback signal', async () => {
    const stop = await fetch(`${base}/api/v1/runs/${runId}/screening/stop`, { method: 'POST' });
    expect(stop.status).toBe(200);
    const body = await stop.json() as { view: { session: { state: string } }; feedbackId?: string };
    expect(body.view.session.state).toBe('stopped');
    expect(body.feedbackId).toMatch(/^fbk_/);
    const fb = app.store.listObjects('feedback', runId);
    expect(fb.some((f) => f.id === body.feedbackId && f.source === 'human_expert' && f.content.includes('纳入 1 篇'))).toBe(true);

    const after = await fetch(`${base}/api/v1/runs/${runId}/screening/decisions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ srcId: srcIds.get('rel-b'), verdict: 'include' }),
    });
    expect(after.status).toBe(409);
    expect(((await after.json()) as { error: { code: string } }).error.code).toBe('session_stopped');
  });
});
