/** Minimal XML-entity decoding — no third-party XML dependency (W0 spike approach). */
export const decodeXmlEntities = (s: string): string =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&'); // must stay last: '&' is the escape prefix

/** Collapse XML whitespace runs, then decode entities. Atom text values are wrapped/indented. */
export const collapseXmlText = (s: string): string => decodeXmlEntities(s.replace(/\s+/g, ' ')).trim();

/**
 * Strip JATS/HTML markup — Crossref abstracts carry it. Block-level closers become a
 * space (sentence boundary); inline tags are removed outright so punctuation like
 * `word</jats:italic>.` does not gain a stray space before the period.
 */
export const stripMarkup = (s: string): string =>
  collapseXmlText(
    s
      .replace(/<\/(?:jats:)?(?:p|sec|title|abstract)\s*>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  );
