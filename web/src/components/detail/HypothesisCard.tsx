import { useState } from 'react';
import type { HypothesisCandidate } from '../../api/types';
import { useI18n } from '../../i18n/LanguageContext';
import { Badge, IdText } from '../common';
import { checkTone, noveltyKey, noveltyTone, testabilityKey, testabilityTone } from '../../tones';

export function HypothesisCard({
  hypothesis,
  clusterSize,
  isRepresentative,
}: {
  hypothesis: HypothesisCandidate;
  clusterSize: number;
  isRepresentative: boolean;
}): JSX.Element {
  const { t } = useI18n();
  const [specOpen, setSpecOpen] = useState(false);
  const f = hypothesis.falsification;
  const completeness = f?.completenessCheck;

  return (
    <article className={`hyp-card${isRepresentative ? '' : ' hyp-card--extra'}`}>
      <header className="hyp-head">
        <IdText value={hypothesis.id} />
        <span className="muted small">{t('hyp.version', { n: hypothesis.version })}</span>
        <Badge tone={testabilityTone(hypothesis.testability)}>{t(testabilityKey(hypothesis.testability))}</Badge>
        <Badge tone={noveltyTone(hypothesis.noveltyLabel)}>{t(noveltyKey(hypothesis.noveltyLabel))}</Badge>
        {completeness !== undefined ? (
          completeness.passed ? (
            <Badge tone="ok">{t('completeness.passed')}</Badge>
          ) : (
            <Badge tone="err" title={(completeness.missing ?? []).join('；')}>
              {t('completeness.failed')}
              {(completeness.missing ?? []).length > 0 && ` (${completeness.missing!.length})`}
            </Badge>
          )
        ) : (
          <Badge tone="muted">{t('completeness.unchecked')}</Badge>
        )}
      </header>

      {completeness !== undefined && !completeness.passed && (completeness.missing ?? []).length > 0 && (
        <p className="callout callout--err small">
          {t('completeness.missing', { items: completeness.missing!.join('；') })}
        </p>
      )}

      <dl className="fieldlist">
        <div className="fieldlist-row">
          <dt>{t('hyp.statement')}</dt>
          <dd className="hyp-statement">{hypothesis.statement}</dd>
        </div>
        {hypothesis.mechanism.trim().length > 0 && (
          <div className="fieldlist-row">
            <dt>{t('hyp.mechanism')}</dt>
            <dd>{hypothesis.mechanism}</dd>
          </div>
        )}
      </dl>

      {hypothesis.assumptions !== undefined && hypothesis.assumptions.length > 0 && (
        <div className="hyp-block">
          <h4 className="minor-title">{t('hyp.assumptions')}</h4>
          <ul className="assumptions">
            {hypothesis.assumptions.map((a) => (
              <li key={a.id}>
                <span className="mono assumption-kind">[{a.kind}]</span> {a.statement}
                {a.uncertainty !== undefined && <span className="muted small"> — {a.uncertainty}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {hypothesis.predictions !== undefined && hypothesis.predictions.length > 0 && (
        <div className="hyp-block">
          <h4 className="minor-title">{t('hyp.predictions')}</h4>
          <ul>
            {hypothesis.predictions.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      <div className="hyp-block">
        <h4 className="minor-title">
          <button
            type="button"
            className="link-button"
            aria-expanded={specOpen}
            onClick={() => setSpecOpen((v) => !v)}
          >
            {specOpen ? t('common.collapse') : t('common.expand')} · {t('hyp.falsification')}
          </button>
        </h4>
        {f === undefined ? (
          <p className="callout callout--err small">{t('hyp.falsification.missing')}</p>
        ) : specOpen ? (
          <FalsificationSpecView spec={f} />
        ) : (
          <p className="muted small">
            {f.observable.length > 160 ? `${f.observable.slice(0, 160)}…` : f.observable}
          </p>
        )}
      </div>

      <footer className="hyp-foot">
        {hypothesis.clusterKey !== undefined ? (
          <span className="muted small mono" title={hypothesis.clusterKey}>
            {t('hyp.cluster', { key: hypothesis.clusterKey.slice(0, 10), n: clusterSize })}
          </span>
        ) : (
          <span className="muted small">{t('hyp.clusterNone')}</span>
        )}
        {(hypothesis.supportingClaimIds?.length ?? 0) > 0 && (
          <span className="muted small">{t('hyp.supportingClaims', { n: hypothesis.supportingClaimIds!.length })}</span>
        )}
        {(hypothesis.counterClaimIds?.length ?? 0) > 0 && (
          <span className="muted small">{t('hyp.counterClaims', { n: hypothesis.counterClaimIds!.length })}</span>
        )}
      </footer>

      {(hypothesis.uncertainties !== undefined && hypothesis.uncertainties.length > 0) || hypothesis.distinctnessRationale !== undefined ? (
        <details className="hyp-details">
          <summary>
            {t('hyp.uncertainties')}
            {hypothesis.uncertainties !== undefined ? ` (${hypothesis.uncertainties.length})` : ''}
          </summary>
          {hypothesis.uncertainties !== undefined && hypothesis.uncertainties.length > 0 && (
            <ul>
              {hypothesis.uncertainties.map((u, i) => <li key={i}>{u}</li>)}
            </ul>
          )}
          {hypothesis.distinctnessRationale !== undefined && (
            <p className="muted small">
              <strong>{t('hyp.distinctness')}:</strong> {hypothesis.distinctnessRationale}
            </p>
          )}
          <p className="muted small mono">
            {t('hyp.derivation')} · {t('hyp.derivation.strategy', { strategy: hypothesis.derivation.strategy })}
            {hypothesis.derivation.modelRef !== undefined ? ` · ${hypothesis.derivation.modelRef}` : ''}
          </p>
        </details>
      ) : null}
    </article>
  );
}

function FalsificationSpecView({ spec }: { spec: NonNullable<HypothesisCandidate['falsification']> }): JSX.Element {
  const { t } = useI18n();
  const rows: [label: string, value: string][] = [
    [t('hyp.falsification.observable'), spec.observable],
    [t('hyp.falsification.measurement'), spec.measurement],
    [t('hyp.falsification.expectedRelation'), spec.expectedRelation],
    [t('hyp.falsification.decisionRule'), spec.decisionRule],
    [t('hyp.falsification.support'), spec.supportCondition],
    [t('hyp.falsification.weakening'), spec.weakeningCondition],
    [t('hyp.falsification.falsify'), spec.falsificationCondition],
    [t('hyp.falsification.method'), spec.method],
    [t('hyp.falsification.failureInterpretation'), spec.failureInterpretation],
  ];
  const listRows: [label: string, items: string[]][] = [
    [t('hyp.falsification.confounders'), spec.confounders ?? []],
    [t('hyp.falsification.altExplanations'), spec.alternativeExplanations ?? []],
    [t('hyp.falsification.dataReq'), spec.dataRequirements ?? []],
  ];
  return (
    <div className="falsification-spec">
      <dl className="fieldlist">
        {rows
          .filter(([, value]) => value.trim().length > 0)
          .map(([label, value]) => (
            <div className="fieldlist-row" key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        {listRows
          .filter(([, items]) => items.length > 0)
          .map(([label, items]) => (
            <div className="fieldlist-row" key={label}>
              <dt>{label}</dt>
              <dd>
                <ul>
                  {items.map((item, i) => <li key={i}>{item}</li>)}
                </ul>
              </dd>
            </div>
          ))}
      </dl>
      {spec.completenessCheck !== undefined && (
        <p>
          <Badge tone={checkTone(spec.completenessCheck.passed)}>
            {spec.completenessCheck.passed ? t('completeness.passed') : t('completeness.failed')}
          </Badge>
          {!spec.completenessCheck.passed && (spec.completenessCheck.missing ?? []).length > 0 && (
            <span className="muted small">
              {' '}
              {t('completeness.missing', { items: (spec.completenessCheck.missing ?? []).join('；') })}
            </span>
          )}
        </p>
      )}
    </div>
  );
}
