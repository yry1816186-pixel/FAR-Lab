import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;
let input = {};
try { input = JSON.parse(raw || '{}'); } catch {}

const tool = input.tool_name || input.toolName || 'tool';
const session = input.session_id || input.sessionId || 'unknown-session';
const redact = value => String(value ?? '')
  .replace(/(authorization\s*[:=]\s*bearer\s+)[^\s]+/ig, '$1[REDACTED]')
  .replace(/\b(sk-[A-Za-z0-9_-]{12,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,})\b/g, '[REDACTED_SECRET]')
  .replace(/([A-Za-z0-9_]*(?:api[_-]?key|token|secret|password|credential)[A-Za-z0-9_]*\s*[:=]\s*)[^\s,;]+/ig, '$1[REDACTED]')
  .replace(/([?&](?:token|key|secret|password)=)[^&#\s]+/ig, '$1[REDACTED]');

const error = redact(input.error || '').slice(0, 900);
const fingerprint = crypto.createHash('sha256').update(`${tool}\n${error}`).digest('hex').slice(0, 20);
let repeatCount = 1;
const dataDir = process.env.ZCODE_PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA;
if (dataDir) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const file = path.join(dataDir, 'failure-fingerprints.json');
    let state = { entries: {} };
    try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    if (!state.entries || typeof state.entries !== 'object') state.entries = {};
    const key = `${session}:${fingerprint}`;
    const prior = state.entries[key] || { count: 0 };
    repeatCount = Number(prior.count || 0) + 1;
    state.entries[key] = { count: repeatCount, tool, lastSeen: new Date().toISOString() };
    const entries = Object.entries(state.entries)
      .sort((a, b) => String(b[1]?.lastSeen || '').localeCompare(String(a[1]?.lastSeen || '')))
      .slice(0, 100);
    state.entries = Object.fromEntries(entries);
    fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  } catch {}
}

let context = `Tool failure discipline (${tool}): inspect the actual failure and classify input/config/version/permission/network/environment/data/root-cause before retrying. Do not silently continue past a failed proof obligation.`;
if (repeatCount >= 2) context += ` The same redacted failure fingerprint has occurred ${repeatCount} times in this session: do not repeat the identical strategy; form a new hypothesis, gather new evidence, isolate a minimum reproduction, inspect authoritative docs/source/environment, or change implementation.`;
context += ` Record BLOCKED only when the affected surface is genuinely blocked and continue independent high-value work. Error excerpt: ${error}`;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: input.hook_event_name || 'PostToolUseFailure',
    additionalContext: context.slice(0, 1900)
  }
}));
