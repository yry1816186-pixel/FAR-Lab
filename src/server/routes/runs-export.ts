import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { buildZip, type ZipEntry } from '../zip.js';
import { isTemplateHypothesis } from '../../domain/scientific-state.js';
import { toProvJsonLd } from '../../domain/prov-o.js';
import { EvidenceRelation, EvidenceRelationType } from '../../domain/evidence.js';
import { diagnosticityScores, removalSensitivity } from '../../domain/ach.js';
import { calibrationReport } from '../../domain/index.js';
import { excludedClaimIdsOf } from '../claim-ops.js';
import { notFound, sendJson, sendText, type RouteCtx, type RouteFamily } from '../http-kit.js';

/** Runs family, export + read projections (BC-002): the research-product
 *  artifacts (report / paper / package / bundles / PROV-O), raw drilldown and
 *  the read-only object projections (sources / evidence / hypotheses / plan /
 *  revisions / experiments / receipts / calibration). */

export function registerRunsExportRoutes(ctx: RouteCtx): RouteFamily {
  const app = ctx.app;
  const mustGetRun = ctx.mustGetRun;

  /** First-class bundle discovery (D-060: replaces the client-side event-regex scan). */
  const runBundles = (res: http.ServerResponse, runId: string): void => {
    mustGetRun(runId);
    const bundles = app.store.listObjects('bundle', runId).map((b) => ({
      id: b.id,
      createdAt: b.createdAt,
      evidenceLevel: b.declaredEvidenceLevel,
    }));
    sendJson(res, 200, { bundles });
  };

  const runReport = async (res: http.ServerResponse, runId: string): Promise<void> => {
    mustGetRun(runId);
    const latestBundle = app.store.listObjects('bundle', runId).at(-1);
    if (!latestBundle) {
      throw notFound(`no bundle stored for run ${runId} — the export stage has not produced one yet`, runId);
    }
    const reportHash = latestBundle.finalArtifactHashes[0];
    if (!reportHash) {
      throw notFound(`latest bundle ${latestBundle.id} has no report artifact hash`, runId);
    }
    const content = await app.artifacts.get(reportHash);
    if (content === null) {
      throw notFound(`report artifact missing in artifact store (${reportHash.slice(0, 16)}…)`, runId);
    }
    sendText(res, 200, 'text/markdown; charset=utf-8', content);
  };

  /**
   * BP-3 research-product artifact: the deterministic IMRaD paper markdown. Mirrors
   * runReport's artifact-lookup pattern, but resolves the bundle's paperOutlineRef —
   * absent on pre-BP3 bundles, which 404 honestly instead of serving the wrong artifact.
   */
  const runPaper = async (res: http.ServerResponse, runId: string): Promise<void> => {
    mustGetRun(runId);
    const latestBundle = app.store.listObjects('bundle', runId).at(-1);
    if (!latestBundle) {
      throw notFound(`no bundle stored for run ${runId} — the export stage has not produced one yet`, runId);
    }
    const paperRef = latestBundle.paperOutlineRef;
    if (paperRef === undefined) {
      throw notFound(`latest bundle ${latestBundle.id} carries no paper-outline artifact (pre-BP3 export)`, runId);
    }
    const content = await app.artifacts.get(paperRef);
    if (content === null) {
      throw notFound(`paper artifact missing in artifact store (${paperRef.slice(0, 16)}…)`, runId);
    }
    sendText(res, 200, 'text/markdown; charset=utf-8', content);
  };

  /**
   * CPS-7 full-package download: builds the lane-07 reproducibility package into a
   * temp dir (same engine as `far research export --format package`) and streams it
   * as a single ZIP. One-request convenience for reviewers; the CLI/dir path stays
   * authoritative (nothing is re-derived — the package is the deterministic
   * projection of stored export artifacts).
   *
   * Known limitation (audit P2-3, accepted for the single-user local product):
   * pandoc renders run spawnSync (up to 60s/format) and the zip is assembled
   * in-memory — a package request can block this single-threaded server for
   * seconds-to-minutes. MB-scale packages are fine; revisit (worker/queue) if a
   * multi-user/remote deployment mode ever lands.
   */
  const runPackageZip = async (res: http.ServerResponse, runId: string): Promise<void> => {
    mustGetRun(runId);
    const latestBundle = app.store.listObjects('bundle', runId).at(-1);
    if (!latestBundle) {
      throw notFound(`no bundle stored for run ${runId} — the export stage has not produced one yet`, runId);
    }
    const { buildReproducibilityPackage } = await import('../../report/package.js');
    const tmp = await import('node:fs/promises').then((fsp) => fsp.mkdtemp(path.join(os.tmpdir(), 'farlab-pkg-')));
    try {
      const result = await buildReproducibilityPackage({ store: app.store, artifacts: app.artifacts }, runId, { outDir: tmp });
      const fsp = await import('node:fs/promises');
      const walk = async (dir: string, prefix: string): Promise<ZipEntry[]> => {
        const out: ZipEntry[] = [];
        for (const ent of await fsp.readdir(dir, { withFileTypes: true })) {
          const rel = prefix === '' ? ent.name : `${prefix}/${ent.name}`;
          if (ent.isDirectory()) out.push(...await walk(path.join(dir, ent.name), rel));
          else out.push({ name: rel, content: await fsp.readFile(path.join(dir, ent.name)) });
        }
        return out;
      };
      const zip = buildZip(await walk(tmp, ''));
      res.writeHead(200, {
        'Content-Type': 'application/zip',
        'Content-Length': String(zip.length),
        'Content-Disposition': `attachment; filename="${runId}-farlab-package.zip"`,
        'X-Bundle-Id': result.bundleId,
      });
      res.end(zip);
    } finally {
      await import('node:fs/promises').then((fsp) => fsp.rm(tmp, { recursive: true, force: true }));
    }
  };

  return async (req, res, _url, segments) => {
    const method = req.method ?? 'GET';

    if (segments[2] !== 'runs') return false;
    const runId = segments[3]!;
    // Raw drilldown (product HCI §7: any visible result drills to raw data):
    // head rows of a dataset_record's CONTENT — csv from the content-addressed
    // artifact (text-safe); binary formats serve an honest notice instead of
    // a fabricated text preview.
    if (segments.length === 7 && segments[4] === 'datasets' && segments[5] !== undefined && segments[6] === 'sample' && method === 'GET') {
      mustGetRun(runId);
      const rec = app.store.getObject('dataset_record', segments[5]!) ?? app.store.listObjects('dataset_record', runId).find((d) => d.id === segments[5]!);
      if (rec === null || rec === undefined) { sendJson(res, 404, { error: { code: 'not_found', message: `dataset_record ${segments[5]} not found` } }); return true; }
      if (rec.format !== 'csv') {
        sendJson(res, 200, {
          datasetRecordId: rec.id, format: rec.format, binary: true,
          note: `raw ${rec.format} bytes are content-addressed (${rec.contentRef.slice(0, 19)}…) — profile/QC live in the lineage events; a text preview would be fabricated`,
          lineageKinds: rec.lineage.map((l) => l.kind).join(' -> '),
        });
        return true;
      }
      const text = await app.artifacts.get(rec.contentRef);
      if (text === null) { sendJson(res, 404, { error: { code: 'artifact_missing', message: `content artifact ${rec.contentRef.slice(0, 19)}… not in store` } }); return true; }
      const lines = text.split(/\r?\n/);
      sendJson(res, 200, {
        datasetRecordId: rec.id, format: 'csv', binary: false,
        header: lines[0] ?? '', totalLines: Math.max(0, lines.length - 1 - (text.endsWith('\n') ? 1 : 0)),
        preview: lines.slice(0, 11).join('\n'), contentRef: rec.contentRef,
      });
      return true;
    }
    if (segments.length === 5) {
      const leaf = segments[4]!;
      // RU-2 interop: PROV-O JSON-LD export from the lineage_edges single source.
      if (leaf === 'prov' && method === 'GET') {
        mustGetRun(runId);
        const edges = app.store.listLineageEdges({ runId });
        // RU-6: enrich evidence edges with their original relation type so the
        // CiTO IRI is exact (lineage edges carry the collapsed counter/support kind).
        const relationTypes: Record<string, EvidenceRelationType> = {};
        for (const rel of app.store.listObjects('evidence_relation', runId)) {
          const parsedRel = EvidenceRelationType.safeParse(rel.relation);
          if (parsedRel.success) relationTypes[rel.id] = parsedRel.data;
        }
        const graph = toProvJsonLd({ rootRunId: runId, runs: [{ id: runId }], edges, relationTypes });
        sendJson(res, 200, graph);
        return true;
      }
      if (leaf === 'report' && method === 'GET') { await runReport(res, runId); return true; }
      if (leaf === 'paper' && method === 'GET') { await runPaper(res, runId); return true; }
      if (leaf === 'package' && method === 'GET') { await runPackageZip(res, runId); return true; }
      if (leaf === 'sources' && method === 'GET') {
        mustGetRun(runId);
        sendJson(res, 200, { sources: app.store.listObjects('source_document', runId) });
        return true;
      }
      if (leaf === 'evidence' && method === 'GET') {
        mustGetRun(runId);
        sendJson(res, 200, {
          claims: app.store.listObjects('claim', runId),
          relations: app.store.listObjects('evidence_relation', runId),
        });
        return true;
      }
      if (leaf === 'hypotheses' && method === 'GET') {
        mustGetRun(runId);
        const achAnalysisRaw = app.store.listObjects('ach_analysis', runId).at(-1) ?? null;
        // Real-content discipline (owner directive 2026-08-29): template
        // hypotheses minted by legacy offline runs stay in the store (audit
        // truth plane) but are NEVER served as scientific objects. Scorecards,
        // evidence bodies, and tournament standings follow their hypotheses.
        const allHyps = app.store.listObjects('hypothesis', runId);
        const realHyps = allHyps.filter((h) => !isTemplateHypothesis(h));
        const realHypIds = new Set(realHyps.map((h) => h.id));
        // ACH matrices referencing only template hypotheses follow the same
        // exclusion (red-team P2-2): an ACH over hypotheses absent from the
        // served list is not a comparable scientific view.
        const achAnalysis = achAnalysisRaw !== null && achAnalysisRaw.hypothesisIds.some((id) => realHypIds.has(id))
          ? achAnalysisRaw
          : null;
        // HX §15 downstream semantics of claim exclusion: a read-time
        // researcher-adjusted PROJECTION recomputed with the same pure
        // functions the pipeline used (stored AchAnalysis stays untouched;
        // both views are disclosed — the exclusion is a judgement, not an
        // erasure). Null when nothing is excluded.
        let achResearcherAdjusted: {
          excludedClaimIds: string[];
          diagnosticity: ReturnType<typeof diagnosticityScores>;
          removalSensitivity: ReturnType<typeof removalSensitivity>;
          method: string;
        } | null = null;
        const excludedClaimIds = excludedClaimIdsOf(app.store.listObjects('claim', runId));
        if (achAnalysis !== null && excludedClaimIds.length > 0) {
          // Stored relations re-validated through the domain schema (honest
          // narrowing, no blind cast), then the excluded claims' rows drop.
          const keptRelations = app.store.listObjects('evidence_relation', runId)
            .flatMap((r) => {
              const parsed = EvidenceRelation.safeParse(r);
              return parsed.success ? [parsed.data] : [];
            })
            .filter((r) => r.claimId === undefined || !excludedClaimIds.includes(r.claimId));
          achResearcherAdjusted = {
            excludedClaimIds,
            diagnosticity: diagnosticityScores(keptRelations),
            removalSensitivity: removalSensitivity(keptRelations, achAnalysis.hypothesisIds),
            method: 'heuer-diagnosticity-v1-researcher-adjusted',
          };
        }
        sendJson(res, 200, {
          hypotheses: realHyps,
          scorecards: app.store.listObjects('scorecard', runId).filter((s) => realHypIds.has(s.hypothesisId)),
          // D-016: pairwise tournament evidence behind the final ordering (uncertainty included).
          // Real-content discipline: standings won against template-only participants are
          // not evidence about real ranking — the tournament object serves only when at
          // least one real hypothesis took part (stored object itself stays untouched).
          tournament: (() => {
            const t = app.store.listObjects('tournament', runId).at(-1) ?? null;
            if (t === null) return null;
            return t.standings.some((s) => realHypIds.has(s.hypothesisId)) ? t : null;
          })(),
          // Wave-S g8/g9: hypothesis-level evidence bodies (floor certainty, independent
          // sources, Σlog-LR band, QBAF+Carneades, orthogonal promotion) + ACH audit
          evidenceBodies: app.store.listObjects('evidence_body', runId).filter((b) => realHypIds.has(b.hypothesisId)),
          achAnalysis,
          achResearcherAdjusted,
        });
        return true;
      }
      if (leaf === 'plan' && method === 'GET') {
        mustGetRun(runId);
        sendJson(res, 200, { plan: app.store.listObjects('plan', runId).at(-1) ?? null });
        return true;
      }
      if (leaf === 'revisions' && method === 'GET') {
        mustGetRun(runId);
        sendJson(res, 200, {
          feedbacks: app.store.listObjects('feedback', runId),
          revisions: app.store.listObjects('revision', runId),
          versionDiffs: app.store.listObjects('version_diff', runId),
        });
        return true;
      }
      if (leaf === 'experiments' && method === 'GET') {
        // EEL read surface (D-081): far.db projections only — queue-level operational
        // detail (fence tokens, heartbeats) stays with `far experiment status`.
        mustGetRun(runId);
        sendJson(res, 200, {
          experimentRuns: app.store.listObjects('experiment_run', runId),
          resultSets: app.store.listObjects('result_set', runId),
          statReports: app.store.listObjects('stat_report', runId),
          experimentSpecs: app.store.listObjects('experiment_spec', runId),
          femSpecs: app.store.listObjects('fem_spec', runId),
          datasetRecords: app.store.listObjects('dataset_record', runId),
        });
        return true;
      }
      if (leaf === 'receipts' && method === 'GET') {
        mustGetRun(runId);
        sendJson(res, 200, { receipts: app.store.listObjects('receipt', runId) });
        return true;
      }
      if (leaf === 'calibration' && method === 'GET') {
        // Wave-S L4 self-calibration surface: the system's own forward predictions,
        // settlement state, and the pooled proper-score report (RPS vs the ignorance
        // baseline; n<30 strata honestly say "insufficient evidence").
        mustGetRun(runId);
        const entries = app.store.listObjects('prediction', runId);
        sendJson(res, 200, { entries, report: calibrationReport(entries) });
        return true;
      }
      if (leaf === 'bundles' && method === 'GET') { runBundles(res, runId); return true; }
    }
    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
