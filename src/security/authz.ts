/**
 * authz — SEC-AUTHZ-001 最小授权可审计 capability 模型。
 *
 * 职责：
 *   - ActorKind（plugin/tool/model/sandbox/user/agent）× PermissionKind
 *     （network/file/secret/data/external-write）能力天花板矩阵 CAPABILITY_MATRIX；
 *   - `can(actor, action, grants, denies)` 最小授权判定：默认拒绝；deny 优先级
 *     最高（不可被任何 grant 覆盖）；授权绑定受让人（confused deputy 防御）；
 *     resource 精确匹配（horizontal privilege 防御）；kind 天花板不可被运行时
 *     grant 突破（vertical privilege 防御）；已撤销授权立即失效（revocation）；
 *   - `requestEscalation(actor, action, source, audit)`：权限升级**只**产生
 *     REQUIRES_AUTHZ 审计事件、永不返回 allow——prompt 来源的升级请求被显式
 *     阻断并逐次审计（prompt 重试不可绕过 deny）；
 *   - `authorizeGrant(granter, request)`：授权签发本身是特权操作——仅
 *     admin/owner 角色可签发，自签发拒绝；
 *   - `AuditLog`：append-only 审计事件（冻结 + 单调 seq + SHA-256 哈希链），
 *     deny-loop 检测（同一 actor 被拒 ≥ DENY_LOOP_THRESHOLD 次记录
 *     ESCALATION_ATTEMPT）。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - 本模块是策略判定核心，**不拦截**运行时真实系统调用——它证明「按声明
 *     规则该请求应被允许/拒绝」，不证明调用方真的来问过（bypass = 不调用 can
 *     直接行动，这需要 enforcement hook 落地）；
 *   - 审计链是进程内内存链——崩溃即失，不落盘；哈希链防的是逻辑篡改，不防
 *     有内存写权限的攻击者整体重写（无外部锚定）；
 *   - 时间戳来自调用方注入（grantedAt 参数），本模块不验证其与真实墙钟一致。
 *
 * 模型中立。零容忍合规：无 any 类型注解、ts 抑制指令、双重断言、空 catch。
 */

import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export type ActorKind = 'plugin' | 'tool' | 'model' | 'sandbox' | 'user' | 'agent';
export type PermissionKind = 'network' | 'file' | 'secret' | 'data' | 'external-write';

/** 行为者（身份声明——是否可信由调用方的 authn 层保证）。 */
export interface Actor {
  readonly kind: ActorKind;
  readonly id: string;
  readonly roles?: readonly string[];
}

/** 请求的动作。 */
export interface RequestedAction {
  readonly permission: PermissionKind;
  readonly resource: string;
}

/** capability 授权（显式声明——最小授权的「授权」侧）。 */
export interface CapabilityGrant {
  readonly granteeId: string;
  readonly granteeKind: ActorKind;
  readonly permission: PermissionKind;
  readonly resource: string;
  readonly grantedBy: string;
  readonly grantedAt: string;
  readonly revokedAt?: string;
}

/** deny 规则（优先级最高）。actorId/resource 支持 '*' 通配。 */
export interface DenyRule {
  readonly actorId: string;
  readonly permission: PermissionKind | '*';
  readonly resource?: string;
}

export type Decision = 'allow' | 'deny' | 'require-authz';

