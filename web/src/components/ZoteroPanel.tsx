import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationNodeDatum } from 'd3-force';
import { BookMarked, FileUp, Loader2, RefreshCw } from 'lucide-react';
import { useI18n } from '../i18n/LanguageContext';
import { getZoteroLibrary } from '../api/endpoints';
import type { ZoteroLibItem } from '../api/types';
import { parseCitationEntries, readTextFile } from '../utils/ingest';
import { buildLitGraph, DEFAULT_GRAPH_OPTIONS, type GraphOptions, type LitGraph } from '../utils/lit-graph';

/**
 * Reference-library picker (HX): local Zotero + universal BibTeX/RIS file import
 * (EndNote, Mendeley, JabRef, Citavi… all export these), with an interactive
 * relation graph (shared keywords / co-authors / Zotero "related") that helps
 * the researcher CHOOSE which literature to seed the study with. Selection
 * imports as provenance seeds; nothing here is decorative.
 */

/** Panel working item: a Zotero entry or a parsed file entry, unified. */
export interface PanelItem extends ZoteroLibItem {
  source: 'zotero' | 'file';
}

interface SimNode extends SimulationNodeDatum {
  key: string;
  r: number;
  color: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Selected items become composer seed attachments (caller enforces the cap). */
  onImport: (items: ZoteroLibItem[]) => void;
  /** How many more seeds the composer can still accept. */
  remaining: number;
}

