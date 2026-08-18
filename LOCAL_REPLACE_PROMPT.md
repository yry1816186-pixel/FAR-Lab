# Local Agent Prompt — Safely Replace a FAR-Lab Workspace

You are replacing an existing local FAR-Lab working tree with the complete project snapshot in the sibling directory `FAR-Lab-refactored`. Treat the existing user's Git metadata, secrets, databases, and untracked research outputs as irreplaceable local state.

## Non-negotiable safety rules

1. Locate the existing FAR-Lab repository; do not assume its path.
2. Before copying anything, run `git status --short --branch`, `git rev-parse --abbrev-ref HEAD`, and `git rev-parse HEAD` in the existing repository and record the results.
3. If the working tree has tracked or untracked changes, do **not** discard them. Create a safety branch/tag where possible and also make a filesystem backup of user-owned changes/data.
4. Preserve the existing `.git/` directory. The replacement snapshot intentionally has no `.git/`.
5. Preserve `.env`, `.env.*` files containing local secrets, credentials, tokens, private keys, local certificates, and machine-specific configuration. Never print their values.
6. Preserve local databases and explicitly user-generated/untracked research artifacts unless the user has separately identified them as disposable.
7. Do not replace the workspace by blindly deleting the whole old directory (`rm -rf`, recursive Remove-Item, Explorer delete, etc.). Synchronize project files deliberately.
8. Use `PROJECT_FILE_MANIFEST.txt` from the new snapshot as the authoritative list of project files. Compare it with `git ls-files` in the old repository.
9. Tracked project files that are absent from the new manifest were intentionally removed and may be deleted **only after** they are backed up or recoverable from Git.
10. Never delete untracked local data merely because it is absent from the new manifest.
11. Do not claim success unless dependency installation, migrations (if any), build/typecheck/lint/tests, and final diff/status have been evaluated.

## Procedure

### A. Inspect and protect the old workspace

- Confirm the directory is really FAR-Lab by checking `package.json`, `pyproject.toml`, and the Git remote.
- Record current branch and HEAD SHA.
- Save `git status --porcelain=v1 -uall` to a temporary audit file outside the workspace.
- Create a backup ref if Git allows it, for example a branch or tag named with the current date/time. Do not overwrite an existing ref.
- If there are local modifications, export a patch (`git diff` and `git diff --staged`) and copy untracked user data to a safe backup location.
- Record local secret/config paths without printing their contents.

### B. Compare manifests

- Read `FAR-Lab-refactored/PROJECT_FILE_MANIFEST.txt`.
- Get the old repository's tracked files with `git ls-files`.
- Compute three sets: files to replace, files newly added, and old tracked files intentionally removed.
- Explicitly exclude `.git/`, local secrets, databases, caches, dependency directories, build caches, and user research outputs from destructive synchronization.

### C. Synchronize safely

Use a cross-platform file-copy method available on the machine. Do not assume `rsync` exists.

- **macOS/Linux:** `cp`, `tar`, a short Python/Node copy script, or `rsync` if it is actually installed. Never use a command that deletes untracked files indiscriminately.
- **Windows:** PowerShell `Copy-Item`, `robocopy` with carefully reviewed include/exclude behavior, or a short Python/Node copy script. Avoid `/MIR` unless you have independently protected all excluded/user-owned paths because mirror mode can delete data.
- Copy each project file from the new manifest into the existing workspace, preserving relative paths.
- Remove only old **tracked** source/project files confirmed absent from the new manifest. Prefer `git rm` for files still tracked by Git.
- Restore/preserve local `.env` and other protected local configuration after synchronization if any copy step touched neighboring paths.

### D. Dependencies and migrations

- Read `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `frontend/package.json`, `pyproject.toml`, and `uv.lock` to determine package managers.
- Use the lockfile-preserving install commands documented by the project/CI. Do not regenerate or delete lockfiles just to make installation easier.
- If migrations are documented by the new snapshot, back up the affected data first and run them exactly as specified. If no migration exists, state that explicitly.

### E. Validate

Run the repository's actual quality gates, prioritizing the existing SSOT commands/workflows. At minimum evaluate:

- root TypeScript typecheck;
- root ESLint;
- frontend typecheck;
- frontend ESLint;
- frontend Vitest;
- frontend production build;
- applicable root TypeScript tests;
- applicable Python tests;
- repository build/integrity checks and offline smoke checks where the local environment supports them.

Do not disable tests, weaken lint/type rules, add `any`/`@ts-ignore`, swallow errors, or edit tests merely to obtain green output.

### F. Final evidence

Output, without leaking secrets:

- old branch and old HEAD;
- backup branch/tag/path created;
- files added/replaced/removed;
- protected local files/data preserved;
- dependency/migration commands actually executed;
- each validation command and exit status;
- `git status --short --branch`;
- `git diff --stat` and a reviewable `git diff` (or location of a saved diff if very large);
- every failed or skipped validation item and the reason.

If any required validation fails, say **replacement applied but validation failed** rather than reporting a successful replacement.
