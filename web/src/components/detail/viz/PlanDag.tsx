import { useMemo, useState } from 'react';
import { useI18n } from '../../../i18n/LanguageContext';
import type { PlanStep } from '../../../api/types';
import { stepKindKey } from '../../../i18n/keys';
import { dagNeighbors, layoutPlanDag, DAG_NODE_H, DAG_NODE_W } from '../../../viz/plan-viz';

/**
 * Step-dependency DAG (VIZ V2) — the plan's dependsOn structure drawn as a
 * layered graph instead of a comma-joined string. Hand-rolled SVG (stack
 * decision A: domain-specific structure, no chart library). Hover/keyboard
 * focus isolates the transitive upstream+downstream chain; click scrolls to
 * the step card below (the list stays the accessible text form).
 */

export function PlanDag({ steps }: { steps: PlanStep[] }): JSX.Element | null {
  const { t } = useI18n();
  const [focus, setFocus] = useState<string | null>(null);
  const layout = useMemo(() => layoutPlanDag(steps), [steps]);
  const neighbors = useMemo(
    () => (focus !== null ? dagNeighbors(steps, focus) : null),
    [steps, focus],
  );
  if (layout.nodes.length === 0) return null;
  const inChain = (id: string): boolean => {
    if (neighbors === null) return true;
    return id === focus || neighbors.upstream.has(id) || neighbors.downstream.has(id);
  };

  const PAD = 12;
  const vbW = layout.width + PAD * 2;
  const vbH = layout.height + PAD * 2;
  const summary = layout.nodes
    .map((n) => `${n.index}. ${n.title}（${t(stepKindKey(n.kind))}${(n.invalidDeps.length > 0) ? `；${t('plan.dagInvalidDeps', { n: n.invalidDeps.length })}` : ''}）`)
    .join('；');

  const scrollToStep = (id: string): void => {
    document.getElementById(`step-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="plan-dag">
      <svg
        viewBox={`0 0 ${vbW} ${vbH}`}
        style={{ maxWidth: vbW, width: '100%', height: 'auto' }}
        role="img"
        aria-label={`${t('plan.dagTitle')} — ${summary}`}
      >
        {layout.edges.map((e, i) => (
          <polyline
            key={i}
            points={e.points.map((p) => `${p.x + PAD},${p.y + PAD}`).join(' ')}
            fill="none"
            strokeWidth={e.invalid ? 1.4 : 1.6}
            strokeDasharray={e.invalid ? '4 3' : undefined}
            stroke={e.invalid ? '#b3352c' : focus !== null && (e.from === focus || e.to === focus) ? '#2d78bd' : '#9aa1ab'}
            opacity={focus === null || e.from === focus || e.to === focus || inChain(e.from) && inChain(e.to) ? 0.9 : 0.18}
          >
            {e.invalid && <title>{t('plan.dagInvalidEdge', { ref: e.from })}</title>}
          </polyline>
        ))}
        {layout.nodes.map((n) => {
          const dimmed = !inChain(n.id);
          return (
            <g
              key={n.id}
              transform={`translate(${n.x + PAD}, ${n.y + PAD})`}
              tabIndex={0}
              role="button"
              aria-label={`${t('plan.dagStep', { n: n.index, title: n.title })} — ${t(stepKindKey(n.kind))}`}
              className="plan-dag-node"
              opacity={dimmed ? 0.25 : 1}
              onMouseEnter={() => setFocus(n.id)}
              onMouseLeave={() => setFocus(null)}
              onFocus={() => setFocus(n.id)}
              onBlur={() => setFocus(null)}
              onClick={() => scrollToStep(n.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  scrollToStep(n.id);
                }
              }}
            >
              <rect
                width={DAG_NODE_W}
                height={DAG_NODE_H}
                rx={6}
                className={`plan-dag-box${n.id === focus ? ' plan-dag-box--focus' : ''}`}
              />
              {n.invalidDeps.length > 0 && (
                <circle cx={DAG_NODE_W - 10} cy={10} r={5} fill="#b3352c">
                  <title>{t('plan.dagInvalidDeps', { n: n.invalidDeps.length })}</title>
                </circle>
              )}
              <text x={10} y={20} className="plan-dag-index">{n.index}. {t(stepKindKey(n.kind))}</text>
              <text x={10} y={38} className="plan-dag-title">
                {n.title.length > 26 ? `${n.title.slice(0, 26)}…` : n.title}
                <title>{n.title}</title>
              </text>
            </g>
          );
        })}
      </svg>
      <p className="muted small">{t('plan.dagNote')}</p>
    </div>
  );
}
