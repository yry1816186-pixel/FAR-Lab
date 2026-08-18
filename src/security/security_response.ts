/**
 * security_response — OSS-SECURITY-001 安全响应流程（SSOT + 公告 + 演练）。
 *
 * 职责：
 *   - SECURITY_POLICY：私密报告渠道（GitHub Private Vulnerability Reporting 主
 *     渠道 + email 回退——与仓库根 SECURITY.md 的路由一致）、supported
 *     versions、CVE/公告策略、credit 政策、embargo 政策；
 *   - `renderAdvisory(input)`：结构化安全公告（受影响版本/严重度/embargo 日期/
 *     credits/验证步骤）——确定性渲染（无墙钟/无随机），embargo 早于发布拒绝；
 *   - `runTabletopDrill(timeline)`：报告到达 → 确认(SLA 24h) → triage →
 *     embargo → 修复 → 公告发布 → 验证 的七步状态机演练——每步带时间戳、
 *     SLA 违约检出（ack 24h / 各严重度修复目标）、乱序转移检出；
 *   - `checkSecurityPolicyAssets(repoRoot)`：验证仓库根 SECURITY.md 真实存在
 *     且包含必需章节（Supported Versions / Reporting a Vulnerability /
 *     Disclosure Policy）。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - 演练证明「流程状态机可执行且 SLA 计算正确」，不证明真实事件中有人
 *     响应——24h ack 是目标而非保证；`checkSecurityPolicyAssets` 证明文件
 *     存在且章节在，不证明其内容被人读过/遵守；
 *   - 公告模板不验证 CVE 编号真实性（CVE 分配是外部机构流程）；
 *   - 演练时间线由调用方注入——本模块不验证其与真实墙钟一致。
 *
 * 模型中立。零容忍合规：无 any 类型注解、ts 抑制指令、双重断言、空 catch。
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// policy SSOT
// ---------------------------------------------------------------------------

export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low';

export interface ContactChannel {
  readonly id: string;
  readonly route: string;
  readonly primary: boolean;
  /** 私密渠道（禁止用公开 issue 报安全漏洞）。 */
  readonly private: boolean;
  readonly note?: string;
}

export interface SupportedVersion {
  readonly version: string;
  readonly support: 'full' | 'best-effort' | 'none';
}

export const SECURITY_POLICY = {
  contactChannels: [
    {
      id: 'github-private-advisory',
      route: 'https://github.com/yry1816186-pixel/FAR-Lab/security/advisories/new',
      primary: true,
      private: true,
      note: '主渠道——GitHub Private Vulnerability Reporting（无需额外设置）',
    },
    {
      id: 'email',
      route: 'security@far-lab.example.com',
      primary: false,
      private: true,
      note: '回退渠道——占位地址（NEEDS_MAINTAINER_ASSIGNMENT），真实地址发布前以主渠道为准',
    },
  ] as readonly ContactChannel[],
  /** SECURITY.md 明令：禁止为安全漏洞开公开 GitHub issue。 */
  publicIssuesForbidden: true,
  supportedVersions: [
    { version: 'latest main', support: 'full' },
    { version: '< 1.0.0 (pre-release)', support: 'best-effort' },
  ] as readonly SupportedVersion[],
  cvePolicy:
    '确认的漏洞走 GitHub Security Advisories 发布；CVE 编号由 GitHub/外部 CNA 分配；未修复漏洞的细节按风险 embargo（修复+公告前不公开技术细节）。',
  creditPolicy: '报告者自愿署名（默认匿名）；致谢名单随公告发布；报告者可选择延迟公开署名。',
  embargoPolicy: '漏洞细节在修复发布且 embargo 到期前不公开；embargo 日期必须不早于公告发布时间（renderAdvisory 强制）。',
} as const;

/** 确认（acknowledgement）SLA：24 小时（宪法 SEC tabletop 演练目标）。 */
export const ACK_SLA_HOURS = 24;

/** 各严重度修复发布目标（小时·单调：critical ≤ high ≤ medium ≤ low）。 */
export const FIX_TARGET_HOURS: Readonly<Record<SeverityLevel, number>> = {
  critical: 72,
  high: 168,
  medium: 720,
  low: 2160,
};

