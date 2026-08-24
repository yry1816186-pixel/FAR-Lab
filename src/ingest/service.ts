import { SdmDocument, sdmToPlainText } from './sdm.js';
import { PdfTextPayload, buildSdmFromPdfText } from './parsers/pdftext.js';
import { parseMarkdown } from './parsers/markdown.js';
import { parseLatex } from './parsers/latex.js';
import { parseJats } from './parsers/jats.js';
import { parseTei } from './parsers/tei.js';
import { profileDataset, DatasetProfileDoc } from './dataset.js';
import { buildSdmFromCode, detectCodeLanguage } from './code.js';
import { buildSdmFromNotebook } from './notebook.js';
import type { ArtifactStore } from '../shared/ports.js';

/**
 * Ingest service facade (MULTIMODAL lane): one entry point per producer.
 * Contract: bytes/payload in → { sdm (typed, validated), artifactRef
 * (content-addressed, immutable), seedText (compat projection for the existing
 * seeds pipeline) }. Failures are typed states, never exceptions for expected
 * outcomes (sources-route discipline).
 */

export interface IngestOutcome {
  sdm: SdmDocument;
  /** Artifact-store ref of the serialized SDM JSON (sha256 content-addressed). */
  artifactRef?: string;
  /** Plain-text projection (≤ cap) for the existing seeds pipeline. */
  seedText: string;
  seedTextTruncated: boolean;
}

export const SEED_TEXT_MAX = 50_000;

export const projectSeedText = (sdm: SdmDocument, cap: number = SEED_TEXT_MAX): { text: string; truncated: boolean } => {
  const full = sdmToPlainText(sdm);
  return full.length > cap ? { text: full.slice(0, cap), truncated: true } : { text: full, truncated: false };
};

/** Validate a web-produced SDM payload (HCI contract boundary — zod is the gate). */
export const validateSdmPayload = (payload: unknown): { ok: true; sdm: SdmDocument } | { ok: false; errors: string[] } => {
  const r = SdmDocument.safeParse(payload);
  if (r.success) return { ok: true, sdm: r.data };
  return { ok: false, errors: r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
};

export const persistSdm = async (store: ArtifactStore, sdm: SdmDocument): Promise<string> => {
  const { ref } = await store.put(JSON.stringify(sdm));
  return ref;
};

export const ingestSdm = async (store: ArtifactStore | null, sdm: SdmDocument): Promise<IngestOutcome> => {
  const artifactRef = store !== null ? await persistSdm(store, sdm) : undefined;
  const { text, truncated } = projectSeedText(sdm);
  return { sdm, ...(artifactRef !== undefined ? { artifactRef } : {}), seedText: text, seedTextTruncated: truncated };
};

/** pdfjs payload → SDM (the upload route end-to-end: validate + understand). */
export const ingestPdfTextPayload = (payload: unknown, fileName: string): { ok: true; sdm: SdmDocument } | { ok: false; errors: string[] } => {
  const parsed = PdfTextPayload.safeParse(payload);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) };
  return { ok: true, sdm: buildSdmFromPdfText(parsed.data, { name: fileName }) };
};

export type TextIngestResult =
  | { type: 'sdm'; doc: SdmDocument }
  | { type: 'dataset'; profile: DatasetProfileDoc }
  | null;

/**
 * Route a TEXT upload by extension to its deterministic understanding path.
 * Returns null for genuinely unsupported kinds (caller refuses honestly).
 * PDF stays out: text-layer collection is a web-client capability (pdfjs-dist
 * is a web dependency, zod-only core cannot collect it) — CLI refuses PDFs
 * with that reason instead of pretending.
 */
export const ingestTextToSdm = (fileName: string, text: string): TextIngestResult => {
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  switch (ext) {
    case '.md': case '.markdown':
      return { type: 'sdm', doc: parseMarkdown(text, { name: fileName }) };
    case '.tex': case '.latex':
      return { type: 'sdm', doc: parseLatex(text, { name: fileName }) };
    case '.csv': case '.tsv':
      return { type: 'dataset', profile: profileDataset(text, fileName) };
    case '.ipynb':
      return { type: 'sdm', doc: buildSdmFromNotebook(text, { name: fileName }) };
    case '.py': case '.ts': case '.js': case '.mjs': case '.tsx': case '.jsx':
      if (detectCodeLanguage(fileName) !== null) return { type: 'sdm', doc: buildSdmFromCode(text, { name: fileName }) };
      return null;
    case '.xml':
      // Sniff JATS vs TEI by root element; anything else is not ours to guess.
      if (/<article[\s>]/.test(text.slice(0, 2000))) return { type: 'sdm', doc: parseJats(text, { name: fileName }) };
      if (/<TEI[\s>]/.test(text.slice(0, 2000))) return { type: 'sdm', doc: parseTei(text, { name: fileName }) };
      return null;
    default:
      return null;
  }
};

/** Persist a dataset profile artifact (same content-addressed discipline as SDM). */
export const persistDatasetProfile = async (store: ArtifactStore, profile: DatasetProfileDoc): Promise<string> => {
  const { ref } = await store.put(JSON.stringify(profile));
  return ref;
};
