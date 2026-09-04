import type { SSHGateway } from './gateway.js';
import type { DeviceRegistry } from './devices.js';
import { SlurmTransport } from './slurm-transport.js';

/**
 * Device-kind gateway resolution (FA-REM-04 wiring): ssh devices get the plain
 * gateway; slurm devices get the batch transport over the same SSH boundary
 * (sbatch/squeue/scancel behind the Pick<SSHGateway,'probe'|'exec'|'putFile'>
 * seam the remote executor already consumes).
 */
export const gatewayForDevice = (
  registry: DeviceRegistry,
  device: string,
  shouldCancel: () => boolean = () => false,
): Pick<SSHGateway, 'probe' | 'exec' | 'putFile'> => {
  const opts = registry.slurmOptionsFor(device);
  if (opts === null) return registry.gatewayFor(device);
  return SlurmTransport.overSsh(registry.gatewayFor(device), opts, shouldCancel);
};
