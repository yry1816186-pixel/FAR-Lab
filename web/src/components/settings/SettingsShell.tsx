import { useEffect, useRef, useState } from 'react';
import { Settings } from 'lucide-react';
import { useI18n } from '../../i18n/LanguageContext';
import type { DictKey } from '../../i18n/dict';
import { ToolsSection } from '../ToolsSection';
import { ModelRoutesSection } from './ModelRoutesSection';
import { AutomationsSection } from './AutomationsSection';
import { AppearanceSection } from './AppearanceSection';
import { DataSecuritySection } from './DataSecuritySection';
import { AboutSection } from './AboutSection';

/**
 * Settings center shell: left navigation over six real capability sections —
 * model routes / tools & extensions / automations / appearance & notifications /
 * data & authorization / about. Sections mount on demand (fresh data per
 * visit). Keyboard: Tab order follows the nav; Escape closes (held in a ref —
 * see the onClose churn note below).
 */

export type SettingsSectionKey = 'models' | 'tools' | 'automations' | 'appearance' | 'data' | 'about';

const SECTIONS: ReadonlyArray<{ key: SettingsSectionKey; labelKey: DictKey }> = [
  { key: 'models', labelKey: 'settings.navModels' },
  { key: 'tools', labelKey: 'settings.navTools' },
  { key: 'automations', labelKey: 'settings.navAutomations' },
  { key: 'appearance', labelKey: 'settings.navAppearance' },
  { key: 'data', labelKey: 'settings.navData' },
  { key: 'about', labelKey: 'settings.navAbout' },
];

export function SettingsShell({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const { t } = useI18n();
  const [section, setSection] = useState<SettingsSectionKey>('models');
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // onClose identity churns on every parent poll re-render (App re-renders
  // every 2-5s). Keeping it in a ref keeps the open-effect to one run per
  // open — otherwise each poll tick resets the section and steals focus.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    setSection('models');
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    window.setTimeout(() => dialogRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open-transition only; onClose via ref (see above)
  }, [open]);

  if (!open) return null;

  return (
    <div className="settings-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={dialogRef}
        className="settings-panel settings-panel--wide"
        role="dialog"
        aria-modal="true"
        aria-label={t('settings.title')}
        tabIndex={-1}
      >
        <div className="settings-head">
          <h2 className="settings-title">
            <Settings size={15} aria-hidden="true" /> {t('settings.title')}
          </h2>
          <button type="button" className="btn btn--small" onClick={onClose} aria-label={t('common.close')}>
            ✕
          </button>
        </div>
        <div className="settings-body">
          <nav className="settings-nav" aria-label={t('settings.navLabel')}>
            {SECTIONS.map((s) => (
              <button
                key={s.key}
                type="button"
                className="settings-nav__item"
                aria-current={section === s.key ? 'true' : undefined}
                onClick={() => setSection(s.key)}
              >
                {t(s.labelKey)}
              </button>
            ))}
          </nav>
          <div className="settings-content">
            {section === 'models' && <ModelRoutesSection />}
            {section === 'tools' && <ToolsSection />}
            {section === 'automations' && <AutomationsSection />}
            {section === 'appearance' && <AppearanceSection />}
            {section === 'data' && <DataSecuritySection />}
            {section === 'about' && <AboutSection />}
          </div>
        </div>
      </div>
    </div>
  );
}
