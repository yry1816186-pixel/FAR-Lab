import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';

export interface ResourceState<T> {
  data: T | null;
  /** Initial load (no usable data yet). */
  loading: boolean;
  /** Silent revalidation (refresh key changed / manual refresh) — previous data stays visible. */
  refreshing: boolean;
  error: ApiError | null;
  retry: () => void;
}

/**
 * Async resource with abort-on-rekey, visible errors and manual retry.
 *
 * Semantics:
 * - `deps` change = NEW resource identity (e.g. another run selected):
 *   full loading state, previous resource's data is discarded (never mixed).
 * - `refreshKey` change (e.g. run.updatedAt) = SAME resource revalidation:
 *   silent refetch; stale data stays visible until the fresh payload lands.
 * - The fetcher receives a fresh AbortSignal per request; superseded requests
 *   are aborted and their AbortError swallowed. Everything else is visible state.
 */
export function useResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  refreshKey: unknown = null,
): ResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [attempt, setAttempt] = useState(0);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const hasDataRef = useRef(false);
  const previousRequest = useRef<{ deps: readonly unknown[]; attempt: number } | null>(null);

  // Identity and revision share ONE request owner. Separate effects used to
  // launch competing requests when selecting a study with a different revision.
  useEffect(() => {
    const previous = previousRequest.current;
    const initial = previous === null || previous.attempt !== attempt
      || previous.deps.length !== deps.length
      || deps.some((value, index) => !Object.is(value, previous.deps[index]));
    previousRequest.current = { deps: [...deps], attempt };
    const controller = new AbortController();
    (async () => {
      if (!initial && hasDataRef.current) {
        setRefreshing(true);
      } else {
        hasDataRef.current = false;
        setData(null);
        setLoading(true);
        setRefreshing(false);
      }
      setError(null);
      try {
        const result = await fetcherRef.current(controller.signal);
        // A fetcher may finish parsing after abort, or may not support abort.
        // Its result still belongs to the old request, never the current study.
        if (controller.signal.aborted) return;
        hasDataRef.current = true;
        setData(result);
      } catch (e) {
        if (controller.signal.aborted) return;
        if (e instanceof DOMException && e.name === 'AbortError') return; // superseded request
        setError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt, refreshKey]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { data, loading, error, refreshing, retry };
}
