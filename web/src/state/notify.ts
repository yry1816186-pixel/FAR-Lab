/**
 * Shared desktop-notification preference (double entry point: header quick toggle
 * + settings center). The pref lives in localStorage under 'far-notify' and is a
 * USER-GRANTED privilege: enabling is the permission-request moment; a denied
 * permission stays denied honestly. Mutations broadcast NOTIFY_CHANGE_EVENT so
 * every mounted toggle (header, settings) re-syncs in the same page — no stale
 * in-memory copies deciding differently.
 */
const PREF_KEY = 'far-notify';

export const NOTIFY_CHANGE_EVENT = 'far-notify-change';

export const isNotifySupported = (): boolean => typeof window !== 'undefined' && 'Notification' in window;

export const readNotifyEnabled = (): boolean => {
  if (!isNotifySupported()) return false;
  return window.localStorage.getItem(PREF_KEY) === 'on' && window.Notification.permission === 'granted';
};

/**
 * Turn notifications on/off. Returns the resulting enabled state (a request that
 * ends in denial resolves to off — never pretend). Broadcasts the change event.
 */
export const writeNotifyEnabled = (on: boolean): boolean => {
  if (!isNotifySupported()) return false;
  if (!on) {
    window.localStorage.setItem(PREF_KEY, 'off');
    window.dispatchEvent(new CustomEvent(NOTIFY_CHANGE_EVENT, { detail: { enabled: false } }));
    return false;
  }
  const perm = window.Notification.permission;
  if (perm === 'granted') {
    window.localStorage.setItem(PREF_KEY, 'on');
    window.dispatchEvent(new CustomEvent(NOTIFY_CHANGE_EVENT, { detail: { enabled: true } }));
    return true;
  }
  if (perm === 'denied') {
    window.localStorage.setItem(PREF_KEY, 'off');
    window.dispatchEvent(new CustomEvent(NOTIFY_CHANGE_EVENT, { detail: { enabled: false } }));
    return false;
  }
  // 'default': enabling IS the permission moment (async — the event fires after
  // the browser dialog resolves; callers read the final state from the event).
  // A rejected permission promise (browser quirk / dismissed dialog) must not
  // surface as an unhandled rejection: the preference simply stays off.
  void window.Notification.requestPermission().then((granted) => {
    const enabled = granted === 'granted';
    window.localStorage.setItem(PREF_KEY, enabled ? 'on' : 'off');
    window.dispatchEvent(new CustomEvent(NOTIFY_CHANGE_EVENT, { detail: { enabled } }));
  }, () => {
    window.localStorage.setItem(PREF_KEY, 'off');
    window.dispatchEvent(new CustomEvent(NOTIFY_CHANGE_EVENT, { detail: { enabled: false } }));
  });
  return false;
};
