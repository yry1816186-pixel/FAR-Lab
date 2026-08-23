import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import { createApiServer, type ApiServer } from '../src/server/api.js';
import { createTestStubProvider, type StubStep } from '../src/providers/test-stub.js';

/**
 * Resident-agent conversation flow (PROPOSAL-resident-agent) — full HTTP
 * contract on a real store with a scripted stub provider speaking the kernel
 * ACTION protocol (use_tool | finish): multi-turn dialogue, visible tool
 * traces, researcher-gated action proposals (approve / remember / reject /
 * auto-approve), automation creation, launch bridging. Model failures keep the
 * researcher message (marked failed, retryable); no fake replies; one turn per
 * conversation at a time. No live route touched.
 */

/** One kernel-loop model call that FINISHes with the given agent reply. */
const finishTurn = (over: Record<string, unknown> = {}): StubStep => ({
  rawOutput: JSON.stringify({
    action: 'finish',
    reason: 'scripted turn',
    result: {
      reply: '这是一个很好的起点。先澄清：你想解释机制，还是预测表现？',
      clarifyingQuestions: ['目标现象的具体量度是什么？'],
      candidates: [
        { text: 'X 如何通过 M 影响 Y？', rationale: '机制型：现有材料只覆盖相关性，机制未知' },
        { text: 'X 能否在未见场景中预测 Y？', rationale: '预测型：材料中有可复用的基准' },
      ],
      readyToConverge: false,
      ...over,
    },
  }),
});

/** One kernel-loop model call that USES a tool. */
const useTool = (tool: string, args: Record<string, unknown> = {}): StubStep => ({
  rawOutput: JSON.stringify({ action: 'use_tool', tool, args, reason: 'scripted tool use' }),
});

const propose = (kind: string, title: string, args: Record<string, unknown>): StubStep =>
  useTool('propose_action', { kind, title, args });

let tmp: string;
let base: string;
let api: ApiServer;
let app: Awaited<ReturnType<typeof createApp>>;

// The cancel-automation step references an id that only exists after the
// researcher approves the automation; the stub holds this array by reference,
// so the test rewrites that step in place before the turn fires.
const CANCEL_PLACEHOLDER = '__CANCEL_TARGET__';
const stubSteps: StubStep[] = [
  // turn 1: plain finish (brainstorm)
  finishTurn(),
  // turn 2: converge
  finishTurn({
    reply: '好——已足够聚焦。',
    clarifyingQuestions: [],
    candidates: [{ text: '最终候选：X 通过 M 影响 Y 吗？', rationale: '两轮讨论收敛' }],
    readyToConverge: true,
  }),
  // turn 3 (failure test): provider failure at the first model call — the
  // researcher message must SURVIVE it, marked failed and retryable
  { fail: { kind: 'provider_error', message: 'scripted provider failure' } },
  // turn 3 retry: the same turn re-run lands honestly
  finishTurn({ reply: '重试成功——继续刚才的话题。', clarifyingQuestions: [], candidates: [] }),
  // turn 4: tool trace (read tool then finish)
  useTool('list_runs'),
  finishTurn({ reply: '工作区目前还没有研究。', clarifyingQuestions: [], candidates: [] }),
  // turn 5: propose launch_research (researcher approves + remembers)
  propose('launch_research', '启动质粒水平转移研究', { question: '接合质粒如何驱动抗生素耐药基因的水平转移？' }),
  finishTurn({ reply: '我提议启动这项研究，等待你的批准。', clarifyingQuestions: [], candidates: [], readyToConverge: true }),
  // turn 6: same kind again — remembered grant must AUTO-execute after the turn
  propose('launch_research', '再启动一轮预测型研究', { question: '质粒拷贝数能否预测耐药表型的强度？' }),
  finishTurn({ reply: '第二次同类行动按你的记忆设置直接执行。', clarifyingQuestions: [], candidates: [] }),
  // turn 7: propose create_automation (researcher approves)
  propose('create_automation', '研究完成自动简评', { trigger: { kind: 'run_completed' }, task: '研究完成后给出三句话简评与下一步建议' }),
  finishTurn({ reply: '自动化提案已生成。', clarifyingQuestions: [], candidates: [] }),
  // turn 8: propose cancel_automation (researcher REJECTS) — target id patched at runtime
  propose('cancel_automation', '停用自动简评', { automationId: CANCEL_PLACEHOLDER }),
  finishTurn({ reply: '停用提案已生成，等待你的决定。', clarifyingQuestions: [], candidates: [] }),
];
const setCancelTarget = (automationId: string): void => {
  const step = stubSteps.find((s) => (s.rawOutput ?? '').includes(CANCEL_PLACEHOLDER));
  if (step === undefined) throw new Error('test authoring bug: cancel placeholder step not found');
  step.rawOutput = step.rawOutput.replace(CANCEL_PLACEHOLDER, automationId);
};

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-conv-'));
  app = await createApp({
    dataDir: tmp,
    providerOverride: createTestStubProvider(stubSteps),
  });
  api = createApiServer(app, {
    port: 0,
    executor: (runId) => Promise.resolve(app.store.getRun(runId)),
    staticRoot: path.join(tmp, 'no-web-dist'),
  });
  base = `http://127.0.0.1:${await api.start()}`;
});

