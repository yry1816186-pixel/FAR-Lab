import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { getHypotheses } from '../../api/endpoints';
import type { EvidenceRelation, ResearchRun, ScientificClaim, SourceDocument } from '../../api/types';
import { useResource } from '../../hooks/useResource';
import { useI18n } from '../../i18n/LanguageContext';
import type { DictKey } from '../../i18n/dict';
import { zhFirst, decodeEntities } from '../../lab/bilingual';

/**
 * B7 evidence landscape: sources ← claims ← hypotheses as one interactive SVG
 * graph (zero dependencies — hand-rolled, deterministic tri-column layout).
 * Every node and edge is a REAL store object (locator, relation, explicit
 * binding); nothing is invented for the picture. Interactions: hover to
 * trace a node's edges, click a claim to open the map inspector, click a
 * hypothesis to jump to its band; polarity filters; wheel zoom + drag pan.
 * Keyboard: nodes are focusable, Enter activates, Esc resets the view.
 *
 * 2026-09-02 Wave D rework (design-baseline SC1/SC2/W3/W6/W7/W9/W10): the
 * plain three-independent-lists layout failed at real density (5×17×10) —
 * edges crossed claim text and each other into an unreadable braid. Three
 * structural changes:
 *  1. Barycenter ordering: claims cluster by their primary source and their
 *     bound hypotheses; hypotheses order by their claim mass — connected rows
 *     sit near each other, so most edges are short and near-parallel instead
 *     of long crossers. Deterministic two-pass median heuristic, stable
 *     tie-breaks on id.
 *  2. An edge-routing gutter: node labels stop ~120px before the next column
 *     and bezier control points hug the target column, so curves travel a
 *     corridor that text does not occupy; a background halo on every label is
 *     the second line of defense.
 *  3. Honest scale encoding: locator edges recede (context), support/counter
 *     carry the polarity; the legend states every edge kind and the ✓/✗
 *     column glyphs; hypothesis boxes show their rank.
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
  /** researcher-layer marks (disclosed in place, same glyphs as the band) */
  researcherExcluded?: boolean;
  researcherPinned?: boolean;
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

const COL_X = { source: 64, claim: 420, hypothesis: 768 };
const VIEW_W = 1000;
const ROW_H = 34;
const MAX_NODES_PER_COL = 40;
/** Corridor reserved for edge routing between columns (labels stop short). */
const GUTTER_PX = 118;
/** First content row sits below the in-SVG column headers. */
const HEADER_Y = 16;
const FIRST_ROW_Y = 46;

const STRENGTH_W: Record<NonNullable<GraphEdge['strength']>, number> = { strong: 2.2, moderate: 1.6, weak: 1.0, unrated: 1.2 };

/**
 * Pixel-budget label fitting: a node label must never cross into the edge
 * corridor (see GUTTER_PX). Advance width is estimated without DOM
 * measurement — CJK/fullwidth ≈ fontSize, Latin ≈ 0.56×fontSize.
 * Look-alike truncated labels stay distinguishable: identical fits get a tail
 * fragment appended (head…tail) within the same budget instead of growing
 * past the corridor.
 */
const charWidth = (ch: string, fs: number): number =>
  ch.charCodeAt(0) > 0x2e7f ? fs : fs * 0.56;
