/**
 * campaign/replay — 战役账本确定性重放（2.md §10 R10 补遗·night-r7 S3 T1 本体）。
 *
 * `far campaign replay` 的引擎：seed（即事件账本）+ 确定性折叠 → 一次调用同时
 * 产出三件套——完整时间线（看见系统在想什么）+ 折叠终态 + 哈希链校验。
 * 零 LLM、零网络：纯账本重放，"时间机器"表面。
 *
 * diffCampaignReplays：两份重放（同一战役不同时刻 / 账本副本 / 实现变更前后）
 * 的 timeline 逐位对照 → 首个分歧点（实现变更后的行为回归检测）。比较维度 =
 * 事件 type + summary + 长度（契约规定）；at 时间戳刻意不比——它是记录时点
 * 的事实而非行为。单侧终止的语义（诚实定义）：分歧定位在更长一侧的首个多出
 * 事件，终止侧 type 记为 TIMELINE_END 哨兵（导出常量，不与真实事件类型混淆）。
 *
 * Cannot-prove（不可隐藏）：
 *   - 重放证明「账本一致且可复现折叠」；它不重新执行底层研究 run——那是每个
 *     run 自身 checkpoint / replay 表面的职责。
 *   - 链校验通过不证明事件对 run 的断言为真（与 run 文件的交叉锚定是
 *     store / loader 的验证面）。
 */

import { basename, resolve } from 'node:path';

import {
  deriveCampaignState,
  readCampaignEvents,
  verifyCampaignEventChain,
} from './event_log.ts';
import type { CampaignEvent, CampaignState } from './types.ts';

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 时间线单条（seq 为时间权威；summary 为表现层·尽力提取，不参与链校验）。 */
export interface CampaignTimelineEntry {
  readonly seq: number;
  readonly at: string;
  readonly type: string;
  readonly summary: string;
}

/** 一次完整重放的产物：时间线 + 折叠终态 + 链校验（三件套）。 */
export interface CampaignReplay {
  readonly state: CampaignState;
  readonly verification: {
    readonly valid: boolean;
    readonly firstBrokenIndex: number | null;
    readonly reason: string | null;
  };
  readonly timeline: readonly CampaignTimelineEntry[];
}

export interface CampaignReplayDiff {
  readonly identical: boolean;
  readonly firstDivergence: {
    readonly seq: number;
    readonly aType: string;
    readonly bType: string;
  } | null;
}

/** 单侧时间线终止时的哨兵类型（表现层常量；不与真实事件类型混淆）。 */
export const TIMELINE_END = '(timeline end)';

// ---------------------------------------------------------------------------
// 摘要
// ---------------------------------------------------------------------------

/**
 * 事件单行摘要（表现层·确定性）：对契约事件（6 种调度 + 8 种 HITL 审计，
 * SCI-HITL-001 additive）给人读的格式化。payload 是封闭判别联合（读盘经
 * 结构校验），switch 穷尽——漏 case 在编译期暴露（default 分支的 never
 * 赋值）。摘要只服务时间线可读性与 diff，不参与链校验或状态折叠。
 */
export function summarizeCampaignEvent(event: CampaignEvent): string {
  const payload = event.payload;
  switch (payload.type) {
    case 'campaign_started':
      return `topic "${payload.topic}", budget ${payload.budgetTokens} tokens, ${payload.plannedQuestions.length} questions planned`;
    case 'question_started':
      return `Q${payload.index}: ${payload.question}`;
    case 'question_completed':
      return `Q${payload.index} -> run ${payload.runId} (${payload.tokens} tokens)`;
    case 'question_failed':
      return `Q${payload.index} FAILED [${payload.errorKind}]: ${payload.detail}`;
    case 'budget_breaker_tripped':
      return `breaker tripped at ${payload.cumulativeTokens} tokens (${payload.remainingQuestions} questions remaining)`;
    case 'campaign_completed':
      return `campaign completed: ${payload.completedCount} OK / ${payload.failedCount} failed / ${payload.totalTokens} tokens`;
    // ── SCI-HITL-001 additive：人类输入审计事件的重放摘要（只服务时间线
    //    可读性，与调度投影/状态折叠无关——分层铁律同 deriveCampaignState）──
    case 'prior_injected':
      return `human prior '${payload.priorId}' injected by ${payload.actor} (kind=${payload.kind})`;
    case 'annotation':
      return `annotation on ${payload.targetId} by ${payload.actor}: ${payload.note}`;
    case 'resource_veto':
      return `resource veto by ${payload.actor} on '${payload.resource}': ${payload.reason}`;
    case 'revision_requested':
      return `revision requested on ${payload.targetId} by ${payload.actor}: ${payload.note}`;
    case 'campaign_paused':
      return `campaign paused by ${payload.actor}: ${payload.reason}`;
    case 'campaign_resumed':
      return `campaign resumed by ${payload.actor}: ${payload.reason}`;
    case 'risk_accepted':
      return `risk accepted by ${payload.actor}: ${payload.riskDescription} (${payload.acknowledgement})`;
    case 'human_event_reverted':
      return `event seq ${payload.revertedSeq} reverted by ${payload.actor}: ${payload.reason} (audit trail preserved)`;
    default: {
      const unreachable: never = payload; // 穷尽性护栏：漏 case 编译期报错
      return String(unreachable);
    }
  }
}

// ---------------------------------------------------------------------------
// 重放
// ---------------------------------------------------------------------------

/**
 * replayCampaignLedger —— 读取账本目录并确定性重放。
 *
 *   - 链校验作用于「读取序」（记录序）——篡改检测面对的是磁盘上的真实顺序；
 *   - 时间线按 seq 稳定升序（seq 是时间权威；重放输出的顺序不依赖磁盘行序）；
 *   - campaignId 取目录名 basename（调用方传战役目录；derive 以此为状态标识）。
 */
export function replayCampaignLedger(dir: string): CampaignReplay {
  const events = readCampaignEvents(dir);
  const verification = verifyCampaignEventChain(events);
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  const campaignId = basename(resolve(dir));
  const state = deriveCampaignState(campaignId, events);
  const timeline = ordered.map((event) => ({
    seq: event.seq,
    at: event.at,
    type: event.payload.type,
    summary: summarizeCampaignEvent(event),
  }));
  return { state, verification, timeline };
}

/**
 * diffCampaignReplays —— 两份重放时间线的首个分歧检测（行为回归）。
 *
 * 分歧定义（诚实）：首个 type 或 summary 不同的下标，或单侧终止处
 * （终止侧 type = TIMELINE_END；seq = 更长一侧首个多出事件的 seq）。
 * 两线逐位相同且等长 → identical: true。
 */
export function diffCampaignReplays(a: CampaignReplay, b: CampaignReplay): CampaignReplayDiff {
  const length = Math.max(a.timeline.length, b.timeline.length);
  for (let i = 0; i < length; i += 1) {
    const ta = a.timeline[i];
    const tb = b.timeline[i];
    if (ta === undefined || tb === undefined) {
      const present = (ta ?? tb)!; // length = max 保证至少一侧存在
      return {
        identical: false,
        firstDivergence: {
          seq: present.seq,
          aType: ta !== undefined ? ta.type : TIMELINE_END,
          bType: tb !== undefined ? tb.type : TIMELINE_END,
        },
      };
    }
    if (ta.type !== tb.type || ta.summary !== tb.summary) {
      return {
        identical: false,
        firstDivergence: { seq: ta.seq, aType: ta.type, bType: tb.type },
      };
    }
  }
  return { identical: true, firstDivergence: null };
}
