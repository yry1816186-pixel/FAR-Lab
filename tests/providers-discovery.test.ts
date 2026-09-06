import { describe, expect, it, vi } from 'vitest';
import { discoverModels, type FetchLike } from '../src/providers/discovery.js';

const input = {
  wire: 'openai_responses' as const,
  baseUrl: 'https://models.example.test/v1',
  apiKey: 'test-fixture-discovery-key',
};

const catalogResponse = () => ({
  status: 200,
  ok: true,
  json: async () => ({ data: [{ id: 'model-b' }, { id: 'model-a' }, { id: 'model-b' }] }),
});

describe('model discovery transport boundaries', () => {
  it('discovers Responses models with bearer authentication and reports the raw catalog count', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(catalogResponse());
    const result = await discoverModels(input, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith('https://models.example.test/v1/models', expect.objectContaining({
      method: 'GET',
      headers: { authorization: 'Bearer test-fixture-discovery-key' },
      redirect: 'error',
      signal: expect.any(AbortSignal),
    }));
    expect(result).toEqual({ models: [{ id: 'model-a' }, { id: 'model-b' }], rawCount: 3, httpStatus: 200 });
  });

  it('preserves gateway query parameters while joining the catalog path', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(catalogResponse());
    await discoverModels({ ...input, baseUrl: `${input.baseUrl}/?route=research#ignored` }, fetchImpl);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://models.example.test/v1/models?route=research');
  });

  it.each(['file:///tmp/models', 'not-a-url', 'https://user:fixture-password@models.example.test/v1', 'http://models.example.test/v1', 'https://169.254.169.254/latest', 'https://10.0.0.1/v1'])(
    'rejects unsafe or invalid URLs without contacting an endpoint', async (baseUrl) => {
      const fetchImpl = vi.fn<FetchLike>();
      await expect(discoverModels({ ...input, baseUrl }, fetchImpl)).rejects.toThrow(/base URL/);
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('rejects the offline wire without a request', async () => {
    const fetchImpl = vi.fn<FetchLike>();
    await expect(discoverModels({ ...input, wire: 'offline' }, fetchImpl)).rejects.toThrow('unsupported wire');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('never echoes query credentials on HTTP failures', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue({ ...catalogResponse(), ok: false, status: 401 });
    await expect(discoverModels({ ...input, baseUrl: `${input.baseUrl}?key=fixture-url-secret` }, fetchImpl))
      .rejects.toThrow(/^model discovery failed: HTTP 401$/);
  });

  it('does not echo exceptions from the endpoint or JSON parser', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockRejectedValue(new Error('fixture-private-key'));
    await expect(discoverModels(input, fetchImpl)).rejects.toThrow(/^model discovery: endpoint request failed$/);
    fetchImpl.mockResolvedValue({ ...catalogResponse(), json: async () => { throw new Error('fixture-private-key'); } });
    await expect(discoverModels(input, fetchImpl)).rejects.toThrow(/^model discovery: endpoint returned invalid JSON$/);
  });

  it('does not request a catalog after caller cancellation', async () => {
    const controller = new AbortController();
    controller.abort(new Error('fixture-private-cancellation-reason'));
    const fetchImpl = vi.fn<FetchLike>();
    await expect(discoverModels({ ...input, signal: controller.signal }, fetchImpl)).rejects.toThrow('cancelled');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('bounds the request with a timeout', async () => {
    const fetchImpl: FetchLike = (_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
    await expect(discoverModels({ ...input, timeoutMs: 10 }, fetchImpl)).rejects.toThrow('timed out');
  });

  it('applies cancellation while reading the response body', async () => {
    const controller = new AbortController();
    const fetchImpl: FetchLike = async (_url, init) => ({
      ...catalogResponse(),
      json: () => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        controller.abort();
      }),
    });
    await expect(discoverModels({ ...input, signal: controller.signal }, fetchImpl)).rejects.toThrow('cancelled');
  });
});
