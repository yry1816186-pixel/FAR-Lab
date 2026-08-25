#!/usr/bin/env node
/**
 * R2-10 ops helper: bring up the containerized SSH execution target and register it
 * as a far experiment device — one command, honest boundaries.
 *
 *   node experiment-runtime/ssh-target/up.mjs --data-dir .far-run [--port 2242]
 *        [--name farlab-ssh-target] [--memory 512m] [--cpus 2] [--rebuild]
 *
 * What this does (mirrors the verified test bring-up in tests/gateway.test.ts):
 *   1. docker build the image (Dockerfile here: sshd + python3 + sklearn, key-only auth);
 *   2. force-clean any stale container of the same name, then run a fresh one with
 *      resource caps (--memory/--cpus) and a LOOPBACK-ONLY published port;
 *   3. generate a dedicated ed25519 keypair (never a shared default key);
 *   4. TOFU-pin the container host key into a dedicated known_hosts file;
 *   5. wait until SSH actually answers (bounded);
 *   6. merge the device into <data-dir>/devices.json (preserving existing devices).
 *
 * Honest boundary notes (same as gateway.ts):
 *   - A same-host container is an ENVIRONMENT boundary (isolated fs/process, capped
 *     memory/cpu, loopback-only network), not a full security sandbox.
 *   - Cross-device bit-identity is not claimed (D-086-3); same-device only.
 * Exit codes: 0 = device ready; 2 = usage; 1 = bring-up failure (message on stderr).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name) => args.includes(name);

const dataDir = arg('--data-dir');
if (dataDir === undefined || flag('--help')) {
  process.stderr.write('usage: up.mjs --data-dir <dir> [--port 2242] [--name farlab-ssh-target] [--memory 512m] [--cpus 2] [--rebuild]\n');
  process.exit(2);
}
const port = Number(arg('--port') ?? 2242);
const container = arg('--name') ?? 'farlab-ssh-target';
const memory = arg('--memory') ?? '512m';
const cpus = arg('--cpus') ?? '2';
const here = import.meta.dirname;

const run = (cmd, cmdArgs, opts = {}) => execFileSync(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', ...opts });

try {
  // 1. Image (skip rebuild when present, unless --rebuild).
  const images = run('docker', ['images', '-q', container]);
  if (images.trim() === '' || flag('--rebuild')) {
    process.stdout.write(`building image ${container} ...\n`);
    run('docker', ['build', '-t', container, here], { stdio: 'inherit' });
  }

  // 2. Fresh container with resource caps + loopback-only publish.
  try { run('docker', ['rm', '-f', container], { stdio: 'ignore' }); } catch { /* not running */ }

  // 3. Dedicated keypair in the data dir (ops-local, gitignored by design).
  const keyDir = path.resolve(dataDir, 'ssh-target');
  fs.mkdirSync(keyDir, { recursive: true });
  const identity = path.join(keyDir, `id_ed25519_${port}`);
  if (!fs.existsSync(identity)) {
    run('ssh-keygen', ['-t', 'ed25519', '-N', '', '-f', identity, '-C', `farlab-target-${port}`]);
  }
  const pub = fs.readFileSync(`${identity}.pub`, 'utf8').trim();

  run('docker', [
    'run', '-d', '--name', container,
    '-p', `127.0.0.1:${port}:22`,
    '--memory', memory, '--cpus', cpus,
    '-e', `AUTHORIZED_KEY=${pub}`,
    container,
    'sh', '-c', 'echo "$AUTHORIZED_KEY" > /root/.ssh/authorized_keys && chmod 700 /root/.ssh && chmod 600 /root/.ssh/authorized_keys && exec /usr/sbin/sshd -D -e',
  ]);

  // 4. TOFU host-key pinning (read straight from the container's sshd).
  const hostKey = run('docker', ['exec', container, 'cat', '/etc/ssh/ssh_host_ed25519_key.pub']).trim();
  const knownHosts = path.join(keyDir, `known_hosts_${port}`);
  fs.writeFileSync(knownHosts, `[localhost]:${port} ${hostKey}\n`);

  // 5. Bounded SSH readiness wait (probe via BatchMode echo).
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
    try {
      run('ssh', [
        '-i', identity, '-o', `UserKnownHostsFile=${knownHosts}`, '-o', 'StrictHostKeyChecking=yes',
        '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=3', '-p', String(port), 'root@localhost', 'echo ok',
      ]);
      ready = true;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (!ready) throw new Error('sshd did not accept connections within 30s');

  // 6. Merge into devices.json (keep 'local' + any existing devices; dedupe by id).
  const deviceId = `ssh-sandbox-${port}`;
  const devicesPath = path.resolve(dataDir, 'devices.json');
  let devices = [{ id: 'local', kind: 'local' }];
  if (fs.existsSync(devicesPath)) {
    const parsed = JSON.parse(fs.readFileSync(devicesPath, 'utf8'));
    if (!Array.isArray(parsed.devices)) throw new Error(`malformed devices file at ${devicesPath} (expected {devices:[...]})`);
    devices = parsed.devices.filter((d) => d.id !== deviceId);
    if (!devices.some((d) => d.id === 'local')) devices.unshift({ id: 'local', kind: 'local' });
  }
  devices.push({ id: deviceId, kind: 'ssh', host: 'localhost', port, user: 'root', identityFile: identity, knownHostsFile: knownHosts });
  fs.mkdirSync(path.resolve(dataDir), { recursive: true });
  fs.writeFileSync(devicesPath, `${JSON.stringify({ devices }, null, 2)}\n`);

  process.stdout.write(
    `device ready: ${deviceId} (container ${container}, port 127.0.0.1:${port}, memory ${memory}, cpus ${cpus})\n` +
    `devices file: ${devicesPath}\n` +
    `execute on it: node dist/cli/main.js experiment worker --data-dir ${path.resolve(dataDir)} --device ${deviceId} --max-jobs 1\n` +
    `teardown:     docker rm -f ${container}\n`,
  );
  process.exit(0);
} catch (e) {
  process.stderr.write(`bring-up failed: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
}
