# Changelog

All notable user-visible and technical changes to FAR-Lab are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
as scoped by [VERSIONING.md](VERSIONING.md).

Types of changes: `Added` · `Changed` · `Fixed` · `Improved` · `Deprecated` ·
`Removed` · `Security`.

## [Unreleased]

### Changed

- Release construction now produces a self-verifying source archive with a content
  manifest, multi-ecosystem SBOM, and checksums; the hosted workflow is wired for
  signed build/SBOM attestations, but **no hosted attestation or public release is
  claimed until that route completes successfully**.

### Documentation

- Restructured `README.md` for clarity (badges, table of contents, grouped
  features) and corrected outdated facts: test count (240 → 264), built-in provider
  list (added `deepseek`, `universal`), the `src/` structure (added `kernel`,
  `model-plane`, `ingest`, `plugins`, `report`, `platform`), and serve-port
  framing (`npm run serve` → 3196 vs `far serve` → 8787).
- Added a Chinese summary, [`README.zh-CN.md`](README.zh-CN.md).
- Reworked `CONTRIBUTING.md` and `SECURITY.md` to standard structure; refreshed
  this changelog to the Keep a Changelog format.

## [0.1.0] - UNRELEASED

> Not yet tagged. Per [VERSIONING.md](VERSIONING.md) a tag is publishable only when
> this changelog has a dated section for the exact version.

### Added

- Research operating environment spanning question formation, evidence-constrained
  hypotheses, deterministic scientific verdicts, experiment/protocol execution,
  provenance, and reproducibility bundles.
- Web, CLI, interactive TUI, and Tauri desktop run surfaces over the same canonical
  API and scientific object model.
- Tabular experiment, literature-pool, theory-identity, FEM/AFEM, NetCDF data, and
  human-attested protocol legs, with explicit executable/unexecutable boundaries.
- Durable run events, checkpoints, cancellation/resume, backup/restore,
  verification, and failure-recovery paths.

### Security

- Loopback/Host/Origin request guards, secret and path gates, egress validation,
  sandbox policy checks, and content-addressed artifact validation.

### Known limitations

- This version has not been released. Current scientific north-star metrics remain
  below their declared targets; the external Qwen route still requires a
  user-owned credential.
- Desktop installers are not signed, notarized, or update-enabled and must not be
  represented as a supported distribution channel.

[unreleased]: https://github.com/yry1816186-pixel/FAR-Lab/commits/main/
[0.1.0]: https://github.com/yry1816186-pixel/FAR-Lab
