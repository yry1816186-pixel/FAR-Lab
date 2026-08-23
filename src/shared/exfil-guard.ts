import { createHash, randomBytes } from 'node:crypto';

/**
 * RU-3 T4 — exfiltration tripwires (deterministic, no live dependency).
 *
 * Threat model: the provider call is a LEGAL exit that carries the whole
 * research context; MCP/browser tools are a second egress channel. Neither is
 * visible to the network-layer egress allowlist (F5). These guards inspect
 * OUTBOUND CONTENT at the two boundaries:
 *   1. the model plane (invokeStructured + the agent kernel's own call):
 *      the request body must never contain a configured secret value, an
 *      active session canary, or exceed the size ceiling;
 *   2. the kernel tool boundary: tool arguments must never carry secrets or
 *      the session canary (a model that copies the hidden marker into an
 *      egress tool's args is exfiltrating context).
 *
 * Violations fail CLOSED with the secret's NAME (never its value) in the
 * message — tripwires must not become a leak themselves.
 */

export interface ExfilSecret {
  name: string;
  value: string;
}

export type ExfilViolation =
  | { kind: 'secret_hit'; secretName: string }
  | { kind: 'canary_hit'; canaryId: string }
  | { kind: 'oversized'; chars: number; maxChars: number };

/** Env var names whose VALUES are credentials in this product (live routes + generic families). */
const SECRET_ENV_PATTERNS: readonly RegExp[] = [
  /^(ZAI|DASHSCOPE|OPENAI|ANTHROPIC|GITHUB|HF)_API_KEY$/,
  /^(.*_)?(API_KEY|ACCESS_TOKEN|SECRET|PASSWORD|PRIVATE_KEY)$/,
];

/** Collect credential VALUES from env (length-floored to avoid trivial collisions). */
export const collectEnvSecrets = (env: NodeJS.ProcessEnv = process.env): ExfilSecret[] => {
  const out: ExfilSecret[] = [];
  for (const [name, value] of Object.entries(env)) {
    if (value === undefined || value.length < 16) continue;
    if (!SECRET_ENV_PATTERNS.some((re) => re.test(name))) continue;
    out.push({ name, value });
  }
  return out;
};

/**
 * Per-session canary: embedded in kernel context with a never-emit instruction.
 * Detection = the marker appearing in tool args or an outbound body means the
 * model is copying hidden context outward (prompt-injection-driven exfil shape).
 */
export const makeSessionCanary = (sessionId: string): string =>
  `FARCANARY-${createHash('sha256').update(`${sessionId}:${randomBytes(16).toString('hex')}`).digest('hex').slice(0, 24)}`;

/** Outbound content ceiling — real stage payloads are ≤ ~200KB; 2MB is a runaway guard. */
export const MAX_OUTBOUND_CHARS = 2_000_000;

export const scanOutbound = (
  text: string,
  ctx: { secrets?: ReadonlyArray<ExfilSecret>; canaries?: ReadonlyArray<{ id: string; value: string }>; maxChars?: number } = {},
): ExfilViolation | null => {
  const maxChars = ctx.maxChars ?? MAX_OUTBOUND_CHARS;
  if (text.length > maxChars) return { kind: 'oversized', chars: text.length, maxChars };
  for (const s of ctx.secrets ?? []) {
    if (text.includes(s.value)) return { kind: 'secret_hit', secretName: s.name };
  }
  for (const c of ctx.canaries ?? []) {
    if (text.includes(c.value)) return { kind: 'canary_hit', canaryId: c.id };
  }
  return null;
};

export const describeViolation = (v: ExfilViolation): string => {
  switch (v.kind) {
    case 'secret_hit':
      return `exfil tripwire: outbound content contains secret ${v.secretName} (value never logged); request cut fail-closed`;
    case 'canary_hit':
      return `exfil tripwire: outbound content contains hidden session marker ${v.canaryId}; context-copy exfil shape; request cut fail-closed`;
    case 'oversized':
      return `exfil tripwire: outbound content ${v.chars} chars exceeds ceiling ${v.maxChars}; request cut fail-closed`;
  }
};

/**
 * Redact credential/canary VALUES out of any structured value destined for a
 * persistent record (transcript entries, rollouts). Values that must never
 * appear there are replaced by a named placeholder — detection stays possible,
 * leakage does not. Structural best-effort: JSON round-trip, else stringified.
 */
export const redactOutbound = <T>(value: T, ctx: { secrets?: ReadonlyArray<ExfilSecret>; canaries?: ReadonlyArray<{ id: string; value: string }> }): T => {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    return value; // unserializable values carry no scannable surface
  }
  let redacted = text;
  for (const s of ctx.secrets ?? []) redacted = redacted.split(s.value).join(`[REDACTED:${s.name}]`);
  for (const c of ctx.canaries ?? []) redacted = redacted.split(c.value).join('[REDACTED:session-marker]');
  if (redacted === text) return value;
  try {
    return JSON.parse(redacted) as T;
  } catch {
    return value;
  }
};
