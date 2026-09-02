# Troubleshooting

Every entry below is a failure that actually happened in this repository's
development or CI, with the verified root cause. If your symptom is not here,
check the gates first (`npm run typecheck && npm run lint && npm test`) — most
mysteries surface in one of them.

## Setup & runtime

**`far` commands see no runs / empty workspace.**
The CLI resolves the workspace from `FARLAB_DATA_DIR`. The default (`.far-run`)
is not the workspace a dev server was started with. Point it explicitly:
`FARLAB_DATA_DIR=work/gold far verify ...`

**Env var with a Windows path opened an EMPTY database (30s blank-server incident).**
A backslash-form `FARLAB_DATA_DIR` value was silently accepted but resolved to a
different (fresh) directory. Always use forward slashes in env-provided paths:
`FARLAB_DATA_DIR=C:/Users/me/work/gold`.

**Provider API keys are not picked up.**
Keys are read from `process.env` at call time and are never written to any file.
`scripts/dev.mjs` injects a `.env` for the API subprocess; running the server
another way requires exporting the vars yourself (`ZAI_API_KEY`,
`DASHSCOPE_API_KEY`, ...). `far` reports missing var *names* only.

**Model provider 529 / HTTP 1302 capacity windows stall a run.**
These are external overload windows. The built-in mitigations are pacing envs
`FARLAB_MIN_CALL_INTERVAL_MS` (e.g. 12000) and `FARLAB_TOTAL_BUDGET_MS`
(e.g. 300000) plus checkpoint-resume — the run continues from its checkpoint
without duplicate spend. Do not restart into parallel runs on the same key:
account-level RPM limits (HTTP 1302) are self-excited by racing runs.

## Tests & CI

**`tests/cli-spawn.test.ts` fails after touching `src/`.**
Stale `dist`. The spawn tests execute the compiled binary; rebuild first:
`npm run build`. A guard (D-031) normally blocks lint fixes while `src` is newer
than `dist` — if you hit it, rebuild and re-run.

**Docker-dependent tests (`gateway`, `remote-executor`) fail with
`no matching manifest for windows/amd64`.**
The Docker engine is running Windows containers; the fixture image is
linux-only (`node:24-slim`). The suites gate on `docker info --format
'{{.OSType}}'` and honestly skip unless it reports `linux` (Docker Desktop with
the WSL2 backend reports `linux`).

**`explore_code` reports that Docker/image isolation is unavailable.**
The production capability deliberately has no host-process fallback. Start a
Docker Engine in Linux-container mode, then run `npm run sandbox:build` and
`npm run sandbox:verify`. On Windows the supported backend is Docker Desktop's
Linux/WSL2 engine; a Windows-native AppContainer/Job backend is not shipped.

**A test's git fixture commit dies with `Direct commits to main are not allowed`.**
A host-global `init.templateDir` (e.g. `~/.git-template` with a personal
pre-commit) leaks into `git init` fixtures. The fixture uses `git init
--template=` to stay bare; if you add new fixtures, keep that flag.

**Importing a plain `.mjs` under `web/` from a root-vitest test yields an empty
module on Windows (works on Linux/macOS).**
vite-node's transform of plain-`.mjs` sources outside `web/src` returns an empty
module on Windows. Drive the real process boundary instead (see
`tests/web-bundle-budget.test.ts`, which shells out to the CLI). This is a
transform-layer workaround, not a product change.

**A root test importing a web-only dependency (`jszip`, `xlsx`, `mammoth`…)
fails on CI with "Failed to resolve import" while passing locally.**
Module resolution walks up from the IMPORTING file: `web/src/**` finds them in
`web/node_modules`, but `tests/**` walks only root `node_modules` — a local
root install may carry the package (masking the bug) where CI's clean root
`npm ci` does not (canonical main went three-OS red this way on 2026-09-02).
Resolve through web's package root: `createRequire(join(__dirname, '..', 'web',
'package.json'))('jszip')`.

**Web tests/e2e flake with a port race.**
Dev-server port assignment races on loaded machines; re-run once before
investigating. Persistent failures with a fixed port error are a real conflict —
find the zombie server (`netstat -ano | findstr <port>`) and kill it.

**`git` warns `LF will be replaced by CRLF` on every checkout.**
Harmless on this repo (no line-ending-sensitive artifacts are committed); the
warnings come from a Windows-global `autocrlf=true`. EXCEPTION below — `.mjs`
files are line-ending sensitive.

**A shebang'd `.mjs` import dies with `SyntaxError: Invalid or unexpected token`
on `windows-latest` CI while the same tree is green locally and on ubuntu.**
The runner's autocrlf checkout rendered the file with CRLF, and vite/vitest's
transform fails on a shebang in a CRLF `.mjs` (reproduced and bisected
2026-09-02: CRLF+shebang fails, CRLF without shebang passes). Root fix:
`.gitattributes` pins `*.mjs text eol=lf` (commit b830955) — do not remove it,
and do not add shebangs to `.ts` test-imported sources.

## Web & desktop

**The web UI shows yesterday's build after a deploy/rebuild.**
`index.html` is cached by the browser; hard-reload (Ctrl+F5).

**A generated PDF/odt file is locked on Windows.**
A viewer process holds the file (File.Replace denied). Close the viewer; if the
swap must land while locked, it is recorded in `submission/RELEASE_BLOCKERS.md`
— never force-delete an unknown process's file.

**Desktop build cannot find the sidecar / bundled assets.**
Desktop bundles run from `desktop/`; the CI gate builds with `--locked` and
asserts bundle formats via `scripts/assert-bundle-formats.mjs`. If assets are
missing at runtime, verify you are running the packaged app (not the dev tree)
and that the release-pack manifest includes them.
