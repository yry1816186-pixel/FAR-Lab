import { z } from 'zod';
import { createSidecar, type Sidecar } from './python.js';
import { ScientificComputeRequest, type ScientificComputeRequest as ScientificComputeRequestType } from '../domain/scientific-compute.js';

/** Production bridge for scientific primitives. Numeric work executes in the
 * pinned SciPy sidecar; this function only validates, transports and returns
 * the sidecar's measured payload. */
export const executeScientificCompute = async (
  request: ScientificComputeRequestType,
  opts: {
    sidecar?: () => Sidecar;
    timeoutMs?: number;
    signal?: Pick<AbortSignal, 'aborted'> & Partial<Pick<AbortSignal, 'addEventListener' | 'removeEventListener'>>;
  } = {},
): Promise<Record<string, unknown>> => {
  const parsed = ScientificComputeRequest.parse(request);
  // Budget sized to the measured real cold start: every request spawns a fresh
  // `uv run --frozen` sidecar whose startup (env check + interpreter import of
  // the scientific stack) measured 23.4-25.7s on hosted windows/macos and >30s
  // under ubuntu suite load (CI run 34042315989 red: a healthy cold start came
  // back as a bogus 400). 120s matches the dataset-netcdf sidecar convention
  // and leaves ~4x margin over the worst observed cold start.
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const signal = opts.signal;
  const abortError = (): Error => Object.assign(new Error('scientific computation aborted by caller'), { name: 'AbortError' });
  const assertActive = (): void => { if (signal?.aborted) throw abortError(); };
  assertActive();
  const sidecar = (opts.sidecar ?? (() => createSidecar()))();
  let onAbort: (() => void) | undefined;
  let abortPoll: ReturnType<typeof setInterval> | undefined;
  try {
    assertActive();
    const abort = signal === undefined ? undefined : new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(abortError());
      if (signal.addEventListener !== undefined && signal.removeEventListener !== undefined) {
        signal.addEventListener('abort', onAbort, { once: true });
      } else {
        abortPoll = setInterval(() => { if (signal.aborted) onAbort?.(); }, 25);
        abortPoll.unref();
      }
      if (signal.aborted) onAbort();
    });
    const computation = (async () => {
      assertActive();
      const environment = await sidecar.warmup(timeoutMs);
      assertActive();
      const result = await sidecar.call<Record<string, unknown>>(parsed.operation, parsed.input, timeoutMs);
      assertActive();
      if (!result.ok || result.result === undefined) throw new Error(result.error?.message ?? `${parsed.operation} returned no result`);
      // Runtime identity is part of the scientific receipt. Consumers can
      // reproduce the exact library family instead of treating COMPUTED as a
      // claim detached from its execution environment.
      return {
        ...result.result,
        runtime: {
          pythonVersion: environment.pythonVersion,
          versions: environment.versions,
          ...(environment.hardware !== undefined ? { hardware: environment.hardware } : {}),
          lockfileHash: sidecar.lockfileHash(),
        },
      };
    })();
    const result = await (abort === undefined ? computation : Promise.race([computation, abort]));
    assertActive();
    return result;
  } finally {
    if (onAbort !== undefined) signal?.removeEventListener?.('abort', onAbort);
    if (abortPoll !== undefined) clearInterval(abortPoll);
    sidecar.close();
  }
};

export const ScientificComputeResult = z.record(z.unknown());
