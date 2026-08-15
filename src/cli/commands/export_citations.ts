// src/cli/commands/export_citations.ts
// `far export citations <runId> --format bibtex|csl-json [--output path|-]`
// (2.md §12 R10 clause): one-command export of a run's cited documents as
// BibTeX / CSL-JSON for reference managers (Zotero / Mendeley).
//
// Honesty contract (mirrors research/citation_export.ts):
//   - cited documentIds are collected from ALL hypotheses (supporting +
//     counter-evidence) and resolved against the run's stored corpus;
//   - an id that does NOT resolve is listed in the output warning section
//     (and as a `% unresolved documentId:` comment in .bib files) — never
//     silently dropped, never guessed;
//   - exit 0 only when at least one citation was exported; any failure exits
//     non-zero with the reason on stderr/stdout.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { toBibtexFile, toCslJsonFile } from '../../research/citation_export.ts';
import type { RetrievedDocument } from '../../retrieval/types.ts';
import type { ResearchRun } from '../../research/types.ts';
import type { RunStore } from '../../research/run_lifecycle.ts';
import { resolveRunStore } from './research.ts';

/** Type alias: citation export format. */
export type CitationExportFormat = 'bibtex' | 'csl-json';

/** Input parameters for runExportCitations. */
export interface ExportCitationsOptions {
  readonly runId: string;
  readonly format: CitationExportFormat;
  /** Output path; '-' writes the citation payload to stdout. */
  readonly output?: string;
  /** Run store override (tests inject a temp store); default resolves like `far research`. */
  readonly store?: RunStore;
}

/** Default export directory (gitignored runtime area, see ROOT-HYGIENE-POLICY). */
const DEFAULT_EXPORT_DIR = '.far/exports';

/** File extension per format. */
function extensionOf(format: CitationExportFormat): string {
  return format === 'bibtex' ? 'bib' : 'json';
}

/** Default output path: .far/exports/<runId>-citations.{bib|json}. */
export function defaultCitationsPath(runId: string, format: CitationExportFormat): string {
  return join(DEFAULT_EXPORT_DIR, `${runId}-citations.${extensionOf(format)}`);
}

/** Distinct cited documentIds across all hypotheses (supporting + counter), documentId-asc. */
export function collectCitedDocumentIds(run: ResearchRun): string[] {
  const ids = new Set<string>();
  for (const hypothesis of run.hypotheses) {
    for (const id of hypothesis.supportingCitations) ids.add(id);
    for (const id of hypothesis.counterEvidenceCitations) ids.add(id);
  }
  return [...ids].sort();
}

/** Split cited ids into (resolvable documents, unresolvable ids). */
export function resolveCitedDocuments(
  run: ResearchRun,
  citedIds: readonly string[],
): { readonly documents: RetrievedDocument[]; readonly unknownIds: string[] } {
  const byId = new Map<string, RetrievedDocument>();
  for (const doc of run.corpus.documents) byId.set(doc.documentId, doc);
  const documents: RetrievedDocument[] = [];
  const unknownIds: string[] = [];
  for (const id of citedIds) {
    const doc = byId.get(id);
    if (doc === undefined) unknownIds.push(id);
    else documents.push(doc);
  }
  return { documents, unknownIds };
}

/**
 * Run the citation export. Returns the process exit code: 0 only when at least
 * one citation was exported; non-zero with a clear reason otherwise.
 */
export function runExportCitations(options: ExportCitationsOptions): number {
  const store = options.store ?? resolveRunStore();

  const run = store.loadRun(options.runId);
  if (run === null) {
    process.stderr.write(
      `far export citations: no completed run ${options.runId} under ${store.rootDir}\n` +
      '  (runs complete via: far research start "<question>"; inspect ids via: far research status <runId>)\n',
    );
    return 1;
  }

  const citedIds = collectCitedDocumentIds(run);
  const { documents, unknownIds } = resolveCitedDocuments(run, citedIds);

  if (documents.length === 0) {
    const reason =
      citedIds.length === 0
        ? 'no citations found on any hypothesis of this run (nothing to export)'
        : `none of the ${citedIds.length} cited documentId(s) resolve in the run corpus: ${citedIds.join(', ')}`;
    process.stderr.write(`far export citations: ${reason}\n`);
    return 1;
  }

  const payload =
    options.format === 'bibtex'
      ? appendBibtexWarnings(toBibtexFile(documents, options.runId), unknownIds)
      : toCslJsonFile(documents);

  const writtenTo =
    options.output === '-'
      ? null
      : options.output !== undefined && options.output !== ''
        ? options.output
        : defaultCitationsPath(options.runId, options.format);

  if (writtenTo === null) {
    process.stdout.write(payload);
  } else {
    mkdirSync(dirname(writtenTo), { recursive: true });
    writeFileSync(writtenTo, payload, 'utf8');
  }

  // '-' mode: the payload on stdout must stay pipe-clean (`> refs.bib` must
  // yield exactly the citation file), so the human summary goes to stderr.
  const summaryTarget = writtenTo === null ? process.stderr : process.stdout;
  const lines = [
    '',
    '  FAR-Lab · far export citations',
    '  ─────────────────────────────────────────────────────────────────────',
    `  run        : ${options.runId}`,
    `  format     : ${options.format}`,
    `  exported   : ${documents.length} citation(s) → ${writtenTo ?? '(stdout)'}`,
    `  corpus     : ${run.corpus.documentCount} document(s) · ${citedIds.length} distinct cited id(s)`,
  ];
  if (unknownIds.length > 0) {
    lines.push('  Warnings   :');
    lines.push(
      ...unknownIds.map(
        (id) => `    - unresolved documentId (not in corpus, skipped): ${id}`,
      ),
    );
    lines.push('    (these ids cannot be resolved to source metadata and were NOT exported)');
  }
  lines.push('  ─────────────────────────────────────────────────────────────────────');
  lines.push('');
  summaryTarget.write(lines.join('\n'));
  return 0;
}

/** Append `% unresolved documentId:` comments to a .bib payload (legal BibTeX comments). */
function appendBibtexWarnings(bib: string, unknownIds: readonly string[]): string {
  if (unknownIds.length === 0) return bib;
  const comments = unknownIds.map((id) => `% unresolved documentId (not in corpus, skipped): ${id}`);
  return `${bib}\n${comments.join('\n')}\n`;
}
