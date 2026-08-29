import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, BookMarked, Brain, BrainCircuit, Check, Clock, Copy, Link2, Loader2, Paperclip, RotateCcw, Wrench, X, Zap } from 'lucide-react';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import { AttachIcon, DISPLAY_KIND, type AttachKind } from './common';
import { formatBytes } from '../lab/SeedTray';
import { MarkdownDoc } from './detail/MarkdownDoc';
import { ZoteroPanel } from './ZoteroPanel';
import { DictationButton } from './DictationButton';
import { insertAtCaret } from '../dictation/audio';
import {
  deleteAutomation, getConversation, getConversationReasoning, launchFromConversation,
  listConversationAutomations, postConversationMessage, resolveConversationProposal,
  retryConversationTurn, setAutomationEnabled, setConversationReasoningGear,
  type ConversationReasoningInfo,
} from '../api/endpoints';
import { useToolCommands } from '../hooks/useToolCommands';
import type { Automation, Conversation, ConversationMessage, ConversationProposal, ZoteroLibItem } from '../api/types';
import {
  detectFileKind, detectPasteKind, extractFileText, parseCitationEntries, extractIdentifiers,
  readTextFile, MAX_BINARY_BYTES, MAX_SEEDS, type SeedInput,
} from '../utils/ingest';

/**
 * Conversation view (resident-agent flow): the dialogue where the researcher
 * and the resident agent discuss the whole workspace — brainstorming before a
 * run, inspecting it after, proposing actions that render as approval cards
 * (reads free, actions gated), with approved automations manageable inline.
 */

interface Attachment {
  id: number;
  seed: SeedInput;
  kind: AttachKind;
  status: 'parsing' | 'ready' | 'failed';
  errorKey?: DictKey;
  sizeBytes?: number;
  /** Projection hit the 50k-char ceiling — shown honestly on the card. */
  truncated?: boolean;
  retry?: () => Promise<void>;
}

let attachSeq = 0;

