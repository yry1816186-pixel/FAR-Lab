/**
 * Chat-core + state + slash-command tests (node:test, deterministic).
 * Run: node --experimental-strip-types --test test/chatCore.test.ts
 */
import assert2 from 'node:assert';
import fs from 'node:fs';
import test from 'node:test';
import * as chatCore from '../src/chatCore.ts';
import { parseSlash, SLASH_HELP } from '../src/commands.ts';
import { loadState, saveState, clearState } from '../src/state.ts';
import type { Conversation, ConversationMessage, ConversationProposal } from '../src/api.ts';

// ---------------------------------------------------------------------------
// fixtures

const proposal = (over: Partial<ConversationProposal> = {}): ConversationProposal => ({
  id: 'act_abc123', kind: 'launch_research', title: '启动一项研究', args: {},
  status: 'pending', createdAt: '2026-08-24T00:00:00Z', ...over,
});

const msg = (over: Partial<ConversationMessage> = {}): ConversationMessage => ({
  id: 'cmsg_1', role: 'agent', content: '回复内容', createdAt: '2026-08-24T00:00:00Z', ...over,
});

const conv = (messages: ConversationMessage[]): Conversation => ({
  id: 'conv_x1', title: '测试对话', status: 'open', messages, runIds: [],
  turns: messages.length, updatedAt: '2026-08-24T01:00:00Z', createdAt: '2026-08-24T00:00:00Z',
});

// ---------------------------------------------------------------------------
// chatCore

test('messageRows: plain turn, label from role', () => {
  const rows = chatCore.messageRows(msg({ role: 'researcher', content: '为什么现在？' }));
  assert2.equal(rows.length, 1);
  assert2.deepEqual(rows[0], { kind: 'turn', role: 'researcher', label: '你', text: '为什么现在？' });
});

test('messageRows: failed turn keeps words + error banner with retry hint', () => {
  const rows = chatCore.messageRows(msg({ role: 'researcher', content: '我的问题', replyError: 'provider unreachable' }));
  assert2.equal(rows[0]!.kind, 'turn');
  assert2.equal((rows[0] as { failed?: boolean }).failed, true);
  assert2.equal(rows[1]!.kind, 'error');
  assert2.equal((rows[1] as { retryHint: boolean }).retryHint, true);
});

test('messageRows: tool trace → one tools row; usage → compact line', () => {
  const rows = chatCore.messageRows(msg({
    toolTrace: [{ tool: 'list_runs', ok: true, durationMs: 40 }, { tool: 'read_paper', ok: false }],
    usage: { provider: 'stub', modelId: 'm1', latencyMs: 120, inputTokens: 10, outputTokens: 5, modelCalls: 2, toolCalls: 2 },
  }));
  const tools = rows.find((r) => r.kind === 'tools')!;
  assert2.equal(tools.kind, 'tools');
  const usage = rows.find((r) => r.kind === 'usage') as { line: string };
  assert2.match(usage.line, /stub\/m1 · 120ms/);
  assert2.match(usage.line, /10→5 tok/);
  assert2.match(usage.line, /2 模型\/2 工具/);
});

test('proposalLine: risk level and auto-approve disclosure; failed result shown', () => {
  const line = chatCore.proposalLine(proposal({ riskLevel: 'high' }));
  assert2.match(line, /启动研究/);
  assert2.match(line, /待决定/);
  assert2.match(line, /高风险/);
  const auto = chatCore.proposalLine(proposal({ status: 'executed', autoApproved: true }));
  assert2.match(auto, /已执行/);
  assert2.match(auto, /按记忆自动执行/);
  const failed = chatCore.proposalLine(proposal({ status: 'failed', result: '路由不可用' }));
  assert2.match(failed, /执行失败 — 路由不可用/);
});

test('pendingProposals: only pending surface, oldest first; conversationMeta counts', () => {
  const c = conv([
    msg({ id: 'cmsg_a', proposals: [proposal({ id: 'act_1', status: 'executed' })] }),
    msg({ id: 'cmsg_b', proposals: [proposal({ id: 'act_2' }), proposal({ id: 'act_3' })] }),
  ]);
  const pending = chatCore.pendingProposals(c);
  assert2.deepEqual(pending.map((p) => p.id), ['act_2', 'act_3']);
  assert2.match(chatCore.conversationMeta(conv([])), /0 轮 · 进行中/);
  const withRuns = { ...conv([]), runIds: ['run_a', 'run_b'] };
  assert2.match(chatCore.conversationMeta(withRuns), /已启动 2 项研究/);
});

test('proposalDecision: y/a/n vocabulary; everything else is not a decision', () => {
  assert2.deepEqual(chatCore.proposalDecision('y'), { approve: true, remember: false });
  assert2.deepEqual(chatCore.proposalDecision('a'), { approve: true, remember: true });
  assert2.deepEqual(chatCore.proposalDecision('n'), { approve: false, remember: false });
  assert2.equal(chatCore.proposalDecision('q'), null);
  assert2.equal(chatCore.proposalDecision(''), null);
  assert2.deepEqual(chatCore.proposalDecision(' Y '), { approve: true, remember: false });
});

// ---------------------------------------------------------------------------
// slash commands

test('parseSlash: recognized commands and aliases', () => {
  assert2.deepEqual(parseSlash('/refresh'), { kind: 'refresh' });
  assert2.deepEqual(parseSlash('/r'), { kind: 'refresh' });
  assert2.deepEqual(parseSlash('/open run_abc'), { kind: 'open', target: 'run_abc' });
  assert2.deepEqual(parseSlash('/open conv_xyz'), { kind: 'open', target: 'conv_xyz' });
  assert2.deepEqual(parseSlash('/new 我的课题'), { kind: 'new-conversation', title: '我的课题' });
  assert2.deepEqual(parseSlash('/new'), { kind: 'new-conversation' });
  assert2.deepEqual(parseSlash('/back'), { kind: 'back' });
  assert2.deepEqual(parseSlash('/quit'), { kind: 'quit' });
  assert2.deepEqual(parseSlash('/help'), { kind: 'help' });
});

test('parseSlash: non-slash input is null (plain composer text); malformed ids are unknown', () => {
  assert2.equal(parseSlash('普通消息'), null);
  assert2.deepEqual(parseSlash('/open not-an-id'), { kind: 'unknown', name: '/open not-an-id' });
  assert2.deepEqual(parseSlash('/explode'), { kind: 'unknown', name: '/explode' });
  assert2.match(SLASH_HELP, /\/open/);
});

// ---------------------------------------------------------------------------
// persistent client state

test('state: roundtrip, merge-write, corrupt fallback, clear', () => {
  const file = `${process.env.TEMP ?? '/tmp'}/farlab-tui-test-${process.pid}.json`;
  clearState(file);
  assert2.deepEqual(loadState(file), {});
  saveState({ lastView: 'conversations', lastConversationId: 'conv_1' }, file);
  assert2.deepEqual(loadState(file), { lastView: 'conversations', lastConversationId: 'conv_1' });
  saveState({ lastRunId: 'run_9' }, file); // merge, not replace
  assert2.deepEqual(loadState(file), { lastView: 'conversations', lastConversationId: 'conv_1', lastRunId: 'run_9' });
  // corrupt file degrades to defaults
  fs.writeFileSync(file, '{not json');
  assert2.deepEqual(loadState(file), {});
  // non-object payload degrades too
  fs.writeFileSync(file, '"just a string"');
  assert2.deepEqual(loadState(file), {});
  clearState(file);
});
