import os from 'node:os';
import path from 'node:path';

let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try { input = JSON.parse(raw || '{}'); } catch {}

const ti = input.tool_input || input.toolInput || {};
const command = String(ti.command ?? ti.cmd ?? ti.script ?? '');
const normalized = command.replace(/\s+/g, ' ').trim();
const cwd = path.resolve(input.cwd || process.cwd());
const home = path.resolve(os.homedir());
const parent = path.resolve(cwd, '..');

const respond = (decision, reason) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: input.hook_event_name || 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: `FAR-Lab destructive-operation guard: ${reason}. ${decision === 'ask' ? 'Require explicit confirmation for this exact destructive scope and preserve a recovery path first.' : 'Rewrite the operation so it targets only the intended recoverable resource.'}`
    }
  }));
  process.exit(0);
};

const unquote = value => value.replace(/^(['"])(.*)\1$/, '$2');
const dangerousResolvedTarget = target => {
  const t = unquote(target);
  const literal = new Set(['/', '~', '$HOME', '${HOME}', '.', './', '..', '../', '$PWD', '${PWD}']);
  if (literal.has(t)) return true;
  if (/^[A-Za-z]:[\\/]?$/.test(t)) return true;
  if (t.includes('*')) return false;
  try {
    const resolved = path.resolve(cwd, t);
    return resolved === cwd || resolved === parent || resolved === home || resolved === path.parse(resolved).root;
  } catch { return false; }
};

const rm = normalized.match(/(?:^|[;&|]\s*)(?:sudo\s+)?rm\s+([^;&|]+)/i);
if (rm) {
  const tokens = rm[1].trim().split(/\s+/).map(unquote);
  const recursive = tokens.some(x => x === '--recursive' || (/^-[^-]/.test(x) && x.toLowerCase().includes('r')));
  const force = tokens.some(x => x === '--force' || (/^-[^-]/.test(x) && x.toLowerCase().includes('f')));
  const targets = tokens.filter(x => x !== '--' && !x.startsWith('-'));
  if (recursive && force && targets.some(dangerousResolvedTarget)) respond('deny', 'recursive forced deletion targets root/home/workspace/current/parent or a drive root');
  if (recursive && force && targets.some(x => x === '*' || x === './*')) respond('ask', 'recursive forced wildcard deletion can erase broad workspace contents');
  if (recursive && force && targets.some(x => x === '.git' || x === './.git')) respond('ask', 'deleting .git destroys repository history and recovery metadata');
}

// PowerShell mirror of the rm parser: tokens are order-independent (flags may
// precede the path), so parse tokens instead of regexing positions.
const psri = normalized.match(/(?:^|[;&|]\s*)R[e]move-Item\s+([^;&|]+)/i);
if (psri) {
  const tokens = psri[1].trim().split(/\s+/).map(unquote);
  const recursive = tokens.some(x => /^-[^-]/.test(x) && x.toLowerCase().includes('r'));
  const force = tokens.some(x => /^-[^-]/.test(x) && x.toLowerCase().includes('f'));
  const targets = tokens.filter(x => x !== '--' && !x.startsWith('-'));
  if (recursive && force && targets.some(dangerousResolvedTarget)) respond('deny', 'recursive forced PowerShell deletion targets root/home/workspace/current/parent or a drive root');
  if (recursive && force && targets.some(x => x === '*' || x === './*')) respond('ask', 'recursive forced wildcard deletion can erase broad workspace contents');
}

const askRules = [
  [/\bgit\s+clean\b[^\n]*(?:-f|--force)/i, 'git clean with force can erase untracked/ignored work'],
  [/\bgit\s+reset\s+--hard\b/i, 'git reset --hard can erase uncommitted work'],
  [/\bgit\s+(?:checkout|restore)\b[^\n]*(?:--\s+)?\.\/?(?:\s|$)/i, 'bulk checkout/restore of the workspace can erase user changes'],
  [/\bgit\s+push\b[^\n]*(?:--force(?:-with-lease)?|\s-f(?:\s|$))/i, 'force pushing rewrites remote history'],
  [/\bgit\s+(?:filter-branch|filter-repo)\b/i, 'Git history rewrite requires explicit authorization'],
  [/\bgit\s+branch\s+-D\b/i, 'forced branch deletion can remove unrecovered work'],
  [/\bgit\s+stash\s+(?:clear|drop)\b/i, 'stash deletion can destroy recovery state'],
  [/\bgit\s+reflog\s+(?:expire|delete)\b/i, 'reflog deletion can remove recovery history'],
  [/\bfind\s+(?:\.|\.\/|\.\.)\b[^\n]*\s-delete\b/i, 'broad find -delete can erase workspace trees'],
  [/\bdocker\s+(?:system|volume|builder)\s+prune\b/i, 'Docker prune can remove shared images, caches or volumes'],
  [/\bdocker\s+compose\s+down\b[^\n]*\s-v(?:\s|$)/i, 'docker compose down -v removes persistent volumes'],
  [/\bterraform\s+destroy\b/i, 'terraform destroy is an externally destructive infrastructure action'],
  [/\bkubectl\s+delete\s+(?:namespace|ns)\b/i, 'deleting a Kubernetes namespace can remove many resources'],
  [/\bDROP\s+(?:DATABASE|SCHEMA)\b/i, 'database/schema drop is destructive and may be irreversible'],
  [/\bTRUNCATE\s+(?:TABLE\s+)?[A-Za-z0-9_.'"`-]+/i, 'table truncation destroys data'],
  [/\b(?:rmdir|rd)\s+\/s\s+\/q\s+(?:[A-Za-z]:[\\/]?$|\.?\.?[\\/]?$|\*|\.\*)/i, 'broad recursive forced Windows directory deletion requires exact-scope confirmation'],
  [/\bRemove-Item\b[^\n]*(?:\s(?:\.|\.\.|\*|\.\*|\$HOME|\$PWD|[A-Za-z]:[\\/]?)\s*)[^\n]*-Recurse[^\n]*-Force/i, 'broad recursive forced PowerShell deletion requires exact-scope confirmation']
];

const denyRules = [
  [/\bmkfs(?:\.[A-Za-z0-9]+)?\b/i, 'filesystem formatting is catastrophically destructive'],
  [/\bformat\s+[A-Za-z]:/i, 'drive formatting is catastrophically destructive'],
  [/\bdiskpart\b[^\n]*(?:clean|delete\s+partition)/i, 'disk partition destruction is catastrophically destructive'],
  [/\bdd\b[^\n]*\bof=\/dev\/(?:sd[a-z]|nvme\d+n\d+|vd[a-z])\b/i, 'raw block-device overwrite is catastrophically destructive']
];

for (const [pattern, reason] of denyRules) if (pattern.test(normalized)) respond('deny', reason);
for (const [pattern, reason] of askRules) if (pattern.test(normalized)) respond('ask', reason);

process.stdout.write('{}');
