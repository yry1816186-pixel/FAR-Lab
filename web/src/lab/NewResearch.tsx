import { useEffect, useRef, useState } from 'react';
import { BookMarked, ChevronDown, ChevronUp, FileUp, Link2 } from 'lucide-react';
import { ErrorBox } from '../components/common';
import { ZoteroPanel } from '../components/ZoteroPanel';
import { DictationButton } from '../components/DictationButton';
import { useI18n } from '../i18n/LanguageContext';
import { useCreateRun } from '../hooks/useCreateRun';
import { deleteRun, editRunQuestion, listModelConfigs, proposeScope, resumeRun, type EditQuestionInput } from '../api/endpoints';
import { ApiError } from '../api/client';
import type { ModelConfigsResponse, ResearchQuestion } from '../api/types';
import { TRAY_MAX_SEEDS, SeedCardRow, useSeedTray } from './SeedTray';
import { ScopeEditor, useScopeEditorDraft } from './ScopeEditor';
import { scopeEditorPatch, type ScopeEditorIssue } from './scopeEditorModel';
import type { DictKey } from '../i18n/dict';
import './lab.css';

/**
 * New-research compose zone — the workspace's creation surface (HX §8.2).
 *
 * It lives INSIDE the workspace (never as a second top-level destination):
 * one entry point, one question box. Collapsed it is the quick start
 * (question + quick-task templates + launch); expanded it carries the full
 * option set — materials riding the shared SeedTray, the model route picker,
 * the pre-launch scope review, and the honest "what will happen" note.
 *
 * Launch navigates to the study map where the live run is watched.
 *
 * §8.2 pre-launch scope review: "预览研究范围" persists a DRAFT run, runs ONLY
 * the scope stage (receipt-backed proposal), parks the run, and lets the
 * researcher EDIT the refined scope before committing — 启动 continues the
 * draft via /resume. Direct launch stays one click for the quick path.
 */

