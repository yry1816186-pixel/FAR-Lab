/** Tiny class-name joiner (replaces clsx/tailwind-merge for this app's needs). */
export function cx(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
}
