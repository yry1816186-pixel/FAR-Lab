import { useState } from 'react';
import { ApiError, withTimeout } from '../api/client';
import { createRun } from '../api/endpoints';
import type { ScientificGoalType } from '../api/types';
import { MAX_SEEDS, type SeedInput } from '../utils/ingest';

/**
 * Run-creation state machine shared by every creation surface (the welcome
 * hero input today). Extracted verbatim from the former sidebar NewRunForm:
 * same validation, same 20s timeout guard, same error envelope.
 * R1: carries optional SEEDS (user-provided sources: PDF text / parsed
 * citations / Zotero picks) into POST /runs — provenance lands in the corpus.
 * HX §8.2: submitDraft creates a DRAFT run (persisted, NOT started) — same
 * validation and seed carrying, no navigation, no form reset; the scope-review
 * journey in NewResearch owns what happens next.
 */
export function useCreateRun(onCreated: (runId: string) => void): {
  text: string;
  setText: (v: string) => void;
  domain: string;
  setDomain: (v: string) => void;
  goalType: string;
  setGoalType: (v: string) => void;
  providerConfigId: string;
  setProviderConfigId: (v: string) => void;
  seeds: SeedInput[];
  setSeeds: (v: SeedInput[]) => void;
  showValidationError: boolean;
  submitting: boolean;
  error: ApiError | null;
  submit: (ev: React.FormEvent) => Promise<void>;
  submitDraft: (ev?: React.FormEvent) => Promise<string | null>;
} {
  const [text, setText] = useState(() => {
    // Prefill from #lab/new?q=... (spine rerun affordance): the researcher's
    // question rides the hash so a template-run rerun starts pre-loaded.
    const m = /(?:^|[?&])q=([^&]+)/.exec(window.location.hash);
    const raw = m?.[1];
    try {
      return raw !== undefined ? decodeURIComponent(raw.replace(/\+/g, ' ')) : '';
    } catch {
      return '';
    }
  });
  const [domain, setDomain] = useState('');
  const [goalType, setGoalType] = useState('');
  const [providerConfigId, setProviderConfigId] = useState('');
  const [seeds, setSeeds] = useState<SeedInput[]>([]);
  const [showValidationError, setShowValidationError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  /** Shared request-body builder + validation + timeout error mapping. */
  const draftInput = (): { text: string; domain?: string; goalType?: ScientificGoalType; providerConfigId?: string; seeds?: SeedInput[] } | ApiError => {
    if (text.trim().length === 0) {
      setShowValidationError(true);
      return new ApiError({ code: 'validation', message: '请先写下研究问题', retryable: false, i18nKey: 'newresearch.needQuestion' });
    }
    setShowValidationError(false);
    const input: { text: string; domain?: string; goalType?: ScientificGoalType; providerConfigId?: string; seeds?: SeedInput[] } = { text: text.trim() };
    if (domain.trim().length > 0) input.domain = domain.trim();
    if (goalType !== '') input.goalType = goalType as ScientificGoalType;
    if (providerConfigId !== '') input.providerConfigId = providerConfigId;
    if (seeds.length > 0) input.seeds = seeds.slice(0, MAX_SEEDS);
    return input;
  };

  const toApiError = (e: unknown): ApiError => {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return new ApiError({ code: 'timeout', message: '请求超时（20s）— run 创建请求无响应', retryable: true, i18nKey: 'err.timeout', i18nVars: { seconds: 20 } });
    }
    return e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true });
  };

  const submitDraft = async (ev?: React.FormEvent): Promise<string | null> => {
    ev?.preventDefault();
    setError(null);
    const input = draftInput();
    if (input instanceof ApiError) {
      setError(input);
      return null;
    }
    setSubmitting(true);
    const controller = new AbortController();
    try {
      // Scope refinement is a real model call on the offline/live route: the
      // proposal can legitimately take longer than a plain 202 create.
      return await createRun({ ...input, draft: true }, withTimeout(controller.signal, 30_000));
    } catch (e) {
      setError(toApiError(e));
      return null;
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (ev: React.FormEvent): Promise<void> => {
    ev.preventDefault();
    setError(null);
    const input = draftInput();
    if (input instanceof ApiError) {
      setError(input);
      return;
    }
    setSubmitting(true);
    const controller = new AbortController();
    try {
      const runId = await createRun(input, withTimeout(controller.signal, 20_000));
      setText('');
      setDomain('');
      setGoalType('');
      setProviderConfigId('');
      setSeeds([]);
      onCreated(runId);
    } catch (e) {
      setError(toApiError(e));
    } finally {
      setSubmitting(false);
    }
  };

  return { text, setText, domain, setDomain, goalType, setGoalType, providerConfigId, setProviderConfigId, seeds, setSeeds, showValidationError, submitting, error, submit, submitDraft };
}
