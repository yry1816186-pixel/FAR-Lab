import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { getHealth } from '../api/endpoints';
import type { HealthReport } from '../api/types';

/**
 * Workbench health (P-IA proactive status): slow poll of GET /api/v1/health.
 * Fail-visible — on error the strip shows "unknown", never a fake-ok.
 */
const HEALTH_POLL_MS = 30_000;

export function useHealth(): { health: HealthReport | null; healthError: ApiError | null } {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [healthError, setHealthError] = useState<ApiError | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setHealth(await getHealth());
      setHealthError(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setHealth(null);
      setHealthError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), HEALTH_POLL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  return { health, healthError };
}

/** Live-provider readiness projection for the strip: "2/3 routes ready". */
export function healthProjection(health: HealthReport | null, healthError: ApiError | null): {
  tone: 'ok' | 'warn' | 'err';
  liveReady: number;
  liveTotal: number;
} {
  if (healthError !== null || health === null) return { tone: 'err', liveReady: 0, liveTotal: 0 };
  const live = health.providers.filter((p) => p.kind === 'live');
  const ready = live.filter((p) => p.liveReady).length;
  const tone = health.status !== 'ok' || health.db !== 'ok' ? 'err' : ready === 0 ? 'warn' : 'ok';
  return { tone, liveReady: ready, liveTotal: live.length };
}
