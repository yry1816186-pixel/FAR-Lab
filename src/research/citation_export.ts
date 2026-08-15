/**
 * research/citation_export — research-artifact interoperability serializers
 * (2.md §12 R10 clause): project a run's cited RetrievedDocuments into the
 * citation formats reference managers (Zotero / Mendeley) ingest — BibTeX and
 * CSL-JSON.
 *
 * Purity: this module is 100% I/O-free. It maps RetrievedDocument → citation
 * formats; the CLI (cli/commands/export_citations.ts) owns run loading, file
 * writing, and exit codes. Determinism: same input documents → byte-identical
 * output (documents deduplicated by documentId, ordered documentId-asc, no
 * timestamps, no randomness).
 *
 * NO-FABRICATION CONTRACT (the load-bearing rule of this module):
 *   - a citation field is emitted ONLY when the source document carries it;
 *     absent metadata yields an ABSENT field (never an empty value, never a
 *     guessed one);
 *   - RetrievedDocument carries NO venue/journal field → `journal` /
 *     `booktitle` (BibTeX) and `container-title` (CSL) are structurally never
 *     emitted. This is an honest gap, not an omission to fix by invention;
 *   - the access date in `note` is the document's own `retrievedAt` (the real
 *     fetch timestamp recorded at run time). If it carries no parseable date,
 *     the date clause is dropped — a date is never invented;
 *   - authors are exported as source-order display names (BibTeX ' and '
 *     join / CSL literal names) — no family/given splitting is fabricated.
 *
 * WHAT THIS MODULE CANNOT PROVE (scope honesty):
 *   - exported metadata is SOURCE-AS-RETRIEVED at run time; it reflects what
 *     OpenAlex/arXiv/Crossref served, not bibliographic ground truth;
 *   - citation completeness depends entirely on upstream source metadata
 *     (missing DOIs, absent dates, sparse author lists propagate as-is);
 *   - paragraph-level anchors are NOT included: RetrievedDocument has no
 *     in-document locator, and the text-evidence layer (§8.6) that would
 *     carry them is future work. The `note` field is the only provenance
 *     anchor emitted (source name + access date).
 */

import type { RetrievedDocument } from '../retrieval/types.ts';

/** BibTeX entry type chosen for a document (pragmatic, field-driven). */
export type BibtexEntryType = 'article' | 'misc';

/** One CSL-JSON item record (citeproc-Zotero ingest shape). */
export interface CslJsonRecord {
  readonly id: string;
  readonly type: 'article-journal' | 'misc';
  readonly title: string;
  readonly author?: readonly { readonly literal: string }[];
  readonly issued?: { readonly 'date-parts': readonly number[][] };
  readonly DOI?: string;
  readonly URL: string;
  readonly note: string;
}

/** Placeholder guarding the backslash replacement order in escapeLatex(). */
const BACKSLASH_PLACEHOLDER = '\u0000BS\u0000';

/**
 * Escape LaTeX-special characters for a quoted BibTeX field value:
 * & % # _ { } ~ ^ \ plus " (which would otherwise terminate the quoted value).
 * Replacement order matters: `\` goes first (via placeholder) so the
 * backslashes INTRODUCED by later replacements are not double-escaped.
 */
export function escapeLatex(value: string): string {
  return value
    .replaceAll('\\', BACKSLASH_PLACEHOLDER)
    .replaceAll('&', '\\&')
    .replaceAll('%', '\\%')
    .replaceAll('#', '\\#')
    .replaceAll('_', '\\_')
    .replaceAll('{', '\\{')
    .replaceAll('}', '\\}')
    .replaceAll('~', '\\textasciitilde{}')
    .replaceAll('^', '\\textasciicircum{}')
    .replaceAll('"', '{\\textquotedbl}')
    .replaceAll(BACKSLASH_PLACEHOLDER, '\\textbackslash{}');
}

/** Lowercase a cite-key hint and keep ascii [a-z0-9-] only. */
export function sanitizeCiteKey(hint: string): string {
  return hint.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

/** Extract the 4-digit year from publicationDate (yyyy-mm-dd / yyyy-mm / yyyy); null if none. */
function yearOf(doc: RetrievedDocument): string | null {
  if (doc.publicationDate === null) return null;
  const match = /^(\d{4})/.exec(doc.publicationDate);
  return match === null ? null : (match[1] ?? null);
}

/** The yyyy-mm-dd date clause of retrievedAt, or null when it carries no date. */
function accessDateOf(doc: RetrievedDocument): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(doc.retrievedAt);
  return match === null ? null : (match[1] ?? null);
}

/**
 * Provenance note shared by both formats. Always names the source; appends the
 * access date ONLY when retrievedAt carries a real date (never invented).
 */
export function provenanceNote(doc: RetrievedDocument): string {
  const accessed = accessDateOf(doc);
  return accessed === null
    ? `Accessed via FAR-Lab (source: ${doc.sourceName})`
    : `Accessed via FAR-Lab (source: ${doc.sourceName}); accessed ${accessed}`;
}

/**
 * Pragmatic entry type: arXiv preprints → misc (eprint/howpublished); an
 * openalex/crossref record with a DOI → article; anything else → misc.
 * (venue is unavailable in RetrievedDocument, so `article` carries no journal
 * field — an honest absence, see the module contract above.)
 */
export function bibtexEntryType(doc: RetrievedDocument): BibtexEntryType {
  if (doc.sourceType === 'arxiv') return 'misc';
  return doc.doi !== null ? 'article' : 'misc';
}

