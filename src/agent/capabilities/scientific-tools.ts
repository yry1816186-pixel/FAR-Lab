import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Store } from '../../persistence/store.js';
import type { ArtifactStore } from '../../shared/ports.js';
import { newId } from '../../domain/ids.js';
import { ProvenanceReceipt } from '../../domain/provenance.js';
import { ScientificComputeRequest } from '../../domain/scientific-compute.js';
import { listScientificCapabilities, scientificCapabilityCatalog } from '../../domain/scientific-registry.js';
import { executeScientificCompute } from '../../experiment/scientific-compute.js';
import type { ToolContext } from '../tool.js';

export interface ScientificToolDeps {
  store: Store;
  runId: string;
  artifacts: ArtifactStore;
}

const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const json = (value: unknown): string => JSON.stringify(value);
const abortError = (): Error => Object.assign(new Error('scientific computation aborted by caller'), { name: 'AbortError' });

const b64 = /^[A-Za-z0-9+/]*={0,2}$/;
const decodeBinary = (value: string): Uint8Array => {
  if (value.length === 0 || value.length % 4 !== 0 || !b64.test(value)) throw new Error('sidecar returned invalid base64 artifact');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) throw new Error('sidecar returned non-canonical base64 artifact');
  return bytes;
};

type ArtifactRef = { ref: string; hash: string; size: number; format?: string };

const persistBinaryArtifacts = async (result: Record<string, unknown>, artifacts: ArtifactStore, signal?: ToolContext['signal']): Promise<{ sanitized: Record<string, unknown>; refs: ArtifactRef[] }> => {
  const sanitized: Record<string, unknown> = { ...result };
  const refs: ArtifactRef[] = [];

  const putChecked = async (bytes: Uint8Array, format: string, expectedBytes?: number, expectedHash?: string): Promise<ArtifactRef> => {
    if (signal?.aborted) throw abortError();
    const actualHash = sha256(bytes);
    if (expectedBytes !== undefined && expectedBytes !== bytes.byteLength) throw new Error(`${format} artifact byte count mismatch`);
    if (expectedHash !== undefined && expectedHash !== actualHash) throw new Error(`${format} artifact sha256 mismatch`);
    const put = await artifacts.put(bytes);
    if (signal?.aborted) throw abortError();
    if (put.hash !== actualHash || put.size !== bytes.byteLength) throw new Error(`${format} artifact store integrity mismatch`);
    return { ...put, format };
  };

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === 'string' && (key === 'contentBase64' || key === 'checkpointBase64')) {
      const bytes = decodeBinary(value);
      const format = key === 'checkpointBase64' ? 'checkpoint' : String(result.format ?? result.mimeType ?? 'binary');
      const ref = await putChecked(bytes, format, Number(result[key === 'checkpointBase64' ? 'checkpointBytes' : 'bytes']) || undefined, String(result[key === 'checkpointBase64' ? 'checkpointSha256' : 'sha256'] ?? '') || undefined);
      sanitized[`${key.slice(0, -6)}Ref`] = ref.ref;
      delete sanitized[key];
      refs.push(ref);
    }
  }

  if (typeof result.svg === 'string') {
    const bytes = Buffer.from(result.svg, 'utf8');
    const ref = await putChecked(bytes, 'svg', Number(result.bytes) || undefined, typeof result.sha256 === 'string' ? result.sha256 : undefined);
    sanitized.svgRef = ref.ref;
    delete sanitized.svg;
    refs.push(ref);
  }
  return { sanitized, refs };
};

export const scientific_operations = {
  name: 'scientific_operations',
  description: 'Discover registered scientific operations, their libraries, runtime surfaces, provenance, limits and validation evidence.',
  inputSchema: z.object({
    family: z.string().min(1).optional(),
    surface: z.enum(['api', 'sidecar', 'experiment']).optional(),
    status: z.enum(['implemented', 'partial', 'blocked', 'unverified', 'verified']).optional(),
    provenance: z.enum(['COMPUTED', 'CANDIDATE']).optional(),
  }),
  riskClass: 'read' as const,
};

