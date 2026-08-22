/**
 * Named entities beyond the XML-5 mandatory set that JATS abstracts and LaTeXML HTML
 * routinely emit (WP2 F7); without these, `&ndash;` etc. pass through literally into
 * stored artifacts and LLM prompts. Unrecognized `&word;` sequences stay as-is
 * (honest pass-through, never a guess).
 */
const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  nbsp: '\u00A0', ndash: '\u2013', mdash: '\u2014', hellip: '\u2026',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D',
  minus: '\u2212', infin: '\u221E', pm: '\u00B1', times: '\u00D7',
  le: '\u2264', ge: '\u2265', ne: '\u2260', approx: '\u2248',
  alpha: '\u03B1', beta: '\u03B2', gamma: '\u03B3', delta: '\u03B4', epsilon: '\u03B5',
  kappa: '\u03BA', lambda: '\u03BB', mu: '\u03BC', sigma: '\u03C3', tau: '\u03C4', omega: '\u03C9',
  deg: '\u00B0', larr: '\u2190', rarr: '\u2192', harr: '\u2194', bull: '\u2022',
  dagger: '\u2020', sect: '\u00A7', copy: '\u00A9', reg: '\u00AE', trade: '\u2122',
};

/** Minimal XML-entity decoding — no third-party XML dependency (W0 spike approach). */
export const decodeXmlEntities = (s: string): string =>
  s
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_m, dec: string) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&([A-Za-z][A-Za-z0-9]*);/g, (m, name: string) => NAMED_ENTITIES[name] ?? m)
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
