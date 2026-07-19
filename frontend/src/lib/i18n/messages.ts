// Aggregates the zh (default) + en catalogues and exposes the union of keys.
// en is type-checked against zh keys, so the two locales can never drift.

import { zh } from './zh';
import { en } from './en';

export type Locale = 'zh' | 'en';
export type MessageKey = keyof typeof zh;

export const messages: Record<Locale, Record<MessageKey, string>> = { zh, en };