// ---------------------------------------------------------------------------
// advisory 渲染
// ---------------------------------------------------------------------------

export interface AdvisoryInput {
  readonly advisoryId: string;
  readonly title: string;
  readonly severity: SeverityLevel;
  readonly affectedVersions: readonly string[];
  readonly description: string;
  readonly receivedAt: string;
  readonly releasedAt: string;
  readonly embargoUntil: string;
  readonly reporterCredit: { readonly name: string; readonly consented: boolean };
  readonly fixCommit?: string;
  readonly verificationSteps: readonly string[];
}

export interface RenderedAdvisory {
  readonly advisoryId: string;
  readonly title: string;
  readonly severity: SeverityLevel;
  readonly affectedVersions: readonly string[];
  readonly summary: string;
  readonly embargoUntil: string;
  readonly credits: string;
  readonly fixCommit: string | null;
  readonly verificationSteps: readonly string[];
  readonly published: boolean;
}

function parseTs(s: string): number {
  const t = Date.parse(s);
  if (Number.isNaN(t)) {
    throw new Error(`security_response: invalid ISO timestamp: ${s}`);
  }
  return t;
}

/**
 * 渲染结构化公告。校验：severity 必须是四级之一；受影响版本非空；
 * embargoUntil 不得早于 releasedAt（公开细节早于 embargo = 违规）。
 * 确定性：同输入字节相同（无墙钟注入）。
 */
export function renderAdvisory(input: AdvisoryInput): RenderedAdvisory {
  const levels: readonly SeverityLevel[] = ['critical', 'high', 'medium', 'low'];
  if (!levels.includes(input.severity)) {
    throw new Error(`renderAdvisory: unknown severity '${input.severity}' (must be critical|high|medium|low)`);
  }
  if (input.affectedVersions.length === 0) {
    throw new Error('renderAdvisory: affectedVersions must be non-empty (at least one affected range)');
  }
  if (parseTs(input.embargoUntil) < parseTs(input.releasedAt)) {
    throw new Error(
      `renderAdvisory: embargo (${input.embargoUntil}) precedes release (${input.releasedAt}) — details must stay embargoed until after release`,
    );
  }
  return {
    advisoryId: input.advisoryId,
    title: input.title,
    severity: input.severity,
    affectedVersions: [...input.affectedVersions],
    summary: `${input.title} — ${input.description}`,
    embargoUntil: input.embargoUntil,
    credits: input.reporterCredit.consented ? input.reporterCredit.name : 'anonymous reporter',
    fixCommit: input.fixCommit ?? null,
    verificationSteps: [...input.verificationSteps],
    published: true,
  };
}

// ---------------------------------------------------------------------------
// tabletop 演练状态机
// ---------------------------------------------------------------------------

export const TABLETOP_STATES = [
  'received',
  'acknowledged',
  'triaged',
  'embargoed',
  'fixing',
  'released',
  'verified',
] as const;
export type TabletopState = (typeof TABLETOP_STATES)[number];

export interface TabletopTimeline {
  readonly reportId: string;
  readonly severity: SeverityLevel;
  readonly receivedAt: string;
  readonly acknowledgedAt: string;
  readonly triagedAt: string;
  readonly embargoedAt: string;
  readonly fixingAt: string;
  readonly releasedAt: string;
  readonly verifiedAt: string;
}

export interface TabletopStep {
  readonly state: TabletopState;
  readonly at: string;
  readonly elapsedHoursFromReceipt: number;
}

export interface SlaViolation {
  readonly stage: 'acknowledgement' | 'fix-release';
  readonly slaHours: number;
  readonly actualHours: number;
}

export interface TabletopReport {
  readonly drillId: string;
  readonly reportId: string;
  readonly severity: SeverityLevel;
  readonly outcome: 'pass' | 'pass-with-violations' | 'invalid';
  readonly steps: readonly TabletopStep[];
  readonly violations: readonly SlaViolation[];
  readonly invalidTransitions: readonly { readonly from: TabletopState; readonly to: TabletopState; readonly detail: string }[];
}

