import { afterEach, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetchZoteroLibrary, normalizeZoteroItem, ZoteroUnavailableError } from '../src/server/zotero.js';

/** Minimal Zotero item fixture covering the fields the bridge normalizes. */
const rawItem = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  key: 'AAAA1111',
  meta: { parsedDate: '2023-05-01', creatorSummary: '李 等' },
  data: {
    key: 'AAAA1111',
    itemType: 'journalArticle',
    title: '偏好学习综述',
    DOI: '10.1000/demo',
    url: 'https://example.com/paper',
    date: '2023',
    creators: [
      { firstName: '其京', lastName: '李', creatorType: 'author' },
      { name: '某研究所', creatorType: 'contributor' },
      { firstName: '', lastName: '', creatorType: 'author' },
    ],
    tags: [{ tag: '偏好学习' }, { tag: '多目标优化' }, { tag: '偏好学习' }, { tag: '' }],
    collections: ['COLL0001'],
    relations: { 'dc:relation': ['http://zotero.org/users/18977210/items/BBBB2222', 'http://zotero.org/users/18977210/items/CCCC3333'] },
  },
  ...over,
});

describe('normalizeZoteroItem', () => {
  it('normalizes metadata, dedupes tags, and resolves relation URIs to keys', () => {
    const item = normalizeZoteroItem(rawItem() as Parameters<typeof normalizeZoteroItem>[0]);
    expect(item).not.toBeNull();
    expect(item?.key).toBe('AAAA1111');
    expect(item?.title).toBe('偏好学习综述');
    expect(item?.year).toBe(2023);
    expect(item?.creators).toEqual(['其京 李', '某研究所']);
    expect(item?.doi).toBe('10.1000/demo');
    expect(item?.tags).toEqual(['偏好学习', '多目标优化']);
    expect(item?.relatedKeys).toEqual(['BBBB2222', 'CCCC3333']);
  });

  it('falls back to data.date when parsedDate is missing', () => {
    const raw = rawItem();
    (raw.meta as Record<string, unknown>).parsedDate = undefined;
    (raw.data as Record<string, unknown>).date = 'November 2019';
    expect(normalizeZoteroItem(raw as Parameters<typeof normalizeZoteroItem>[0])?.year).toBe(2019);
  });

  it('rejects notes, attachments, and title-less items', () => {
    for (const over of [{ data: { itemType: 'note' } }, { data: { itemType: 'attachment' } }, { data: { title: '  ' } }]) {
      const raw = rawItem(over);
      expect(normalizeZoteroItem(raw as Parameters<typeof normalizeZoteroItem>[0])).toBeNull();
    }
  });
});

