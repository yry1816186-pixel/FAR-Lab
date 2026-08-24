/**
 * Ink render-layer tests for the v3 surfaces (ink-testing-library, no TTY):
 * conversations tab, chat view with proposal approval cards (y/a/n wiring to
 * the injected deps), live run detail driven by a FAKE SSE subscription, and
 * the launch composer's FAR_ALLOW_LIVE gate. Deterministic: every network
 * edge is a fake dep captured in arrays.
 * Run: node --experimental-strip-types --test test/render-v3.test.ts
 */
import assert from 'node:assert';
import test from 'node:test';
import React from 'react';
import { render } from 'ink-testing-library';
import { App } from '../src/ink.ts';
import { ChatView, RunDetailView, type ChatDeps, type DetailDeps } from '../src/ink.ts';
import type { LiveSubscription, SubscribeOptions } from '../src/sse.ts';
import type { Conversation, RunEvent, RunSummary } from '../src/api.ts';

const h = React.createElement;
const tick = (ms = 80): Promise<void> => new Promise((r) => setTimeout(r, ms));
const lastFrame = (app: { frames: string[] }): string => app.frames[app.frames.length - 1] ?? '';

// ---------------------------------------------------------------------------
// fixtures

const conv = (over: Partial<Conversation> = {}): Conversation => ({
  id: 'conv_x1', title: '质粒水平转移', status: 'open', runIds: [],
  turns: 2, updatedAt: '2026-08-24T01:00:00Z', createdAt: '2026-08-24T00:00:00Z',
  messages: [
    {
      id: 'cmsg_1', role: 'researcher', content: '我想研究质粒介导的耐药转移', createdAt: '2026-08-24T00:00:10Z',
      replyError: 'provider unreachable',
    },
    {
      id: 'cmsg_2', role: 'agent', content: '好方向。我先看看工作区。', createdAt: '2026-08-24T00:01:00Z',
      toolTrace: [{ tool: 'list_runs', ok: true, durationMs: 30 }],
      proposals: [{
        id: 'act_p1', kind: 'launch_research', title: '启动质粒水平转移研究',
        args: { question: '接合质粒如何驱动耐药基因水平转移？' }, status: 'pending',
        riskLevel: 'high', argSummary: { question: '接合质粒如何驱动耐药基因水平转移？' },
        createdAt: '2026-08-24T00:01:05Z',
      }],
      usage: { provider: 'stub', modelId: 'm', latencyMs: 90 },
    },
  ],
  ...over,
});

const fakeChatDeps = (): { deps: ChatDeps; posts: string[]; postedSeeds: Array<Array<{ title: string }> | undefined>; resolves: Array<{ pid: string; approve: boolean; remember: boolean }>; launches: string[] } => {
  const posts: string[] = [];
  const postedSeeds: Array<Array<{ title: string }> | undefined> = [];
  const resolves: Array<{ pid: string; approve: boolean; remember: boolean }> = [];
  const launches: string[] = [];
  return {
    posts, postedSeeds, resolves, launches,
    deps: {
      post: async (id, text, opts) => {
        posts.push(text);
        postedSeeds.push(opts?.seeds?.map((s) => ({ title: s.title })));
        return conv({ id, messages: [...conv().messages, { id: 'cmsg_new', role: 'agent', content: `回复:${text}`, createdAt: '2026-08-24T02:00:00Z' }] });
      },
      resolve: async (id, pid, approve, remember) => {
        resolves.push({ pid, approve, remember });
        return conv({
          id,
          messages: conv().messages.map((m) => m.proposals?.[0] !== undefined && m.proposals[0].id === pid
            ? { ...m, proposals: [{ ...m.proposals[0]!, status: approve ? 'executed' : 'rejected' }] }
            : m),
        });
      },
      launch: async (id, text) => { launches.push(text); return { runId: 'run_new1' }; },
    },
  };
};

// ---------------------------------------------------------------------------
// App: conversations tab

test('App: [2] switches to the conversations workspace and renders rows', async () => {
  const app = render(h(App, { initialConversations: [], initialRuns: [] }));
  await tick();
  app.stdin.write('2');
  await tick();
  const frame = lastFrame(app);
  assert.match(frame, /研究常驻对话/);
  assert.match(frame, /暂无对话 — n 新建/);
  app.unmount();
});

