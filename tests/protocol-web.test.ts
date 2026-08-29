import { describe, it, expect } from 'vitest';
import { coerceMeasurementInput } from '../web/src/api/protocol';

/**
 * Web protocol client (web slice 2): the only logic worth unit-testing lives
 * in the input coercion — numeric variables must reach the server as real
 * numbers (the domain value-type check would 409 otherwise), and empty input
 * must never masquerade as an observation.
 */
describe('coerceMeasurementInput — collection-form string to typed value', () => {
  it('numeric variables coerce valid decimal strings (whitespace tolerated)', () => {
    expect(coerceMeasurementInput('numeric', ' 12.5 ')).toEqual({ ok: true, value: 12.5 });
    expect(coerceMeasurementInput('numeric', '-3')).toEqual({ ok: true, value: -3 });
  });

  it('numeric variables reject non-numeric input locally — no wasted round trip', () => {
    expect(coerceMeasurementInput('numeric', 'abc')).toEqual({ ok: false, error: 'not_numeric' });
    expect(coerceMeasurementInput('numeric', '12,5')).toEqual({ ok: false, error: 'not_numeric' });
  });

  it('whitespace-only input is empty for every value type', () => {
    for (const vt of ['numeric', 'categorical', 'date', 'text'] as const) {
      expect(coerceMeasurementInput(vt, '   ')).toEqual({ ok: false, error: 'empty' });
    }
  });

  it('categorical/ordinal/text values pass through as trimmed strings', () => {
    expect(coerceMeasurementInput('categorical', ' yes ')).toEqual({ ok: true, value: 'yes' });
    expect(coerceMeasurementInput('ordinal', '3')).toEqual({ ok: true, value: '3' });
    expect(coerceMeasurementInput('text', 'stable emulsion, no phase separation')).toEqual({ ok: true, value: 'stable emulsion, no phase separation' });
  });

  it('date values stay strings — the domain checks the ISO prefix server-side', () => {
    expect(coerceMeasurementInput('date', '2026-08-29T10:00')).toEqual({ ok: true, value: '2026-08-29T10:00' });
  });
});
