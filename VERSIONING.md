# Versioning and release policy

FAR-Lab uses Semantic Versioning for published artifacts. Before 1.0, a minor
version may change an experimental interface and a patch version remains
backward compatible within that minor line. Breaking API, schema, bundle, or
CLI changes must be called out in `CHANGELOG.md` with migration guidance.

The root package, Web workbench, Python experiment runtime, desktop shell and
TUI share one release-train version. Their current manifests are all `0.1.0`.
The root `package.json` is the release authority; the release gate rejects
drift in the other manifests.

- Product tags are annotated `vMAJOR.MINOR.PATCH` tags and must exactly match
  the root version.
- A tag is publishable only when `CHANGELOG.md` has a dated section for that
  exact version; an `UNRELEASED` heading fails closed.
- Branch and manual-dispatch artifacts are development evidence, not releases.
  They carry the version plus source commit in the filename and are never
  uploaded to GitHub Releases.
- Published artifacts comprise the source archive, content manifest,
  CycloneDX SBOM, `SHA256SUMS`, and signed provenance/SBOM attestations.
- Rollback means reinstalling the previous signed release. Data/schema
  compatibility and any migration-specific rollback instructions belong in
  the corresponding changelog section before tagging.

No npm package or desktop installer is currently published. Adding either is a
separate release surface and requires its own installed/update/rollback test.