test('App: conversation list rows show title, turns, and recency', async () => {
  const app = render(h(App, { initialConversations: [conv()], initialRuns: [] }));
  app.stdin.write('2');
  await tick();
  assert.match(lastFrame(app), /质粒水平转移/);
  assert.match(lastFrame(app), /2 轮/);
  app.unmount();
});

// ---------------------------------------------------------------------------
// ChatView: transcript, approval cards, posting

test('ChatView: renders turns, failed-turn banner, tool bar, pending card with risk + argSummary', async () => {
  const { deps } = fakeChatDeps();
  const app = render(h(ChatView, { initial: conv(), deps, onBack: () => {}, onNote: () => {}, onLaunched: () => {} }));
  await tick();
  const frame = lastFrame(app);
  assert.match(frame, /你: 我想研究质粒介导的耐药转移/);
  assert.match(frame, /✗ 回复失败: provider unreachable/);
  assert.match(frame, /常驻研究: 好方向/);
  assert.match(frame, /工具 list_runs✓ · 30ms|工具 list_runs✓/);
  assert.match(frame, /待审批 \(1\)/);
  assert.match(frame, /高风险/);
  assert.match(frame, /question=接合质粒/);
  assert.match(frame, /y 批准 · a 批准并记住此类 · n 拒绝/);
  app.unmount();
});

test('ChatView: y approves without remember; a approves with remember; n rejects', async () => {
  const { deps, resolves } = fakeChatDeps();
  const a1 = render(h(ChatView, { initial: conv(), deps, onBack: () => {}, onNote: () => {}, onLaunched: () => {} }));
  await tick();
  a1.stdin.write('y');
  await tick(120);
  assert.deepEqual(resolves, [{ pid: 'act_p1', approve: true, remember: false }]);
  a1.unmount();

  const a2 = render(h(ChatView, { initial: conv(), deps, onBack: () => {}, onNote: () => {}, onLaunched: () => {} }));
  await tick();
  a2.stdin.write('a');
  await tick(120);
  assert.deepEqual(resolves[1], { pid: 'act_p1', approve: true, remember: true });
  a2.unmount();

  const a3 = render(h(ChatView, { initial: conv(), deps, onBack: () => {}, onNote: () => {}, onLaunched: () => {} }));
  await tick();
  a3.stdin.write('n');
  await tick(120);
  assert.deepEqual(resolves[2], { pid: 'act_p1', approve: false, remember: false });
  a3.unmount();
});

test('ChatView: n opens the chat composer; confirm sends the REAL message via deps.post', async () => {
  const { deps, posts } = fakeChatDeps();
  const app = render(h(ChatView, { initial: conv({ messages: conv().messages.map((m) => ({ ...m, proposals: m.proposals?.map((p) => ({ ...p, status: 'executed' as const })) })) }), deps, onBack: () => {}, onNote: () => {}, onLaunched: () => {} }));
  await tick();
  app.stdin.write('n'); // composer
  await tick();
  assert.match(lastFrame(app), /对话输入/);
  app.stdin.write('下一步怎么做');
  await tick();
  app.stdin.write('\r'); // → confirm
  await tick();
  assert.match(lastFrame(app), /发送消息/);
  app.stdin.write('y');
  await tick(150);
  assert.deepEqual(posts, ['下一步怎么做']);
  app.unmount();
});

test('ChatView: launch composer stops at READY without FAR_ALLOW_LIVE (no launch call)', async () => {
  const prev = process.env.FAR_ALLOW_LIVE;
  delete process.env.FAR_ALLOW_LIVE;
  const notes: string[] = [];
  const { deps, launches } = fakeChatDeps();
  const app = render(h(ChatView, { initial: conv({ messages: [{ id: 'cmsg_1', role: 'researcher', content: '讨论', createdAt: '2026-08-24T00:00:10Z' }] }), deps, onBack: () => {}, onNote: (n) => notes.push(n), onLaunched: () => {} }));
  await tick();
  app.stdin.write('l'); // launch composer
  await tick();
  assert.match(lastFrame(app), /凝结研究问题/);
  app.stdin.write('X 如何通过 M 影响 Y？');
  await tick();
  app.stdin.write('\r'); // → confirm
  await tick();
  app.stdin.write('y'); // ready
  await tick(120);
  assert.equal(launches.length, 0, 'launch must NOT fire without FAR_ALLOW_LIVE=1');
  assert.ok(notes.some((n) => n.includes('no-live-API')), 'ready-only note shown');
  if (prev !== undefined) process.env.FAR_ALLOW_LIVE = prev;
  app.unmount();
});

