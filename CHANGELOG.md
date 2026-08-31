# Changelog

All notable user-visible and technical changes are recorded here. This project
follows the version policy in `VERSIONING.md`.

## [Unreleased]

### Changed

- Release construction is being upgraded from a directory upload to a
  self-verifying source archive with a content manifest, multi-ecosystem SBOM,
  checksums and signed build/SBOM attestations.

## [0.1.0] - UNRELEASED

### Added

- AOSSA research operating environment spanning question formation,
  evidence-constrained hypotheses, deterministic scientific verdicts,
  experiment/protocol execution, provenance and reproducibility bundles.
- Web, CLI, interactive TUI and Tauri desktop run surfaces over the same
  canonical API and scientific object model.
- Tabular experiment, literature-pool, theory identity, FEM/AFEM, NetCDF data
  and human-attested protocol legs, with explicit executable/unexecutable
  boundaries.
- Durable run events, checkpoints, cancellation/resume, backup/restore,
  verification and failure-recovery paths.

### Security

- Loopback/Host/Origin request guards, secret/path gates, egress validation,
  sandbox policy checks and content-addressed artifact validation.

### Known limitations

- This version has not been released. Current scientific north-star metrics
  remain below their declared targets; the external Qwen route still requires
  a user-owned credential.
- Desktop installers are not signed, notarized or update-enabled and must not
  be represented as a supported distribution channel.