export function ZoteroPanel({ open, onClose, onImport, remaining }: Props): JSX.Element | null {
  const { t } = useI18n();
  const [libItems, setLibItems] = useState<ZoteroLibItem[] | null>(null);
  const [fileItems, setFileItems] = useState<PanelItem[]>([]);
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'list' | 'graph'>('list');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [graphOpts, setGraphOpts] = useState<GraphOptions>(DEFAULT_GRAPH_OPTIONS);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  /** Zotero local entries + parsed file entries, unified for search/graph/import. */
  const items = useMemo<PanelItem[]>((): PanelItem[] => [
    ...(libItems ?? []).map((i) => ({ ...i, source: 'zotero' as const })),
    ...fileItems,
  ], [libItems, fileItems]);

  const load = useCallback((): void => {
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    getZoteroLibrary(controller.signal)
      .then((r) => { setLibItems(r.items); setLoading(false); })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setLibItems(null);
        setLoading(false);
        setError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  /** Universal import: any manager that exports BibTeX/RIS (multi-entry). */
  const importFiles = async (files: FileList): Promise<void> => {
    const existing = new Set(fileItems.map((i) => i.key));
    const added: PanelItem[] = [];
    let failedFiles = 0;
    for (const file of Array.from(files)) {
      const text = await readTextFile(file);
      const entries = text !== null ? await parseCitationEntries(text) : null;
      if (entries === null || entries.length === 0) { failedFiles += 1; continue; }
      entries.forEach((e, idx) => {
        const key = `file:${file.name}:${idx}`;
        if (existing.has(key)) return;
        existing.add(key);
        added.push({
          key,
          title: e.title.length > 0 ? e.title : file.name,
          itemType: 'journalArticle',
          ...(e.year !== undefined ? { year: e.year } : {}),
          creators: e.authors,
          ...(e.doi !== undefined ? { doi: e.doi } : {}),
          tags: e.keywords,
          collections: [],
          relatedKeys: [],
          source: 'file',
        });
      });
    }
    setFileItems((prev) => [...prev, ...added]);
    setFileNote(added.length > 0
      ? t('zotero.fileAdded', { n: added.length }) + (failedFiles > 0 ? ` · ${t('zotero.fileFailed', { n: failedFiles })}` : '')
      : (failedFiles > 0 ? t('zotero.fileFailed', { n: failedFiles }) : null));
  };

  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setSelected(new Set());
    setFileNote(null);
    setView('list');
    if (libItems === null && !loading) load();
    const restore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.setTimeout(() => dialogRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('keydown', onKey, true); restore?.focus(); };
    // reload on every open: the library changes while the user works in Zotero
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const matches = useMemo((): Set<string> | null => {
    if (items.length === 0) return null;
    const q = query.trim().toLowerCase();
    if (q.length === 0) return null;
    const set = new Set<string>();
    for (const it of items) {
      if (it.title.toLowerCase().includes(q)
        || it.creators.some((c) => c.toLowerCase().includes(q))
        || it.tags.some((tag) => tag.toLowerCase().includes(q))) set.add(it.key);
    }
    return set;
  }, [items, query]);

  const visible = useMemo((): PanelItem[] => {
    if (matches === null) return items;
    return items.filter((i) => matches.has(i.key));
  }, [items, matches]);

  const graph = useMemo<LitGraph | null>(() => (items.length === 0 ? null : buildLitGraph(items, graphOpts)), [items, graphOpts]);

  const toggle = (key: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else if (next.size < remaining) next.add(key);
      return next;
    });
  };

  const selectedItems = useMemo(
    (): ZoteroLibItem[] => items.filter((i) => selected.has(i.key)),
    [items, selected],
  );

  if (!open) return null;

  return (
    <div className="settings-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={dialogRef} className="settings-panel zotero-panel" role="dialog" aria-modal="true" aria-label={t('zotero.title')} tabIndex={-1}>
        <div className="settings-head">
          <h2 className="settings-title"><BookMarked size={15} aria-hidden="true" /> {t('zotero.title')}</h2>
          <button type="button" className="btn btn--small" onClick={onClose} aria-label={t('common.close')}>✕</button>
        </div>

        <div className="zotero-toolbar">
          <input
            type="text"
            className="zotero-search"
            value={query}
            placeholder={t('zotero.searchPlaceholder')}
            aria-label={t('zotero.searchPlaceholder')}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="zotero-views" role="tablist" aria-label={t('zotero.title')}>
            <button type="button" role="tab" aria-selected={view === 'list'} className={`zotero-view${view === 'list' ? ' zotero-view--on' : ''}`} onClick={() => setView('list')}>{t('zotero.viewList')}</button>
            <button type="button" role="tab" aria-selected={view === 'graph'} className={`zotero-view${view === 'graph' ? ' zotero-view--on' : ''}`} onClick={() => setView('graph')}>{t('zotero.viewGraph')}</button>
          </div>
          <button
            type="button"
            className="btn btn--small"
            onClick={() => fileInputRef.current?.click()}
            title={t('zotero.fileHint')}
          >
            <FileUp size={12} aria-hidden="true" /> {t('zotero.fileImport')}
          </button>
          <button type="button" className="btn btn--small" onClick={load} disabled={loading} aria-label={t('zotero.refresh')}>
            {loading ? <Loader2 size={12} className="attach-spinner" aria-hidden="true" /> : <RefreshCw size={12} aria-hidden="true" />}
          </button>
          {items.length > 0 && <span className="muted small zotero-count">{t('zotero.itemsCount', { n: items.length })}{matches !== null ? ` · ${t('zotero.matchCount', { n: visible.length })}` : ''}</span>}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".bib,.ris"
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            if (e.target.files !== null && e.target.files.length > 0) void importFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {fileNote !== null && <p className="muted small" role="status">{fileNote}</p>}
        {error !== null && <p className="field-error" role="alert">{t('ingest.zoteroUnavailable')}（{error}）— {t('zotero.fileFallback')}</p>}

        {items.length === 0 ? (
          loading || error === null
            ? <p className="muted" role="status">{t('common.loading')}</p>
            : <p className="muted small zotero-pad">{t('zotero.emptyOrOff')}</p>
        ) : view === 'list' ? (
          <div className="zotero-list-wrap" role="listbox" aria-multiselectable="true" aria-label={t('zotero.title')}>
            {visible.length === 0 ? (
              <p className="muted small zotero-pad">{items.length === 0 ? t('zotero.empty') : t('zotero.noResults')}</p>
            ) : visible.map((it) => (
              <button
                key={it.key}
                type="button"
                role="option"
                aria-selected={selected.has(it.key)}
                className={`zotero-row${selected.has(it.key) ? ' zotero-row--on' : ''}`}
                onClick={() => toggle(it.key)}
              >
                <span className={`zotero-check${selected.has(it.key) ? ' zotero-check--on' : ''}`} aria-hidden="true">{selected.has(it.key) ? '✓' : ''}</span>
                <span className="zotero-row-main">
                  <span className="zotero-row-title">{it.title}</span>
                  <span className="zotero-row-meta muted small">
                    <span className={`badge${it.source === 'file' ? ' badge--info' : ''}`}>{it.source === 'file' ? t('zotero.srcFile') : 'Zotero'}</span>
                    {it.year !== undefined ? ` ${it.year} · ` : ' '}{it.creators.slice(0, 3).join(', ')}
                    {it.tags.length > 0 ? ` · ${it.tags.slice(0, 4).join(' / ')}` : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          graph !== null && (
            <LitGraphCanvas
              graph={graph}
              selected={selected}
              matches={matches}
              remaining={remaining}
              onToggle={toggle}
              options={graphOpts}
              onOptions={setGraphOpts}
            />
          )
        )}

        <div className="zotero-foot">
          <span className="muted small">{t('zotero.selectedCount', { n: selected.size })} · {t('zotero.remaining', { n: remaining })}</span>
          <span className="zotero-foot-actions">
            <button type="button" className="btn btn--small" onClick={onClose}>{t('settings.cancel')}</button>
            <button
              type="button"
              className="btn btn--primary btn--small"
              disabled={selectedItems.length === 0}
              onClick={() => { onImport(selectedItems); setSelected(new Set()); onClose(); }}
            >
              {t('zotero.import')}
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

/** Force-directed relation graph on canvas: pan/zoom, drag nodes, click to select. */
function LitGraphCanvas({
  graph, selected, matches, remaining, onToggle, options, onOptions,
}: {
  graph: LitGraph;
  selected: Set<string>;
  matches: Set<string> | null;
  remaining: number;
  onToggle: (key: string) => void;
  options: GraphOptions;
  onOptions: (o: GraphOptions) => void;
}): JSX.Element {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const simRef = useRef<Simulation<SimNode, undefined> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const posRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const viewRef = useRef<{ x: number; y: number; k: number }>({ x: 0, y: 0, k: 1 });
  const hoverRef = useRef<string | null>(null);
  const dragRef = useRef<{ node: SimNode | null; panning: boolean; lastX: number; lastY: number } | null>(null);
  const stateRef = useRef({ selected, matches, graph });
  stateRef.current = { selected, matches, graph };
  const labelsRef = useRef<Map<string, string>>(new Map());
  labelsRef.current = new Map(graph.nodes.map((n) => [n.key, n.title]));

  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const nodeByKey = useMemo(() => new Map(graph.nodes.map((n) => [n.key, n])), [graph]);
  const hoverNode = hoverKey !== null ? nodeByKey.get(hoverKey) : undefined;

  // (re)build the simulation; harvest live positions first so filtering
  // options (slider / edge toggles) NEVER reshuffle the layout the user sees
  useEffect(() => {
    for (const n of nodesRef.current) {
      if (n.x !== undefined && n.y !== undefined) posRef.current.set(n.key, { x: n.x, y: n.y });
    }
    const old = posRef.current;
    const firstBuild = old.size === 0;
    const width = wrapRef.current?.clientWidth ?? 800;
    const height = wrapRef.current?.clientHeight ?? 520;
    const maxDegree = Math.max(1, ...graph.nodes.map((n) => n.degree));
    const nodes: SimNode[] = graph.nodes.map((n) => {
      const prev = old.get(n.key);
      return {
        key: n.key,
        r: 3 + Math.sqrt((n.degree / maxDegree)) * 9,
        color: graph.themeColors.get(n.theme ?? '') ?? '#8a8f98',
        x: prev?.x ?? width / 2 + (Math.random() - 0.5) * 200,
        y: prev?.y ?? height / 2 + (Math.random() - 0.5) * 200,
      };
    });
    nodesRef.current = nodes;
    const nodeMap = new Map(nodes.map((n) => [n.key, n]));
    const links = graph.edges.map((e) => ({ source: nodeMap.get(e.source)!, target: nodeMap.get(e.target)!, weight: e.weight }));
    const sim = forceSimulation(nodes)
      .alpha(firstBuild ? 1 : 0.45)
      .force('link', forceLink(links).distance((l: { weight: number }) => 30 + 90 / (1 + l.weight)).strength((l: { weight: number }) => Math.min(0.5, 0.1 + l.weight / 10)))
      .force('charge', forceManyBody().strength(-120))
      .force('collide', forceCollide<SimNode>((n) => n.r + 2))
      .force('x', forceX(width / 2).strength(0.04))
      .force('y', forceY(height / 2).strength(0.06))
      .alphaDecay(0.02);
    simRef.current = sim;
    return () => { sim.stop(); simRef.current = null; };
  }, [graph]);

  // draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return undefined;
    let raf = 0;
    let alive = true;

    const resize = (): void => {
      const wrap = wrapRef.current;
      if (wrap === null) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(wrap.clientWidth * dpr));
      canvas.height = Math.max(1, Math.floor(wrap.clientHeight * dpr));
      canvas.style.width = `${wrap.clientWidth}px`;
      canvas.style.height = `${wrap.clientHeight}px`;
    };
    resize();
    const ro = new ResizeObserver(resize);
    if (wrapRef.current !== null) ro.observe(wrapRef.current);

    const draw = (): void => {
      if (!alive) return;
      const { selected: sel, matches: mat, graph: g } = stateRef.current;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const v = viewRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.scale(v.k, v.k);

      const nodeMap = new Map(nodesRef.current.map((n) => [n.key, n]));
      for (const e of g.edges) {
        const s = nodeMap.get(e.source);
        const t2 = nodeMap.get(e.target);
        if (s === undefined || t2 === undefined || s.x === undefined || s.y === undefined || t2.x === undefined || t2.y === undefined) continue;
        const dim = mat !== null && !(mat.has(e.source) || mat.has(e.target) || sel.has(e.source) || sel.has(e.target));
        ctx.strokeStyle = e.related ? '#b3541e' : '#9aa1ab';
        ctx.globalAlpha = (dim ? 0.04 : 0.14 + Math.min(0.5, e.weight / 4));
        ctx.lineWidth = Math.min(2.5, 0.5 + e.weight / 3.5);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t2.x, t2.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      for (const n of nodesRef.current) {
        if (n.x === undefined || n.y === undefined) continue;
        const dim = mat !== null && !mat.has(n.key) && !sel.has(n.key);
        const isSel = sel.has(n.key);
        ctx.globalAlpha = dim ? 0.15 : 1;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.fill();
        if (isSel) {
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#111418';
          ctx.stroke();
        }
        const hovered = hoverRef.current === n.key;
        if (hovered && !dim) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r + 3, 0, Math.PI * 2);
          ctx.strokeStyle = n.color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.font = '12px "IBM Plex Sans", "Noto Sans SC", sans-serif';
          ctx.fillStyle = '#2b2f36';
          ctx.textAlign = 'center';
          ctx.fillText(clip(labelsRef.current.get(n.key) ?? '', 22), n.x, n.y - n.r - 6);
        }
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { alive = false; cancelAnimationFrame(raf); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // pointer interactions: hit-test nodes, drag node / pan, click select
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return undefined;
    const toWorld = (ev: PointerEvent | WheelEvent): { x: number; y: number; sx: number; sy: number } => {
      const rect = canvas.getBoundingClientRect();
      const v = viewRef.current;
      const sx = ev.clientX - rect.left;
      const sy = ev.clientY - rect.top;
      return { x: (sx - v.x) / v.k, y: (sy - v.y) / v.k, sx, sy };
    };
    const hit = (x: number, y: number): SimNode | null => {
      let best: SimNode | null = null;
      let bestD = Infinity;
      for (const n of nodesRef.current) {
        if (n.x === undefined || n.y === undefined) continue;
        const d = (n.x - x) ** 2 + (n.y - y) ** 2;
        if (d < (n.r + 5) ** 2 && d < bestD) { best = n; bestD = d; }
      }
      return best;
    };
    const onDown = (ev: PointerEvent): void => {
      const { x, y, sx, sy } = toWorld(ev);
      const n = hit(x, y);
      dragRef.current = n !== null ? { node: n, panning: false, lastX: sx, lastY: sy } : { node: null, panning: true, lastX: sx, lastY: sy };
      canvas.setPointerCapture(ev.pointerId);
    };
    const onMove = (ev: PointerEvent): void => {
      const { x, y, sx, sy } = toWorld(ev);
      const drag = dragRef.current;
      if (drag === null) {
        const n = hit(x, y);
        if ((n?.key ?? null) !== hoverRef.current) { hoverRef.current = n?.key ?? null; setHoverKey(hoverRef.current); }
        canvas.style.cursor = n !== null ? 'pointer' : 'default';
        return;
      }
      if (drag.node !== null) {
        drag.node.fx = x;
        drag.node.fy = y;
        simRef.current?.alpha(0.3).restart();
      } else {
        viewRef.current = { ...viewRef.current, x: viewRef.current.x + (sx - drag.lastX), y: viewRef.current.y + (sy - drag.lastY) };
        drag.lastX = sx;
        drag.lastY = sy;
      }
    };
    const onUp = (ev: PointerEvent): void => {
      const drag = dragRef.current;
      dragRef.current = null;
      if (drag === null) return;
      if (drag.node !== null) {
        drag.node.fx = null;
        drag.node.fy = null;
        simRef.current?.alpha(0.2).restart();
        const { x, y } = toWorld(ev);
        const n = hit(x, y);
        if (n === drag.node) onToggle(n.key);
      }
    };
    const onWheel = (ev: WheelEvent): void => {
      ev.preventDefault();
      const { sx, sy } = toWorld(ev);
      const v = viewRef.current;
      const k = Math.min(4, Math.max(0.3, v.k * (ev.deltaY < 0 ? 1.12 : 1 / 1.12)));
      viewRef.current = { k, x: sx - ((sx - v.x) / v.k) * k, y: sy - ((sy - v.y) / v.k) * k };
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onToggle]);

  const optionRow = (key: 'enableRelated' | 'enableTags' | 'enableAuthors', label: string): JSX.Element => (
    <label className="zotero-opt">
      <input type="checkbox" checked={options[key]} onChange={(e) => onOptions({ ...options, [key]: e.target.checked })} />
      {label}
    </label>
  );

  return (
    <div className="zotero-graph">
      <div ref={wrapRef} className="zotero-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="zotero-canvas"
          aria-label={t('zotero.viewGraph')}
          role="img"
        />
        <p className="muted small zotero-graph-hint">{t('zotero.graphHint')}</p>
      </div>
      <div className="zotero-side">
        <div className="zotero-side-block">
          <p className="zotero-side-title">{t('zotero.edgeTitle')}（{graph.edges.length}）</p>
          {optionRow('enableRelated', t('zotero.edgeRelated'))}
          {optionRow('enableTags', t('zotero.edgeTags'))}
          {optionRow('enableAuthors', t('zotero.edgeAuthors'))}
          <label className="zotero-opt zotero-opt--range">
            {t('zotero.minWeight')}：{options.minWeight.toFixed(1)}
            <input
              type="range" min="0" max="3" step="0.1" value={options.minWeight}
              onChange={(e) => onOptions({ ...options, minWeight: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="zotero-side-block">
          <p className="zotero-side-title">{t('zotero.theme')}</p>
          <ul className="zotero-legend">
            {[...graph.themeColors.entries()].map(([tag, color]) => (
              <li key={tag}><span className="zotero-dot" style={{ background: color }} aria-hidden="true" />{tag}</li>
            ))}
          </ul>
        </div>
        {hoverNode !== undefined && (
          <div className="zotero-side-block zotero-nodecard" data-testid="zotero-nodecard">
            <p className="zotero-row-title">{hoverNode.title}</p>
            <p className="muted small">
              {hoverNode.year !== undefined ? `${hoverNode.year} · ` : ''}{hoverNode.creators.slice(0, 3).join(', ')}
            </p>
            {hoverNode.tags.length > 0 && <p className="muted small">{hoverNode.tags.slice(0, 6).join(' / ')}</p>}
            <p className="muted small">{t('zotero.degree')}：{hoverNode.degree}</p>
            {selected.has(hoverNode.key) && <span className="badge badge--info">{t('zotero.picked')}</span>}
          </div>
        )}
        {hoverNode === undefined && (
          <p className="muted small zotero-side-hint">{t('zotero.hoverHint')}（{t('zotero.remaining', { n: remaining })}）</p>
        )}
      </div>
    </div>
  );
}

function clip(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