afterAll(() => { api.stop(); });

type JsonBody = Record<string, unknown>;
const json = async (method: string, pathName: string, body?: unknown): Promise<{ status: number; data: JsonBody | null }> => {
  const res = await fetch(`${base}/api/v1${pathName}`, {
    method,
    ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
  });
  const text = await res.text();
  return { status: res.status, data: text.length > 0 ? JSON.parse(text) as JsonBody : null };
};

const lastAgentMessage = (conv: JsonBody): JsonBody =>
  (conv.messages as JsonBody[]).filter((m) => m.role === 'agent').at(-1) as JsonBody;

describe('resident conversation flow (HTTP, stub provider, kernel action protocol)', () => {
  let convId: string;

  it('creates a conversation and derives its title from the first message', async () => {
    const create = await json('POST', '/conversations', { title: '  ' });
    expect(create.status).toBe(201);
    convId = create.data.conversation.id as string;
    expect(convId).toMatch(/^conv_/);
    expect(create.data.conversation.autoApprove).toEqual([]);

    const turn = await json('POST', `/conversations/${convId}/messages`, {
      text: '我想研究抗生素耐药基因的水平转移机制',
      seeds: [{ title: 'Plasmid conjugation review', identifiers: [{ kind: 'doi', value: '10.1000/demo' }], year: 2023, authors: ['A B'] }],
    });
    expect(turn.status).toBe(200);
    const msgs = turn.data.conversation.messages;
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe('researcher');
    expect(msgs[0].seeds).toHaveLength(1);
    expect(msgs[1].role).toBe('agent');
    expect(msgs[1].content).toContain('澄清');
    expect((msgs[1].candidates as JsonBody[]).map((c) => c.id)).toEqual(['cand_1', 'cand_2']);
    expect(msgs[1].usage.modelId).toBeTruthy();
    expect(turn.data.conversation.title).toBe('我想研究抗生素耐药基因的水平转移机制');
    expect(turn.data.conversation.turns).toBe(1);
  });

  it('keeps candidate ids monotonic across turns', async () => {
    const turn = await json('POST', `/conversations/${convId}/messages`, { text: '解释机制优先，关注接合质粒' });
    expect(turn.status).toBe(200);
    const agent = lastAgentMessage(turn.data.conversation);
    expect((agent.candidates as JsonBody[]).map((c) => c.id)).toEqual(['cand_3']);
    expect(turn.data.conversation.status).toBe('open');
  });

  it('rejects empty messages and bad seeds honestly', async () => {
    const empty = await json('POST', `/conversations/${convId}/messages`, { text: '   ' });
    expect(empty.status).toBe(400);
    expect(empty.data.error.code).toBe('validation');
    const badSeeds = await json('POST', `/conversations/${convId}/messages`, { text: 'ok', seeds: 'nope' });
    expect(badSeeds.status).toBe(400);
  });

  it('keeps the researcher message when the model call fails — marked failed, no turn counted', async () => {
    const before = (await json('GET', `/conversations/${convId}`)).data.conversation;
    const fail = await json('POST', `/conversations/${convId}/messages`, { text: '这条必须被保留' });
    expect(fail.status).toBe(502);
    expect(fail.data.error.code).toBe('conversation_model_failed');
    const after = (await json('GET', `/conversations/${convId}`)).data.conversation;
    expect(after.messages).toHaveLength(before.messages.length + 1);
    const failedMsg = (after.messages as JsonBody[]).at(-1) as JsonBody;
    expect(failedMsg.role).toBe('researcher');
    expect(failedMsg.content).toBe('这条必须被保留');
    expect(String(failedMsg.replyError)).toContain('scripted provider failure');
    expect(after.turns).toBe(before.turns); // nothing faked: no turn until a real reply
    // no agent reply was fabricated for the failed turn
    expect((after.messages as JsonBody[]).filter((m) => m.role === 'agent')).toHaveLength(
      (before.messages as JsonBody[]).filter((m) => m.role === 'agent').length,
    );
  });

  it('retries the failed turn: reply lands, marker cleared, no duplicate message', async () => {
    const conv = (await json('GET', `/conversations/${convId}`)).data.conversation;
    const messages = conv.messages as JsonBody[];
    const answeredAlready = messages[0] as JsonBody; // turn 1's researcher message — not retryable
    const stale = await json('POST', `/conversations/${convId}/messages/${answeredAlready.id}/retry`);
    expect(stale.status).toBe(409);

    const failedId = (messages.at(-1) as JsonBody).id as string;
    const retry = await json('POST', `/conversations/${convId}/messages/${failedId}/retry`);
    expect(retry.status).toBe(200);
    const after = retry.data.conversation;
    const afterMsgs = after.messages as JsonBody[];
    expect(afterMsgs).toHaveLength(messages.length + 1);
    expect((afterMsgs.at(-1) as JsonBody).role).toBe('agent');
    expect((afterMsgs.at(-1) as JsonBody).content).toContain('重试成功');
    expect((afterMsgs.at(-2) as JsonBody).replyError).toBeUndefined();
    expect(afterMsgs.filter((m) => m.content === '这条必须被保留')).toHaveLength(1); // resent ≠ duplicated
    expect(after.turns).toBe(conv.turns + 1);
  });

  it('shows the tools the agent actually used (visible action bar)', async () => {
    const turn = await json('POST', `/conversations/${convId}/messages`, { text: '现在工作区里有什么研究？' });
    expect(turn.status).toBe(200);
    const agent = lastAgentMessage(turn.data.conversation);
    expect(agent.toolTrace).toHaveLength(1);
    expect(agent.toolTrace[0].tool).toBe('list_runs');
    expect(agent.toolTrace[0].ok).toBe(true);
    expect(agent.usage.modelCalls).toBe(2); // use_tool turn + finish turn
    expect(agent.usage.toolCalls).toBe(1);
  });

  it('gates actions behind researcher approval: propose → approve(+remember) → real run', async () => {
    const turn = await json('POST', `/conversations/${convId}/messages`, { text: '启动这项研究吧' });
    expect(turn.status).toBe(200);
    const agent = lastAgentMessage(turn.data.conversation);
    expect(agent.proposals).toHaveLength(1);
    const proposal = agent.proposals[0] as JsonBody;
    expect(proposal.kind).toBe('launch_research');
    expect(proposal.status).toBe('pending');
    // RU-3 T6: server-computed disclosure rides every card — risk from the kind
    // mapping, args rendered deterministically; neither is model-controllable.
    expect(proposal.riskLevel).toBe('moderate');
    expect(proposal.argSummary).toEqual({ question: '接合质粒如何驱动抗生素耐药基因的水平转移？', seeds: '0' });

    const approve = await json('POST', `/conversations/${convId}/proposals/${proposal.id}`, { approve: true, remember: true });
    expect(approve.status).toBe(200);
    const conv = approve.data.conversation;
    const resolved = (conv.messages as JsonBody[])
      .flatMap((m) => (m.proposals as JsonBody[] | undefined) ?? [])
      .find((p) => p.id === proposal.id) as JsonBody;
    expect(resolved.status).toBe('executed');
    expect(resolved.result).toContain('已启动研究');
    expect((conv.runIds as string[]).length).toBe(1);
    expect(conv.autoApprove).toEqual(['launch_research']);
    // deterministic outcome record, machine-written, visibly distinct
    const record = (conv.messages as JsonBody[]).filter((m) => m.role === 'automation').at(-1) as JsonBody;
    expect(record.content).toContain('已执行');
    // the launched run inherited the conversation seed
    const runId = (conv.runIds as string[])[0];
    const sources = await json('GET', `/runs/${runId}/sources`);
    expect(JSON.stringify(sources.data)).toContain('Plasmid conjugation review');
  });

  it('auto-executes remembered kinds after the turn (no re-asking), still recorded honestly', async () => {
    const turn = await json('POST', `/conversations/${convId}/messages`, { text: '再启动一轮预测型研究' });
    expect(turn.status).toBe(200);
    const conv = turn.data.conversation;
    const proposal = (conv.messages as JsonBody[])
      .flatMap((m) => (m.proposals as JsonBody[] | undefined) ?? [])
      .find((p) => p.kind === 'launch_research' && (p.title as string).includes('预测型')) as JsonBody;
    expect(proposal.status).toBe('executed');
    expect(proposal.autoApproved).toBe(true);
    expect((conv.runIds as string[]).length).toBe(2);
  });

  it('creates a real automation through the same approval gate', async () => {
    const turn = await json('POST', `/conversations/${convId}/messages`, { text: '研究完成后自动给我简评' });
    expect(turn.status).toBe(200);
    const agent = lastAgentMessage(turn.data.conversation);
    const proposal = (agent.proposals as JsonBody[])[0];
    expect(proposal.kind).toBe('create_automation');

    const approve = await json('POST', `/conversations/${convId}/proposals/${proposal.id}`, { approve: true });
    expect(approve.status).toBe(200);
    const list = await json('GET', `/conversations/${convId}/automations`);
    expect(list.status).toBe(200);
    const automation = (list.data.automations as JsonBody[])[0];
    expect(automation.trigger).toEqual({ kind: 'run_completed' });
    expect(automation.enabled).toBe(true);
    expect(automation.task).toContain('简评');

    // cancel proposal referencing it gets REJECTED by the researcher
    setCancelTarget(automation.id as string);
    const cancelTurn = await json('POST', `/conversations/${convId}/messages`, {
      text: `停用自动简评（对象 ${automation.id}）`,
    });
    expect(cancelTurn.status).toBe(200);
    const cancelProposal = (cancelTurn.data.conversation.messages as JsonBody[])
      .flatMap((m) => (m.proposals as JsonBody[] | undefined) ?? [])
      .find((p) => p.kind === 'cancel_automation') as JsonBody;
    expect(cancelProposal).toBeDefined();
    const reject = await json('POST', `/conversations/${convId}/proposals/${cancelProposal.id}`, { approve: false });
    expect(reject.status).toBe(200);
    const after = reject.data.conversation;
    const rejected = (after.messages as JsonBody[])
      .flatMap((m) => (m.proposals as JsonBody[] | undefined) ?? [])
      .find((p) => p.id === cancelProposal.id) as JsonBody;
    expect(rejected.status).toBe('rejected');
    // rejection must NOT disable the automation
    const still = (await json('GET', `/conversations/${convId}/automations`)).data.automations as JsonBody[];
    expect(still[0].enabled).toBe(true);
  });

  it('resolves an already-resolved proposal honestly (409, not silent)', async () => {
    const conv = (await json('GET', `/conversations/${convId}`)).data.conversation;
    const executed = (conv.messages as JsonBody[])
      .flatMap((m) => (m.proposals as JsonBody[] | undefined) ?? [])
      .find((p) => p.status === 'executed') as JsonBody;
    const again = await json('POST', `/conversations/${convId}/proposals/${executed.id}`, { approve: true });
    expect(again.status).toBe(409);
  });

  it('launches a run from the conversation carrying ALL researcher materials (manual bridge intact)', async () => {
    const launch = await json('POST', `/conversations/${convId}/launch`, { text: '接合质粒如何驱动抗生素耐药基因的水平转移？' });
    expect(launch.status).toBe(202);
    const runId = launch.data.runId as string;
    expect(runId).toMatch(/^run_/);
    const conv = (await json('GET', `/conversations/${convId}`)).data.conversation;
    expect(conv.runIds).toContain(runId);
    expect(conv.status).toBe('converged');
  });

  it('lists conversations newest-first and deletes by id', async () => {
    const list = await json('GET', '/conversations');
    expect(list.status).toBe(200);
    expect(list.data.conversations.length).toBe(1);
    const del = await json('DELETE', `/conversations/${convId}`);
    expect(del.status).toBe(200);
    expect((await json('GET', '/conversations')).data.conversations).toHaveLength(0);
    expect((await json('GET', `/conversations/${convId}`)).status).toBe(404);
  });
});