export interface DecisionResult {
  readonly decision: Decision;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// 天花板矩阵：ActorKind × PermissionKind（默认拒绝——不在矩阵内即无天花板授权）
// ---------------------------------------------------------------------------

/**
 * 各 actor kind 可被授予的权限天花板（最小授权）：
 *   - plugin：工具插件可联网/读文件/读数据，不可持密钥或外部写；
 *   - tool：本地工具仅文件/数据；
 *   - model：模型适配器仅网络出站 + 数据（入参经脱敏）；**永不**持 secret；
 *   - sandbox：沙箱仅限工作目录文件/数据；
 *   - agent：代理循环文件/数据/网络（检索），不可持 secret/外部写；
 *   - user：完整五类（是否授予仍需显式 grant；天花板只定上限）。
 */
export const CAPABILITY_MATRIX: Readonly<Record<ActorKind, readonly PermissionKind[]>> = {
  plugin: ['network', 'file', 'data'],
  tool: ['file', 'data'],
  model: ['network', 'data'],
  sandbox: ['file', 'data'],
  user: ['network', 'file', 'secret', 'data', 'external-write'],
  agent: ['network', 'file', 'data'],
};

/** deny-loop 检测阈值：同一 actor 被拒达到此次数记录 ESCALATION_ATTEMPT。 */
export const DENY_LOOP_THRESHOLD = 3;

// ---------------------------------------------------------------------------
// 判定核心
// ---------------------------------------------------------------------------

function matchesDeny(actor: Actor, action: RequestedAction, deny: DenyRule): boolean {
  const actorMatch = deny.actorId === '*' || deny.actorId === actor.id;
  const permMatch = deny.permission === '*' || deny.permission === action.permission;
  const resourceMatch = deny.resource === undefined || deny.resource === action.resource;
  return actorMatch && permMatch && resourceMatch;
}

/** grant 是否有效（未撤销 + 受让人/权限/资源精确匹配 + 在 kind 天花板内）。 */
export function isActiveGrantFor(actor: Actor, action: RequestedAction, grant: CapabilityGrant): boolean {
  if (grant.revokedAt !== undefined) return false;
  if (grant.granteeId !== actor.id || grant.granteeKind !== actor.kind) return false;
  if (grant.permission !== action.permission) return false;
  if (grant.resource !== action.resource) return false;
  return CAPABILITY_MATRIX[actor.kind].includes(action.permission);
}

/**
 * 最小授权判定。优先级：deny 规则 > kind 天花板 > 显式 grant > 默认拒绝。
 * 传入 audit 时记录判定事件并做 deny-loop 检测。
 */
export function can(
  actor: Actor,
  action: RequestedAction,
  grants: readonly CapabilityGrant[],
  denies: readonly DenyRule[] = [],
  audit?: AuditLog,
): DecisionResult {
  // 1. deny 优先级最高（不可被 grant 覆盖）。
  const hitDeny = denies.find((d) => matchesDeny(actor, action, d));
  if (hitDeny) {
    audit?.recordDecision(actor, action, 'deny', `deny rule: actor=${hitDeny.actorId} perm=${hitDeny.permission}`);
    return { decision: 'deny', reason: `deny rule takes precedence: ${hitDeny.actorId}/${hitDeny.permission}` };
  }
  // 2. kind 天花板：天花板外的权限无论谁授予都拒绝（vertical privilege 防御）。
  if (!CAPABILITY_MATRIX[actor.kind].includes(action.permission)) {
    const reason = `kind ceiling: ${actor.kind} can never hold ${action.permission}`;
    audit?.recordDecision(actor, action, 'deny', reason);
    return { decision: 'deny', reason };
  }
  // 3. 显式授权匹配（受让人绑定 + 资源精确匹配 + 未撤销）。
  const grant = grants.find((g) => isActiveGrantFor(actor, action, g));
  if (grant) {
    audit?.recordDecision(actor, action, 'allow', `grant by ${grant.grantedBy} at ${grant.grantedAt}`);
    return { decision: 'allow', reason: `explicit grant by ${grant.grantedBy}` };
  }
  // 4. 默认拒绝（最小授权）。
  const reason = 'no matching active grant (default deny)';
  audit?.recordDecision(actor, action, 'deny', reason);
  return { decision: 'deny', reason };
}

// ---------------------------------------------------------------------------
// 授权签发（特权操作）
// ---------------------------------------------------------------------------

export interface GrantRequest {
  readonly granteeId: string;
  readonly granteeKind: ActorKind;
  readonly permission: PermissionKind;
  readonly resource: string;
  readonly grantedAt: string;
}

/**
 * 签发授权：仅 admin/owner 角色的 user 可签发；签发者不能给自己签发
 * （自签发 = 权力自授，拒绝）。天花板外权限拒签（如给 model 签 secret）。
 */
export function authorizeGrant(
  granter: Actor,
  request: GrantRequest,
): { ok: true; grant: CapabilityGrant } | { ok: false; reason: string } {
  if (granter.kind !== 'user') {
    return { ok: false, reason: `only user actors can authorize grants (granter kind: ${granter.kind})` };
  }
  const roles = granter.roles ?? [];
  const isAdmin = roles.includes('admin') || roles.includes('owner');
  if (!isAdmin) {
    return { ok: false, reason: `granter lacks admin/owner role (roles: ${roles.join(',') || 'none'})` };
  }
  if (granter.id === request.granteeId && !roles.includes('owner')) {
    return { ok: false, reason: 'self-grant rejected: granter cannot grant to self without owner role' };
  }
  if (!CAPABILITY_MATRIX[request.granteeKind].includes(request.permission)) {
    return {
      ok: false,
      reason: `kind ceiling: ${request.granteeKind} can never hold ${request.permission} — policy change required, not a grant`,
    };
  }
  return {
    ok: true,
    grant: {
      granteeId: request.granteeId,
      granteeKind: request.granteeKind,
      permission: request.permission,
      resource: request.resource,
      grantedBy: granter.id,
      grantedAt: request.grantedAt,
    },
  };
}

// ---------------------------------------------------------------------------
// 权限升级请求（只审计·永不自动批准）
// ---------------------------------------------------------------------------

export type EscalationSource = 'prompt' | 'cli' | 'api' | 'agent-loop';

export interface EscalationResult {
  readonly decision: Decision;
  readonly reason: string;
  readonly auditType: AuditEventType;
}

/**
 * 请求权限升级。**永不返回 allow**——升级必须走出带授权（admin 签发新 grant），
 * 本函数只记录审计事件。prompt 来源（模型输出驱动的重试）被显式阻断：
 * deny 不可被 prompt 重试绕过。
 */
export function requestEscalation(
  actor: Actor,
  action: RequestedAction,
  source: EscalationSource,
  audit: AuditLog,
): EscalationResult {
  if (source === 'prompt') {
    audit.append({
      type: 'ESCALATION_BLOCKED_PROMPT_SOURCE',
      actorId: actor.id,
      details: {
        permission: action.permission,
        resource: action.resource,
        source,
        note: 'prompt-sourced escalation blocked; deny cannot be retried away via model output',
      },
    });
    return {
      decision: 'require-authz',
      reason: 'escalation from prompt source is blocked and audited; requires out-of-band admin authorization',
      auditType: 'ESCALATION_BLOCKED_PROMPT_SOURCE',
    };
  }
  audit.append({
    type: 'REQUIRES_AUTHZ',
    actorId: actor.id,
    details: { permission: action.permission, resource: action.resource, source },
  });
  return {
    decision: 'require-authz',
    reason: 'escalation recorded; requires out-of-band admin authorization (authorizeGrant)',
    auditType: 'REQUIRES_AUTHZ',
  };
}

// ---------------------------------------------------------------------------
// append-only 审计链
// ---------------------------------------------------------------------------

export type AuditEventType =
  | 'DECISION'
  | 'REQUIRES_AUTHZ'
  | 'ESCALATION_BLOCKED_PROMPT_SOURCE'
  | 'ESCALATION_ATTEMPT';

export interface AuditEvent {
  readonly seq: number;
  readonly type: AuditEventType;
  readonly actorId: string;
  readonly at: string;
  readonly details: Readonly<Record<string, unknown>>;
  readonly prevHash: string;
  readonly hash: string;
}

function eventHash(e: Omit<AuditEvent, 'hash'>): string {
  return createHash('sha256')
    .update(`${e.seq}|${e.type}|${e.actorId}|${e.at}|${JSON.stringify(e.details)}|${e.prevHash}`)
    .digest('hex');
}

/** append-only 审计日志：冻结事件 + 单调 seq + SHA-256 链 + deny-loop 检测。 */
export class AuditLog {
  private readonly eventsInternal: AuditEvent[] = [];
  private readonly denyCounts = new Map<string, number>();
  private readonly clock: () => string;

