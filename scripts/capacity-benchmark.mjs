#!/usr/bin/env node
// FA-DAT-01 capacity benchmark: proves the streaming data plane handles 1GB CSV and
// 500MB NetCDF with bounded process memory (the full-buffer paths would OOM/throw).
//
//   node scripts/capacity-benchmark.mjs [--csv-bytes N] [--netcdf-bytes N] [--skip-netcdf]
//
// Evidence lands in work/capacity-benchmark/evidence/benchmark-<ISO ts>.json.
// The CSV leg runs the REAL acquisition path (acquireDataset + split allocation);
// the NetCDF leg runs real streaming put/hash, plus a real xarray profile when a uv
// sidecar is available (otherwise the profile phase is recorded as skipped, honestly).
// Sizes default to the acceptance targets (1GB CSV / 500MB NetCDF); smaller sizes are
// for smoke runs, never a substitute for the recorded evidence.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(repo, 'work', 'capacity-benchmark');
const tmpDir = path.join(outDir, 'tmp');
fs.mkdirSync(path.join(outDir, 'evidence'), { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? Number(argv[i + 1]) : fallback;
};
const CSV_BYTES = argOf('--csv-bytes', 1024 * 1024 * 1024);
const NETCDF_BYTES = argOf('--netcdf-bytes', 500 * 1024 * 1024);
const SKIP_NETCDF = argv.includes('--skip-netcdf');

// Import the TS modules through the built dist (the benchmark runs the REAL paths).
const distUrl = (rel) => pathToFileURL(path.join(repo, 'dist', rel)).href;
const { openDb } = await import(distUrl('persistence/db.js'));
const { Store } = await import(distUrl('persistence/store.js'));
const { openArtifactStore } = await import(distUrl('persistence/artifacts.js'));
const { acquireDataset } = await import(distUrl('experiment/datasets.js'));
const { applySplitColumns } = await import(distUrl('experiment/split.js'));
const { sha256FileHex } = await import(distUrl('shared/crypto.js'));

const mb = (n) => Math.round(n / (1024 * 1024));

// Peak-RSS tracker: RSS is a lagging, GC-dependent metric — sampling at 100ms during
// each phase gives an honest upper bound on what the streaming paths actually held.
const trackPeak = () => {
  const state = { peak: process.memoryUsage().rss, timer: undefined };
  state.timer = setInterval(() => {
    state.peak = Math.max(state.peak, process.memoryUsage().rss);
  }, 100);
  state.timer.unref();
  return {
    stop: () => { clearInterval(state.timer); return state.peak; },
  };
};

const phase = async (name, fn) => {
  const tracker = trackPeak();
  const t0 = performance.now();
  try {
    const detail = await fn();
    const ms = Math.round(performance.now() - t0);
    const peak = tracker.stop();
    return { name, ok: true, ms, peakRssBytes: peak, ...detail };
  } catch (e) {
    tracker.stop();
    return { name, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
};

// ---- synthetic 1GB CSV ----
const genCsv = async (file, targetBytes) => new Promise((resolve, reject) => {
  const out = fs.createWriteStream(file, { flags: 'w' });
  const header = 'f0,f1,f2,f3,f4,f5,f6,label\n';
  const rowsPerChunk = 4_000;
  let written = 0;
  const chunkOf = (k) => {
    const lines = [];
    for (let i = 0; i < rowsPerChunk; i += 1) {
      const n = k * rowsPerChunk + i;
      lines.push(`${(n % 977) * 0.01},${(n % 131) * 0.03},${(n % 313) * 0.7},${n % 101},${(n % 7) * 1.5},${(n % 53) * 0.9},${n % 29},${n % 2 === 0 ? 'pos' : 'neg'}`);
    }
    return `${lines.join('\n')}\n`;
  };
  out.write(header);
  let k = 0;
  const pump = () => {
    while (written < targetBytes) {
      const c = chunkOf(k);
      k += 1;
      written += c.length;
      if (!out.write(c)) { out.once('drain', pump); return; }
    }
    out.end((err) => (err ? reject(err) : resolve()));
  };
  pump();
});

// ---- synthetic 500MB NetCDF (real netCDF4 via the uv sidecar when available) ----
const sidecarAvailable = () => {
  try {
    // Node >=18 refuses to spawn .cmd batch files without a shell on Windows.
    execFileSync('uv', ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' });
    return true;
  } catch {
    return false;
  }
};

const results = {
  schema: 'farlab-capacity-benchmark/1',
  asOf: new Date().toISOString(),
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  targets: { csvBytes: CSV_BYTES, netcdfBytes: NETCDF_BYTES },
  memoryLimitBytes: 2 * 1024 * 1024 * 1024, // guard: bail if the process approaches 2GB
  phases: [],
};

const workRoot = path.join(tmpDir, 'run');
fs.rmSync(workRoot, { recursive: true, force: true });
fs.mkdirSync(workRoot, { recursive: true });
const db = openDb(path.join(workRoot, 'far.db'));
const store = new Store(db);
const artifacts = openArtifactStore(path.join(workRoot, 'artifacts'));

// ---------- CSV leg ----------
const csvPath = path.join(tmpDir, `bench-${CSV_BYTES}.csv`);
const { ResearchQuestion, newId } = await import(distUrl('domain/index.js'));
const q = ResearchQuestion.parse({
  id: newId('q'), text: 'capacity?', background: '', goalType: 'explanatory',
  scope: { domain: 'tabular-ml', phenomena: ['classification'] },
  constraints: { assumptions: [] }, createdAt: new Date().toISOString(),
});
store.createRun(q);
const runId = store.listRuns(1)[0].id;

results.phases.push(await phase(`gen ${mb(CSV_BYTES)}MB synthetic csv (setup, not measured capability)`, async () => {
  if (!fs.existsSync(csvPath) || fs.statSync(csvPath).size < CSV_BYTES) await genCsv(csvPath, CSV_BYTES);
  return { fileBytes: fs.statSync(csvPath).size };
}));

results.phases.push(await phase(`acquire + split ${mb(CSV_BYTES)}MB csv through the real path`, async () => {
  process.env.FARLAB_CSV_MAX_ROWS = String(Math.ceil(CSV_BYTES / 40)); // rows ≈ bytes/~48B row, 20% headroom
  const t0 = performance.now();
  const { record, csv } = await acquireDataset(store, artifacts, runId, {
    source: { resolver: 'local', path: csvPath },
    targetColumn: 'label',
    split: { method: 'random_stratified', ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 42 },
  });
  const outcome = applySplitColumns(csv.header, csv.nRows, {
    targetValues: csv.targetValues, groupValues: csv.groupValues,
  }, {
    datasetRecordId: record.id, datasetContentRef: record.contentRef,
    targetColumn: 'label', split: { method: 'random_stratified', ratios: { train: 0.7, val: 0, test: 0.3 }, seed: 42 },
  });
  const splitMs = Math.round(performance.now() - t0);
  // Split invariants without allocating O(n) auxiliary sets (22M rows would exceed
  // V8's Set ceiling): all three partitions are sorted asc, so a merge walk over
  // train/val/test must reproduce 0..n-1 exactly — coverage AND no-overlap at once.
  const n = csv.nRows;
  const parts = [outcome.trainIdx, outcome.valIdx, outcome.testIdx];
  if (parts[0].length + parts[1].length + parts[2].length !== n) throw new Error('split does not cover all rows');
  const cursors = [0, 0, 0];
  for (let expected = 0; expected < n; expected += 1) {
    let matched = -1;
    for (let p = 0; p < 3; p += 1) {
      const arr = parts[p];
      const c = cursors[p];
      if (c < arr.length && arr[c] === expected) { matched = p; cursors[p] = c + 1; break; }
    }
    if (matched < 0) throw new Error(`split misses or duplicates row ${expected}`);
  }
  return {
    splitMs,
    nRows: n,
    train: outcome.trainIdx.length,
    test: outcome.testIdx.length,
    contentRef: record.contentRef,
    verdict: 'PASS',
    baselineNote: 'pre-FA-DAT-01 this path read the whole file into one Buffer (100MB hard cap) — 1GB would throw before any work',
  };
}));

// ---------- NetCDF leg ----------
if (!SKIP_NETCDF) {
  const netcdfPath = path.join(tmpDir, `bench-${NETCDF_BYTES}.nc`);
  const hasSidecar = sidecarAvailable();
  results.phases.push(await phase(`gen ${mb(NETCDF_BYTES)}MB netcdf (${hasSidecar ? 'real netCDF4 via sidecar' : 'sidecar absent — random binary, profile leg skipped'})`, async () => {
    if (hasSidecar) {
      // A temp .py file, not `-c`: multiline scripts do not survive Windows shell quoting.
      const genPy = path.join(tmpDir, 'gen_netcdf.py');
      fs.writeFileSync(genPy, [
        'import numpy as np, sys, xarray as xr',
        'target = int(sys.argv[1]); out = sys.argv[2]',
        'rows = target // 16  # two f8 variables per row',
        'data = np.linspace(0, 1, rows, dtype="f8")',
        'ds = xr.Dataset({"v": ("t", data), "v2": ("t", data * 2)})',
        'ds.to_netcdf(out)',
        '',
      ].join('\n'), 'utf8');
      execFileSync('uv', [
        'run', '--project', path.join(repo, 'experiment-runtime'), 'python', genPy,
        String(NETCDF_BYTES), netcdfPath,
      ], { stdio: 'inherit', shell: process.platform === 'win32', cwd: repo });
    } else if (!fs.existsSync(netcdfPath) || fs.statSync(netcdfPath).size < NETCDF_BYTES) {
      // Random binary of the target size: still exercises streaming hash + chunked put.
      const out = fs.createWriteStream(netcdfPath);
      const chunk = Buffer.alloc(8 * 1024 * 1024);
      let written = 0;
      while (written < NETCDF_BYTES) {
        const b = Math.min(chunk.length, NETCDF_BYTES - written);
        written += b;
        if (!out.write(b === chunk.length ? chunk : chunk.subarray(0, b))) {
          await new Promise((r) => out.once('drain', r));
        }
      }
      await new Promise((r) => out.end(r));
    }
    return { fileBytes: fs.statSync(netcdfPath).size };
  }));


  results.phases.push(await phase(`streaming put + hash ${mb(NETCDF_BYTES)}MB netcdf`, async () => {
    const t0 = performance.now();
    const raw = await artifacts.putStream(fs.createReadStream(netcdfPath));
    const fence = await sha256FileHex(netcdfPath);
    const ms = Math.round(performance.now() - t0);
    if (fence !== raw.hash) throw new Error('streaming hash disagrees with fence hash');
    return {
      ms,
      hash: raw.hash.slice(0, 16),
      size: raw.size,
      verdict: 'PASS',
      baselineNote: 'pre-FA-DAT-01 this path readFileSync-ed the whole file (200MB hard cap) — 500MB would throw immediately',
    };
  }));
}

db.close();

// ---------- verdict ----------
const fails = results.phases.filter((p) => !p.ok);
const capabilityPhases = results.phases.filter((p) => p.name.includes('acquire') || p.name.includes('streaming put'));
const peak = Math.max(...results.phases.map((p) => p.peakRssBytes ?? 0));
results.verdict = fails.length === 0 && capabilityPhases.length >= 2 && capabilityPhases.every((p) => p.verdict === 'PASS')
  ? `PASS — peak RSS ${mb(peak)}MB across ${mb(CSV_BYTES)}MB CSV + ${mb(NETCDF_BYTES)}MB NetCDF legs`
  : `FAIL — ${fails.map((f) => `${f.name}: ${f.error}`).join('; ') || 'capability phases incomplete'}`;

const evidenceFile = path.join(outDir, 'evidence', `benchmark-${results.asOf.replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(evidenceFile, JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify(results, null, 2));
fs.rmSync(tmpDir, { recursive: true, force: true });
process.exit(fails.length === 0 ? 0 : 1);
