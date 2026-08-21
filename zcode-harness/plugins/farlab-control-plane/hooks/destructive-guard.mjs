let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try { input = JSON.parse(raw || '{}'); } catch {}

const ti = input.tool_input || input.toolInput || {};
const command = String(ti.command ?? ti.cmd ?? ti.script ?? '');
const normalized = command.replace(/\s+/g, ' ').trim();

const respond = (decision, reason) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: input.hook_event_name || 'PreToolUse',
      permissionDecision: decision,
      permissionDecisionReason: `FAR-Lab destructive-operation guard: ${reason}. ${decision === 'ask' ? 'Require explicit user confirmation for this exact action.' : 'Rewrite the operation to target only the intended files.'}`
    }
  }));
  process.exit(0);
};

if (/\bgit\s+clean\b/i.test(normalized) && /-[a-z]*f[a-z]*/i.test(normalized) && /-[a-z]*(?:d|x)[a-z]*/i.test(normalized)) {
  respond('ask', 'git clean with force plus directory/ignored-file deletion can erase work');
}

const rm = normalized.match(/(?:^|[;&|]\s*)rm\s+([^;&|]+)/i);
if (rm) {
  const tokens = rm[1].trim().split(/\s+/).map(x => x.replace(/^(['"])(.*)\1$/, '$2'));
  const recursive = tokens.some(x => x === '--recursive' || (/^-[^-]/.test(x) && x.includes('r')));
  const force = tokens.some(x => x === '--force' || (/^-[^-]/.test(x) && x.includes('f')));
  if (recursive && force) {
    const targets = tokens.filter(x => x !== '--' && !x.startsWith('-'));
    const denyTargets = new Set(['/', '~', '$HOME', '${HOME}', '.', './', '..', '../', '$PWD', '${PWD}']);
    if (targets.some(x => denyTargets.has(x))) respond('deny', 'recursive forced deletion of root/home/workspace/current/parent is too broad');
    if (targets.some(x => x === '*' || x === './*')) respond('ask', 'recursive forced wildcard deletion can erase broad workspace contents');
  }
}

const rules = [
  {pattern: /\bgit\s+reset\s+--hard\b/i, decision: 'ask', reason: 'git reset --hard can erase uncommitted work'},
  {pattern: /\bgit\s+(?:checkout|restore)\b[^\n]*(?:--\s+)?\.\/?(?:\s|$)/i, decision: 'ask', reason: 'bulk checkout/restore of the workspace can erase user changes'},
  {pattern: /\bgit\s+push\b[^\n]*(?:--force(?:-with-lease)?|\s-f(?:\s|$))/i, decision: 'ask', reason: 'force pushing rewrites remote history'},
  {pattern: /\bgit\s+(?:filter-branch|filter-repo)\b/i, decision: 'ask', reason: 'history rewrite requires explicit authorization'},
  {pattern: /\b(?:rmdir|rd)\s+\/s\s+\/q\s+(?:[A-Za-z]:\\|\.|\.\.)(?:\s|$)/i, decision: 'deny', reason: 'recursive forced directory deletion of a drive/workspace/parent is too broad'},
  {pattern: /\bRemove-Item\b[^\n]*-Recurse[^\n]*-Force[^\n]*(?:\s\.(?:\\|\/)?\s*$|\s\.\.(?:\\|\/)?\s*$|[A-Za-z]:\\\s*$)/i, decision: 'deny', reason: 'recursive forced PowerShell deletion of workspace/root is too broad'}
];

for (const {pattern, decision, reason} of rules) {
  if (pattern.test(normalized)) respond(decision, reason);
}

process.stdout.write('{}');
