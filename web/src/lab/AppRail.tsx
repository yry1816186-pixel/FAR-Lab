import { useEffect, useRef, useState } from 'react';
import {
  BookOpen, ChevronLeft, ChevronRight, FlaskConical, Home, MessageSquare,
  Pencil, Plus, Settings, TerminalSquare, Trash2,
} from 'lucide-react';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import type { Conversation } from '../api/types';
import { runLabel } from '../studies';
import { ellipsize } from './text';
import type { RunSummary } from '../api/types';
import './lab.css';

/**
 * Which primary surface the workspace is showing (rail active-state). There is
 * no 'new' entry: creating a study happens INSIDE the workspace (the compose
 * zone at the top of 工作台), so the rail never offers two competing "start
 * here" destinations.
 */
export type RailSurface = 'home' | 'library' | 'study' | 'conv' | 'terminal';

const COLLAPSE_KEY = 'farlab.railCollapsed';

/** Workspace navigation rail (Bohrium/Doubao parity): persistent entries for
 *  every primary surface, the latest studies and conversations one click
 *  away, collapsible to an icon column. Every entry is a real capability —
 *  no decorative links. Hidden below 900px (the study map and queue keep the
 *  full width there); keyboard users reach the same surfaces via "/" palette
 *  and "n". */
export function AppRail({
  surface, runs, runsLoading, conversations, judgmentCount,
  onHome, onLibrary, onOpenStudy, onOpenConversation,
  onDeleteConversation, onRenameConversation, onNewConversation, onOpenSettings, onTerminal,
}: {
  surface: RailSurface;
  runs: RunSummary[];
  runsLoading: boolean;
  conversations: Conversation[];
  /** Studies awaiting the researcher (live/attention/drafts/counter) — the
   *  home's judgment queue, lifted so the badge and the queue can't diverge. */
  judgmentCount: number;
  onHome: () => void;
  onLibrary: () => void;
  onOpenStudy: (runId: string) => void;
  onOpenConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  onNewConversation: () => void;
  onOpenSettings: () => void;
  /** Toggles the shell terminal panel (optional: the shell owns that wiring). */
  onTerminal?: () => void;
}): JSX.Element | null {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return window.localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const [confirmConvId, setConfirmConvId] = useState<string | null>(null);
  const [renamingConvId, setRenamingConvId] = useState<string | null>(null);

  const toggle = (): void => {
    setCollapsed((v) => {
      const next = !v;
      try { window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* private mode: session-only collapse */ }
      return next;
    });
  };

  const recentStudies = runs.slice(0, 5);
  const recentConvs = conversations.slice(0, 5);

  const navItem = (
    key: DictKey, icon: JSX.Element, active: boolean, onClick: () => void, extra?: { title?: string; badge?: number },
  ): JSX.Element => (
    <button
      type="button"
      className={`rail-nav-item${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? t(key) : extra?.title}
    >
      <span className="rail-nav-icon" aria-hidden="true">{icon}</span>
      {!collapsed && <span className="rail-nav-label">{t(key)}</span>}
      {extra?.badge !== undefined && extra.badge > 0 && (
        <span className="rail-nav-badge" aria-label={t('rail.judgmentCount', { n: extra.badge })}>{extra.badge}</span>
      )}
    </button>
  );

  return (
    <nav className={`app-rail${collapsed ? ' is-collapsed' : ''}`} aria-label={t('rail.label')}>
      <div className="rail-head">
        {!collapsed && <span className="rail-brand">FAR-Lab</span>}
        <button
          type="button"
          className="rail-collapse"
          onClick={toggle}
          aria-label={t(collapsed ? 'rail.expand' : 'rail.collapse')}
          title={t(collapsed ? 'rail.expand' : 'rail.collapse')}
        >
          {collapsed ? <ChevronRight size={13} aria-hidden="true" /> : <ChevronLeft size={13} aria-hidden="true" />}
        </button>
      </div>

      <div className="rail-group">
        {/* One work entry. Creating a study is a zone inside 工作台 (the
            question box at the top), not a rival destination — a second
            "new research" entry made the choice ambiguous. */}
        {navItem('rail.home', <Home size={15} aria-hidden="true" />, surface === 'home', onHome, { badge: judgmentCount })}
        {navItem('rail.library', <BookOpen size={15} aria-hidden="true" />, surface === 'library', onLibrary)}
        {/* Terminal: the workspace terminal is a SHELL panel (IDE parity), so
            this entry toggles that panel instead of navigating to a route.
            Optional while the shell finishes wiring it — never a dead link. */}
        {onTerminal !== undefined && navItem('panel.terminal', <TerminalSquare size={15} aria-hidden="true" />, false, onTerminal)}
      </div>

      <div className="rail-group rail-group--scroll rail-group--studies" aria-busy={runsLoading}>
        {!collapsed && <p className="rail-group-title">{t('rail.studies')}</p>}
        {!collapsed && runsLoading && <p className="rail-empty">{t('common.loading')}</p>}
        {!collapsed && !runsLoading && recentStudies.length === 0 && (
          <p className="rail-empty">{t('rail.noStudies')}</p>
        )}
        {!runsLoading && recentStudies.map((r) => {
            const label = runLabel(r);
            return (
              <button
                type="button"
                key={r.id}
                className={`rail-link${surface === 'study' ? ' is-active' : ''}`}
                onClick={() => onOpenStudy(r.id)}
                title={label}
              >
                <span className="rail-link-icon" aria-hidden="true"><FlaskConical size={13} /></span>
                {!collapsed && <span className="rail-link-label">{ellipsize(label, 38)}</span>}
              </button>
            );
          })}
      </div>

      <div className="rail-group rail-group--scroll">
        {/* The group renders even with zero conversations — "new conversation"
            must never depend on a conversation already existing. */}
        {!collapsed && (
          <p className="rail-group-title">
            {t('rail.convs')}
            <button
              type="button"
              className="rail-group-add"
              onClick={onNewConversation}
              aria-label={t('rail.newConv')}
              title={t('rail.newConv')}
            >
              <Plus size={12} aria-hidden="true" />
            </button>
          </p>
        )}
        {collapsed && (
          <button
            type="button"
            className="rail-link"
            onClick={onNewConversation}
            aria-label={t('rail.newConv')}
            title={t('rail.newConv')}
          >
            <span className="rail-link-icon" aria-hidden="true"><Plus size={13} /></span>
          </button>
        )}
          {recentConvs.map((c) => (
            renamingConvId === c.id ? (
              <RenameInput
                key={c.id}
                initial={c.title}
                onCommit={(title) => { setRenamingConvId(null); if (title !== null && title !== c.title) onRenameConversation(c.id, title); }}
                onCancel={() => setRenamingConvId(null)}
                label={t('rail.convRename')}
              />
            ) : (
              <div key={c.id} className="rail-conv-row">
                <button
                  type="button"
                  className={`rail-link${surface === 'conv' ? ' is-active' : ''}`}
                  onClick={() => onOpenConversation(c.id)}
                  title={c.title}
                >
                  <span className="rail-link-icon" aria-hidden="true"><MessageSquare size={13} /></span>
                  {!collapsed && (
                    <span className="rail-link-label">
                      {ellipsize(c.title, 30)}
                    </span>
                  )}
                </button>
                {!collapsed && (
                  <>
                    <button
                      type="button"
                      className="rail-conv-act"
                      onClick={() => { setConfirmConvId(null); setRenamingConvId(c.id); }}
                      aria-label={t('rail.convRename')}
                      title={t('rail.convRename')}
                    >
                      <Pencil size={12} aria-hidden="true" />
                    </button>
                    {confirmConvId === c.id ? (
                      <button
                        type="button"
                        className="rail-conv-del is-armed"
                        onClick={() => { setConfirmConvId(null); onDeleteConversation(c.id); }}
                        title={t('rail.convDelConfirm')}
                      >
                        {t('rail.convDelConfirm')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="rail-conv-del"
                        onClick={() => { setRenamingConvId(null); setConfirmConvId(c.id); window.setTimeout(() => setConfirmConvId((cur) => (cur === c.id ? null : cur)), 4000); }}
                        aria-label={t('rail.convDelete')}
                        title={t('rail.convDelete')}
                      >
                        <Trash2 size={12} aria-hidden="true" />
                      </button>
                    )}
                  </>
                )}
              </div>
            )
          ))}
      </div>

      <div className="rail-group rail-group--bottom">
        {navItem('rail.settings', <Settings size={15} aria-hidden="true" />, false, onOpenSettings)}
      </div>
    </nav>
  );
}

/** Inline rename field (Doubao-parity): commit on Enter/blur, cancel on Esc.
 *  Returns null (cancel) or the trimmed title; empty input cancels, matching
 *  the server's non-empty contract. */
function RenameInput({ initial, onCommit, onCancel, label }: {
  initial: string;
  onCommit: (title: string | null) => void;
  onCancel: () => void;
  label: string;
}): JSX.Element {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const commit = (): void => {
    const trimmed = text.trim();
    onCommit(trimmed.length > 0 ? trimmed.slice(0, 120) : null);
  };
  return (
    <input
      ref={ref}
      type="text"
      className="rail-rename-input"
      value={text}
      aria-label={label}
      maxLength={120}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(); }
        else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
    />
  );
}
