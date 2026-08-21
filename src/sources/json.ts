/**
 * Narrowing helpers for walking untrusted API JSON as `unknown`.
 * Adapters never `as`-cast whole payloads; every field is checked on the way out.
 */
export const asObject = (v: unknown): Record<string, unknown> | undefined =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;

export const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const strField = (o: Record<string, unknown> | undefined, key: string): string | undefined => {
  const v = o?.[key];
  return typeof v === 'string' && v.trim() !== '' ? v : undefined;
};

export const numField = (o: Record<string, unknown> | undefined, key: string): number | undefined => {
  const v = o?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
};

export const boolField = (o: Record<string, unknown> | undefined, key: string): boolean | undefined => {
  const v = o?.[key];
  return typeof v === 'boolean' ? v : undefined;
};
