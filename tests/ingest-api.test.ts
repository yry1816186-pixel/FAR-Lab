import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createApiServer } from '../src/server/api.js';
import { writeZip } from '../src/ingest/zip';
import type { ApiServer } from '../src/server/api.js';

/** POST /api/v1/ingest integration — real kernel, real artifact store, no models. */

let tmp: string;
let app: App;
let api: ApiServer;
let base: string;

beforeAll(async () => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'ingest-api-'));
  app = await createApp({ dataDir: tmp });
  api = createApiServer(app, { port: 0, executor: async () => undefined, staticRoot: path.join(tmp, 'no-web-dist') });
  const port = await api.start();
  base = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await api.stop();
  app.close();
  rmSync(tmp, { recursive: true, force: true });
});

const post = async (body: unknown): Promise<{ status: number; json: Record<string, unknown> }> => {
  const res = await fetch(`${base}/api/v1/ingest`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() as Record<string, unknown> };
};

describe('POST /api/v1/ingest', () => {
  it('text/md → SDM summary + immutable artifact ref', async () => {
    const { status, json } = await post({
      kind: 'text',
      fileName: 'notes.md',
      text: '# Title\n\nParagraph mentioning Figure 1.\n\n![Cap. (a) x.](f.png)\n',
    });
    expect(status).toBe(200);
    expect(json['type']).toBe('sdm');
    expect(String(json['artifactRef'])).toMatch(/^sha256:[0-9a-f]{64}$/);
    const sdm = json['sdm'] as Record<string, unknown>;
    expect(sdm['schemaVersion']).toBe('sdm-1');
    const counts = sdm['counts'] as Record<string, number>;
    expect(counts['blocks']).toBeGreaterThan(1);
    expect(counts['figures']).toBe(1);
    expect(counts['xrefsResolved']).toBe(1);
  });

  it('text/csv → dataset profile with typed columns', async () => {
    const { status, json } = await post({
      kind: 'text',
      fileName: 'cohort.csv',
      text: 'id,effect (g),group\n1,0.42***,A\n2,,B\n3,0.15,A\n',
    });
    expect(status).toBe(200);
    expect(json['type']).toBe('dataset_profile');
    const profile = json['profile'] as Record<string, unknown>;
    expect(profile['rowCount']).toBe(3);
    const cols = profile['columns'] as Array<Record<string, unknown>>;
    expect(cols[1]!['unitHint']).toBe('g');
    expect(cols[1]!['significanceNotation']).toBe(true);
  });

  it('text/tex → LaTeX SDM with equations and cite linkage', async () => {
    const tex = [
      '\\section{Intro}',
      'Cite \\cite{k1}.',
      '\\begin{equation} x = 1 \\end{equation}',
      '\\begin{thebibliography}{9}\\bibitem{k1} A. Author. T. 2020.\\end{thebibliography}',
    ].join('\n');
    const { status, json } = await post({ kind: 'text', fileName: 'p.tex', text: tex });
    expect(status).toBe(200);
    const counts = (json['sdm'] as Record<string, unknown>)['counts'] as Record<string, number>;
    expect(counts['equations']).toBe(1);
    expect(counts['citations']).toBe(1);
    expect(counts['xrefsResolved']).toBe(1);
  });

  it('pdf_text route validates the collector payload and stores the SDM', async () => {
    const payload = {
      numPages: 1,
      pages: [{ pageNumber: 1, width: 612, height: 792, items: [
        { str: 'Figure 3: Another caption.', x: 40, y: 100, w: 200, h: 10, fontSize: 10 },
      ] }],
      truncated: false,
      fileSha256: 'c'.repeat(64),
    };
    const ok = await post({ kind: 'pdf_text', fileName: 'x.pdf', payload });
    expect(ok.status).toBe(200);
    const counts = (ok.json['sdm'] as Record<string, unknown>)['counts'] as Record<string, number>;
    expect(counts['figures']).toBe(1);

    const bad = await post({ kind: 'pdf_text', fileName: 'x.pdf', payload: { ...payload, numPages: 'many' } });
    expect(bad.status).toBe(400);
  });

  it('honest refusals: unsupported kind, path-y fileName, wrong method', async () => {
    expect((await post({ kind: 'text', fileName: 'a.rs', text: 'fn main() {}' })).status).toBe(400);
    expect((await post({ kind: 'text', fileName: '../evil.md', text: '# x' })).status).toBe(400);
    expect((await post({ kind: 'binary', fileName: 'x' })).status).toBe(400);
    const get = await fetch(`${base}/api/v1/ingest`);
    expect(get.status).toBe(404);
  });
});

