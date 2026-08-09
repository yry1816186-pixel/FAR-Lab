/**
 * Logo — FAR-Lab 品牌标识(R-10.1)。
 *
 * 视觉概念:"验证封印(Verdict Seal)"
 *   - 圆角方印(brand-600 ink-blue)= 科学封缄 / 信任层
 *   - 白色 check = 确定性裁决(verification)
 *   - 双色字标 "FAR"(brand)/ "-Lab"(foreground)= 品牌识别 + 学术克制
 *
 * 设计原则:简洁 · 可缩放 · 单色可读 · 暗亮色双版本自适应。
 * 落地:SVG 内联(无外部资源),seal 用 currentColor(text-brand-600),check 用 white,
 *       字标经 design token 着色。非 link 元素(避免破坏 App.test 的 nav link 计数=14)。
 */

import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';

export interface LogoProps {
  /** 尺寸:sm=紧凑(移动端/顶栏),md=标准。默认 md。 */
  readonly size?: 'sm' | 'md';
  /** 是否显示字标 "FAR-Lab"。默认 true(mark-only 时设 false,如 favicon 场景)。 */
  readonly showWordmark?: boolean;
  readonly className?: string;
}

/** Mark 尺寸 + 字标字号映射。 */
const SIZE_TOKENS: Record<NonNullable<LogoProps['size']>, { mark: string; text: string; gap: string }> = {
  sm: { mark: 'h-5 w-5', text: 'text-sm', gap: 'gap-1.5' },
  md: { mark: 'h-6 w-6', text: 'text-base', gap: 'gap-2' },
};

/**
 * FAR-Lab 品牌 Logo。渲染为 <span>(非交互),不参与路由,不影响 nav link 计数。
 * 语义:mark 为装饰性图形(aria-hidden),字标为可读文本"FAR-Lab"。
 */
export function Logo({ size = 'md', showWordmark = true, className }: LogoProps) {
  const tokens = SIZE_TOKENS[size];
  return (
    <span
      className={cn('inline-flex select-none items-center', tokens.gap, className)}
      data-testid="brand-logo"
    >
      {/* Verdict Seal mark — 装饰性,seal=brand-600,check=white */}
      <svg
        viewBox="0 0 24 24"
        className={cn('text-brand-600 shrink-0', tokens.mark)}
        style={{ '--logo-mark': 'currentColor' } as CSSProperties}
        aria-hidden="true"
        focusable="false"
      >
        {/* 圆角方印(科学封缄) */}
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5" fill="currentColor" />
        {/* 裁决 check(verification)— 白色,几何精确 */}
        <path
          d="M8 12.3 L10.8 15.1 L16.2 9.4"
          fill="none"
          stroke="hsl(0 0% 100%)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {showWordmark && (
        <span className={cn('font-display font-semibold leading-none tracking-tight', tokens.text)}>
          <span className="text-brand-700 dark:text-brand-400">FAR</span>
          <span className="text-foreground">-Lab</span>
        </span>
      )}
    </span>
  );
}

export default Logo;
