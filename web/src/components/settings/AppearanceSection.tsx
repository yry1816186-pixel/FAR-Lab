import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/LanguageContext';
import { useTheme } from '../../state/theme';
import type { ThemeChoice } from '../../state/theme';
import { NOTIFY_CHANGE_EVENT, isNotifySupported, readNotifyEnabled, writeNotifyEnabled } from '../../state/notify';

/**
 * Settings section: appearance & notifications. Same sources of truth as the
 * header quick controls (theme hook + language context + shared notify pref) —
 * double entry point, one state each; changes here reflect in the header
 * immediately via the broadcast events.
 */
export function AppearanceSection(): JSX.Element {
  const { t, lang, setLang } = useI18n();
  const { theme, setTheme } = useTheme();
  const notifySupported = isNotifySupported();
  const [notifyEnabled, setNotifyEnabled] = useState<boolean>(readNotifyEnabled);

  useEffect(() => {
    const onChange = (): void => setNotifyEnabled(readNotifyEnabled());
    window.addEventListener(NOTIFY_CHANGE_EVENT, onChange);
    return () => window.removeEventListener(NOTIFY_CHANGE_EVENT, onChange);
  }, []);

  const themeChoices: Array<{ value: ThemeChoice; label: string }> = [
    { value: 'auto', label: t('settings.themeAuto') },
    { value: 'light', label: t('settings.themeLight') },
    { value: 'dark', label: t('settings.themeDark') },
  ];

  return (
    <div className="settings-section">
      <h3 className="settings-form-title">{t('settings.appearance')}</h3>
      <p className="muted small">{t('settings.appearanceHint')}</p>

      <div className="settings-fieldrow" role="radiogroup" aria-label={t('settings.themeLabel')}>
        <span className="field-label">{t('settings.themeLabel')}</span>
        {themeChoices.map((c) => (
          <button
            key={c.value}
            type="button"
            className={`btn btn--small${theme === c.value ? ' btn--primary' : ''}`}
            aria-pressed={theme === c.value}
            onClick={() => setTheme(c.value)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="settings-fieldrow" role="radiogroup" aria-label={t('settings.langLabel')}>
        <span className="field-label">{t('settings.langLabel')}</span>
        <button
          type="button"
          className={`btn btn--small${lang === 'zh' ? ' btn--primary' : ''}`}
          aria-pressed={lang === 'zh'}
          onClick={() => setLang('zh')}
        >
          中文
        </button>
        <button
          type="button"
          className={`btn btn--small${lang === 'en' ? ' btn--primary' : ''}`}
          aria-pressed={lang === 'en'}
          onClick={() => setLang('en')}
        >
          English
        </button>
      </div>

      <h3 className="settings-form-title">{t('settings.notifications')}</h3>
      <p className="muted small">{t('settings.notificationsHint')}</p>
      {notifySupported ? (
        <div className="settings-fieldrow">
          <span className="field-label">{t('settings.notifyDoneLabel')}</span>
          <button
            type="button"
            className={`btn btn--small${notifyEnabled ? ' btn--primary' : ''}`}
            aria-pressed={notifyEnabled}
            onClick={() => setNotifyEnabled(writeNotifyEnabled(!notifyEnabled))}
          >
            {notifyEnabled ? t('common.on') : t('common.off')}
          </button>
          {!notifyEnabled && window.Notification.permission === 'denied' && (
            <span className="field-error">{t('settings.notifyDenied')}</span>
          )}
        </div>
      ) : (
        <p className="muted small">{t('settings.notifyUnsupported')}</p>
      )}
    </div>
  );
}
