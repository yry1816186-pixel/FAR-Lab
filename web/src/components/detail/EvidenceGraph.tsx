import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getHypotheses } from '../../api/endpoints';
import type { EvidenceRelation, ResearchRun, ScientificClaim, SourceDocument } from '../../api/types';
import { useResource } from '../../hooks/useResource';
import { useI18n } from '../../i18n/LanguageContext';
import type { DictKey } from '../../i18n/dict';

/**
 * B7 evidence landscape: sources ← claims ← hypotheses as one interactive SVG
 * graph (zero dependencies — hand-rolled, deterministic tri-column layout).
 * Every node and edge is a REAL store object (locator, relation, explicit
 * binding); nothing is invented for the picture. Interactions: hover to
 * trace a node's edges, click a claim to flash it in the list (or navigate),
 * click a hypothesis to jump to its tab; polarity filters; wheel zoom + drag
 * pan. Keyboard: nodes are focusable, Enter activates, Esc resets the view.
 */

type Filter = 'all' | 'counter' | 'supporting' | 'discriminating';

interface GraphNode {
  id: string;
  kind: 'source' | 'claim' | 'hypothesis';
  x: number;
  y: number;
  label: string;
  title: string;
  /** claim binding tone for glyph color */
  tone?: 'verified' | 'caution' | 'refuted' | 'unknown';
  rank?: number;
  supportingCount: number;
  counterCount: number;
}

interface GraphEdge {
  id: string;
  from: string;
  to: string;
  kind: 'locator' | 'supports' | 'counters' | 'claim_claim';
  dashed?: boolean;
  /** claim_claim only: the store relation's strength rating (title + width). */
  strength?: 'strong' | 'moderate' | 'weak' | 'unrated';
}

const COL_X = { source: 70, claim: 380, hypothesis: 700 };
const VIEW_W = 1000;
const ROW_H = 34;
const MAX_NODES_PER_COL = 40;
/** First content row sits below the in-SVG column headers. */
const HEADER_Y = 16;
const FIRST_ROW_Y = 46;

const STRENGTH_W: Record<NonNullable<GraphEdge['strength']>, number> = { strong: 2.2, moderate: 1.6, weak: 1.0, unrated: 1.2 };

/**
 * Truncation that keeps look-alike labels distinguishable: identical truncated
 * labels (common with hypothesis statements sharing a long prefix) get their
 * slice window extended in steps until they differ or hit the hard cap —
 * the reader can always tell two rows apart at a glance.
 */
function truncateLabels(raw: string[], baseMax: number, hardMax: number): string[] {
  const out = raw.map((s) => (s.length > baseMax ? `${s.slice(0, baseMax)}…` : s));
  const dupeAt = (i: number): boolean => {
    const own = out[i];
    const ownRaw = raw[i];
    if (own === undefined || ownRaw === undefined) return false;
    return out.some((o, j) => j !== i && o === own && raw[j] !== undefined && raw[j] !== ownRaw);
  };
  let max = baseMax;
  while (max < hardMax && out.some((_, i) => dupeAt(i))) {
    max = Math.min(hardMax, max + 10);
    out.forEach((label, i) => {
      const original = raw[i];
      if (original !== undefined && original.length > label.length - 1 && dupeAt(i)) {
        out[i] = original.length > max ? `${original.slice(0, max)}…` : original;
      }
    });
  }
  return out;
}

