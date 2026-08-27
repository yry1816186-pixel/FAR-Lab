import { useEffect, useState } from 'react';
import { ApiError } from '../api/client';
import { ErrorBox } from '../components/common';
import { useI18n } from '../i18n/LanguageContext';
import { editRunQuestion, proposeScope, resumeRun, type EditQuestionInput } from '../api/endpoints';
import type { ResearchQuestion, ResearchRun } from '../api/types';
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
  // Draft form state, seeded from the (possibly proposed) question.
  const [domain, setDomain] = useState(question?.scope.domain ?? '');
  const [goalType, setGoalType] = useState(question?.goalType ?? '');
  const [phenomena, setPhenomena] = useState((question?.scope.phenomena ?? []).join('\n'));
  const [inScope, setInScope] = useState((question?.scope.inScope ?? []).join('\n'));
  const [outOfScope, setOutScope] = useState((question?.scope.outOfScope ?? []).join('\n'));
  const [changedNote, setChangedNote] = useState<string[]>([]);
  const scopeDone = run.stages.find((s) => s.stage === 'scope')?.state === 'done';

  // Reseed the form when the proposal lands (question object identity changes).
  useEffect(() => {
    setDomain(question?.scope.domain ?? '');
    setGoalType(question?.goalType ?? '');
    setPhenomena((question?.scope.phenomena ?? []).join('\n'));
    setInScope((question?.scope.inScope ?? []).join('\n'));
    setOutScope((question?.scope.outOfScope ?? []).join('\n'));
  }, [question]);

  const lines = (v: string): string[] => v.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

  const doPropose = async (): Promise<void> => {
    setBusy('propose'); setError(null);
    try {
      await proposeScope(run.id);
      onQuestionChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
    } finally { setBusy(null); }
  };

  const doSave = async (): Promise<void> => {
    setBusy('save'); setError(null); setChangedNote([]);
    const body: EditQuestionInput = {};
    const current = question;
    if (current !== null) {
      if (domain.trim() !== current.scope.domain) body.scope = { ...(body.scope ?? {}), domain: domain.trim() };
      if (goalType !== '' && goalType !== current.goalType) body.goalType = goalType as EditQuestionInput['goalType'];
      if (JSON.stringify(lines(phenomena)) !== JSON.stringify(current.scope.phenomena)) body.scope = { ...(body.scope ?? {}), phenomena: lines(phenomena) };
      if (JSON.stringify(lines(inScope)) !== JSON.stringify(current.scope.inScope ?? [])) body.scope = { ...(body.scope ?? {}), inScope: lines(inScope) };
      if (JSON.stringify(lines(outOfScope)) !== JSON.stringify(current.scope.outOfScope ?? [])) body.scope = { ...(body.scope ?? {}), outOfScope: lines(outOfScope) };
    }
    if (Object.keys(body).length === 0) { setBusy(null); return; }
    try {
      const res = await editRunQuestion(run.id, body);
      setChangedNote(res.changedFields);
      onQuestionChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
    } finally { setBusy(null); }
  };

  const doLaunch = async (): Promise<void> => {
    setBusy('launch'); setError(null);
    try {
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
        <p className="scope-lede">{t('scope.lede')}</p>
        {error !== null && <ErrorBox error={error} onRetry={() => setError(null)} />}

        {!scopeDone ? (
          <div className="scope-propose">
            <p className="scope-propose-hint">{t('scope.proposeHint')}</p>
            <button type="button" className="fu-start" disabled={busy !== null} onClick={() => { void doPropose(); }}>
              {busy === 'propose' ? t('scope.proposing') : t('scope.propose')}
            </button>
          </div>
        ) : (
          <>
            <div className="scope-grid">
              <label htmlFor="scope-domain">{t('scope.domain')}</label>
              <input id="scope-domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
              <label htmlFor="scope-goaltype">{t('scope.goalType')}</label>
              <select id="scope-goaltype" value={goalType} onChange={(e) => setGoalType(e.target.value)}>
                <option value="">{t('scope.goalKeep')}</option>
                <option value="explanatory">{t('scope.goal.explanatory')}</option>
                <option value="predictive">{t('scope.goal.predictive')}</option>
                <option value="interventional">{t('scope.goal.interventional')}</option>
                <option value="methodological">{t('scope.goal.methodological')}</option>
                <option value="exploratory">{t('scope.goal.exploratory')}</option>
              </select>
              <label htmlFor="scope-phenomena">{t('scope.phenomena')}</label>
              <textarea id="scope-phenomena" rows={3} value={phenomena} onChange={(e) => setPhenomena(e.target.value)} placeholder={t('scope.listHint')} />
              <label htmlFor="scope-in">{t('scope.inScope')}</label>
              <textarea id="scope-in" rows={2} value={inScope} onChange={(e) => setInScope(e.target.value)} placeholder={t('scope.listHint')} />
              <label htmlFor="scope-out">{t('scope.outOfScope')}</label>
              <textarea id="scope-out" rows={2} value={outOfScope} onChange={(e) => setOutScope(e.target.value)} placeholder={t('scope.listHint')} />
            </div>
            {changedNote.length > 0 && (
              <p className="scope-saved" role="status">{t('scope.saved', { fields: changedNote.join('、') })}</p>
            )}
            <div className="scope-acts">
              <button type="button" className="mb-act" disabled={busy !== null} onClick={() => { void doSave(); }}>
                {busy === 'save' ? t('scope.saving') : t('scope.save')}
              </button>
              <button type="button" className="fu-start" disabled={busy !== null} onClick={() => { void doLaunch(); }}>
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
