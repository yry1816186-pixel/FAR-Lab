// tests/v2_domain/safe_execution.test.ts
//
// IMPL-011 — replace shell-string scheduling contract or remove surface.
// IMPL-012 — enforced isolated worker (v0 bounded profile).
//
// Authority: doc19 §7.2 (isolated execution), SEC-0002 (untrusted execution containment).
// R-005: scheduler executes a shell string (injection risk).
//
// v0 resolution: NO shell strings. Execution is a typed command vector with
// explicit args (no shell interpolation), resource limits, and egress policy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildExecutionManifest,
  assertNoShellString,
  buildContainmentPolicy,
  assertContainmentEnforced,
  SAFE_EXECUTION_PROFILE,
} from '../../src/v2_domain/safe_execution.ts';

// ---------------------------------------------------------------------------
// IMPL-011: No shell strings — typed command vector
// ---------------------------------------------------------------------------

test('buildExecutionManifest: produces typed command vector (no shell string)', () => {
  const manifest = buildExecutionManifest({
    executable: '/usr/bin/python3',
    args: ['script.py', '--input', 'data.csv'],
    workingDirectory: '/workspace',
    envAllowlist: ['PATH', 'PYTHONPATH'],
    stdinData: null,
  });
  assert.equal(manifest.executable, '/usr/bin/python3');
  assert.deepEqual([...manifest.args], ['script.py', '--input', 'data.csv']);
  assert.equal(manifest.shellInvocation, false, 'must NOT use shell invocation');
  assert.ok(manifest.manifestDigest.length === 64);
});

test('buildExecutionManifest: rejects shell metacharacters in args (injection prevention)', () => {
  assert.throws(
    () => buildExecutionManifest({
      executable: '/usr/bin/python3',
      args: ['script.py; rm -rf /'],  // shell injection attempt
      workingDirectory: '/workspace',
      envAllowlist: [],
      stdinData: null,
    }),
    /SHELL_METACHAR_DETECTED/,
  );
});

test('assertNoShellString: rejects command with pipe operator', () => {
  assert.throws(
    () => assertNoShellString('cat file | grep secret'),
    /SHELL_STRING_REJECTED/,
  );
});

test('assertNoShellString: rejects command with backtick substitution', () => {
  assert.throws(
    () => assertNoShellString('echo `whoami`'),
    /SHELL_STRING_REJECTED/,
  );
});

test('assertNoShellString: accepts clean executable path', () => {
  assert.doesNotThrow(() => assertNoShellString('/usr/bin/python3'));
});

// ---------------------------------------------------------------------------
// IMPL-012: Containment policy — resource/egress/filesystem limits
// ---------------------------------------------------------------------------

test('buildContainmentPolicy: produces policy with resource + egress limits', () => {
  const policy = buildContainmentPolicy({
    maxCpuSeconds: 300,
    maxMemoryMb: 2048,
    maxFilesystemWrites: ['/workspace/output'],
    networkEgress: 'DENY_ALL',
    allowedExitCodes: [0, 1],
  });
  assert.equal(policy.networkEgress, 'DENY_ALL');
  assert.equal(policy.maxCpuSeconds, 300);
  assert.ok(policy.policyDigest.length === 64);
});

test('SAFE_EXECUTION_PROFILE: v0 default profile denies all network egress', () => {
  assert.equal(SAFE_EXECUTION_PROFILE.networkEgress, 'DENY_ALL');
  assert.ok(SAFE_EXECUTION_PROFILE.maxCpuSeconds > 0);
});

test('assertContainmentEnforced: passes when policy has all required limits', () => {
  const policy = buildContainmentPolicy({
    maxCpuSeconds: 300,
    maxMemoryMb: 2048,
    maxFilesystemWrites: ['/workspace/output'],
    networkEgress: 'DENY_ALL',
    allowedExitCodes: [0, 1],
  });
  assert.doesNotThrow(() => assertContainmentEnforced(policy));
});

test('assertContainmentEnforced: throws if network egress is unrestricted', () => {
  assert.throws(
    () => assertContainmentEnforced({
      maxCpuSeconds: 300,
      maxMemoryMb: 2048,
      maxFilesystemWrites: [],
      networkEgress: 'ALLOW_ALL',  // UNSAFE in v0
      allowedExitCodes: [0],
      policyDigest: 'a'.repeat(64),
    }),
    /CONTAINMENT_NOT_ENFORCED.*network/,
  );
});

test('assertContainmentEnforced: throws if no CPU limit', () => {
  assert.throws(
    () => assertContainmentEnforced({
      maxCpuSeconds: 0,  // no limit = unsafe
      maxMemoryMb: 2048,
      maxFilesystemWrites: [],
      networkEgress: 'DENY_ALL',
      allowedExitCodes: [0],
      policyDigest: 'a'.repeat(64),
    }),
    /CONTAINMENT_NOT_ENFORCED.*CPU/,
  );
});
