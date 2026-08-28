import { useState } from 'react';
import {
  BookOpen, ChevronLeft, ChevronRight, FlaskConical, Home, MessageSquare,
  Plus, Settings, Trash2,
} from 'lucide-react';
import { useI18n } from '../i18n/LanguageContext';
import type { DictKey } from '../i18n/dict';
import type { Conversation } from '../api/types';
import { runLabel } from '../studies';
import type { RunSummary } from '../api/types';
import './lab.css';

/** Which primary surface the workspace is showing (rail active-state). */
export type RailSurface = 'home' | 'new' | 'library' | 'study' | 'conv';

const COLLAPSE_KEY = 'farlab.railCollapsed';

/** Workspace navigation rail (Bohrium/Doubao parity): persistent entries for
 *  every primary surface, the latest studies and conversations one click
 *  away, collapsible to an icon column. Every entry is a real capability —
 *  no decorative links. Hidden below 900px (the study map and queue keep the
 *  full width there); keyboard users reach the same surfaces via "/" palette
 *  and "n". */
export function AppRail({
  surface, runs, conversations,
  onHome, onNewResearch, onLibrary, onOpenStudy, onOpenConversation,
  onDeleteConversation, onOpenSettings,
}: {
  surface: RailSurface;
  runs: RunSummary[];
  conversations: Conversation[];
  onHome: () => void;
  onNewResearch: () => void;
  onLibrary: () => void;
  onOpenStudy: (runId: string) => void;
  onOpenConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
  onOpenSettings: () => void;
}): JSX.Element | null {
  const { t } = useI18n();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return window.localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const [confirmConvId, setConfirmConvId] = useState<string | null>(null);

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
    key: DictKey, icon: JSX.Element, active: boolean, onClick: () => void, extra?: { title?: string },
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
        {navItem('rail.home', <Home size={15} aria-hidden="true" />, surface === 'home', onHome)}
        {navItem('rail.newResearch', <Plus size={15} aria-hidden="true" />, surface === 'new', onNewResearch)}
        {navItem('rail.library', <BookOpen size={15} aria-hidden="true" />, surface === 'library', onLibrary)}
      </div>

      {recentStudies.length > 0 && (
        <div className="rail-group rail-group--scroll">
          {!collapsed && <p className="rail-group-title">{t('rail.studies')}</p>}
          {recentStudies.map((r) => {
            const label = runLabel(r);
            const short = label.length > 38 ? `${label.slice(0, 38)}…` : label;
            return (
              <button
                type="button"
                key={r.id}
                className={`rail-link${surface === 'study' ? ' is-active' : ''}`}
                onClick={() => onOpenStudy(r.id)}
                title={label}
              >
                <span className="rail-link-icon" aria-hidden="true"><FlaskConical size={13} /></span>
                {!collapsed && <span className="rail-link-label">{short}</span>}
              </button>
            );
          })}
        </div>
      )}

      {recentConvs.length > 0 && (
        <div className="rail-group rail-group--scroll">
          {!collapsed && <p className="rail-group-title">{t('rail.convs')}</p>}
          {recentConvs.map((c) => (
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
                    {c.title.length > 30 ? `${c.title.slice(0, 30)}…` : c.title}
                  </span>
                )}
              </button>
              {!collapsed && (
                confirmConvId === c.id ? (
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
                    onClick={() => { setConfirmConvId(c.id); window.setTimeout(() => setConfirmConvId((cur) => (cur === c.id ? null : cur)), 4000); }}
                    aria-label={t('rail.convDelete')}
                    title={t('rail.convDelete')}
                  >
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}

      <div className="rail-group rail-group--bottom">
        {navItem('rail.settings', <Settings size={15} aria-hidden="true" />, false, onOpenSettings)}
      </div>
    </nav>
  );
}
