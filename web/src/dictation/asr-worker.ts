/**
 * Offline ASR worker — Whisper ONNX via transformers.js, fully local:
 * the model is vendored at /models/whisper-base and the ONNX Runtime wasm
 * binaries at /models/ort (both placed by scripts/fetch-asr-model.mjs —
 * wasm copied from the INSTALLED onnxruntime-web so versions always match).
 * `allowRemoteModels = false` is a hard guarantee: a missing model fails
 * visibly with model_missing; nothing ever falls back to the network.
 */
import type { AutomaticSpeechRecognitionPipeline } from '@huggingface/transformers';

export type WorkerRequest =
  | { type: 'load' }
  | { type: 'transcribe'; audio: Float32Array; language?: string };

export type WorkerErrorCode = 'model_missing' | 'load_failed' | 'transcribe_failed';

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'result'; text: string }
  | { type: 'error'; code: WorkerErrorCode; message: string };

const MODEL_ID = 'whisper-base';
const MODEL_BASE = '/models/whisper-base';

// The DOM lib types self.postMessage with a Window signature; this worker is
// compiled inside the app program, so narrow to the worker shape explicitly.
const post = (msg: WorkerResponse): void => {
  (self as unknown as { postMessage: (m: WorkerResponse) => void }).postMessage(msg);
};

let asr: AutomaticSpeechRecognitionPipeline | null = null;
let loading: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (asr !== null) return;
  loading ??= (async (): Promise<void> => {
    // Pre-flight the vendored model so a missing download is reported as
    // model_missing, not as an opaque ONNX/tensor error later.
    const probe = await fetch(`${MODEL_BASE}/config.json`);
    if (!probe.ok) {
      throw new Error(`ASR model not vendored at ${MODEL_BASE} (HTTP ${probe.status}) — run: npm run fetch:asr-model`);
    }
    const { pipeline, env } = await import('@huggingface/transformers');
    env.allowRemoteModels = false;
    env.allowLocalModels = true;
    env.localModelPath = '/models/';
    env.backends.onnx.wasm!.wasmPaths = '/models/ort/';
    // graphOptimizationLevel 'disabled': ORT 1.26-dev's MatMulNBits fusion
    // (TransposeDQWeightsForMatMulNBits) rejects the legacy per-tensor q8
    // format of Xenova/whisper-base with "Missing required scale …
    // weight_merged_0_scale" (2026-08-23 live probe). Disabling the optimizer
    // is the documented escape hatch; whisper-base is small enough that the
    // missing fusion costs little.
    asr = await pipeline('automatic-speech-recognition', MODEL_ID, {
      device: 'wasm',
      dtype: 'q8',
      session_options: { graphOptimizationLevel: 'disabled' },
    });
  })();
  try {
    await loading;
  } finally {
    loading = null; // allow retry after a failure; `asr` short-circuits when set
  }
}

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

self.addEventListener('message', (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  void (async (): Promise<void> => {
    if (msg.type === 'load') {
      try {
        await ensureLoaded();
        post({ type: 'ready' });
      } catch (e) {
        const text = errText(e);
        post({
          type: 'error',
          code: text.includes('not vendored') ? 'model_missing' : 'load_failed',
          message: text,
        });
      }
      return;
    }
    if (msg.type === 'transcribe') {
      try {
        await ensureLoaded();
        const pipe = asr;
        if (pipe === null) throw new Error('pipeline unavailable after load');
        const out = await pipe(msg.audio, {
          task: 'transcribe',
          chunk_length_s: 30,
          stride_length_s: 5,
          ...(msg.language !== undefined && msg.language.length > 0 ? { language: msg.language } : {}),
        });
        const text = typeof out === 'string' ? out : out.text;
        post({ type: 'result', text: typeof text === 'string' ? text.trim() : '' });
      } catch (e) {
        post({ type: 'error', code: 'transcribe_failed', message: errText(e) });
      }
    }
  })();
});
