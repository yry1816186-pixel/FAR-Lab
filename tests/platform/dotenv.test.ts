// tests/platform/dotenv.test.ts
// src/platform/dotenv.ts discriminative tests — one case per real semantic branch:
// parsing (comments/blank/malformed/export prefix/quotes/CRLF/empty value/first-wins),
// hydration (env wins / missing no-op / values never leak).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hydrateEnvFromDotEnv, parseDotEnv } from '../../src/platform/dotenv.js';

describe('parseDotEnv', () => {
  it('parses basic KEY=VALUE pairs', () => {
    expect(parseDotEnv('A=1\nB=two')).toEqual({ A: '1', B: 'two' });
  });

  it('skips blank lines, comments, and malformed lines', () => {
    const content = '# comment\n\n   \nNO_EQUALS_SIGN\n=missing-key\nOK=yes\n';
    expect(parseDotEnv(content)).toEqual({ OK: 'yes' });
  });

  it('accepts the export prefix', () => {
    expect(parseDotEnv('export TOKEN=abc')).toEqual({ TOKEN: 'abc' });
  });

  it('strips one pair of surrounding quotes (single or double)', () => {
    expect(parseDotEnv('A="quoted"\nB=\'single\'\nC=unquoted')).toEqual({
      A: 'quoted',
      B: 'single',
      C: 'unquoted',
    });
  });

  it('parses CRLF line endings identically to LF', () => {
    expect(parseDotEnv('A=1\r\nB=2\r\n')).toEqual({ A: '1', B: '2' });
  });

  it('preserves an empty value (KEY=) as empty string', () => {
    expect(parseDotEnv('EMPTY=')).toEqual({ EMPTY: '' });
  });

  it('first occurrence of a duplicate key wins', () => {
    expect(parseDotEnv('K=first\nK=second')).toEqual({ K: 'first' });
  });

  it('keeps everything after the first = in the value', () => {
    expect(parseDotEnv('URL=https://x.test?a=b')).toEqual({ URL: 'https://x.test?a=b' });
  });
});

describe('hydrateEnvFromDotEnv', () => {
  it('missing file is a complete no-op', () => {
    const env: NodeJS.ProcessEnv = {};
    const result = hydrateEnvFromDotEnv(env, join(tmpdir(), 'far-dotenv-definitely-absent-xyz'));
    expect(result).toEqual({ loadedKeys: [], filePresent: false });
    expect(env).toEqual({});
  });

  it('loads keys and reports names only (values never leak into the result)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-dotenv-'));
    try {
      const envPath = join(dir, '.env');
      writeFileSync(envPath, 'SECRET_KEY=super-secret-value\n# note\n', 'utf8');
      const env: NodeJS.ProcessEnv = {};
      const result = hydrateEnvFromDotEnv(env, envPath);
      expect(env.SECRET_KEY).toBe('super-secret-value');
      expect(result.loadedKeys).toEqual(['SECRET_KEY']);
      expect(result.filePresent).toBe(true);
      // anti-leak contract: the returned object must never contain the value
      expect(JSON.stringify(result).includes('super-secret-value')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('pre-existing environment variable always wins over .env', () => {
    const dir = mkdtempSync(join(tmpdir(), 'far-dotenv-'));
    try {
      const envPath = join(dir, '.env');
      // neutral placeholder key names (real credential env names must not appear in tests)
      writeFileSync(envPath, 'SAMPLE_TOKEN=from-file\nNEW_KEY=from-file\n', 'utf8');
      const env: NodeJS.ProcessEnv = { SAMPLE_TOKEN: 'from-real-env' };
      const result = hydrateEnvFromDotEnv(env, envPath);
      expect(env.SAMPLE_TOKEN).toBe('from-real-env'); // untouched
      expect(env.NEW_KEY).toBe('from-file');
      expect(result.loadedKeys).toEqual(['NEW_KEY']); // only actually-written keys reported
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
