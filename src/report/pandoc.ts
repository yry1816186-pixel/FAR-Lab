import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { extractCitationKeys } from './citations.js';

/**
 * Lane-07 pandoc bridge. Pandoc (+ built-in citeproc) is the mature citation/formats
 * engine: markdown + .bib in, DOCX/JATS/HTML out. Reuse beats hand-building a CSL
 * processor. The bridge is OPTIONAL at runtime — pandoc absent means those formats are
 * honestly reported unavailable, never faked. Citation integrity is enforced HERE
 * (before pandoc runs) because citeproc only warns on unresolved keys.
 */

export const PANDOC_FORMATS = ['docx', 'jats', 'html'] as const;
export type PandocFormat = (typeof PANDOC_FORMATS)[number];

export interface PandocInfo {
  path: string;
  version: string;
}

const probeBinary = (bin: string): PandocInfo | null => {
  try {
    const r = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 10_000, windowsHide: true });
    if (r.status !== 0 || typeof r.stdout !== 'string') return null;
    const m = r.stdout.match(/^pandoc(?:\.exe)?\s+(\d+\.\d+(?:\.\d+)?)/m);
    return m !== null ? { path: bin, version: m[1]! } : null;
  } catch {
    return null;
  }
};

/** FARLAB_PANDOC_PATH override wins; otherwise plain PATH lookup. */
export const detectPandoc = (env: NodeJS.ProcessEnv = process.env): PandocInfo | null => {
  const fromEnv = env.FARLAB_PANDOC_PATH;
  if (fromEnv !== undefined && fromEnv.trim().length > 0) {
    const probed = probeBinary(fromEnv.trim());
    if (probed !== null) return probed;
  }
  return probeBinary('pandoc');
};

export class CitationIntegrityError extends Error {
  constructor(public readonly unresolved: readonly string[]) {
    super(`citation integrity failure: keys cited in the paper but absent from the bibliography: ${unresolved.join(', ')}`);
    this.name = 'CitationIntegrityError';
  }
}

export interface PandocResult {
  format: PandocFormat;
  /** File bytes (docx is binary). */
  bytes: Buffer;
  /** pandoc stderr, kept verbatim (citeproc warnings surface here). */
  warnings: string;
}

/** First `# heading` line as the document title; honest fallback otherwise. */
const titleOf = (markdown: string): string => {
  const line = markdown.split('\n').find((l) => l.startsWith('# '));
  return line !== undefined ? line.slice(2).trim().slice(0, 200) : 'FAR-Lab paper';
};

/**
 * Convert paper markdown (+ bibliography) with citeproc. Throws CitationIntegrityError
 * BEFORE pandoc runs when any inline key is missing from the bib text; the bib key set is
 * parsed from the .bib itself so the gate sees exactly what pandoc will see.
 */
export const renderWithPandoc = (opts: {
  markdown: string;
  bibliography: string;
  format: PandocFormat;
  pandoc: PandocInfo;
}): PandocResult => {
  const { markdown, bibliography, format, pandoc } = opts;
  const bibKeys = new Set(
    [...bibliography.matchAll(/@(?:article|misc|book|inproceedings|techreport|unpublished)\{([A-Za-z0-9_-]+),/g)].map((m) => m[1]!),
  );
  // Single source of truth with the package layer: citations.ts' extractor (pandoc
  // semantics — code spans ignored, [-@key] suppressed form included).
  const unresolved = [...new Set(extractCitationKeys(markdown).filter((k) => !bibKeys.has(k)))].sort();
  if (unresolved.length > 0) throw new CitationIntegrityError(unresolved);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'farlab-pandoc-'));
  try {
    const inMd = path.join(tmp, 'paper.md');
    const inBib = path.join(tmp, 'references.bib');
    const outFile = path.join(tmp, `paper.${format === 'jats' ? 'jats.xml' : format}`);
    fs.writeFileSync(inMd, markdown, 'utf8');
    fs.writeFileSync(inBib, bibliography, 'utf8');
    const args = [
      inMd,
      '--from', 'markdown',
      '--to', format === 'jats' ? 'jats' : format,
      '--citeproc',
      '--bibliography', inBib,
      '--metadata', `title=${titleOf(markdown)}`,
      // docx has no standalone concept (the binary IS the document); jats/html get the
      // full document skeleton (<article>/<html> root + <ref-list> from citeproc).
      ...(format !== 'docx' ? ['--standalone'] : []),
      '--output', outFile,
    ];
    const r = spawnSync(pandoc.path, args, { timeout: 60_000, windowsHide: true });
    if (r.error !== undefined) throw new Error(`pandoc failed to start (${pandoc.path}): ${r.error.message}`);
    if (r.status !== 0) {
      throw new Error(`pandoc ${format} conversion failed (exit ${r.status}): ${r.stderr?.toString().slice(0, 2000)}`);
    }
    const bytes = fs.readFileSync(outFile);
    if (bytes.length === 0) throw new Error(`pandoc ${format} conversion produced an empty output`);
    return { format, bytes, warnings: r.stderr?.toString() ?? '' };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
};

export const PANDOC_MEDIA_TYPES: Record<PandocFormat, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jats: 'application/xml',
  html: 'text/html',
};
