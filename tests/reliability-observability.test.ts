import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import { classifyError, sampleProcess, sampleStorage, formatCorrelation } from '../src/app/observability.js';
import { recoveryStateForRun } from '../src/app/recovery-state.js';
import { ResearchQuestion } from '../src/domain/index.js';
import { newId } from '../src/domain/ids.js';
import type { App } from '../src/app/composition.js';

/**
 * Reliability workstream 2026-08-24: unified error taxonomy, resource/storage
 * sampling, and the recovery UX contract (derived phases + real user actions).
 * Real store + real fs; no network. Every phase assertion pins the EXACT
 * evidence trail the UI is allowed to render.
 */

let app: App;
let dataDir: string;

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'far-obs-'));
  app = await createApp({ dataDir });
});
afterAll(() => {
  app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const makeRun = () => app.store.createRun(ResearchQuestion.parse({
  id: newId('q'), text: 'observability', background: '', goalType: 'exploratory',
  scope: { domain: 'd', phenomena: ['p'] }, constraints: {}, createdAt: new Date().toISOString(),
}));

describe('classifyError (unified taxonomy)', () => {
  it('maps errno codes to system categories with honest retry/human flags', () => {
    const busy = Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' });
    expect(classifyError(busy)).toMatchObject({ category: 'db_busy', retryable: true, needsHuman: false });
    const full = Object.assign(new Error('write failed'), { code: 'ENOSPC' });
    expect(classifyError(full)).toMatchObject({ category: 'disk_full', retryable: false, needsHuman: true });
    const denied = Object.assign(new Error('nope'), { code: 'EACCES' });
    expect(classifyError(denied)).toMatchObject({ category: 'permission_denied', retryable: false, needsHuman: true });
    const reset = Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
    expect(classifyError(reset)).toMatchObject({ category: 'network_error', retryable: true, needsHuman: false });
  });

  it('recognizes the domain error shapes thrown as plain errors today', () => {
    expect(classifyError(new Error('workspace spend limit reached: $2.00 spent of $2.00 declared')))
      .toMatchObject({ category: 'spend_limit', needsHuman: true });
    expect(classifyError(new Error('cancelled by user')))
      .toMatchObject({ category: 'cancelled', needsHuman: false });
    expect(classifyError(new Error('run token budget exhausted for run_x: spent 10 of cap 10')))
      .toMatchObject({ category: 'budget_exhausted', needsHuman: true });
  });

  it('provider-plane result errors keep their own kind and retryable flag', () => {
    const rateLimited = { kind: 'rate_limited', message: '429', retryable: true };
    expect(classifyError(rateLimited)).toMatchObject({ category: 'rate_limited', retryable: true });
    const auth = { kind: 'auth_error', message: '401', retryable: false };
    expect(classifyError(auth)).toMatchObject({ category: 'auth_error', needsHuman: true });
  });

  it('unknown errors fall to provider_error retryable (fail-open to retry, never to silence)', () => {
    expect(classifyError(new Error('mystery'))).toMatchObject({ category: 'provider_error', retryable: true });
    expect(classifyError('raw string')).toMatchObject({ category: 'provider_error' });
  });

  it('unwraps undici cause-carried errnos: real DNS failures classify as network_error', () => {
    // Node fetch wraps transport failures in `TypeError: fetch failed` with the
    // errno on `.cause` — the taxonomy must see through exactly one guarded hop.
    const dnsAgain = new TypeError('fetch failed');
    (dnsAgain as { cause?: unknown }).cause = Object.assign(new Error('getaddrinfo EAI_AGAIN offline.invalid'), { code: 'EAI_AGAIN' });
    expect(classifyError(dnsAgain)).toMatchObject({ category: 'network_error', retryable: true, needsHuman: false });
    const notFound = new TypeError('fetch failed');
    (notFound as { cause?: unknown }).cause = Object.assign(new Error('getaddrinfo ENOTFOUND no.such.host'), { code: 'ENOTFOUND' });
    expect(classifyError(notFound)).toMatchObject({ category: 'network_error', retryable: true });
    // A direct errno still wins over the cause hop (top level is authoritative).
    const both = Object.assign(new TypeError('fetch failed'), { code: 'ENOSPC' });
    (both as { cause?: unknown }).cause = Object.assign(new Error('dns'), { code: 'EAI_AGAIN' });
    expect(classifyError(both)).toMatchObject({ category: 'disk_full', needsHuman: true });
    // Non-error cause is ignored, not crashed on.
    const badCause = new TypeError('fetch failed');
    (badCause as { cause?: unknown }).cause = 'not-an-error';
    expect(classifyError(badCause)).toMatchObject({ category: 'provider_error', retryable: true });
  });

  it('maps SourceAdapterError kind=network to network_error (errno already lost there)', () => {
    // src/sources normalize every transport failure into this shape; without the
    // mapping retrieval outages mislabel as provider_error in the obs console.
    const srcErr = Object.assign(new Error('[arxiv] network httpStatus=0 query="x": fetch failed'), {
      name: 'SourceAdapterError',
      kind: 'network',
      family: 'arxiv',
      httpStatus: 0,
    });
    expect(classifyError(srcErr)).toMatchObject({ category: 'network_error', retryable: true, needsHuman: false });
    // Non-network adapter failures (http_status/parse) keep the generic fallback.
    const parseErr = Object.assign(new Error('[arxiv] parse httpStatus=200 query="x": bad body'), {
      name: 'SourceAdapterError',
      kind: 'parse',
      family: 'arxiv',
      httpStatus: 200,
    });
    expect(classifyError(parseErr)).toMatchObject({ category: 'provider_error', retryable: true });
  });
});

describe('resource + storage sampling', () => {
  it('process sample carries the leak signature fields', () => {
    const s = sampleProcess();
    expect(s.pid).toBe(process.pid);
    expect(s.rssMb).toBeGreaterThan(0);
    expect(s.heapUsedMb).toBeLessThanOrEqual(s.heapTotalMb);
    expect(s.activeHandles).toBeGreaterThanOrEqual(0);
  });

  it('storage sample counts runs/events/objects/artifacts including orphan temps', async () => {
    const run = makeRun();
    app.store.appendEvent(run.id, { type: 'note', detail: { reason: 'sample' } });
    const put = await app.artifacts.put('observability sample payload');
    // simulate crash residue: an orphan temp next to the landed blob
    const shardDir = path.join(dataDir, 'artifacts', put.hash.slice(0, 2));
    fs.writeFileSync(path.join(shardDir, `.${put.hash}.tmp-9999-deadbeef`), 'residue');
    const s = sampleStorage(app.store, dataDir);
    expect(s.runs).toBeGreaterThanOrEqual(1);
    expect(s.events).toBeGreaterThanOrEqual(1);
    expect(s.artifactBlobs).toBeGreaterThanOrEqual(1);
    expect(s.orphanTemps).toBe(1);
    expect(s.dbBytes).toBeGreaterThan(0);
    expect(s.artifactsBytes).toBeGreaterThan(0);
  });
});

describe('recovery UX contract (derived phases)', () => {
  it('running + live lease => running, no user action', () => {
    const run = makeRun();
    const until = new Date(Date.now() + 60_000).toISOString();
    app.store.acquireLease(run.id, 'holder-1', until);
    const rec = app.store.getRun(run.id)!;
    const state = recoveryStateForRun(app.store, { ...rec, status: 'running' });
    expect(state.phase).toBe('running');
    expect(state.userAction).toBeNull();
    expect(state.evidence.leaseLive).toBe(true);
  });

  it('running + EXPIRED lease => frozen_recoverable with the real resume command', () => {
    const run = makeRun();
    const past = new Date(Date.now() - 60_000).toISOString();
    app.store.acquireLease(run.id, 'holder-dead', past);
    const rec = app.store.getRun(run.id)!;
    const state = recoveryStateForRun(app.store, { ...rec, status: 'running' });
    expect(state.phase).toBe('frozen_recoverable');
    expect(state.userAction?.kind).toBe('resume');
    expect(state.userAction?.hint).toContain(`far research resume ${run.id}`);
    expect(state.evidence.leaseLive).toBe(false);
  });

  it('budget-marker skips => paused_budget with raise-then-resume action', () => {
    const run = makeRun();
    const rec = app.store.getRun(run.id)!;
    rec.status = 'partial';
    const stage = rec.stages.find((s) => s.stage === 'rank')!;
    stage.state = 'skipped';
    stage.error = 'budget_exhausted: spent 1000 of cap 1000';
    app.store.updateRun(rec);
    const state = recoveryStateForRun(app.store, app.store.getRun(run.id)!);
    expect(state.phase).toBe('paused_budget');
    expect(state.evidence.budgetSkippedStages).toEqual(['rank']);
    expect(state.userAction?.kind).toBe('raise_budget');
    expect(state.userAction?.hint).toContain('FARLAB_RUN_TOKEN_BUDGET');
  });

  it('spend-limit message shape => blocked_needs_human (gate-level fail-closed covered in spend-limit.test.ts)', () => {
    const run = makeRun();
    const rec = app.store.getRun(run.id)!;
    rec.status = 'partial';
    // real format: llm.ts throws `model call failed (<kind>) in <stage>/<purpose>: <msg>`
    // and the spend gate's quota message carries the spend-limit sentence.
    rec.lastError = 'model call failed (quota_exceeded) in rank/scoring: workspace spend limit reached: $1.00 spent of $1.00 declared — failing closed (quota_exceeded); raise or clear the limit in settings to continue';
    app.store.updateRun(rec);
    // paused_spend derivation requires spentUsd >= limitUsd from PRICED receipts
    // (no invented prices); with none, the honest surface here is the classified
    // quota message routing the user to the settings action.
    const state = recoveryStateForRun(app.store, app.store.getRun(run.id)!);
    expect(state.phase).toBe('blocked_needs_human');
    expect(state.evidence.lastErrorClassified).toMatchObject({ needsHuman: true });
  });

  it('transient partial (network) => retryable_partial, plain resume', () => {
    const run = makeRun();
    const rec = app.store.getRun(run.id)!;
    rec.status = 'partial';
    rec.lastError = 'fetch failed: socket hang up (ECONNRESET)';
    app.store.updateRun(rec);
    const state = recoveryStateForRun(app.store, app.store.getRun(run.id)!);
    expect(state.phase).toBe('retryable_partial');
    expect(state.userAction?.kind).toBe('resume');
    expect(state.evidence.lastErrorClassified).toMatchObject({ retryable: true });
  });

  it('auth failure => blocked_needs_human; completed/cancelled map cleanly', () => {
    const run = makeRun();
    const rec = app.store.getRun(run.id)!;
    rec.status = 'failed';
    rec.lastError = 'model call failed (auth_error) in scope/clarify: 401 — credentials rejected; failing closed';
    app.store.updateRun(rec);
    expect(recoveryStateForRun(app.store, app.store.getRun(run.id)!).phase).toBe('blocked_needs_human');

    const rec2 = app.store.getRun(run.id)!;
    rec2.status = 'completed';
    delete rec2.lastError;
    app.store.updateRun(rec2);
    expect(recoveryStateForRun(app.store, app.store.getRun(run.id)!).phase).toBe('completed');

    const rec3 = app.store.getRun(run.id)!;
    rec3.status = 'cancelled';
    app.store.updateRun(rec3);
    const cancelled = recoveryStateForRun(app.store, app.store.getRun(run.id)!);
    expect(cancelled.phase).toBe('cancelled');
    expect(cancelled.userAction?.kind).toBe('resume'); // resume clears the flag
  });

  it('correlation formatting is the one join vocabulary', () => {
    const c = formatCorrelation({ runId: 'run_abc', stage: 'rank', stageAttempt: 2, receiptId: 'rcp_x', eventSeq: 42 });
    expect(c).toBe('run=run_abc stage=rank#2 receipt=rcp_x seq=42');
  });
});
