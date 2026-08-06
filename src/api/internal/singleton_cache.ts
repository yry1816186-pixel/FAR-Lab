/**
 * singleton_cache —— 异步单例缓存（API 路由防 TOCTOU 竞态）。
 *
 * 背景（审计 P1-3）：`if (cached === null) { cached = await 昂贵计算 }` 的 check-then-act
 * 在并发请求下会重复执行 loader（多个协程同时看到 null）；且失败时缓存不会写坏状态。
 *
 * 语义：
 *   - `get()`：并发调用共享同一个 in-flight promise（loader 只执行一次）。
 *   - loader reject → 缓存清空，下一次 get() 重新执行（不缓存失败）。
 *   - `reset()`：显式失效（测试隔离 / 部署刷新钩子）。
 *
 * 零容忍合规：无 any / ts-ignore / 双重断言 / 空 catch / 桩。
 */

/** 异步单例缓存句柄。 */
export interface AsyncSingletonCache<T> {
  /** 取缓存；未命中则执行一次 loader（并发共享同一 promise）。失败不缓存。 */
  get(): Promise<T>;
  /** 显式失效缓存（下次 get 重新执行 loader）。 */
  reset(): void;
}

/**
 * 创建异步单例缓存。
 *
 * @param loader 昂贵计算工厂（仅在缓存未命中时执行）
 */
export function createAsyncSingletonCache<T>(loader: () => Promise<T>): AsyncSingletonCache<T> {
  let cached: Promise<T> | null = null;

  return {
    get(): Promise<T> {
      if (cached === null) {
        cached = loader().catch((err: unknown) => {
          // 失败不缓存：清空后重新抛，下一次 get() 会重试 loader。
          cached = null;
          throw err;
        });
      }
      return cached;
    },
    reset(): void {
      cached = null;
    },
  };
}
