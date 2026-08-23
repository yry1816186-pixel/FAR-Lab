#!/usr/bin/env node
/**
 * One-time vendoring of the offline ASR artifacts (user decision 2026-08-23:
 * script-preset, fully offline from day one):
 *
 *   1. Whisper-base q8 ONNX model + tokenizer from the Hugging Face Hub
 *      (default: onnx-community/whisper-base; override with ASR_REPO)
 *      → web/public/models/whisper-base/
 *   2. ONNX Runtime Web wasm binaries COPIED from the locally installed
 *      web/node_modules/onnxruntime-web so they always match the bundled
 *      runtime version (a CDN download would risk version drift + network
 *      dependency) → web/public/models/ort/
 *   3. manifest.json with versions + sha256 for provenance.
 *
 * Re-run after upgrading @huggingface/transformers (the ort wasm must track
 * the installed version). The worker hard-disables remote models, so a
 * missing vendored model fails visibly — never silently over the network.
 */
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const modelDir = join(root, 'web', 'public', 'models', 'whisper-base');
const ortDir = join(root, 'web', 'public', 'models', 'ort');
const repo = process.env.ASR_REPO ?? 'onnx-community/whisper-base';
const base = `https://huggingface.co/${repo}/resolve/main/`;

const MODEL_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];
const ORT_WASM = [
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.asyncify.wasm',
  'ort-wasm-simd-threaded.jsep.wasm',
  'ort-wasm-simd-threaded.jspi.wasm',
];

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function download(rel) {
  const url = `${base}${rel}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed: ${url} → HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const out = join(modelDir, rel);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, buf);
  return { file: rel, bytes: buf.length, sha256: sha256(buf) };
}

async function main() {
  const manifest = { repo, fetchedAt: new Date().toISOString(), files: [], ort: null };
  process.stdout.write(`Fetching ASR model from ${repo} …\n`);
  for (const rel of MODEL_FILES) {
    process.stdout.write(`  ${rel} … `);
    manifest.files.push(await download(rel));
    process.stdout.write(`${(manifest.files.at(-1).bytes / 1e6).toFixed(1)} MB\n`);
  }

  const ortDist = join(root, 'web', 'node_modules', 'onnxruntime-web', 'dist');
  const ortPkg = JSON.parse(await readFile(join(root, 'web', 'node_modules', 'onnxruntime-web', 'package.json'), 'utf8'));
  await mkdir(ortDir, { recursive: true });
  const ortFiles = [];
  for (const name of ORT_WASM) {
    const src = join(ortDist, name);
    try {
      await stat(src);
    } catch {
      throw new Error(`missing wasm binary in onnxruntime-web dist: ${src} (version drift? adjust ORT_WASM list)`);
    }
    await copyFile(src, join(ortDir, name));
    const buf = await readFile(src);
    ortFiles.push({ file: name, bytes: buf.length, sha256: sha256(buf) });
  }
  const transformersPkg = JSON.parse(await readFile(join(root, 'web', 'node_modules', '@huggingface', 'transformers', 'package.json'), 'utf8'));
  manifest.ort = {
    onnxruntimeWeb: ortPkg.version,
    transformersJs: transformersPkg.version,
    files: ortFiles,
  };
  await writeFile(join(root, 'web', 'public', 'models', 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write('Done. ASR is now fully offline (web/public/models).\n');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
