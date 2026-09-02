import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createExplorationSandbox,
  type ExplorationSandbox,
} from '../src/experiment/exploration-sandbox.js';

const VERIFY_REAL_SANDBOX = process.env.FARLAB_VERIFY_EXPLORATION_SANDBOX === '1';
const CONTAINER_FILTER = 'name=^farlab-exploration-';
const SENTINEL_KEY = 'FARLAB_ADVERSARIAL_CREDENTIAL_SENTINEL';
const SENTINEL_VALUE = 'public-non-secret-sandbox-sentinel';
const CONTAINER_PYTHON = '/opt/farlab/.venv/bin/python';
const ROOT_WRITE_PROBE = '/opt/farlab/.adversarial-write-probe';

interface DirectExplorationResult {
  exploration: {
    ok: boolean;
    stdout?: string;
    stdoutTruncated?: boolean;
    errorKind?: string;
    errorMessage?: string;
  };
}

const docker = (args: string[]): string => execFileSync('docker', args, {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 15_000,
  windowsHide: true,
}).trim();

const dockerStatus = (args: string[]): { status: number | null; stderr: string } => {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 15_000,
    windowsHide: true,
  });
  return { status: result.status, stderr: result.stderr };
};

const sandboxContainerNames = (): string[] => {
  const output = docker(['ps', '-a', '--filter', CONTAINER_FILTER, '--format', '{{.Names}}']);
  return output === '' ? [] : output.split(/\r?\n/).filter(Boolean);
};

const waitFor = async <T>(
  observe: () => T,
  accept: (value: T) => boolean,
  timeoutMs: number,
): Promise<T> => {
  const deadline = Date.now() + timeoutMs;
  let value = observe();
  while (!accept(value) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    value = observe();
  }
  if (!accept(value)) throw new Error(`condition was not met within ${timeoutMs}ms: ${JSON.stringify(value)}`);
  return value;
};

const containerProcesses = (name: string): Array<{ pid: number; command: string }> => {
  const lines = docker(['top', name, '-eo', 'pid,comm']).split(/\r?\n/).slice(1);
  return lines.flatMap((line) => {
    const match = line.trim().match(/^(\d+)\s+(.+)$/);
    return match === null ? [] : [{ pid: Number(match[1]), command: match[2] ?? '' }];
  });
};

const linuxDockerAttachClientPids = (containerName: string): number[] => {
  if (process.platform !== 'linux') return [];
  const expectedArgs = ['start', '--attach', '--interactive', containerName];
  return readdirSync('/proc', { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) return [];
    try {
      const argv = readFileSync(`/proc/${entry.name}/cmdline`, 'utf8').split('\0').filter(Boolean);
      const executable = argv[0]?.replaceAll('\\', '/').split('/').at(-1);
      return executable === 'docker' && JSON.stringify(argv.slice(1)) === JSON.stringify(expectedArgs)
        ? [Number(entry.name)]
        : [];
    } catch {
      return [];
    }
  });
};

const processExists = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

