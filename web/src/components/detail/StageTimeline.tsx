import { Badge, TimeText } from '../common';
import { stageStateKey, stageStateTone } from '../../tones';
import { STAGE_ORDER } from '../../api/types';
import type { ResearchRun, StageRecord } from '../../api/types';
import { useI18n } from '../../i18n/LanguageContext';

/**
 * Full stage timeline: all canonical stages in STAGE_ORDER; stages without a
 * record render as pending (honest "not started" — never hidden or invented).
 */
export function StageTimeline({ run }: { run: ResearchRun }): JSX.Element {
  const { t } = useI18n();
  const byStage = new Map<string, StageRecord>(run.stages.map((s) => [s.stage, s]));

  return (
    <table className="data-table">
      <caption className="sr-only">{t('overview.timeline')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('timeline.col.stage')}</th>
          <th scope="col">{t('timeline.col.state')}</th>
          <th scope="col">{t('timeline.col.attempt')}</th>
          <th scope="col">{t('timeline.col.start')}</th>
          <th scope="col">{t('timeline.col.end')}</th>
          <th scope="col">{t('timeline.col.error')}</th>
        </tr>
      </thead>
      <tbody>
        {STAGE_ORDER.map((name) => {
          const record = byStage.get(name);
          const state = record?.state ?? 'pending';
          return (
            <tr key={name} className={`stage-row stage-row--${state}`}>
              <th scope="row">{t(`stage.${name}` as never)}</th>
              <td>
                <Badge tone={stageStateTone(state)}>{t(stageStateKey(state))}</Badge>
              </td>
              <td className="mono">{record?.attempt !== undefined ? `#${record.attempt}` : '—'}</td>
              <td>
                {record?.startedAt !== undefined ? <TimeText iso={record.startedAt} /> : <span className="muted">—</span>}
              </td>
              <td>
                {record?.endedAt !== undefined ? <TimeText iso={record.endedAt} /> : <span className="muted">—</span>}
                {record?.subtasks !== undefined && record.subtasks.known && (
                  <span className="muted mono"> · {t('overview.subtasks', { done: record.subtasks.done, total: record.subtasks.total })}</span>
                )}
                {record?.checkpointRef !== undefined && (
                  <span className="muted mono" title={record.checkpointRef}>
                    {' '}· {t('overview.checkpoint')}: {record.checkpointRef.slice(0, 14)}…
                  </span>
                )}
              </td>
              <td>
                {record?.error !== undefined ? (
                  <span className="text-err" title={record.error}>
                    {record.error.length > 100 ? `${record.error.slice(0, 100)}…` : record.error}
                  </span>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