function hoursBetween(fromIso: string, toIso: string): number {
  return (parseTs(toIso) - parseTs(fromIso)) / 3_600_000;
}

/**
 * 安全响应桌面演练：七步状态机全序推进。乱序/同刻转移 → outcome 'invalid'；
 * SLA 违约（ack > 24h；released 超 severity 修复目标）→ 'pass-with-violations'。
 */
export function runTabletopDrill(t: TabletopTimeline): TabletopReport {
  const order: readonly [TabletopState, string][] = [
    ['received', t.receivedAt],
    ['acknowledged', t.acknowledgedAt],
    ['triaged', t.triagedAt],
    ['embargoed', t.embargoedAt],
    ['fixing', t.fixingAt],
    ['released', t.releasedAt],
    ['verified', t.verifiedAt],
  ];
  const invalidTransitions: { from: TabletopState; to: TabletopState; detail: string }[] = [];
  for (let i = 1; i < order.length; i++) {
    const prev = order[i - 1];
    const cur = order[i];
    if (prev === undefined || cur === undefined) continue;
    // 严格单调：每步必须严格晚于前一步（同刻 = 缺步/零长步骤 → 非法）。
    if (parseTs(cur[1]) <= parseTs(prev[1])) {
      invalidTransitions.push({
        from: prev[0],
        to: cur[0],
        detail: `state order violated: ${cur[0]} (${cur[1]}) not strictly after ${prev[0]} (${prev[1]}) — sequence must be strictly monotonic`,
      });
    }
  }
  const steps: TabletopStep[] = order.map(([state, at]) => ({
    state,
    at,
    elapsedHoursFromReceipt: hoursBetween(t.receivedAt, at),
  }));
  if (invalidTransitions.length > 0) {
    return {
      drillId: `tabletop-${t.reportId}`,
      reportId: t.reportId,
      severity: t.severity,
      outcome: 'invalid',
      steps,
      violations: [],
      invalidTransitions,
    };
  }
  const violations: SlaViolation[] = [];
  const ackHours = hoursBetween(t.receivedAt, t.acknowledgedAt);
  if (ackHours > ACK_SLA_HOURS) {
    violations.push({ stage: 'acknowledgement', slaHours: ACK_SLA_HOURS, actualHours: ackHours });
  }
  const fixHours = hoursBetween(t.receivedAt, t.releasedAt);
  const target = FIX_TARGET_HOURS[t.severity];
  if (fixHours > target) {
    violations.push({ stage: 'fix-release', slaHours: target, actualHours: fixHours });
  }
  return {
    drillId: `tabletop-${t.reportId}`,
    reportId: t.reportId,
    severity: t.severity,
    outcome: violations.length > 0 ? 'pass-with-violations' : 'pass',
    steps,
    violations,
    invalidTransitions: [],
  };
}

// ---------------------------------------------------------------------------
// SECURITY.md 资产验证
// ---------------------------------------------------------------------------

export interface PolicyAssetCheck {
  readonly ok: boolean;
  readonly securityMdFound: boolean;
  readonly missing: readonly string[];
  readonly requiredSections: readonly string[];
}

/**
 * 验证仓库安全响应资产：SECURITY.md 存在 + 三个必需章节
 * （supported versions / 报告渠道 / 披露流程）。
 */
export function checkSecurityPolicyAssets(repoRoot: string): PolicyAssetCheck {
  const requiredSections = ['Supported Versions', 'Reporting a Vulnerability', 'Disclosure Policy'] as const;
  const securityMdPath = join(repoRoot, 'SECURITY.md');
  if (!existsSync(securityMdPath)) {
    return { ok: false, securityMdFound: false, missing: ['SECURITY.md'], requiredSections: [...requiredSections] };
  }
  const content = readFileSync(securityMdPath, 'utf8');
  const missing: string[] = [];
  for (const section of requiredSections) {
    if (!content.includes(section)) {
      missing.push(`section: ${section}`);
    }
  }
  return { ok: missing.length === 0, securityMdFound: true, missing, requiredSections: [...requiredSections] };
}
