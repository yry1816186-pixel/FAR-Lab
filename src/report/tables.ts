import type { PaperOutline, ScientificClaim, SourceDocument } from '../domain/index.js';

/**
 * Lane-07 deterministic table assembly. Every cell renders from a stored object field —
 * no aggregation that could hide a conflict (two verdicts for one hypothesis stay two
 * entries), no invented values (missing -> null/"—"). Tables carry per-column provenance
 * so a reader can trace each number to its object kind.
 */

export interface ReportTable {
  name: string;
  /** Which store object kinds feed this table. */
  provenance: { sourceKinds: readonly string[]; note: string };
  columns: readonly { key: string; label: string; from: string }[];
  rows: ReadonlyArray<Record<string, string | number | boolean | null>>;
}

/** Codepoint-aware truncation (same discipline as export.ts — never split surrogate pairs). */
const truncate = (s: string, max: number): string => {
  const cps = [...s];
  return cps.length <= max ? s : `${cps.slice(0, max).join('')}…`;
};

const fmtNum = (n: number): string => Number(n.toFixed(4)).toString();

/**
 * T1 — results overview per ranked hypothesis. Conflicting experiment verdicts are kept
 * as distinct semicolon-joined entries with their comparison id (visible, never averaged).
 */
export const buildResultsTable = (outline: PaperOutline): ReportTable => ({
  name: 'results-overview',
  provenance: {
    sourceKinds: ['scorecard', 'tournament', 'evidence_body', 'stat_report'],
    note: 'One row per ranked hypothesis; every value is a stored-object projection (zero LLM).',
  },
  columns: [
    { key: 'hypothesisId', label: 'Hypothesis', from: 'hypothesis.id' },
    { key: 'statement', label: 'Statement', from: 'hypothesis.statement' },
    { key: 'rank', label: 'Rank', from: 'scorecard.rank' },
    { key: 'btScore', label: 'Bradley-Terry', from: 'tournament.standings.btScore' },
    { key: 'winRate', label: 'Win rate', from: 'tournament.standings.winRate' },
    { key: 'evidenceBand', label: 'Evidence band', from: 'evidence_body.logLrBand' },
    { key: 'verdicts', label: 'Experiment verdicts', from: 'stat_report.verdict' },
  ],
  rows: outline.results.map((r) => ({
    hypothesisId: r.hypothesisId,
    statement: truncate(r.statement, 80),
    rank: r.rank,
    btScore: r.btScore === null ? null : r.btScore,
    winRate: r.winRate === null ? null : r.winRate,
    evidenceBand: r.evidenceBand === null ? null : r.evidenceBand,
    verdicts: r.experimentVerdicts.length === 0
      ? null
      : r.experimentVerdicts
          .map((v) => `${v.comparison}[${v.metric}]: ${v.verdict ?? 'no verdict'} (CI [${fmtNum(v.ciLow)}, ${fmtNum(v.ciHigh)}]${v.threshold !== null ? `, thr ${fmtNum(v.threshold)}` : ''})`)
          .join('; '),
  })),
});

/** T2 — retrieved corpus with verification + retraction state per source. */
export const buildCorpusTable = (sources: readonly SourceDocument[]): ReportTable => ({
  name: 'corpus-overview',
  provenance: {
    sourceKinds: ['source_document'],
    note: 'One row per stored source document, in store order; retraction status only when verification carried one.',
  },
  columns: [
    { key: 'title', label: 'Title', from: 'source_document.title' },
    { key: 'year', label: 'Year', from: 'source_document.publicationYear' },
    { key: 'depth', label: 'Content depth', from: 'source_document.contentDepth' },
    { key: 'access', label: 'Access', from: 'source_document.accessState' },
    { key: 'resolved', label: 'Identifier resolved', from: 'source_document.verification.resolved' },
    { key: 'retraction', label: 'Retraction status', from: 'source_document.verification.retractionStatus' },
    { key: 'contentHash12', label: 'contentHash (12)', from: 'source_document.contentHash' },
  ],
  rows: sources.map((s) => ({
    title: truncate(s.title, 60),
    year: s.publicationYear ?? null,
    depth: s.contentDepth,
    access: s.accessState,
    resolved: s.verification?.resolved ?? null,
    retraction: s.verification?.retractionStatus ?? null,
    contentHash12: s.contentHash.slice(0, 12),
  })),
});

/** T3 — claim binding + certainty labels (the claim→source traceability matrix). */
export const buildClaimBindingTable = (claims: readonly ScientificClaim[]): ReportTable => ({
  name: 'claim-binding',
  provenance: {
    sourceKinds: ['claim'],
    note: 'One row per stored claim; sourceDocumentId is the claim\'s first locator (claim→source traceability).',
  },
  columns: [
    { key: 'claimId', label: 'Claim', from: 'claim.id' },
    { key: 'text', label: 'Text', from: 'claim.text' },
    { key: 'bindingStatus', label: 'Binding status', from: 'claim.bindingStatus' },
    { key: 'gradeCertainty', label: 'GRADE-lite certainty', from: 'claim.gradeCertainty' },
    { key: 'sourceDocumentId', label: 'Grounding source', from: 'claim.locators[0].sourceDocumentId' },
  ],
  rows: claims.map((c) => ({
    claimId: c.id,
    text: truncate(c.text, 80),
    bindingStatus: c.bindingStatus,
    gradeCertainty: c.gradeCertainty ?? null,
    sourceDocumentId: c.locators[0]?.sourceDocumentId ?? null,
  })),
});

// ---------------------------------------------------------------------------
// renderers
// ---------------------------------------------------------------------------

const cellText = (v: string | number | boolean | null): string => {
  if (v === null) return '';
  if (typeof v === 'number') return fmtNum(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return v;
};

const mdCell = (v: string | number | boolean | null): string => {
  if (v === null) return '—';
  return cellText(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
};

/** GitHub-flavored markdown table; a table with zero columns is impossible by construction. */
export const tableToMarkdown = (t: ReportTable): string => {
  const header = `| ${t.columns.map((c) => c.label).join(' | ')} |`;
  const sep = `|${t.columns.map(() => '---').join('|')}|`;
  const rows = t.rows.map((r) => `| ${t.columns.map((c) => mdCell(r[c.key] ?? null)).join(' | ')} |`);
  return [
    `<!-- table: ${t.name} · provenance: ${t.provenance.sourceKinds.join('+')} — ${t.provenance.note} -->`,
    header,
    sep,
    ...rows,
  ].join('\n');
};

const csvCell = (v: string | number | boolean | null): string => {
  if (v === null) return '';
  const s = cellText(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** RFC-4180-style CSV: fields containing comma/quote/newline are quoted, quotes doubled. */
export const tableToCsv = (t: ReportTable): string => {
  const lines = [
    t.columns.map((c) => csvCell(c.label)).join(','),
    ...t.rows.map((r) => t.columns.map((c) => csvCell(r[c.key] ?? null)).join(',')),
  ];
  return `${lines.join('\r\n')}\r\n`;
};
