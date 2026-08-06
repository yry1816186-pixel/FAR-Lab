/**
 * Standards projections: RO-Crate/WRROC + PROV/RDF + canonical byte boundaries.
 *
 * Authority: docs/far-lab-reboot/17_FORMAL_PROTOCOL_REPRODUCIBILITY_AND_LONGEVITY.md §7,
 *   19 §3.3 (FAR receipt remains authority; projections are lossy mappings).
 * Freeze: SPEC-007 (IRG-010/011).
 *
 * IRG-010: RO-Crate 1.3 and Workflow Run Crate 0.5/RO-Crate 1.1 semantics reconciliation.
 * IRG-011: PROV/RDF graph semantics and signed-byte boundary separation.
 *
 * The FAR receipt is the authority. Projections map receipt fields to standards
 * formats, but every projection carries a loss report documenting unmapped fields.
 * File-byte digest (raw bytes) and semantic digest (canonical JSON) are separate.
 *
 * 模型中立 · 零容忍合规.
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from '../evidence_log/hasher.ts';

// ===========================================================================
// Projection formats
// ===========================================================================

/** Supported standards projection formats. */
export const PROJECTION_FORMATS = [
  'ro-crate-1.1',
  'wrroc-0.5',
  'prov-rdf-20130424',
] as const;
/** Type alias: projection format. */
export type ProjectionFormat = (typeof PROJECTION_FORMATS)[number];

// ===========================================================================
// Common projection types
// ===========================================================================

/** A receipt component for projection. */
export interface ProjectableComponent {
  readonly kind: string;
  readonly digest: string;
}

/** Base projection shape (all projections share these fields). */
export interface BaseProjection {
  readonly format: ProjectionFormat;
  readonly projectionDigest: string;
  readonly sourceReceiptDigest: string;
  readonly lossReport: ProjectionLossReport;
}

/** Loss report documenting unmapped FAR fields. */
export interface ProjectionLossReport {
  readonly targetFormat: ProjectionFormat;
  readonly mappedFields: readonly string[];
  readonly unmappedFields: readonly string[];
  readonly lossReportDigest: string;
}

// ===========================================================================
// RO-Crate projection
// ===========================================================================

/** Input for RO-Crate projection. */
export interface RoCrateProjectionInput {
  readonly receiptDigest: string;
  readonly receiptStanding: string;
  readonly components: readonly ProjectableComponent[];
}

/** RO-Crate projection result. */
export interface RoCrateProjection extends BaseProjection {
  readonly format: 'ro-crate-1.1';
  readonly '@context': string;
  readonly '@graph': readonly unknown[];
}

// FAR fields that RO-Crate 1.1 cannot represent.
const RO_CRATE_UNMAPPABLE = new Set([
  'antiTheaterReport',
  'numericalEquivalenceProfile',
  'verdictTrace',
  'protocolFreeze',
]);

/** Build an RO-Crate 1.1 projection from a receipt. */
export function buildRoCrateProjection(input: RoCrateProjectionInput): RoCrateProjection {
  const mappedFields = input.components
    .map((c) => c.kind)
    .filter((k) => !RO_CRATE_UNMAPPABLE.has(k));

  const lossReport = buildProjectionLossReport({
    farFields: input.components.map((c) => c.kind),
    mappedFields,
    targetFormat: 'ro-crate-1.1',
  });

  const graph = input.components.map((c) => ({
    '@id': `far:${c.kind}/${c.digest.slice(0, 16)}`,
    '@type': 'File',
    name: c.kind,
    digest: c.digest,
  }));

  const projectionDigest = createHash('sha256')
    .update(canonicalJson({ ...input, graph }, 'buildRoCrateProjection'), 'utf8')
    .digest('hex');

  return Object.freeze({
    format: 'ro-crate-1.1' as const,
    '@context': 'https://w3id.org/ro/crate/1.1/context',
    '@graph': graph,
    projectionDigest,
    sourceReceiptDigest: input.receiptDigest,
    lossReport,
  });
}

// ===========================================================================
// PROV projection
// ===========================================================================

/** Input for PROV-RDF projection. */
export interface ProvProjectionInput {
  readonly receiptDigest: string;
  readonly sealedAt: string;
  readonly components: readonly ProjectableComponent[];
}

/** PROV-RDF projection result. */
export interface ProvProjection extends BaseProjection {
  readonly format: 'prov-rdf-20130424';
  readonly entities: readonly { readonly entityId: string; readonly digest: string }[];
  readonly activities: readonly { readonly activityId: string; readonly startedAt: string }[];
}

/** Build a PROV-RDF projection from a receipt. */
export function buildProvProjection(input: ProvProjectionInput): ProvProjection {
  const entities = input.components.map((c) => ({
    entityId: `far:${c.kind}/${c.digest.slice(0, 16)}`,
    digest: c.digest,
  }));
  const activities = [
    { activityId: `far:seal/${input.receiptDigest.slice(0, 16)}`, startedAt: input.sealedAt },
  ];
  const mappedFields = input.components.map((c) => c.kind);
  const lossReport = buildProjectionLossReport({
    farFields: mappedFields,
    mappedFields,
    targetFormat: 'prov-rdf-20130424',
  });
  const projectionDigest = createHash('sha256')
    .update(canonicalJson({ ...input, entities, activities }, 'buildProvProjection'), 'utf8')
    .digest('hex');
  return Object.freeze({
    format: 'prov-rdf-20130424' as const,
    entities,
    activities,
    projectionDigest,
    sourceReceiptDigest: input.receiptDigest,
    lossReport,
  });
}

// ===========================================================================
// Projection loss report
// ===========================================================================

/** Input for building a loss report. */
export interface LossReportInput {
  readonly farFields: readonly string[];
  readonly mappedFields: readonly string[];
  readonly targetFormat: ProjectionFormat;
}

/** Build a projection loss report documenting unmapped FAR fields. */
export function buildProjectionLossReport(input: LossReportInput): ProjectionLossReport {
  const mappedSet = new Set(input.mappedFields);
  const unmappedFields = input.farFields.filter((f) => !mappedSet.has(f));
  const lossReportDigest = createHash('sha256')
    .update(canonicalJson(input, 'buildProjectionLossReport'), 'utf8')
    .digest('hex');
  return Object.freeze({
    targetFormat: input.targetFormat,
    mappedFields: input.mappedFields,
    unmappedFields,
    lossReportDigest,
  });
}

// ===========================================================================
// Canonical byte boundary (IRG-011)
// ===========================================================================

/** Input for canonical byte boundary assertion. */
export interface CanonicalBoundaryInput {
  readonly fileByteDigest: string;
  readonly semanticDigest: string;
  readonly subject: string;
}

/**
 * Assert that file-byte digest and semantic digest are properly separated.
 * IRG-011: file-byte digest (raw file bytes) and semantic digest (canonical JSON
 * of the parsed/semantic content) must be distinct values — they measure different things.
 * @throws CANONICAL_BOUNDARY_VIOLATION if both digests are identical.
 */
export function assertCanonicalByteBoundary(input: CanonicalBoundaryInput): void {
  if (input.fileByteDigest === input.semanticDigest) {
    throw new Error(
      `CANONICAL_BOUNDARY_VIOLATION: fileByteDigest and semanticDigest for "${input.subject}" are identical; they must measure different things (raw bytes vs parsed semantics)`,
    );
  }
}
