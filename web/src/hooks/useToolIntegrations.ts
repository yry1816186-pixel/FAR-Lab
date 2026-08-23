import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/client';
import {
  createToolIntegration, deleteToolIntegration, listToolIntegrations, testToolIntegration, updateToolIntegration,
} from '../api/endpoints';
import type { ToolIntegrationView, ToolTestRecord } from '../api/types';

/**
 * Tool-integration management state (settings panel): list reload, CRUD,
 * enable/disable toggle, and the one-shot MCP connectivity probe. Mutations
 * throw to the caller and reload the list on success — the panel always shows
 * the authoritative server projection (masked secrets only).
 */
export function useToolIntegrations(): {
  integrations: ToolIntegrationView[];
  loading: boolean;
  error: ApiError | null;
  reload: () => Promise<void>;
  saving: boolean;
  create: (input: Record<string, unknown>) => Promise<void>;
  update: (id: string, input: Record<string, unknown>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  testingId: string | null;
  test: (id: string) => Promise<ToolTestRecord>;
} {
  const [integrations, setIntegrations] = useState<ToolIntegrationView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      setIntegrations(await listToolIntegrations(controller.signal));
      setError(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setError(e instanceof ApiError ? e : new ApiError({ code: 'tools_unexpected', message: String(e) }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => abortRef.current?.abort();
  }, [reload]);

  const create = useCallback(async (input: Record<string, unknown>): Promise<void> => {
    setSaving(true);
    try {
      await createToolIntegration(input);
      await reload();
    } finally {
      setSaving(false);
    }
  }, [reload]);

  const update = useCallback(async (id: string, input: Record<string, unknown>): Promise<void> => {
    setSaving(true);
    try {
      await updateToolIntegration(id, input);
      await reload();
    } finally {
      setSaving(false);
    }
  }, [reload]);

  const remove = useCallback(async (id: string): Promise<void> => {
    setSaving(true);
    try {
      await deleteToolIntegration(id);
      await reload();
    } finally {
      setSaving(false);
    }
  }, [reload]);

  const test = useCallback(async (id: string): Promise<ToolTestRecord> => {
    setTestingId(id);
    try {
      const record = await testToolIntegration(id);
      await reload();
      return record;
    } finally {
      setTestingId(null);
    }
  }, [reload]);

  return { integrations, loading, error, reload, saving, create, update, remove, testingId, test };
}
