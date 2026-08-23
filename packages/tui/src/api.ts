/** Typed HTTP access to the FAR-Lab /api/v1 contract (read-only TUI v1). */
export const BASE_URL = process.env.FAR_URL ?? 'http://127.0.0.1:3196/api/v1';

export interface RunSummary {
  id: string;
  status: string;
  currentStage: string;
  createdAt: string;
  questionText?: string;
  domain?: string;
}

export interface RunEvent {
  seq: number;
  at: string;
  type: string;
  stage?: string;
  detail?: Record<string, unknown>;
}

export async function listRuns(signal?: AbortSignal): Promise<RunSummary[]> {
  const res = await fetch(`${BASE_URL}/runs`, { signal });
  if (!res.ok) throw new Error(`GET /runs → ${res.status}`);
  const data = (await res.json()) as { runs?: RunSummary[] } | RunSummary[];
  return Array.isArray(data) ? data : (data.runs ?? []);
}

export async function getRun(runId: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE_URL}/runs/${encodeURIComponent(runId)}`, { signal });
  if (!res.ok) throw new Error(`GET /runs/${runId} → ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

export async function getEvents(runId: string, signal?: AbortSignal): Promise<RunEvent[]> {
  const res = await fetch(`${BASE_URL}/runs/${encodeURIComponent(runId)}/events?afterSeq=0`, { signal });
  if (!res.ok) throw new Error(`GET /events → ${res.status}`);
  const data = (await res.json()) as { events?: RunEvent[] } | RunEvent[];
  return Array.isArray(data) ? data : (data.events ?? []);
}
