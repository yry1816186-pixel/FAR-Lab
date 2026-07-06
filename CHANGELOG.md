# Changelog

All notable changes to FAR-Chain are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed
- Repository governance cleanup: removed AI process artifacts, consolidated
  the root documentation set, and relocated agent-protocol docs into `.agent/`.
- `DEPTH_LEDGER.md`: trimmed the per-round narrative; the machine-parsed
  `§A`/`§C`/`§D` structure is unchanged.
- ESLint config deduplicated (single `eslint.config.mjs`, stricter rule set).

### Fixed
- `scripts/depth_evidence.mjs`: junction-following `rmSync` that deleted
  `node_modules` during worktree cleanup; test-name matching that reported
  spurious `NO_MATCH` for short ledger names.
- CI: keystone gate tests (`depth_evidence`, `depth_gate.evade`) now run via
  `pnpm test:keystone`.

## 2026-07 — Verification depth & governance

### Added
- **FUSION-OS-1..14**: Open Science engineering-paradigm migration —
  content-addressable CAS store, process-group kill, seal-window integrity,
  spawn preflight, verifier AST structural gate, LLM-provenance enforcement,
  execution-fingerprint detection, secret stripping, DB enum guards,
  verdict superseding, derivation-form rules, identifier-fabrication verdict.
- **Keystone depth-evidence bot** (`scripts/depth_evidence.mjs`): CI-driven
  base-FAIL / head-PASS double-run that promotes ledger rows to `WIRED_GREEN`.
- **depth_gate anti-skim hardening**: AST caller counting, closed-by SHA
  diff verification, golden-vector runtime cross-check, real-math signal
  detection, dynamic-dispatch (Reflect.apply / import alias) coverage.
- Kernel rules `R_DERIVATION_FORM_MISMATCH`, `R_IDENTIFIER_FABRICATION`,
  `R_EXECUTION_FINGERPRINT_MISMATCH`, ported across TS / Python / browser.
- Schema migrations `0012`–`0017`: verdict trace persistence, enum guard
  trigger, supersede pointer, blob CAS store, evidence derivable flag,
  provenance class.

### Changed
- Three hero pipelines (`hero_a` / `hero_b` / `c_astro`) rewired to drive the
  V2 kernel through real `src/statistics` math instead of hardcoded metrics.
- `sandbox_runner` and `dataset_resolver` spawn real Python subprocesses.

## 2026-06 — V1 push

### Added
- **Benchmark**: Science-125 suite with suite-level Merkle aggregation and
  `GET /api/v1/benchmark`.
- **Six demo seeds** covering all five verdicts across five domains
  (astronomy, biology, chemistry, ecology, geology).
- **Integrity page**: browser-side Merkle recompute (Web Crypto), inclusion
  proof, tamper theatre, repro receipt.
- **Leaderboard + SuiteVerifier**: client-side independent verification of
  the suite integrity root — users need not trust the server.
- **Fallback chain**: model-neutral degradation with classified error tiers.
- **Executable science harness** (M3): type-level FEC contract pre-registration.
- **`.far-proof` export**: independently recomputable proof bundles.

### Changed
- `verdict_kernel_v2` replaces the shallow V1 `makeVerdict` in all production
  callers.
- Cross-language hash consistency: TypeScript `canonicalHash` ≡ Python
  `canonical_hash` (byte-equal), verified in CI.

### Fixed
- Anti-theater detector `AT-01` `mapChecksToVerdict` SKIP ≠ PASS semantics.
- CI fake-green escape hatch in `eval_ring_audit`.
- Golden-vector numeric boundary vectors (N1/N3) for cross-lang parity.
