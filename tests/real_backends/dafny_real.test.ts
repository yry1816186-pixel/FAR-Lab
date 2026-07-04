import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Dafny real backend verifies simple postcondition theorem', async (t) => {
  const dafnyCommand = findDafnyCommand();
  if (dafnyCommand === null) {
    t.skip('dafny is not available on PATH');
    return;
  }

  const probe = spawnSync(dafnyCommand, ['--version'], { encoding: 'utf8' });
  if (probe.error !== undefined || probe.status !== 0) {
    t.skip(`dafny --version failed for ${dafnyCommand}: ${(probe.stderr ?? probe.error?.message ?? '').trim()}`);
    return;
  }

  const tmpDir = mkdtempSync(join(tmpdir(), 'far-dafny-'));
  const dfyPath = join(tmpDir, 'AddOne.dfy');
  const source = [
    'method AddOne(x: int) returns (y: int)',
    '  requires x > 0',
    '  ensures y > -1',
    '{ y := x }',
  ].join('\n');
  writeFileSync(dfyPath, source, { encoding: 'utf8' });

  try {
    const result = spawnSync(dafnyCommand, ['verify', dfyPath], { encoding: 'utf8' });
    assert.equal(result.error, undefined, `dafny spawn error: ${result.error}`);
    const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    assert.equal(result.status, 0, `dafny verify exited ${result.status}; output: ${combined}`);
    assert.match(combined, /0 errors|no errors|verified|verification successful/i, `expected verification success in: ${combined}`);
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

function findDafnyCommand(): string | null {
  for (const command of ['dafny', 'dafny.exe']) {
    const result = spawnSync(command, ['--version'], { encoding: 'utf8' });
    if (result.error === undefined && result.status === 0) {
      return command;
    }
  }
  return null;
}
