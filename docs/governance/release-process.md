# Release Process

> **Status:** `NEEDS_RELEASE_PUBLICATION` — the release workflow (`.github/workflows/release.yml`)
> is wired and ready, but the first release tag (`v1.0.0`) has not been pushed by a maintainer.
> The first tag push is an inherent human action; repository artifacts cannot self-certify it.

This document describes how FAR-Lab releases are tagged, built, and published.

## Versioning

FAR-Lab follows [SemVer 2.0.0](https://semver.org/) with an early-stage convention:

- Pre-1.0 (`0.x`): breaking changes bump the minor version with at least one minor
  release deprecation window.
- Post-1.0 (`1.x+`): standard SemVer — breaking changes bump major, compat features
  bump minor, fixes bump patch.

The source of truth for the current version is `package.json` (`version` field).
`CITATION.cff`, the `v*` git tag, and `package.json` MUST agree at release time
(verified by `.github/workflows/release.yml` step "Verify tag matches package.json version").

## Release steps (maintainer only)

1. **Confirm green baseline** — `pnpm typecheck && pnpm lint && pnpm test && pnpm run test:py`
   on a clean clone. The release workflow re-runs these, but catching locally first avoids
   wasted runs.
2. **Update CHANGELOG** — add a `## [<version>] — <date>` section to `CHANGELOG.md`
   following [Keep a Changelog](https://keepachangelog.com/).
3. **Bump version** — `package.json` `version`, `CITATION.cff` `version` and `date-released`,
   `pyproject.toml` if the Python axis shipped.
4. **Commit** — `chore(release): vX.Y.Z` (one commit, version files + CHANGELOG only).
5. **Tag** — `git tag vX.Y.Z && git push origin vX.Y.Z`. This triggers
   `.github/workflows/release.yml`.
6. **Monitor** — the release workflow runs the full quality gate, builds Docker, pushes to
   GHCR (`NEEDS_GHCR_PUBLISH` for first-time permission setup), and creates the GitHub
   Release with assets (`install.sh`, `install.ps1`, `SHA256SUMS`, `docker-digest.txt`).

## Release assets

| Asset | Source | Purpose |
|-------|--------|---------|
| `install.sh` | `scripts/install.sh` | macOS/Linux one-line installer |
| `install.ps1` | `scripts/install.ps1` | Windows installer |
| `SHA256SUMS` | release workflow | checksum over install scripts |
| `docker-digest.txt` | release workflow | GHCR image digest (`@sha256:...`) |
| GitHub Release body | `CHANGELOG.md` section + auto-notes | human-readable release notes |

## Rollback

- **Bad tag pushed but no release published:** delete the tag
  (`git tag -d vX.Y.Z && git push origin :vX.Y.Z`), fix, re-tag.
- **Release published:** do NOT delete the tag or the GitHub Release. Instead publish a
  patched release `vX.Y.Z+1` and mark the bad release as a pre-release / yank.

## Distribution channels

| Channel | Status | Notes |
|---------|--------|-------|
| Source (`git clone` + `pnpm install`) | ✅ Primary | The supported distribution. `node src/cli/far.ts` runs everything. |
| npm registry | ❌ Not published | Source-only by design. `npm install -g far-chain` is not a goal for v1.x. |
| Docker (`ghcr.io/<owner>/far-lab`) | `NEEDS_GHCR_PUBLISH` | Workflow ready; first push needs GHCR write permission. |
| GitHub Release assets | `NEEDS_RELEASE_PUBLICATION` | Workflow ready; first tag push is a human action. |

## Trust boundary

- The release workflow **never** embeds API keys in artifacts (see `SECURITY.md`).
- The Docker image is built with `FAR_CHAIN_OFFLINE=1` — real providers require explicit
  `docker compose --env-file .env`.
- `install.sh` / `install.ps1` / `far doctor` never read or write API keys.
