import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';

/**
 * Login-shell plane (extensibility lane): detect the researcher's real shell,
 * honor its profile-loading semantics, and run commands / hold sessions in it.
 *
 * "Inherit system terminal profile" is implemented as: spawn the user's shell
 * in LOGIN mode (bash/zsh `-l`; PowerShell/cmd load their profiles by default
 * unless suppressed) with the full process environment — aliases-on-login,
 * PATH additions and AutoRun scripts all take effect. Honest limits:
 * - Sessions are line-based (stdio pipes, no PTY): full-screen TUI programs
 *   (vim/htop) are NOT usable; command-line workflows are.
 * - `-l` loads profile-class files (.bash_profile/.zprofile, AutoRun);
 *   interactive-only rc files load only when the profile itself sources them.
 * - Windows legacy codepages break non-ASCII output, so every family gets a
 *   UTF-8 setup preamble (chcp 65001 / Console.OutputEncoding) — visible in
 *   the session as a real first command, not hidden magic.
 */

export type ShellFamily = 'powershell' | 'pwsh' | 'cmd' | 'posix';

export interface LoginShell {
  program: string;
  /** Args that start a PERSISTENT session honoring the profile. */
  sessionArgs: string[];
  /** Text piped into the session right after spawn to force UTF-8 output. */
  sessionUtf8Prelude: string;
  displayName: string;
  family: ShellFamily;
}

const exists = (p: string): boolean => { try { fs.accessSync(p, fs.constants.X_OK); return true; } catch { return false; } };

