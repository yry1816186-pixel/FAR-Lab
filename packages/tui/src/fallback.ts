/**
 * Line-mode fallback (v3): when raw mode is unavailable (mintty/Git Bash,
 * piped stdin), the same workspaces degrade to a numbered-menu readline loop.
 * Parity with the Ink path: runs list + LIVE watch (poll the event endpoint —
 * no raw mode needed for observation), run actions (cancel/resume/fork),
 * conversations list, chat posting, and proposal approvals — the same real
 * HTTP surface the full-screen UI uses.
 */
import {
  cancelRun, createConversation, forkRun, getConversation, getEvents, getRun,
  listConversations, listRuns, postConversationMessage, resolveProposal, resumeRun,
  type Conversation, type RunEvent,
} from './api.ts';
import { ask, closeAsk } from './ask.ts';
import { relTime, stageLabel } from './narrative.ts';
import { resolveLang, type Lang } from './i18n.ts';
import { decide, VOCAB_FOOTER } from './approveCore.ts';
import * as chatCore from './chatCore.ts';
import type { ChatRow } from './chatCore.ts';
import { readSeedFile } from './seedAttach.ts';

const ACTIVE = new Set(['created', 'queued', 'running', 'paused']);
const WATCH_TICK_MS = 2_000;
const WATCH_MAX_MS = 10 * 60_000;
const LANG: Lang = resolveLang();

const rowText = (row: ChatRow): string => {
  switch (row.kind) {
    case 'turn': return `${row.label}: ${row.text.slice(0, 160)}${row.failed === true ? '  [未获回复]' : ''}`;
    case 'tools': return `  工具 ${row.tools.map((t) => `${t.tool}${t.ok ? '✓' : '✗'}`).join(' · ')}`;
    case 'proposal': return `  ▸ ${chatCore.proposalLine(row.proposal)}`;
    case 'candidates': return row.items.map((c, i) => `  候选 ${i + 1}. ${c.text.slice(0, 100)}`).join('\n');
    case 'usage': return `  ${row.line}`;
    case 'error': return `  ✗ 回复失败: ${row.text.slice(0, 120)}`;
  }
};

const printConversation = (conv: Conversation): void => {
  const rows = chatCore.conversationRows(conv, 12);
  if (rows.length === 0) { console.log('（暂无消息）'); return; }
  for (const r of rows) console.log(rowText(r));
};

const approvePending = async (conv: Conversation): Promise<Conversation> => {
  let current = conv;
  for (;;) {
    const pending = chatCore.pendingProposals(current);
    if (pending.length === 0) return current;
    const p = pending[0]!;
    console.log(`\n待审批: ${chatCore.proposalLine(p)}`);
    if (p.argSummary !== undefined) {
      console.log(`  ${Object.entries(p.argSummary).map(([k, v]) => `${k}=${v}`).join(' · ').slice(0, 120)}`);
    }
    const answer = await ask(`批准？(${chatCore.PROPOSAL_FOOTER}) > `);
    const d = chatCore.proposalDecision(answer);
    if (d === null) { console.log('跳过（y/a/n 有效）'); continue; }
    try {
      current = await resolveProposal(current.id, p.id, d.approve, d.remember);
      console.log(d.approve ? '✓ 已批准' : '✗ 已拒绝');
    } catch (e) {
      console.log(`审批失败: ${e instanceof Error ? e.message : String(e)}`);
      return current;
    }
  }
};

const watchRun = async (runId: string): Promise<void> => {
  console.log(`\n实时观察 ${runId}（每 ${WATCH_TICK_MS / 1000}s 轮询，至终态或 ${WATCH_MAX_MS / 60_000} 分钟 — Ctrl-C 退出）`);
  const startedAt = Date.now();
  let cursor = 0;
  const seen = new Map<string, string>();
  for (;;) {
    let events: RunEvent[];
    try {
      events = await getEvents(runId);
    } catch (e) {
      console.log(`事件读取失败: ${e instanceof Error ? e.message : String(e)} — 继续重试`);
      await new Promise((r) => setTimeout(r, WATCH_TICK_MS));
      continue;
    }
    for (const e of events) {
      if (e.seq <= cursor || e.stage === undefined) continue;
      cursor = e.seq;
      const line = `${STAGE_ICON_FOR(e.type)} ${stageLabel(String(e.stage), LANG)}${typeof e.detail?.summary === 'string' ? ` — ${String(e.detail.summary).slice(0, 60)}` : ''}`;
      if (seen.get(e.stage) !== line) { console.log(`  ${line}`); seen.set(e.stage, line); }
    }
    let status = '';
    try {
      status = (await getRun(runId)).status;
    } catch { /* transient poll failure: keep watching */ }
    if (!ACTIVE.has(status)) { console.log(`终态: ${status}`); return; }
    if (Date.now() - startedAt > WATCH_MAX_MS) { console.log('观察时限已到（run 仍在进行）'); return; }
    await new Promise((r) => setTimeout(r, WATCH_TICK_MS));
  }
};

const STAGE_ICON_FOR = (type: string): string =>
  type === 'stage_done' ? '✓' : type === 'stage_failed' ? '✗' : type === 'stage_skipped' ? '–' : '●';