export function ConversationView({
  conversationId,
  onOpenedRun,
  onMutated,
}: {
  conversationId: string;
  /** Navigate to a run launched from this conversation. */
  onOpenedRun: (runId: string) => void;
  /** Sidebar list refresh trigger (conversation list changed). */
  onMutated: () => void;
}): JSX.Element {
  const { t } = useI18n();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  // ---- failed-turn retry: re-running the agent reply for the dangling message ----
  const [retrying, setRetrying] = useState(false);
  const [launching, setLaunching] = useState<string | null>(null); // candidate id or 'custom'
  // ---- reasoning gear: capability view of the resolved route + current override ----
  const [reasoning, setReasoning] = useState<ConversationReasoningInfo | null>(null);
  const [gearBusy, setGearBusy] = useState(false);
  useEffect(() => {
    setReasoning(null);
    const controller = new AbortController();
    getConversationReasoning(conversationId, controller.signal).then(setReasoning).catch(() => { /* unsupported or fetch failed: control stays hidden */ });
    return () => controller.abort();
  }, [conversationId]);

  const changeGear = async (gear: 'low' | 'medium' | 'high' | null): Promise<void> => {
    if (gearBusy) return;
    setGearBusy(true);
    try {
      await setConversationReasoningGear(conversationId, gear);
      const next = await getConversationReasoning(conversationId);
      setReasoning(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGearBusy(false);
    }
  };

  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<number | null>(null);
  const flashNote = (msg: string): void => {
    setNote(msg);
    if (noteTimer.current !== null) window.clearTimeout(noteTimer.current);
    noteTimer.current = window.setTimeout(() => setNote(null), 4000);
  };

  // ---- attachments (same ingest machine as the home composer) ----
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkInput, setLinkInput] = useState('');
  const [zoteroOpen, setZoteroOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // ---- TIS user commands: palette inserts (DOM event) + composer slash-menu ----
  const { commands: userCommands } = useToolCommands();
  useEffect(() => {
    const onInsert = (e: Event): void => {
      const detail = (e as CustomEvent<{ text?: unknown }>).detail;
      if (typeof detail?.text !== 'string' || detail.text.length === 0) return;
      setText((prev) => (prev.trim().length > 0 ? `${prev}\n${detail.text}` : detail.text as string));
    };
    window.addEventListener('far:insert-text', onInsert);
    return () => window.removeEventListener('far:insert-text', onInsert);
  }, []);
  const slashMatches = useMemo(() => {
    const m = /^\/([a-z0-9-]*)$/.exec(text.trim());
    if (m === null) return [];
    return userCommands.filter((c) => c.name.startsWith(m[1] ?? '')).slice(0, 5);
  }, [text, userCommands]);

  const capReached = attachments.length >= MAX_SEEDS;
  const readySeeds = useMemo(
    (): SeedInput[] => attachments.filter((a) => a.status === 'ready').map((a) => a.seed).slice(0, MAX_SEEDS),
    [attachments],
  );

  const upsert = (id: number, patch: Partial<Attachment>): void => {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const flashCap = (): void => { flashNote(t('composer.capReached', { n: MAX_SEEDS })); };

  const addIdentifierCards = (found: { kind: 'doi' | 'arxiv' | 'url'; value: string }[]): number => {
    if (found.length === 0) return 0;
    if (capReached) { flashCap(); return 0; }
    const room = MAX_SEEDS - attachments.length;
    const kept = found.slice(0, room);
    if (found.length > room) flashCap();
    if (kept.length > 0) {
      const kindOf: Record<(typeof kept)[number]['kind'], AttachKind> = { doi: 'DOI', arxiv: 'arXiv', url: 'URL' };
      setAttachments((prev) => [...prev, ...kept.map((id) => ({
        id: ++attachSeq,
        kind: kindOf[id.kind],
        status: 'ready' as const,
        seed: { identifiers: [{ kind: id.kind, value: id.value }], title: id.kind === 'doi' ? `DOI ${id.value}` : id.kind === 'arxiv' ? `arXiv:${id.value}` : id.value.slice(0, 80) },
      }))]);
    }
    return kept.length;
  };

  const importCitationEntries = (entries: { title: string; year?: number; authors: string[]; doi?: string }[]): number => {
    const room = Math.max(0, MAX_SEEDS - attachments.length);
    const kept = entries.slice(0, room);
    if (entries.length > room) flashNote(t('composer.importTruncated', { kept: kept.length, total: entries.length, max: MAX_SEEDS }));
    if (kept.length === 0) return 0;
    setAttachments((prev) => [...prev, ...kept.map((entry) => ({
      id: ++attachSeq,
      kind: 'REF' as AttachKind,
      status: 'ready' as const,
      seed: {
        title: entry.title.length > 0 ? entry.title : t('ingest.untitled'),
        ...(entry.doi !== undefined ? { identifiers: [{ kind: 'doi' as const, value: entry.doi }] } : {}),
        ...(entry.year !== undefined ? { year: entry.year } : {}),
        ...(entry.authors.length > 0 ? { authors: entry.authors } : {}),
      },
    }))]);
    return kept.length;
  };

  const ingestFile = async (file: File): Promise<void> => {
    if (capReached) { flashCap(); return; }
    const kind = detectFileKind(file.name);
    if (kind === null) { flashNote(t('ingest.unsupported')); return; }
    const display: AttachKind = kind === 'odf' && /\.odp$/i.test(file.name) ? 'SLIDES' : DISPLAY_KIND[kind];
    const binary = kind !== 'text' && kind !== 'ref' && kind !== 'html' && kind !== 'json';
    const id = ++attachSeq;
    setAttachments((prev) => [...prev, { id, seed: { title: file.name }, kind: display, status: 'parsing', sizeBytes: file.size }]);
    const run = async (): Promise<void> => {
      upsert(id, { status: 'parsing', retry: () => run() });
      try {
        if (kind === 'ref') {
          const content = await readTextFile(file);
          const entries = content !== null ? await parseCitationEntries(content) : null;
          if (entries === null || entries.length === 0) { upsert(id, { status: 'failed', errorKey: 'ingest.citationFailed' }); return; }
          const room = Math.max(0, MAX_SEEDS - attachments.length - 1);
          const kept = entries.slice(0, room);
          if (entries.length > room) flashNote(t('composer.importTruncated', { kept: kept.length, total: entries.length, max: MAX_SEEDS }));
          setAttachments((prev) => [
            ...prev.filter((a) => a.id !== id),
            ...kept.map((entry) => ({
              id: ++attachSeq,
              kind: 'REF' as AttachKind,
              status: 'ready' as const,
              seed: {
                title: entry.title.length > 0 ? entry.title : file.name,
                ...(entry.doi !== undefined ? { identifiers: [{ kind: 'doi' as const, value: entry.doi }] } : {}),
                ...(entry.year !== undefined ? { year: entry.year } : {}),
                ...(entry.authors.length > 0 ? { authors: entry.authors } : {}),
              },
            })),
          ]);
          return;
        }
        if (binary && file.size > MAX_BINARY_BYTES) { upsert(id, { status: 'failed', errorKey: 'ingest.tooLarge' }); return; }
        if (kind === 'text') {
          if (file.size > 1_048_576) { upsert(id, { status: 'failed', errorKey: 'ingest.tooLarge' }); return; }
          const content = await readTextFile(file);
          if (content === null || content.trim().length === 0) { upsert(id, { status: 'failed', errorKey: 'ingest.extractFailed' }); return; }
          upsert(id, { status: 'ready', seed: { title: file.name, text: content } });
          return;
        }
        const extraction = await extractFileText(file, kind);
        if (extraction === null) {
          upsert(id, { status: 'failed', errorKey: kind === 'pdf' ? 'ingest.pdfFailed' : 'ingest.extractFailed' });
          return;
        }
        upsert(id, {
          status: 'ready',
          truncated: extraction.truncated,
          seed: { title: file.name.replace(/\.[^.]+$/, ''), text: extraction.text },
        });
      } catch {
        upsert(id, { status: 'failed', errorKey: 'ingest.extractFailed' });
      }
    };
    await run();
  };

  const submitLinks = (): void => {
    const { found, rest } = extractIdentifiers(linkInput);
    const added = addIdentifierCards(found);
    if (added > 0) {
      flashNote(t('composer.linksAdded', { n: added }) + (rest.length > 0 ? ` · ${t('composer.linksSkipped', { n: rest.length })}` : ''));
      setLinkInput(rest.join(' '));
    } else if (linkInput.trim().length > 0) {
      flashNote(t('composer.invalidLink'));
    }
  };

  const ingestDroppedText = async (dropped: string): Promise<void> => {
    const trimmed = dropped.trim();
    if (trimmed.length === 0) { flashNote(t('composer.invalidLink')); return; }
    const kind = detectPasteKind(trimmed);
    if (kind === 'bibtex' || kind === 'ris') {
      const entries = await parseCitationEntries(trimmed);
      if (entries !== null && entries.length > 0 && importCitationEntries(entries) > 0) return;
    }
    if (addIdentifierCards(extractIdentifiers(trimmed).found) === 0) flashNote(t('composer.invalidLink'));
  };

  const importZotero = (imported: ZoteroLibItem[]): void => {
    const room = MAX_SEEDS - attachments.length;
    if (imported.length > room) flashCap();
    const slice = imported.slice(0, Math.max(0, room));
    if (slice.length === 0) return;
    setAttachments((prev) => [...prev, ...slice.map((it) => ({
      id: ++attachSeq,
      kind: 'REF' as AttachKind,
      status: 'ready' as const,
      seed: {
        title: it.title,
        ...(it.doi !== undefined ? { identifiers: [{ kind: 'doi' as const, value: it.doi }] }
          : it.url !== undefined ? { identifiers: [{ kind: 'url' as const, value: it.url }] } : {}),
        ...(it.year !== undefined ? { year: it.year } : {}),
        ...(it.creators.length > 0 ? { authors: it.creators } : {}),
      },
    }))]);
  };

  // ---- conversation state ----
  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    getConversation(conversationId, controller.signal)
      .then(setConversation)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => controller.abort();
  }, [conversationId]);

  // ---- automations (resident agent R3): this conversation's standing tasks ----
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [automationBusy, setAutomationBusy] = useState<string | null>(null);
  const [resolvingProposal, setResolvingProposal] = useState<string | null>(null);
  const refreshAutomations = (signal?: AbortSignal): void => {
    listConversationAutomations(conversationId, signal)
      .then(setAutomations)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : String(e));
      });
  };
  useEffect(() => {
    const controller = new AbortController();
    listConversationAutomations(conversationId, controller.signal)
      .then(setAutomations)
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => controller.abort();
  }, [conversationId]);

  const resolveProposal = async (proposal: ConversationProposal, approve: boolean, remember: boolean): Promise<void> => {
    if (resolvingProposal !== null) return;
    setResolvingProposal(proposal.id);
    setError(null);
    try {
      const updated = await resolveConversationProposal(conversationId, proposal.id, { approve, remember });
      setConversation(updated);
      if (approve) onMutated(); // an executed launch changes runs/automations surfaces
      refreshAutomations();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setResolvingProposal(null);
    }
  };

  const toggleAutomation = async (automation: Automation): Promise<void> => {
    if (automationBusy !== null) return;
    setAutomationBusy(automation.id);
    try {
      const updated = await setAutomationEnabled(automation.id, !automation.enabled);
      setAutomations((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAutomationBusy(null);
    }
  };

  const removeAutomation = async (automation: Automation): Promise<void> => {
    if (automationBusy !== null) return;
    setAutomationBusy(automation.id);
    try {
      await deleteAutomation(automation.id);
      setAutomations((prev) => prev.filter((a) => a.id !== automation.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAutomationBusy(null);
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [conversation?.messages.length]);

  const send = async (): Promise<void> => {
    if (text.trim().length === 0 || sending) return;
    setSending(true);
    setError(null);
    try {
      const updated = await postConversationMessage(conversationId, {
        text: text.trim(),
        ...(readySeeds.length > 0 ? { seeds: readySeeds } : {}),
      });
      setConversation(updated);
      setText('');
      setAttachments([]);
      onMutated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // the server persists the researcher message BEFORE the model runs — a
      // model failure leaves it in the transcript (marked failed, retryable).
      // Reflect that reality: refresh, and free the composer only if it landed.
      try {
        const fresh = await getConversation(conversationId);
        setConversation(fresh);
        const landed = fresh.messages.at(-1);
        if (landed?.role === 'researcher' && landed.content === text.trim()) {
          setText('');
          setAttachments([]);
        }
      } catch { /* refresh is cosmetic; the error is already shown */ }
    } finally {
      setSending(false);
    }
  };

  const retryReply = async (messageId: string): Promise<void> => {
    if (retrying || sending) return;
    setRetrying(true);
    setError(null);
    try {
      setConversation(await retryConversationTurn(conversationId, messageId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // the failure marker on the message is the authoritative state — refetch
      getConversation(conversationId).then(setConversation).catch(() => { /* error already shown */ });
    } finally {
      setRetrying(false);
    }
  };

  const launch = async (question: string, key: string): Promise<void> => {
    if (launching !== null) return;
    setLaunching(key);
    setError(null);
    try {
      const runId = await launchFromConversation(conversationId, { text: question });
      onMutated();
      onOpenedRun(runId);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLaunching(null);
    }
  };

  if (conversation === null) {
    return (
      <div className="select-hint" role="status">
        {error !== null ? <p className="field-error">{error}</p> : t('common.loading')}
      </div>
    );
  }

  const canSend = !sending && text.trim().length > 0;

  return (
    <div className="conv">
      <header className="conv-head">
        <h2 className="conv-title">{conversation.title}</h2>
        <span className={`badge ${conversation.status === 'converged' ? 'badge--ok' : 'badge--info'}`}>
          {t(conversation.status === 'converged' ? 'conv.statusConverged' : conversation.turns === 0 ? 'conv.statusNew' : 'conv.statusOpen')}
        </span>
        {conversation.runIds.length > 0 && (
          <span className="conv-runs">
            {conversation.runIds.map((runId) => (
              <button key={runId} type="button" className="btn btn--small" onClick={() => onOpenedRun(runId)}>
                {t('conv.openRun')} <span className="mono">{runId.slice(0, 12)}…</span>
              </button>
            ))}
          </span>
        )}
      </header>

      {automations.length > 0 && (
        <ul className="conv-automations" role="list" aria-label={t('conv.automationsLabel')}>
          {automations.map((a) => (
            <li key={a.id} className={`conv-automation${a.enabled ? '' : ' conv-automation--off'}`}>
              <Zap size={13} aria-hidden="true" />
              <span className="conv-automation-label" title={a.task}>{a.label}</span>
              <span className="conv-automation-trigger muted small">
                {a.trigger.kind === 'run_completed'
                  ? <><Clock size={11} aria-hidden="true" /> {t('conv.automationRunCompleted')}</>
                  : <><Clock size={11} aria-hidden="true" /> {t('conv.automationEvery', { n: a.trigger.intervalMinutes })}</>}
                {' · '}{t('conv.automationFires', { n: a.fireCount })}
              </span>
              <button
                type="button"
                className="btn btn--small"
                disabled={automationBusy === a.id}
                onClick={() => { void toggleAutomation(a); }}
              >
                {automationBusy === a.id ? <Loader2 size={11} className="attach-spinner" aria-hidden="true" /> : null}
                {a.enabled ? t('conv.automationPause') : t('conv.automationResume')}
              </button>
              <button type="button" className="btn btn--small" disabled={automationBusy === a.id} onClick={() => { void removeAutomation(a); }}>
                <X size={11} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="conv-stream">
        {conversation.messages.length === 0 && (
          <p className="muted conv-empty">{t('conv.emptyHint')}</p>
        )}
        {conversation.messages.map((m, i) => (
          <MessageBubble
            key={m.id}
            message={m}
            launching={launching}
            onLaunch={launch}
            onResolve={resolveProposal}
            resolvingProposal={resolvingProposal}
            onRetryReply={i === conversation.messages.length - 1 && m.role === 'researcher'
              ? () => { void retryReply(m.id); }
              : undefined}
            retryBusy={retrying}
          />
        ))}
        {/* Turn-in-progress placeholder (Claude Code parity): the agent's side
            of the dialogue shows an honest indeterminate "working" row while
            the server runs the kernel loop — no fabricated steps, no fake
            progress; the toolTrace lands with the reply when it completes. */}
        {sending && (
          <div className="conv-msg conv-msg--agent conv-msg--pending" aria-live="polite">
            <div className="conv-pending">
              <Loader2 size={13} className="attach-spinner" aria-hidden="true" />
              <span>{t('conv.agentWorking')}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {error !== null && (
        <p className="field-error" role="alert">
          {t('conv.turnFailed')}：{error}
          {text.trim().length > 0 && (
            <button type="button" className="btn btn--small conv-retry" onClick={() => { setError(null); void send(); }}>
              <RotateCcw size={12} aria-hidden="true" /> {t('common.retry')}
            </button>
          )}
        </p>
      )}
      {note !== null && <p className="muted small" role="status">{note}</p>}

      <div
        className={`conv-composer${dragActive ? ' conv-composer--drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { if (e.currentTarget === e.target) setDragActive(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          const files = Array.from(e.dataTransfer.files);
          if (files.length > 0) {
            void Promise.all(files.map((f) => ingestFile(f)));
            return;
          }
          const dropped = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
          if (dropped.trim().length > 0) void ingestDroppedText(dropped);
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.bib,.ris,.txt,.md,.docx,.xlsx,.xls,.csv,.tsv,.ods,.pptx,.odt,.odp,.html,.htm,.json,.epub"
          className="sr-only"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            void Promise.all(Array.from(e.target.files ?? []).map((f) => ingestFile(f)));
            e.target.value = '';
          }}
        />
        {attachments.length > 0 && (
          <ul className="attach-tray" role="list" aria-label={t('composer.attachLabel')}>
            {attachments.map((a) => (
              <li key={a.id} className={`attach-card attach-card--${a.status}`}>
                <span className="attach-icon" aria-hidden="true">
                  <AttachIcon kind={a.kind} />
                </span>
                <span className="attach-body">
                  <span className="attach-title" title={a.seed.title ?? ''}>{(a.seed.title ?? '').slice(0, 64) || t('ingest.untitled')}</span>
                  <span className="attach-meta muted small">
                    {a.kind}
                    {a.sizeBytes !== undefined ? ` · ${formatBytes(a.sizeBytes)}` : ''}
                    {a.status === 'parsing' && ` · ${t('composer.parsing')}`}
                    {a.status === 'ready' && a.truncated && ` · ${t('ingest.truncated')}`}
                    {a.status === 'failed' && ` · ${t(a.errorKey ?? 'ingest.extractFailed')}`}
                  </span>
                </span>
                {a.status === 'parsing' && <Loader2 size={14} className="attach-spinner" aria-hidden="true" />}
                <button type="button" className="attach-action" aria-label={t('composer.remove')} onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== a.id))}>
                  <X size={13} aria-hidden="true" />
                </button>
              </li>
            ))}
            <li className="attach-cap muted small">{t('composer.capCount', { n: attachments.length, max: MAX_SEEDS })}</li>
          </ul>
        )}

        {slashMatches.length > 0 && (
          <ul className="conv-slash-menu" role="listbox" aria-label={t('conv.slashMenuHint')}>
            {slashMatches.map((c) => (
              <li key={c.id}>
                <button type="button" role="option" onClick={() => setText(c.template)}>
                  <span className="mono">/{c.name}</span> <span className="muted">{c.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <textarea
          ref={inputRef}
          className="conv-input"
          value={text}
          rows={2}
          placeholder={t('conv.inputPlaceholder')}
          aria-label={t('conv.inputLabel')}
          disabled={sending}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            if (canSend) void send();
          }}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="conv-tools">
          <button type="button" className="composer2-tool" onClick={() => fileInputRef.current?.click()} disabled={capReached} title={t('ingest.dropHint')}>
            <Paperclip size={15} aria-hidden="true" /><span>{t('composer.addFiles')}</span>
          </button>
          <button type="button" className={`composer2-tool${linkOpen ? ' composer2-tool--active' : ''}`} aria-expanded={linkOpen} onClick={() => setLinkOpen((v) => !v)}>
            <Link2 size={15} aria-hidden="true" /><span>{t('composer.addLink')}</span>
          </button>
          <button type="button" className="composer2-tool" onClick={() => setZoteroOpen(true)}>
            <BookMarked size={15} aria-hidden="true" /><span>Zotero</span>
          </button>
          <DictationButton
            onTranscribed={(fragment) => {
              const el = inputRef.current;
              const caret = el?.selectionStart ?? text.length;
              const next = insertAtCaret(text, fragment, caret);
              setText(next.value);
              requestAnimationFrame(() => {
                el?.focus();
                el?.setSelectionRange(next.caret, next.caret);
              });
            }}
            onError={flashNote}
          />
          {reasoning?.supported === true && (
            <label className="composer2-tool conv-gear" title={t('settings.reasoningHint')}>
              <Brain size={15} aria-hidden="true" />
              <span className="sr-only">{t('conv.reasoningLabel')}</span>
              <select
                className="conv-gear-select"
                value={reasoning.gear ?? ''}
                disabled={gearBusy || sending}
                onChange={(e) => {
                  const v = e.target.value;
                  void changeGear(v === '' ? null : (v as 'low' | 'medium' | 'high'));
                }}
                aria-label={t('conv.reasoningLabel')}
              >
                <option value="">⚙ {t('conv.reasoningDefault')}{reasoning.defaultGear !== undefined ? ` (${reasoning.defaultGear})` : ''}</option>
                {(['low', 'medium', 'high'] as const).map((g) => (
                  <option key={g} value={g}>{t('conv.reasoningLabel')}：{g}</option>
                ))}
              </select>
            </label>
          )}
          <span className="composer2-spacer" />
          <button
            type="button"
            className="btn btn--small"
            disabled={text.trim().length === 0 || launching !== null}
            onClick={() => { void launch(text.trim(), 'custom'); }}
            title={t('conv.launchHint')}
          >
            {launching === 'custom' ? <Loader2 size={12} className="attach-spinner" aria-hidden="true" /> : null}
            {t('conv.launchBtn')}
          </button>
          <button type="button" className="composer2-send" disabled={!canSend} onClick={() => void send()} aria-label={t('conv.send')}>
            {sending ? <Loader2 size={16} className="attach-spinner" aria-hidden="true" /> : <ArrowUp size={16} aria-hidden="true" />}
          </button>
        </div>

        {linkOpen && (
          <div className="link-add" role="group" aria-label={t('composer.addLink')}>
            <span className="link-add-icon" aria-hidden="true"><Link2 size={13} /></span>
            <input
              type="text"
              value={linkInput}
              placeholder={t('composer.addLinkPlaceholder')}
              aria-label={t('composer.addLink')}
              autoFocus
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                e.preventDefault();
                submitLinks();
              }}
            />
            <button type="button" className="btn btn--sm" disabled={linkInput.trim().length === 0 || capReached} onClick={submitLinks}>
              {t('composer.add')}
            </button>
          </div>
        )}
      </div>

      <ZoteroPanel open={zoteroOpen} onClose={() => setZoteroOpen(false)} onImport={importZotero} remaining={MAX_SEEDS - attachments.length} />
    </div>
  );
}

function MessageBubble({
  message, launching, onLaunch, onResolve, resolvingProposal, onRetryReply, retryBusy,
}: {
  message: ConversationMessage;
  launching: string | null;
  onLaunch: (question: string, key: string) => void;
  onResolve: (proposal: ConversationProposal, approve: boolean, remember: boolean) => Promise<void>;
  resolvingProposal: string | null;
  /** Present only on the conversation's last message while it is an unanswered
   * researcher message — the failed-turn retry control. */
  onRetryReply?: () => void;
  retryBusy: boolean;
}): JSX.Element {
  const { t } = useI18n();
  // ChatGPT-parity message action: one-tap copy of the message body. Feedback
  // is a transient check glyph on the button itself (no page-level flash).
  const [copied, setCopied] = useState(false);
  const copyMessage = (): void => {
    void navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }).catch(() => { /* clipboard denied: the button simply does nothing visible */ });
  };
  // automation records are deterministic system notices, not model replies
  if (message.role === 'automation') {
    return (
      <div className="conv-msg conv-msg--automation">
        <p className="conv-automation-record">{message.content}</p>
      </div>
    );
  }
  const mine = message.role === 'researcher';
  return (
    <div className={`conv-msg conv-msg--${mine ? 'researcher' : 'agent'}`}>
      <div className="conv-bubble">
        {mine ? (
          <>
            <p className="conv-text">{message.content}</p>
            {message.replyError !== undefined && (
              <p className="field-error small">{t('conv.replyFailed')}：{message.replyError}</p>
            )}
            {onRetryReply !== undefined && (
              <button type="button" className="btn btn--small conv-retry" disabled={retryBusy} onClick={onRetryReply}>
                {retryBusy ? <Loader2 size={12} className="attach-spinner" aria-hidden="true" /> : <RotateCcw size={12} aria-hidden="true" />}
                {' '}{t('conv.retryReply')}
              </button>
            )}
          </>
        ) : (
          <div className="conv-md"><MarkdownDoc markdown={message.content} withOutline={false} /></div>
        )}
        {message.thinking !== undefined && message.thinking.length > 0 && (
          <details className="conv-thinking">
            <summary>
              <BrainCircuit size={11} aria-hidden="true" /> {t('conv.thinking')}
            </summary>
            <pre className="conv-thinking-body mono">{message.thinking}</pre>
          </details>
        )}
        {message.toolTrace !== undefined && message.toolTrace.length > 0 && (
          <details className="conv-tooltrace">
            <summary>
              <Wrench size={11} aria-hidden="true" /> {t('conv.toolsUsed', { n: message.toolTrace.length })}
            </summary>
            <ul role="list">
              {message.toolTrace.map((tool, i) => (
                <li key={`${tool.tool}-${i}`} className={`conv-tool${tool.ok ? '' : ' conv-tool--failed'}`}>
                  <span className={`conv-tool-dot${tool.ok ? ' is-ok' : ' is-failed'}`} aria-hidden="true" />
                  <span className="mono conv-tool-name">{tool.tool}</span>
                  {tool.summary !== undefined && <span className="conv-tool-summary">{tool.summary}</span>}
                  {tool.durationMs !== undefined && (
                    <span className="conv-tool-ms mono">{tool.durationMs >= 1000 ? `${(tool.durationMs / 1000).toFixed(1)} s` : `${tool.durationMs} ms`}</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
        {message.proposals !== undefined && message.proposals.length > 0 && (
          <div className="conv-proposals">
            {message.proposals.map((p) => (
              <ProposalCard key={p.id} proposal={p} onResolve={onResolve} resolving={resolvingProposal === p.id} />
            ))}
          </div>
        )}
        {message.seeds !== undefined && message.seeds.length > 0 && (
          <ul className="conv-seeds">
            {message.seeds.slice(0, 8).map((s, i) => (
              <li key={`${s.title}-${i}`} className="conv-seed" title={s.title}>
                <BookMarked size={11} aria-hidden="true" /> {s.title.slice(0, 48)}{s.year !== undefined ? ` (${s.year})` : ''}
              </li>
            ))}
            {message.seeds.length > 8 && <li className="conv-seed muted">+{message.seeds.length - 8}</li>}
          </ul>
        )}
        {message.candidates !== undefined && message.candidates.length > 0 && (
          <div className="conv-candidates">
            {message.candidates.map((c) => (
              <div key={c.id} className="conv-candidate">
                <p className="conv-candidate-q">{c.text}</p>
                <p className="conv-candidate-why muted small">{c.rationale}</p>
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  disabled={launching !== null}
                  onClick={() => onLaunch(c.text, c.id)}
                >
                  {launching === c.id ? <Loader2 size={12} className="attach-spinner" aria-hidden="true" /> : null}
                  {t('conv.launchBtn')}
                </button>
              </div>
            ))}
          </div>
        )}
        {message.usage !== undefined && (
          <p className="conv-usage muted small mono">
            {message.usage.modelId} · {message.usage.latencyMs >= 1000 ? `${(message.usage.latencyMs / 1000).toFixed(1)} s` : `${message.usage.latencyMs} ms`}
            {message.usage.modelCalls !== undefined ? ` · ${message.usage.modelCalls} ${t('conv.modelCalls')}` : ''}
            {(message.usage.inputTokens !== undefined || message.usage.outputTokens !== undefined) && (
              <>
                {' · '}
                <span title={t('conv.usageInput')}>{t('conv.usageInChar')}{message.usage.inputTokens ?? 0}</span>
                <span title={t('conv.usageOutput')}> / {t('conv.usageOutChar')}{message.usage.outputTokens ?? 0}</span>
              </>
            )}
          </p>
        )}
      </div>
      <button
        type="button"
        className={`conv-copy${copied ? ' is-copied' : ''}`}
        onClick={copyMessage}
        aria-label={copied ? t('conv.copied') : t('conv.copyMessage')}
        title={copied ? t('conv.copied') : t('conv.copyMessage')}
      >
        {copied ? <Check size={13} aria-hidden="true" /> : <Copy size={13} aria-hidden="true" />}
      </button>
    </div>
  );
}

const PROPOSAL_KIND_LABEL: Record<ConversationProposal['kind'], DictKey> = {
  launch_research: 'conv.proposal.launch_research',
  cancel_run: 'conv.proposal.cancel_run',
  create_tool_integration: 'conv.proposal.create_tool_integration',
  create_automation: 'conv.proposal.create_automation',
  cancel_automation: 'conv.proposal.cancel_automation',
};

function ProposalCard({
  proposal, onResolve, resolving,
}: {
  proposal: ConversationProposal;
  onResolve: (proposal: ConversationProposal, approve: boolean, remember: boolean) => Promise<void>;
  resolving: boolean;
}): JSX.Element {
  const { t } = useI18n();
  const [remember, setRemember] = useState(false);
  // RU-3 T6: server-computed argSummary is authoritative; the client heuristic
  // below is a back-compat fallback for proposals persisted before the field.
  const serverArgs = proposal.argSummary;
  const argSummary = serverArgs !== undefined && Object.keys(serverArgs).length > 0
    ? Object.entries(serverArgs).map(([k, v]) => `${k}: ${v}`).join(' · ')
    : proposal.kind === 'launch_research'
      ? String(proposal.args.question ?? '')
      : proposal.kind === 'cancel_automation'
        ? String(proposal.args.automationId ?? '')
        : String(proposal.args.task ?? '');
  const riskBadge = proposal.riskLevel === 'high' ? 'badge badge--warn' : 'badge badge--info';
  return (
    <div className={`conv-proposal conv-proposal--${proposal.status}`}>
      <p className="conv-proposal-head">
        <Check size={11} aria-hidden="true" /> <strong>{t(PROPOSAL_KIND_LABEL[proposal.kind])}</strong>
        {proposal.riskLevel !== undefined && <span className={riskBadge}>{t(`conv.proposalRisk.${proposal.riskLevel}` as DictKey)}</span>}
        {proposal.autoApproved === true && <span className="badge badge--info">{t('conv.proposalAuto')}</span>}
      </p>
      <p className="conv-proposal-title" title={t('conv.proposalModelTitle')}>{proposal.title}</p>
      {argSummary.length > 0 && <p className="conv-proposal-args muted small">{argSummary.slice(0, 200)}</p>}
      {proposal.status === 'pending' ? (
        <div className="conv-proposal-actions">
          <label className="conv-proposal-remember muted small">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            {t('conv.proposalRemember')}
          </label>
          <button
            type="button"
            className="btn btn--primary btn--small"
            disabled={resolving}
            onClick={() => { void onResolve(proposal, true, remember); }}
          >
            {resolving ? <Loader2 size={11} className="attach-spinner" aria-hidden="true" /> : null}
            {t('conv.proposalApprove')}
          </button>
          <button
            type="button"
            className="btn btn--small"
            disabled={resolving}
            onClick={() => { void onResolve(proposal, false, false); }}
          >
            {t('conv.proposalReject')}
          </button>
        </div>
      ) : (
        <p className={`conv-proposal-result small ${proposal.status === 'failed' ? 'field-error' : 'muted'}`}>
          {t(proposal.status === 'executed' ? 'conv.proposalExecuted' : proposal.status === 'rejected' ? 'conv.proposalRejected' : 'conv.proposalFailed')}
          {proposal.result !== undefined ? `：${proposal.result}` : ''}
        </p>
      )}
    </div>
  );
}