describe('one turn per conversation at a time (concurrent turns serialized)', () => {
  let tmp2: string;
  let base2: string;
  let api2: ApiServer;

  beforeAll(async () => {
    tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-conv-lock-'));
    const app2 = await createApp({
      dataDir: tmp2,
      providerOverride: createTestStubProvider([{ ...finishTurn(), delayMs: 250 }]),
    });
    api2 = createApiServer(app2, {
      port: 0,
      executor: (runId) => Promise.resolve(app2.store.getRun(runId)),
      staticRoot: path.join(tmp2, 'no-web-dist'),
    });
    base2 = `http://127.0.0.1:${await api2.start()}`;
  });
  afterAll(() => { api2.stop(); });

  const json2 = async (method: string, pathName: string, body?: unknown): Promise<{ status: number; data: JsonBody | null }> => {
    const res = await fetch(`${base2}/api/v1${pathName}`, {
      method,
      ...(body !== undefined ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } } : {}),
    });
    const text = await res.text();
    return { status: res.status, data: text.length > 0 ? JSON.parse(text) as JsonBody : null };
  };

  it('rejects concurrent post/retry with 409 turn_in_flight, transcript undamaged', async () => {
    const conv = await json2('POST', '/conversations', {});
    const convId = (conv.data.conversation as JsonBody).id as string;

    // first turn: researcher message persists immediately, model call sleeps 250ms
    const first = json2('POST', `/conversations/${convId}/messages`, { text: '第一条（模型慢）' });
    await new Promise((r) => { setTimeout(r, 60); }); // inside the model call now

    const second = await json2('POST', `/conversations/${convId}/messages`, { text: '第二条应被拒绝' });
    expect(second.status).toBe(409);
    expect(second.data.error.code).toBe('turn_in_flight');

    // retrying the dangling message while its turn is still running is refused too
    const midTurn = (await json2('GET', `/conversations/${convId}`)).data.conversation as JsonBody;
    const danglingId = ((midTurn.messages as JsonBody[]).at(-1) as JsonBody).id as string;
    const retryDuring = await json2('POST', `/conversations/${convId}/messages/${danglingId}/retry`);
    expect(retryDuring.status).toBe(409);
    expect(retryDuring.data.error.code).toBe('turn_in_flight');

    const done = await first;
    expect(done.status).toBe(200);
    const msgs = (done.data.conversation as JsonBody).messages as JsonBody[];
    expect(msgs).toHaveLength(2); // researcher + agent — the rejected second text never landed
    expect(msgs.some((m) => m.content === '第二条应被拒绝')).toBe(false);
  });
});
