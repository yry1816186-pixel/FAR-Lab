/**
 * retrieval/backoff — deterministic, injectable backoff helpers for the
 * retrieval HTTP layer (directive §7: token budget + 429 exponential backoff
 * respecting Retry-After).
 *
 * Official-basis defaults (verified 2026-08-15, see .far/agent thinking/
 * retrieval-hardening-v1 + appendix E of the owner directive):
 *   - Retry-After dual format: RFC 9110 §10.2.3 (delay-seconds OR HTTP-date).
 *   - Full-jitter formula: AWS SDK retry guidance —
 *     delay = random(0,1) × min(cap, base × 2^attempt), base 1000ms for
 *     throttling-class errors, cap 20s at AWS; we cap at 8s because a
 *     grounding run issues up to ~18 requests and unbounded caps would stall
 *     the whole run (decision record: worst case ≈ +2min, fail-closed beats
 *     fail-slow beyond that).
 *   - OpenAlex daily budget: X-RateLimit-Remaining counts down to
 *     X-RateLimit-Reset (seconds to midnight UTC). When remaining is at/below
 *     the floor we refuse to issue the request at all (it is doomed) and
 *     surface a structured budget error the source-degradation layer can act on.
 *
 * Zero-entropy discipline: all randomness goes through the injectable `random`
 * (tests pass a fixed one); the module itself never reads Date.now directly —
 * `now` is injectable too.
 */

/** Tunable backoff knobs (defaults per the module header). */
export interface BackoffOptions {
  /** Retries AFTER the initial attempt (default 3 → up to 4 total). */
  readonly maxRetries?: number;
  /** Base delay for the exponential term (default 1000ms, throttling class). */
  readonly baseDelayMs?: number;
  /** Single-wait ceiling (default 8000ms). */
  readonly capMs?: number;
}

export const BACKOFF_DEFAULTS: Required<BackoffOptions> = {
  maxRetries: 3,
  baseDelayMs: 1000,
  capMs: 8000,
};

/**
 * Parse a Retry-After header (RFC 9110 §10.2.3: delay-seconds OR HTTP-date)
 * into a milliseconds delay. Returns null for absent/invalid values — callers
 * fall back to the local jitter formula.
 */
export function parseRetryAfterMs(
  value: string | null | undefined,
  now: () => number = () => Date.now(),
): number | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed) * 1000;
  }
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  const delta = parsed - now();
  return Math.max(0, delta);
}

/**
 * Full-jitter exponential delay: random() × min(cap, base × 2^attempt).
 * `attempt` is 0-based (the wait BEFORE the first retry).
 */
export function computeBackoffDelayMs(
  attempt: number,
  opts: BackoffOptions = {},
  random: () => number = Math.random,
): number {
  const { baseDelayMs, capMs } = { ...BACKOFF_DEFAULTS, ...opts };
  const exponential = Math.min(capMs, baseDelayMs * 2 ** Math.max(0, attempt));
  return Math.floor(random() * exponential);
}

/** Statuses worth retrying (throttling + transient upstream failures). */
export function isTransientRetrievalStatus(status: number): boolean {
  return status === 429 || status === 503 || status === 504;
}

/**
 * Per-host daily-budget tracker fed from X-RateLimit-* response headers
 * (OpenAlex budget model, verified 2026-08-15). When the remaining count is at
 * or below the floor, requests to that host are refused locally — issuing a
 * doomed request only burns the last credits and wastes a round trip.
 */
export class RateBudgetTracker {
  /** Stop issuing when remaining ≤ floor (default 50 ≈ 5% of the no-key 1000/day). */
  public static readonly DEFAULT_FLOOR = 50;

  private readonly remaining: Record<string, number> = {};
  private readonly resetAtMs: Record<string, number> = {};
  private readonly floor: number;

  constructor(floor: number = RateBudgetTracker.DEFAULT_FLOOR) {
    this.floor = floor;
  }

  /** Update from a response's headers (no-op when the headers are absent). */
  updateFromHeaders(host: string, headers: Headers): void {
    const remaining = headers.get('x-ratelimit-remaining');
    if (remaining !== null && /^\d+$/.test(remaining.trim())) {
      this.remaining[host] = Number(remaining.trim());
    }
    const reset = headers.get('x-ratelimit-reset');
    if (reset !== null && /^\d+$/.test(reset.trim())) {
      // Seconds until the budget resets (OpenAlex: midnight UTC).
      this.resetAtMs[host] = Date.now() + Number(reset.trim()) * 1000;
    }
  }

  /** Remaining requests for the host (null = the source does not report budgets). */
  getRemaining(host: string): number | null {
    const value = this.remaining[host];
    return value === undefined ? null : value;
  }

  /**
   * Milliseconds until the host's budget resets (null when unknown).
   * Only meaningful when the budget is exhausted.
   */
  getResetDelayMs(host: string, now: () => number = () => Date.now()): number | null {
    const resetAt = this.resetAtMs[host];
    return resetAt === undefined ? null : Math.max(0, resetAt - now());
  }

  /**
   * Whether the host's reported budget is exhausted (at/below the floor).
   * Unknown budgets never block (sources that do not report stay fetchable).
   */
  isExhausted(host: string): boolean {
    const value = this.remaining[host];
    return value !== undefined && value <= this.floor;
  }
}
