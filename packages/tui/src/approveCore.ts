/**
 * Approval vocabulary state machine (Aider io.py lineage, Scout B):
 * y=approve · n=deny · a=always(this kind) · s=session · d=deny-remaining ·
 * q/Esc=abort the pending queue. Pure + deterministic; the Ink prompt and any
 * future queue consumer share this one machine.
 */
export type ApproveDecision = 'approved' | 'denied' | 'always' | 'session' | 'deny_remaining' | 'abort' | 'pending';

export interface ApproveOptions { allowAlways?: boolean; allowSession?: boolean }

export function decide(input: string, opts: ApproveOptions = {}): ApproveDecision {
  const k = input.trim().toLowerCase();
  if (k === 'y') return 'approved';
  if (k === 'n') return 'denied';
  if (k === 'q' || k === '\x1b') return 'abort';
  if (k === 'a' && opts.allowAlways !== false) return 'always';
  if (k === 's' && opts.allowSession !== false) return 'session';
  if (k === 'd') return 'deny_remaining';
  return 'pending';
}

/** A decision that ends the current prompt (vs pending / non-applicable keys). */
export function isFinal(d: ApproveDecision): boolean {
  return d !== 'pending';
}

export const VOCAB_FOOTER = 'y 批准 · n 拒绝 · a 总是 · s 本次会话 · d 拒绝其余 · q 中止';
