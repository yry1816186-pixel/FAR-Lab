import { useEffect, useRef, useCallback } from 'react';

/**
 * useTimeout —— 组件级一次性 timer（审计 P2-6 修复）。
 *
 * 背景：事件 handler 里的 window.setTimeout 在组件卸载后仍会执行（setState-on-unmounted +
 * 闭包被 timer 短暂持有）。本 hook 统一持有 timer 并在卸载时 clearTimeout。
 *
 * 用法：
 *   const schedule = useTimeout();
 *   schedule(() => setCopied(false), 1500);   // 重复调用自动清掉上一个 timer
 */
export function useTimeout(): (fn: () => void, ms: number) => void {
  const timerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    },
    [],
  );

  return useCallback((fn: () => void, ms: number) => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      fn();
    }, ms);
  }, []);
}
