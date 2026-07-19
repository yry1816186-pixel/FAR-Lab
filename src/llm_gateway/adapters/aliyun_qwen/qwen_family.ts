import { NonQwenModelError } from './errors.ts';

export function isQwenModel(modelId: string): boolean {
  return modelId.trim().toLowerCase().startsWith('qwen');
}

export function assertQwenModel(modelId: string): void {
  if (!isQwenModel(modelId)) {
    throw new NonQwenModelError(modelId);
  }
}
