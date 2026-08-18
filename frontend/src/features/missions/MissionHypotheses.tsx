import type { HypothesisCandidateDto, ResearchRunDto } from '@/entities/dtos.ts';
import { useT, type MessageKey } from '@/shared/i18n/index.tsx';
import { Badge } from '@/shared/ui/Badge.tsx';
import { DataTable, Td } from '@/shared/ui/DataTable.tsx';
import { HashValue } from '@/shared/ui/HashValue.tsx';
import { EmptyBlock, Section } from '@/shared/ui/StateBlock.tsx';
import { cx } from '@/shared/ui/cx.ts';
import { RunGate } from './RunGate.tsx';

const SEVERITY_KEY: Readonly<Record<string, MessageKey>> = {
  critical: 'mission.hypotheses.severity.critical',
  major: 'mission.hypotheses.severity.major',
  minor: 'mission.hypotheses.severity.minor',
};

const SOURCE_KEY: Readonly<Record<string, MessageKey>> = {
  deterministic: 'mission.hypotheses.source.deterministic',
  model: 'mission.hypotheses.source.model',
  human: 'mission.hypotheses.source.human',
};

function StringList({ items }: { readonly items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm text-ink2">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function FalsificationLine({ hypothesis }: { readonly hypothesis: HypothesisCandidateDto }) {
  const fm = hypothesis.falsificationMethod;
  const threshold =
    fm.comparator === 'range'
      ? `[${String(fm.lower ?? '?')}, ${String(fm.upper ?? '?')}]`
      : `${fm.comparator === 'gt' ? '≥' : '≤'} ${String(fm.value ?? '?')}`;
  return (
    <p className="text-sm text-ink2">
      <span className="font-mono text-xs text-ink3">{fm.metric}</span> {threshold} — {fm.prediction}
    </p>
  );
}

function HypothesisCard({ run, hypothesis }: { readonly run: ResearchRunDto; readonly hypothesis: HypothesisCandidateDto }) {
  const t = useT();
  const binding = run.bindings[hypothesis.id];
  const critique = run.critiques[hypothesis.id];
  const scorecard = run.scorecards[hypothesis.id];
  const isPrimary = run.plan.primaryHypothesisId === hypothesis.id;

  return (
    <article className="rounded border border-border bg-surface" aria-label={hypothesis.statement}>
      <header className="border-b border-border px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {isPrimary ? <Badge tone="info">{t('mission.plan.primary')}</Badge> : null}
          {scorecard?.paretoOptimal === true ? <Badge tone="ok">{t('mission.hypotheses.pareto')}</Badge> : null}
          {hypothesis.strategyOrigin !== undefined ? (
            <Badge tone="muted">
              {t('mission.hypotheses.strategy')}: <span className="font-mono">{hypothesis.strategyOrigin}</span>
            </Badge>
          ) : null}
          <span className="ml-auto">
            <HashValue value={hypothesis.id} />
          </span>
        </div>
        <h3 className="mt-2 text-base font-semibold leading-snug text-ink">{hypothesis.statement}</h3>
      </header>

      <div className="space-y-5 px-4 py-4">
        <div>
          <p className="label-micro mb-1">{t('mission.hypotheses.mechanism')}</p>
          <p className="text-sm text-ink2">{hypothesis.mechanism}</p>
        </div>

        <div>
          <p className="label-micro mb-1">{t('mission.hypotheses.falsification')}</p>
          <FalsificationLine hypothesis={hypothesis} />
        </div>

        {hypothesis.observablePredictions.length > 0 ? (
          <div>
            <p className="label-micro mb-1">{t('mission.hypotheses.predictions')}</p>
            <StringList items={hypothesis.observablePredictions} />
          </div>
        ) : null}

        {binding !== undefined ? (
          <div>
            <p className="label-micro mb-1">{t('mission.hypotheses.citations')}</p>
            <p className="text-sm text-ink2">
              {t('mission.hypotheses.supporting')}: {binding.boundSupporting.length}/{binding.supportingIds.length} ·{' '}
              {t('mission.hypotheses.counter')}: {binding.boundCounter.length}/{binding.counterIds.length}
            </p>
            {binding.unbound.length > 0 ? (
              <p className="mt-1 text-xs text-warn">
                {t('mission.hypotheses.unbound')}: {binding.unbound.join(', ')}
              </p>
            ) : null}
          </div>
        ) : null}

        {critique !== undefined ? (
          <div>
            <p className="label-micro mb-1">{t('mission.hypotheses.critique')}</p>
            {critique.sameModelAsGenerator ? (
              <p className="mb-2 text-xs text-ink3">{t('mission.hypotheses.sameModel')}</p>
            ) : null}
            {critique.findings.length === 0 ? (
              <p className="text-sm text-ink3">{t('state.none')}</p>
            ) : (
              <ul className="space-y-1.5">
                {critique.findings.map((finding, i) => (
                  <li key={`${finding.dimension}-${String(i)}`} className="flex items-start gap-2 text-sm">
                    <Badge tone={finding.severity === 'critical' ? 'danger' : finding.severity === 'major' ? 'warn' : 'muted'}>
                      {t(SEVERITY_KEY[finding.severity] ?? 'mission.hypotheses.severity.minor')}
                    </Badge>
                    <span className="text-ink2">
                      <span className="font-mono text-xs text-ink3">{finding.dimension}</span> — {finding.finding}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}

        {scorecard !== undefined ? (
          <div>
            <p className="label-micro mb-1">{t('mission.hypotheses.scorecard')}</p>
            <DataTable
              caption={t('mission.hypotheses.scorecard')}
              head={['', 'grade', 'source', 'rationale']}
              className="border-0"
            >
              {scorecard.dimensions.map((dim) => (
                <tr key={dim.name}>
                  <Td className="font-mono text-xs">{dim.name}</Td>
                  <Td>
                    <span
                      className={cx(
                        'inline-block rounded px-1.5 font-mono text-xs font-bold',
                        dim.grade === 'A' && 'bg-ok/15 text-ok',
                        dim.grade === 'B' && 'bg-info/15 text-info',
                        dim.grade === 'C' && 'bg-warn/15 text-warn',
                        (dim.grade === 'D' || dim.grade === 'F') && 'bg-danger/15 text-danger',
                        dim.grade === 'NOT_APPLICABLE' && 'bg-surface2 text-ink3',
                      )}
                    >
                      {dim.grade}
                    </span>
                  </Td>
                  <Td className="text-xs text-ink3">{t(SOURCE_KEY[dim.source] ?? 'mission.hypotheses.source.model')}</Td>
                  <Td className="text-xs text-ink2">{dim.rationale}</Td>
                </tr>
              ))}
            </DataTable>
            <p className="mt-2 text-xs text-ink3">
              {t('mission.hypotheses.keyEvidence')}: {scorecard.keyEvidenceToChangeConclusion}
            </p>
          </div>
        ) : null}

        {hypothesis.risks.length > 0 ? (
          <div>
            <p className="label-micro mb-1">{t('mission.hypotheses.risks')}</p>
            <StringList items={hypothesis.risks} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

/** Hypotheses view: candidates with binding/critique/scorecard + tournament. */
export function MissionHypotheses({
  run,
  runPending,
  runNotCompleted,
}: {
  readonly run: ResearchRunDto | null;
  readonly runPending: boolean;
  readonly runNotCompleted: boolean;
}) {
  const t = useT();
  return (
    <RunGate run={run} runPending={runPending} runNotCompleted={runNotCompleted}>
      {(frozen) => (
        <div data-testid="mission-hypotheses">
          <Section title={`${t('mission.hypotheses.title')} (${String(frozen.hypotheses.length)})`}>
            {frozen.hypotheses.length === 0 ? (
              <EmptyBlock title={t('mission.hypotheses.empty')} />
            ) : (
              <div className="space-y-6">
                {frozen.hypotheses.map((hypothesis) => (
                  <HypothesisCard key={hypothesis.id} run={frozen} hypothesis={hypothesis} />
                ))}
              </div>
            )}
          </Section>

          {frozen.discovery?.tournament !== null && frozen.discovery?.tournament !== undefined ? (
            <Section title={t('mission.hypotheses.tournament')}>
              {frozen.discovery.tournament.meta.degenerate ? (
                <p className="mb-2 text-xs text-warn">{t('mission.hypotheses.tournamentDegenerate')}</p>
              ) : null}
              <DataTable
                caption={t('mission.hypotheses.tournament')}
                head={[t('mission.hypotheses.rank'), 'id', t('mission.hypotheses.elo'), t('mission.hypotheses.record'), t('mission.hypotheses.strategy')]}
              >
                {frozen.discovery.tournament.ratings.map((rating) => (
                  <tr key={rating.id}>
                    <Td mono>{rating.rank}</Td>
                    <Td>
                      <HashValue value={rating.id} />
                    </Td>
                    <Td mono>{Math.round(rating.elo)}</Td>
                    <Td mono>
                      {rating.wins}/{rating.draws}/{rating.losses}
                    </Td>
                    <Td className="font-mono text-xs text-ink3">{rating.strategyOrigin ?? '—'}</Td>
                  </tr>
                ))}
              </DataTable>
            </Section>
          ) : null}
        </div>
      )}
    </RunGate>
  );
}
