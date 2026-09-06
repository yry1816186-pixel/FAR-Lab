import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeScientificCompute } from '../src/experiment/scientific-compute.js';
import * as python from '../src/experiment/python.js';
import type { Sidecar, SidecarCallResult, SidecarEnvInfo } from '../src/experiment/python.js';
import { wireScientificTools } from '../src/agent/capabilities/scientific-tools.js';
import { openDb } from '../src/persistence/db.js';
import { Store } from '../src/persistence/store.js';
import { newId } from '../src/domain/ids.js';
import type { ArtifactStore } from '../src/shared/ports.js';

const request = {
  operation: 'optimize_quadratic' as const,
  input: { matrix: [[2]], linear: [-4], initial: [0] },
};
const environment: SidecarEnvInfo = { pythonVersion: 'test', versions: { scipy: 'test' } };
const result = { provenance: 'COMPUTED', solution: [2] };
const deferred = <Value>() => {
  let resolve!: (value: Value) => void;
  const promise = new Promise<Value>((fulfill) => { resolve = fulfill; });
  return { promise, resolve };
};
const makeSidecar = () => ({
  warmup: vi.fn<Sidecar['warmup']>().mockResolvedValue(environment),
  call: vi.fn<Sidecar['call']>().mockResolvedValue({ ok: true, result }),
  close: vi.fn(),
  logs: () => [],
  envInfo: () => environment,
  lockfileHash: () => 'test-lock',
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('scientific sidecar cancellation', () => {
  it('does not start a sidecar for a pre-cancelled request', async () => {
    const factory = vi.fn(makeSidecar);
    await expect(executeScientificCompute(request, { sidecar: factory, signal: { aborted: true } }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(factory).not.toHaveBeenCalled();
  });

  it.each(['native', 'polling'] as const)('interrupts warmup with a %s signal and never starts the operation', async (kind) => {
    vi.useFakeTimers();
    const sidecar = makeSidecar();
    const warmup = deferred<SidecarEnvInfo>();
    sidecar.warmup.mockReturnValue(warmup.promise);
    const controller = new AbortController();
    const probe = { aborted: false };
    const signal = kind === 'native' ? controller.signal : probe;
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    const pending = executeScientificCompute(request, { sidecar: () => sidecar, signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    if (kind === 'native') controller.abort();
    else probe.aborted = true;
    await vi.advanceTimersByTimeAsync(25);
    await rejected;
    expect(sidecar.close).toHaveBeenCalledOnce();
    warmup.resolve(environment);
    await Promise.resolve();
    expect(sidecar.call).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    if (kind === 'native') expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it.each(['native', 'polling'] as const)('interrupts an active operation with a %s signal', async (kind) => {
    vi.useFakeTimers();
    const sidecar = makeSidecar();
    const computation = deferred<SidecarCallResult<unknown>>();
    sidecar.call.mockReturnValue(computation.promise);
    const controller = new AbortController();
    const probe = { aborted: false };
    const signal = kind === 'native' ? controller.signal : probe;
    const pending = executeScientificCompute(request, { sidecar: () => sidecar, signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    expect(sidecar.call).toHaveBeenCalledOnce();
    if (kind === 'native') controller.abort();
    else probe.aborted = true;
    await vi.advanceTimersByTimeAsync(25);
    await rejected;
    computation.resolve({ ok: true, result });
    await Promise.resolve();
    expect(sidecar.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('checks a polling signal before moving from warmup to computation', async () => {
    vi.useFakeTimers();
    const sidecar = makeSidecar();
    const signal = { aborted: false };
    sidecar.warmup.mockImplementation(async () => {
      signal.aborted = true;
      return environment;
    });
    await expect(executeScientificCompute(request, { sidecar: () => sidecar, signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(sidecar.call).not.toHaveBeenCalled();
    expect(sidecar.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects a completed payload when cancellation wins before the continuation', async () => {
    vi.useFakeTimers();
    const sidecar = makeSidecar();
    const signal = { aborted: false };
    const computation = deferred<SidecarCallResult<unknown>>();
    sidecar.call.mockReturnValue(computation.promise);
    const pending = executeScientificCompute(request, { sidecar: () => sidecar, signal });
    await Promise.resolve();
    computation.resolve({ ok: true, result });
    signal.aborted = true;
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(sidecar.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up polling after an ordinary sidecar failure', async () => {
    vi.useFakeTimers();
    const sidecar = makeSidecar();
    sidecar.warmup.mockRejectedValue(new Error('warmup failed'));
    await expect(executeScientificCompute(request, { sidecar: () => sidecar, signal: { aborted: false } }))
      .rejects.toThrow('warmup failed');
    expect(sidecar.call).not.toHaveBeenCalled();
    expect(sidecar.close).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('scientific tool cancellation and provenance', () => {
  it.each([
    { stage: 'input persistence', abortAt: 1 },
    { stage: 'binary persistence', abortAt: 2 },
    { stage: 'result persistence', abortAt: 3 },
    { stage: 'no cancellation', abortAt: 0 },
  ])('records success only when not cancelled during $stage', async ({ abortAt }) => {
    const database = openDb(':memory:');
    try {
      const store = new Store(database);
      const runId = newId('run');
      const signal = { aborted: false };
      const sidecar = makeSidecar();
      sidecar.call.mockResolvedValue({ ok: true, result: { ...result, contentBase64: Buffer.from('test artifact').toString('base64') } });
      const factory = vi.spyOn(python, 'createSidecar').mockReturnValue(sidecar);
      const blobs = new Map<string, string>();
      const put = vi.fn<ArtifactStore['put']>().mockImplementation(async (payload) => {
        const bytes = Buffer.from(payload);
        const hash = createHash('sha256').update(bytes).digest('hex');
        const ref = `sha256:${hash}`;
        blobs.set(ref, bytes.toString('utf8'));
        if (put.mock.calls.length === abortAt) signal.aborted = true;
        return { ref, hash, size: bytes.byteLength };
      });
      const artifacts: ArtifactStore = {
        put,
        get: async (ref) => blobs.get(ref) ?? null,
        path: (ref) => ref,
      };
      const tool = wireScientificTools({ store, runId, artifacts }).find((entry) => entry.name === 'scientific_compute');
      expect(tool).toBeDefined();
      const output = await tool!.execute(request, { signal });
      if (abortAt > 0) {
        expect(output).toEqual({ ok: false, error: 'scientific computation aborted by caller' });
        expect(store.listObjects('receipt', runId)).toEqual([]);
        expect(store.listEvents(runId)).toEqual([]);
        expect(put).toHaveBeenCalledTimes(abortAt);
      } else {
        expect(output.ok).toBe(true);
        expect(store.listObjects('receipt', runId)).toHaveLength(1);
        expect(store.listEvents(runId)).toHaveLength(1);
        expect(put).toHaveBeenCalledTimes(3);
      }
      if (abortAt === 1) expect(factory).not.toHaveBeenCalled();
      else expect(sidecar.close).toHaveBeenCalledOnce();
    } finally {
      database.close();
    }
  });
});