/** pwsh > powershell > cmd on Windows; $SHELL > bash > sh elsewhere. FARLAB_SHELL overrides. */
export const detectLoginShell = (): LoginShell => {
  const override = process.env.FARLAB_SHELL;
  if (override !== undefined && override.trim().length > 0) {
    return posixShell(override.trim());
  }
  if (process.platform === 'win32') {
    if (exists('C:\\Program Files\\PowerShell\\7\\pwsh.exe')) return powerShell('C:\\Program Files\\PowerShell\\7\\pwsh.exe', 'pwsh');
    const onPath = whereIs('pwsh.exe');
    if (onPath !== null) return powerShell(onPath, 'pwsh');
    const winPs = `${process.env.SystemRoot ?? 'C:\\Windows'}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
    if (exists(winPs)) return powerShell(winPs, 'powershell');
    return cmdShell();
  }
  return posixShell(process.env.SHELL !== undefined && process.env.SHELL.trim().length > 0 ? process.env.SHELL.trim() : '/bin/bash');
};

const whereIs = (program: string): string | null => {
  try {
    const probe = spawnSync('where.exe', [program], { encoding: 'utf8', windowsHide: true });
    if (probe.status === 0) {
      const first = probe.stdout.split(/\r?\n/).find((l) => l.trim().length > 0);
      return first !== undefined ? first.trim() : null;
    }
    return null;
  } catch {
    return null;
  }
};

const powerShell = (program: string, name: 'pwsh' | 'powershell'): LoginShell => {
  // Both Input AND Output encoding: piped stdin is read with InputEncoding —
  // without it, non-ASCII (CJK) input garbles on legacy codepage consoles.
  const utf8 = '[Console]::InputEncoding=[Console]::OutputEncoding=[System.Text.Encoding]::UTF8';
  return {
    program,
    sessionArgs: ['-NoLogo'],
    sessionUtf8Prelude: `${utf8}\r\n`,
    displayName: name === 'pwsh' ? 'PowerShell 7' : 'Windows PowerShell',
    family: name,
  };
};

const cmdShell = (): LoginShell => ({
  program: process.env.ComSpec ?? 'cmd.exe',
  sessionArgs: ['/Q', '/K', 'chcp 65001>nul'],
  sessionUtf8Prelude: '',
  displayName: 'cmd.exe',
  family: 'cmd',
});

const posixShell = (program: string): LoginShell => {
  const name = program.split('/').pop() ?? program;
  return {
    program,
    sessionArgs: ['-l'],
    sessionUtf8Prelude: '',
    displayName: name,
    family: 'posix',
  };
};

/** One command, one bounded run in the login shell. Exit code and output are honest. */
export const runInLoginShell = async (opts: {
  command: string;
  cwd: string;
  timeoutMs: number;
  maxOutputChars: number;
  shell?: LoginShell;
}): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
  truncated: boolean;
}> => {
  const shell = opts.shell ?? detectLoginShell();
  const started = Date.now();
  const spawned = spawnForOneShot(shell, opts.command, opts.cwd);
  const child = spawned.child;
  if (spawned.stdinScript !== null) child.stdin?.end(spawned.stdinScript);
  let stdout = '';
  let stderr = '';
  let truncated = false;
  let spawnError: string | null = null;
  child.on('error', (e: Error) => { spawnError = e.message; });
  child.stdout?.on('data', (c: Buffer) => {
    if (stdout.length <= opts.maxOutputChars * 2) stdout += c.toString('utf8');
    else if (!truncated) { truncated = true; killTree(child); }
  });
  child.stderr?.on('data', (c: Buffer) => {
    if (stderr.length <= opts.maxOutputChars * 2) stderr += c.toString('utf8');
  });
  const timedOut = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => { killTree(child); resolve(true); }, opts.timeoutMs);
    child.on('exit', () => { clearTimeout(timer); resolve(false); });
    child.on('error', () => { clearTimeout(timer); resolve(false); });
  });
  const render = (): string => {
    if (stdout.length <= opts.maxOutputChars) return stdout;
    truncated = true;
    const half = Math.floor(opts.maxOutputChars / 2);
    return `${stdout.slice(0, half)}\n…[output over cap, ${stdout.length - opts.maxOutputChars} chars elided]…\n${stdout.slice(-half)}`;
  };
  return {
    exitCode: child.exitCode,
    stdout: render(),
    stderr: (spawnError !== null ? `spawn failed: ${spawnError}\n` : '') + stderr.slice(0, opts.maxOutputChars),
    timedOut,
    durationMs: Date.now() - started,
    truncated,
    ...(spawnError !== null ? { spawnFailed: true } : {}),
  };
};

/**
 * One-shot spawn. POSIX: argv `-lc <command>` (no quoting pitfalls). Windows
 * (PowerShell/cmd): the command goes over STDIN as a script — Windows argv
 * quoting corrupts nested quotes (`node -e "process.exit(3)"` arrived at
 * PowerShell as a bare expression and exited 1, not 3), and stdin scripts
 * bypass that entire class. Both families end with an explicit `exit N` so the
 * child's exit code is the command's own.
 */
const spawnForOneShot = (shell: LoginShell, command: string, cwd: string): { child: ChildProcess; stdinScript: string | null } => {
  switch (shell.family) {
    case 'posix':
      return {
        child: spawn(shell.program, [...shell.sessionArgs, '-c', command], {
          cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32',
        }),
        stdinScript: null,
      };
    case 'cmd':
      return {
        child: spawn(shell.program, ['/Q'], {
          cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32',
        }),
        stdinScript: `chcp 65001>nul\r\n${command}\r\nexit %ERRORLEVEL%\r\n`,
      };
    default:
      return {
        child: spawn(shell.program, ['-NoLogo', '-NonInteractive', '-Command', '-'], {
          cwd, env: process.env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32',
        }),
        stdinScript: '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8\n' +
          `${command}\n` +
          'exit $(if ($LASTEXITCODE -is [int]) { $LASTEXITCODE } else { 0 })\n',
      };
  }
};

/** Persistent login-shell session child (terminal surface owns its lifecycle). */
export const spawnSessionShell = (shell: LoginShell, cwd: string): ChildProcess =>
  spawn(shell.program, shell.sessionArgs, {
    cwd,
    env: process.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  });

/** Kill a child and (POSIX) its process group / (Windows) its tree. */
export const killTree = (child: ChildProcess): void => {
  try {
    if (child.pid === undefined) { child.kill('SIGTERM'); return; }
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
    } else {
      try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
    }
  } catch {
    // already dead — the exit event is the authority
  }
};