test('ChatView: s attaches a local file that rides the next posted message', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const file = path.join(os.tmpdir(), `farlab-attach-${process.pid}.md`);
  fs.writeFileSync(file, '# 材料\n质粒拷贝数与耐药表型存在相关性。');
  const { deps, posts, postedSeeds } = fakeChatDeps();
  const notes: string[] = [];
  const app = render(h(ChatView, {
    initial: conv({ messages: [{ id: 'cmsg_0', role: 'researcher', content: '开始', createdAt: '2026-08-24T00:00:05Z' }] }),
    deps, onBack: () => {}, onNote: (n) => notes.push(n), onLaunched: () => {},
  }));
  await tick();
  app.stdin.write('s'); // open the path input
  await tick();
  assert.match(lastFrame(app), /附件路径/);
  app.stdin.write(file);
  await tick();
  app.stdin.write('\r'); // attach
  await tick(120);
  assert.match(lastFrame(app), /附件就绪: farlab-attach/);
  // compose + send: the seed must ride the POST
  app.stdin.write('n');
  await tick();
  app.stdin.write('结合附件谈谈');
  await tick();
  app.stdin.write('\r');
  await tick();
  app.stdin.write('y');
  await tick(150);
  assert.deepEqual(posts, ['结合附件谈谈']);
  assert.deepEqual(postedSeeds, [[{ title: `farlab-attach-${process.pid}.md` }]]);
  assert.doesNotMatch(lastFrame(app), /附件就绪/); // cleared after send
  fs.rmSync(file, { force: true });
  app.unmount();
});

test('ChatView: s with an unreadable path surfaces the honest error and keeps composing', async () => {
  const { deps, posts } = fakeChatDeps();
  const notes: string[] = [];
  const app = render(h(ChatView, {
    initial: conv({ messages: [{ id: 'cmsg_0', role: 'researcher', content: '开始', createdAt: '2026-08-24T00:00:05Z' }] }),
    deps, onBack: () => {}, onNote: (n) => notes.push(n), onLaunched: () => {},
  }));
  await tick();
  app.stdin.write('s');
  await tick();
  app.stdin.write('Z:/definitely/not/here.txt');
  await tick();
  app.stdin.write('\r');
  await tick(120);
  assert.ok(notes.some((n) => n.includes('附件读取失败')), 'honest attach error surfaced');
  assert.doesNotMatch(lastFrame(app), /附件就绪/);
  assert.equal(posts.length, 0, 'nothing was posted');
  app.unmount();
});

// ---------------------------------------------------------------------------
// RunDetailView: live subscription + controls

const runSummary: RunSummary = {
  id: 'run_live1', status: 'running', currentStage: 'retrieve', createdAt: new Date().toISOString(),
  questionText: 'Do ensembles beat linear baselines?',
};

interface FakeSub extends LiveSubscription { emit(e: RunEvent): void; states: string[]; }

const fakeDetailDeps = (): {
  deps: DetailDeps; cancels: string[]; resumes: string[]; forks: string[]; subs: FakeSub[]; initial: { run: RunSummary; events: RunEvent[] };
} => {
  const cancels: string[] = []; const resumes: string[] = []; const forks: string[] = []; const subs: FakeSub[] = [];
  return {
    cancels, resumes, forks, subs,
    initial: {
      run: { ...runSummary, lease: { holder: 'w1', live: true } },
      events: [{ seq: 1, at: '2026-08-24T00:00:00Z', type: 'stage_done', stage: 'scope', detail: { summary: '完成界定' } }],
    },
    deps: {
      fetchInitial: async () => ({
        run: { ...runSummary, lease: { holder: 'w1', live: true } },
        events: [{ seq: 1, at: '2026-08-24T00:00:00Z', type: 'stage_done', stage: 'scope', detail: { summary: '完成界定' } }],
      }),
      subscribe: (opts: SubscribeOptions): LiveSubscription => {
        const sub: FakeSub = {
          states: [], close() { /* fake */ },
          emit(e: RunEvent): void { opts.onEvent(e); },
        };
        subs.push(sub);
        opts.onState?.('live');
        return sub;
      },
      cancel: async (id) => { cancels.push(id); },
      resume: async (id) => { resumes.push(id); },
      fork: async (id) => { forks.push(id); return 'run_fork1'; },
      hypotheses: async () => [{ testability: 'high', noveltyLabel: 'novel', statement: 'H1 陈述' }],
      evidence: async () => ({ claims: [{ bindingStatus: 'bound', text: '主张一' }], relations: [] }),
      lineage: async () => ({ nodes: [{ id: 'n1', kind: 'run' }], edges: [{ from: 'r1', to: 'r2', kind: 'revised_into' }] }),
      report: async () => '# 报告\n结论',
      writeReport: async () => './far-tui-exports/run_live1.report.md',
    },
  };
};

