/**
 * Offline end-to-end: the TUI client modules (api.ts + sse.ts + chatCore.ts)
 * against a REAL createApiServer instance on an ephemeral port, with the
 * scripted TEST-ONLY stub provider (no network, no keys — no-live-API
 * directive). Imports the repo's compiled dist/ modules because root sources
 * use .js import specifiers that Node type-stripping cannot resolve.
 * Requires `npm run build` at the repo root first (lane gate does this).
 * Run: node --experimental-strip-types --test test/e2e.test.ts
 */
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..', '..', '..');
// Windows: dynamic import of an absolute path requires a file:// URL.
const distModule = (rel: string): string => pathToFileURL(path.join(root, 'dist', ...rel.split('/'))).href;
const { createApp } = await import(distModule('app/composition.js'));
const { createApiServer } = await import(distModule('server/api.js'));
const { createTestStubProvider } = await import(distModule('providers/test-stub.js'));

const { setBaseUrl } = await import('../src/api.ts');
const api = await import('../src/api.ts');
const { subscribeRunEvents } = await import('../src/sse.ts');
const chatCore = await import('../src/chatCore.ts');

const finishTurn = (reply: string): { rawOutput: string } => ({
  rawOutput: JSON.stringify({
    action: 'finish',
    reason: 'scripted turn',
    result: { reply, clarifyingQuestions: [], candidates: [], readyToConverge: false },
  }),
});
const useTool = (tool: string, args: Record<string, unknown>): { rawOutput: string } => ({
  rawOutput: JSON.stringify({ action: 'use_tool', tool, args, reason: 'scripted tool use' }),
});

const stubSteps = [
  finishTurn('这是第一轮回复——先澄清目标。'),
  useTool('propose_action', { kind: 'launch_research', title: '启动测试研究', args: { question: '集成学习能否稳定优于线性基线？' } }),
  finishTurn('我提议启动这项研究，等待你的批准。'),
  { fail: { kind: 'provider_error', message: 'scripted provider failure' } },
];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-tui-e2e-'));
const app = await createApp({ dataDir: tmp, providerOverride: createTestStubProvider(stubSteps) });
const server = createApiServer(app, {
  port: 0,
  executor: (runId) => Promise.resolve(app.store.getRun(runId)),
  staticRoot: path.join(tmp, 'no-web-dist'),
});
const port = await server.start();
setBaseUrl(`http://127.0.0.1:${port}/api/v1`);

test.after(() => {
  server.stop();
  app.close();
});

const waitFor = async (predicate: () => boolean, timeoutMs: number, what: string): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for: ${what}`);
    await new Promise((r) => setTimeout(r, 150));
  }
};

// ---------------------------------------------------------------------------
// 1. SSE live attach: real stream, incremental delivery, cursor resume

test('e2e SSE: live events arrive incrementally; resume delivers only the new tail', async () => {
  const res = await fetch(`http://127.0.0.1:${port}/api/v1/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '集成学习是否稳定优于线性基线？' }),
  });
  assert.equal(res.status, 202);
  const { runId } = (await res.json()) as { runId: string };
  assert.match(runId, /^run_/);

  app.store.appendEvent(runId, { type: 'stage_started', stage: 'scope' });
  app.store.appendEvent(runId, { type: 'stage_done', stage: 'scope', detail: { summary: '完成界定' } });

  const received: number[] = [];
  const states: string[] = [];
  const sub = subscribeRunEvents({
    runId,
    onEvent: (e) => { received.push(e.seq); },
    onState: (s) => { states.push(s); },
  });
  try {
    await waitFor(() => received.length >= 2, 8_000, 'initial SSE delivery (2 events)');
    assert.ok(states.includes('live'), `states: ${states.join(',')}`);
  } finally {
    sub.close();
  }

  // New events after close are NOT delivered to the closed subscription…
  const highWater = Math.max(...received);
  app.store.appendEvent(runId, { type: 'stage_failed', stage: 'retrieve', detail: { summary: 'scripted' } });
  await new Promise((r) => setTimeout(r, 400));
  assert.equal(Math.max(...received), highWater, 'closed subscription stays closed');

  // …and a resume subscription (fromSeq = cursor) delivers ONLY the tail.
  const tail: string[] = [];
  const sub2 = subscribeRunEvents({
    runId,
    fromSeq: highWater,
    onEvent: (e) => { tail.push(e.stage ?? e.type); },
  });
  try {
    await waitFor(() => tail.length >= 1, 8_000, 'SSE resume tail');
    assert.ok(tail.every((s) => s === 'retrieve' || s !== 'scope'), `resume delivered only new events: ${tail.join(',')}`);
    assert.ok(tail.includes('retrieve'), 'the failed retrieve stage arrived');
  } finally {
    sub2.close();
  }
});

