import { NonQwenModelError } from './errors.ts';

/**
 * is qwen model.
 */
export function isQwenModel(modelId: string): boolean {
  return modelId.trim().toLowerCase().startsWith('qwen');
}

/**
 * assert qwen model.
 */
export function assertQwenModel(modelId: string): void {
  if (!isQwenModel(modelId)) {
    throw new NonQwenModelError(modelId);
  }
}
