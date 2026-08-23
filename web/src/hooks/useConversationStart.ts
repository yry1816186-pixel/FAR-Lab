import { useState } from 'react';
import { ApiError, withTimeout } from '../api/client';
import { createConversation, deleteConversation, getConversation, postConversationMessage } from '../api/endpoints';
import { MAX_SEEDS, type SeedInput } from '../utils/ingest';

/**
 * Conversation-start state machine for the home composer (conversation-first
 * flow): the first message + materials OPEN a brainstorming dialogue instead
 * of launching the pipeline. Crystallizing a question into a run happens
 * inside the conversation, never here.
 */
export function useConversationStart(onStarted: (conversationId: string) => void): {
  text: string;
  setText: (v: string) => void;
  providerConfigId: string;
  setProviderConfigId: (v: string) => void;
  seeds: SeedInput[];
  setSeeds: (v: SeedInput[]) => void;
  showValidationError: boolean;
  submitting: boolean;
  error: ApiError | null;
  startConversation: () => Promise<void>;
} {
  const [text, setText] = useState('');
  const [providerConfigId, setProviderConfigId] = useState('');
  const [seeds, setSeeds] = useState<SeedInput[]>([]);
  const [showValidationError, setShowValidationError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const startConversation = async (): Promise<void> => {
    setError(null);
    if (text.trim().length === 0) {
      setShowValidationError(true);
      return;
    }
    setShowValidationError(false);
    setSubmitting(true);
    const controller = new AbortController();
    try {
      // the model turn can take a while — 60s guard, not the 20s run-creation one
      const conv = await createConversation(
        providerConfigId !== '' ? { providerConfigId } : {},
        withTimeout(controller.signal, 60_000),
      );
      try {
        await postConversationMessage(
          conv.id,
          { text: text.trim(), ...(seeds.length > 0 ? { seeds: seeds.slice(0, MAX_SEEDS) } : {}) },
          withTimeout(controller.signal, 60_000),
        );
      } catch (postError) {
        // The server persists the researcher message BEFORE the model runs: a
        // model failure leaves a visible, retryable turn INSIDE the conversation.
        // Anything that left the conversation empty is a disposable shell —
        // delete it so the sidebar never accumulates 空壳 records.
        let persisted = false;
        try {
          const current = await getConversation(conv.id);
          persisted = current.messages.length > 0;
          if (!persisted) await deleteConversation(conv.id);
        } catch {
          // unknown server state: keep the shell rather than risk deleting real words
        }
        if (persisted) {
          setText('');
          setProviderConfigId('');
          setSeeds([]);
          onStarted(conv.id); // the failed turn (with its retry control) is in there
          return;
        }
        throw postError;
      }
      setText('');
      setProviderConfigId('');
      setSeeds([]);
      onStarted(conv.id);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        setError(new ApiError({ code: 'timeout', message: '请求超时（60s）— 模型无响应，请重试', retryable: true, i18nKey: 'err.timeout', i18nVars: { seconds: 60 } }));
      } else {
        setError(e instanceof ApiError ? e : new ApiError({ code: 'unknown', message: String(e), retryable: true }));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return {
    text, setText, providerConfigId, setProviderConfigId, seeds, setSeeds,
    showValidationError, submitting, error, startConversation,
  };
}
