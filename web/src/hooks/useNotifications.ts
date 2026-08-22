import { useCallback, useEffect, useState } from 'react';

/**
 * B3-2 desktop-style completion notifications via the browser Notification
 * API. OFF by default: notifications are a user-granted privilege, never an
 * assumption — enabling is the explicit permission request moment. Every
 * notification maps a REAL terminal transition observed in the runs list
 * (no timers, no invented events); clicking it selects the finished run.
 */
const PREF_KEY = 'far-notify';

export function useNotifications(
  runs: { id: string; status: string; questionText?: string }[],
  selectedRunId: string | null,
  onOpenRun: (runId: string) => void,
  titleOf: () => string,
): { enabled: boolean; supported: boolean; toggle: () => void } {
  const supported = typeof window !== 'undefined' && 'Notification' in window;
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (!supported) return false;
    return window.localStorage.getItem(PREF_KEY) === 'on' && window.Notification.permission === 'granted';
  });

  const toggle = useCallback((): void => {
    if (!supported) return;
    if (!enabled) {
      // Enable = the permission moment. Denied stays denied honestly.
      const perm = window.Notification.permission;
      if (perm === 'granted') {
        window.localStorage.setItem(PREF_KEY, 'on');
        setEnabled(true);
        return;
      }
      if (perm === 'denied') {
        window.localStorage.setItem(PREF_KEY, 'off');
        setEnabled(false);
        return;
      }
      void window.Notification.requestPermission().then((granted) => {
        if (granted === 'granted') {
          window.localStorage.setItem(PREF_KEY, 'on');
          setEnabled(true);
        } else {
          window.localStorage.setItem(PREF_KEY, 'off');
          setEnabled(false);
        }
      });
    } else {
      window.localStorage.setItem(PREF_KEY, 'off');
      setEnabled(false);
    }
  }, [supported, enabled]);

  // Terminal-transition detection over the polled runs list.
  useEffect(() => {
    if (!enabled || !supported) return;
    const TERMINAL: ReadonlySet<string> = new Set(['completed', 'partial', 'failed', 'cancelled']);
    const prev = new Map<string, string>();
    let initialized = false;
    // Re-run whenever the runs array identity changes (each poll refresh).
    const observe = (): void => {
      const notifications: { id: string; body: string }[] = [];
      for (const r of runs) {
        const before = prev.get(r.id);
        if (before !== undefined && !TERMINAL.has(before) && TERMINAL.has(r.status) && r.id !== selectedRunId) {
          notifications.push({ id: r.id, body: r.questionText ?? r.id });
        }
        prev.set(r.id, r.status);
      }
      // First observation seeds the baseline silently — no backlog spam.
      if (initialized) {
        for (const n of notifications) {
          try {
            const note = new window.Notification(titleOf(), { body: n.body, tag: n.id });
            note.onclick = (): void => { window.focus(); onOpenRun(n.id); note.close(); };
          } catch {
            // Notification construction can throw on some platforms — never break the app loop.
          }
        }
      }
      initialized = true;
    };
    observe();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs identity changes per poll; closure refs are stable per render
  }, [runs, enabled, supported, selectedRunId, onOpenRun, titleOf]);

  // Keep pref in sync if the user revokes permission at the browser level.
  useEffect(() => {
    if (supported && enabled && window.Notification.permission === 'denied') {
      window.localStorage.setItem(PREF_KEY, 'off');
      setEnabled(false);
    }
  }, [supported, enabled]);

  return { enabled, supported, toggle };
}
