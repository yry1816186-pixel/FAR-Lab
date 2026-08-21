import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Connection truth for the header banner: set by polling consumers whenever a
 * request fails (offline) or succeeds (online). This reflects real network
 * outcomes only — it is never set optimistically on mount.
 */
interface ConnectionState {
  online: boolean;
  markOnline: () => void;
  markOffline: () => void;
}

const ConnectionContext = createContext<ConnectionState | null>(null);

export function ConnectionProvider({ children }: { children: ReactNode }): JSX.Element {
  const [online, setOnline] = useState(true);
  const everReported = useRef(false);

  const markOnline = useCallback(() => {
    everReported.current = true;
    setOnline(true);
  }, []);
  const markOffline = useCallback(() => {
    if (everReported.current) setOnline(false);
  }, []);

  const value = useMemo<ConnectionState>(() => ({ online, markOnline, markOffline }), [online, markOnline, markOffline]);
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionState {
  const ctx = useContext(ConnectionContext);
  if (ctx === null) throw new Error('useConnection must be used within ConnectionProvider');
  return ctx;
}