describe('fetchZoteroLibrary', () => {
  let server: http.Server | null = null;
  afterEach(() => { server?.close(); server = null; });

  const startFixture = (pages: unknown[][], total: number, hooks: { onRequest?: (url: URL) => void } = {}): Promise<string> =>
    new Promise((resolve) => {
      server = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://fixture');
        hooks.onRequest?.(url);
        const start = Number(url.searchParams.get('start') ?? '0');
        const limit = Number(url.searchParams.get('limit') ?? '0');
        const page = pages.slice(start, start + limit);
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Total-Results', String(total));
        res.end(JSON.stringify(page));
      });
      server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`));
    });

  it('paginates through the whole library and drops dangling relation targets', async () => {
    // 5 items, pageSize 2 -> 3 requests (2/2/1); item 0 relates to a note (BBBB2222) that gets filtered.
    const items = [
      rawItem(),
      rawItem({ key: 'DDDD4444', data: { itemType: 'book', title: '有效标题', date: '2020', tags: [], relations: {} } }),
      rawItem({ key: 'EEEE5555', data: { itemType: 'report', title: '另一篇', date: '2021', tags: [], relations: { 'dc:relation': ['http://zotero.org/users/0/items/DDDD4444'] } } }),
      rawItem({ key: 'FFFF6666', data: { itemType: 'note', title: 'note never shows' } }),
      rawItem({ key: 'GGGG7777', data: { itemType: 'thesis', title: '学位论文', date: '2022', tags: [], relations: {} } }),
    ];
    const urls: string[] = [];
    const base = await startFixture(items, 5, { onRequest: (u) => urls.push(u.pathname + u.search) });
    const lib = await fetchZoteroLibrary({ base, pageSize: 2 });
    expect(lib.items.map((i) => i.key)).toEqual(['AAAA1111', 'DDDD4444', 'EEEE5555', 'GGGG7777']);
    expect(lib.total).toBe(5);
    expect(urls.length).toBe(3); // stopped after the short page — no over-fetch
    // EEEE5555 -> DDDD4444 kept (normalized); AAAA1111 -> BBBB2222 (a note) dropped.
    const byKey = new Map(lib.items.map((i) => [i.key, i]));
    expect(byKey.get('EEEE5555')?.relatedKeys).toEqual(['DDDD4444']);
    expect(byKey.get('AAAA1111')?.relatedKeys).toEqual([]);
  });

  it('maps connection failures to ZoteroUnavailableError (never a fake empty library)', async () => {
    await expect(fetchZoteroLibrary({ base: 'http://127.0.0.1:1', pageSize: 10 })).rejects.toBeInstanceOf(ZoteroUnavailableError);
  });
});

/* ---------------- annotations (gap-hunt R9: critical-reading seeds) -------- */

import { fetchZoteroAnnotations, normalizeZoteroAnnotation } from '../src/server/zotero.js';

const rawAnnotation = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  key: 'ANNOT001',
  data: {
    annotationType: 'highlight',
    annotationText: '  高亮的关键段落：偏好冲突源于多目标 Pareto 前沿的局部不可比性。  ',
    annotationComment: '',
    parentItem: 'users/0/items/AAAA1111',
  },
  ...over,
});

describe('normalizeZoteroAnnotation', () => {
  it('normalizes a highlight with parent resolution and text trimming', () => {
    const a = normalizeZoteroAnnotation(rawAnnotation() as Parameters<typeof normalizeZoteroAnnotation>[0]);
    expect(a).not.toBeNull();
    expect(a?.key).toBe('ANNOT001');
    expect(a?.parentKey).toBe('AAAA1111');
    expect(a?.type).toBe('highlight');
    expect(a?.text).toBe('高亮的关键段落：偏好冲突源于多目标 Pareto 前沿的局部不可比性。');
    expect(a?.comment).toBeUndefined(); // empty comment stays absent
  });

  it('keeps comment-only notes and maps unknown types to other', () => {
    const a = normalizeZoteroAnnotation(rawAnnotation({
      key: 'ANNOT002',
      data: { annotationType: 'ink', annotationText: '', annotationComment: '方法部分统计功效不足', parentItem: 'users/0/items/BBBB2222' },
    }) as Parameters<typeof normalizeZoteroAnnotation>[0]);
    expect(a?.type).toBe('other');
    expect(a?.text).toBeUndefined();
    expect(a?.comment).toBe('方法部分统计功效不足');
  });

  it('rejects parentless/malformed/empty annotations', () => {
    for (const over of [
      { data: { annotationType: 'highlight', annotationText: 'x', parentItem: '' } },
      { data: { annotationType: 'highlight', annotationText: ' ', annotationComment: ' ', parentItem: 'users/0/items/AAAA1111' } },
      { key: '' },
    ]) {
      expect(normalizeZoteroAnnotation(rawAnnotation(over) as Parameters<typeof normalizeZoteroAnnotation>[0])).toBeNull();
    }
  });
});

describe('fetchZoteroAnnotations', () => {
  let annServer: http.Server | null = null;
  afterEach(() => { annServer?.close(); annServer = null; });

  it('pulls the annotation feed from the local API itemType filter, fail-visible on outage', async () => {
    const seen: string[] = [];
    const base = await new Promise<string>((resolve) => {
      annServer = http.createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://fixture');
        seen.push(url.pathname + url.search);
        if (!url.pathname.endsWith('/items')) { res.statusCode = 404; res.end('{}'); return; }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify([
          rawAnnotation(),
          rawAnnotation({ key: 'ANNOT003', data: { annotationType: 'note', annotationComment: '追查这篇的复现失败报告', parentItem: 'users/0/items/BBBB2222' } }),
        ]));
      });
      annServer.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(annServer!.address() as AddressInfo).port}`));
    });

    const r = await fetchZoteroAnnotations({ base });
    expect(r.annotations).toHaveLength(2);
    expect(r.annotations[1]?.comment).toBe('追查这篇的复现失败报告');
    expect(seen[0]).toContain('itemType=annotation');
    expect(seen[0]).toContain('format=json');

    await expect(fetchZoteroAnnotations({ base: 'http://127.0.0.1:1' })).rejects.toBeInstanceOf(ZoteroUnavailableError);
  });
});