describe.skipIf(!VERIFY_REAL_SANDBOX).sequential('exploration OCI sandbox adversarial boundaries', () => {
  let sandbox: ExplorationSandbox | undefined;
  let containerName = '';
  let originalSentinel: string | undefined;

  const liveSandbox = (): ExplorationSandbox => {
    if (sandbox === undefined) throw new Error('sandbox was not initialized');
    return sandbox;
  };

  const runCode = (code: string, timeoutMs = 15_000) => liveSandbox().call<DirectExplorationResult>(
    'run_exploration',
    { code },
    timeoutMs,
  );

  beforeAll(async () => {
    expect(sandboxContainerNames()).toEqual([]);
    originalSentinel = process.env[SENTINEL_KEY];
    process.env[SENTINEL_KEY] = SENTINEL_VALUE;

    sandbox = createExplorationSandbox();
    const attested = await sandbox.warmup(120_000);
    expect(attested.pythonVersion).toBe('container-attested');
    containerName = (await waitFor(sandboxContainerNames, (names) => names.length === 1, 10_000))[0] ?? '';
    expect(containerName).toMatch(/^farlab-exploration-[0-9a-f]{32}$/);
  }, 150_000);

  afterAll(async () => {
    try {
      sandbox?.close();
      await waitFor(sandboxContainerNames, (names) => names.length === 0, 15_000);
      expect(sandboxContainerNames()).toEqual([]);
    } finally {
      if (originalSentinel === undefined) delete process.env[SENTINEL_KEY];
      else process.env[SENTINEL_KEY] = originalSentinel;
    }
  }, 30_000);

  it('rejects unknown operations in the production client before protocol dispatch', async () => {
    await expect(liveSandbox().call('env_info', {}, 1_000)).rejects.toThrow(
      'operation env_info is not exposed by the exploration sandbox',
    );

    const stillResponsive = await liveSandbox().call('sandbox_info', {}, 10_000);
    expect(stillResponsive.ok).toBe(true);
  });

  it('denies filesystem, network, subprocess, environment, and credential escape attempts', async () => {
    const attestation = liveSandbox().sandboxAttestation();
    expect(attestation).toMatchObject({
      rootfsReadOnly: true,
      networkDisabled: true,
      interfaces: ['lo'],
    });

    const rejectedImports = [
      {
        surface: 'socket/network',
        code: 'import socket\nsocket.create_connection(("198.51.100.1", 9), timeout=0.1)',
        expected: /import of 'socket' is outside the exploration allowlist/,
      },
      {
        surface: 'subprocess',
        code: 'import subprocess\nsubprocess.run(["true"], check=True)',
        expected: /import of 'subprocess' is outside the exploration allowlist/,
      },
      {
        surface: 'environment/credential',
        code: `import os\nprint(os.getenv("${SENTINEL_KEY}"))`,
        expected: /import of 'os' is outside the exploration allowlist/,
      },
    ];
    for (const attempt of rejectedImports) {
      const response = await runCode(attempt.code);
      expect(response.ok, attempt.surface).toBe(false);
      expect(response.error?.message, attempt.surface).toMatch(attempt.expected);
      expect(response.result, attempt.surface).toBeUndefined();
    }

    const fileWrite = await runCode(`open("${ROOT_WRITE_PROBE}", "w").write("forbidden")`);
    expect(fileWrite.ok).toBe(true);
    expect(fileWrite.result?.exploration).toMatchObject({ ok: false, errorKind: 'NameError' });
    expect(fileWrite.result?.exploration.errorMessage).toContain("name 'open' is not defined");

    const runtimeEscape = await runCode([
      'candidate_os = getattr(np.f2py, "os", None)',
      'candidate_env = getattr(candidate_os, "environ", {})',
      `print(candidate_env.get("${SENTINEL_KEY}", "not-visible"))`,
    ].join('\n'));
    const runtimeOutput = runtimeEscape.result?.exploration.stdout ?? '';
    expect(runtimeOutput).not.toContain(SENTINEL_VALUE);
    if (runtimeEscape.ok && runtimeEscape.result?.exploration.ok) {
      expect(runtimeOutput.trim()).toBe('not-visible');
    } else {
      expect(
        runtimeEscape.error?.message ?? runtimeEscape.result?.exploration.errorMessage,
      ).toMatch(/forbidden module|has no attribute/);
    }

    const configuredEnv = JSON.parse(docker(['inspect', '--format', '{{json .Config.Env}}', containerName])) as string[];
    expect(configuredEnv).not.toContain(`${SENTINEL_KEY}=${SENTINEL_VALUE}`);
    expect(configuredEnv.join('\n')).not.toContain(SENTINEL_VALUE);

    const directRootfsWrite = dockerStatus([
      // Override only this host-driven probe to root. A writable rootfs would
      // now accept the write, so failure proves the mount flag rather than the
      // default non-root user's directory permissions.
      'exec', '--user', '0:0', containerName, CONTAINER_PYTHON, '-I', '-c',
      [
        'from pathlib import Path',
        `probe = Path("${ROOT_WRITE_PROBE}")`,
        'try:',
        '    probe.write_text("forbidden", encoding="ascii")',
        'except OSError:',
        '    raise SystemExit(0)',
        'raise SystemExit(3)',
      ].join('\n'),
    ]);
    expect(directRootfsWrite.status, directRootfsWrite.stderr).toBe(0);
    const noSideEffect = dockerStatus(['exec', containerName, 'test', '!', '-e', ROOT_WRITE_PROBE]);
    expect(noSideEffect.status, noSideEffect.stderr).toBe(0);
  }, 60_000);

  it('bounds large output and marks the retained tail as truncated', async () => {
    const response = await runCode('print("x" * 200_000)', 30_000);
    expect(response.ok).toBe(true);
    expect(response.result?.exploration.ok).toBe(true);
    expect(response.result?.exploration.stdoutTruncated).toBe(true);
    expect(response.result?.exploration.stdout?.length).toBeLessThanOrEqual(8_000);
    expect(response.result?.exploration.stdout).toMatch(/^x+\n$/);
  }, 45_000);

  it('kills a timed-out infinite loop and leaves neither OCI nor child processes', async () => {
    docker(['exec', '--detach', containerName, CONTAINER_PYTHON, '-I', '-c', 'import time; time.sleep(600)']);
    const processes = await waitFor(
      () => containerProcesses(containerName),
      (rows) => rows.filter((row) => row.command.includes('python')).length >= 2,
      10_000,
    );
    const containerPids = processes.map((row) => row.pid);
    const dockerClientPids = linuxDockerAttachClientPids(containerName);
    if (process.platform === 'linux') expect(dockerClientPids.length).toBeGreaterThan(0);

    await expect(runCode('while True:\n    pass', 1_500)).rejects.toThrow(
      'exploration sandbox call run_exploration timed out after 1500ms',
    );

    await waitFor(sandboxContainerNames, (names) => names.length === 0, 15_000);
    expect(sandboxContainerNames()).toEqual([]);
    const gone = dockerStatus(['top', containerName]);
    expect(gone.status).not.toBe(0);

    if (process.platform === 'linux') {
      const checkedPids = [...containerPids, ...dockerClientPids];
      await waitFor(
        () => checkedPids.filter(processExists),
        (remaining) => remaining.length === 0,
        10_000,
      );
      const remaining = checkedPids.filter(processExists);
      expect(remaining).toEqual([]);
      // Keep a machine-searchable hosted-CI evidence line. The PIDs are
      // intentionally reduced to counts; the assertion above is authoritative
      // while avoiding needless process metadata in retained logs.
      const evidenceLine = `FA-SEC-01 Linux /proc attach-client cleanup: checked=${checkedPids.length} remaining=${remaining.length}`;
      process.stdout.write(`${evidenceLine}\n`);
      const evidencePath = process.env.FARLAB_SEC01_EVIDENCE_FILE;
      if (evidencePath !== undefined) appendFileSync(evidencePath, `${evidenceLine}\n`, 'utf8');
    }
  }, 45_000);
});
