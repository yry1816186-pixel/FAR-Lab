import { useEffect, useRef, useState } from 'react';
import { BookMarked, FileUp, Link2 } from 'lucide-react';
import { ErrorBox } from '../components/common';
import { ZoteroPanel } from '../components/ZoteroPanel';
import { DictationButton } from '../components/DictationButton';
import { useI18n } from '../i18n/LanguageContext';
import { useCreateRun } from '../hooks/useCreateRun';
import { deleteRun, editRunQuestion, listModelConfigs, proposeScope, resumeRun, type EditQuestionInput } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { ModelConfigsResponse, ResearchQuestion, ScientificGoalType } from '../api/types';
import { TRAY_MAX_SEEDS, SeedCardRow, useSeedTray } from './SeedTray';
import './lab.css';

/**
 * New research formation (HX §8.2) — the new architecture's creation surface.
 * One screen: the question in the researcher's words, materials riding the
 * shared SeedTray, the honest "what will happen" note, direct pipeline launch
 * (no mandatory chat round-trip), and conversational refinement as an OPTION.
 * Launch navigates to the study map where the live run is watched.
 *
 * §8.2 pre-launch scope review: "先看范围再启动" persists a DRAFT run, runs ONLY
 * the scope stage (receipt-backed proposal), parks the run, and lets the
 * researcher EDIT the refined scope before committing — 启动 continues the
 * draft via /resume. Direct launch stays one click for the quick path.
 */

const GOAL_TYPES: readonly ScientificGoalType[] = ['explanatory', 'predictive', 'interventional', 'methodological', 'exploratory'];

const linesOf = (items: readonly string[]): string => items.join('\n');
const fromLines = (text: string): string[] =>
  text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);