// ---------------------------------------------------------------------------
// 2. Conversation chat: real posting, server-computed proposal card, approval execution

test('e2e chat: post → agent reply; proposal card carries server-computed risk/args; approve executes it', async () => {
  const conv = await api.createConversation('端到端测试对话');
  assert.match(conv.id, /^conv_/);

  const after1 = await api.postConversationMessage(conv.id, '我想研究集成学习的稳定性，先附一篇综述', {
    seeds: [{ title: 'Ensembles: a survey', identifiers: [{ kind: 'doi', value: '10.1000/example-survey' }] }],
  });
  const last1 = after1.messages.at(-1)!;
  assert.equal(last1.role, 'agent');
  assert.match(last1.content, /第一轮回复/);

  const after2 = await api.postConversationMessage(conv.id, '请启动一项研究');
  const pending = chatCore.pendingProposals(after2);
  assert.equal(pending.length, 1);
  const p = pending[0]!;
  assert.equal(p.kind, 'launch_research');
  // Server-computed disclosure (RU-3 T6): risk + deterministic arg summary,
  // never model-authored title alone.
  assert.ok(p.riskLevel !== undefined, 'riskLevel is server-computed');
  assert.match(p.argSummary?.question ?? '', /集成学习能否稳定优于线性基线/);

  const resolved = await api.resolveProposal(conv.id, p.id, true, true);
  const done = resolved.messages.flatMap((m) => m.proposals ?? []).find((x) => x.id === p.id)!;
  // NOTE: a conversation with NO attached materials fails here — the proposal
  // bridge passes seeds:[] which run-creation rejects (min 1). Documented as
  // handoff r2-2026-08-24-from-03-to-08-seedless-launch; this happy path
  // attaches one DOI seed so execution is exercised for real.
  assert.equal(done.status, 'executed', `result was: ${done.result ?? ''}`);
  assert.match(done.result ?? '', /run_/);
});

// ---------------------------------------------------------------------------
// 3. Honest failure: a scripted provider failure keeps the researcher's words

test('e2e chat: provider failure keeps the researcher message with replyError', async () => {
  const conv = await api.createConversation();
  const convId = conv.id;
  try {
    await api.postConversationMessage(convId, '这一轮会失败');
    assert.fail('the scripted provider failure must surface');
  } catch (e) {
    assert.ok(e instanceof Error && /5\d\d/.test(e.message), `honest failure surfaced: ${String(e)}`);
  }
  const fresh = await api.getConversation(convId);
  const last = fresh.messages.at(-1)!;
  assert.equal(last.role, 'researcher');
  assert.match(last.replyError ?? '', /scripted provider failure|provider/i);
  const rows = chatCore.conversationRows(fresh);
  assert.ok(rows.some((r) => r.kind === 'error'), 'failed turn renders an error row');
});

// ---------------------------------------------------------------------------
// 4. Run control endpoints: honest semantics on a non-active run

test('e2e control: cancel answers with the honest requested/reason contract', async () => {
  const runs = await api.listRuns();
  assert.ok(runs.length >= 1, 'the SSE test run is listed');
  const target = runs[0]!;
  const res = await fetch(`http://127.0.0.1:${port}/api/v1/runs/${target.id}/cancel`, { method: 'POST' });
  assert.equal(res.status, 202);
  const body = (await res.json()) as { requested: boolean; reason?: string };
  // Honest either way: a queued/running run requests cancellation (true); an
  // inactive run refuses with a reason. What is asserted is the CONTRACT —
  // never a silent lie.
  assert.equal(typeof body.requested, 'boolean');
  if (body.requested === false) assert.ok((body.reason ?? '').length > 0, 'refusal carries a reason');
});
