import { useState } from 'react';

import { useResearchEvaluate } from '@/shared/api/endpoints.ts';
import { formatMetric } from '@/shared/format.ts';
import { useT } from '@/shared/i18n/index.tsx';
import { Badge } from '@/shared/ui/Badge.tsx';
import { Button } from '@/shared/ui/Button.tsx';
import { DataTable, Td } from '@/shared/ui/DataTable.tsx';
import { EmptyBlock, ErrorBlock, LoadingBlock, Section } from '@/shared/ui/StateBlock.tsx';

/**
 * Evaluation view: program-computed metrics + deterministic recompute.
 * Triggered on demand (the evaluate endpoint recomputes on every call);
 * metrics needing a human rubric are listed, never auto-scored.
 */
export function MissionEvaluation({ runId, completed }: { readonly runId: string; readonly completed: boolean }) {
  const t = useT();
  const [requested, setRequested] = useState(false);
  const evaluation = useResearchEvaluate(runId, { enabled: completed && requested });

  if (!completed) {
    return <EmptyBlock title={t('mission.evaluation.needsCompleted')} />;
  }

  return (
    <div data-testid="mission-evaluation">
      {!requested ? (
        <div className="py-6 text-center">
          <Button
            onClick={() => {
              setRequested(true);
            }}
            data-testid="evaluate-run"
          >
            {t('mission.evaluation.run')}
          </Button>
        </div>
      ) : null}

      {evaluation.isPending && requested ? <LoadingBlock /> : null}
      {evaluation.isError ? <ErrorBlock error={evaluation.error} testId="evaluate-error" onRetry={() => void evaluation.refetch()} /> : null}

      {evaluation.isSuccess ? (
        <>
          <Section
            title={t('mission.evaluation.metrics')}
            actions={
              <Badge
                tone={
                  evaluation.data.deterministicRecompute === 'PASS'
                    ? 'ok'
                    : evaluation.data.deterministicRecompute === 'FAIL'
                      ? 'danger'
                      : 'muted'
                }
              >
                {t('mission.evaluation.recompute')}: {evaluation.data.deterministicRecompute}
              </Badge>
            }
          >
            {evaluation.data.metrics.length === 0 ? (
              <EmptyBlock />
            ) : (
              <DataTable
                caption={t('mission.evaluation.metrics')}
                head={[t('mission.evaluation.metricName'), t('mission.evaluation.metricValue'), t('mission.evaluation.metricDefinition')]}
              >
                {evaluation.data.metrics.map((metric) => (
                  <tr key={metric.name}>
                    <Td className="font-mono text-xs">{metric.name}</Td>
                    <Td mono>{formatMetric(metric.value)}</Td>
                    <Td className="text-xs text-ink2">{metric.definition}</Td>
                  </tr>
                ))}
              </DataTable>
            )}
            {evaluation.data.humanRubricMetrics.length > 0 ? (
              <p className="mt-3 text-xs text-ink3">
                {t('mission.evaluation.humanRubric')}: {evaluation.data.humanRubricMetrics.join(', ')}
              </p>
            ) : null}
          </Section>

          <Section title={t('mission.evaluation.verification')}>
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <p className="label-micro mb-1 text-ok">{t('mission.evaluation.verified')}</p>
                <ul className="space-y-1 text-xs text-ink2">
                  {evaluation.data.verification.verified.length === 0 ? (
                    <li className="text-ink3">{t('state.none')}</li>
                  ) : (
                    evaluation.data.verification.verified.map((item) => <li key={item} className="font-mono">{item}</li>)
                  )}
                </ul>
              </div>
              <div>
                <p className="label-micro mb-1 text-danger">{t('mission.evaluation.failures')}</p>
                <ul className="space-y-1 text-xs text-ink2">
                  {evaluation.data.verification.failures.length === 0 ? (
                    <li className="text-ink3">{t('state.none')}</li>
                  ) : (
                    evaluation.data.verification.failures.map((item) => <li key={item} className="text-danger">{item}</li>)
                  )}
                </ul>
              </div>
              <div>
                <p className="label-micro mb-1 text-ink3">{t('mission.evaluation.notVerifiable')}</p>
                <ul className="space-y-1 text-xs text-ink2">
                  {evaluation.data.verification.notVerifiable.length === 0 ? (
                    <li className="text-ink3">{t('state.none')}</li>
                  ) : (
                    evaluation.data.verification.notVerifiable.map((item) => <li key={item} className="font-mono">{item}</li>)
                  )}
                </ul>
              </div>
            </div>
          </Section>
        </>
      ) : null}
    </div>
  );
}
