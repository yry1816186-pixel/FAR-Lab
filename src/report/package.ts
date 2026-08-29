import fs from 'node:fs';
import path from 'node:path';
import type { ReproducibilityBundle } from '../domain/index.js';
import { buildPaperOutline } from '../pipeline/paper-outline.js';
import type { Store } from '../persistence/store.js';
import type { ArtifactStore } from '../shared/ports.js';
import { canonicalJson, sha256Hex } from '../shared/crypto.js';
import { checkCitationIntegrity, renderBibliographyFile, type CitationIntegrity } from './citations.js';
import { buildClaimBindingTable, buildCorpusTable, buildResultsTable, tableToCsv, tableToMarkdown } from './tables.js';
import { buildCorpusDepthFigure, buildWinRateFigure } from './figures.js';
import { detectPandoc, renderWithPandoc, PANDOC_FORMATS, PANDOC_MEDIA_TYPES, type PandocFormat, type PandocInfo } from './pandoc.js';
import { APACHE_2_LICENSE, buildRoCrate } from './rocrate.js';

/**
 * Lane-07 reproducibility package: the complete human+machine export contract on disk.
 *
 * paper.md / report.md are the STORED export artifacts (bytes pulled from the content-
 * addressed store, hash-verified against the bundle) — the package never re-renders what
 * the pipeline already produced. references.bib / figures / tables are re-projected from
 * the SAME store deterministically (now = bundle.createdAt) so two builds of the same
 * bundle are byte-identical. Every file lands in MANIFEST.json (sha256); scholarly files
 * additionally get an RO-Crate 1.1 descriptor. Pandoc formats are best-effort: absent
 * pandoc or a failed conversion is disclosed, never faked; unresolved citations are a
 * HARD failure (fail closed before pandoc).
 */

export interface PackageOptions {
  outDir: string;
  /** Requested pandoc formats (default: all available). Unknown names are rejected. */
  formats?: readonly string[];
  /** Injectable for tests; default is runtime detection. Explicit null disables pandoc. */
  pandoc?: PandocInfo | null;
}

export interface PackageResult {
  dir: string;
  bundleId: string;
  runId: string;
  /** Logical paths (forward-slash) + hashes of everything written (excludes MANIFEST.json). */
  files: ReadonlyArray<{ path: string; sha256: string; bytes: number }>;
  paperIncluded: boolean;
  citations: CitationIntegrity | null;
  pandoc: {
    version: string | null;
    produced: PandocFormat[];
    unavailable: Array<{ format: string; reason: string }>;
  };
}

const isPandocFormat = (v: string): v is PandocFormat => (PANDOC_FORMATS as readonly string[]).includes(v);

