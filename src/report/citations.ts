import type { PaperReference } from '../domain/index.js';

/**
 * Lane-07 citation integrity. Pandoc's citeproc only WARNS on an unresolved `[@key]`
 * (rendering "Doe2020?") — silently shipping a broken bibliography is unacceptable here,
 * so every export path validates citations BEFORE pandoc runs and fails closed.
 */

/** Strip fenced blocks and inline code spans — pandoc does not process citations inside code. */
const stripCode = (markdown: string): string =>
  markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/~~~[\s\S]*?~~~/g, '')
    .replace(/`[^`\n]*`/g, '');

/** All `[@key]` / `[@key;@key2]` occurrences, in order of appearance (duplicates kept). */
export const extractCitationKeys = (markdown: string): string[] => {
  const keys: string[] = [];
  // Pandoc cite items: [@key] [@k1;@k2] [-@suppressed] (the '-' sits between '[' and '@').
  // Each item is an optional -?@? prefix + key.
  const re = /\[(?:-)?@((?:-?@?[A-Za-z0-9_-]+)(?:\s*;\s*-?@?[A-Za-z0-9_-]+)*)\]/g;
  for (const m of stripCode(markdown).matchAll(re)) {
    for (const part of m[1]!.split(';')) {
      const key = part.trim().replace(/^[-@]+/, '');
      if (key.length > 0) keys.push(key);
    }
  }
  return keys;
};

export interface CitationIntegrity {
  /** Distinct keys cited inline, sorted. */
  citedKeys: string[];
  /** Keys cited inline but absent from the bibliography — export MUST fail on these. */
  unresolved: string[];
  /** Bibliography keys never cited inline (disclosed, not fatal). */
  uncited: string[];
}

export const checkCitationIntegrity = (markdown: string, references: readonly PaperReference[]): CitationIntegrity => {
  const cited = [...new Set(extractCitationKeys(markdown))].sort();
  const bibKeys = new Set(references.map((r) => r.key));
  const unresolved = cited.filter((k) => !bibKeys.has(k));
  const citedSet = new Set(cited);
  const uncited = references.map((r) => r.key).filter((k) => !citedSet.has(k)).sort();
  return { citedKeys: cited, unresolved, uncited };
};

/** One .bib file from the outline's references (deterministic; blank-line separated). */
export const renderBibliographyFile = (references: readonly PaperReference[]): string =>
  references.map((r) => r.bibtex).join('\n\n') + (references.length > 0 ? '\n' : '');
