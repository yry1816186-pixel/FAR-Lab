import type { SdmDocument } from '../sdm.js';
import { parseXml, findAll, childrenNamed, textOf, attrAny } from '../xml.js';
import { readZip } from '../zip.js';
import { guessLanguage, normText } from '../parseutil.js';
import { normalizeHtml, walkHtmlInto, resolveXrefs, makeWalkCtx } from './html.js';

/**
 * EPUB structure recovery (MULTIMODAL lane extension, 2026-08-25). The audit's
 * core complaint about the legacy web path: chapter order followed ZIP ENTRY
 * order. This parser follows the SPEC: container.xml → OPF package → spine
 * itemref order, so reading order is the author's, not the archiver's.
 * Metadata (dc:title/creator/date/language) comes from the OPF, never guessed
 * from chapter text. Chapter parts walk through the shared HTML walker with
 * `spine[n]` provenance prefixes; cross-references resolve across parts after
 * the full spine is walked (forward references included).
 */

export type EpubParseResult =
  | { ok: true; sdm: SdmDocument }
  | { ok: false; reason: string };

const MAX_SPINE_PARTS = 2_000;

const joinHref = (opfDir: string, href: string): string => {
  const clean = href.replace(/^\//, '');
  if (opfDir.length === 0) return clean;
  return `${opfDir}/${clean}`;
};

export const parseEpub = (bytes: Uint8Array, fileName: string): EpubParseResult => {
  const zip = readZip(Buffer.from(bytes));
  if (!zip.ok) return { ok: false, reason: `epub: ${zip.reason}` };
  const entries = zip.entries;
  if (!entries.has('META-INF/container.xml')) {
    return { ok: false, reason: 'epub: no META-INF/container.xml — not an EPUB (OCF) container' };
  }
  const container = parseXml((entries.get('META-INF/container.xml') as Buffer).toString('utf8'));
  if (container.status === 'error') return { ok: false, reason: `epub: container.xml not well-formed: ${container.message}` };
  const rootfile = findAll(container.root, 'rootfile')[0];
  const opfPath = rootfile !== undefined ? attrAny(rootfile, 'full-path') : undefined;
  if (opfPath === undefined || !entries.has(opfPath)) {
    return { ok: false, reason: 'epub: container.xml does not point to a readable OPF package file' };
  }
  const opf = parseXml((entries.get(opfPath) as Buffer).toString('utf8'));
  if (opf.status === 'error') return { ok: false, reason: `epub: OPF (${opfPath}) not well-formed: ${opf.message}` };

  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/')) : '';
  const warnings: string[] = [];

  // manifest: id → {href, mediaType}
  const manifest = new Map<string, { href: string; mediaType: string }>();
  for (const item of findAll(opf.root, 'item')) {
    const id = item.attrs['id'];
    const href = attrAny(item, 'href');
    const media = item.attrs['media-type'] ?? '';
    if (id !== undefined && href !== undefined) manifest.set(id, { href, mediaType: media });
  }
  const spineRefs = findAll(opf.root, 'itemref').map((ir) => attrAny(ir, 'idref')).filter((id): id is string => id !== undefined);

  // metadata
  const metaEl = findAll(opf.root, 'metadata')[0];
  const dc = (name: string): string[] => (metaEl !== undefined ? childrenNamed(metaEl, name).map(textOf).map(normText) : []);
  const title = dc('title').find((t) => t.length > 0);
  const authors = dc('creator').filter((a) => a.length > 0);
  const dateRaw = dc('date')[0];
  const yearMatch = dateRaw !== undefined ? /^(\d{4})/.exec(dateRaw) : null;
  const dcLanguage = dc('language').find((l) => l.length > 0);

  const ctx = makeWalkCtx();
  let partsWalked = 0;
  let truncatedSpine = false;
  spineRefs.forEach((idref, i) => {
    const item = manifest.get(idref);
    if (item === undefined) { warnings.push(`spine[${i + 1}] idref ${idref} missing from the manifest — skipped`); return; }
    if (!/xhtml\+xml|text\/html/i.test(item.mediaType)) return; // nav/css/images are not reading content
    if (partsWalked >= MAX_SPINE_PARTS) { truncatedSpine = true; return; }
    const candidates = [joinHref(opfDir, item.href), joinHref(opfDir, decodeURIComponent(item.href))];
    const key = candidates.find((c) => entries.has(c));
    if (key === undefined) { warnings.push(`spine[${i + 1}] part ${item.href} missing from the container — skipped`); return; }
    const raw = (entries.get(key) as Buffer).toString('utf8');
    const { xml, warnings: normWarnings } = normalizeHtml(raw);
    for (const w of normWarnings) warnings.push(`spine[${i + 1}]: ${w}`);
    const parsed = parseXml(xml);
    if (parsed.status === 'error') {
      warnings.push(`spine[${i + 1}] (${item.href}) failed strict parse: ${parsed.message} — part skipped, rest of the book untouched`);
      return;
    }
    ctx.pathPrefix = `spine[${i + 1}]`;
    walkHtmlInto(ctx, parsed.root);
    partsWalked += 1;
  });
  resolveXrefs(ctx);

  const bodyText = ctx.blocks.map((b) => b.text).join(' ');
  const lang = dcLanguage ?? guessLanguage(bodyText);
  const hasContent = ctx.blocks.length + ctx.figures.length + ctx.tables.length > 0;
  return {
    ok: true,
    sdm: {
      schemaVersion: 'sdm-1',
      extractor: { name: 'epub-xhtml-v1', route: 'epub_xhtml' },
      origin: { kind: 'upload', name: fileName },
      meta: {
        authors,
        ...(title !== undefined ? { title } : {}),
        ...(yearMatch !== null ? { year: Number(yearMatch[1]) } : {}),
        ...(lang !== undefined && lang.length > 0 ? { language: lang } : {}),
      },
      blocks: ctx.blocks, figures: ctx.figures, tables: ctx.tables, equations: [], citations: [], xrefs: ctx.xrefs,
      diagnostics: {
        parseStatus: hasContent ? (warnings.length > 0 ? 'partial' : 'ok') : 'failed',
        warnings: [...warnings, ...ctx.warnings, ...(hasContent ? [] : [`spine carried no readable content (${spineRefs.length} itemrefs inspected)`])],
        truncated: ctx.truncated || truncatedSpine,
      },
    },
  };
};
