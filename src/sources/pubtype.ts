import type { PublicationType } from '../domain/source.js';

/**
 * RU-R GO2: native API publication-type vocabularies -> the canonical
 * PublicationType enum. One mapping per family, single source of truth.
 * Unknown native values map to undefined (NOT 'other' — an unmapped value is
 * an honest gap the family may later fill; 'other' is for values we KNOW are
 * none of the evidentially distinct categories).
 */

/** OpenAlex `work.type` (docs: works.md#type). */
export const fromOpenalexType = (t: string | undefined): PublicationType | undefined => {
  switch (t) {
    case 'article':
      return 'primary_research';
    case 'review':
    case 'review-article':
      return 'review';
    case 'preprint':
      return 'preprint';
    case 'editorial':
    case 'editorial-article':
    case 'letter':
      return 'editorial_letter';
    case 'book-chapter':
      return 'book_chapter';
    case 'erratum':
      return 'correction';
    case 'book':
    case 'dissertation':
    case 'imprint':
    case 'paratext':
    case 'report':
    case 'standard':
      return 'other';
    default:
      return undefined;
  }
};

/** Crossref `message.type` (works API). */
export const fromCrossrefType = (t: string | undefined): PublicationType | undefined => {
  switch (t) {
    case 'journal-article':
    case 'proceedings-article':
    case 'posted-content metadata':
      return 'primary_research';
    case 'posted-content':
      return 'preprint';
    case 'book-chapter':
      return 'book_chapter';
    case 'journal-issue':
    case 'proceedings':
    case 'book':
    case 'monograph':
    case 'report':
    case 'dataset':
      return 'other';
    default:
      return undefined;
  }
};

/** Europe PMC `pubType` list (result JSON) — first decisive entry wins. */
export const fromEuropepmcPubTypes = (pubTypes: readonly string[]): PublicationType | undefined => {
  for (const raw of pubTypes) {
    const t = raw.toLowerCase();
    if (t.includes('review')) return 'review';
    if (t.includes('preprint')) return 'preprint';
    if (t.includes('editorial') || t.includes('letter') || t.includes('comment')) return 'editorial_letter';
    if (t.includes('correct') || t.includes('erratum') || t.includes('retract')) return 'correction';
    if (t.includes('journal article') || t.includes('article')) return 'primary_research';
  }
  return undefined;
};

/** arXiv records are preprints by construction (the Atom API has no type field). */
export const ARXIV_PUBLICATION_TYPE: PublicationType = 'preprint';
