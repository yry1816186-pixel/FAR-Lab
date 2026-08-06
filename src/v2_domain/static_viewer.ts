/**
 * Static viewer: no-script bound + accessible relation model.
 *
 * Authority: docs/far-lab-reboot/19_REFERENCE_VERTICAL_SLICE_AND_CONFORMANCE.md §7.3,
 *   SPEC-011 (accessible relation-view).
 * Freeze: IMPL-029.
 *
 * The viewer must function with JavaScript disabled. All verification data
 * is server-rendered HTML + embedded JSON. No client-side computation for trust.
 *
 * 模型中立 · 零容忍合规.
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from '../evidence_log/hasher.ts';

// ===========================================================================
// Content classes
// ===========================================================================

/** Viewer content classes (doc19 §7.3). */
export const VIEWER_CONTENT_CLASSES = [
  'receipt',
  'verification',
  'manifest',
  'limitation',
  'review',
] as const;

// ===========================================================================
// Static viewer payload
// ===========================================================================

/** A dimension result for display. */
export interface ViewerDimension {
  readonly dimension: string;
  readonly outcome: string;
  readonly reasonCodes: readonly string[];
  readonly detail: string;
}

/** Input for building static viewer payload. */
export interface StaticViewerInput {
  readonly receiptId: string;
  readonly claimText: string;
  readonly verdict: string;
  readonly dimensions: Readonly<Record<string, ViewerDimension>>;
  readonly manifestRoot: string;
  readonly receiptStanding: string;
}

/** Static viewer payload: server-rendered HTML + embedded JSON (no script required). */
export interface StaticViewerPayload {
  readonly html: string;
  readonly embeddedJson: string;
  readonly scriptRequired: false;
  readonly contentHash: string;
}

/**
 * Build a static viewer payload from receipt verification data.
 * The HTML is self-contained — no external scripts, no client-side computation.
 */
export function buildStaticViewerPayload(input: StaticViewerInput): StaticViewerPayload {
  const dimensionOrder = ['provenance', 'integrity', 'identity', 'processConformance', 'executionReproduction', 'scientificVerdict'];

  const rows = dimensionOrder
    .map((dim) => {
      const d = input.dimensions[dim];
      if (!d) return '';
      const outcomeClass = d.outcome.toLowerCase();
      return `<tr><td class="dim">${dim}</td><td class="outcome ${outcomeClass}">${d.outcome}</td><td class="detail">${escapeHtml(d.detail)}</td></tr>`;
    })
    .join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>FAR-Lab V2 Receipt ${escapeHtml(input.receiptId)}</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
table { border-collapse: collapse; width: 100%; }
th, td { border: 1px solid #ccc; padding: 0.5rem; text-align: left; }
.outcome.pass { color: green; font-weight: bold; }
.outcome.fail { color: red; font-weight: bold; }
.outcome.warn { color: orange; font-weight: bold; }
.outcome.not_applicable { color: gray; }
.limitation { background: #fff3cd; padding: 1rem; border-radius: 4px; }
</style>
</head>
<body>
<h1>V2 Receipt Verification</h1>
<p><strong>Receipt:</strong> ${escapeHtml(input.receiptId)}</p>
<p><strong>Claim:</strong> ${escapeHtml(input.claimText)}</p>
<p><strong>Verdict:</strong> ${escapeHtml(input.verdict)}</p>
<p><strong>Standing:</strong> ${escapeHtml(input.receiptStanding)}</p>
<h2>Six Assurance Dimensions</h2>
<table>
<thead><tr><th>Dimension</th><th>Outcome</th><th>Detail</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
<div class="limitation">
<strong>Limitation:</strong> This verification confirms protocol and integrity conformance only.
It does NOT certify scientific truth, author innocence, or fraud absence.
</div>
</body>
</html>`;

  const embeddedJson = JSON.stringify({
    receiptId: input.receiptId,
    verdict: input.verdict,
    dimensions: input.dimensions,
    manifestRoot: input.manifestRoot,
    receiptStanding: input.receiptStanding,
  });

  const contentHash = createHash('sha256')
    .update(canonicalJson({ html, embeddedJson }, 'buildStaticViewerPayload'), 'utf8')
    .digest('hex');

  return Object.freeze({
    html,
    embeddedJson,
    scriptRequired: false as const,
    contentHash,
  });
}

/**
 * Assert that a viewer payload does NOT require JavaScript.
 * @throws SCRIPT_REQUIRED_VIOLATION if scriptRequired is true.
 */
export function assertNoScriptRequired(payload: StaticViewerPayload): void {
  if (payload.scriptRequired !== false) {
    throw new Error(
      'SCRIPT_REQUIRED_VIOLATION: static viewer must NOT require JavaScript for trust path',
    );
  }
}

// ===========================================================================
// Accessible relation model
// ===========================================================================

/** A relation between viewer nodes (ARIA-compatible). */
export interface AccessibleRelation {
  readonly fromNode: string;
  readonly toNode: string;
  readonly relationType: 'CONTAINS' | 'VERIFIED_BY' | 'CONTESTED_BY' | 'LIMITED_BY' | 'PART_OF';
  readonly ariaRole: string;
  readonly ariaLabel: string;
}

/** Input for building accessible relation model. */
export interface RelationModelInput {
  readonly receiptId: string;
  readonly dimensions: readonly string[];
  readonly manifestMembers: readonly string[];
  readonly hasReview: boolean;
}

/** Accessible relation model (doc19 SPEC-011). */
export interface AccessibleRelationModel {
  readonly receiptId: string;
  readonly relations: readonly AccessibleRelation[];
}

/**
 * Build an accessible relation model for screen readers.
 * Maps receipt → dimensions → manifest → limitation → review as ARIA relations.
 */
export function buildAccessibleRelationModel(input: RelationModelInput): AccessibleRelationModel {
  const relations: AccessibleRelation[] = [];

  // Receipt contains dimensions
  for (const dim of input.dimensions) {
    relations.push({
      fromNode: `receipt-${input.receiptId}`,
      toNode: `dimension-${dim}`,
      relationType: 'CONTAINS',
      ariaRole: 'group',
      ariaLabel: `Receipt contains ${dim} dimension`,
    });
  }

  // Receipt contains manifest members
  for (const member of input.manifestMembers) {
    relations.push({
      fromNode: `receipt-${input.receiptId}`,
      toNode: `manifest-${member}`,
      relationType: 'CONTAINS',
      ariaRole: 'group',
      ariaLabel: `Receipt contains ${member} manifest member`,
    });
  }

  // Receipt limited by limitation notice
  relations.push({
    fromNode: `receipt-${input.receiptId}`,
    toNode: 'limitation-notice',
    relationType: 'LIMITED_BY',
    ariaRole: 'note',
    ariaLabel: 'Receipt is limited by honesty boundary',
  });

  // If review exists, add contested relation
  if (input.hasReview) {
    relations.push({
      fromNode: `receipt-${input.receiptId}`,
      toNode: 'review-case',
      relationType: 'CONTESTED_BY',
      ariaRole: 'alert',
      ariaLabel: 'Receipt is contested by a review case',
    });
  }

  return Object.freeze({
    receiptId: input.receiptId,
    relations,
  });
}

// ===========================================================================
// Helpers
// ===========================================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
