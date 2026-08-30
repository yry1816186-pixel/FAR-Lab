import { describe, it, expect } from 'vitest';

/**
 * Endgame audit (security, sandbox env minimization): the sidecar executes
 * agent-drafted exploration code, so a sandbox escape must not inherit the
 * researcher's provider keys. The env is allowlisted at spawn — these tests
 * pin the allowlist contract AND prove the real sidecar still boots under it.
 */
describe('sidecar env minimization (endgame audit)', () => {
  it('rejects a missing sidecar launcher immediately instead of waiting for the call timeout', async () => {
    const { createSidecar } = await import('../src/experiment/python.js');
    const sidecar = createSidecar({ command: [`far-missing-sidecar-${process.pid}`] });
    const started = Date.now();
    try {
      await expect(sidecar.warmup(30_000)).rejects.toThrow(/sidecar spawn failed|ENOENT/i);
      expect(Date.now() - started).toBeLessThan(1_000);
      expect(sidecar.logs().join('\n')).toMatch(/sidecar spawn failed|ENOENT/i);
      const retryStarted = Date.now();
      await expect(sidecar.warmup(30_000)).rejects.toThrow(/sidecar spawn failed|ENOENT/i);
      expect(Date.now() - retryStarted).toBeLessThan(100);
    } finally {
      sidecar.close();
    }
  });

  it('forwards only the allowlisted plumbing variables — provider keys are dropped', async () => {
    const { buildSidecarEnv } = await import('../src/experiment/python.js');
    const prevZai = process.env.ZAI_API_KEY;
    const prevPoison = process.env.__FARLAB_TEST_POISON_SECRET;
    process.env.ZAI_API_KEY = 'sk-POISON-123';
    process.env.__FARLAB_TEST_POISON_SECRET = 'POISON';
    try {
      const env = buildSidecarEnv();
      expect(env.ZAI_API_KEY).toBeUndefined();
      expect(env.__FARLAB_TEST_POISON_SECRET).toBeUndefined();
      expect(env.PATH ?? env.Path).toBeDefined();
      expect(env.PYTHONHASHSEED).toBe('0');
      expect(env.OMP_NUM_THREADS).toBe('1');
      expect(env.OPENBLAS_NUM_THREADS).toBe('1');
    } finally {
      if (prevZai === undefined) delete process.env.ZAI_API_KEY;
      else process.env.ZAI_API_KEY = prevZai;
      if (prevPoison === undefined) delete process.env.__FARLAB_TEST_POISON_SECRET;
      else process.env.__FARLAB_TEST_POISON_SECRET = prevPoison;
    }
  });

  it('keeps the FARLAB_ fence config available to the op layer', async () => {
    const { buildSidecarEnv } = await import('../src/experiment/python.js');
    const prev = process.env.FARLAB_DATA_ROOT;
    process.env.FARLAB_DATA_ROOT = 'C:/tmp/farlab-root';
    try {
      expect(buildSidecarEnv().FARLAB_DATA_ROOT).toBe('C:/tmp/farlab-root');
    } finally {
      if (prev === undefined) delete process.env.FARLAB_DATA_ROOT;
      else process.env.FARLAB_DATA_ROOT = prev;
    }
  });

  it('the real sidecar still boots and answers under the minimized env', async () => {
    const { createSidecar } = await import('../src/experiment/python.js');
    const sidecar = createSidecar();
    try {
      const info = await sidecar.warmup(120_000);
      expect(info.pythonVersion).toMatch(/\d/);
    } finally {
      sidecar.close();
    }
  }, 180_000);
});
