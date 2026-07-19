import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * cn — shadcn/ui class merge helper.
 * Combines clsx (conditional classes) + tailwind-merge (de-dupes conflicting Tailwind utilities).
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
