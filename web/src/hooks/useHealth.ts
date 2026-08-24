import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { getHealth } from '../api/endpoints';
import type { HealthReport } from '../api/types';

/**
 * Workbench health (P-IA proactive status): slow poll of GET /api/v1/health.
 * Fail-visible — on error the strip shows "unknown", never a fake-ok.
 *
 * R2-01: the FIRST health check on a populated workspace can be slow (the
 * server verifies the audit chain before answering), which used to leave the
 * strip stuck on "failed" for a whole 30s poll cycle. The first two failures
 * now retry fast (2.5s) and the strip distinguishes "checking" (request in
 * flight) from "failed" (an answer came back and it was an error).
 */
const HEALTH_POLL_MS = 30_000;
const HEALTH_FAST_RETRY_MS = 2_500;
const FAST_RETRIES = 2;

export interface HealthState {
  health: HealthReport | null;
  healthError: ApiError | null;
  /** True while a request is in flight (initial check or a retry). */
  checking: boolean;
}

export function useHealth(): HealthState {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [healthError, setHealthError] = useState<ApiError | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let timer = 0;
    let failures = 0;
    let alive = true;

    const schedule = (delay: number): void => {
      timer = window.setTimeout(() => { void cycle(); }, delay);
    };

    const cycle = async (): Promise<void> => {
      if (!alive) return;
      setChecking(true);
      try {
        const report = await getHealth();
        if (!alive) return;
        setHealth(report);
        setHealthError(null);
        failures = 0;
        schedule(HEALTH_POLL_MS);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        if (!alive) return;
        setHealth(null);
        setHealthError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
        failures += 1;
        schedule(failures <= FAST_RETRIES ? HEALTH_FAST_RETRY_MS : HEALTH_POLL_MS);
      } finally {
        if (alive) setChecking(false);
      }
    };

    void cycle();
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one polling lifecycle for the mount
  }, []);

  return { health, healthError, checking };
}

/** Live-provider readiness projection for the strip: "2/3 routes ready". */
export function healthProjection(health: HealthReport | null, healthError: ApiError | null, checking = false): {
  tone: 'ok' | 'warn' | 'err' | 'checking';
  liveReady: number;
  liveTotal: number;
} {
  if (healthError !== null) return { tone: 'err', liveReady: 0, liveTotal: 0 };
  if (health === null) return { tone: checking ? 'checking' : 'err', liveReady: 0, liveTotal: 0 };
  const live = health.providers.filter((p) => p.kind === 'live');
  const ready = live.filter((p) => p.liveReady).length;
  const tone = health.status !== 'ok' || health.db !== 'ok' ? 'err' : ready === 0 ? 'warn' : 'ok';
  return { tone, liveReady: ready, liveTotal: live.length };
}
