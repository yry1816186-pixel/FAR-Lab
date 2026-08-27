import { useEffect, useRef, useState } from 'react';
import { BookMarked, FileUp, Link2 } from 'lucide-react';
import { ErrorBox } from '../components/common';
import { ZoteroPanel } from '../components/ZoteroPanel';
import { DictationButton } from '../components/DictationButton';
import { useI18n } from '../i18n/LanguageContext';
import { useCreateRun } from '../hooks/useCreateRun';
import { listModelConfigs } from '../api/endpoints';
import type { ModelConfigsResponse } from '../api/types';
import { TRAY_MAX_SEEDS, SeedCardRow, useSeedTray } from './SeedTray';
import './lab.css';

/**
 * New research formation (HX §8.2) — the new architecture's creation surface.
 * One screen: the question in the researcher's words, materials riding the
 * shared SeedTray, the honest "what will happen" note, direct pipeline launch
 * (no mandatory chat round-trip), and conversational refinement as an OPTION.
 * Launch navigates to the study map where the live run is watched.
 */
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
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  const canSubmit = !run.submitting && run.text.trim().length > 0;
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
          onSubmit={(e) => { e.preventDefault(); void run.submit(e); }}
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
            <button type="submit" className="nr-submit" disabled={!canSubmit}>
              {run.submitting ? t('newresearch.launching') : t('newresearch.launch')}
            </button>
          </div>

          {run.error !== null && <ErrorBox error={run.error} onRetry={() => textareaRef.current?.focus()} />}
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
