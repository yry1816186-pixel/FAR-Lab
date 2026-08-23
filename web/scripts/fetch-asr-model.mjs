#!/usr/bin/env node
/**
 * Vendor the offline ASR (dictation) assets into web/public/models/:
 *   - models/whisper-base : ONNX q8 whisper-base (Apache-2.0, Xenova/whisper-base)
 *   - models/ort          : ONNX Runtime wasm binaries from @huggingface/transformers
 *
 * The dictation worker (web/src/dictation/asr-worker.ts) probes
 * /models/whisper-base/config.json at runtime; without these assets it fails
 * honestly. Run once after `npm install`: `npm run fetch:asr-model`.
 *
 * Mirrors: huggingface.co first, hf-mirror.com fallback (for networks where
 * the main hub is unreachable).
 */
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { writeFile, cp, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const publicModels = path.resolve(here, '..', 'public', 'models');
const ortDest = path.join(publicModels, 'ort');
const whisperDest = path.join(publicModels, 'whisper-base');

const MODEL_REPO = 'Xenova/whisper-base';
const MIRRORS = ['https://huggingface.co', 'https://hf-mirror.com'];
const FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];

async function fetchTo(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

/** Download one file trying each mirror in order. */
async function fetchWithMirrors(rel, dest) {
  let lastErr;
  for (const base of MIRRORS) {
    try {
      await fetchTo(`${base}/${MODEL_REPO}/resolve/main/${rel}`, dest);
      return base;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

async function main() {
  mkdirSync(ortDest, { recursive: true });

  // 1. ORT wasm: copy straight from the installed transformers package.
  const ortSrc = path.resolve(here, '..', 'node_modules', '@huggingface', 'transformers', 'dist');
  let copiedOrt = 0;
  if (existsSync(ortSrc)) {
    for (const f of ['ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
      const src = path.join(ortSrc, f);
      if (existsSync(src)) { copyFileSync(src, path.join(ortDest, f)); copiedOrt++; }
    }
  }
  console.log(`far-asr: ORT wasm files copied: ${copiedOrt}`);

  // 2. Whisper-base ONNX q8.
  mkdirSync(path.join(whisperDest, 'onnx'), { recursive: true });
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'farlab-asr-'));
  try {
    for (const rel of FILES) {
      const dest = path.join(tmp, rel.replace('/', '_'));
      process.stdout.write(`far-asr: downloading ${MODEL_REPO}/${rel} … `);
      const used = await fetchWithMirrors(rel, dest);
      console.log(`ok (${new URL(used).host})`);
    }
    await cp(tmp, whisperDest, { recursive: true });
    console.log(`far-asr: vendored whisper-base → ${path.relative(process.cwd(), whisperDest)}`);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(`far-asr FAILED: ${e instanceof Error ? e.message : String(e)}`);
  console.error('Dictation will stay unavailable (the rest of FAR-Lab is unaffected).');
  process.exit(1);
});
