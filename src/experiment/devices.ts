import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { SSHGateway } from './gateway.js';

/**
 * Device registry (P3, D-084): operator-declared execution targets in
 * .far-run/devices.json (gitignored local ops config — never a repo secret store).
 * `local` is always present; SSH targets are real boundaries (key-only auth, pinned
 * host keys). Workers bind to ONE device; jobs carry the device they were queued for.
 */

export const SshDeviceConfig = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'device id: lowercase alnum/dash'),
  kind: z.literal('ssh'),
  host: z.string().min(1),
  port: z.number().int().positive(),
  user: z.string().min(1),
  identityFile: z.string().min(1),
  knownHostsFile: z.string().min(1),
});
export type SshDeviceConfig = z.infer<typeof SshDeviceConfig>;

/**
 * FA-REM-04: a Slurm cluster reached through the same SSH boundary as kind=ssh,
 * with cell production submitted as batch jobs (sbatch/squeue/scancel) instead of
 * interactive exec. Batch options ride the device declaration.
 */
export const SlurmDeviceConfig = SshDeviceConfig.extend({
  kind: z.literal('slurm'),
  partition: z.string().min(1).optional(),
  account: z.string().min(1).optional(),
  timeLimit: z.string().regex(/^\d{1,2}(:\d{2}){0,2}$/).optional(),
});
export type SlurmDeviceConfig = z.infer<typeof SlurmDeviceConfig>;

export const DevicesFile = z.object({
  devices: z.array(z.union([
    z.object({ id: z.literal('local'), kind: z.literal('local') }),
    SshDeviceConfig,
    SlurmDeviceConfig,
  ])).min(1),
});
export type DevicesFile = z.infer<typeof DevicesFile>;

export interface DeviceRegistry {
  ids(): string[];
  isLocal(id: string): boolean;
  /** SSH gateway for a declared remote device (fails loudly for local/unknown). */
  gatewayFor(id: string): SSHGateway;
  /** Batch options for kind=slurm devices (null for local/ssh/unknown). */
  slurmOptionsFor(id: string): { partition?: string; account?: string; timeLimit?: string } | null;
}

export const openDeviceRegistry = (configPath: string): DeviceRegistry => {
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    return {
      ids: () => ['local'],
      isLocal: (id) => id === 'local',
      gatewayFor: (id) => { throw new Error(`device '${id}' not declared (no devices file at ${resolved}; only 'local' available)`); },
      slurmOptionsFor: () => null,
    };
  }
  const parsed = DevicesFile.parse(JSON.parse(fs.readFileSync(resolved, 'utf8')));
  const ids = parsed.devices.map((d) => d.id);
  if (new Set(ids).size !== ids.length) throw new Error(`duplicate device ids in ${resolved}`);
  if (!ids.includes('local')) throw new Error(`devices file must keep the built-in 'local' device (${resolved})`);
  const ssh = new Map(parsed.devices.filter((d): d is SshDeviceConfig => d.kind === 'ssh').map((d) => [d.id, d]));
  const slurm = new Map(parsed.devices.filter((d): d is SlurmDeviceConfig => d.kind === 'slurm').map((d) => [d.id, d]));
  return {
    ids: () => [...ids],
    isLocal: (id) => id === 'local',
    gatewayFor: (id) => {
      const cfg = ssh.get(id) ?? slurm.get(id);
      if (cfg === undefined) throw new Error(`device '${id}' is not an ssh/slurm device (known: ${[...ssh.keys(), ...slurm.keys()].join(', ') || 'none'})`);
      return new SSHGateway({ host: cfg.host, port: cfg.port, user: cfg.user, identityFile: cfg.identityFile, knownHostsFile: cfg.knownHostsFile });
    },
    slurmOptionsFor: (id) => slurm.get(id) === undefined ? null : {
      ...(slurm.get(id)!.partition !== undefined ? { partition: slurm.get(id)!.partition } : {}),
      ...(slurm.get(id)!.account !== undefined ? { account: slurm.get(id)!.account } : {}),
      ...(slurm.get(id)!.timeLimit !== undefined ? { timeLimit: slurm.get(id)!.timeLimit } : {}),
    },
  };
};
