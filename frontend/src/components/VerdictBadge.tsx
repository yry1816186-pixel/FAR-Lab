/**
 * VerdictBadge — 5 值裁决共享视觉组件。
 *
 * 提供裁决配置（图标/颜色/标签）和可复用 Badge，供 HonestyWallPage、VizPage、
 * EvidenceTimeline 等页面统一引用。D3 填充/描边色经 lib/chartColors 单一出口
 * 消费 `--verdict-*` token（暗色主题自适应，D-02 销账），禁止硬编码 hsl/#RRGGBB。
 */

import type { VerdictValue } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  verdictChartFill,
  verdictChartStroke,
  FALLBACK_VERDICT_CHART_COLOR,
} from '@/lib/chartColors';
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

/**
 * 5 种裁决的视觉差异化配置（SSOT）。
 * fill/stroke 为惰性 getter：D3 渲染时经 chartColors 读当前主题 token，
 * 暗色翻转后重绘即取新值（若在模块加载期求值会锁死初始主题）。
 */
export const VERDICT_CONFIG: Record<VerdictValue, VerdictVisualConfig> = {
  CONFIRMED: {
    label: 'Confirmed',
    icon: CheckCircle2,
    cardClassName: 'border-l-4 border-l-verdict-confirmed',
    iconClassName: 'text-verdict-confirmed',
    get fill() {
      return verdictChartFill('CONFIRMED');
    },
    get stroke() {
      return verdictChartStroke('CONFIRMED');
    },
  },
  REFUTED: {
    label: 'Refuted',
    icon: XCircle,
    cardClassName: 'border-l-4 border-l-verdict-refuted',
    iconClassName: 'text-verdict-refuted',
    get fill() {
      return verdictChartFill('REFUTED');
    },
    get stroke() {
      return verdictChartStroke('REFUTED');
    },
  },
  INCONCLUSIVE: {
    label: 'Inconclusive',
    icon: HelpCircle,
    cardClassName: 'border-l-4 border-l-verdict-inconclusive',
    iconClassName: 'text-verdict-inconclusive',
    get fill() {
      return verdictChartFill('INCONCLUSIVE');
    },
    get stroke() {
      return verdictChartStroke('INCONCLUSIVE');
    },
  },
  DEGRADED_SCOPE: {
    label: 'Degraded scope',
    icon: AlertTriangle,
    cardClassName: 'border-l-4 border-l-verdict-degraded',
    iconClassName: 'text-verdict-degraded',
    get fill() {
      return verdictChartFill('DEGRADED_SCOPE');
    },
    get stroke() {
      return verdictChartStroke('DEGRADED_SCOPE');
    },
  },
  UNTESTED: {
    label: 'Untested',
    icon: CircleDashed,
    cardClassName: 'border-dashed border-verdict-untested',
    iconClassName: 'text-verdict-untested',
    get fill() {
      return verdictChartFill('UNTESTED');
    },
    get stroke() {
      return verdictChartStroke('UNTESTED');
    },
  },
};

/** D3 回退颜色（未知 verdict 值时使用，经 chartColors 单一出口） */
export const FALLBACK_VERDICT_COLOR: Pick<VerdictVisualConfig, 'fill' | 'stroke'> =
  FALLBACK_VERDICT_CHART_COLOR;

// ---------- Badge 样式 ----------

/**
 * Badge variant 映射。
 * AA 合规:confirmed/refuted/degraded 使用 `*-solid` 深色阶 + 白字(对比度 ≥4.5:1);
 * inconclusive 为黄底 + 深字(黄+白不达标,故用深字);untested 为 outline 透明底。
 * vivid `--verdict-*` token 仅用于 icon/border/D3,不用于 badge 文字底,避免饱和色+白字失败。
 */
export function verdictBadgeClass(decision: VerdictValue): string {
  const base = 'border-transparent text-white';
  switch (decision) {
    case 'CONFIRMED':
      return cn(base, 'bg-verdict-confirmed-solid');
    case 'REFUTED':
      return cn(base, 'bg-verdict-refuted-solid');
    case 'INCONCLUSIVE':
      return cn(base, 'bg-verdict-inconclusive text-verdict-inconclusive-foreground');
    case 'DEGRADED_SCOPE':
      return cn(base, 'bg-verdict-degraded-solid');
    case 'UNTESTED':
      return 'text-foreground';
  }
}

// ---------- 组件 ----------

export interface VerdictBadgeProps {
  readonly decision: VerdictValue;
  /** 尺寸变体：sm 用于紧凑布局，md 用于标准卡片（默认 md） */
  readonly size?: 'sm' | 'md';
  /**
   * 不确定性披露（UX-UNCERTAINTY-001·opt-in）：非决定性裁决的「已知道/还不知道/如何减少」
   * 一行文本。内容必须来自 renderUncertaintyNote（同源防脱钩），紧凑布局（sm）不传。
   */
  readonly uncertaintyNote?: string;
}

/** 5 值裁决 Badge — 颜色 + 图标 + 中文标签 */
export function VerdictBadge({ decision, size = 'md', uncertaintyNote }: VerdictBadgeProps) {
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
      {uncertaintyNote !== undefined && (
        <span
          data-testid="verdict-uncertainty-note"
          className="font-normal opacity-80"
          aria-label={`uncertainty: ${uncertaintyNote}`}
        >
          {uncertaintyNote}
        </span>
      )}
    </Badge>
  );
}
