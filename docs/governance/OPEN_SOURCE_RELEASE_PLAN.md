# Open-Source Release Plan

> **Status:** `NEEDS_RELEASE_PUBLICATION` — repository is open-source-ready at the source
> level (CI green, installers work, Docker builds, docs coherent); the first formal GitHub
> Release is the remaining human action.

This document captures the decisions and the remaining-action ledger for the open-source
release. It is the authoritative reference for what "open-source ready" means for FAR-Lab.

## Release-form decisions (frozen)

| Area | Decision | Rationale |
|------|----------|-----------|
| License | MIT | Permissive, broad adoption; aligns with dependencies. See `LICENSE`, `SECURITY.md` §License Integrity. |
| Distribution | Source via `git clone` + `pnpm install` | Avoids npm registry overhead; `node src/cli/far.ts` is the universal entry. |
| Installer | `scripts/install.sh` + `scripts/install.ps1` | Zero-key, zero-big-data; checks toolchain presence only. |
| Docker | `docker compose up far-demo` (offline) | No key baked into image; real provider only via explicit `--env-file`. |
| Versioning | SemVer 2.0; tag ↔ `package.json` invariant | Enforced by `release.yml` "Verify tag matches package.json version". |
| Security contact | Private disclosure (`SECURITY.md`) | Never public issues for security reports. |
| Code of Conduct | Contributor Covenant 2.1 + scientific integrity clause | See `CODE_OF_CONDUCT.md`. |
| Maintainer | `@yry1816186-pixel` (lead) | Bus factor = 1; second maintainer `NEEDS_MAINTAINER_ASSIGNMENT`. |

## Remaining actions (inherent human / external)

These cannot be completed from a local clone — they require repository admin access
or external service setup.

### `NEEDS_RELEASE_PUBLICATION`
- [ ] Maintainer pushes `git tag v1.0.0 && git push origin v1.0.0` (triggers `release.yml`).
- [ ] Confirm GitHub Release created with assets (`install.sh`, `install.ps1`, `SHA256SUMS`).
- [ ] Confirm `CHANGELOG.md` `## [1.0.0]` section rendered as release body.

### `NEEDS_GHCR_PUBLISH`
- [ ] Repo Settings → Actions → General → Workflow permissions → "Read and write permissions"
      (lets `GITHUB_TOKEN` push to GHCR).
- [ ] Confirm `docker push ghcr.io/<owner>/far-lab:v1.0.0` succeeds in the release run.
- [ ] Confirm `docker-digest.txt` asset contains a non-"digest-unavailable" value.

### `NEEDS_MAINTAINER_ASSIGNMENT`
- [ ] Nominate a second maintainer (bus factor = 1 today).
- [ ] Publish a real security-reporting email (current `security@far-lab.example.com` is a placeholder).
- [ ] Enable GitHub Discussions (currently `NEEDS_MAINTAINER_ASSIGNMENT` to enable).

### `NEEDS_BRANCH_PROTECTION`
- [ ] Settings → Branches → add rule for `main`.
- [ ] Require status checks: `ci`, `depth_gate`, `depth_evidence` (optional),
      `entry_protocol_check`, `build-integrity`.
- [ ] Require pull request reviews before merging.
- [ ] Require review from Code Owners.

## Pre-flight self-checks (already green)

These were verified locally before tagging and re-run in CI on tag push:

- [x] `pnpm typecheck` green (`tsc --noEmit` strict mode)
- [x] `pnpm lint` green (`eslint src --max-warnings 0`)
- [x] `pnpm test` green (full `node --test` regression)
- [x] `pnpm run test:py` green (SymPy / Z3 verification axis)
- [x] `cross_lang_consistency` green (TS canonicalHash === Python byte-equal)
- [x] `offline_release_smoke` green (`far doctor` / `far demo tess-offline` / `far export far-proof` / `far verify .far-proof`)
- [x] Docker build succeeds offline with no key baked in
- [x] Install scripts never read/write API keys (`SECURITY.md` §Open-Source Install boundary)

## See also

- [release-process.md](release-process.md) — tagging and release workflow
- [../../SECURITY.md](../../SECURITY.md) — secret boundaries and disclosure policy
- [../../GOVERNANCE.md](../../GOVERNANCE.md) — roles and decision process