export function NewResearch({ onLaunched, onOpenConversation }: {
  onLaunched: (runId: string) => void;
  onOpenConversation: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const run = useCreateRun(onLaunched);
  const tray = useSeedTray((title) => {
    if (run.text.trim().length === 0) run.setText(t('ingest.questionFromCitation', { title }));
  });
  const [configs, setConfigs] = useState<ModelConfigsResponse | null>(null);
  const [zoteroOpen, setZoteroOpen] = useState(false);
  // Explicit citation/identifier entry (§8.2 one ingestion system): the paste
  // path cannot be scripted or reached without clipboard access — this is the
  // same parser (bibtex/ris entries, DOI/arXiv/URL lines) with a visible input.
  const [citeOpen, setCiteOpen] = useState(false);
  const [citeText, setCiteText] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const citeInputRef = useRef<HTMLTextAreaElement | null>(null);

  // ---- §8.2 scope-review journey state (idle until the preview button) ----
  const [draftId, setDraftId] = useState<string | null>(null);
  const [proposal, setProposal] = useState<ResearchQuestion | null>(null);
  const [reviewBusy, setReviewBusy] = useState<null | 'proposing' | 'saving' | 'launching'>(null);
  const [reviewError, setReviewError] = useState<ApiError | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [domainText, setDomainText] = useState('');
  const [goalChoice, setGoalChoice] = useState<ScientificGoalType>('explanatory');
  const [phenomenaText, setPhenomenaText] = useState('');
  const [inScopeText, setInScopeText] = useState('');
  const [outOfScopeText, setOutOfScopeText] = useState('');

  useEffect(() => {
    const c = new AbortController();
    listModelConfigs(c.signal).then(setConfigs).catch(() => setConfigs(null));
    return () => c.abort();
  }, []);

  // Keep the shared tray and the launch machine in sync (ready seeds only).
  useEffect(() => { run.setSeeds(tray.seeds); }, [tray.seeds, run.setSeeds]);

  // Keyboard path: arriving via "n" or the CTA puts the researcher straight
  // into the question — one keystroke from anywhere to typing (§9.8).
  useEffect(() => { textareaRef.current?.focus(); }, []);

  const enterReview = (q: ResearchQuestion): void => {
    setProposal(q);
    setDomainText(q.scope.domain);
    setGoalChoice(q.goalType);
    setPhenomenaText(linesOf(q.scope.phenomena));
    setInScopeText(linesOf(q.scope.inScope));
    setOutOfScopeText(linesOf(q.scope.outOfScope));
  };

  const startPreview = async (ev?: React.MouseEvent): Promise<void> => {
    ev?.preventDefault();
    setReviewError(null);
    setSavedNote(false);
    // Local binding: setState does not refresh the closure's draftId this
    // frame — proposing against '' produced /runs//scope-proposal (E2E caught).
    const id = draftId ?? (await run.submitDraft());
    if (id === null) return; // validation/creation error already surfaced by the hook
    setDraftId(id);
    setReviewBusy('proposing');
    try {
      const p = await proposeScope(id);
      enterReview(p.question);
    } catch (e) {
      setReviewError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
    } finally {
      setReviewBusy(null);
    }
  };

  const saveEdits = async (): Promise<void> => {
    if (proposal === null || draftId === null) return;
    setReviewError(null);
    setSavedNote(false);
    const scopePatch: NonNullable<EditQuestionInput['scope']> = {};
    const patch: EditQuestionInput = {};
    if (run.text.trim() !== proposal.text && run.text.trim().length > 0) patch.text = run.text.trim();
    if (goalChoice !== proposal.goalType) patch.goalType = goalChoice;
    if (domainText.trim() !== proposal.scope.domain && domainText.trim().length > 0) scopePatch.domain = domainText.trim();
    const phenomena = fromLines(phenomenaText);
    const inScope = fromLines(inScopeText);
    const outOfScope = fromLines(outOfScopeText);
    if (phenomena.length > 0 && JSON.stringify(phenomena) !== JSON.stringify(proposal.scope.phenomena)) scopePatch.phenomena = phenomena;
    if (JSON.stringify(inScope) !== JSON.stringify(proposal.scope.inScope)) scopePatch.inScope = inScope;
    if (JSON.stringify(outOfScope) !== JSON.stringify(proposal.scope.outOfScope)) scopePatch.outOfScope = outOfScope;
    if (Object.keys(scopePatch).length > 0) patch.scope = scopePatch;
    if (patch.text === undefined && patch.goalType === undefined && patch.scope === undefined) {
      setSavedNote(true); // nothing changed — the "saved" state is truthful (no-op)
      return;
    }
    setReviewBusy('saving');
    try {
      const res = await editRunQuestion(draftId, patch);
      setProposal(res.question);
      enterReview(res.question);
      setSavedNote(true);
    } catch (e) {
      setReviewError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
    } finally {
      setReviewBusy(null);
    }
  };

  const confirmLaunch = async (): Promise<void> => {
    if (draftId === null) return;
    setReviewError(null);
    setReviewBusy('launching');
    try {
      await resumeRun(draftId);
      onLaunched(draftId);
    } catch (e) {
      setReviewError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
      setReviewBusy(null);
    }
  };

  const discardDraft = async (): Promise<void> => {
    if (draftId === null) return;
    setReviewError(null);
    try {
      await deleteRun(draftId);
    } catch {
      // A discard failure must not strand the local journey; the draft simply
      // stays in the workspace (visible in the studies index) — honest either way.
    }
    setDraftId(null);
    setProposal(null);
    setSavedNote(false);
  };

  const keepDraft = (): void => {
    // The draft persists server-side ('paused' with scope done / 'created');
    // local journey resets. Resuming later = the studies index entry.
    setDraftId(null);
    setProposal(null);
    setSavedNote(false);
    setReviewError(null);
  };

  const canSubmit = !run.submitting && run.text.trim().length > 0;
  const reviewing = proposal !== null;
  const activeLabel = configs?.configs.find((c) => c.id === (run.providerConfigId === '' ? configs.activeModelConfigId : run.providerConfigId))?.label;

  return (
    <div className="lab-root">
      <header className="lab-topline">
        <span className="lab-title">{t('newresearch.title')}</span>
        <span className="lab-spacer" />
        <a href="#/">{t('newresearch.backHome')}</a>
      </header>

      <main className="nr-canvas">
        <form
          className={`nr-card${dragActive ? ' nr-card--drag' : ''}`}
          onSubmit={(e) => {
            e.preventDefault();
            // While reviewing, the implicit-submit path (Enter in an input)
            // confirms the draft launch — it must never bypass the review as
            // a silent direct launch.
            if (reviewing) void confirmLaunch();
            else void run.submit(e);
          }}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={(e) => { if (e.currentTarget === e.target) setDragActive(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const files = Array.from(e.dataTransfer.files);
            if (files.length > 0) tray.addFiles(files);
            else {
              const text = e.dataTransfer.getData('text/plain');
              if (text.length > 0) tray.addDroppedText(text);
            }
          }}
        >
          <label htmlFor="nr-question" className="nr-label">{t('newresearch.questionLabel')}</label>
          <textarea
            id="nr-question"
            ref={textareaRef}
            className="nr-question"
            value={run.text}
            rows={3}
            placeholder={t('newresearch.placeholder')}
            aria-invalid={run.showValidationError && run.text.trim().length === 0}
            onChange={(e) => run.setText(e.target.value)}
            onPaste={(e) => tray.onPaste(e)}
          />
          {run.showValidationError && run.text.trim().length === 0 && (
            <p className="nr-error" role="alert">{t('newresearch.needQuestion')}</p>
          )}

          {tray.cards.length > 0 && (
            <div className="nr-tray" aria-label={t('newresearch.materials')}>
              {tray.cards.map((c) => <SeedCardRow key={c.id} card={c} onRemove={tray.remove} onRetry={tray.retryCard} />)}
            </div>
          )}
          {tray.note !== null && <p className="nr-note" role="status">{tray.note}</p>}

          <div className="nr-actions">
            <button type="button" className="nr-tool" onClick={() => fileInputRef.current?.click()}>
              <FileUp size={13} aria-hidden="true" /> {t('newresearch.addFile')}
            </button>
            <button
              type="button"
              className="nr-tool"
              aria-expanded={citeOpen}
              onClick={() => { setCiteOpen((v) => !v); if (!citeOpen) window.setTimeout(() => citeInputRef.current?.focus(), 50); }}
            >
              <Link2 size={13} aria-hidden="true" /> {t('newresearch.addCitation')}
            </button>
            <button type="button" className="nr-tool" onClick={() => setZoteroOpen(true)}>
              <BookMarked size={13} aria-hidden="true" /> {t('newresearch.addZotero')}
            </button>
            <DictationButton
              onTranscribed={(fragment) => run.setText(`${run.text}${run.text.length > 0 ? ' ' : ''}${fragment}`)}
              onError={(message) => tray.flash(message)}
            />
            <span className="nr-tools-hint">{t('newresearch.pasteHint')}</span>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => { tray.addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
            />
          </div>

          {citeOpen && (
            <div className="nr-cite">
              <label htmlFor="nr-cite-input">{t('newresearch.citeLabel')}</label>
              <textarea
                id="nr-cite-input"
                ref={citeInputRef}
                rows={3}
                value={citeText}
                placeholder={t('newresearch.citePlaceholder')}
                onChange={(e) => setCiteText(e.target.value)}
              />
              <div className="nr-cite-acts">
                <button
                  type="button"
                  className="mb-act mb-act--primary"
                  disabled={citeText.trim().length === 0}
                  onClick={() => {
                    tray.addDroppedText(citeText);
                    setCiteText('');
                  }}
                >
                  {t('newresearch.citeAdd')}
                </button>
                <span className="nr-tools-hint">{t('newresearch.citeHint')}</span>
              </div>
            </div>
          )}

          {reviewing && (
            <section className="nr-review" aria-label={t('newresearch.reviewTitle')}>
              <h3 className="nr-review-title">{t('newresearch.reviewTitle')}</h3>
              <p className="nr-review-hint">{t('newresearch.reviewHint')}</p>
              <div className="nr-review-grid">
                <label className="nr-field">
                  <span className="nr-field-label">{t('newresearch.fieldDomain')}</span>
                  <input className="nr-input" value={domainText} onChange={(e) => setDomainText(e.target.value)} />
                </label>
                <label className="nr-field">
                  <span className="nr-field-label">{t('newresearch.fieldGoalType')}</span>
                  <select className="nr-input" value={goalChoice} onChange={(e) => setGoalChoice(e.target.value as ScientificGoalType)}>
                    {GOAL_TYPES.map((g) => <option key={g} value={g}>{t(`goalType.${g}`)}</option>)}
                  </select>
                </label>
                <label className="nr-field nr-field--wide">
                  <span className="nr-field-label">{t('newresearch.fieldPhenomena')}</span>
                  <textarea className="nr-input" rows={2} value={phenomenaText} onChange={(e) => setPhenomenaText(e.target.value)} />
                </label>
                <label className="nr-field">
                  <span className="nr-field-label">{t('newresearch.fieldInScope')}</span>
                  <textarea className="nr-input" rows={2} value={inScopeText} onChange={(e) => setInScopeText(e.target.value)} />
                </label>
                <label className="nr-field">
                  <span className="nr-field-label">{t('newresearch.fieldOutOfScope')}</span>
                  <textarea className="nr-input" rows={2} value={outOfScopeText} onChange={(e) => setOutOfScopeText(e.target.value)} />
                </label>
              </div>
              {proposal.constraints && (
                <p className="nr-review-constraints">
                  {t('newresearch.fieldConstraints')}
                  {': '}
                  {[...proposal.constraints.assumptions, ...proposal.constraints.dataConstraints, ...proposal.constraints.methodologicalConstraints].filter((s) => s.length > 0).join('；') || t('newresearch.noConstraints')}
                </p>
              )}
              {savedNote && <p className="nr-review-saved" role="status">{t('newresearch.saved')}</p>}
            </section>
          )}

          <div className="nr-launch-row">
            <select
              aria-label={t('newresearch.routeLabel')}
              className="nr-route"
              value={run.providerConfigId}
              onChange={(e) => run.setProviderConfigId(e.target.value)}
            >
              <option value="">{t('newresearch.routeDefault')}{activeLabel !== undefined ? `（${activeLabel}）` : ''}</option>
              {configs?.configs.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            {reviewing ? (
              <>
                <button type="button" className="nr-secondary" disabled={reviewBusy === 'saving'} onClick={() => void saveEdits()}>
                  {reviewBusy === 'saving' ? t('newresearch.saving') : t('newresearch.saveScope')}
                </button>
                <button type="button" className="nr-submit" disabled={reviewBusy !== null} onClick={() => void confirmLaunch()}>
                  {reviewBusy === 'launching' ? t('newresearch.launchingDraft') : t('newresearch.confirmLaunch')}
                </button>
                <span className="nr-review-links">
                  <button type="button" className="nr-linklike" onClick={() => void discardDraft()}>{t('newresearch.discardDraft')}</button>
                  <button type="button" className="nr-linklike" onClick={keepDraft} title={t('newresearch.keepDraftHint')}>{t('newresearch.keepDraft')}</button>
                </span>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="nr-secondary"
                  disabled={!canSubmit || reviewBusy !== null}
                  onClick={(e) => void startPreview(e)}
                >
                  {reviewBusy === 'proposing' ? t('newresearch.previewBusy') : t('newresearch.previewLaunch')}
                </button>
                <button type="submit" className="nr-submit" disabled={!canSubmit || reviewBusy !== null}>
                  {run.submitting || reviewBusy !== null ? t('newresearch.launching') : t('newresearch.launch')}
                </button>
              </>
            )}
          </div>
          {reviewBusy === 'proposing' && (
            <p className="nr-note" role="status">{t('newresearch.previewNote')}</p>
          )}

          {(reviewError ?? run.error) !== null && (
            <ErrorBox
              error={(reviewError ?? run.error)!}
              onRetry={() => {
                setReviewError(null);
                if (draftId !== null && proposal === null) void startPreview();
                else textareaRef.current?.focus();
              }}
            />
          )}
        </form>

        <aside className="nr-side">
          <h2 className="nr-side-title">{t('newresearch.whatHappensTitle')}</h2>
          <ol className="nr-side-steps">
            <li>{t('newresearch.stepRetrieve')}</li>
            <li>{t('newresearch.stepEvidence')}</li>
            <li>{t('newresearch.stepHypotheses')}</li>
            <li>{t('newresearch.stepPlan')}</li>
          </ol>
          <p className="nr-side-note">{t('newresearch.honestyNote')}</p>
          <p className="nr-side-note">{t('newresearch.materialsNote', { n: TRAY_MAX_SEEDS })}</p>
          <div className="nr-side-alt">
            <Link2 size={13} aria-hidden="true" />
            <button type="button" className="nr-alt-btn" onClick={onOpenConversation}>{t('newresearch.conversational')}</button>
            <span className="nr-alt-hint">{t('newresearch.conversationalHint')}</span>
          </div>
        </aside>
      </main>

      <ZoteroPanel
        open={zoteroOpen}
        onClose={() => setZoteroOpen(false)}
        onImport={(items) => tray.importZotero(items)}
        remaining={Math.max(0, TRAY_MAX_SEEDS - tray.cards.length)}
      />
    </div>
  );
}
