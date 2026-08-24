import { SdmDocument, sdmToPlainText } from './sdm.js';
import { PdfTextPayload, buildSdmFromPdfText } from './parsers/pdftext.js';
import { parseMarkdown } from './parsers/markdown.js';
import { parseLatex } from './parsers/latex.js';
import { parseJats } from './parsers/jats.js';
import { parseTei } from './parsers/tei.js';
import { parseHtml } from './parsers/html.js';
import { buildSdmFromPlainText } from './parsers/plaintext.js';
import { parseDocx } from './parsers/docx.js';
import { parsePptx } from './parsers/pptx.js';
import { parseEpub } from './parsers/epub.js';
import { parseSvgPlot, SdmPlotPoints } from './parsers/svgplot.js';
import { profileDataset, profileRows, DatasetProfileDoc } from './dataset.js';
import { jsonToRows } from './jsondata.js';
import { buildSdmFromCode, detectCodeLanguage } from './code.js';
import { buildSdmFromNotebook } from './notebook.js';
import { profileXlsx } from './xlsx.js';
import type { ArtifactStore } from '../shared/ports.js';
import { z } from 'zod';

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
    case '.html': case '.htm': case '.xhtml':
      return { type: 'sdm', doc: parseHtml(text, { name: fileName }) };
    case '.txt': case '.text': case '.log':
      return { type: 'sdm', doc: buildSdmFromPlainText(text, { name: fileName }) };
    case '.json': {
      // JSON datasets route through the SAME dsdp-1 pipeline (records/columnar);
      // non-tabular JSON returns null (callers surface jsonRefusalReason).
      const rows = jsonToRows(text);
      if (!rows.ok) return null;
      return { type: 'dataset', profile: profileRows(rows.rows, fileName, 'json') };
    }
    default:
      return null;
  }
};

/** Precise refusal reason for JSON that is not tabular (api/cli surface it). */
export const jsonRefusalReason = (text: string): string => {
  const r = jsonToRows(text);
  return r.ok ? 'JSON is tabular (no refusal)' : `JSON not profiled as a dataset: ${r.reason}`;
};

/** Persist a dataset profile artifact (same content-addressed discipline as SDM). */
export const persistDatasetProfile = async (store: ArtifactStore, profile: DatasetProfileDoc): Promise<string> => {
  const { ref } = await store.put(JSON.stringify(profile));
  return ref;
};

export type BytesIngestResult =
  | { type: 'sdm'; doc: SdmDocument }
  | { type: 'dataset'; profile: DatasetProfileDoc }
  | { type: 'refused'; reason: string };

/**
 * Route a BINARY upload by extension (2026-08-25 extension: the zip container
 * family — docx/pptx/epub join xlsx on the shared ZIP reader). Everything
 * else is refused with a reason, never parsed as text. Disjoint from
 * ingestTextToSdm by extension.
 */
export const ingestBytes = (fileName: string, bytes: Uint8Array): BytesIngestResult => {
  if (/\.(xlsx|xlsm)$/i.test(fileName)) {
    const r = profileXlsx(bytes, fileName);
    return r.ok ? { type: 'dataset', profile: r.profile } : { type: 'refused', reason: r.reason };
  }
  if (/\.docx$/i.test(fileName)) {
    const r = parseDocx(bytes, fileName);
    return r.ok ? { type: 'sdm', doc: r.sdm } : { type: 'refused', reason: r.reason };
  }
  if (/\.(pptx)$/i.test(fileName)) {
    const r = parsePptx(bytes, fileName);
    return r.ok ? { type: 'sdm', doc: r.sdm } : { type: 'refused', reason: r.reason };
  }
  if (/\.epub$/i.test(fileName)) {
    const r = parseEpub(bytes, fileName);
    return r.ok ? { type: 'sdm', doc: r.sdm } : { type: 'refused', reason: r.reason };
  }
  return { type: 'refused', reason: `unsupported binary kind for ${fileName} — binary support today: .xlsx/.xlsm supplements, .docx, .pptx, .epub; images/scans stay refused until the T4 tier` };
};

/** Back-compat name from the 2026-08-24 contract (xlsx-only era). */
export const ingestBytesToProfile = ingestBytes;

/**
 * SVG plot upload: deterministic digitization + points artifact persistence.
 * The SDM contract forbids inline unverified numbers, so the numeric points
 * live in a content-addressed artifact and figures carry `pointsRef` — any
 * consumer can re-verify the calibration from the artifact alone.
 */
export const ingestSvgPlot = async (
  store: ArtifactStore | null,
  fileName: string,
  text: string,
): Promise<{ ok: true; outcome: IngestOutcome; pointsRef?: string; points: SdmPlotPoints } | { ok: false; reason: string }> => {
  const r = parseSvgPlot(text, { name: fileName });
  if (!r.ok) return { ok: false, reason: r.reason };
  const { sdm, points } = r;
  if (store === null) {
    // No store = no persistable verification artifact = numeric claims unusable.
    const downgraded: SdmDocument = {
      ...sdm,
      figures: sdm.figures.map((f) => ({ ...f, perception: { status: 'not_extracted' } })),
      diagnostics: { ...sdm.diagnostics, warnings: [...sdm.diagnostics.warnings, 'no artifact store available — deterministic plot points not persisted, perception downgraded (numbers without a verifiable artifact are not evidence)'] },
    };
    return { ok: true, outcome: await ingestSdm(store, downgraded), points };
  }
  const validated = SdmPlotPoints.safeParse(points);
  if (!validated.success) return { ok: false, reason: `svg: points artifact failed its own contract: ${validated.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).slice(0, 3).join('; ')}` };
  const { ref } = await store.put(JSON.stringify(validated.data));
  const withRefs: SdmDocument = {
    ...sdm,
    figures: sdm.figures.map((f) => ({
      ...f,
      ...(f.perception.series !== undefined && f.perception.series.length > 0
        ? { perception: { ...f.perception, series: f.perception.series.map((s) => ({ ...s, pointsRef: ref })) } }
        : {}),
    })),
  };
  const outcome = await ingestSdm(store, withRefs);
  return { ok: true, outcome, pointsRef: ref, points: validated.data };
};

/** Load a persisted plot-points artifact back (fetch-by-ref family). */
export const loadPlotPointsByRef = (store: ArtifactStore, ref: string) =>
  loadArtifactDoc(store, ref, SdmPlotPoints, 'sdm-plot-points-1');

/**
 * Fetch-by-ref contract (HCI renders from the artifact store): load a stored
 * ingest artifact back and re-validate against the schema that wrote it.
 * Content-addressed refs are immutable, so a ref either round-trips exactly
 * or the artifact was never an ingest doc — both states are typed, never thrown.
 */
const loadArtifactDoc = async <T extends z.ZodTypeAny>(
  store: ArtifactStore,
  ref: string,
  schema: T,
  label: string,
): Promise<{ ok: true; doc: z.infer<T> } | { ok: false; reason: string }> => {
  const raw = await store.get(ref);
  if (raw === null) return { ok: false, reason: `artifact ${ref} not found` };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, reason: `artifact ${ref} is not valid JSON` };
  }
  const r = schema.safeParse(json);
  if (!r.success) return { ok: false, reason: `artifact ${ref} is not a ${label} document` };
  return { ok: true, doc: r.data };
};

export const loadSdmByRef = (store: ArtifactStore, ref: string) =>
  loadArtifactDoc(store, ref, SdmDocument, 'sdm-1');

export const loadDatasetProfileByRef = (store: ArtifactStore, ref: string) =>
  loadArtifactDoc(store, ref, DatasetProfileDoc, 'dsdp-1');
