/**
 * VerdictBadge — 5 值裁决共享视觉组件。
 *
 * 提供裁决配置（图标/颜色/标签）和可复用 Badge，供 HonestyWallPage、VizPage、
 * EvidenceTimeline 等页面统一引用。颜色值使用 HSL 函数记法（Design Token 派生），
 * 禁止硬编码 #RRGGBB。
 */

import type { VerdictValue } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  CircleDashed,
  type LucideIcon,
} from 'lucide-react';

// ---------- 视觉配置 ----------

/** 单个裁决值的完整视觉配置（图标/颜色/标签） */
export interface VerdictVisualConfig {
  readonly label: string;
  readonly icon: LucideIcon;
  /** Tailwind 卡片左边框 className */
  readonly cardClassName: string;
  /** 图标颜色 className */
  readonly iconClassName: string;
  /** D3 力导向图节点填充色（HSL 函数记法） */
  readonly fill: string;
  /** D3 力导向图节点描边色（HSL 函数记法） */
  readonly stroke: string;
}

/** 5 种裁决的视觉差异化配置（SSOT） */
export const VERDICT_CONFIG: Record<VerdictValue, VerdictVisualConfig> = {
  CONFIRMED: {
    label: '已确认',
    icon: CheckCircle2,
    cardClassName: 'border-l-4 border-l-verdict-confirmed',
    iconClassName: 'text-verdict-confirmed',
    fill: 'hsl(142.1, 70.6%, 45.3%)',
    stroke: 'hsl(142.1, 70.6%, 32%)',
  },
  REFUTED: {
    label: '已驳斥',
    icon: XCircle,
    cardClassName: 'border-l-4 border-l-verdict-refuted',
    iconClassName: 'text-verdict-refuted',
    fill: 'hsl(0, 84.2%, 60.2%)',
    stroke: 'hsl(0, 84.2%, 45%)',
  },
  INCONCLUSIVE: {
    label: '无定论',
    icon: HelpCircle,
    cardClassName: 'border-l-4 border-l-verdict-inconclusive',
    iconClassName: 'text-verdict-inconclusive',
    fill: 'hsl(47.9, 95.8%, 53.1%)',
    stroke: 'hsl(47.9, 95.8%, 40%)',
  },
  DEGRADED_SCOPE: {
    label: '降级范围',
    icon: AlertTriangle,
    cardClassName: 'border-l-4 border-l-verdict-degraded',
    iconClassName: 'text-verdict-degraded',
    fill: 'hsl(32.1, 94.6%, 43.7%)',
    stroke: 'hsl(32.1, 94.6%, 33%)',
  },
  UNTESTED: {
    label: '未测试',
    icon: CircleDashed,
    cardClassName: 'border-dashed border-verdict-untested',
    iconClassName: 'text-verdict-untested',
    fill: 'hsl(215.4, 16.3%, 46.9%)',
    stroke: 'hsl(215.4, 16.3%, 35%)',
  },
};

/** D3 回退颜色（未知 verdict 值时使用） */
export const FALLBACK_VERDICT_COLOR: Pick<VerdictVisualConfig, 'fill' | 'stroke'> = {
  fill: 'hsl(215.4, 16.3%, 70%)',
  stroke: 'hsl(215.4, 16.3%, 55%)',
};

// ---------- Badge 样式 ----------

/** Badge variant 映射（DEGRADED_SCOPE 使用自定义橙色覆写） */
export function verdictBadgeClass(decision: VerdictValue): string {
  const base = 'border-transparent text-white';
  switch (decision) {
    case 'CONFIRMED':
      return cn(base, 'bg-verdict-confirmed');
    case 'REFUTED':
      return cn(base, 'bg-verdict-refuted');
    case 'INCONCLUSIVE':
      return cn(base, 'bg-verdict-inconclusive text-verdict-inconclusive-foreground');
    case 'DEGRADED_SCOPE':
      return cn(base, 'bg-verdict-degraded');
    case 'UNTESTED':
      return 'text-foreground';
  }
}

// ---------- 组件 ----------

export interface VerdictBadgeProps {
  readonly decision: VerdictValue;
  /** 尺寸变体：sm 用于紧凑布局，md 用于标准卡片（默认 md） */
  readonly size?: 'sm' | 'md';
}

/** 5 值裁决 Badge — 颜色 + 图标 + 中文标签 */
export function VerdictBadge({ decision, size = 'md' }: VerdictBadgeProps) {
  const config = VERDICT_CONFIG[decision];
  const Icon = config.icon;
  const isSm = size === 'sm';

  return (
    <Badge
      className={cn('shrink-0 gap-1', verdictBadgeClass(decision), isSm ? 'px-1.5 py-0 text-xs' : '')}
      data-testid={`verdict-badge-${decision.toLowerCase()}`}
    >
      <Icon className={cn(isSm ? 'h-3 w-3' : 'h-3.5 w-3.5')} aria-hidden="true" />
      <span>{config.label}</span>
    </Badge>
  );
}
