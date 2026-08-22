import { useState } from 'react';
import { ApiError, withTimeout } from '../api/client';
import { createRun } from '../api/endpoints';
import type { ScientificGoalType } from '../api/types';

/**
 * Run-creation state machine shared by every creation surface (the welcome
 * hero input today). Extracted verbatim from the former sidebar NewRunForm:
 * same validation, same 20s timeout guard, same error envelope.
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
  showValidationError: boolean;
  submitting: boolean;
  error: ApiError | null;
  submit: (ev: React.FormEvent) => Promise<void>;
} {
  const [text, setText] = useState('');
  const [domain, setDomain] = useState('');
  const [goalType, setGoalType] = useState('');
  const [providerConfigId, setProviderConfigId] = useState('');
  const [showValidationError, setShowValidationError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const submit = async (ev: React.FormEvent): Promise<void> => {
    ev.preventDefault();
    setError(null);
    if (text.trim().length === 0) {
      setShowValidationError(true);
      return;
    }
    setShowValidationError(false);
    setSubmitting(true);
    const controller = new AbortController();
    try {
      const input: { text: string; domain?: string; goalType?: ScientificGoalType; providerConfigId?: string } = { text: text.trim() };
      if (domain.trim().length > 0) input.domain = domain.trim();
      if (goalType !== '') input.goalType = goalType as ScientificGoalType;
      if (providerConfigId !== '') input.providerConfigId = providerConfigId;
      const runId = await createRun(input, withTimeout(controller.signal, 20_000));
      setText('');
      setDomain('');
      setGoalType('');
      setProviderConfigId('');
      onCreated(runId);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError(new ApiError({ code: 'timeout', message: '请求超时（20s）— run 创建请求无响应', retryable: true, i18nKey: 'err.timeout', i18nVars: { seconds: 20 } }));
      } else {
        setError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return { text, setText, domain, setDomain, goalType, setGoalType, providerConfigId, setProviderConfigId, showValidationError, submitting, error, submit };
}
