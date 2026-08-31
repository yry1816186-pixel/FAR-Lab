import { useState } from 'react';
import { ApiError } from '../api/client';
import { ErrorBox } from '../components/common';
import { useI18n } from '../i18n/LanguageContext';
import { editRunQuestion, proposeScope, resumeRun, type EditQuestionInput } from '../api/endpoints';
import type { ResearchQuestion, ResearchRun } from '../api/types';
import { ScopeEditor, useScopeEditorDraft } from './ScopeEditor';
import { scopeEditorPatch, type ScopeEditorIssue } from './scopeEditorModel';
import './lab.css';

/**
 * §8.2 pre-launch scope review — mounted on the study map while the run is
 * still editable (status 'created' | 'paused'): the researcher sees the
 * receipt-backed scope proposal, EDITS domain / phenomena / boundaries /
 * goalType (PATCH /runs/:id/question — server 409s post-launch, keeping
 * post-launch corrections in the causal revision chain), then launches the
 * remainder. Nothing here fabricates: before the proposal the only action is
 * to request it; the proposal is a real scope-stage execution.
 */
export function ScopeReview({ run, question, onQuestionChanged, onLaunched }: {
  run: ResearchRun;
  question: ResearchQuestion | null;
  onQuestionChanged: () => void;
  onLaunched: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const [busy, setBusy] = useState<'propose' | 'save' | 'launch' | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [scopeIssues, setScopeIssues] = useState<ScopeEditorIssue[]>([]);
  const scopeEditor = useScopeEditorDraft(question);
  const [changedNote, setChangedNote] = useState<string[]>([]);
  const scopeDone = run.stages.find((s) => s.stage === 'scope')?.state === 'done';

  const doPropose = async (): Promise<void> => {
    setBusy('propose'); setError(null);
    try {
      await proposeScope(run.id);
      onQuestionChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
    } finally { setBusy(null); }
  };

  const persistEdits = async (): Promise<boolean> => {
    setError(null); setChangedNote([]); setScopeIssues([]);
    const current = question;
    if (current === null) return false;
    const scoped = scopeEditorPatch(current, scopeEditor.draft);
    setScopeIssues(scoped.issues);
    if (scoped.issues.length > 0) return false;
    const body: EditQuestionInput = { ...scoped.patch };
    if (Object.keys(body).length === 0) return true;
    try {
      const res = await editRunQuestion(run.id, body);
      setChangedNote(res.changedFields);
      onQuestionChanged();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
      return false;
    }
  };

  const doSave = async (): Promise<void> => {
    setBusy('save');
    try {
      await persistEdits();
    } finally { setBusy(null); }
  };

  const doLaunch = async (): Promise<void> => {
    setBusy('launch'); setError(null);
    try {
      // Persist the exact scope visible to the researcher before changing the
      // run state. If validation/networking fails, the paused run is retained.
      if (!(await persistEdits())) return;
      await resumeRun(run.id);
      onLaunched();
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
    } finally { setBusy(null); }
  };

  return (
    <section className="map-node" aria-labelledby="scope-review-title">
      <p className="map-node-label" id="scope-review-title">{t('scope.title')}</p>
      <div className="scope-review">
        {!scopeDone && <p className="scope-lede">{t('scope.lede')}</p>}
        {error !== null && <ErrorBox error={error} onRetry={() => setError(null)} />}

        {!scopeDone ? (
          <div className="scope-propose">
            <p className="scope-propose-hint">{t('scope.proposeHint')}</p>
            <div className="scope-acts">
              <button type="button" className="fu-start" disabled={busy !== null} onClick={() => { void doPropose(); }}>
                {busy === 'propose' ? t('scope.proposing') : t('scope.propose')}
              </button>
              {/* Honest path when this route provides no proposal (the offline
                  development wire refuses template scope): the draft still
                  launches directly — the pipeline runs for real (retrieval,
                  evidence) and reports whatever it can honestly produce. */}
              <button type="button" className="mb-act" disabled={busy !== null} onClick={() => { void doLaunch(); }}>
                {busy === 'launch' ? t('scope.launching') : t('scope.launchDirect')}
              </button>
            </div>
            <p className="scope-note">{t('scope.launchDirectHint')}</p>
          </div>
        ) : (
          <>
            {question === null ? (
              <p className="scope-note" role="status">{t('common.loading')}</p>
            ) : (
              <ScopeEditor
                idPrefix={`study-scope-${run.id}`}
                title={t('scope.editorSummary')}
                hint={t('scope.lede')}
                draft={scopeEditor.draft}
                onChange={(field, value) => { scopeEditor.change(field, value); setScopeIssues([]); setChangedNote([]); }}
                issues={scopeIssues}
                constraints={question.constraints}
              />
            )}
            {changedNote.length > 0 && (
              <p className="scope-saved" role="status">{t('scope.saved', { fields: changedNote.join('、') })}</p>
            )}
            <div className="scope-acts">
              <button type="button" className="mb-act" disabled={busy !== null || question === null} onClick={() => { void doSave(); }}>
                {busy === 'save' ? t('scope.saving') : t('scope.save')}
              </button>
              <button type="button" className="fu-start" disabled={busy !== null || question === null} onClick={() => { void doLaunch(); }}>
                {busy === 'launch' ? t('scope.launching') : t('scope.launch')}
              </button>
            </div>
            <p className="scope-note">{t('scope.note')}</p>
          </>
        )}
      </div>
    </section>
  );
}
