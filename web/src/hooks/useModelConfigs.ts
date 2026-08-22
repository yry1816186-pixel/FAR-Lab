import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import {
  createModelConfig, deleteModelConfig, listModelConfigs, setActiveModelConfig, testModelConfig, updateModelConfig,
} from '../api/endpoints';
import type {
  EnvDefaultInfo, ModelConfigInput, ModelConfigSummary, ModelConfigTestInput, ModelConfigTestResult,
} from '../api/types';

/**
 * Model-config management state (settings panel + run form): list reload, CRUD,
 * active-default switching and the one-shot connectivity probe. Mutations throw to
 * the caller (the panel shows the error) and reload the list on success so every
 * consumer sees the authoritative server projection (masked keys only — the
 * plaintext key never crosses the wire back).
 */
export function useModelConfigs(): {
  configs: ModelConfigSummary[];
  activeId: string | null;
  envDefault: EnvDefaultInfo | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => Promise<void>;
  saving: boolean;
  create: (input: ModelConfigInput) => Promise<void>;
  update: (id: string, input: Omit<ModelConfigInput, 'apiKey'> & { apiKey?: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  setActive: (id: string | null) => Promise<void>;
  testing: boolean;
  test: (input: ModelConfigTestInput) => Promise<ModelConfigTestResult>;
} {
  const [configs, setConfigs] = useState<ModelConfigSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [envDefault, setEnvDefault] = useState<EnvDefaultInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await listModelConfigs(controller.signal);
      setConfigs(res.configs);
      setActiveId(res.activeModelConfigId);
      setEnvDefault(res.envDefault);
      setError(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => abortRef.current?.abort();
  }, [reload]);

  /** saving-state guard around mutations; errors propagate to the caller after reload. */
  const mutate = useCallback(async (fn: () => Promise<void>): Promise<void> => {
    setSaving(true);
    try {
      await fn();
      await reload();
    } finally {
      setSaving(false);
    }
  }, [reload]);

  const create = useCallback((input: ModelConfigInput): Promise<void> =>
    mutate(async () => { await createModelConfig(input); }), [mutate]);

  const update = useCallback((id: string, input: Omit<ModelConfigInput, 'apiKey'> & { apiKey?: string }): Promise<void> =>
    mutate(async () => { await updateModelConfig(id, input); }), [mutate]);

  const remove = useCallback((id: string): Promise<void> =>
    mutate(async () => { await deleteModelConfig(id); }), [mutate]);

  const setActive = useCallback((id: string | null): Promise<void> =>
    mutate(async () => { await setActiveModelConfig(id); }), [mutate]);

  const test = useCallback(async (input: ModelConfigTestInput): Promise<ModelConfigTestResult> => {
    setTesting(true);
    try {
      return await testModelConfig(input);
    } catch (e) {
      if (e instanceof ApiError) return { ok: false, modelId: input.modelId, latencyMs: 0, error: { kind: e.code, message: e.message, retryable: e.retryable } };
      return { ok: false, modelId: input.modelId, latencyMs: 0, error: { kind: 'unknown', message: String(e), retryable: true } };
    } finally {
      setTesting(false);
    }
  }, []);

  return {
    configs, activeId, envDefault, loading, error, reload,
    saving, create, update, remove, setActive,
    testing, test,
  };
}
