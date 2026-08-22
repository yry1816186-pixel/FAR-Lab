/**
 * Minimal ambient declarations for @citation-js (the packages ship plain JS
 * without bundled types; the surface FAR-Lab uses is Cite.async only —
 * PLAN-reuse-adoption R1). If the upstream ever ships types, delete this file.
 */
declare module '@citation-js/core' {
  export interface CiteData {
    title?: string;
    DOI?: string;
    author?: { given?: string; family?: string }[];
    issued?: { 'date-parts'?: number[][] };
  }
  export class Cite {
    static async(input: string | unknown, options?: unknown): Promise<Cite>;
    readonly data: CiteData[];
  }
}

declare module '@citation-js/plugin-bibtex' {
  /** Side-effect import: registers the BibTeX input/output format on Cite. */
}

declare module '@citation-js/plugin-ris' {
  /** Side-effect import: registers the RIS input/output format on Cite. */
}
