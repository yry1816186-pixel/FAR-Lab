/**
 * Slash-command parsing (pure — node:test). The TUI composer line treats
 * inputs starting with '/' as commands in list/chat contexts; everything the
 * parser recognizes becomes a typed action, anything else is an honest
 * unknown-command error string. Commands are a convenience layer over the
 * same key bindings — never a second engine.
 */
export type SlashCommand =
  | { kind: 'refresh' }
  | { kind: 'open'; target: string }
  | { kind: 'new-conversation'; title?: string }
  | { kind: 'back' }
  | { kind: 'quit' }
  | { kind: 'help' };

const ID_RE = /^(run_|conv_)[0-9a-z]+$/;

export function parseSlash(input: string): SlashCommand | { kind: 'unknown'; name: string } | null {
  const t = input.trim();
  if (!t.startsWith('/')) return null; // not a command — plain input
  const [head, ...rest] = t.slice(1).split(/\s+/);
  const arg = rest.join(' ').trim();
  switch (head) {
    case 'refresh': case 'r': return { kind: 'refresh' };
    case 'open': case 'o':
      return ID_RE.test(arg) ? { kind: 'open', target: arg } : { kind: 'unknown', name: t };
    case 'new': case 'n':
      return { kind: 'new-conversation', ...(arg.length > 0 ? { title: arg.slice(0, 120) } : {}) };
    case 'back': case 'b': return { kind: 'back' };
    case 'quit': case 'q': return { kind: 'quit' };
    case 'help': case '?': return { kind: 'help' };
    default: return { kind: 'unknown', name: t };
  }
}

export const SLASH_HELP = [
  '/refresh 重新加载列表',
  '/open <run_|conv_ 前缀 id> 直接打开',
  '/new [标题] 新建对话',
  '/back 返回上一级',
  '/quit 退出',
  '/help 显示本帮助',
].join('\n');