const chatSession = async (convId: string): Promise<void> => {
  for (;;) {
    let conv: Conversation;
    try {
      conv = await getConversation(convId);
    } catch (e) {
      console.log(`对话读取失败: ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    console.log(`\n—— 对话 · ${conv.title}（${chatCore.conversationMeta(conv)}）——`);
    printConversation(conv);
    await approvePending(conv);
    // Optional file attachment for the next message (text-only seed).
    let seed: ReturnType<typeof readSeedFile> | undefined;
    const attachPath = (await ask('附件路径（文本文件，Enter 跳过）: ')).trim();
    if (attachPath.length > 0) {
      try {
        seed = readSeedFile(attachPath);
        console.log(`📎 附件就绪: ${seed.title}（${seed.text.length} 字）`);
      } catch (e) {
        console.log(`附件读取失败: ${e instanceof Error ? e.message : String(e)}（继续无附件）`);
      }
    }
    const text = (await ask('发送消息（Enter 返回列表）: ')).trim();
    if (text.length === 0) return;
    try {
      const updated = await postConversationMessage(convId, text, { seeds: seed !== undefined ? [seed] : undefined });
      console.log('✓ 已发送');
      printConversation(updated);
      await approvePending(updated);
    } catch (e) {
      console.log(`发送失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
};

const runActions = async (runId: string): Promise<void> => {
  const answer = (await ask('操作: c 取消 · r 恢复 · f 分叉 · Enter 返回 > ')).trim().toLowerCase();
  try {
    if (answer === 'c') {
      await cancelRun(runId);
      console.log('✓ 已请求取消（在阶段操作间生效）');
    } else if (answer === 'r') {
      await resumeRun(runId);
      console.log('✓ 已从检查点恢复执行');
    } else if (answer === 'f') {
      const forked = await forkRun(runId);
      console.log(`✓ 已分叉 → ${forked.runId}`);
    }
  } catch (e) {
    console.log(`操作失败: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export async function runReadline(): Promise<void> {
  const say = (s: string): void => { console.log(s); };
  try {
    say('FAR-Lab · 行式模式（终端不支持全屏 — 与全屏版同一 HTTP 面）');
    say('研究问题输入（就绪即止，no-live-API 纪律）');
    const question = (await ask('研究问题（单行；Enter 跳过）: ')).trim();
    if (question.length > 0) {
      say(`提交确认：${question.slice(0, 120)}`);
      say(`y 确认就绪 · n 放弃    （${VOCAB_FOOTER}）`);
      const answer = await ask('> ');
      const d = decide(answer, { allowAlways: false, allowSession: false });
      if (d === 'approved') say('✓ 问题已就绪——真实提交按 no-live-API 纪律禁用（与 Web 同纪律，就绪即止）');
      else say('已放弃输入');
    }

    for (;;) {
      say('\n[1] 研究列表  [2] 对话  [q] 退出');
      const menu = (await ask('> ')).trim().toLowerCase();
      if (menu === 'q' || menu === '') return;

      if (menu === '1') {
        const runs = await listRuns();
        if (runs.length === 0) { say('暂无研究'); continue; }
        runs.slice(0, 30).forEach((r, i) => {
          say(`${String(i + 1).padStart(2)}. ${(r.questionText ?? r.id).slice(0, 80)}`);
        });
        const answer = (await ask('输入编号实时观察（q 返回）: ')).trim();
        if (answer === 'q') continue;
        const idx = Number.parseInt(answer, 10);
        if (Number.isNaN(idx) || idx < 1 || idx > Math.min(runs.length, 30)) continue;
        const run = runs[idx - 1]!;
        say(`\n${(run.questionText ?? run.id).slice(0, 100)} · ${run.status} · ${relTime(run.createdAt, LANG)}`);
        await watchRun(run.id);
        await runActions(run.id);
        continue;
      }

      if (menu === '2') {
        const convs = await listConversations();
        if (convs.length === 0) {
          const create = (await ask('暂无对话 — n 新建（其他键返回）: ')).trim().toLowerCase();
          if (create === 'n') {
            const conv = await createConversation();
            say(`✓ 已创建 ${conv.id}`);
            await chatSession(conv.id);
          }
          continue;
        }
        convs.slice(0, 30).forEach((c, i) => {
          say(`${String(i + 1).padStart(2)}. ${c.title.slice(0, 70)} — ${chatCore.conversationMeta(c)} · ${relTime(c.updatedAt, LANG)}`);
        });
        const answer = (await ask('输入编号打开对话（n 新建 · q 返回）: ')).trim().toLowerCase();
        if (answer === 'q') continue;
        if (answer === 'n') {
          const conv = await createConversation();
          await chatSession(conv.id);
          continue;
        }
        const idx = Number.parseInt(answer, 10);
        if (Number.isNaN(idx) || idx < 1 || idx > Math.min(convs.length, 30)) continue;
        await chatSession(convs[idx - 1]!.id);
        continue;
      }

      say('无效选择（1/2/q）');
    }
  } catch (e) {
    console.error('失败：', e instanceof Error ? e.message : String(e));
  } finally {
    closeAsk();
  }
}