export const buildReproducibilityPackage = async (
  deps: { store: Store; artifacts: ArtifactStore },
  runId: string,
  opts: PackageOptions,
): Promise<PackageResult> => {
  const run = deps.store.getRun(runId);
  if (run === null) throw new Error(`buildReproducibilityPackage: run not found: ${runId}`);
  const bundles = deps.store.listObjects('bundle', runId);
  if (bundles.length === 0) {
    throw new Error(`no reproducibility bundle stored for run ${runId} — run the export stage first (far research resume ${runId})`);
  }
  const bundle = bundles[bundles.length - 1]! as ReproducibilityBundle;

  // ---- projection-basis gate (export-audit P2, root fix): the package must be ----
  // internally consistent — bib/figures/tables are re-projected from the CURRENT
  // store while paper/report are the stored bundle bytes. If the store grew past
  // the bundle (counter-search added sources post-export), the package would
  // silently mix two evidence bases. Fail closed and point at the re-export
  // (the export stage re-runs automatically on resume for exactly this case).
  const storedSources = deps.store.listObjects('source_document', runId).length;
  if (storedSources > bundle.sourceArtifactHashes.length) {
    throw new Error(
      `store drift: run ${runId} now has ${storedSources} source documents but bundle ${bundle.id} covers ${bundle.sourceArtifactHashes.length} — ` +
      `re-export first (far research resume ${runId}); a package must project exactly the bundled evidence`,
    );
  }

  // ---- stored artifacts (bytes are the pipeline's own output; hash must match bundle) ----
  const written: Array<{ path: string; content: Buffer; encodingFormat: string; name: string; crate: boolean }> = [];
  const reportHash = bundle.finalArtifactHashes[0];
  if (reportHash === undefined) throw new Error(`bundle ${bundle.id} carries no report artifact hash (finalArtifactHashes empty)`);
  const reportBytes = await deps.artifacts.get(`sha256:${reportHash}`);
  if (reportBytes === null) {
    throw new Error(`report artifact missing in artifact store (sha256:${reportHash.slice(0, 16)}…) — the bundle references an unavailable artifact`);
  }
  const reportSha = sha256Hex(reportBytes);
  if (reportSha !== reportHash) {
    throw new Error(`report artifact hash mismatch: bundle declares ${reportHash.slice(0, 16)}…, store holds ${reportSha.slice(0, 16)}…`);
  }
  written.push({ path: 'report.md', content: Buffer.from(reportBytes, 'utf8'), encodingFormat: 'text/markdown', name: 'FAR-Lab run report (Chinese)', crate: true });

  let paperBytes: string | null = null;
  if (bundle.paperOutlineRef !== undefined) {
    paperBytes = await deps.artifacts.get(bundle.paperOutlineRef);
    if (paperBytes === null) {
      throw new Error(`paper artifact missing in artifact store (${bundle.paperOutlineRef.slice(0, 16)}…) — the bundle references an unavailable artifact`);
    }
    const paperSha = sha256Hex(paperBytes);
    if (paperSha !== bundle.paperOutlineRef.replace('sha256:', '')) {
      throw new Error(`paper artifact hash mismatch: bundle declares ${bundle.paperOutlineRef.slice(0, 16)}…, store holds ${paperSha.slice(0, 16)}…`);
    }
    written.push({ path: 'paper.md', content: Buffer.from(paperBytes, 'utf8'), encodingFormat: 'text/markdown', name: 'Deterministic IMRaD paper (markdown)', crate: true });
  }

  // ---- deterministic re-projection for bib/figures/tables (store -> same store, fixed now) ----
  const now = bundle.createdAt;
  const outline = buildPaperOutline(deps.store, runId, { now });
  const sources = deps.store.listObjects('source_document', runId);
  const claims = deps.store.listObjects('claim', runId);

  const bibText = renderBibliographyFile(outline.references);
  if (outline.references.length > 0) {
    written.push({ path: 'references.bib', content: Buffer.from(bibText, 'utf8'), encodingFormat: 'text/x-bibtex', name: 'Bibliography (BibTeX, from stored metadata)', crate: true });
  }

  // Citation integrity against the STORED paper bytes — the shipped document is the authority.
  let citations: CitationIntegrity | null = null;
  if (paperBytes !== null) {
    citations = checkCitationIntegrity(paperBytes, outline.references);
    if (citations.unresolved.length > 0) {
      throw new Error(`citation integrity failure in stored paper: unresolved keys ${citations.unresolved.join(', ')} (bibliography has ${outline.references.length} entries)`);
    }
  }

  // ---- figures ----
  written.push({ path: 'figures/win-rate.svg', content: Buffer.from(buildWinRateFigure(outline, { runId, generatedAt: now }), 'utf8'), encodingFormat: 'image/svg+xml', name: 'Figure 1: win rate by ranked hypothesis', crate: true });
  written.push({ path: 'figures/corpus-depth.svg', content: Buffer.from(buildCorpusDepthFigure(sources, { runId, generatedAt: now }), 'utf8'), encodingFormat: 'image/svg+xml', name: 'Figure 2: retrieved corpus by content depth', crate: true });

  // ---- tables (machine CSV + human markdown) ----
  const tables = [
    buildResultsTable(outline),
    buildCorpusTable(sources),
    buildClaimBindingTable(claims),
  ];
  for (const t of tables) {
    written.push({ path: `tables/${t.name}.csv`, content: Buffer.from(tableToCsv(t), 'utf8'), encodingFormat: 'text/csv', name: `Table: ${t.name} (CSV)`, crate: true });
  }
  const tablesMd = [
    `<!-- All tables are deterministic projections of stored run objects; per-column provenance inline. Generated ${now} -->`,
    ...tables.map((t) => `## ${t.name}\n\n${tableToMarkdown(t)}\n`),
  ].join('\n');
  written.push({ path: 'tables/tables.md', content: Buffer.from(tablesMd, 'utf8'), encodingFormat: 'text/markdown', name: 'All tables (markdown)', crate: true });

  // ---- bundle.json (canonical serialization of the stored bundle object) ----
  written.push({ path: 'bundle.json', content: Buffer.from(canonicalJson(bundle), 'utf8'), encodingFormat: 'application/json', name: 'Reproducibility bundle (machine contract)', crate: true });

  // ---- protocol chain (slice 4): frozen specs + human-attested ledgers on disk ----
  for (const pe of bundle.protocolEvidence ?? []) {
    const proto = deps.store.getObject('protocol', pe.protocolId);
    if (proto === null) {
      throw new Error(`bundle ${bundle.id} declares protocol ${pe.protocolId} but the store has no such object — re-export first; a package must project exactly the bundled evidence`);
    }
    const protoBytes = canonicalJson(proto);
    if (sha256Hex(protoBytes) !== pe.protocolArtifactHash) {
      throw new Error(`protocol ${pe.protocolId} bytes drifted from the bundle's declared artifact hash — re-export first`);
    }
    written.push({ path: `protocol/${pe.protocolId}.json`, content: Buffer.from(protoBytes, 'utf8'), encodingFormat: 'application/json', name: `Pre-registered research protocol (${proto.paradigm})`, crate: true });
    if (pe.executionId !== null) {
      const ledger = deps.store.getObject('protocol_execution', pe.executionId);
      if (ledger === null) {
        throw new Error(`bundle ${bundle.id} declares ledger ${pe.executionId} but the store has no such object — re-export first`);
      }
      const ledgerBytes = canonicalJson(ledger);
      if (pe.ledgerArtifactHash !== null && sha256Hex(ledgerBytes) !== pe.ledgerArtifactHash) {
        throw new Error(`ledger ${pe.executionId} bytes drifted from the bundle's declared artifact hash — re-export first`);
      }
      written.push({ path: `protocol/${pe.executionId}.ledger.json`, content: Buffer.from(ledgerBytes, 'utf8'), encodingFormat: 'application/json', name: `Human-attested execution ledger (${pe.deviations} deviations, ${pe.qcFailedMeasurements} QC-failed measurements)`, crate: true });
    }
  }

  // ---- pandoc conversion (best-effort, honestly reported) ----
  const produced: PandocFormat[] = [];
  const unavailable: Array<{ format: string; reason: string }> = [];
  const requested = opts.formats !== undefined ? [...opts.formats] : [...PANDOC_FORMATS];
  for (const f of requested) {
    if (!isPandocFormat(f)) throw new Error(`unknown pandoc format "${f}" — valid: ${PANDOC_FORMATS.join(', ')}`);
  }
  const pandocInfo = opts.pandoc !== undefined ? opts.pandoc : detectPandoc();
  if (pandocInfo === null) {
    for (const f of requested) unavailable.push({ format: f, reason: 'pandoc not found (set FARLAB_PANDOC_PATH or install pandoc)' });
  } else if (paperBytes === null) {
    for (const f of requested) unavailable.push({ format: f, reason: 'bundle carries no paper artifact (pre-BP3 export)' });
  } else {
    for (const f of requested as PandocFormat[]) {
      try {
        const out = renderWithPandoc({ markdown: paperBytes, bibliography: bibText, format: f, pandoc: pandocInfo });
        const ext = f === 'jats' ? 'jats.xml' : f;
        written.push({ path: `paper.${ext}`, content: out.bytes, encodingFormat: PANDOC_MEDIA_TYPES[f], name: `Paper (${f.toUpperCase()} via pandoc ${pandocInfo.version} + citeproc)`, crate: true });
        produced.push(f);
      } catch (e) {
        unavailable.push({ format: f, reason: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  // ---- write everything, then MANIFEST over what exists (MANIFEST excludes itself) ----
  const outDir = path.resolve(opts.outDir);
  fs.mkdirSync(outDir, { recursive: true });
  const entries: Array<{ path: string; sha256: string; bytes: number }> = [];
  for (const f of written) {
    const fsPath = path.join(outDir, ...f.path.split('/'));
    fs.mkdirSync(path.dirname(fsPath), { recursive: true });
    fs.writeFileSync(fsPath, f.content);
    entries.push({ path: f.path, sha256: sha256Hex(f.content), bytes: f.content.length });
  }
  const manifest = {
    algorithm: 'sha256',
    bundleId: bundle.id,
    runId,
    generatedFrom: 'stored export artifacts + deterministic store re-projection (timestamps pinned to bundle.createdAt)',
    files: Object.fromEntries(entries.map((e) => [e.path, { sha256: e.sha256, bytes: e.bytes }])),
  };
  fs.writeFileSync(path.join(outDir, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // ---- RO-Crate over the scholarly files (paper/report/bib/figures/tables/bundle.json) ----
  const crateFiles = written
    .filter((f) => f.crate)
    .map((f) => {
      const e = entries.find((x) => x.path === f.path)!;
      return { path: f.path, sha256: e.sha256, encodingFormat: f.encodingFormat, name: f.name };
    });
  const crate = buildRoCrate({
    name: `FAR-Lab reproducibility package — run ${runId}`,
    description: `Scientific communication export for FAR-Lab run ${runId} (bundle ${bundle.id}). Paper, report, figures, tables, bibliography and the machine-readable reproducibility bundle, all deterministically projected from stored run objects.`,
    datePublished: now,
    license: APACHE_2_LICENSE,
    files: crateFiles,
    software: { name: 'FAR-Lab', version: bundle.codeRevision },
  });
  fs.writeFileSync(path.join(outDir, 'ro-crate-metadata.json'), `${JSON.stringify(crate, null, 2)}\n`);

  // ---- README (human entry point; deterministic — no wall-clock) ----
  const readme = buildReadme({ runId, bundle, entries, citations, pandoc: { version: pandocInfo?.version ?? null, produced, unavailable }, paperIncluded: paperBytes !== null });
  fs.writeFileSync(path.join(outDir, 'README.md'), readme);

  return {
    dir: outDir,
    bundleId: bundle.id,
    runId,
    files: entries,
    paperIncluded: paperBytes !== null,
    citations,
    pandoc: { version: pandocInfo?.version ?? null, produced, unavailable },
  };
};

const MANIFEST_CHECK_CMD = 'node -e "const m=require(\'./MANIFEST.json\').files,c=require(\'crypto\'),f=require(\'fs\');let ok=true;for(const[p,e]of Object.entries(m)){if(c.createHash(\'sha256\').update(f.readFileSync(p)).digest(\'hex\')!==e.sha256){ok=false;console.error(\'MISMATCH\',p)}}console.log(ok?\'MANIFEST OK\':\'MANIFEST FAILED\');process.exit(ok?0:1)"';

const buildReadme = (a: {
  runId: string;
  bundle: ReproducibilityBundle;
  entries: ReadonlyArray<{ path: string; sha256: string; bytes: number }>;
  citations: CitationIntegrity | null;
  pandoc: { version: string | null; produced: PandocFormat[]; unavailable: Array<{ format: string; reason: string }> };
  paperIncluded: boolean;
}): string => {
  const L: string[] = [];
  L.push(`# FAR-Lab reproducibility package — run ${a.runId}`, '');
  L.push(`- Bundle: \`${a.bundle.id}\` (declaredEvidenceLevel: \`${a.bundle.declaredEvidenceLevel}\`)`);
  L.push(`- Generated from bundle state pinned at \`${a.bundle.createdAt}\` — rebuilding the package from the same store reproduces these files byte-for-byte.`);
  L.push(`- Code revision: \`${a.bundle.codeRevision}\` · environment: ${a.bundle.environmentFingerprint}`);
  L.push(`- Citation integrity: ${
    a.citations === null
      ? 'not checked (no paper artifact in this bundle)'
      : `${a.citations.citedKeys.length} key(s) cited inline, ${a.citations.unresolved.length} unresolved, ${a.citations.uncited.length} bibliography entry/entries not cited inline`
  }.`);
  L.push(`- Pandoc: ${a.pandoc.version !== null ? `v${a.pandoc.version}, produced ${a.pandoc.produced.join(', ') || '(none)'}` : 'not available'}`);
  for (const u of a.pandoc.unavailable) L.push(`  - unavailable: ${u.format} — ${u.reason}`);
  L.push('');
  L.push('## Files', '');
  for (const e of a.entries) L.push(`- \`${e.path}\` — ${e.bytes} B, sha256 \`${e.sha256.slice(0, 16)}…\``);
  L.push('- `MANIFEST.json` — sha256 of every file above (excludes itself)');
  L.push('- `ro-crate-metadata.json` — RO-Crate 1.1 descriptor of the scholarly files');
  L.push('- `README.md` — this file');
  L.push('');
  L.push('## Verify', '');
  L.push('1. Bundle-level (from a FAR-Lab checkout with this data dir): `far verify ' + a.bundle.id + '`');
  L.push(`2. Package-level (from this directory): \`${MANIFEST_CHECK_CMD}\``);
  L.push(`3. paper.md / report.md are the stored pipeline artifacts; their sha256 values equal bundle.json's finalArtifactHashes[1]/[0].`);
  L.push('');
  L.push('## Limitations (from the bundle, verbatim)', '');
  if (a.bundle.limitations.length === 0) L.push('(none recorded)');
  for (const lim of a.bundle.limitations) L.push(`- ${lim}`);
  L.push('');
  return L.join('\n');
};
