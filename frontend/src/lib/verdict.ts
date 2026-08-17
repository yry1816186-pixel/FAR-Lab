/**
 * verdict.ts — 5 值裁决词汇的单一事实源（SSOT）。
 *
 * 裁决是本产品的核心数据语义：同一个裁决值在任何页面必须呈现同一语义色。
 * 此前 5 处页面各自内联映射（OverviewPage/AblationPage 的 DEGRADED 与
 * INCONCLUSIVE 颜色互换、LeaderboardPage 自带 meta、AuditTracePage 裸调色板、
 * V2ReceiptPage 一律灰 outline）——同值跨页变色直接削弱"裁决仪器"的可信度。
 *
 * 权威语义（与 token 层接线对齐，见 ui/badge.tsx）：
 *   success  = --verdict-confirmed-solid（绿）
 *   warning  = --verdict-degraded-solid（橙）→ 归 DEGRADED_SCOPE
 *   destructive = 红（REFUTED）
 *   INCONCLUSIVE 无 Badge variant 可载（黄底需深字，见 VerdictBadge 注释）——
 *     紧凑 Badge 场景用 secondary（中性灰=未定）；需要黄色语义时用 VerdictBadge 组件。
 *   UNTESTED = outline（无框强调）。
 *
 * 需要完整语义呈现（图标+色+不确定度披露）时用 <VerdictBadge>；本表仅服务于
 * 紧凑 Badge variant 场景。二者并存是刻意的：variant 表可穷举类型检查，
 * VerdictBadge 承载无法塞进 variant 的黄色对比度处理。
 */

import type { VerdictValue } from '@/lib/types';

/** 5 值裁决的规范显示顺序（与内核 R0-R9 词汇一致）。 */
export const VERDICT_VALUES = [
  'CONFIRMED',
  'REFUTED',
  'INCONCLUSIVE',
  'DEGRADED_SCOPE',
  'UNTESTED',
] as const satisfies readonly VerdictValue[];

/** 类型守卫：外部输入（API 字符串字段）收窄为 VerdictValue。 */
export function isVerdictValue(v: string | null | undefined): v is VerdictValue {
  return (
    v !== null &&
    v !== undefined &&
    (VERDICT_VALUES as readonly string[]).includes(v)
  );
}

/** Badge variant 类型（与 ui/badge.tsx cva variants 对齐）。 */
export type VerdictBadgeVariant =
  | 'success'
  | 'destructive'
  | 'warning'
  | 'secondary'
  | 'outline';

/** 裁决 → 紧凑 Badge variant 的唯一映射（页面不得自建同类映射）。 */
export const VERDICT_BADGE_VARIANT: Readonly<Record<VerdictValue, VerdictBadgeVariant>> = {
  CONFIRMED: 'success',
  REFUTED: 'destructive',
  INCONCLUSIVE: 'secondary',
  DEGRADED_SCOPE: 'warning',
  UNTESTED: 'outline',
};
