/**
 * Local-file seed attachment (TUI composer's file/context reference): read a
 * plain-text/markdown file into a conversation seed that travels with the
 * NEXT message and is inherited by runs launched from the conversation.
 * Honest limits up front: text-only (no binary/PDF parsing here — that is
 * the ingest plane's job), 50k chars (the message-seed contract), readable
 * UTF-8. Every failure is a thrown Error with the actionable cause; the UI
 * surfaces it and keeps composing.
 */
import fs from 'node:fs';

export interface SeedDraft {
  title: string;
  identifiers: Array<{ kind: 'doi' | 'arxiv' | 'url'; value: string }>;
  text: string;
}

export const SEED_TEXT_MAX = 50_000;

export function readSeedFile(filePath: string): SeedDraft {
  const trimmed = filePath.trim();
  if (trimmed.length === 0) throw new Error('附件路径为空');
  let stat: fs.Stats;
  try {
    stat = fs.statSync(trimmed);
  } catch {
    throw new Error(`附件不可读: ${trimmed}（检查路径）`);
  }
  if (!stat.isFile()) throw new Error(`附件不是普通文件: ${trimmed}`);
  if (stat.size > SEED_TEXT_MAX * 4) {
    throw new Error(`附件过大（${stat.size} B > ${SEED_TEXT_MAX * 4} B 上限）— 文本类附件请 ≤ ${SEED_TEXT_MAX} 字符`);
  }
  const content = fs.readFileSync(trimmed, 'utf8');
  if (content.length > SEED_TEXT_MAX) {
    throw new Error(`附件超过 ${SEED_TEXT_MAX} 字符（实际 ${content.length}）— 请拆分或摘要后附上`);
  }
  const base = trimmed.replace(/[\\/]/g, '/').split('/').pop() ?? 'attachment';
  return { title: base, identifiers: [], text: content };
}
