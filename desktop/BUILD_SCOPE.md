# Desktop build artifact scope

The CI artifacts named `desktop-compile-only-*` prove that the Tauri shell's
native tests and platform bundlers completed on the named hosted runner. They
are **not public release artifacts** and are not evidence that FAR-Lab can run
standalone after installation.

Current hard boundary:

- the packaged app ships a staged backend sidecar (dist + web/dist + zod +
  serve.mjs via `scripts/stage-sidecar.mjs` → Tauri resources `sidecar/`);
  the Rust shell resolves it next to the binary (flat, `resources/`, or
  macOS `Contents/Resources`) and falls back to the compile-time source
  checkout only in a development tree;
- the Node runtime stays external (the fatal dialog names it); the Python
  experiment runtime is NOT packaged — experiments need the host
  interpreter (same boundary as the source-tree mode);
- the staged server is smoke-verified per staging (health probe on a random
  port), and the **installed-app journey is now locally VERIFIED for the
  Windows/NSIS slice** (2026-09-01): silent install (`/S /D=…`) → launch from
  the install tree → server healthy in 1 s (db ok, audit chain ok, watchdog
  ok) → web workbench served from packaged resources (200, zh-CN html) →
  process exit leaves no orphan listener; uninstall removes every file
  (only empty directories linger briefly — NSIS rmdir timing, warning-grade).
- Windows bundles are unsigned, Linux bundles are unsigned, and the macOS CI
  bundle uses Tauri's ad-hoc signing identity (`-`), not Developer ID signing
  or Apple notarization.

A public desktop release requires the same installed-app evidence on macOS and
Linux, updater behavior, and the platform signing/notarization disclosures
appropriate to the published build.