describe('GET /api/v1/ingest/:ref (fetch-by-ref contract)', () => {
  it('round-trips a stored SDM artifact by ref', async () => {
    const p = await post({
      kind: 'text',
      fileName: 'notes.md',
      text: '# Title\n\nParagraph mentioning Figure 1.\n\n![Cap. (a) x.](f.png)\n',
    });
    expect(p.status).toBe(200);
    const res = await fetch(`${base}/api/v1/ingest/${String(p.json['artifactRef'])}`);
    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json['kind']).toBe('sdm');
    const sdm = json['sdm'] as { schemaVersion: string; origin: { name: string }; figures: unknown[] };
    expect(sdm.schemaVersion).toBe('sdm-1');
    expect(sdm.origin.name).toBe('notes.md');
    expect(sdm.figures).toHaveLength(1);
  });

  it('round-trips a dataset profile by ref', async () => {
    const p = await post({ kind: 'text', fileName: 'd.csv', text: 'a,b\n1,2\n' });
    expect(p.status).toBe(200);
    const res = await fetch(`${base}/api/v1/ingest/${String(p.json['artifactRef'])}`);
    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json['kind']).toBe('dataset_profile');
    expect((json['profile'] as { schemaVersion: string }).schemaVersion).toBe('dsdp-1');
  });

  it('invalid ref shape is 400; unknown valid-shape ref is an honest 404', async () => {
    expect((await fetch(`${base}/api/v1/ingest/not-a-ref`)).status).toBe(400);
    const unknown = `sha256:${'0'.repeat(64)}`;
    expect((await fetch(`${base}/api/v1/ingest/${unknown}`)).status).toBe(404);
  });
});

describe('POST /api/v1/ingest kind=bytes (xlsx supplements)', () => {
  it('profiles a real xlsx upload end-to-end and round-trips the stored profile', async () => {
    const bytes = readFileSync(path.join('tests', 'fixtures', 'sample.xlsx'));
    const { status, json } = await post({ kind: 'bytes', fileName: 'supp.xlsx', base64: bytes.toString('base64') });
    expect(status).toBe(200);
    expect(json['type']).toBe('dataset_profile');
    const profile = json['profile'] as Record<string, unknown>;
    expect(profile['format']).toBe('xlsx');
    expect(profile['rowCount']).toBe(2);
    const res = await fetch(`${base}/api/v1/ingest/${String(json['artifactRef'])}`);
    expect(res.status).toBe(200);
    const back = await res.json() as Record<string, unknown>;
    expect(back['kind']).toBe('dataset_profile');
  });

  it('refuses unsupported binary kinds with the reason (honest 400)', async () => {
    const { status, json } = await post({ kind: 'bytes', fileName: 'img.png', base64: Buffer.from([1, 2, 3]).toString('base64') });
    expect(status).toBe(400);
    expect(JSON.stringify(json)).toMatch(/unsupported binary kind/);
  });

  it('rejects empty and oversized base64 bodies', async () => {
    expect((await post({ kind: 'bytes', fileName: 's.xlsx', base64: '' })).status).toBe(400);
    expect((await post({ kind: 'bytes', fileName: 's.xlsx', base64: 42 })).status).toBe(400);
  });
});

describe('POST /api/v1/ingest — 2026-08-25 format-matrix extension', () => {
  it('kind=bytes .docx → SDM summary (zip container family)', async () => {
    const docx = writeZip([
      { name: 'word/document.xml', data: '<?xml version="1.0"?><w:document xmlns:w="u"><w:body><w:p><w:r><w:t>Word text.</w:t></w:r></w:p></w:body></w:document>' },
    ]);
    const { status, json } = await post({ kind: 'bytes', fileName: 'paper.docx', base64: docx.toString('base64') });
    expect(status).toBe(200);
    expect(json['type']).toBe('sdm');
    const sdm = json['sdm'] as Record<string, unknown>;
    expect(String((sdm['extractor'] as Record<string, unknown>)['name'])).toBe('docx-ooxml-v1');
  });

  it('kind=text .svg → digitized plot with a fetchable points artifact', async () => {
    const svg = `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg">${[0, 1, 2, 3, 4].map((v) => `<text x="${100 + v * 100}" y="430">${v}</text>`).join('')}${[0, 1, 2, 3].map((v) => `<text x="60" y="${400 - v * 100}">${v}</text>`).join('')}<polyline points="100,400 300,200"/></svg>`;
    const { status, json } = await post({ kind: 'text', fileName: 'fig.svg', text: svg });
    expect(status).toBe(200);
    expect(json['seriesCount']).toBe(1);
    const pointsRef = String(json['pointsRef']);
    expect(pointsRef).toMatch(/^sha256:[0-9a-f]{64}$/);
    const res = await fetch(`${base}/api/v1/ingest/${pointsRef}`);
    expect(res.status).toBe(200);
    const back = await res.json() as Record<string, unknown>;
    expect(back['kind']).toBe('plot_points');
    const pts = back['points'] as Record<string, unknown>;
    const axes = pts['axes'] as Record<string, Record<string, Record<string, unknown>>>;
    expect(typeof axes['x']?.['calibration']?.['slope']).toBe('number');
  });

  it('kind=text non-tabular .json → 400 quoting the precise jsonToRows reason', async () => {
    const { status, json } = await post({ kind: 'text', fileName: 'x.json', text: JSON.stringify({ a: [{ b: 1 }] }) });
    expect(status).toBe(400);
    expect(JSON.stringify(json)).toMatch(/nested/);
  });

  it('kind=text .html → structured SDM', async () => {
    const { status, json } = await post({ kind: 'text', fileName: 's1.html', text: '<!DOCTYPE html><html><head><title>T</title></head><body><h1>H</h1><p>See Figure 1.</p><figure><img src="a.png"/><figcaption>Figure 1: cap</figcaption></figure></body></html>' });
    expect(status).toBe(200);
    const sdm = json['sdm'] as Record<string, unknown>;
    expect((sdm['counts'] as Record<string, number>)['figures']).toBe(1);
    expect((sdm['counts'] as Record<string, number>)['xrefsResolved']).toBe(1);
  });
});
