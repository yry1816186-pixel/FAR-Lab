import { useI18n } from '../i18n/LanguageContext';
import { LogoMark } from './Logo';
import { NewRunForm } from './NewRunForm';

/**
 * Workbench home (P-IA): what this is, how to work here, and the central way
 * to start — one question in, a research run out. Shown whenever no run is
 * selected; picking a run in the sidebar switches to the workspace view.
 */
export function WelcomeView({ onCreated }: { onCreated: (runId: string) => void }): JSX.Element {
  const { t } = useI18n();
  const steps = [
    { key: 'welcome.step1', glyph: '✓', tone: 'verified' },
    { key: 'welcome.step2', glyph: '▲', tone: 'unknown' },
    { key: 'welcome.step3', glyph: '—', tone: 'caution' },
  ] as const;

  return (
    <div className="welcome arrive">
      <div className="welcome-hero">
        <LogoMark size={72} />
        <h1 className="welcome-title">{t('app.title')}</h1>
        <p className="welcome-subtitle muted">{t('welcome.subtitle')}</p>
      </div>

      <div className="welcome-main">
        <div className="welcome-card">
          <NewRunForm onCreated={onCreated} />
        </div>

        <ol className="welcome-steps">
          {steps.map((s) => (
            <li key={s.key} className={`welcome-step welcome-step--${s.tone}`}>
              <span className={`ev-glyph ev-glyph--${s.tone}`} aria-hidden="true">
                {s.glyph}
              </span>
              <span>{t(s.key)}</span>
            </li>
          ))}
        </ol>

        <p className="welcome-foot muted">{t('welcome.foot')}</p>
      </div>
    </div>
  );
}
