import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('cn (shadcn/ui class merge helper)', () => {
  it('合并条件类名并返回字符串', () => {
    const falsy: boolean = false;
    const result = cn('px-2', falsy && 'hidden', 'py-1');
    expect(result).toBe('px-2 py-1');
  });

  it('tailwind-merge 解析冲突工具类（后者覆盖前者）', () => {
    const result = cn('px-2 py-1', 'px-4');
    expect(result).toBe('py-1 px-4');
  });
});
