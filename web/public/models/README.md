# Local ASR model assets (git-ignored)

This directory vendors the offline dictation artifacts so voice input works
with **zero network access**:

- `whisper-base/` — Whisper-base q8 ONNX model + tokenizer (from
  `onnx-community/whisper-base` on the Hugging Face Hub)
- `ort/` — ONNX Runtime Web wasm binaries copied from the locally installed
  `onnxruntime-web` (version-locked to the bundled runtime)
- `manifest.json` — versions, sizes, and sha256 provenance

Populate once with:

```
npm run fetch:asr-model
```

Re-run it after upgrading `@huggingface/transformers` so the wasm binaries
track the installed runtime. The ASR worker hard-disables remote model
loading (`env.allowRemoteModels = false`): if these files are missing, the
dictation button fails with explicit "model not vendored" guidance instead
of silently reaching the network.
