// Aggregates the canonical zh/en catalogues plus focused human-surface additions.
// The supplemental catalogue lets domain surfaces finish migration without
// duplicating or replacing the established translation system.

import { zh } from './zh';
import { en } from './en';
import { humanSurfaceZh, humanSurfaceEn } from './human_surfaces';

export type Locale = 'zh' | 'en';

const mergedZh = { ...zh, ...humanSurfaceZh } as const;
const mergedEn = { ...en, ...humanSurfaceEn } as const;

export type MessageKey = keyof typeof mergedZh;

export const messages: Record<Locale, Record<MessageKey, string>> = {
  zh: mergedZh,
  en: mergedEn,
};
