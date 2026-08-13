---
name: far-release
description: Prepares and verifies FAR-Lab release, packaging, installation, migration, upgrade, rollback, uninstall, artifacts, supply-chain evidence, documentation, and operational readiness. Use for release candidates or deployment preparation; never publishes without explicit authorization.
metadata:
  project: FAR-Lab
  version: "1.0"
---
# FAR-Lab Release

Read `agent/workflows/RELEASE.md`. Confirm authorization and scope, then perform clean-build and installation evidence, migration/rollback/uninstall checks, artifact verification, platform matrix review, dependency/license/SBOM/security checks, release-note validation, backup/recovery and operations readiness. Prepare authorization-gated commands but do not push, tag, publish, sign, deploy, or spend resources unless explicitly approved.