export function NewResearch({
  onLaunched, onOpenConversation, initialQuestion = null,
  open = false, onOpenChange, autoFocus = false,
}: {
  onLaunched: (runId: string) => void;
  onOpenConversation: () => void;
  /** Welcome-box quick start: hands the workspace's question box real text
   *  (spine rerun, deep link `#lab/new?q=…`). Null = no prefill. */
  initialQuestion?: string | null;
  /** Expanded = the full option set (materials / route / scope review). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Focus the question on mount — on a fresh workspace typing must start
   *  here, with zero navigation. */
  autoFocus?: boolean;
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
  const [scopeIssues, setScopeIssues] = useState<ScopeEditorIssue[]>([]);
  const scopeEditor = useScopeEditorDraft(proposal);

  useEffect(() => {
    const c = new AbortController();
    listModelConfigs(c.signal).then(setConfigs).catch(() => setConfigs(null));
    return () => c.abort();
  }, []);

  // Keep the shared tray and the launch machine in sync (ready seeds only).
  useEffect(() => { run.setSeeds(tray.seeds); }, [tray.seeds, run.setSeeds]);

  // Keyboard path: arriving via "n" or the CTA puts the researcher straight
  // into the question — one keystroke from anywhere to typing (§9.8). The
  // fresh-workspace mount focuses too (typing begins with zero navigation).
  useEffect(() => { if (autoFocus) textareaRef.current?.focus(); }, [autoFocus]);
  useEffect(() => { if (open) textareaRef.current?.focus(); }, [open]);

  // Welcome-box handover: the prop updates the field even when this zone is
  // already mounted (useCreateRun's hash read only initializes on mount).
  // run.setText is the stable useState setter.
  useEffect(() => {
    if (initialQuestion !== null && initialQuestion.trim().length > 0) run.setText(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setText is the stable useState setter from useCreateRun
  }, [initialQuestion]);

  const enterReview = (q: ResearchQuestion): void => {
    setProposal(q);
    scopeEditor.reset(q);
    setScopeIssues([]);
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

  const saveEdits = async (manageBusy = true): Promise<boolean> => {
    if (proposal === null || draftId === null) return false;
    setReviewError(null);
    setSavedNote(false);
    const scoped = scopeEditorPatch(proposal, scopeEditor.draft);
    setScopeIssues(scoped.issues);
    if (scoped.issues.length > 0) return false;
    const patch: EditQuestionInput = { ...scoped.patch };
    if (run.text.trim() !== proposal.text && run.text.trim().length > 0) patch.text = run.text.trim();
    if (patch.text === undefined && patch.goalType === undefined && patch.scope === undefined) {
      setSavedNote(true); // nothing changed — the "saved" state is truthful (no-op)
      return true;
    }
    if (manageBusy) setReviewBusy('saving');
    try {
      const res = await editRunQuestion(draftId, patch);
      enterReview(res.question);
      setSavedNote(true);
      return true;
    } catch (e) {
      setReviewError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
      return false;
    } finally {
      if (manageBusy) setReviewBusy(null);
    }
  };

  const confirmLaunch = async (): Promise<void> => {
    if (draftId === null) return;
    setReviewError(null);
    setReviewBusy('launching');
    try {
      // Launch is a transaction from the researcher's point of view: persist
      // the fields currently visible in the review before advancing the run.
      // A failed save leaves the draft paused and preserves every local edit.
      if (!(await saveEdits(false))) {
        setReviewBusy(null);
        return;
      }
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
    scopeEditor.reset(null);
    setScopeIssues([]);
    setSavedNote(false);
  };

  const keepDraft = (): void => {
    // The draft persists server-side ('paused' with scope done / 'created');
    // local journey resets. Resuming later = the studies index entry.
    setDraftId(null);
    setProposal(null);
    scopeEditor.reset(null);
    setScopeIssues([]);
    setSavedNote(false);
    setReviewError(null);
  };

  const canSubmit = !run.submitting && run.text.trim().length > 0;
  const reviewing = proposal !== null;
  const activeLabel = configs?.configs.find((c) => c.id === (run.providerConfigId === '' ? configs.activeModelConfigId : run.providerConfigId))?.label;
  // Long placeholder copy wraps to 4 lines inside a 2-row box on phones
  // (design-baseline new-W6) — the narrow viewport gets the short form.
  const [narrowViewport, setNarrowViewport] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 600px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 600px)');
    const onChange = (e: MediaQueryListEvent): void => setNarrowViewport(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const placeholderKey: DictKey = narrowViewport ? 'newresearch.placeholderShort' : 'newresearch.placeholder';

  // Collapsing would strand real state (attached materials, an in-progress
  // scope review) — the panel stays open until that state is resolved.
  const canCollapse = tray.cards.length === 0 && proposal === null && draftId === null;

  const QUICK: { key: DictKey; template: string }[] = [
    { key: 'labhome.qkHypotheses', template: t('labhome.qkHypothesesTpl') },
    { key: 'labhome.qkEvidence', template: t('labhome.qkEvidenceTpl') },
    { key: 'labhome.qkPlan', template: t('labhome.qkPlanTpl') },
  ];

  const questionField = (
    <>
      <label htmlFor="nr-question" className="nr-label">{t('newresearch.questionLabel')}</label>
      <textarea
        id="nr-question"
        ref={textareaRef}
        className="nr-question"
        value={run.text}
        rows={open ? 3 : 2}
        placeholder={t(placeholderKey)}
        aria-invalid={run.showValidationError && run.text.trim().length === 0}
        onChange={(e) => run.setText(e.target.value)}
        onPaste={(e) => tray.onPaste(e)}
      />
      {run.showValidationError && run.text.trim().length === 0 && (
        <p className="nr-error" role="alert">{t('newresearch.needQuestion')}</p>
      )}
    </>
  );

  /** Quick tasks fill the box with a real question skeleton (editable). */
  const quickChips = (
    <div className="nr-quick" role="group" aria-label={t('labhome.qwQuickLabel')}>
      {QUICK.map((q) => (
        <button
          type="button"
          key={q.key}
          className="qw-chip"
          title={t('labhome.qkHint', { text: q.template })}
          onClick={() => {
            run.setText(q.template);
            textareaRef.current?.focus();
            textareaRef.current?.setSelectionRange(q.template.length, q.template.length);
          }}
        >
          {t(q.key)}
        </button>
      ))}
    </div>
  );

  const materialsTray = tray.cards.length > 0 && (
    <div className="nr-tray" aria-label={t('newresearch.materials')}>
      {tray.cards.map((c) => <SeedCardRow key={c.id} card={c} onRemove={tray.remove} onRetry={tray.retryCard} />)}
    </div>
  );

  const toolsRow = (
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
  );

  const citePanel = citeOpen && (
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
  );

  const reviewPanel = reviewing && (
    <section className="nr-review" aria-label={t('newresearch.reviewTitle')}>
      <ScopeEditor
        idPrefix="new-research-scope"
        title={t('newresearch.reviewTitle')}
        hint={t('newresearch.reviewHint')}
        draft={scopeEditor.draft}
        onChange={(field, value) => { scopeEditor.change(field, value); setScopeIssues([]); setSavedNote(false); }}
        issues={scopeIssues}
        constraints={proposal.constraints}
      />
      {savedNote && <p className="nr-review-saved" role="status">{t('newresearch.saved')}</p>}
    </section>
  );

  const launchRow = (
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
          <button type="button" className="nr-secondary" disabled={reviewBusy !== null} onClick={() => void saveEdits()}>
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
  );

  /** Honest pre-flight: what the launch actually does (expanded panel only). */
  const whatHappens = (
    <div className="nr-embed-side">
      <p className="nr-embed-side-title">{t('newresearch.whatHappensTitle')}</p>
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
    </div>
  );

  return (
    <section className="nr-embed" aria-labelledby="nr-embed-title">
      <div className="nr-embed-head">
        <h2 className="nr-embed-title" id="nr-embed-title">{t('newresearch.title')}</h2>
        <p className="nr-embed-sub">{t('labhome.qwSub')}</p>
      </div>

      <form
        className={`nr-card nr-card--embed${dragActive ? ' nr-card--drag' : ''}`}
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
        {questionField}

        {open ? (
          <>
            {materialsTray}
            {toolsRow}
            {citePanel}
            {reviewPanel}
            {launchRow}
            {whatHappens}
          </>
        ) : (
          <>
            {quickChips}
            <div className="nr-embed-acts">
              <button
                type="button"
                className="nr-secondary"
                aria-expanded={false}
                onClick={() => onOpenChange?.(true)}
              >
                {t('newresearch.moreOptions')} <ChevronDown size={13} aria-hidden="true" />
              </button>
              <button type="submit" className="nr-submit" disabled={!canSubmit}>
                {run.submitting ? t('newresearch.launching') : t('newresearch.launch')}
              </button>
              <span className="nr-tools-hint">{t('newresearch.collapsedHint')}</span>
            </div>
          </>
        )}

        {tray.note !== null && <p className="nr-note" role="status">{tray.note}</p>}
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

        {open && (
          <div className="nr-embed-foot">
            <button
              type="button"
              className="nr-linklike"
              aria-expanded
              disabled={!canCollapse}
              title={canCollapse ? undefined : t('newresearch.collapseBlocked')}
              onClick={() => onOpenChange?.(false)}
            >
              {t('newresearch.collapseOptions')} <ChevronUp size={13} aria-hidden="true" />
            </button>
          </div>
        )}
      </form>

      <ZoteroPanel
        open={zoteroOpen}
        onClose={() => setZoteroOpen(false)}
        onImport={(items) => tray.importZotero(items)}
        remaining={Math.max(0, TRAY_MAX_SEEDS - tray.cards.length)}
      />
    </section>
  );
}
