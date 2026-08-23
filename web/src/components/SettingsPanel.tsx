import { SettingsShell } from './settings/SettingsShell';

/**
 * Settings entry point (header gear). The implementation lives in
 * settings/SettingsShell — a six-section settings center (model routes /
 * tools & extensions / automations / appearance & notifications /
 * data & authorization / about). Kept as this thin re-export so App wiring
 * and import sites stay stable.
 */
export function SettingsPanel(props: { open: boolean; onClose: () => void }): JSX.Element | null {
  return SettingsShell(props);
}
