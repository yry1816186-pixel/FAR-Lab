/**
 * campaign/store — 战役目录布局 + 事件台账门面（night-r7 S2）。
 *
 * 把 drive-day2.mjs 式手工驱动（幂等 / fail-visibly）沉淀为可复用的存储层：
 *   - ID/目录约定：CAMPAIGNS_ROOT 下每战役一目录，campaignId = 目录名，
 *     形如 cmp-<yyyymmdd-hhmmss UTC>-<slug8>（slug 取 topic 小写 ascii-alnum
 *     的 kebab 形式前 8 字符；无 ascii 字符时回退 'topic'）。campaignId 是
 *     deriveCampaignState 的输入之一 —— 本模块用 basename(dir) 作为 campaignId
 *     （campaign_started payload 不含 id，目录名即身份，见模块文档约定）。
 *   - 台账读-验-写编排：追加前先验证既有链（拒绝在坏链上追加，与
 *     registry_anchor.appendRegistryAnchor 同纪律）；加载 = 读 + 验链 + 重放推导。
 *   - fail-closed：链断裂 / 空台账 → CorruptCampaignLedgerError（带
 *     firstBrokenIndex/reason），绝不静默截断。
 *
 * 单写者假设：每个战役目录同一时刻只允许一个进程写入（与发现注册表同假设）。
 * 追加 = 读全文 + 追加一行，无文件锁；两进程并发写同目录会互相覆盖尾事件 → 禁止。
 *
 * Cannot-prove（本机制不能证明什么）：
 *   - 哈希链证明的是「事件顺序与内容未被篡改」（完整性），不证明事件内容为真 ——
 *     tokens 数额 / runId 归属由 runQuestion 执行器如实上报，本层不校验其与
 *     真实 API 计量的对应；
 *   - campaignId 时间戳是本地 UTC 钟，同秒内同 topic 的两次 newCampaignId 会
 *     碰撞（调用方需自行避开或加后缀）。
 */

import { mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

import {
  appendCampaignEvent,
  buildCampaignEvent,
  deriveCampaignState,
  readCampaignEvents,
  verifyCampaignEventChain,
} from './event_log.ts';
import type { CampaignEvent, CampaignEventPayload, CampaignState } from './types.ts';

/** 战役根目录（gitignored 运行时产物区，绝不入仓库根）。 */
export const CAMPAIGNS_ROOT = '.far/campaigns';

/** 台账损坏（哈希链断裂 / 空台账）—— fail-closed 类型化错误。 */
export class CorruptCampaignLedgerError extends Error {
  readonly dir: string;
  readonly firstBrokenIndex: number | null;
  readonly reason: string | null;

  constructor(dir: string, firstBrokenIndex: number | null, reason: string | null) {
    super(
      `corrupt campaign ledger at ${dir}: firstBrokenIndex=${firstBrokenIndex ?? 'n/a'} reason=${reason ?? 'unknown'}`,
    );
    this.name = 'CorruptCampaignLedgerError';
    this.dir = dir;
    this.firstBrokenIndex = firstBrokenIndex;
    this.reason = reason;
  }
}

/** topic → 小写 kebab slug，取前 8 字符（去尾连字符）；无 ascii 字符回退 'topic'。 */
function slugifyTopic(topic: string): string {
  const kebab = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return kebab.slice(0, 8).replace(/-+$/g, '') || 'topic';
}

/**
 * 生成战役 ID：cmp-<yyyymmdd-hhmmss UTC>-<slug8>。
 * 纯函数：同 topic + 同时钟 → 同 ID（钟默认取当前时刻，测试注入固定时钟）。
 */
export function newCampaignId(topic: string, now: Date = new Date()): string {
  const pad = (n: number, width: number) => String(n).padStart(width, '0');
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1, 2)}${pad(now.getUTCDate(), 2)}` +
    `-${pad(now.getUTCHours(), 2)}${pad(now.getUTCMinutes(), 2)}${pad(now.getUTCSeconds(), 2)}`;
  return `cmp-${stamp}-${slugifyTopic(topic)}`;
}

/** 战役目录 = <root>/<campaignId>（root 默认 CAMPAIGNS_ROOT；测试可传 tmp 目录）。 */
export function campaignDir(campaignId: string, root: string = CAMPAIGNS_ROOT): string {
  return join(root, campaignId);
}

export interface SaveCampaignStartedInput {
  readonly topic: string;
  /** 计划问题清单（来自 planner）；顺序即 index 0..n-1。 */
  readonly plannedQuestions: string[];
  readonly budgetTokens: number;
  /** 注入时钟（测试确定性）；默认真实时刻。 */
  readonly now?: () => Date;
}

/** 追加 campaign_started（seq 1, prev ''）。台账已有事件 → 抛错（幂等防重，fail-closed）。 */
export function saveCampaignStarted(
  dir: string,
  input: SaveCampaignStartedInput,
): CampaignEvent {
  const existing = readCampaignEvents(dir);
  if (existing.length > 0) {
    throw new Error(
      `saveCampaignStarted: ledger at ${dir} already has ${existing.length} event(s) — refusing to start a campaign twice (fail-closed idempotency guard)`,
    );
  }
  const at = (input.now ?? (() => new Date()))().toISOString();
  const event = buildCampaignEvent(
    1,
    at,
    {
      type: 'campaign_started',
      topic: input.topic,
      plannedQuestions: input.plannedQuestions,
      budgetTokens: input.budgetTokens,
    },
    '',
  );
  mkdirSync(dir, { recursive: true });
  appendCampaignEvent(dir, event);
  return event;
}

export interface LoadedCampaign {
  readonly events: CampaignEvent[];
  readonly state: CampaignState;
}

/**
 * 加载战役：读台账 → 验链（断裂 → CorruptCampaignLedgerError）→ 重放推导状态。
 * campaignId 取 basename(dir)（目录名即身份）。空台账同样是损坏（缺 campaign_started）。
 */
export function loadCampaign(dir: string): LoadedCampaign {
  const events = readCampaignEvents(dir);
  if (events.length === 0) {
    throw new CorruptCampaignLedgerError(dir, null, 'empty ledger (missing campaign_started)');
  }
  const chain = verifyCampaignEventChain(events);
  if (!chain.valid) {
    throw new CorruptCampaignLedgerError(dir, chain.firstBrokenIndex, chain.reason);
  }
  const state = deriveCampaignState(basename(dir), events);
  return { events, state };
}

/**
 * 追加一条事件：读尾（seq/prevEventHash）→ buildCampaignEvent → 落盘。
 * 追加前验证既有链 —— 坏链上拒绝追加（防在篡改后的台账上续写）。
 * 单写者假设见模块文档。返回新事件（含 eventHash）。
 */
export function appendEvent(
  dir: string,
  payload: CampaignEventPayload,
  now: () => Date = () => new Date(),
): CampaignEvent {
  const events = readCampaignEvents(dir);
  const chain = verifyCampaignEventChain(events);
  if (!chain.valid) {
    throw new CorruptCampaignLedgerError(dir, chain.firstBrokenIndex, chain.reason);
  }
  const tail = events.at(-1);
  const event = buildCampaignEvent(
    tail === undefined ? 1 : tail.seq + 1,
    now().toISOString(),
    payload,
    tail === undefined ? '' : tail.eventHash,
  );
  mkdirSync(dir, { recursive: true });
  appendCampaignEvent(dir, event);
  return event;
}
