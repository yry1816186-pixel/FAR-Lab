import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn-style class merge for the copy-in ui/ primitive layer (HX1). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
