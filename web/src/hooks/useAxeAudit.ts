import { useEffect } from 'react';

/**
 * R3 dev-only accessibility audit (PLAN-reuse-adoption §2「a11y 审计」):
 * axe-core (MPL-2.0) run against the live DOM, results reported to the dev
 * console — never shipped to production (import is behind import.meta.env.DEV,
 * so the axe chunk is only ever fetched in dev). @axe-core/react was rejected
 * by due diligence (no React 18 support); the direct API is the supported path.
 *
 * Report shape: console.group('[AXE]') with one sub-group per violation
 * (id/impact/help + docs link) listing each failing node's CSS selector target.
 * A clean audit logs a single line; audit failures (never a11y results) are a
 * console.warn — this hook must not break the app it audits.
 */

/** Dev double-mounts (StrictMode) must not re-run the audit: once per page load. */
let axeAuditStarted = false;

const AXE_SETTLE_MS = 3_000;

export function useAxeAudit(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || !import.meta.env.DEV || axeAuditStarted) return;
    axeAuditStarted = true;
    // No cleanup on unmount: React StrictMode's dev mount→unmount→mount cycle
    // would cancel the audit otherwise (the once-per-pageload flag above already
    // prevents duplicates). A 3s dev-only timer surviving a remount is harmless.
    setTimeout(() => {
      void (async () => {
        try {
          const axeModule = await import('axe-core');
          // CJS interop belt: Vite pre-bundles axe as CJS→ESM with a synthetic
          // default; named exports are usually also hoisted. Prefer whichever
          // the bundler actually produced.
          const axe = axeModule.default ?? axeModule;
          const results = await axe.run(document.body, { resultTypes: ['violations'] });
          if (results.violations.length === 0) {
            console.log('[AXE] 0 violations');
            return;
          }
          console.group(`[AXE] ${results.violations.length} violation(s)`);
          for (const violation of results.violations) {
            console.group(`${violation.id} (${violation.impact ?? 'unknown impact'}) — ${violation.help}`);
            if (violation.helpUrl.length > 0) console.log(violation.helpUrl);
            for (const node of violation.nodes) {
              console.log(node.target.join(' '), node.failureSummary ?? node.html);
            }
            console.groupEnd();
          }
          console.groupEnd();
        } catch (e) {
          console.warn('[AXE] audit failed to run:', e);
        }
      })();
    }, AXE_SETTLE_MS);
  }, [enabled]);
}
