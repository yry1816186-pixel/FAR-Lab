/**
 * PDF text-layer COLLECTOR (MULTIMODAL lane) — web side stays THIN: pdfjs text
 * items with geometry only. ALL understanding (lines, columns, reading order,
 * captions, tables, xrefs) happens server-side in the deterministic core
 * (`src/ingest/parsers/pdftext.ts`); this module deliberately contains no
 * semantics. Payload contract mirrors PdfTextPayload there (server zod is the
 * single authority; web never imports core src).
 */

export interface CollectedItem {
  str: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  fontName?: string;
}

export interface CollectedPage {
  pageNumber: number;
  width: number;
  height: number;
  items: CollectedItem[];
}

export interface PdfTextPayloadLike {
  numPages: number;
  pages: CollectedPage[];
  truncated: boolean;
  fileSha256: string;
}

const MAX_PAGES = 60;
const MAX_ITEMS_PER_PAGE = 4_000;

let pdfjsReady: Promise<typeof import('pdfjs-dist')> | null = null;
const NODE_PDFJS_ENTRY = 'pdfjs-dist/legacy/build/pdf.mjs';
async function loadPdfjs(): Promise<typeof import('pdfjs-dist')> {
  pdfjsReady ??= (async (): Promise<typeof import('pdfjs-dist')> => {
    // Node (vitest/CLI): the legacy build is DOM-free; no worker → pdfjs runs
    // on the calling thread. This fixed internal specifier is intentionally
    // runtime-resolved: statically discovering the unreachable Node branch made
    // Vite ship a second 535KB pdfjs runtime to every browser. Browser: the
    // standard build + Vite-served worker.
    const isNode = typeof process !== 'undefined' && process.versions?.node !== undefined;
    if (isNode) {
      const legacy = await import(/* @vite-ignore */ NODE_PDFJS_ENTRY) as typeof import('pdfjs-dist');
      // The legacy build's module type diverges from the main entry type only in
      // worker plumbing; the pdf API used here is the same — single documented cast.
      return legacy;
    }
    const pdfjs = await import('pdfjs-dist');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
    return pdfjs;
  })();
  return pdfjsReady;
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Collect the structured text-layer payload for a PDF file. Returns null on
 * parse failure (caller surfaces honestly); a payload with zero items means
 * no-text-layer (scanned) — the server reports that state, also honestly.
 */
export async function collectPdfText(file: File): Promise<PdfTextPayloadLike | null> {
  try {
    const pdfjs = await loadPdfjs();
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages: CollectedPage[] = [];
    const numPages = pdf.numPages;
    for (let i = 1; i <= Math.min(numPages, MAX_PAGES); i += 1) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const items: CollectedItem[] = [];
      for (const raw of content.items) {
        if (!('str' in raw) || raw.str.trim().length === 0) continue;
        if (items.length >= MAX_ITEMS_PER_PAGE) break;
        const tr = raw.transform as [number, number, number, number, number, number];
        const fontSize = Math.hypot(tr[1] ?? 0, tr[3] ?? 0);
        items.push({
          str: raw.str,
          x: tr[4] ?? 0,
          // pdfjs transform y is bottom-origin; flip to top-left origin.
          y: viewport.height - (tr[5] ?? 0) - (raw.height ?? fontSize),
          w: raw.width ?? 0,
          h: raw.height ?? fontSize,
          fontSize: fontSize > 0 ? fontSize : raw.height ?? 10,
          ...(raw.fontName !== undefined ? { fontName: raw.fontName } : {}),
        });
      }
      pages.push({ pageNumber: i, width: viewport.width, height: viewport.height, items });
    }
    return {
      numPages,
      pages,
      truncated: numPages > MAX_PAGES,
      fileSha256: await sha256Hex(buffer),
    };
  } catch {
    return null;
  }
}
