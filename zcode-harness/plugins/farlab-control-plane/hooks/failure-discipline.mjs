let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try { input = JSON.parse(raw || '{}'); } catch {}

const tool = input.tool_name || input.toolName || 'tool';
const redact = s => String(s)
  .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s]+/ig, '$1[REDACTED]')
  .replace(/\b(sk-[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,})\b/g, '[REDACTED_SECRET]')
  .replace(/([A-Za-z0-9_]*(?:api[_-]?key|token|secret|password)[A-Za-z0-9_]*\s*[:=]\s*)[^\s,;]+/ig, '$1[REDACTED]');
const error = redact(input.error || '').slice(0, 700);
const context = `Tool failure discipline (${tool}): do not silently continue or blindly repeat the identical failing action. Inspect the actual error, determine whether this is input/config/version/permission/network/environment/root-cause failure, gather new evidence, change strategy when repeated, and record a blocker only if the affected surface is genuinely blocked. Error excerpt: ${error}`;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: input.hook_event_name || 'PostToolUseFailure',
    additionalContext: context.slice(0, 1500)
  }
}));