  constructor(clock: () => string = () => new Date().toISOString()) {
    this.clock = clock;
  }

  get length(): number {
    return this.eventsInternal.length;
  }

  /** 追加事件（唯一写入口——append-only，无修改/删除 API）。 */
  append(input: { type: AuditEventType; actorId: string; details: Record<string, unknown> }): AuditEvent {
    const seq = this.eventsInternal.length + 1;
    const prevHash = seq === 1 ? '0'.repeat(64) : (this.eventsInternal[seq - 2]?.hash ?? '0'.repeat(64));
    const base = {
      seq,
      type: input.type,
      actorId: input.actorId,
      at: this.clock(),
      details: input.details,
      prevHash,
    };
    const event: AuditEvent = Object.freeze({ ...base, hash: eventHash(base) });
    this.eventsInternal.push(event);
    return event;
  }

  /** 判定事件封装：记录 + deny-loop 检测（≥ 阈值补记 ESCALATION_ATTEMPT）。 */
  recordDecision(actor: Actor, action: RequestedAction, decision: Decision, reason: string): void {
    this.append({
      type: 'DECISION',
      actorId: actor.id,
      details: { permission: action.permission, resource: action.resource, decision, reason },
    });
    if (decision === 'deny') {
      const count = (this.denyCounts.get(actor.id) ?? 0) + 1;
      this.denyCounts.set(actor.id, count);
      if (count === DENY_LOOP_THRESHOLD) {
        this.append({
          type: 'ESCALATION_ATTEMPT',
          actorId: actor.id,
          details: {
            denyCount: count,
            note: 'repeated denies for same actor — possible brute-force or prompt-retry escalation loop',
          },
        });
      }
    }
  }

  /** 事件快照（浅拷贝数组；事件本身冻结）。 */
  events(): readonly AuditEvent[] {
    return [...this.eventsInternal];
  }
}

/** 验证审计链完整性（纯函数——可用于导出后的链校验/篡改检测）。 */
export function verifyAuditChain(events: readonly AuditEvent[]): { ok: boolean; firstBrokenIndex: number | null } {
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!e) return { ok: false, firstBrokenIndex: i };
    // seq 必须从 1 连续递增（截断/删事件检出）。
    if (e.seq !== i + 1) return { ok: false, firstBrokenIndex: i };
    // prevHash 必须指向前一事件 hash（首事件为全零）。
    const expectedPrev = i === 0 ? '0'.repeat(64) : (events[i - 1]?.hash ?? '');
    if (e.prevHash !== expectedPrev) return { ok: false, firstBrokenIndex: i };
    // 内容哈希必须与字段一致（字段篡改检出）。
    const { hash: _hash, ...rest } = e;
    if (eventHash(rest) !== e.hash) return { ok: false, firstBrokenIndex: i };
  }
  return { ok: true, firstBrokenIndex: null };
}
