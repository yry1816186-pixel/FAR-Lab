import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Lean real backend verifies simple theorem via rfl', async (t) => {
  const leanCommand = findLeanCommand();
  if (leanCommand === null) {
    t.skip('lean is not available on PATH');
    return;
  }

  const probe = spawnSync(leanCommand, ['--version'], { encoding: 'utf8', timeout: 5000 });
  if (probe.error !== undefined || probe.status !== 0 || probe.signal !== null) {
    t.skip(`lean --version failed/hung for ${leanCommand}: ${(probe.stderr ?? probe.error?.message ?? 'timeout').trim()}`);
    return;
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'far-lean-'));
  const leanPath = join(tmpDir, 'Theorem.lean');
  const source = 'theorem t : 1 + 1 = 2 := rfl\n';
  writeFileSync(leanPath, source, { encoding: 'utf8' });

  try {
    const result = spawnSync(leanCommand, [leanPath], { encoding: 'utf8', timeout: 30000 });
    if (result.signal === 'SIGTERM') {
      t.skip(`lean verify timed out (30s) — toolchain unstable on PATH`);
      return;
    }
    assert.equal(result.error, undefined, `lean spawn error: ${result.error}`);
    const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    assert.equal(result.status, 0, `lean exited ${result.status}; output: ${combined}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

function findLeanCommand(): string | null {
  for (const command of ['lean', 'lean.exe']) {
    const result = spawnSync(command, ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (result.error === undefined && result.status === 0 && result.signal === null) {
      return command;
    }
  }
  return null;
}
