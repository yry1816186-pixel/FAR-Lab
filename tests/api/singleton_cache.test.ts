// tests/api/singleton_cache.test.ts
// 测 createAsyncSingletonCache：并发首击只执行一次 loader + 失败不缓存 rejected（可重试）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAsyncSingletonCache } from '../../src/api/internal/singleton_cache.ts';

test('并发 get：loader 只执行一次（TOCTOU 修复）', async () => {
  let calls = 0;
  const cache = createAsyncSingletonCache(async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 10));
    return 'v1';
  });
  const [a, b, c] = await Promise.all([cache.get(), cache.get(), cache.get()]);
  assert.equal(calls, 1, '并发请求必须共享同一个 in-flight promise');
  assert.deepEqual([a, b, c], ['v1', 'v1', 'v1']);
});

test('失败后不缓存 rejected：下次 get 重新执行 loader', async () => {
  let calls = 0;
  const cache = createAsyncSingletonCache(async () => {
    calls += 1;
    if (calls === 1) {
      throw new Error('boom');
    }
    return 'ok';
  });
  await assert.rejects(cache.get(), /boom/);
  assert.equal(await cache.get(), 'ok', '失败后的下一次调用必须重新加载');
  assert.equal(calls, 2);
});

test('reset 后重新执行 loader', async () => {
  let calls = 0;
  const cache = createAsyncSingletonCache(async () => {
    calls += 1;
    return `v${calls}`;
  });
  assert.equal(await cache.get(), 'v1');
  cache.reset();
  assert.equal(await cache.get(), 'v2');
  assert.equal(calls, 2);
});
