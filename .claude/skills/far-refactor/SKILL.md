---
name: far-refactor
description: Performs a behavior-preserving FAR-Lab structural refactor using characterization tests, dependency recovery, incremental seams, compatibility, shadow comparison, rollback, and architecture fitness checks. Use for module boundaries, directory/package restructuring, dependency inversion, or legacy-path removal.
metadata:
  project: FAR-Lab
  version: "1.0"
---
# FAR-Lab Refactor

Read `agent/workflows/REFACTOR.md`. Define preserved behavior and contracts, capture the current call/dependency/data paths, and establish characterization tests. Design incremental migration and rollback before movement. Keep the repository runnable and do not mix hidden semantic changes with structural edits. Verify production behavior, architecture rules, compatibility, performance, and deletion safety before removing old paths.
