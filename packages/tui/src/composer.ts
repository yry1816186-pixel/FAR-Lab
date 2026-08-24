/**
 * Interactive composer (Ink). Terminal realities from Scout B:
 * Enter submits (Shift+Enter is not deliverable — Ctrl+J inserts a newline),
 * bracketed pastes insert verbatim and can never act as command keys, CJK
 * IME payloads (multi-char strings) insert as text.
 *
 * v3: the same editor serves three flows via `labels` — the research-question
 * composer (confirm builds the payload and stops at READY: the actual POST is
 * gated behind FAR_ALLOW_LIVE=1, never fired under the 2026-08-23 no-live-API
 * directive), the chat composer (confirm sends a REAL message — a user action
 * against the user's own route, exactly like the web chat), and the
 * conversation launch composer (gated like the question composer).
 */
import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import {
  backspace, composerReady, composerText, emptyComposer, extractPaste, insertText, newline, sanitizeText,
} from './composerCore.ts';
import { decide, VOCAB_FOOTER } from './approveCore.ts';

const h = React.createElement;
type El = React.ReactElement;

export interface ComposerResult {
  action: 'submitted-ready' | 'cancelled';
  question: string;
}

export interface ComposerLabels {
  /** Border header while editing. */
  header: string;
  /** Confirm-step title. */
  confirmTitle: string;
  /** Confirm-step key line. */
  confirmKeys: string;
  /** Honest gating footer under the confirm box ('' = none). */
  confirmFooter: string;
}

export const QUESTION_LABELS: ComposerLabels = {
  header: '研究问题输入（多行/粘贴安全/IME 安全）',
  confirmTitle: '提交研究问题',
  confirmKeys: 'y 确认就绪 · n 返回编辑 · q 放弃',
  confirmFooter: '（就绪即止：真实提交被 FAR_ALLOW_LIVE 门控禁用 — no-live-API 纪律）',
};

export const CHAT_LABELS: ComposerLabels = {
  header: '对话输入（多行/粘贴安全/IME 安全）',
  confirmTitle: '发送消息',
  confirmKeys: 'y 发送 · n 返回编辑 · q 放弃',
  confirmFooter: '（发送走真实对话通道，与 Web 相同；模型线路由服务端解析）',
};

export const LAUNCH_LABELS: ComposerLabels = {
  header: '凝结研究问题（将从本对话启动一项研究）',
  confirmTitle: '启动研究',
  confirmKeys: 'y 确认就绪 · n 返回编辑 · q 放弃',
  confirmFooter: '（就绪即止：真实启动被 FAR_ALLOW_LIVE 门控禁用 — no-live-API 纪律）',
};

export function Composer({ onDone, labels = QUESTION_LABELS }: { onDone: (r: ComposerResult) => void; labels?: ComposerLabels }): El {
  const [st, setSt] = useState(emptyComposer);
  const [confirm, setConfirm] = useState(false);
  const ready = composerReady(st);

  useInput((input, key) => {
    if (confirm) {
      const d = decide(input, { allowAlways: false, allowSession: false });
      if (d === 'approved') onDone({ action: 'submitted-ready', question: composerText(st).trim() });
      else if (d === 'denied') setConfirm(false);
      else if (d === 'abort') onDone({ action: 'cancelled', question: '' });
      return;
    }
    if (key.escape) { onDone({ action: 'cancelled', question: '' }); return; }
    if (key.return) { if (ready) setConfirm(true); return; }
    if (key.ctrl && (input === 'j' || input === 'n')) { setSt((s) => newline(s)); return; }
    if (key.backspace || key.delete) { setSt((s) => backspace(s)); return; }
    const paste = extractPaste(input);
    if (paste !== null) { setSt((s) => insertText(s, sanitizeText(paste))); return; }
    const safe = sanitizeText(input);
    if (safe.length > 0 && !key.ctrl && !key.meta) setSt((s) => insertText(s, safe));
  });

  const rows: El[] = st.lines.map((line, i) =>
    h(Box, { key: i },
      h(Text, { color: i === st.row ? 'cyan' : 'gray' }, i === st.row ? '❯ ' : '  '),
      h(Text, null, line.length === 0 ? ' ' : line),
    ),
  );

  return h(Box, { flexDirection: 'column' },
    h(Box, { borderStyle: 'round', flexDirection: 'column', paddingX: 1 }, ...rows),
    confirm
      ? h(Box, { flexDirection: 'column', marginTop: 1 },
          h(Text, { bold: true }, labels.confirmTitle),
          h(Text, { dimColor: true }, composerText(st).trim().slice(0, 200)),
          h(Text, { color: 'yellow' }, labels.confirmKeys),
          labels.confirmFooter.length > 0 ? h(Text, { dimColor: true }, labels.confirmFooter) : null,
        )
      : h(Box, { marginTop: 1 },
          h(Text, { dimColor: true },
            `Enter ${ready ? '提交' : '（空）'} · Ctrl+J 换行 · 粘贴直接入文 · Esc 取消 · ${st.lines.length} 行/${composerText(st).length} 字`),
        ),
    h(Text, { dimColor: true }, VOCAB_FOOTER),
  );
}
