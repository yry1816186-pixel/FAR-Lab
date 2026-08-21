import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';

describe('toolchain health', () => {
  it('runs vitest with ESM + node crypto (toolchain baseline)', () => {
    const h = createHash('sha256').update('far-lab').digest('hex');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
