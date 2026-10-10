import http from 'node:http';
import { ingestPdfTextPayload, ingestSdm, ingestTextToSdm, ingestBytes, persistDatasetProfile, loadSdmByRef, loadDatasetProfileByRef, ingestSvgPlot, loadPlotPointsByRef, jsonRefusalReason, type IngestOutcome } from '../../ingest/service.js';
import type { DatasetProfileDoc } from '../../ingest/dataset.js';
import { notFound, readJsonObject, sendJson, validation, type RouteCtx, type RouteFamily } from '../http-kit.js';

/** Ingest family (BC-002): deterministic multimodal artifact understanding. */

export function registerIngestRoutes(ctx: RouteCtx): RouteFamily {
  const app = ctx.app;

  // ---- MULTIMODAL ingest (2026-08-24): deterministic artifact understanding ----
  // POST /api/v1/ingest — one endpoint, two producer shapes:
  //   { kind: 'pdf_text', fileName, payload }  ← web pdfjs collector output
  //   { kind: 'text', fileName, text }         ← server-side parse by extension
  // Returns the SDM (or dataset profile), its immutable artifact ref, and the
  // seeds-pipeline text projection. Failures are 422 with precise field errors.

  const ingestRoute = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const body = await readJsonObject(req);
    const kind = body['kind'];
    const fileName = typeof body['fileName'] === 'string' ? body['fileName'] : '';
    if (typeof fileName !== 'string' || fileName.length === 0 || fileName.length > 300 || fileName.includes('/') || fileName.includes('\\') || fileName.includes('\0')) {
      throw validation('ingest: fileName must be a 1-300 char basename (no path separators)');
    }
    // Shared response for both producers of dataset profiles (text/csv|tsv and bytes/xlsx).
    const sendDatasetProfile = async (profile: DatasetProfileDoc): Promise<void> => {
      const artifactRef = await persistDatasetProfile(app.artifacts, profile);
      sendJson(res, 200, {
        artifactRef,
        type: 'dataset_profile',
        profile: {
          schemaVersion: profile.schemaVersion,
          format: profile.format,
          rowCount: profile.rowCount,
          columnCount: profile.columnCount,
          columns: profile.columns.map((c) => ({ name: c.name, inferredType: c.inferredType, missingCount: c.missingCount, ...(c.unitHint !== undefined ? { unitHint: c.unitHint } : {}), significanceNotation: c.significanceNotation })),
          quality: profile.quality,
          diagnostics: profile.diagnostics,
        },
      });
    };
    if (kind === 'pdf_text') {
      const r = ingestPdfTextPayload(body['payload'], fileName);
      if (!r.ok) throw validation(`ingest pdf_text payload rejected: ${r.errors.slice(0, 5).join('; ')}`);
      const out = await ingestSdm(app.artifacts, r.sdm);
      sendJson(res, 200, ingestSummary(out));
      return;
    }
    if (kind === 'text') {
      const text = body['text'];
      if (typeof text !== 'string' || text.length === 0) throw validation('ingest: text must be a non-empty string');
      if (text.length > 10 * 1024 * 1024) throw validation('ingest: text exceeds 10MB');
      if (/\.svg$/i.test(fileName)) {
        const r = await ingestSvgPlot(app.artifacts, fileName, text);
        if (!r.ok) throw validation(`ingest: ${r.reason}`);
        sendJson(res, 200, { ...ingestSummary(r.outcome), ...(r.pointsRef !== undefined ? { pointsRef: r.pointsRef, seriesCount: r.points.series.length } : {}) });
        return;
      }
      const routed = ingestTextToSdm(fileName, text);
      if (routed === null) {
        const detail = /\.json$/i.test(fileName) ? ` — ${jsonRefusalReason(text)}` : ' — see MULTIMODAL.md for the format matrix';
        throw validation(`ingest: unsupported file kind for ${fileName}${detail}`);
      }
      if (routed.type === 'dataset') {
        await sendDatasetProfile(routed.profile);
        return;
      }
      const out = await ingestSdm(app.artifacts, routed.doc);
      sendJson(res, 200, ingestSummary(out));
      return;
    }
    if (kind === 'bytes') {
      // Binary supplements (xlsx): base64 body, binary router by extension.
      const base64 = body['base64'];
      if (typeof base64 !== 'string' || base64.length === 0) throw validation('ingest: base64 must be a non-empty string');
      const bytes = Buffer.from(base64, 'base64');
      if (bytes.length === 0) throw validation('ingest: base64 did not decode to any bytes');
      if (bytes.length > 15 * 1024 * 1024) throw validation('ingest: bytes exceed 15MB');
      const routed = ingestBytes(fileName, bytes);
      if (routed.type === 'refused') throw validation(`ingest: ${routed.reason}`);
      if (routed.type === 'sdm') {
        const out = await ingestSdm(app.artifacts, routed.doc);
        sendJson(res, 200, ingestSummary(out));
        return;
      }
      await sendDatasetProfile(routed.profile);
      return;
    }
    throw validation('ingest: kind must be "pdf_text", "text" or "bytes"');
  };

  const ingestSummary = (out: IngestOutcome): Record<string, unknown> => ({
    artifactRef: out.artifactRef,
    seedTextTruncated: out.seedTextTruncated,
    type: 'sdm',
    sdm: {
      schemaVersion: out.sdm.schemaVersion,
      extractor: out.sdm.extractor,
      meta: out.sdm.meta,
      counts: {
        blocks: out.sdm.blocks.length,
        figures: out.sdm.figures.length,
        tables: out.sdm.tables.length,
        equations: out.sdm.equations.length,
        citations: out.sdm.citations.length,
        xrefs: out.sdm.xrefs.length,
        xrefsResolved: out.sdm.xrefs.filter((x) => x.status === 'resolved').length,
      },
      diagnostics: out.sdm.diagnostics,
    },
  });

  // GET /api/v1/ingest/:ref — fetch a stored ingest artifact back (HCI renders
  // from the immutable store instead of caching payloads in client state).
  // Serves sdm-1 and dsdp-1; any other ref under this namespace is an honest 404.
  const ingestGetByRef = async (res: http.ServerResponse, ref: string): Promise<void> => {
    if (!/^sha256:[0-9a-f]{64}$/.test(ref)) throw validation('ingest: ref must be a sha256:<64 hex> artifact ref');
    const sdm = await loadSdmByRef(app.artifacts, ref);
    if (sdm.ok) {
      sendJson(res, 200, { kind: 'sdm', sdm: sdm.doc });
      return;
    }
    const profile = await loadDatasetProfileByRef(app.artifacts, ref);
    if (profile.ok) {
      sendJson(res, 200, { kind: 'dataset_profile', profile: profile.doc });
      return;
    }
    const plotPoints = await loadPlotPointsByRef(app.artifacts, ref);
    if (plotPoints.ok) {
      sendJson(res, 200, { kind: 'plot_points', points: plotPoints.doc });
      return;
    }
    throw notFound(`ingest artifact not found: ${ref}`);
  };

  return async (req, res, _url, segments) => {
    const method = req.method ?? 'GET';

    if (segments[2] !== 'ingest') return false;
    if (segments.length === 3 && method === 'POST') {
      await ingestRoute(req, res);
      return true;
    }
    if (segments.length === 4 && method === 'GET') {
      const ref = segments[3];
      if (ref === undefined) throw notFound(`no route: ${method} ${_url.pathname}`);
      await ingestGetByRef(res, ref);
      return true;
    }
    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
