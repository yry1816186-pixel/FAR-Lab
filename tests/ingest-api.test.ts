import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../src/app/composition.js';
import type { App } from '../src/app/composition.js';
import { createApiServer } from '../src/server/api.js';
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
