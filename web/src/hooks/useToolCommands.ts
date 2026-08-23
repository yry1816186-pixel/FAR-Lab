import { useCallback, useEffect, useState } from 'react';
import { listToolIntegrations } from '../api/endpoints';
import type { ToolIntegrationView } from '../api/types';

/**
 * User-defined prompt commands (TIS command integrations): loaded for the
 * palette (scope palette|both) and the composer slash-menu (scope composer|both).
 * Refetched on window focus so newly approved commands appear without a reload;
 * load failures are swallowed to an empty list — a dead command surface must not
 * break navigation (the settings panel still shows the authoritative error).
 */
export interface UserCommand {
  id: string;
  name: string;
  label: string;
  template: string;
}

export function useToolCommands(): { commands: UserCommand[]; reload: () => Promise<void> } {
  const [commands, setCommands] = useState<UserCommand[]>([]);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const all = await listToolIntegrations();
      setCommands(all
        .filter((i): i is ToolIntegrationView & { kind: 'command'; name: string; template: string; label: string } =>
          i.kind === 'command' && i.enabled)
        .map((i) => ({ id: i.id, name: i.name, label: i.label, template: i.template ?? '' })));
    } catch {
      setCommands([]);
    }
  }, []);

  useEffect(() => {
    void reload();
    const onFocus = (): void => { void reload(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  return { commands, reload };
}
