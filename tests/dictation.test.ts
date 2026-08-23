import { describe, expect, it } from 'vitest';
import { ASR_SAMPLE_RATE, formatElapsed, insertAtCaret, mixToMono, resampleLinear } from '../web/src/dictation/audio';
import { MAX_RECORD_MS } from '../web/src/hooks/useDictation';

describe('mixToMono', () => {
  it('averages N channels sample-wise', () => {
    const out = mixToMono([new Float32Array([1, 2, 3]), new Float32Array([3, 4, 2])]);
    expect(Array.from(out)).toEqual([2, 3, 2.5]);
  });
  it('single channel passes through; empty input is honest', () => {
    const one = new Float32Array([5, 6]);
    expect(mixToMono([one])).toBe(one);
    expect(mixToMono([]).length).toBe(0);
  });
});

describe('resampleLinear', () => {
  it('downsamples 48k→16k at the exact length ratio', () => {
    const input = new Float32Array(4800).map((_, i) => Math.sin((i / 4800) * Math.PI * 2));
    const out = resampleLinear(input, 48_000, ASR_SAMPLE_RATE);
    expect(out.length).toBe(1600);
  });
  it('preserves a constant signal (DC correctness of the interpolation)', () => {
    const out = resampleLinear(new Float32Array(100).fill(0.5), 44_100, ASR_SAMPLE_RATE);
    for (const v of out) expect(v).toBeCloseTo(0.5, 6);
  });
  it('no-ops on equal rates, empty input, and invalid rates', () => {
    const input = new Float32Array([1, 2, 3]);
    expect(resampleLinear(input, 16_000, 16_000)).toBe(input);
    expect(resampleLinear(new Float32Array(0), 48_000, 16_000).length).toBe(0);
    expect(resampleLinear(input, 0, 16_000)).toBe(input);
  });
});

describe('insertAtCaret', () => {
  it('inserts at the caret with a separating space when needed', () => {
    expect(insertAtCaret('what works', ' and why', 11)).toEqual({ value: 'what works and why', caret: 18 });
    expect(insertAtCaret('a  ', 'b', 3).value).toBe('a  b'); // whitespace boundary: no double space
    expect(insertAtCaret('', 'hello', 0)).toEqual({ value: 'hello', caret: 5 });
  });
  it('clamps an out-of-range caret instead of corrupting the string', () => {
    expect(insertAtCaret('abc', 'X', 99)).toEqual({ value: 'abc X', caret: 5 });
    expect(insertAtCaret('abc', 'X', -1).value).toBe('Xabc');
  });
});

describe('formatElapsed', () => {
  it('renders m:ss deterministically', () => {
    expect(formatElapsed(0)).toBe('0:00');
    expect(formatElapsed(59_400)).toBe('0:59');
    expect(formatElapsed(61_000)).toBe('1:01');
  });
});

describe('dictation constants', () => {
  it('whisper input rate is 16kHz and the record ceiling stays within the 3-min asr guard', () => {
    expect(ASR_SAMPLE_RATE).toBe(16_000);
    expect(MAX_RECORD_MS).toBeLessThanOrEqual(120_000);
  });
});
