import type { StreamSnapshot } from '../../hooks/eventStreamTracker';
import { useI18n } from '../../i18n/LanguageContext';

/**
 * HX-3 honesty chip: a dropped realtime stream is never silent. Reconnecting
 * shows the live attempt counter; a stream that cannot carry events says so and
 * names the fallback (polling). A healthy stream renders nothing — calm default.
 * Rendered above the tab bar so it is visible on every tab of a live run.
 */
export function StreamStatusChip({ snapshot }: { snapshot: StreamSnapshot }): JSX.Element | null {
  const { t } = useI18n();
  if (snapshot.phase === 'reconnecting') {
    return (
      <div className="run-banner run-banner--warn arrive" role="status">
        <span className="run-banner-text">{t('banner.streamReconnecting', { n: snapshot.attempts })}</span>
      </div>
    );
  }
  if (snapshot.phase === 'polling-fallback') {
    return (
      <div className="run-banner run-banner--info arrive" role="status">
        <span className="run-banner-text">{t('banner.streamPollingFallback')}</span>
      </div>
    );
  }
  return null;
}
