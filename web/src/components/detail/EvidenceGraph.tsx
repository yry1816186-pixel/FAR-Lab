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
}

const COL_X = { source: 60, claim: 330, hypothesis: 620 };
const ROW_H = 34;
const MAX_NODES_PER_COL = 40;

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
  const dragRef = { active: false, x: 0, y: 0 };

  const hypFetcher = useCallback((signal: AbortSignal) => getHypotheses(run.id, signal), [run.id]);
  const hypRes = useResource(hypFetcher, [run.id], `${run.updatedAt}:${run.status}`);
  const hypotheses = hypRes.data?.hypotheses ?? [];

  const { nodes, edges, height } = useMemo(() => {
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

    const visibleSources = sources.slice(0, MAX_NODES_PER_COL);
    const visibleClaims = claims
      .filter((c) => {
        if (filter === 'counter') return (counterOf.get(c.id)?.size ?? 0) > 0;
        if (filter === 'supporting') return (supportingOf.get(c.id)?.size ?? 0) > 0;
        if (filter === 'discriminating') return discriminating(c.id);
        return true;
      })
      .slice(0, MAX_NODES_PER_COL);
    const visibleHyps = hypotheses.slice(0, MAX_NODES_PER_COL);

    const nodeList: GraphNode[] = [];
    visibleSources.forEach((s, i) => nodeList.push({
      id: s.id, kind: 'source', x: COL_X.source, y: 30 + i * ROW_H,
      label: s.title.length > 26 ? `${s.title.slice(0, 26)}…` : s.title, title: s.title,
      supportingCount: 0, counterCount: 0,
    }));
    visibleClaims.forEach((c, i) => nodeList.push({
      id: c.id, kind: 'claim', x: COL_X.claim, y: 30 + i * ROW_H,
      label: c.text.length > 30 ? `${c.text.slice(0, 30)}…` : c.text, title: c.text,
      tone: c.bindingStatus === 'verified' ? 'verified' : c.bindingStatus === 'resolved_unaligned' ? 'caution' : c.bindingStatus === 'unresolved' ? 'refuted' : 'unknown',
      supportingCount: supportingOf.get(c.id)?.size ?? 0,
      counterCount: counterOf.get(c.id)?.size ?? 0,
    }));
    visibleHyps.forEach((h, i) => nodeList.push({
      id: h.id, kind: 'hypothesis', x: COL_X.hypothesis, y: 30 + i * ROW_H,
      label: h.statement.length > 34 ? `${h.statement.slice(0, 34)}…` : h.statement, title: h.statement,
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
        edgeList.push({ id: `cc-${r.id}`, from: r.claimId!, to: r.targetClaimId, kind: 'claim_claim', dashed: true });
      }
    }
    const maxRows = Math.max(visibleSources.length, visibleClaims.length, visibleHyps.length);
    return { nodes: nodeList, edges: edgeList, height: 60 + maxRows * ROW_H };
  }, [sources, claims, relations, hypotheses, filter]);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n] as const)), [nodes]);
  const activeEdges = hover !== null
    ? new Set(edges.filter((e) => e.from === hover || e.to === hover).flatMap((e) => [e.from, e.to]))
    : null;

  const activate = (n: GraphNode): void => {
    if (n.kind === 'claim') onOpenClaim(n.id);
    else if (n.kind === 'hypothesis') onOpenHypothesis();
    // sources have no dedicated surface yet — the title tooltip carries them
  };

  const onWheel = (e: React.WheelEvent<SVGSVGElement>): void => {
    e.preventDefault();
    setView((v) => ({ ...v, k: Math.min(2.5, Math.max(0.4, v.k * (e.deltaY < 0 ? 1.1 : 0.9))) }));
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
        <button type="button" className="btn btn--sm" onClick={() => setView({ k: 1, tx: 0, ty: 0 })}>
          {t('graph.reset')}
        </button>
      </div>
      <svg
        className="graph-svg"
        viewBox={`0 0 800 ${height}`}
        role="img"
        aria-label={t('graph.aria', { s: sources.length, c: claims.length, h: hypotheses.length })}
        onWheel={onWheel}
        onMouseDown={(e) => { dragRef.active = true; dragRef.x = e.clientX; dragRef.y = e.clientY; }}
        onMouseMove={(e) => {
          if (!dragRef.active) return;
          setView((v) => ({ ...v, tx: v.tx + (e.clientX - dragRef.x), ty: v.ty + (e.clientY - dragRef.y) }));
          dragRef.x = e.clientX; dragRef.y = e.clientY;
        }}
        onMouseUp={() => { dragRef.active = false; }}
        onMouseLeave={() => { dragRef.active = false; }}
      >
        <g transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
          {edges.map((e) => {
            const a = byId.get(e.from);
            const b = byId.get(e.to);
            if (a === undefined || b === undefined) return null;
            const dim = activeEdges !== null && !activeEdges.has(e.from) && !activeEdges.has(e.to);
            const stroke = e.kind === 'supports' ? 'var(--v2-verified)' : e.kind === 'counters' ? 'var(--v2-refuted)' : 'var(--v2-border)';
            return (
              <line
                key={e.id}
                x1={a.x + (a.kind === 'source' ? 8 : 10)} y1={a.y}
                x2={b.x - (b.kind === 'hypothesis' ? 10 : 8)} y2={b.y}
                stroke={stroke}
                strokeWidth={e.kind === 'locator' ? 0.7 : 1.4}
                strokeDasharray={e.dashed === true ? '4 3' : undefined}
                opacity={dim ? 0.08 : e.kind === 'locator' ? 0.45 : 0.85}
              />
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
                transform={`translate(${n.x} ${n.y})`}
                opacity={dim ? 0.25 : 1}
                tabIndex={0}
                role="button"
                aria-label={`${n.kind}: ${n.title}`}
                onMouseEnter={() => setHover(n.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(n.id)}
                onBlur={() => setHover(null)}
                onClick={() => activate(n)}
                onKeyDown={(e) => { if (e.key === 'Enter') activate(n); }}
                className="graph-node"
              >
                {n.kind === 'source' && <rect x={-8} y={-5} width={16} height={10} rx={2} fill={fill} stroke="var(--v2-border)" />}
                {n.kind === 'claim' && <circle r={6} fill={fill} stroke={`var(--v2-${n.tone ?? 'unknown'})`} strokeWidth={2} />}
                {n.kind === 'hypothesis' && <rect x={-10} y={-9} width={20} height={18} rx={5} fill={fill} stroke="var(--v2-info)" strokeWidth={2} />}
                <text x={14} y={4} fontSize={11} fill="var(--v2-text-2)">{n.label}</text>
              </g>
            );
          })}
        </g>
      </svg>
      <p className="muted small">{t('graph.legend')}</p>
    </div>
  );
}
