/**
 * Full-screen Ink UI (READ-ONLY v1). Written with React.createElement (h):
 * the package runs on Node's native type-stripping with zero build steps,
 * which excludes JSX syntax.
 */
import React, { useEffect, useState } from 'react';
import { Box, render, Text, useInput } from 'ink';
import { getEvents, listRuns, type RunSummary } from './api.ts';
import { deriveStages, relTime, STAGE_ICON, STAGE_ZH, type StageRow } from './narrative.ts';
import { Composer, type ComposerResult } from './composer.ts';

const h = React.createElement;
type El = React.ReactElement;

const STATUS_ZH: Record<string, string> = {
  completed: '已完成', running: '运行中', queued: '排队中', failed: '失败',
  partial: '部分完成', paused: '已暂停', cancelled: '已取消',
};

function App(): El {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const [detail, setDetail] = useState<{ run: RunSummary; stages: StageRow[] } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [composing, setComposing] = useState(false);
  const [composerNote, setComposerNote] = useState<string | null>(null);

  useEffect(() => {
    const c = new AbortController();
    listRuns(c.signal).then(setRuns).catch((e: unknown) => setError(String(e)));
    return () => c.abort();
  }, []);

  const openDetail = (run: RunSummary): void => {
    setLoadingDetail(true);
    getEvents(run.id)
      .then((events) => setDetail({ run, stages: deriveStages(events) }))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoadingDetail(false));
  };

  useInput((input, key) => {
    if (composing) return; // Composer owns input while active
    if (detail !== null && !loadingDetail) {
      if (input === 'q' || key.escape) setDetail(null);
      return;
    }
    if (input === 'n') { setComposing(true); setComposerNote(null); return; }
    if (runs === null || runs.length === 0) {
      if (input === 'q' || key.escape) process.exit(0);
      return;
    }
    if (key.upArrow || input === 'k') setCursor((c) => Math.max(0, c - 1));
    else if (key.downArrow || input === 'j') setCursor((c) => Math.min(runs.length - 1, c + 1));
    else if (key.return) void openDetail(runs[cursor]!);
    else if (input === 'q') process.exit(0);
  });

  const onComposed = (r: ComposerResult): void => {
    setComposing(false);
    setComposerNote(r.action === 'submitted-ready'
      ? `问题已就绪（${r.question.length} 字）——真实提交按 no-live-API 纪律禁用`
      : '已取消输入');
  };

  const rows: El[] = [];
  if (error !== null) rows.push(h(Text, { key: 'err', color: 'red' }, `连接失败：${error}`));
  if (runs === null && error === null) rows.push(h(Text, { key: 'ld', dimColor: true }, '正在加载研究列表…'));
  if (runs !== null && runs.length === 0) rows.push(h(Text, { key: 'empty', dimColor: true }, '暂无研究'));
  if (runs !== null && detail === null) {
    runs.forEach((r, i) => {
      rows.push(h(Box, { key: r.id },
        h(Text, { color: i === cursor ? 'cyan' : undefined }, `${i === cursor ? '❯ ' : '  '}${i + 1}. `),
        h(Text, { color: i === cursor ? 'cyan' : undefined, wrap: 'truncate' }, (r.questionText ?? r.id).slice(0, 72)),
        h(Text, { dimColor: true }, ` — ${STATUS_ZH[r.status] ?? r.status} · ${relTime(r.createdAt)}`),
      ));
    });
  }
  if (loadingDetail) rows.push(h(Text, { key: 'dld', dimColor: true }, '正在读取研究过程…'));
  if (detail !== null) {
    rows.push(h(Text, { key: 'dq', bold: true, color: 'cyan' }, (detail.run.questionText ?? detail.run.id).slice(0, 100)));
    rows.push(h(Text, { key: 'dm', dimColor: true }, `${STATUS_ZH[detail.run.status] ?? detail.run.status} · ${detail.run.domain ?? ''} · q 返回`));
    detail.stages.forEach((s) => {
      rows.push(h(Box, { key: s.stage, paddingLeft: 1 },
        h(Text, { color: s.status === 'done' ? 'green' : s.status === 'failed' ? 'red' : s.status === 'started' ? 'blue' : 'gray' }, STAGE_ICON[s.status]),
        h(Text, null, ` ${STAGE_ZH[s.stage] ?? s.stage} `),
        s.summary !== undefined ? h(Text, { dimColor: true, wrap: 'truncate' }, s.summary.slice(0, 60)) : null,
      ));
    });
  }

  return h(Box, { flexDirection: 'column', paddingX: 1 },
    h(Box, { borderStyle: 'round', flexDirection: 'column', paddingX: 1 },
      h(Text, { bold: true }, 'FAR-Lab · 我的研究'),
      h(Text, { dimColor: true }, composing
        ? '研究问题输入（多行/粘贴安全/IME 安全）'
        : '研究浏览器（只读 v1）· ↑↓/jk 选择 · Enter 查看 · n 新问题 · q 退出'),
    ),
    composing
      ? h(Composer, { onDone: onComposed })
      : h(Box, { flexDirection: 'column' },
          composerNote !== null ? h(Text, { color: 'yellow' }, composerNote) : null,
          ...rows,
        ),
  );
}

export function runInk(): void {
  render(h(App), { exitOnCtrlC: true });
}
