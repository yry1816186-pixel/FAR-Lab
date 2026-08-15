/**
 * require_role —— 功能级授权纯函数层。
 *
 * 背景（findings API5）：JWT payload 声明 role（viewer/researcher/admin）但**无任何路由
 * 执行 role 检查**——role 字段为死代码。本模块提供确定性授权判定（纯函数·可测）：
 *
 *   - requireRole(principal, allowed)：principal.role ∈ allowed → true（否则 false）
 *   - canAccessReceipt(principal, owner)：对象级授权（BOLA / API1）——
 *     owner === null（公开/匿名创建/旧行）→ true；owner === principal.userId → true；
 *     否则 false（水平越权拒绝）。
 *   - ownerOf(principal)：受保护模式（非 anonymous）→ principal.userId；offline 匿名 →
 *     null（公开创建·保持 24§3.1 双轨鉴权下匿名路径行为不变）。
 *
 * 语义约定：
 *   - anonymous（offline 单机信任模式）：全部放行（现有功能零破坏）。
 *   - 受保护模式（jwtSecret 配置·fail-closed 认证）：viewer 只读、researcher/admin 可写。
 *
 * 模型中立（24§0.1 红线）：无 Qwen / 百炼 / DashScope 字面量。
 * 零容忍合规：无 any 类型注解 / ts-ignore 指令 / 双重断言 / 空 catch 块 / 桩代码返回。
 */

import type { AuthPrincipal } from '../types.ts';

/** 可写角色（viewer 只读·API5 语义）。 */
export const WRITABLE_ROLES = ['researcher', 'admin'] as const;

/**
 * 功能级授权：principal.role ∈ allowed → true。
 */
export function requireRole(
  principal: AuthPrincipal,
  allowed: readonly string[],
): boolean {
  return allowed.includes(principal.role);
}

/**
 * 对象级授权（BOLA / API1）：owner 为 null（公开·匿名/旧行）或与 principal 匹配 → true。
 */
export function canAccessReceipt(
  principal: AuthPrincipal,
  owner: string | null,
): boolean {
  if (owner === null) {
    return true; // 公开 receipt（匿名创建/旧行）——共享链接可读
  }
  return principal.userId === owner;
}

/**
 * 归属解析：受保护模式（非 anonymous）返回 principal.userId（写入 owner 列）；
 * offline 匿名返回 null（公开创建·单机信任模式行为不变）。
 */
export function ownerOf(principal: AuthPrincipal): string | null {
  return principal.role === 'anonymous' ? null : principal.userId;
}
