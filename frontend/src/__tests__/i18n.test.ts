/**
 * i18n contract tests — the zh catalogue is the key SSOT and en is bound to
 * it at the type level; these tests lock the runtime side: exact key parity,
 * interpolation-placeholder parity, and the machine-token passthrough rule.
 */

import { describe, expect, it } from 'vitest';

import { en } from '@/shared/i18n/en.ts';
import { zh } from '@/shared/i18n/zh.ts';

const zhKeys = Object.keys(zh);
const enKeys = Object.keys(en);

function placeholders(template: string): readonly string[] {
  return [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();
}

describe('i18n catalogues', () => {
  it('zh and en expose exactly the same key set', () => {
    expect([...enKeys].sort()).toEqual([...zhKeys].sort());
  });

  it('every message is a non-empty string', () => {
    for (const key of zhKeys) {
      const zhValue = zh[key as keyof typeof zh];
      expect(typeof zhValue, `zh ${key}`).toBe('string');
      expect(zhValue.length, `zh ${key}`).toBeGreaterThan(0);
      const enValue = (en as Record<string, string>)[key];
      expect(typeof enValue, `en ${key}`).toBe('string');
      expect((enValue ?? '').length, `en ${key}`).toBeGreaterThan(0);
    }
  });

  it('interpolation placeholders match per key', () => {
    for (const key of zhKeys) {
      const zhValue = zh[key as keyof typeof zh];
      const enValue = (en as Record<string, string>)[key] ?? '';
      expect(placeholders(enValue), `placeholder parity for ${key}`).toEqual(placeholders(zhValue));
    }
  });

  it('machine tokens pass through untranslated (verdict.token is {raw})', () => {
    expect(zh['verdict.token']).toBe('{raw}');
    expect(en['verdict.token']).toBe('{raw}');
  });
});