export const scientific_compute = {
  name: 'scientific_compute',
  description: 'Execute a registered scientific operation in the pinned Python sidecar and return measured summaries plus content-addressed artifact refs.',
  inputSchema: ScientificComputeRequest,
  riskClass: 'execute' as const,
};

export const wireScientificTools = (deps: ScientificToolDeps): Array<{
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  riskClass: 'read' | 'execute';
  summarize?: (payload: unknown) => string;
  execute: (args: unknown, ctx?: Pick<ToolContext, 'signal'>) => Promise<{ ok: boolean; data?: unknown; summary?: string; error?: string }>;
}> => [
  {
    name: scientific_operations.name,
    description: scientific_operations.description,
    inputSchema: scientific_operations.inputSchema,
    riskClass: 'read',
    summarize: (payload) => `${(payload as { operations?: unknown[] })?.operations?.length ?? 0} scientific operations`,
    async execute(args) {
      try {
        const parsed = scientific_operations.inputSchema.parse(args);
        const catalog = scientificCapabilityCatalog();
        const operations = listScientificCapabilities(parsed).map((entry) => entry.operation);
        return { ok: true, data: { ...catalog, capabilities: listScientificCapabilities(parsed), operations }, summary: `${operations.length} scientific operations` };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  },
  {
    name: scientific_compute.name,
    description: scientific_compute.description,
    inputSchema: scientific_compute.inputSchema,
    riskClass: 'execute',
    summarize: (payload) => {
      const p = payload as { operation?: string; refs?: unknown[] };
      return `${p.operation ?? 'scientific operation'} completed${Array.isArray(p.refs) && p.refs.length > 0 ? ` with ${p.refs.length} artifact refs` : ''}`;
    },
    async execute(args, ctx) {
      try {
        if (ctx?.signal.aborted) throw abortError();
        const request = ScientificComputeRequest.parse(args);
        const inputPayload = json(request.input);
        const inputArtifact = await deps.artifacts.put(inputPayload);
        if (ctx?.signal.aborted) throw abortError();
        const startedAt = Date.now();
        const raw = await executeScientificCompute(request, { signal: ctx?.signal });
        if (ctx?.signal.aborted) throw abortError();
        const { sanitized, refs } = await persistBinaryArtifacts(raw, deps.artifacts, ctx?.signal);
        if (ctx?.signal.aborted) throw abortError();
        const resultPayload = json(sanitized);
        const resultArtifact = await deps.artifacts.put(resultPayload);
        if (ctx?.signal.aborted) throw abortError();
        const outputHash = sha256(resultPayload);
        const receipt = ProvenanceReceipt.parse({
          id: newId('rcp'), runId: deps.runId, kind: 'tool_exec', executionMode: 'live', at: new Date().toISOString(),
          toolExec: { tool: request.operation, inputHash: inputArtifact.hash, outputHash, durationMs: Date.now() - startedAt },
          stage: 'agent:scientific_compute',
          environmentFingerprint: typeof raw.runtime === 'object' && raw.runtime !== null ? JSON.stringify(raw.runtime) : undefined,
          redactionNote: 'raw scientific input/result retained as content-addressed artifacts; binary payloads returned by reference',
        });
        deps.store.putObject('receipt', receipt);
        deps.store.appendEvent(deps.runId, {
          type: 'receipt_recorded', stage: 'agent:scientific_compute', receiptId: receipt.id,
          detail: { operation: request.operation, inputRef: inputArtifact.ref, resultRef: resultArtifact.ref, refs: refs.map((ref) => ({ ref: ref.ref, hash: ref.hash, size: ref.size, format: ref.format })), runtime: raw.runtime ?? null },
        });
        return {
          ok: true,
          data: { operation: request.operation, result: sanitized, refs: [{ ref: inputArtifact.ref, kind: 'input', hash: inputArtifact.hash, size: inputArtifact.size }, { ref: resultArtifact.ref, kind: 'result', hash: resultArtifact.hash, size: resultArtifact.size }, ...refs.map((ref) => ({ ref: ref.ref, kind: ref.format ?? 'binary', hash: ref.hash, size: ref.size }))], runtime: raw.runtime ?? null },
          summary: `${request.operation} completed${refs.length > 0 ? ` with ${refs.length} artifact refs` : ''}`,
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
  },
];