/**
 * Default cite-key hint for a document: first-author surname + year
 * (e.g. 'Quill2020'); falls back to 'doc' + documentId prefix when neither
 * authors nor a year are available. The serializer sanitizes + prefixes 'far'.
 */
export function citationKeyHint(doc: RetrievedDocument): string {
  const firstAuthor = doc.authors[0];
  if (firstAuthor !== undefined) {
    const surname = firstAuthor.trim().split(/\s+/).at(-1) ?? '';
    const year = yearOf(doc);
    if (surname.length > 0 && year !== null) return `${surname}${year}`;
  }
  return `doc${doc.documentId.slice(0, 8)}`;
}

/** One `field = "value"` line (value already escaped; absent fields are skipped upstream). */
function fieldLine(name: string, escapedValue: string): string {
  return `  ${name} = "${escapedValue}",`;
}

/**
 * Serialize one document as a BibTeX entry. Cite key = `far` + sanitized
 * keyHint. Fields are emitted ONLY when the source carries them. The title is
 * brace-protected ({{...}}) so BibTeX title-casing never mangles it.
 */
export function toBibtexEntry(doc: RetrievedDocument, keyHint: string): string {
  const key = `far${sanitizeCiteKey(keyHint)}`;
  const type = bibtexEntryType(doc);
  const lines: string[] = [`@${type}{${key},`];

  if (doc.authors.length > 0) {
    lines.push(fieldLine('author', escapeLatex(doc.authors.join(' and '))));
  }
  // Double-brace-protect the (already escaped) title so BibTeX casing styles
  // never mangle it; the raw braces are the protection layer, title braces
  // themselves are LaTeX-escaped. (Three closing braces: one closes the
  // interpolation, two are the literal protection layer.)
  lines.push(fieldLine('title', `{{${escapeLatex(doc.title)}}}`));

  const year = yearOf(doc);
  if (year !== null) {
    lines.push(fieldLine('year', escapeLatex(year)));
  }
  if (doc.doi !== null) {
    lines.push(fieldLine('doi', escapeLatex(doc.doi)));
  }
  if (doc.sourceType === 'arxiv') {
    lines.push(fieldLine('eprint', escapeLatex(doc.persistentIdentifier)));
    lines.push(fieldLine('archivePrefix', 'arXiv'));
    lines.push(fieldLine('howpublished', 'arXiv'));
  }
  lines.push(fieldLine('url', escapeLatex(doc.canonicalUrl)));
  lines.push(fieldLine('note', escapeLatex(provenanceNote(doc))));

  lines.push('}');
  return lines.join('\n');
}

/**
 * Serialize one document as a CSL-JSON record. Same no-fabrication rule:
 * author/issued/DOI keys exist only when the source has the data; author names
 * are CSL literal names (display names as retrieved); container-title is never
 * emitted (venue is not in RetrievedDocument).
 */
export function toCslJson(doc: RetrievedDocument, keyHint: string): CslJsonRecord {
  const id = `far${sanitizeCiteKey(keyHint)}`;
  const year = yearOf(doc);
  const record: CslJsonRecord = {
    id,
    type: bibtexEntryType(doc) === 'article' ? 'article-journal' : 'misc',
    title: doc.title,
    ...(doc.authors.length > 0
      ? { author: doc.authors.map((name) => ({ literal: name })) }
      : {}),
    ...(year !== null ? { issued: { 'date-parts': [[Number(year)]] } } : {}),
    ...(doc.doi !== null ? { DOI: doc.doi } : {}),
    URL: doc.canonicalUrl,
    note: provenanceNote(doc),
  };
  return record;
}

/** Deduplicate by documentId and order documentId-asc (deterministic assembly input). */
function stableDocs(documents: readonly RetrievedDocument[]): RetrievedDocument[] {
  const seen = new Set<string>();
  const unique: RetrievedDocument[] = [];
  for (const doc of documents) {
    if (!seen.has(doc.documentId)) {
      seen.add(doc.documentId);
      unique.push(doc);
    }
  }
  return unique.sort((a, b) => (a.documentId < b.documentId ? -1 : a.documentId > b.documentId ? 1 : 0));
}

/** Per-document unique cite keys (documentId-asc order; collisions get -2, -3, …). */
function uniqueKeys(docs: readonly RetrievedDocument[]): string[] {
  const used = new Set<string>();
  return docs.map((doc) => {
    const base = sanitizeCiteKey(citationKeyHint(doc));
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    return candidate;
  });
}

/** Assemble a complete .bib file. Header is input-derived only (no clock) → byte-deterministic. */
export function toBibtexFile(documents: readonly RetrievedDocument[], runId: string): string {
  const docs = stableDocs(documents);
  const keys = uniqueKeys(docs);
  const header = [
    '% FAR-Lab citation export (BibTeX)',
    `% run: ${runId}`,
    `% documents: ${docs.length}`,
    '% Metadata is source-as-retrieved at run time; completeness depends on upstream',
    '% source metadata. Venue/container fields are absent because RetrievedDocument',
    '% carries no venue. Paragraph-level anchors are not included (future work).',
  ].join('\n');
  const entries = docs.map((doc, i) => toBibtexEntry(doc, keys[i] ?? ''));
  return `${header}\n\n${entries.join('\n\n')}\n`;
}

/** Assemble a complete CSL-JSON file (a JSON array — pure ingest format, no wrapper keys). */
export function toCslJsonFile(documents: readonly RetrievedDocument[]): string {
  const docs = stableDocs(documents);
  const keys = uniqueKeys(docs);
  const records = docs.map((doc, i) => toCslJson(doc, keys[i] ?? ''));
  return `${JSON.stringify(records, null, 2)}\n`;
}
