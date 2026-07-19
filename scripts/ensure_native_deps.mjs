// Ensure native Node addons match the current OS/Node runtime.
// Mixed Windows/WSL worktrees share node_modules, so better-sqlite3 can be built
// for the other platform even when package installation is otherwise complete.

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const addonName = 'better-sqlite3';

if (canLoadAddon()) {
  process.exit(0);
}

process.stderr.write(
  `ensure_native_deps: ${addonName} native addon does not load on ${process.platform}/${process.arch}; rebuilding\n`,
);

const attempts = [
  rebuildAttempt('pnpm'),
  rebuildAttempt('npm'),
];

const details = [];
for (const attempt of attempts) {
  const result = spawnSync(attempt.command, attempt.args, {
    encoding: 'utf8',
    env: attempt.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status === 0 && canLoadAddon()) {
    process.stderr.write(`ensure_native_deps: ${addonName} rebuilt successfully\n`);
    process.exit(0);
  }
  details.push([
    `${attempt.command} ${attempt.args.join(' ')} exited ${result.status ?? 'unknown'}`,
    result.error?.message,
    result.stdout,
    result.stderr,
  ].filter(Boolean).join('\n'));
}

process.stderr.write(`ensure_native_deps: failed to rebuild ${addonName}\n${details.join('\n---\n')}\n`);
process.exit(1);

function rebuildAttempt(manager) {
  if (process.platform === 'win32') {
    const commandLine =
      manager === 'pnpm'
        ? `set npm_config_build_from_source=true&& pnpm rebuild ${addonName}`
        : `npm rebuild ${addonName} --build-from-source`;
    return {
      command: 'cmd.exe',
      args: ['/d', '/s', '/c', commandLine],
      env: process.env,
    };
  }
  return {
    command: manager,
    args: manager === 'pnpm' ? ['rebuild', addonName] : ['rebuild', addonName, '--build-from-source'],
    env: manager === 'pnpm' ? { ...process.env, npm_config_build_from_source: 'true' } : process.env,
  };
}

function canLoadAddon() {
  try {
    const Database = require(addonName);
    const db = new Database(':memory:');
    db.close();
    return true;
  } catch {
    return false;
  }
}
