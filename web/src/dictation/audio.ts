/**
 * Pure audio math + text-insertion utilities for dictation. No DOM, no
 * workers — every function here is deterministic and unit-tested offline
 * (tests/dictation.test.ts); the microphone/worker plumbing lives in
 * useDictation and is verified by the user, not by fake tests.
 */

/** Whisper's required input rate (16 kHz mono). */
export const ASR_SAMPLE_RATE = 16_000;

/** Average N channel planes into one mono plane (the caller owns the arrays). */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0]!;
  const out = new Float32Array(channels[0]!.length);
  for (const ch of channels) {
    for (let i = 0; i < out.length; i += 1) out[i]! += ch[i] ?? 0;
  }
  const n = channels.length;
  for (let i = 0; i < out.length; i += 1) out[i] = out[i]! / n;
  return out;
}

/** Linear-interpolation resampler (good enough for speech; honest about being naive). */
export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0 || fromRate <= 0 || toRate <= 0) return input;
  const outLen = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const out = new Float32Array(outLen);
  const step = fromRate / toRate;
  for (let i = 0; i < outLen; i += 1) {
    const src = i * step;
    const i0 = Math.min(Math.floor(src), input.length - 1);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = src - i0;
    out[i] = input[i0]! * (1 - frac) + input[i1]! * frac;
  }
  return out;
}

/**
 * Insert dictated text at the caret, adding a separating space only when the
 * preceding text does not already end in whitespace. Returns the next caret
 * position so the caller can restore focus honestly.
 */
export function insertAtCaret(value: string, insert: string, caret: number): { value: string; caret: number } {
  const at = Math.max(0, Math.min(caret, value.length));
  // Separate only when both sides are word-ish — never double-space when the
  // dictated fragment already starts (or the text ends) with whitespace.
  const needsPad = at > 0
    && !/\s/.test(value[at - 1] ?? '')
    && !/^\s/.test(insert);
  const pad = needsPad ? ' ' : '';
  const next = `${value.slice(0, at)}${pad}${insert}${value.slice(at)}`;
  return { value: next, caret: at + pad.length + insert.length };
}

/** mm:ss clock for the recording indicator (deterministic, no Date inside). */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(1, '0')}:${String(s).padStart(2, '0')}`;
}
