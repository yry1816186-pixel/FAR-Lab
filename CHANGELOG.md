# Changelog

All notable changes to FAR-Chain are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/).

## [1.0.0] — initial open-source release

FAR-Chain is a **claim-level verification layer for AI-for-Science claims**: it constrains
LLM-generated hypotheses inside a deterministic, falsifiable, tamper-detectable,
independently-recomputable boundary. The verdict is produced by a deterministic R0–R9 kernel —
**never** by an LLM.

### Added — CLI (`far`)

- `far init <domain>` — scaffold a DomainPack (claim + FEC templates) for a new domain.
- `far fec compile` / `far fec freeze` — compile a Falsifiability Evidence Contract and freeze its
  tamver hash (`fecHash`). A claim without a compilable FEC can never reach `CONFIRMED`.
- `far verify [--bundle|--envelope] [--mode] [--explain] [--lint-input]` — third-party independent
  recomputation of a proof bundle / envelope, including recomputation of the 20 anti-theater detectors.
- `far verify-golden [--all|--case] [--backend node|python|browser]` — recompute the verdict golden
  vectors across three language axes; same input → same verdict in TS, Python, and the browser.
- `far export far-proof` / `far export receipt` — export a self-verifiable `.far-proof` bundle or a
  Trust Receipt projection.
- `far api` — REST API server (Fastify; 16 paths under `/api/v1`, JWT-ready, OpenAPI at
  `/documentation/json`).
- `far doctor` / `far version` / `far status` / `far demo [tess-offline]` — diagnostics, status, and a
  fully-offline one-shot demo. `far ask` / `far stream` / `far repl` / `far replay` / `far court` /
  `far arena` / `far bench` / `far fsm` round out the 19-command surface.

### Added — deterministic kernel & verdict

- **Five-value verdict** (fixed enumeration, no sixth value): `CONFIRMED` / `REFUTED` / `INCONCLUSIVE`
  / `DEGRADED_SCOPE` / `UNTESTED`, priority `DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED`.
- **R0–R9 kernel rules** plus extended rules: `R_DERIVATION_FORM_MISMATCH`,
  `R_IDENTIFIER_FABRICATION`, `R_EXECUTION_FINGERPRINT_MISMATCH`, `R_CAUSAL_CONFOUNDING_*`,
  `ANTI_THEATER_FAIL`.
- **Real statistics** (`src/statistics/`): z-tests, Cohen's d, Welch's t, Bonferroni / Holm / BH-FDR
  multiple-correction — no hardcoded p-values or effect sizes.

### Added — anti-theater & integrity

- **20 anti-theater detectors** that block a seal when a "green" result is built on theater
  (cherry-picked seeds, post-hoc thresholds, scope laundering, metric swap, LLM judge-override, …).
- **Content-addressed evidence ledger**: append-only SHA-256 hash chain with cross-language
  (TS / Python / browser) byte-identical hashes; tampering breaks the chain and is detected.
- **Proof bundles (`.far-proof`)**: self-verifiable offline bundles (claim graph + redacted chain +
  `proofHash`) that a third party recomputes without trusting the exporter.
- Sandbox hardening: process-group kill on timeout, pre-execution working-dir preflight, secret
  stripping, execution-fingerprint (wall/cpu/peak-rss) detection.

### Added — developer & user experience

- `npm install -g far-chain` works end-to-end (esbuild-bundled `dist/far.js`); the no-build source
  workflow (`node src/cli/far.ts`) is preserved.
- Bilingual README (`README.md` en + `README.zh-CN.md` zh) and a full English `docs/` hierarchy:
  quickstart, installation, CLI reference, API reference, concept guides (claim / evidence / verdict
  / FEC / anti-theater / determinism / evidence-ledger / far-proof), providers, demos.
- `scripts/install.sh` + `scripts/install.ps1` — user-space installer (zero key, zero big-data).
- `Dockerfile` + `docker-compose.yml` — default offline demo / API, no key required.
- `examples/tess-offline/` — a persistent self-verifiable demo bundle with a tested tamper-detection
  walkthrough; `examples/fec/` and `examples/statistical-claim/` for FEC and statistical-claim flows.

### Changed

- The V2 `decideFiveValueVerdict` kernel replaces the shallow V1 `makeVerdict` in all production
  callers.
- The three science-harness pipelines (`hero_a` / `hero_b` / `c_astro`) drive the V2 kernel through
  real `src/statistics` math instead of hardcoded metrics.

### Known limits (honest)

- Real-provider inference (Qwen / DashScope) and real online datasets (TESS / MAST) are
  **credential / network gated** and never run by default; the offline experience needs zero keys.
- String-key hashing is fully proven; float serialization is migrating to RFC 8785 JCS (V3 roadmap).
- OS-level sandbox isolation (cgroups / netns / seccomp) is a V2 roadmap item; current sandboxing is
  user-space hardening.
- `NEEDS_RELEASE_PUBLICATION`: the package is build-ready and `npm install -g` works from a tarball,
  but is not yet published to the npm registry; the GitHub Release is pending.
