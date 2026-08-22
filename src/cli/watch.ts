/**
 * `far research status --watch` renderer (B11 CLI maturity — R2 of PLAN-reuse-adoption).
 * Pure line computation lives here so it is unit-testable without a TTY; the polling
 * loop (store reads + ANSI repaint) stays in main.ts next to the status command.
 * Honesty rules: stage counts only, no invented percentages, no fabricated events.
 */
import { runProgress } from '../domain/index.js';
import type { ResearchRun } from '../domain/index.js';
import { ink, marker } from './term.js';

/** Status -> epistemic color tone (single owner; main.ts imports this for printRun/tables). */
const STATUS_INK: Record<string, (s: string) => string> = {
  completed: ink.ok,
  running: ink.info,
  queued: ink.muted,
  partial: ink.warn,
  failed: ink.err,
  cancelled: ink.muted,
};
export const statusInk = (s: string): ((x: string) => string) => STATUS_INK[s] ?? ((x) => x);

/** Statuses that can still move on their own — the watch loop stops on anything else. */
const ACTIVE_RUN_STATUSES = new Set(['created', 'queued', 'running', 'paused']);
export const isActiveStatus = (status: string): boolean => ACTIVE_RUN_STATUSES.has(status);

/** Hard cap for the last-event line so a huge detail payload cannot flood the frame. */
export const truncateLine = (line: string, maxChars: number): string =>
  line.length <= maxChars ? line : `${line.slice(0, Math.max(0, maxChars - 1))}…`;

/** Elapsed as h/mm/ss from a millisecond delta; unknown when the delta is not a real duration. */
export const formatElapsed = (ms: number): string => {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3_600);
  const m = Math.floor((total % 3_600) / 60);
  const s = total % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  if (h > 0) return `${h}h${pad(m)}m${pad(s)}s`;
  if (m > 0) return `${m}m${pad(s)}s`;
  return `${s}s`;
};

/** Minimal event facts the renderer needs (from store.listEvents, last entry only). */
export interface WatchEventSummary {
  at: string;
  type: string;
  stage?: string;
}

export interface WatchSnapshot {
  run: ResearchRun;
  lease: { holder: string | null; expiresAt: string | null };
  leaseLive: boolean;
  lastEvent: WatchEventSummary | null;
  /** Injected clock (ISO) so tests get deterministic elapsed values. */
  now: string;
}

/** One watch frame: id/status, stage + stage-count progress, lease, last event, elapsed. */
export const watchLines = (s: WatchSnapshot): string[] => {
  const p = runProgress(s.run);
  const final = !isActiveStatus(s.run.status);
  const lines: string[] = [
    `${marker()} ${ink.bold(`run ${s.run.id}`)} — ${ink.bold('status')}: ${statusInk(s.run.status)(s.run.status)}` +
      `  ${ink.bold('stage')}: ${s.run.currentStage}  ${ink.bold('progress')}: ${p.done}/${p.total} stages`,
  ];
  // Same frozen-run logic as plain `far research status`: status=running but no live lease.
  const leaseText = s.lease.holder === null ? 'none' : `${s.lease.holder} (expires ${s.lease.expiresAt})`;
  let leaseLine = `  ${ink.bold('lease')}: ${leaseText}`;
  if (s.run.status === 'running' && !s.leaseLive) leaseLine += `  ${ink.warn('[FROZEN — resume to recover]')}`;
  lines.push(leaseLine);
  if (s.lastEvent !== null) {
    const raw = `last event: ${s.lastEvent.type}${s.lastEvent.stage !== undefined ? ` ${s.lastEvent.stage}` : ''} at ${s.lastEvent.at}`;
    lines.push(`  ${ink.muted(truncateLine(raw, 100))}`);
  } else {
    lines.push(`  ${ink.muted('last event: (none)')}`);
  }
  const elapsed = formatElapsed(Date.parse(s.now) - Date.parse(s.run.createdAt));
  lines.push(`  ${ink.bold('elapsed')}: ${elapsed} (since ${s.run.createdAt})`);
  lines.push(`  ${ink.muted(final ? 'final state — watch ended' : 'watching — refresh 2s · Ctrl-C to exit')}`);
  return lines;
};