export function EvidenceGraph({
  run,
  sources,
  claims,
  relations,
  onOpenClaim,
  onOpenHypothesis,
}: {
  run: ResearchRun;
  sources: SourceDocument[];
  claims: ScientificClaim[];
  relations: EvidenceRelation[];
  onOpenClaim: (claimId: string) => void;
  onOpenHypothesis: () => void;
}): ReactNode {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const [hover, setHover] = useState<string | null>(null);
  const [view, setView] = useState({ k: 1, tx: 0, ty: 0 });
  /** VIZ V5: per-node drag offsets (reset with the view); honest full render is opt-in. */
  const [offsets, setOffsets] = useState<Map<string, { dx: number; dy: number }>>(new Map());
  const [showAll, setShowAll] = useState(false);
  const dragRef = { active: false, x: 0, y: 0, nodeId: null as string | null };
  const svgPointRef = { k: 1, tx: 0, ty: 0 };

  const hypFetcher = useCallback((signal: AbortSignal) => getHypotheses(run.id, signal), [run.id]);
  const hypRes = useResource(hypFetcher, [run.id], `${run.updatedAt}:${run.status}`);
  const hypotheses = hypRes.data?.hypotheses ?? [];

  const { nodes, edges, height, truncated } = useMemo(() => {
    // Discriminating filter needs hypothesis bindings; claim→hyp edges come
    // from BOTH the hypothesis id-arrays (authoritative) and relations.
    const supportingOf = new Map<string, Set<string>>();
    const counterOf = new Map<string, Set<string>>();
    for (const h of hypotheses) {
      for (const cid of h.supportingClaimIds ?? []) {
        const set = supportingOf.get(cid) ?? new Set<string>();
        set.add(h.id); supportingOf.set(cid, set);
      }
      for (const cid of h.counterClaimIds ?? []) {
        const set = counterOf.get(cid) ?? new Set<string>();
        set.add(h.id); counterOf.set(cid, set);
      }
    }
    const discriminating = (cid: string): boolean => {
      const total = (supportingOf.get(cid)?.size ?? 0) + (counterOf.get(cid)?.size ?? 0);
      return total === 1; // bound to exactly one hypothesis — where comparisons are decided
    };

    const cap = showAll ? Number.POSITIVE_INFINITY : MAX_NODES_PER_COL;
    const visibleSources = sources.slice(0, cap);
    const visibleClaims = claims
      .filter((c) => {
        if (filter === 'counter') return (counterOf.get(c.id)?.size ?? 0) > 0;
        if (filter === 'supporting') return (supportingOf.get(c.id)?.size ?? 0) > 0;
        if (filter === 'discriminating') return discriminating(c.id);
        return true;
      })
      .slice(0, cap);
    const visibleHyps = hypotheses.slice(0, cap);

    const nodeList: GraphNode[] = [];
    const sourceLabels = truncateLabels(visibleSources.map((s) => s.title), 30, 52);
    visibleSources.forEach((s, i) => nodeList.push({
      id: s.id, kind: 'source', x: COL_X.source, y: FIRST_ROW_Y + i * ROW_H,
      label: sourceLabels[i] ?? s.title, title: s.title,
      supportingCount: 0, counterCount: 0,
    }));
    const claimLabels = truncateLabels(visibleClaims.map((c) => c.text), 36, 60);
    visibleClaims.forEach((c, i) => nodeList.push({
      id: c.id, kind: 'claim', x: COL_X.claim, y: FIRST_ROW_Y + i * ROW_H,
      label: claimLabels[i] ?? c.text, title: c.text,
      tone: c.bindingStatus === 'verified' ? 'verified' : c.bindingStatus === 'resolved_unaligned' ? 'caution' : c.bindingStatus === 'unresolved' ? 'refuted' : 'unknown',
      supportingCount: supportingOf.get(c.id)?.size ?? 0,
      counterCount: counterOf.get(c.id)?.size ?? 0,
    }));
    const hypLabels = truncateLabels(visibleHyps.map((h) => h.statement), 44, 72);
    visibleHyps.forEach((h, i) => nodeList.push({
      id: h.id, kind: 'hypothesis', x: COL_X.hypothesis, y: FIRST_ROW_Y + i * ROW_H,
      label: hypLabels[i] ?? h.statement, title: h.statement,
      supportingCount: h.supportingClaimIds?.length ?? 0, counterCount: h.counterClaimIds?.length ?? 0,
    }));

    const nodeIds = new Set(nodeList.map((n) => n.id));
    const edgeList: GraphEdge[] = [];
    const claimIds = new Set(visibleClaims.map((c) => c.id));
    for (const c of visibleClaims) {
      for (const loc of c.locators) {
        if (nodeIds.has(loc.sourceDocumentId)) {
          edgeList.push({ id: `loc-${c.id}-${loc.sourceDocumentId}`, from: loc.sourceDocumentId, to: c.id, kind: 'locator' });
        }
      }
    }
    for (const h of visibleHyps) {
      for (const cid of h.supportingClaimIds ?? []) {
        if (claimIds.has(cid)) edgeList.push({ id: `sup-${cid}-${h.id}`, from: cid, to: h.id, kind: 'supports' });
      }
      for (const cid of h.counterClaimIds ?? []) {
        if (claimIds.has(cid)) edgeList.push({ id: `ctr-${cid}-${h.id}`, from: cid, to: h.id, kind: 'counters' });
      }
    }
    for (const r of relations) {
      if (r.targetClaimId !== undefined && claimIds.has(r.claimId ?? '') && claimIds.has(r.targetClaimId)) {
        edgeList.push({ id: `cc-${r.id}`, from: r.claimId!, to: r.targetClaimId, kind: 'claim_claim', dashed: true, ...(r.strength !== undefined ? { strength: r.strength } : {}) });
      }
    }
    const maxRows = Math.max(visibleSources.length, visibleClaims.length, visibleHyps.length);
    const truncated = Math.max(
      (sources.length > visibleSources.length ? sources.length - visibleSources.length : 0),
      (claims.length > visibleClaims.length ? claims.length - visibleClaims.length : 0),
      (hypotheses.length > visibleHyps.length ? hypotheses.length - visibleHyps.length : 0),
    );
    return { nodes: nodeList, edges: edgeList, height: FIRST_ROW_Y + 18 + maxRows * ROW_H, truncated };
  }, [sources, claims, relations, hypotheses, filter, showAll]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n] as const)), [nodes]);
  const activeEdges = hover !== null
    ? new Set(edges.filter((e) => e.from === hover || e.to === hover).flatMap((e) => [e.from, e.to]))
    : null;

  const activate = (n: GraphNode): void => {
    if (n.kind === 'claim') onOpenClaim(n.id);
    else if (n.kind === 'hypothesis') onOpenHypothesis();
    // VIZ V5: sources land on their row in the sources table above.
    else document.getElementById(`src-${n.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const nodePos = (n: GraphNode): { x: number; y: number } => {
    const off = offsets.get(n.id);
    return off !== undefined ? { x: n.x + off.dx, y: n.y + off.dy } : { x: n.x, y: n.y };
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>): void => {
    e.preventDefault();
    setView((v) => ({ ...v, k: Math.min(2.5, Math.max(0.4, v.k * (e.deltaY < 0 ? 1.1 : 0.9))) }));
    svgPointRef.k = Math.min(2.5, Math.max(0.4, view.k * (e.deltaY < 0 ? 1.1 : 0.9)));
  };

  const beginNodeDrag = (e: React.MouseEvent, id: string): void => {
    e.stopPropagation();
    dragRef.active = true;
    dragRef.nodeId = id;
    dragRef.x = e.clientX;
    dragRef.y = e.clientY;
  };

  const onSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>): void => {
    if (!dragRef.active) return;
    const dx = e.clientX - dragRef.x;
    const dy = e.clientY - dragRef.y;
    dragRef.x = e.clientX;
    dragRef.y = e.clientY;
    if (dragRef.nodeId !== null) {
      // Node drag: deltas are screen px; undo the view transform to stay 1:1 with the cursor.
      const id = dragRef.nodeId;
      setOffsets((prev) => {
        const cur = prev.get(id) ?? { dx: 0, dy: 0 };
        const next = new Map(prev);
        next.set(id, { dx: cur.dx + dx / view.k, dy: cur.dy + dy / view.k });
        return next;
      });
    } else {
      setView((v) => ({ ...v, tx: v.tx + dx, ty: v.ty + dy }));
    }
  };

  const endDrag = (): void => {
    dragRef.active = false;
    dragRef.nodeId = null;
  };

  const FILTERS: { key: Filter; labelKey: DictKey }[] = [
    { key: 'all', labelKey: 'graph.filterAll' },
    { key: 'counter', labelKey: 'graph.filterCounter' },
    { key: 'supporting', labelKey: 'graph.filterSupporting' },
    { key: 'discriminating', labelKey: 'graph.filterDiscriminating' },
  ];

  return (
    <div className="evidence-graph">
      <div className="graph-toolbar" role="group" aria-label={t('graph.title')}>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`btn btn--sm${filter === f.key ? ' btn--primary' : ''}`}
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
          >
            {t(f.labelKey)}
          </button>
        ))}
        <span className="muted small">{t('graph.counts', { s: nodes.filter((n) => n.kind === 'source').length, c: nodes.filter((n) => n.kind === 'claim').length, h: nodes.filter((n) => n.kind === 'hypothesis').length })}</span>
        <button type="button" className="btn btn--sm" onClick={() => { setView({ k: 1, tx: 0, ty: 0 }); setOffsets(new Map()); }}>
          {t('graph.reset')}
        </button>
        {truncated > 0 && (
          <span className="graph-truncated" role="status">
            <span className="text-warn small">{t('graph.truncated', { n: truncated })}</span>
            <button type="button" className="btn btn--sm" onClick={() => setShowAll(true)} disabled={showAll}>
              {t('graph.showAll')}
            </button>
          </span>
        )}
      </div>
      <svg
        className="graph-svg"
        viewBox={`0 0 ${VIEW_W} ${height}`}
        role="img"
        aria-label={t('graph.aria', { s: sources.length, c: claims.length, h: hypotheses.length })}
        onWheel={onWheel}
        onMouseDown={(e) => { dragRef.active = true; dragRef.nodeId = null; dragRef.x = e.clientX; dragRef.y = e.clientY; }}
        onMouseMove={onSvgMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        {/* Column headers — the 3-second mental model (what each column IS). */}
        <g>
          <text x={COL_X.source} y={HEADER_Y} fontSize={11} fontWeight={600} fill="var(--v2-text-1)">{t('graph.colSource')}</text>
          <text x={COL_X.claim} y={HEADER_Y} fontSize={11} fontWeight={600} fill="var(--v2-text-1)">{t('graph.colClaim')}</text>
          <text x={COL_X.hypothesis} y={HEADER_Y} fontSize={11} fontWeight={600} fill="var(--v2-text-1)">{t('graph.colHyp')}</text>
          {/* Polarity legend swatches — support/counter must be legible at a glance. */}
          <line x1={COL_X.claim + 140} y1={HEADER_Y - 4} x2={COL_X.claim + 176} y2={HEADER_Y - 4} stroke="var(--v2-verified)" strokeWidth={2.6} />
          <text x={COL_X.claim + 182} y={HEADER_Y} fontSize={10} fill="var(--v2-text-1)">{t('graph.legendSupport')}</text>
          <line x1={COL_X.claim + 230} y1={HEADER_Y - 4} x2={COL_X.claim + 266} y2={HEADER_Y - 4} stroke="var(--v2-refuted)" strokeWidth={2.6} />
          <text x={COL_X.claim + 272} y={HEADER_Y} fontSize={10} fill="var(--v2-text-1)">{t('graph.legendCounter')}</text>
        </g>
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
          {edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (a === undefined || b === undefined) return null;
            const pa = nodePos(a);
            const pb = nodePos(b);
            const dim = activeEdges !== null && !activeEdges.has(e.from) && !activeEdges.has(e.to);
            const stroke = e.kind === 'supports' ? 'var(--v2-verified)' : e.kind === 'counters' ? 'var(--v2-refuted)' : 'var(--v2-border)';
            // Focus mode must POP: active edges thicken further, everything else recedes.
            const inFocus = activeEdges !== null && (activeEdges.has(e.from) || activeEdges.has(e.to));
            const baseW = e.strength !== undefined ? STRENGTH_W[e.strength] : e.kind === 'locator' ? 0.8 : 2.2;
            return (
              <line
                key={e.id}
                x1={pa.x + (a.kind === 'source' ? 8 : 10)} y1={pa.y}
                x2={pb.x - (b.kind === 'hypothesis' ? 10 : 8)} y2={pb.y}
                stroke={stroke}
                strokeWidth={inFocus ? baseW + 0.8 : baseW}
                strokeDasharray={e.dashed === true ? '4 3' : undefined}
                opacity={dim ? 0.08 : e.kind === 'locator' ? 0.35 : inFocus ? 1 : 0.85}
              >
                {e.strength !== undefined && <title>{`${t('graph.claimClaim')} — ${t(`graph.strength.${e.strength}`)}`}</title>}
              </line>
            );
          })}
          {nodes.map((n) => {
            const dim = activeEdges !== null && !activeEdges.has(n.id) && hover !== n.id;
            const fill = n.kind === 'source'
              ? 'var(--v2-surface-2)'
              : n.kind === 'claim'
                ? 'var(--v2-surface)'
                : 'var(--v2-surface-2)';
            return (
              <g
                key={n.id}
                transform={`translate(${nodePos(n).x} ${nodePos(n).y})`}
                opacity={dim ? 0.25 : 1}
                tabIndex={0}
                role="button"
                aria-label={`${n.kind}: ${n.title}`}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(n.id)}
                onBlur={() => setHover(null)}
                onMouseDown={(e) => beginNodeDrag(e, n.id)}
                onClick={() => activate(n)}
                onKeyDown={(e) => { if (e.key === 'Enter') activate(n); }}
                className="graph-node graph-node--draggable"
              >
                {n.kind === 'source' && <rect x={-8} y={-5} width={16} height={10} rx={2} fill={fill} stroke="var(--v2-border)" />}
                {n.kind === 'claim' && <circle r={6} fill={fill} stroke={`var(--v2-${n.tone ?? 'unknown'})`} strokeWidth={2} />}
                {n.kind === 'hypothesis' && <rect x={-10} y={-9} width={20} height={18} rx={5} fill={fill} stroke="var(--v2-info)" strokeWidth={2} />}
                <title>{n.title}</title>
                <text x={14} y={4} fontSize={11} fill="var(--v2-text-1)">{n.label}</text>
              </g>
            );
          })}
        </g>
      </svg>
      <p className="muted small">{t('graph.legend')}</p>
    </div>
  );
}
