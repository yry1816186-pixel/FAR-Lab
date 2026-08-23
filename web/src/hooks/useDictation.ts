import { useCallback, useEffect, useRef, useState } from 'react';
import { ASR_SAMPLE_RATE, mixToMono, resampleLinear } from '../dictation/audio';
import type { WorkerResponse } from '../dictation/asr-worker';

/**
 * Offline dictation hook: getUserMedia → MediaRecorder (webm/opus) →
 * decodeAudioData → 16 kHz mono Float32 → ASR worker (local Whisper). The
 * state machine is strictly idle → recording → transcribing → idle; every
 * failure class is surfaced as a typed code, never swallowed.
 */

export type DictationStatus = 'idle' | 'recording' | 'transcribing';

export type DictationErrorCode =
  | 'mic_denied' | 'mic_unavailable' | 'unsupported'
  | 'model_missing' | 'load_failed' | 'transcribe_failed' | 'decode_failed';

export interface DictationError {
  code: DictationErrorCode;
  /** Raw diagnostic (worker message / DOMException name) — for tooltips/logs. */
  detail?: string;
}

/** Safety stop: whisper chunks at 30s; 2 minutes is a generous dictation ceiling. */
export const MAX_RECORD_MS = 120_000;

const WORKER_CODES: Record<string, DictationErrorCode> = {
  model_missing: 'model_missing',
  load_failed: 'load_failed',
  transcribe_failed: 'transcribe_failed',
};

export function useDictation(onText: (fragment: string) => void): {
  status: DictationStatus;
  elapsedMs: number;
  error: DictationError | null;
  start: () => Promise<void>;
  stop: () => void;
  cancel: () => void;
  clearError: () => void;
} {
  const [status, setStatus] = useState<DictationStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<DictationError | null>(null);

  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const workerRef = useRef<Worker | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);
  const pendingRef = useRef<((r: WorkerResponse) => void) | null>(null);

  const ensureWorker = useCallback((): Worker => {
    workerRef.current ??= new Worker(new URL('../dictation/asr-worker.ts', import.meta.url), { type: 'module' });
    const worker = workerRef.current;
    worker.onmessage = (ev: MessageEvent<WorkerResponse>): void => {
      const msg = ev.data;
      if (msg.type === 'ready') return; // warm-up confirmation; nothing to do
      const pending = pendingRef.current;
      pendingRef.current = null;
      pending?.(msg);
    };
    // Kick the (offline) model load early so recording overlaps warm-up.
    worker.postMessage({ type: 'load' });
    return worker;
  }, []);

  const teardownRecorder = useCallback((): void => {
    if (timerRef.current !== null) { window.clearTimeout(timerRef.current); timerRef.current = null; }
    if (tickRef.current !== null) { window.clearInterval(tickRef.current); tickRef.current = null; }
    recorderRef.current?.stop();
    recorderRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const transcribe = useCallback(async (blob: Blob): Promise<void> => {
    const worker = ensureWorker();
    setStatus('transcribing');
    try {
      const ctx = new AudioContext();
      try {
        const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
        const mono = mixToMono(Array.from({ length: decoded.numberOfChannels }, (_, c) => decoded.getChannelData(c)));
        const audio = resampleLinear(mono, decoded.sampleRate, ASR_SAMPLE_RATE);
        const response = await new Promise<Extract<WorkerResponse, { type: 'result' | 'error' }>>((resolve, reject) => {
          pendingRef.current = resolve;
          worker.postMessage({ type: 'transcribe', audio }, [audio.buffer]);
          // decodeAudioData already consumed the gesture budget; 3 min is the
          // outer guard for a wedged wasm session — fail visibly, never hang.
          const guard = window.setTimeout(() => {
            pendingRef.current = null;
            reject(new Error('asr timeout'));
          }, 180_000);
          const wrapped = (r: WorkerResponse): void => {
            window.clearTimeout(guard);
            if (r.type === 'result' || r.type === 'error') resolve(r);
          };
          pendingRef.current = wrapped;
        });
        if (response.type === 'result') {
          if (response.text.length > 0) onTextRef.current(response.text);
          setStatus('idle');
        } else {
          setError({ code: WORKER_CODES[response.code] ?? 'transcribe_failed', detail: response.message });
          setStatus('idle');
        }
      } finally {
        void ctx.close();
      }
    } catch (e) {
      setError({
        code: 'decode_failed',
        detail: e instanceof Error ? e.message : String(e),
      });
      setStatus('idle');
    }
  }, [ensureWorker]);

  const stop = useCallback((): void => {
    if (status !== 'recording') return;
    teardownRecorder();
    const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType ?? 'audio/webm' });
    void transcribe(blob);
  }, [status, teardownRecorder, transcribe]);

  const cancel = useCallback((): void => {
    if (status === 'idle') return;
    discardRef.current = true;
    teardownRecorder();
    setStatus('idle');
  }, [status, teardownRecorder]);

  const start = useCallback(async (): Promise<void> => {
    if (status !== 'idle') return;
    setError(null);
    if (typeof navigator === 'undefined' || navigator.mediaDevices?.getUserMedia === undefined
      || typeof window.MediaRecorder === 'undefined') {
      setError({ code: 'unsupported' });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      setError({
        code: e instanceof DOMException && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
          ? 'mic_denied'
          : 'mic_unavailable',
        detail: e instanceof DOMException ? e.name : String(e),
      });
      return;
    }
    streamRef.current = stream;
    chunksRef.current = [];
    discardRef.current = false;
    ensureWorker(); // begin model warm-up while the user speaks
    const candidate = 'audio/webm;codecs=opus';
    const mimeType = MediaRecorder.isTypeSupported(candidate) ? candidate : undefined;
    const recorder = new MediaRecorder(stream, mimeType !== undefined ? { mimeType } : undefined);
    recorderRef.current = recorder;
    recorder.ondataavailable = (e): void => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = (): void => {
      const discard = discardRef.current;
      discardRef.current = false;
      if (discard) return; // cancelled by the user — drop the audio
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      if (blob.size === 0) { setStatus('idle'); return; }
      void transcribe(blob);
    };
    recorder.start(250);
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setStatus('recording');
    tickRef.current = window.setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 250);
    timerRef.current = window.setTimeout(() => stop(), MAX_RECORD_MS);
  }, [status, ensureWorker, stop]);

  // Esc during recording cancels (PRODUCT_HCI: keyboard-complete paths).
  useEffect(() => {
    if (status !== 'recording') return undefined;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, cancel]);

  // Unmount hygiene: kill tracks, timers, worker.
  useEffect(() => () => {
    discardRef.current = true;
    teardownRecorder();
    workerRef.current?.terminate();
    workerRef.current = null;
  }, [teardownRecorder]);

  return {
    status, elapsedMs, error,
    start, stop, cancel,
    clearError: useCallback((): void => { setError(null); }, []),
  };
}
