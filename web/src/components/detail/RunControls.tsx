import { useState } from 'react';
import { ApiError, withTimeout } from '../../api/client';
import { cancelRun, deleteRun, resumeRun } from '../../api/endpoints';
import type { ResearchRun } from '../../api/types';
import { isSettled } from '../../api/types';
import { useI18n } from '../../i18n/LanguageContext';
import { runStatusKey } from '../../tones';
import { errorText } from '../common';
/**
 * Run control buttons are enabled ONLY when the real run state makes the action
 * meaningful; every disabled state carries the honest reason (PRODUCT_HCI §2:
 * no dead controls, no fake success). Resume additionally becomes meaningful
 * for a completed run once pending feedback exists (feedback -> revision loop).
 * Delete (research lifecycle, gap R1) is offered for non-active runs only and
 * requires an explicit confirm; the list refresh clears the selection.
 */
export function RunControls({
  run,
  hasFeedback,
  onMutated,
}: {
  run: ResearchRun;
  hasFeedback: boolean;
  onMutated: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const [pending, setPending] = useState<'cancel' | 'resume' | 'delete' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const cancelReason = ((): string | null => {
    if (run.cancelRequested) return t('controls.cancelRequested');
    if (isSettled(run.status)) return t('controls.cancelDisabled', { status: t(runStatusKey(run.status)) });
    if (run.status === 'partial') return t('controls.cancelDisabled', { status: t('status.partial') });
    return null;
  })();

  const resumeReason = ((): string | null => {
    if (run.status === 'running' || run.status === 'queued') return t('controls.resumeDisabled.running');
    if (run.status === 'created') return t('controls.resumeDisabled.createdQueued');
    if (run.status === 'completed' && !hasFeedback) {
      // Spec example: completed + no pending feedback -> disabled with the honest reason.
      return t('controls.resumeDisabled.settled', { status: t('status.completed') });
    }
    // paused / partial / cancelled / failed / completed-with-feedback -> resumable
    // (cancelled resumes from checkpoint; failed retries from checkpoint; completed
    // + feedback re-enters the feedback->revision loop).
    return null;
  })();

  // Deletion guards mirror the server (409 run_active): active runs must be
  // cancelled first. 'created' (never started) is deletable — that is cleanup,
  // not data loss a researcher would mourn.
  const deleteReason = ((): string | null => {
    if (run.status === 'running' || run.status === 'queued') return t('controls.deleteDisabled.running');
    return null;
  })();

  const act = async (action: 'cancel' | 'resume' | 'delete'): Promise<void> => {
    setError(null);
    if (action === 'delete') {
      const label = (run.questionText ?? '').trim() || run.id;
      if (!window.confirm(t('controls.deleteConfirm', { label }))) return;
    }
    setPending(action);
    const controller = new AbortController();
    try {
      if (action === 'cancel') await cancelRun(run.id, withTimeout(controller.signal, 15_000));
      else if (action === 'delete') await deleteRun(run.id, withTimeout(controller.signal, 15_000));
      else await resumeRun(run.id, withTimeout(controller.signal, 15_000));
      onMutated();
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError(new ApiError({ code: 'timeout', message: '请求超时（15s）', retryable: true, i18nKey: 'err.timeout', i18nVars: { seconds: 15 } }));
      } else {
        setError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
      }
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="run-controls">
      <div className="run-controls-buttons">
        <button
          type="button"
          className="btn"
          disabled={cancelReason !== null || pending !== null}
          onClick={() => void act('cancel')}
        >
          {pending === 'cancel' ? t('controls.pending') : t('controls.cancel')}
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={resumeReason !== null || pending !== null}
          onClick={() => void act('resume')}
        >
          {pending === 'resume' ? t('controls.pending') : t('controls.resume')}
        </button>
        <button
          type="button"
          className="btn btn--danger"
          disabled={deleteReason !== null || pending !== null}
          onClick={() => void act('delete')}
        >
          {pending === 'delete' ? t('controls.pending') : t('controls.delete')}
        </button>
      </div>
      {cancelReason !== null && <p className="control-reason">{t('controls.cancel')}: {cancelReason}</p>}
      {resumeReason !== null && <p className="control-reason">{t('controls.resume')}: {resumeReason}</p>}
      {deleteReason !== null && <p className="control-reason">{t('controls.delete')}: {deleteReason}</p>}
      {error !== null && (
        <p className="field-error" role="alert">
          {t('controls.actionFailed')}：{errorText(error)}
        </p>
      )}
    </div>
  );
}
