/**
 * Full-screen Ink UI (v3). Written with React.createElement (h): the package
 * runs on Node's native type-stripping with zero build steps, which excludes
 * JSX syntax.
 *
 * Two workspaces (研究 / 对话), one semantics: run detail attaches LIVE to the
 * server's SSE event stream (reconnect + Last-Event-ID resume, honest
 * connection state); the conversation view is the resident-agent chat — real
 * message posting, server-computed approval cards (y/a/n), and a launch flow
 * that stops at READY unless FAR_ALLOW_LIVE=1 (2026-08-23 no-live-API
 * discipline, identical to the web walkthrough). All I/O is injected via deps
 * objects so every view is render-testable and e2e-testable without a TTY;
 * views never invent progress or states the server did not report.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Box, render, Text, useInput } from 'ink';
import * as api from './api.ts';
import type { Conversation, RunDetail, RunSummary } from './api.ts';
import { subscribeRunEvents, type LiveState, type LiveSubscription, type SubscribeOptions } from './sse.ts';
import { applyEventToStages, stageRows, stagesFromEvents } from './liveCore.ts';
import type { StageRow } from './narrative.ts';
import { relTime, STAGE_ICON, STAGE_ZH } from './narrative.ts';
import { Composer, CHAT_LABELS, LAUNCH_LABELS, type ComposerResult } from './composer.ts';
import * as chatCore from './chatCore.ts';
import { renderRows, renderSubView } from './chatViews.ts';
import * as commands from './commands.ts';
import * as sessionState from './state.ts';
import { readSeedFile, type SeedDraft } from './seedAttach.ts';

const h = React.createElement;
type El = React.ReactElement;

const STATUS_ZH: Record<string, string> = {
  completed: '已完成', running: '运行中', queued: '排队中', failed: '失败',
  partial: '部分完成', paused: '已暂停', cancelled: '已取消', created: '已创建',
};
const CONN_ZH: Record<LiveState, string> = { connecting: '连接中', live: '实时', reconnecting: '重连中' };

// ---------------------------------------------------------------------------
// deps bundles (defaults bind the real api; tests/e2e inject fakes)
// ---------------------------------------------------------------------------

export type SubViewData =
  | { kind: 'hypotheses'; items: unknown[] }
  | { kind: 'evidence'; data: { claims: unknown[]; relations: unknown[] } }
  | { kind: 'lineage'; graph: api.LineageGraph };

export interface DetailDeps {
  fetchInitial(runId: string): Promise<{ run: RunDetail; events: api.RunEvent[] }>;
  subscribe(opts: SubscribeOptions): LiveSubscription;
  cancel(runId: string): Promise<void>;
  resume(runId: string): Promise<void>;
  fork(runId: string): Promise<string>;
  hypotheses(runId: string): Promise<unknown[]>;
  evidence(runId: string): Promise<{ claims: unknown[]; relations: unknown[] }>;
  lineage(runId: string): Promise<api.LineageGraph>;
  report(runId: string): Promise<string | null>;
  writeReport(runId: string, content: string): Promise<string>;
}

export interface ChatDeps {
  post(conversationId: string, text: string, opts?: { seeds?: SeedDraft[] }): Promise<Conversation>;
  resolve(conversationId: string, proposalId: string, approve: boolean, remember: boolean): Promise<Conversation>;
  launch(conversationId: string, text: string): Promise<{ runId: string }>;
}

export interface AppDeps {
  listRuns(signal?: AbortSignal): Promise<RunSummary[]>;
  listConversations(signal?: AbortSignal): Promise<Conversation[]>;
  getConversation(id: string): Promise<Conversation>;
  createConversation(title?: string): Promise<Conversation>;
  detail: DetailDeps;
  chat: ChatDeps;
}

export const defaultDetailDeps = (): DetailDeps => ({
  fetchInitial: async (runId) => ({ run: await api.getRun(runId), events: await api.getEvents(runId) }),
  subscribe: (opts) => subscribeRunEvents(opts),
  cancel: (runId) => api.cancelRun(runId).then(() => undefined),
  resume: (runId) => api.resumeRun(runId).then(() => undefined),
  fork: async (runId) => (await api.forkRun(runId)).runId,
  hypotheses: (runId) => api.getHypotheses(runId),
  evidence: (runId) => api.getEvidence(runId),
  lineage: (runId) => api.getLineage(runId),
  report: (runId) => api.getReport(runId),
  writeReport: async (runId, content) => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.join(process.cwd(), 'far-tui-exports');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${runId}.report.md`);
    fs.writeFileSync(file, content);
    return file;
  },
});

export const defaultAppDeps = (): AppDeps => ({
  listRuns: (signal) => api.listRuns(signal),
  listConversations: (signal) => api.listConversations(signal),
  getConversation: (id) => api.getConversation(id),
  createConversation: (title) => api.createConversation(title),
  detail: defaultDetailDeps(),
  chat: {
    post: (id, text, opts) => api.postConversationMessage(id, text, opts),
    resolve: (id, pid, approve, remember) => api.resolveProposal(id, pid, approve, remember),
    launch: (id, text) => api.launchFromConversation(id, text),
  },
});

// ---------------------------------------------------------------------------
// RunDetail live view
// ---------------------------------------------------------------------------

export function RunDetailView(props: {
  run: RunSummary;
  deps: DetailDeps;
  live: boolean;
  injectedEvents?: api.RunEvent[];
  onBack: () => void;
  onNote: (note: string) => void;
  onForked: (newRunId: string) => void;
}): El {
  const { deps, live } = props;
  const [rowsMap, setRowsMap] = useState<Map<string, StageRow>>(
    () => (props.injectedEvents !== undefined ? stagesFromEvents(props.injectedEvents) : new Map()),
  );
  const [run, setRun] = useState<RunDetail>({ ...props.run });
  const [conn, setConn] = useState<LiveState | null>(live ? 'connecting' : null);
  const [confirm, setConfirm] = useState<'cancel' | 'resume' | 'fork' | null>(null);
  const [busy, setBusy] = useState(false);
  const [sub, setSub] = useState<SubViewData | null>(null);
  const [subError, setSubError] = useState<string | null>(null);

  useEffect(() => {
    if (!live) return;
    let closed = false;
    let subscription: LiveSubscription | undefined;
    const abort = new AbortController();
    void deps.fetchInitial(props.run.id).then(({ run: r, events }) => {
      if (closed) return;
      setRun(r);
      setRowsMap(stagesFromEvents(events));
      subscription = deps.subscribe({
        runId: props.run.id,
        fromSeq: events.length > 0 ? events[events.length - 1]!.seq : 0,
        signal: abort.signal,
        onEvent: (e) => setRowsMap((m) => applyEventToStages(m, e)),
        onState: (s) => setConn(s),
      });
    }).catch((e: unknown) => {
      if (!closed) { setConn('reconnecting'); props.onNote(`加载失败: ${e instanceof Error ? e.message : String(e)}`); }
    });
    // Status/lease refresh: the stream carries stage truth; run status/lease
    // comes from the run object — poll gently while the view is open.
    const poll = setInterval(() => {
      void deps.fetchInitial(props.run.id).then(({ run: r }) => { if (!closed) setRun(r); }).catch(() => { /* transient */ });
    }, 5_000);
    return () => {
      closed = true;
      abort.abort();
      subscription?.close();
      clearInterval(poll);
    };
  }, [deps, live, props.run.id]);

  const doCancel = (): void => {
    setBusy(true);
    deps.cancel(props.run.id)
      .then(() => props.onNote('已请求取消（在阶段操作间生效）'))
      .catch((e: unknown) => props.onNote(`取消失败: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => { setBusy(false); setConfirm(null); });
  };
  const doResume = (): void => {
    setBusy(true);
    deps.resume(props.run.id)
      .then(() => props.onNote('已从检查点恢复执行（观察实时视图）'))
      .catch((e: unknown) => props.onNote(`恢复失败: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => { setBusy(false); setConfirm(null); });
  };
  const doFork = (): void => {
    setBusy(true);
    deps.fork(props.run.id)
      .then((id) => props.onForked(id))
      .catch((e: unknown) => props.onNote(`分叉失败: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => { setBusy(false); setConfirm(null); });
  };

  const loadSub = (kind: 'hypotheses' | 'evidence' | 'lineage'): void => {
    setSubError(null);
    const p = kind === 'hypotheses' ? deps.hypotheses(props.run.id).then((items): SubViewData => ({ kind, items }))
      : kind === 'evidence' ? deps.evidence(props.run.id).then((data): SubViewData => ({ kind, data }))
        : deps.lineage(props.run.id).then((graph): SubViewData => ({ kind, graph }));
    void p.then(setSub).catch((e: unknown) => setSubError(e instanceof Error ? e.message : String(e)));
  };

  useInput((input, key) => {
    if (confirm !== null) {
      if (input === 'y' || key.return) {
        if (confirm === 'cancel') doCancel();
        else if (confirm === 'resume') doResume();
        else doFork();
      } else if (input === 'n' || key.escape) setConfirm(null);
      return;
    }
    if (sub !== null) {
      if (input === 'q' || key.escape) setSub(null);
      return;
    }
    if (input === 'q' || key.escape) { props.onBack(); return; }
    if (busy) return;
    if (input === 'c') setConfirm('cancel');
    else if (input === 'r') setConfirm('resume');
    else if (input === 'f') setConfirm('fork');
    else if (input === 'h') loadSub('hypotheses');
    else if (input === 'e') loadSub('evidence');
    else if (input === 'l') loadSub('lineage');
    else if (input === 'x') {
      setBusy(true);
      void deps.report(props.run.id)
        .then((content) => content === null
          ? props.onNote('尚无导出报告（先完成导出阶段）')
          : deps.writeReport(props.run.id, content).then((f) => props.onNote(`报告已写出: ${f}`)))
        .catch((e: unknown) => props.onNote(`导出失败: ${e instanceof Error ? e.message : String(e)}`))
        .finally(() => setBusy(false));
    }
  });

  const rows = stageRows(rowsMap);
  const statusText = STATUS_ZH[run.status] ?? run.status;
  const frozen = run.status === 'running' && run.lease?.live === false;

  return h(Box, { flexDirection: 'column' },
    h(Text, { bold: true, color: 'cyan' }, (props.run.questionText ?? props.run.id).slice(0, 100)),
    h(Text, { dimColor: true },
      `${statusText}${frozen ? ' · [已冻结 — r 恢复]' : ''} · ${props.run.id}`
      + `${conn !== null ? ` · ${CONN_ZH[conn]}` : ''} · q 返回`),
    subError !== null ? h(Text, { color: 'red' }, `读取失败: ${subError}`) : null,
    sub !== null
      ? renderSubView(sub)
      : h(Box, { flexDirection: 'column' },
        rows.length === 0 ? h(Text, { dimColor: true }, '（暂无阶段事件）') : null,
        rows.map((s) => h(Box, { key: s.stage, paddingLeft: 1 },
          h(Text, { color: s.status === 'done' ? 'green' : s.status === 'failed' ? 'red' : s.status === 'started' ? 'blue' : 'gray' }, STAGE_ICON[s.status]),
          h(Text, null, ` ${STAGE_ZH[s.stage] ?? s.stage} `),
          s.summary !== undefined ? h(Text, { dimColor: true, wrap: 'truncate' }, s.summary.slice(0, 60)) : null,
        )),
      ),
    confirm !== null
      ? h(Box, { flexDirection: 'column', marginTop: 1 },
        h(Text, { bold: true, color: 'yellow' },
          confirm === 'cancel' ? '请求取消该研究？' : confirm === 'resume' ? '从检查点恢复执行？' : '分叉该研究（另一方向）？'),
        h(Text, { dimColor: true }, 'y 确认 · n 取消'),
      )
      : sub === null
        ? h(Text, { dimColor: true }, 'c 取消 · r 恢复 · f 分叉 · h 假设 · e 证据 · l 谱系 · x 导出报告 · q 返回')
        : h(Text, { dimColor: true }, 'q/Esc 关闭子视图'),
  );
}

// ---------------------------------------------------------------------------
// Chat view (resident agent)
// ---------------------------------------------------------------------------

export function ChatView(props: {
  initial: Conversation;
  deps: ChatDeps;
  onBack: () => void;
  onNote: (note: string) => void;
  onLaunched: (runId: string) => void;
}): El {
  const [conv, setConv] = useState(props.initial);
  const [composing, setComposing] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [busy, setBusy] = useState(false);
  // File attachment: `s` opens a one-line path input; the read draft rides
  // the NEXT posted message as a conversation seed (text-only, ≤50k chars).
  const [seedPath, setSeedPath] = useState<string | null>(null);
  const [seed, setSeed] = useState<SeedDraft | null>(null);
  const pending = chatCore.pendingProposals(conv);

  useInput((input, key) => {
    if (composing || launching || busy) return; // Composer owns input
    if (seedPath !== null) {
      // One-line path input (same editing contract as the slash line).
      if (key.return) {
        const p = seedPath;
        setSeedPath(null);
        if (p.trim().length === 0) return;
        try {
          setSeed(readSeedFile(p));
        } catch (e) {
          props.onNote(`附件读取失败: ${e instanceof Error ? e.message : String(e)}`);
        }
        return;
      }
      if (key.escape) { setSeedPath(null); return; }
      if (key.backspace || key.delete) { setSeedPath((t) => t.slice(0, -1)); return; }
      if (input.length > 0 && !key.ctrl && !key.meta) setSeedPath((t) => t + input);
      return;
    }
    if (input === 'q' && seed !== null) { setSeed(null); props.onNote('已移除附件'); return; }
    if (input === 'q' || key.escape) { props.onBack(); return; }
    if (input === 's') { setSeedPath(''); return; }
    // Approval focus: while a proposal is pending, y/a/n belong to the decision
    // (Aider-style vocabulary); message composing moves to m for that span.
    if (pending.length > 0) {
      const d = chatCore.proposalDecision(input);
      if (d !== null) {
        const p = pending[0]!;
        setBusy(true);
        void props.deps.resolve(conv.id, p.id, d.approve, d.remember)
          .then(setConv)
          .catch((e: unknown) => props.onNote(`审批失败: ${e instanceof Error ? e.message : String(e)}`))
          .finally(() => setBusy(false));
        return;
      }
      if (input === 'm') { setComposing(true); return; }
      return;
    }
    if (input === 'n' || input === 'm') { setComposing(true); return; }
    if (input === 'l') { setLaunching(true); return; }
  });

  const onComposed = (r: ComposerResult): void => {
    setComposing(false);
    if (r.action !== 'submitted-ready') return;
    const attached = seed;
    setSeed(null);
    setBusy(true);
    void props.deps.post(conv.id, r.question, { seeds: attached !== null ? [attached] : undefined })
      .then(setConv)
      .catch((e: unknown) => props.onNote(`发送失败: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setBusy(false));
  };

  const onLaunchComposed = (r: ComposerResult): void => {
    setLaunching(false);
    if (r.action !== 'submitted-ready') return;
    if (process.env.FAR_ALLOW_LIVE !== '1') {
      props.onNote(`研究问题已就绪（${r.question.length} 字）——真实启动按 no-live-API 纪律禁用（FAR_ALLOW_LIVE=1 解锁）`);
      return;
    }
    setBusy(true);
    void props.deps.launch(conv.id, r.question)
      .then(({ runId }) => props.onLaunched(runId))
      .catch((e: unknown) => props.onNote(`启动失败: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setBusy(false));
  };

  const firstPending = pending[0];

  return h(Box, { flexDirection: 'column' },
    h(Box, { borderStyle: 'round', flexDirection: 'column', paddingX: 1 },
      h(Text, { bold: true }, `对话 · ${conv.title.slice(0, 60)}`),
      h(Text, { dimColor: true }, `${chatCore.conversationMeta(conv)} · ${relTime(conv.updatedAt)} · q 返回`),
    ),
    h(Box, { flexDirection: 'column', paddingX: 1 }, renderRows(chatCore.conversationRows(conv, 40))),
    pending.length > 0
      ? h(Box, { flexDirection: 'column', borderStyle: 'round', paddingX: 1 },
        h(Text, { bold: true, color: 'yellow' }, `待审批 (${pending.length})`),
        ...pending.slice(0, 3).map((p) => h(Text, { key: p.id }, chatCore.proposalLine(p))),
        firstPending !== undefined && firstPending.argSummary !== undefined
          ? h(Text, { dimColor: true },
            Object.entries(firstPending.argSummary).map(([k, v]) => `${k}=${v}`).join(' · ').slice(0, 100))
          : null,
        h(Text, { dimColor: true }, busy ? '处理中…' : chatCore.PROPOSAL_FOOTER),
      )
      : null,
    busy && !composing && !launching ? h(Text, { dimColor: true }, '等待服务端…') : null,
    seedPath !== null
      ? h(Box, { flexDirection: 'column' },
        h(Text, { color: 'cyan' }, `📎 附件路径: ${seedPath}█`),
        h(Text, { dimColor: true }, 'Enter 附上 · Esc 取消（文本/Markdown，≤50000 字符，随下一条消息发送）'))
      : seed !== null
        ? h(Text, { color: 'green' }, `📎 附件就绪: ${seed.title}（${seed.text.length} 字）· 随下一条消息发送 · q 移除`)
        : null,
    composing
      ? h(Box, { flexDirection: 'column' },
        h(Text, { dimColor: true }, CHAT_LABELS.header),
        h(Composer, { onDone: onComposed, labels: CHAT_LABELS }))
      : launching
        ? h(Box, { flexDirection: 'column' },
          h(Text, { dimColor: true }, LAUNCH_LABELS.header),
          h(Composer, { onDone: onLaunchComposed, labels: LAUNCH_LABELS }))
        : h(Text, { dimColor: true },
          `${pending.length > 0 ? 'y/a/n 处理最上面的提案 · m 写消息 · ' : 'n 写消息 · '}s 附文件 · l 凝结问题并启动研究 · q 返回`),
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

type View =
  | { kind: 'list' }
  | { kind: 'detail'; run: RunSummary }
  | { kind: 'chat'; conv: Conversation };

export function App(props: {
  initialRuns?: RunSummary[];
  initialEvents?: api.RunEvent[];
  initialConversations?: Conversation[];
  deps?: AppDeps;
  noRestore?: boolean;
} = {}): El {
  // Stable deps identity: RunDetailView's live effect keys on it.
  const deps = useMemo(() => props.deps ?? defaultAppDeps(), [props.deps]);
  const injected = props.initialRuns !== undefined || props.initialConversations !== undefined;
  const [tab, setTab] = useState<'runs' | 'conversations'>('runs');
  const [view, setView] = useState<View>({ kind: 'list' });
  const [runs, setRuns] = useState<RunSummary[] | null>(props.initialRuns ?? null);
  const [convs, setConversations] = useState<Conversation[] | null>(props.initialConversations ?? null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [convCursor, setConvCursor] = useState(0);
  const [composing, setComposing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [slash, setSlash] = useState(false);
  const [slashText, setSlashText] = useState('');

  const refresh = (): void => {
    void deps.listRuns().then((r) => { setRuns(r); setError(null); }).catch((e: unknown) => setError(String(e)));
    void deps.listConversations().then((r) => setConversations(r)).catch(() => { /* runs tab stays usable */ });
  };

  useEffect(() => {
    if (injected) return;
    refresh();
    if (props.noRestore === true) return;
    // Session restore: reopen the last conversation when it still exists.
    const st = sessionState.loadState();
    if (st.lastView === 'conversations') setTab('conversations');
    if (st.lastConversationId !== undefined) {
      void deps.getConversation(st.lastConversationId)
        .then((conv) => { setView({ kind: 'chat', conv }); setNote('已恢复上次对话 · q 返回列表'); })
        .catch(() => { /* gone: stay on the list */ });
    }
  }, []);

  const openDetail = (run: RunSummary): void => {
    setView({ kind: 'detail', run });
    sessionState.saveState({ lastView: 'runs', lastRunId: run.id });
  };

  const applySlash = (cmdText: string): void => {
    setSlash(false);
    setSlashText('');
    const cmd = commands.parseSlash(cmdText);
    if (cmd === null) return;
    if (cmd.kind === 'unknown') { setNote(`未知命令: ${cmd.name} — /help 查看`); return; }
    if (cmd.kind === 'refresh') { refresh(); setNote('已刷新'); return; }
    if (cmd.kind === 'quit') { process.exit(0); return; }
    if (cmd.kind === 'help') { setNote(commands.SLASH_HELP); return; }
    if (cmd.kind === 'open') {
      const target = cmd.target;
      if (target.startsWith('run_')) {
        const summary = (runs ?? []).find((r) => r.id === target);
        setView({
          kind: 'detail',
          run: summary ?? { id: target, status: 'unknown', currentStage: '', createdAt: new Date().toISOString() },
        });
      } else {
        void deps.getConversation(target)
          .then((conv) => { setView({ kind: 'chat', conv }); setTab('conversations'); })
          .catch((e: unknown) => setNote(`打开失败: ${e instanceof Error ? e.message : String(e)}`));
      }
      return;
    }
    if (cmd.kind === 'new-conversation') {
      void deps.createConversation(cmd.title)
        .then((conv) => { setConversations((prev) => [conv, ...(prev ?? [])]); setView({ kind: 'chat', conv }); setTab('conversations'); })
        .catch((e: unknown) => setNote(`新建失败: ${e instanceof Error ? e.message : String(e)}`));
      return;
    }
    if (cmd.kind === 'back') { setView({ kind: 'list' }); return; }
  };

  useInput((input, key) => {
    if (view.kind === 'detail' || view.kind === 'chat') return; // sub-views own input
    if (slash) {
      if (key.return) { applySlash(slashText); return; }
      if (key.escape) { setSlash(false); setSlashText(''); return; }
      if (key.backspace || key.delete) { setSlashText((t) => t.slice(0, -1)); return; }
      if (input.length > 0 && !key.ctrl && !key.meta) setSlashText((t) => t + input);
      return;
    }
    if (composing) return; // Composer owns input
    if (key.tab) { setTab((t) => (t === 'runs' ? 'conversations' : 'runs')); return; }
    if (input === '/') { setSlash(true); setSlashText(''); return; }
    if (input === '1') { setTab('runs'); return; }
    if (input === '2') { setTab('conversations'); return; }
    if (tab === 'runs') {
      if (runs === null || runs.length === 0) {
        if (input === 'q') process.exit(0);
        return;
      }
      if (key.upArrow || input === 'k') setCursor((c) => Math.max(0, c - 1));
      else if (key.downArrow || input === 'j') setCursor((c) => Math.min(runs.length - 1, c + 1));
      else if (key.return) openDetail(runs[cursor]!);
      else if (input === 'q') process.exit(0);
      else if (input === 'n') { setComposing(true); setNote(null); }
    } else {
      if (input === 'n') {
        void deps.createConversation()
          .then((conv) => { setConversations((prev) => [conv, ...(prev ?? [])]); setView({ kind: 'chat', conv }); })
          .catch((e: unknown) => setNote(`新建失败: ${e instanceof Error ? e.message : String(e)}`));
        return;
      }
      if (convs === null || convs.length === 0) {
        if (input === 'q') process.exit(0);
        return;
      }
      if (key.upArrow || input === 'k') setConvCursor((c) => Math.max(0, c - 1));
      else if (key.downArrow || input === 'j') setConvCursor((c) => Math.min(convs.length - 1, c + 1));
      else if (key.return) {
        const conv = convs[convCursor]!;
        setView({ kind: 'chat', conv });
        sessionState.saveState({ lastView: 'conversations', lastConversationId: conv.id });
      } else if (input === 'q') process.exit(0);
    }
  });

  const onQuestionComposed = (r: ComposerResult): void => {
    setComposing(false);
    setNote(r.action === 'submitted-ready'
      ? `问题已就绪（${r.question.length} 字）——真实提交按 no-live-API 纪律禁用`
      : '已取消输入');
  };

  const rows: El[] = [];
  if (error !== null) rows.push(h(Text, { key: 'err', color: 'red' }, `连接失败：${error}`));
  if (tab === 'runs' && view.kind === 'list') {
    if (runs === null && error === null) rows.push(h(Text, { key: 'ld', dimColor: true }, '正在加载研究列表…'));
    if (runs !== null && runs.length === 0) rows.push(h(Text, { key: 'empty', dimColor: true }, '暂无研究'));
    runs?.forEach((r, i) => {
      rows.push(h(Box, { key: r.id },
        h(Text, { color: i === cursor ? 'cyan' : undefined }, `${i === cursor ? '❯ ' : '  '}${i + 1}. `),
        h(Text, { color: i === cursor ? 'cyan' : undefined, wrap: 'truncate' }, (r.questionText ?? r.id).slice(0, 72)),
        h(Text, { dimColor: true }, ` — ${STATUS_ZH[r.status] ?? r.status} · ${relTime(r.createdAt)}`),
      ));
    });
  }
  if (tab === 'conversations' && view.kind === 'list') {
    if (convs === null) rows.push(h(Text, { key: 'clc', dimColor: true }, '正在加载对话…'));
    if (convs !== null && convs.length === 0) rows.push(h(Text, { key: 'cempty', dimColor: true }, '暂无对话 — n 新建'));
    convs?.forEach((c, i) => {
      rows.push(h(Box, { key: c.id },
        h(Text, { color: i === convCursor ? 'cyan' : undefined }, `${i === convCursor ? '❯ ' : '  '}${i + 1}. `),
        h(Text, { color: i === convCursor ? 'cyan' : undefined, wrap: 'truncate' }, c.title.slice(0, 72)),
        h(Text, { dimColor: true }, ` — ${chatCore.conversationMeta(c)} · ${relTime(c.updatedAt)}`),
      ));
    });
  }

  const tabLine = ' [1] 研究 [2] 对话 ';

  return h(Box, { flexDirection: 'column', paddingX: 1 },
    view.kind === 'detail'
      ? h(RunDetailView, {
        run: view.run, deps: deps.detail, live: props.initialEvents === undefined,
        injectedEvents: props.initialEvents,
        onBack: () => setView({ kind: 'list' }),
        onNote: setNote,
        onForked: (id) => { setNote(`已分叉 → ${id}（/open ${id} 查看）`); setView({ kind: 'list' }); setTab('runs'); refresh(); },
      })
      : view.kind === 'chat'
        ? h(ChatView, {
          initial: view.conv, deps: deps.chat,
          onBack: () => { setView({ kind: 'list' }); refresh(); },
          onNote: setNote,
          onLaunched: (runId) => { setNote(`研究已启动: ${runId}`); setView({ kind: 'list' }); setTab('runs'); refresh(); },
        })
        : h(Box, { flexDirection: 'column' },
          h(Box, { borderStyle: 'round', flexDirection: 'column', paddingX: 1 },
            h(Text, { bold: true }, 'FAR-Lab · 我的研究'),
            h(Text, { dimColor: true }, composing
              ? '研究问题输入（多行/粘贴安全/IME 安全）'
              : slash
                ? '命令输入（Enter 执行 · Esc 取消 · /help 帮助）'
                : tab === 'runs'
                  ? `研究浏览器 ·${tabLine}· ↑↓/jk 选择 · Enter 查看 · n 新问题 · / 命令 · q 退出`
                  : `研究常驻对话 ·${tabLine}· ↑↓/jk 选择 · Enter 打开 · n 新对话 · / 命令 · q 退出`),
          ),
          composing
            ? h(Composer, { onDone: onQuestionComposed })
            : h(Box, { flexDirection: 'column' },
              note !== null ? h(Text, { color: 'yellow' }, note) : null,
              slash ? h(Text, { color: 'cyan' }, `❯ /${slashText}█`) : null,
              ...rows,
            ),
        ),
  );
}

export function runInk(): void {
  render(h(App), { exitOnCtrlC: true });
}