const fitsWidth = (s: string, budgetPx: number, fs: number): boolean => {
  let w = 0;
  for (const ch of s) { w += charWidth(ch, fs); if (w > budgetPx) return false; }
  return true;
};
function fitLabel(raw: string, budgetPx: number, fs: number): string {
  if (fitsWidth(raw, budgetPx, fs)) return raw;
  let out = '';
  let w = charWidth('…', fs);
  for (const ch of raw) {
    w += charWidth(ch, fs);
    if (w > budgetPx) break;
    out += ch;
  }
  return `${out}…`;
}
function fitLabels(raw: string[], budgetPx: number, fs = 11): string[] {
  const out = raw.map((s) => fitLabel(s, budgetPx, fs));
  // Disambiguate identical fits with a tail slice, still inside the budget.
  for (let i = 0; i < out.length; i++) {
    const own = out[i];
    const ownRaw = raw[i];
    if (own === undefined || ownRaw === undefined) continue;
    if (!out.some((o, j) => j !== i && o === own && raw[j] !== ownRaw)) continue;
    const headLen = Math.max(2, own.replace(/…$/, '').length - 2);
    const tailLen = Math.min(6, ownRaw.length - headLen);
    let candidate = fitLabel(`${ownRaw.slice(0, headLen)}…${ownRaw.slice(ownRaw.length - tailLen)}`, budgetPx, fs);
    if (candidate === own) {
      // No room for head+tail: index markers — still distinguishable.
      candidate = fitLabel(`${own} [${i + 1}]`, budgetPx, fs);
    }
    out[i] = candidate;
  }
  return out;
}

/** SVG text halo: edges may pass behind a label during pans/drags — the text
 *  stays readable over its own background stroke (paint-order keeps the fill
 *  crisp). */
const HALO_STYLE = { paintOrder: 'stroke' as const, stroke: 'var(--v2-surface)', strokeWidth: 3, strokeLinejoin: 'round' as const };

/**
 * Barycenter ordering (deterministic median heuristic): position each node
 * near the mean position of its neighbors on the other side, so most edges
 * become short and near-parallel. `links` is [leftId, rightId][]; both sides
 * are returned in row order. Id tie-breaks keep it stable across renders.
 * Two type parameters — the two columns are different object kinds.
 */
