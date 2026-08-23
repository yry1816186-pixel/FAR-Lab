import { useEffect } from 'react';
import { Loader2, Mic, Square } from 'lucide-react';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import { useDictation, type DictationErrorCode } from '../hooks/useDictation';
import { formatElapsed } from '../dictation/audio';

const ERROR_KEYS: Record<DictationErrorCode, DictKey> = {
  mic_denied: 'dictation.denied',
  mic_unavailable: 'dictation.unavailable',
  unsupported: 'dictation.unsupportedBrowser',
  model_missing: 'dictation.modelMissing',
  load_failed: 'dictation.loadFailed',
  transcribe_failed: 'dictation.failed',
  decode_failed: 'dictation.failed',
};

/**
 * Offline dictation control for any composer tool rail. Emits the transcribed
 * fragment to `onTranscribed` (the parent inserts it at its own caret);
 * failures go to `onError` so they surface in the parent's note line. All
 * states map to the real hook machine — recording pulses, transcribing spins,
 * nothing decorative.
 */
export function DictationButton({
  onTranscribed,
  onError,
}: {
  onTranscribed: (fragment: string) => void;
  onError: (message: string) => void;
}): JSX.Element {
  const { t } = useI18n();
  const { status, elapsedMs, error, start, stop, cancel, clearError } = useDictation(onTranscribed);

  useEffect(() => {
    if (error !== null) onError(`${t(ERROR_KEYS[error.code])}${error.detail !== undefined ? `（${error.detail}）` : ''}`);
    // onError identity: parents pass stable setters (flashNote pattern).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const busy = status !== 'idle';
  return (
    <button
      type="button"
      className={`composer2-tool composer2-tool--dictation${status === 'recording' ? ' composer2-tool--recording' : ''}`}
      disabled={status === 'transcribing'}
      aria-pressed={status === 'recording'}
      aria-label={status === 'recording' ? t('dictation.stopLabel') : t('dictation.micLabel')}
      title={status === 'recording' ? t('dictation.stopHint') : t('dictation.micHint')}
      onClick={() => {
        clearError();
        if (status === 'recording') stop();
        else if (status === 'idle') void start();
      }}
      onContextMenu={(e) => {
        // right-click during recording = cancel/discard (Esc equivalent for mouse users)
        if (status === 'recording') { e.preventDefault(); cancel(); }
      }}
    >
      {status === 'recording'
        ? <Square size={13} aria-hidden="true" />
        : status === 'transcribing'
          ? <Loader2 size={15} className="attach-spinner" aria-hidden="true" />
          : <Mic size={15} aria-hidden="true" />}
      <span className={status === 'recording' ? 'mono' : undefined}>
        {status === 'recording' ? formatElapsed(elapsedMs) : status === 'transcribing' ? t('dictation.transcribing') : t('dictation.micLabel')}
      </span>
      {busy && <span className="sr-only" role="status">{t('dictation.active')}</span>}
    </button>
  );
}