test('RunDetailView live: initial snapshot renders, subscription events update stages + conn state', async () => {
  const { deps, subs } = fakeDetailDeps();
  const app = render(h(RunDetailView, { run: runSummary, deps, live: true, onBack: () => {}, onNote: () => {}, onForked: () => {} }));
  await tick(150);
  let frame = lastFrame(app);
  assert.match(frame, /✓ 范围界定/);
  assert.match(frame, /实时/); // connection state honest
  const sub = subs[0]!;
  sub.emit({ seq: 2, at: '2026-08-24T00:00:05Z', type: 'stage_done', stage: 'retrieve', detail: { summary: '检索 8 篇' } });
  await tick(120);
  frame = lastFrame(app);
  assert.match(frame, /✓ 文献检索/);
  assert.match(frame, /检索 8 篇/);
  app.unmount();
});

test('RunDetailView live: c→y requests cancel through deps; f→y forks and reports the new id', async () => {
  const { deps, cancels, forks } = fakeDetailDeps();
  const notes: string[] = [];
  const app = render(h(RunDetailView, { run: runSummary, deps, live: true, onBack: () => {}, onNote: (n) => notes.push(n), onForked: (id) => notes.push(`forked:${id}`) }));
  await tick(150);
  app.stdin.write('c');
  await tick();
  assert.match(lastFrame(app), /请求取消该研究/);
  app.stdin.write('y');
  await tick(150);
  assert.deepEqual(cancels, ['run_live1']);
  app.stdin.write('f');
  await tick();
  app.stdin.write('y');
  await tick(150);
  assert.deepEqual(forks, ['run_live1']);
  assert.ok(notes.some((n) => n.includes('run_fork1')));
  app.unmount();
});

test('RunDetailView live: h/e/l sub-views render narrowed objects; Esc returns', async () => {
  const { deps } = fakeDetailDeps();
  const app = render(h(RunDetailView, { run: runSummary, deps, live: true, onBack: () => {}, onNote: () => {}, onForked: () => {} }));
  await tick(150);
  app.stdin.write('h');
  await tick(120);
  assert.match(lastFrame(app), /假设 \(1\)/);
  assert.match(lastFrame(app), /H1 陈述/);
  app.stdin.write('\u001b'); // Esc closes sub-view
  await tick(120);
  app.stdin.write('e');
  await tick(120);
  assert.match(lastFrame(app), /证据主张 \(1\)/);
  app.stdin.write('q');
  await tick(120);
  app.stdin.write('l');
  await tick(120);
  assert.match(lastFrame(app), /谱系: 1 节点 · 1 边/);
  assert.match(lastFrame(app), /修订链: r1 → r2/);
  app.unmount();
});

test('RunDetailView static (injected events): no subscription, no conn state, stages render', async () => {
  const { deps, subs } = fakeDetailDeps();
  const app = render(h(RunDetailView, {
    run: runSummary, deps, live: false,
    injectedEvents: [{ seq: 1, at: '2026-08-24T00:00:00Z', type: 'stage_failed', stage: 'rank', detail: { summary: 'provider_error' } }],
    onBack: () => {}, onNote: () => {}, onForked: () => {},
  }));
  await tick(150);
  const frame = lastFrame(app);
  assert.match(frame, /✗ 排序评分/);
  assert.doesNotMatch(frame, /实时|连接中|重连中/);
  assert.equal(subs.length, 0);
  app.unmount();
});