function barycenterOrder<L, R>(
  left: L[],
  right: R[],
  idOf: (n: L | R) => string,
  links: [string, string][],
): { leftOrder: L[]; rightOrder: R[]; rightIndex: Map<string, number>; leftIndex: Map<string, number> } {
  const leftIndex = new Map(left.map((n, i) => [idOf(n), i] as const));
  const rightNeighbor = new Map<string, string[]>();
  const leftNeighbor = new Map<string, string[]>();
  for (const [a, b] of links) {
    const rn = rightNeighbor.get(a) ?? [];
    rn.push(b); rightNeighbor.set(a, rn);
    const ln = leftNeighbor.get(b) ?? [];
    ln.push(a); leftNeighbor.set(b, ln);
  }
  // Pass 1: order the right side by the mean row of its left neighbors.
  const rightPos = new Map<string, number>();
  for (const [ri, n] of right.entries()) {
    const ns = leftNeighbor.get(idOf(n)) ?? [];
    const mean = ns.length === 0
      ? ri
      : ns.reduce((acc, id) => acc + (leftIndex.get(id) ?? 0), 0) / ns.length;
    rightPos.set(idOf(n), mean);
  }
  const rightOrder = [...right].sort((a, b) =>
    (rightPos.get(idOf(a)) ?? 0) - (rightPos.get(idOf(b)) ?? 0) || (idOf(a) < idOf(b) ? -1 : 1));
  const rightIndex = new Map(rightOrder.map((n, i) => [idOf(n), i] as const));
  // Pass 2: order the left side by the mean of its (now-ordered) right neighbors.
  const leftPos = new Map<string, number>();
  for (const [li, n] of left.entries()) {
    const ns = rightNeighbor.get(idOf(n)) ?? [];
    const mean = ns.length === 0
      ? li
      : ns.reduce((acc, id) => acc + (rightIndex.get(id) ?? 0), 0) / ns.length;
    leftPos.set(idOf(n), mean);
  }
  const leftOrder = [...left].sort((a, b) =>
    (leftPos.get(idOf(a)) ?? 0) - (leftPos.get(idOf(b)) ?? 0) || (idOf(a) < idOf(b) ? -1 : 1));
  leftOrder.forEach((n, i) => leftIndex.set(idOf(n), i));
  return { leftOrder, rightOrder, rightIndex, leftIndex };
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
  const { t, lang } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  /** Claim-row clustering factor (review 2026-09-02): hypotheses (default —
   *  the comparison structure) or sources (the provenance reading path). */
  const [clusterBy, setClusterBy] = useState<'hypothesis' | 'source'>('hypothesis');
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
  /** Rank from scorecards (authoritative), unranked tail appended in list
   *  order — recomputes with the payload, not per render. */
  const hypRanks = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of hypRes.data?.scorecards ?? []) m.set(s.hypothesisId, s.rank);
    for (const h of hypRes.data?.hypotheses ?? []) {
      if (!m.has(h.id)) m.set(h.id, m.size + 1);
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the payload identity, not the wrapper object
  }, [hypRes.data]);

  const { nodes, edges, height, truncated, floating, counts } = useMemo(() => {
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
    // A source column of half-connected floats is noise, not structure: the
    // graph shows only sources LOCATED by a claim (the locator edges are its
    // reason to exist); the rest stay in the sources table.
    const locatedSourceIds = new Set<string>();
    for (const c of claims) {
      for (const loc of c.locators) locatedSourceIds.add(loc.sourceDocumentId);
    }
    const connectedSources = sources.filter((s) => locatedSourceIds.has(s.id));
    const floating = sources.length - connectedSources.length;
    const filteredClaims = claims.filter((c) => {
      if (filter === 'counter') return (counterOf.get(c.id)?.size ?? 0) > 0;
      if (filter === 'supporting') return (supportingOf.get(c.id)?.size ?? 0) > 0;
      if (filter === 'discriminating') return discriminating(c.id);
      return true;
    });

    // ---- Barycenter clustering (SC2): order sources/claims by their locator
    // mass, then claims/hypotheses by their binding mass. Connected rows end
    // up adjacent; long crossing braids collapse into short near-parallel fans.
    const locatorLinks: [string, string][] = [];
    for (const c of filteredClaims) {
      for (const loc of c.locators) locatorLinks.push([loc.sourceDocumentId, c.id]);
    }
    const sc = barycenterOrder(connectedSources, filteredClaims, (n) => n.id, locatorLinks);
    const orderedSources = sc.leftOrder.slice(0, cap);
    const bindingLinks: [string, string][] = [];
    for (const h of hypotheses) {
      for (const cid of h.supportingClaimIds ?? []) bindingLinks.push([cid, h.id]);
      for (const cid of h.counterClaimIds ?? []) bindingLinks.push([cid, h.id]);
    }
    const preClaims = filteredClaims.slice(0, cap);
    const ch = barycenterOrder(preClaims, hypotheses, (n) => n.id, bindingLinks);
    const orderedHyps = ch.rightOrder.slice(0, cap);
    const claimRow = ch.leftIndex; // claim row order honors hypothesis mass
    const sourceRow = new Map(orderedSources.map((s, i) => [s.id, i] as const));
    // claimRow came from pass 2 of the claim↔hyp ordering; merge the source
    // clustering so both sides influence the final claim order (pass 3).
    const sourceMeanOfClaim = new Map<string, number>();
    for (const c of preClaims) {
      const rows = c.locators
        .map((l) => sourceRow.get(l.sourceDocumentId))
        .filter((v): v is number => v !== undefined);
      sourceMeanOfClaim.set(c.id, rows.length === 0
        ? (sc.rightIndex.get(c.id) ?? 0)
        : rows.reduce((a, b) => a + b, 0) / rows.length);
    }
    const orderedClaims = [...preClaims].sort((a, b) =>
      (clusterBy === 'hypothesis'
        ? (claimRow.get(a.id) ?? 0) - (claimRow.get(b.id) ?? 0)
          || (sourceMeanOfClaim.get(a.id) ?? 0) - (sourceMeanOfClaim.get(b.id) ?? 0)
        : (sourceMeanOfClaim.get(a.id) ?? 0) - (sourceMeanOfClaim.get(b.id) ?? 0)
          || (claimRow.get(a.id) ?? 0) - (claimRow.get(b.id) ?? 0))
      || (a.id < b.id ? -1 : 1));

    const nodeList: GraphNode[] = [];
    // Label budgets stop short of the routing corridor (GUTTER_PX) — edges
    // travel the corridor, text does not (SC1 root fix).
    const sourceLabelPx = COL_X.claim - GUTTER_PX - COL_X.source - 14;
    const claimLabelPx = COL_X.hypothesis - GUTTER_PX - COL_X.claim - 14;
    const hypLabelPx = VIEW_W - COL_X.hypothesis - 14 - 6;
    const sourceLabels = fitLabels(orderedSources.map((s) => decodeEntities(s.title)), sourceLabelPx);
    orderedSources.forEach((s, i) => nodeList.push({
      id: s.id, kind: 'source', x: COL_X.source, y: FIRST_ROW_Y + i * ROW_H,
      label: sourceLabels[i] ?? s.title, title: decodeEntities(s.title),
      supportingCount: 0, counterCount: 0,
    }));
    const claimLabels = fitLabels(orderedClaims.map((c) => decodeEntities(c.text)), claimLabelPx);
    orderedClaims.forEach((c, i) => nodeList.push({
      id: c.id, kind: 'claim', x: COL_X.claim, y: FIRST_ROW_Y + i * ROW_H,
      label: claimLabels[i] ?? c.text, title: decodeEntities(c.text),
      tone: c.bindingStatus === 'verified' ? 'verified' : c.bindingStatus === 'resolved_unaligned' ? 'caution' : c.bindingStatus === 'unresolved' ? 'refuted' : 'unknown',
      /** Researcher layer rides the graph (excluded/pinned disclosed in place,
       *  same marks as the evidence band — never erased from the picture). */
      researcherExcluded: c.researcher?.excluded === true,
      researcherPinned: c.researcher?.pinned === true,
      supportingCount: supportingOf.get(c.id)?.size ?? 0,
      counterCount: counterOf.get(c.id)?.size ?? 0,
    }));
    // Hypothesis labels follow the reader's language when the zh rendering exists.
    const hypTexts = orderedHyps.map((h) => zhFirst(h.statement, h.statementZh, lang));
    const hypLabels = fitLabels(hypTexts, hypLabelPx);
    orderedHyps.forEach((h, i) => nodeList.push({
      id: h.id, kind: 'hypothesis', x: COL_X.hypothesis, y: FIRST_ROW_Y + i * ROW_H,
      label: hypLabels[i] ?? h.statement, title: hypTexts[i] ?? h.statement,
      rank: hypRanks.get(h.id),
      supportingCount: h.supportingClaimIds?.length ?? 0, counterCount: h.counterClaimIds?.length ?? 0,
    }));

    const nodeIds = new Set(nodeList.map((n) => n.id));
    const edgeList: GraphEdge[] = [];
    const claimIds = new Set(orderedClaims.map((c) => c.id));
    for (const c of orderedClaims) {
      for (const loc of c.locators) {
        if (nodeIds.has(loc.sourceDocumentId)) {
          edgeList.push({ id: `loc-${c.id}-${loc.sourceDocumentId}`, from: loc.sourceDocumentId, to: c.id, kind: 'locator' });
        }
      }
    }
    for (const h of orderedHyps) {
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
    const maxRows = Math.max(orderedSources.length, orderedClaims.length, orderedHyps.length);
    const truncated = Math.max(
      (connectedSources.length > orderedSources.length ? connectedSources.length - orderedSources.length : 0),
      (filteredClaims.length > orderedClaims.length ? filteredClaims.length - orderedClaims.length : 0),
      (hypotheses.length > orderedHyps.length ? hypotheses.length - orderedHyps.length : 0),
    );
    const counts = {
      sources: orderedSources.length,
      claims: orderedClaims.length,
      hyps: orderedHyps.length,
      supports: edgeList.filter((e) => e.kind === 'supports').length,
      counters: edgeList.filter((e) => e.kind === 'counters').length,
      locators: edgeList.filter((e) => e.kind === 'locator').length,
    };
    return { nodes: nodeList, edges: edgeList, height: FIRST_ROW_Y + 18 + maxRows * ROW_H, truncated, floating, counts };
  }, [sources, claims, relations, hypotheses, hypRanks, filter, showAll, clusterBy, lang]);

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
        <span className="muted small">{t('graph.counts', { s: counts.sources, c: counts.claims, h: counts.hyps })}</span>
        <button type="button" className="btn btn--sm" onClick={() => { setView({ k: 1, tx: 0, ty: 0 }); setOffsets(new Map()); }}>
          {t('graph.reset')}
        </button>
        <button
          type="button"
          className="btn btn--sm"
          aria-pressed={clusterBy === 'source'}
          title={t('graph.clusterHint')}
          onClick={() => setClusterBy((v) => (v === 'hypothesis' ? 'source' : 'hypothesis'))}
        >
          {clusterBy === 'hypothesis' ? t('graph.clusterBySource') : t('graph.clusterByHyp')}
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
        </g>
        {/* Edge-kind legend with live counts (W7), one block over the claim
            column: every stroke on the canvas is named — locator context
            lines included — so nothing reads as unexplained decoration. */}
        <g fontSize={10}>
          <line x1={COL_X.claim + 8} y1={HEADER_Y + 18} x2={COL_X.claim + 34} y2={HEADER_Y + 18} stroke="var(--v2-text-3)" strokeWidth={1} opacity={0.5} />
          <text x={COL_X.claim + 38} y={HEADER_Y + 21} fill="var(--v2-text-2)">{`${t('graph.legendLocator')} ${counts.locators}`}</text>
          <line x1={COL_X.claim + 128} y1={HEADER_Y + 18} x2={COL_X.claim + 154} y2={HEADER_Y + 18} stroke="var(--v2-verified)" strokeWidth={2.4} />
          <text x={COL_X.claim + 158} y={HEADER_Y + 21} fill="var(--v2-text-2)">{`${t('graph.legendSupport')} ${counts.supports}`}</text>
          <line x1={COL_X.claim + 248} y1={HEADER_Y + 18} x2={COL_X.claim + 274} y2={HEADER_Y + 18} stroke="var(--v2-refuted)" strokeWidth={2.6} strokeDasharray="8 4" />
          <text x={COL_X.claim + 278} y={HEADER_Y + 21} fill="var(--v2-text-2)">{`${t('graph.legendCounter')} ${counts.counters}`}</text>
        </g>
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
          {edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (a === undefined || b === undefined) return null;
            const pa = nodePos(a);
            const pb = nodePos(b);
            const dim = activeEdges !== null && !activeEdges.has(e.from) && !activeEdges.has(e.to);
            // Locator edges stay context-tinted (NOT --v2-border: the dark-theme
            // border token is near-black on a near-black canvas — measured
            // invisible in dark QA 2026-08-29).
            const stroke = e.kind === 'supports' ? 'var(--v2-verified)' : e.kind === 'counters' ? 'var(--v2-refuted)' : 'var(--v2-text-3)';
            // Focus mode must POP: active edges thicken further, everything else recedes.
            const inFocus = activeEdges !== null && (activeEdges.has(e.from) || activeEdges.has(e.to));
            const baseW = e.strength !== undefined ? STRENGTH_W[e.strength] : e.kind === 'locator' ? 1.0 : e.kind === 'counters' ? 2.6 : 2.2;
            // Redundant polarity encoding (color-blind safe): counters dashed + thicker on
            // top of the color pair — supports solid thin, counters dashed bold.
            const dash = e.dashed === true ? '4 3' : e.kind === 'counters' ? '8 4' : undefined;
            // Corridor routing (SC1): control points give the curve a vertical
            // slope right out of the glyph (it crosses the label band
            // diagonally, never rides along a row's text) and hug the target
            // column, so the slow bend lives inside the reserved gutter. The
            // label halo covers the residual diagonal crossings.
            const gutter = pb.x - pa.x;
            const dy = pb.y - pa.y;
            // Claim↔claim edges connect the SAME column — a straight vertical
            // would ride the glyph spine; bulge them into the right corridor.
            const d = gutter === 0
              ? `M ${pa.x + 10} ${pa.y} C ${pa.x + 64} ${pa.y}, ${pb.x + 64} ${pb.y}, ${pb.x + 10} ${pb.y}`
              : `M ${pa.x + (a.kind === 'source' ? 8 : 10)} ${pa.y} C ${pa.x + gutter * 0.42} ${pa.y + dy * 0.28}, ${pb.x - gutter * 0.30} ${pb.y - dy * 0.28}, ${pb.x - (b.kind === 'hypothesis' ? 10 : 8)} ${pb.y}`;
            return (
              <path
                key={e.id}
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={inFocus ? baseW + 0.8 : baseW}
                strokeDasharray={dash}
                opacity={dim ? 0.06 : e.kind === 'locator' ? 0.16 : inFocus ? 1 : e.kind === 'supports' ? 0.65 : 0.5}
              >
                {e.strength !== undefined && <title>{`${t('graph.claimClaim')} — ${t(`graph.strength.${e.strength}`)}`}</title>}
              </path>
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
                {n.kind === 'source' && (
                  /* Document glyph (W6): a titled source chip, not a checkbox —
                     a checkbox invited "select me" affordance it never had. */
                  <g>
                    <rect x={-8} y={-5} width={16} height={10} rx={2.5} fill={fill} stroke="var(--v2-text-3)" strokeWidth={1.2} />
                    <line x1={-3.5} y1={-1.5} x2={3.5} y2={-1.5} stroke="var(--v2-text-3)" strokeWidth={0.9} />
                    <line x1={-3.5} y1={1.5} x2={1.5} y2={1.5} stroke="var(--v2-text-3)" strokeWidth={0.9} />
                  </g>
                )}
                {n.kind === 'claim' && (
                  /* Researcher glyph mirrors the band: ⊘ excluded (dashed ring,
                     struck label), ◆ pinned — the judgement is readable in the
                     graph itself, not only below it. */
                  <circle
                    r={6}
                    fill={fill}
                    stroke={`var(--v2-${n.tone ?? 'unknown'})`}
                    strokeWidth={2}
                    strokeDasharray={n.researcherExcluded === true ? '2.5 2' : undefined}
                  />
                )}
                {n.kind === 'hypothesis' && (
                  <g>
                    <rect x={-10} y={-9} width={20} height={18} rx={5} fill={fill} stroke="var(--v2-info)" strokeWidth={2} />
                    {n.rank !== undefined && (
                      <text x={0} y={3.5} fontSize={9} fontWeight={700} textAnchor="middle" fill="var(--v2-info)">{n.rank}</text>
                    )}
                  </g>
                )}
                <title>{n.title}</title>
                <text
                  x={14}
                  y={4}
                  fontSize={11}
                  fill={n.researcherExcluded === true ? 'var(--v2-text-3)' : 'var(--v2-text-1)'}
                  textDecoration={n.researcherExcluded === true ? 'line-through' : undefined}
                  opacity={n.researcherExcluded === true ? 0.75 : 1}
                  style={HALO_STYLE}
                >
                  {n.researcherPinned === true ? '◆ ' : ''}{n.researcherExcluded === true ? '⊘ ' : ''}{n.label}
                </text>
                {n.kind === 'claim' && (n.supportingCount > 0 || n.counterCount > 0) && (
                  /* Polarity count chips (W10): ride the routing corridor's right
                   *  end — inside the gutter, clear of the label budget. 11px at
                   *  text-2: the first cut at 10px/text-3 was below legibility
                   *  (review 2026-09-02 saw them as "missing"). */
                  <text
                    x={COL_X.hypothesis - 10}
                    y={4}
                    fontSize={11}
                    textAnchor="end"
                    fill="var(--v2-text-2)"
                    style={HALO_STYLE}
                  >
                    {n.supportingCount > 0 ? `✓${n.supportingCount}` : ''}{n.counterCount > 0 ? ` ✗${n.counterCount}` : ''}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <p className="muted small">{t('graph.legend')}</p>
      {floating > 0 && (
        <p className="muted small">{t('graph.floating', { n: floating })}</p>
      )}
    </div>
  );
}
