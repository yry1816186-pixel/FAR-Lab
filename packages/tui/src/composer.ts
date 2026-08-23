/**
 * Interactive research composer (Ink). Terminal realities from Scout B:
 * Enter submits (Shift+Enter is not deliverable — Ctrl+J inserts a newline),
 * bracketed pastes insert verbatim and can never act as command keys, CJK
 * IME payloads (multi-char strings) insert as text. Submission follows the
 * same discipline as the web composer walkthrough: the confirm step builds
 * the real payload and stops at READY — the actual POST is gated behind
 * FAR_ALLOW_LIVE=1 (never fired under the 2026-08-23 no-live-API directive).
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

export function Composer({ onDone }: { onDone: (r: ComposerResult) => void }): El {
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
          h(Text, { bold: true }, '提交研究问题'),
          h(Text, { dimColor: true }, composerText(st).trim().slice(0, 200)),
          h(Text, { color: 'yellow' }, 'y 确认就绪 · n 返回编辑 · q 放弃'),
          h(Text, { dimColor: true }, `（就绪即止：真实提交被 FAR_ALLOW_LIVE 门控禁用 — no-live-API 纪律）`),
        )
      : h(Box, { marginTop: 1 },
          h(Text, { dimColor: true },
            `Enter ${ready ? '提交' : '（空）'} · Ctrl+J 换行 · 粘贴直接入文 · Esc 取消 · ${st.lines.length} 行/${composerText(st).length} 字`),
        ),
    h(Text, { dimColor: true }, VOCAB_FOOTER),
  );
}
