/**
 * campaign/event_log — 战役事件台账：append-only 哈希链 + 纯状态折叠（night-r7 S1）。
 *
 * 防篡改语义（与 discovery/registry 同构）：eventHash 覆盖
 * {seq, at, payload, prevEventHash}（自身除外），prevEventHash 指向前一行——
 * 任何对历史行的编辑/乱序/截断都会断链并被 verifyCampaignEventChain 检出。
 * 状态（CampaignState）永远从事件纯折叠（deriveCampaignState），删除派生存物
 * 只损失便利、不损失历史。
 *
 * 零熵纪律：本模块不读时钟、不产生随机性；`at` 由调用方注入（调度器注入
 * 统一时钟源，测试注入固定值），保证同输入恒等输出。
 *
 * Fail-closed 状态机不变量（deriveCampaignState 抛错，绝不静默修复）：
 *   I1 首个事件必须是 campaign_started；任何先于它的事件 → 抛错；
 *   I2 campaign_started 唯一——第二条 → 抛错；
 *   I3 问题事件必须引用已规划的 index 且 question 文本与规划一致（索引/文本
 *      失配是台账矛盾）→ 抛错；
 *   I4 question_started 只作用于 pending 或 failed 问题：failed→running 是
 *      合法转移（崩溃恢复重试——scheduler 契约修订：running 残留补记 failed 后
 *      允许重开一次）；重开 running、重试已 OK 的终态问题 → 抛错；
 *   I5 question_completed/question_failed 只作用于 running 问题——因此重复终态
 *      事件、未 start 即终态 → 抛错（契约指定的 duplicate-terminal 防线）；
 *   I6 campaign_completed 唯一——重复收尾 → 抛错；
 *   I7 budget_breaker_tripped 只置旗（幂等）：其 cumulativeTokens 载荷是快照
 *      登记，token 累计只来自 question_completed（快照不改账）。
 *
 * Cannot-prove（不可隐藏）：事件台账证明的是战役记录的内部一致性（append-only
 * 链上记了什么、何时由本机钟标定）；它不证明被引用的 run（runId）本身健全——
 * 那是 run/verify 链的职责——也不证明 `at` 时间的外部效力（本地钟无第三方锚定）。
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { hashCanonicalJson } from '../evidence_log/hasher.ts';
import type { CampaignEvent, CampaignEventPayload, CampaignState } from './types.ts';

// 单一入口 re-export（兄弟模块 scheduler/store/report 与测试统一从 event_log 取契约类型）。
export type { CampaignEvent, CampaignEventPayload, CampaignState, CampaignQuestionState } from './types.ts';

/** 战役目录内事件台账文件名（兄弟模块 scheduler/store 与本模块的唯一命名约定）。 */
export const CAMPAIGN_EVENTS_FILENAME = 'events.jsonl';

/** 台账文件路径（dir = 战役根目录，如 `.far/campaigns/<campaignId>/`）。 */
export function campaignEventsPath(dir: string): string {
  return join(dir, CAMPAIGN_EVENTS_FILENAME);
}

/**
 * 构造一条台账事件（纯函数）：eventHash = hashCanonicalJson({seq, at, payload,
 * prevEventHash})——覆盖除自身外的全部字段（镜像 registry.ts 的 verifyRecordHash 模式）。
 * 创世事件（链首）的 prevEventHash 必须为 ''。
 */
export function buildCampaignEvent(
  seq: number,
  at: string,
  payload: CampaignEventPayload,
  prevEventHash: string,
): CampaignEvent {
  const core = { seq, at, payload, prevEventHash };
  return { ...core, eventHash: hashCanonicalJson(core) };
}

export interface CampaignChainVerification {
  readonly valid: boolean;
  readonly firstBrokenIndex: number | null;
  readonly reason: string | null;
}

/** 验证事件链：逐事件哈希重算 + prev 链接（镜像 verifyDiscoveryRegistryChain 语义）。 */
export function verifyCampaignEventChain(events: readonly CampaignEvent[]): CampaignChainVerification {
  let prev = '';
  for (let i = 0; i < events.length; i += 1) {
    const event = events[i]!;
    const { eventHash: _ignored, ...core } = event;
    if (hashCanonicalJson(core) !== event.eventHash) {
      return { valid: false, firstBrokenIndex: i, reason: `event ${i}: eventHash mismatch (content tampered)` };
    }
    if (event.prevEventHash !== prev) {
      return {
        valid: false,
        firstBrokenIndex: i,
        reason: `event ${i}: prevEventHash breaks the chain (reorder/edit/truncation)`,
      };
    }
    prev = event.eventHash;
  }
  return { valid: true, firstBrokenIndex: null, reason: null };
}

const EVENT_TYPES = new Set([
  'campaign_started',
  'question_started',
  'question_completed',
  'question_failed',
  'budget_breaker_tripped',
  'campaign_completed',
  // SCI-HITL-001 additive：人类输入审计事件（随主台账链，不改调度投影）。
  'prior_injected',
  'annotation',
  'resource_veto',
  'revision_requested',
  'campaign_paused',
  'campaign_resumed',
  'risk_accepted',
  'human_event_reverted',
]);
/** SCI-HITL-001 事件子集（结构校验走表驱动的 validateHumanLoopEventShape）。 */
const HUMAN_LOOP_EVENT_TYPES = new Set([
  'prior_injected',
  'annotation',
  'resource_veto',
  'revision_requested',
  'campaign_paused',
  'campaign_resumed',
  'risk_accepted',
  'human_event_reverted',
]);
/**
 * HITL 事件的必填非空字符串字段表（表驱动——append-only 校验面，新增
 * 事件类型在这里加一行，不增加 switch 复杂度预算）。
 */
const HITL_REQUIRED_STRING_FIELDS: Readonly<Record<string, readonly string[]>> = {
  prior_injected: ['priorId', 'actor', 'statement'],
  annotation: ['targetId', 'actor', 'note'],
  resource_veto: ['actor', 'resource', 'reason'],
  revision_requested: ['targetId', 'actor', 'note'],
  campaign_paused: ['actor', 'reason'],
  campaign_resumed: ['actor', 'reason'],
  risk_accepted: ['actor', 'riskDescription', 'acknowledgement'],
  human_event_reverted: ['actor', 'reason'],
};
const ERROR_KINDS = new Set(['rate_limited', 'model_output_invalid', 'unknown']);
const SHA256_HEX = /^[0-9a-f]{64}$/;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isCount(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/**
 * HITL 事件结构校验（SCI-HITL-001；表驱动 + 两条类型特例）：
 *   prior_injected.kind 铁律（恒 'context'）；
 *   human_event_reverted.revertedSeq 必须是正整数（引用被回滚台账 seq）。
 */
function validateHumanLoopEventShape(p: Record<string, unknown>, errors: string[]): void {
  const type = String(p['type']);
  for (const field of HITL_REQUIRED_STRING_FIELDS[type] ?? []) {
    if (!isNonEmptyString(p[field])) errors.push(`${type}.${field} must be a non-empty string`);
  }
  if (type === 'prior_injected' && p['kind'] !== 'context') {
    errors.push("prior_injected.kind must be 'context' (layering rule: human priors are never evidence)");
  }
  if (type === 'human_event_reverted' && (!isCount(p['revertedSeq']) || (p['revertedSeq'] as number) < 1)) {
    errors.push('human_event_reverted.revertedSeq must be a positive integer (references the reverted ledger seq)');
  }
}

/** 结构校验（读盘后、进状态机前；镜像 registry 的 parseRecordLine 卫生）。 */
function validateCampaignEventShape(value: unknown, lineIndex: number): CampaignEvent {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`campaign event line ${lineIndex + 1} invalid: not an object`);
  }
  const e = value as Record<string, unknown>;
  const errors: string[] = [];
  if (!isCount(e['seq']) || e['seq']! < 1) errors.push('seq must be a positive integer');
  if (!isNonEmptyString(e['at'])) errors.push('at must be a non-empty string');

  const payload = e['payload'];
  if (typeof payload !== 'object' || payload === null) {
    errors.push('payload must be an object');
  } else {
    const p = payload as Record<string, unknown>;
    if (typeof p['type'] !== 'string' || !EVENT_TYPES.has(p['type'])) {
      errors.push(`payload.type must be one of ${[...EVENT_TYPES].join('|')}`);
    } else if (HUMAN_LOOP_EVENT_TYPES.has(p['type'])) {
      // SCI-HITL-001：人类输入事件走表驱动校验（复杂度预算独立于调度事件 switch）。
      validateHumanLoopEventShape(p, errors);
    } else {
      switch (p['type']) {
        case 'campaign_started':
          if (!isNonEmptyString(p['topic'])) errors.push('campaign_started.topic must be a non-empty string');
          if (!Array.isArray(p['plannedQuestions']) || !p['plannedQuestions'].every(isNonEmptyString)) {
            errors.push('campaign_started.plannedQuestions must be an array of non-empty strings');
          }
          if (!isCount(p['budgetTokens'])) errors.push('campaign_started.budgetTokens must be a non-negative integer');
          // Additive (night-r8): optional provenance for where the questions came from.
          if (p['questionsSource'] !== undefined && p['questionsSource'] !== 'explicit' && p['questionsSource'] !== 'llm') {
            errors.push("campaign_started.questionsSource must be 'explicit'|'llm' when present");
          }
          break;
        case 'question_started':
          if (!isCount(p['index'])) errors.push('question_started.index must be a non-negative integer');
          if (!isNonEmptyString(p['question'])) errors.push('question_started.question must be a non-empty string');
          break;
        case 'question_completed':
          if (!isCount(p['index'])) errors.push('question_completed.index must be a non-negative integer');
          if (!isNonEmptyString(p['question'])) errors.push('question_completed.question must be a non-empty string');
          if (!isNonEmptyString(p['runId'])) errors.push('question_completed.runId must be a non-empty string');
          if (!isCount(p['tokens'])) errors.push('question_completed.tokens must be a non-negative integer');
          if (p['status'] !== 'OK') errors.push("question_completed.status must be 'OK'");
          break;
        case 'question_failed':
          if (!isCount(p['index'])) errors.push('question_failed.index must be a non-negative integer');
          if (!isNonEmptyString(p['question'])) errors.push('question_failed.question must be a non-empty string');
          if (typeof p['errorKind'] !== 'string' || !ERROR_KINDS.has(p['errorKind'])) {
            errors.push('question_failed.errorKind must be rate_limited|model_output_invalid|unknown');
          }
          if (typeof p['detail'] !== 'string') errors.push('question_failed.detail must be a string');
          break;
        case 'budget_breaker_tripped':
          if (!isCount(p['cumulativeTokens'])) errors.push('budget_breaker_tripped.cumulativeTokens must be a non-negative integer');
          if (!isCount(p['remainingQuestions'])) errors.push('budget_breaker_tripped.remainingQuestions must be a non-negative integer');
          break;
        case 'campaign_completed':
          if (!isCount(p['completedCount'])) errors.push('campaign_completed.completedCount must be a non-negative integer');
          if (!isCount(p['failedCount'])) errors.push('campaign_completed.failedCount must be a non-negative integer');
          if (!isCount(p['totalTokens'])) errors.push('campaign_completed.totalTokens must be a non-negative integer');
          break;
      }
    }
  }

  if (typeof e['prevEventHash'] !== 'string' || !(e['prevEventHash'] === '' || SHA256_HEX.test(e['prevEventHash']))) {
    errors.push('prevEventHash must be "" (genesis) or sha256 hex');
  }
  if (typeof e['eventHash'] !== 'string' || !SHA256_HEX.test(e['eventHash'])) {
    errors.push('eventHash must be sha256 hex');
  }
  if (errors.length > 0) {
    throw new Error(`campaign event line ${lineIndex + 1} invalid: ${errors.join('; ')}`);
  }
  return value as CampaignEvent;
}

/**
 * 读取战役事件台账（目录缺失或文件缺失 → []，首跑语义；损坏行 → 抛错带 cause，
 * fail-closed 不静默截断——镜像 readRegistryAnchors）。
 */
export function readCampaignEvents(dir: string): CampaignEvent[] {
  const path = campaignEventsPath(dir);
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  return lines.map((line, idx) => {
    try {
      return validateCampaignEventShape(JSON.parse(line), idx);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(
          `readCampaignEvents: corrupt event line ${idx + 1} in ${path}: ${error.message}`,
          { cause: error },
        );
      }
      throw error;
    }
  });
}

/**
 * 写入故障注入缝（CAMPAIGN-CHECKPOINT-001 磁盘满测试用）：默认真 fs；测试注入
 * 抛 ENOSPC（含「先写一半再抛」的最坏情形）以确定性验证 fail-closed 与恢复。
 * 缺省行为与本函数历史行为逐字节一致（无行为变更，纯可测性缝）。
 */
export interface CampaignWriteIo {
  writeFileSync(path: string, data: string): void;
}

const REAL_WRITE_IO: CampaignWriteIo = {
  writeFileSync: (path, data) => {
    writeFileSync(path, data, 'utf8');
  },
};

/**
 * 追加一条事件到台账（append-only）。Fail-closed 前置校验：
 *   - 既有链必须验证通过（拒绝向被篡改的台账追加）；
 *   - 新事件的 prevEventHash 必须链到当前链头（空台账要求创世 prev=''）。
 * seq 是调用方持有的排序元数据，链完整性由哈希链保证（不在此强制连续）。
 */
export function appendCampaignEvent(dir: string, event: CampaignEvent, io: CampaignWriteIo = REAL_WRITE_IO): void {
  const existing = readCampaignEvents(dir);
  const chain = verifyCampaignEventChain(existing);
  if (!chain.valid) {
    throw new Error(
      `appendCampaignEvent: refusing to append to a broken campaign ledger (event ${chain.firstBrokenIndex}: ${chain.reason})`,
    );
  }
  const head = existing.at(-1);
  const expectedPrev = head === undefined ? '' : head.eventHash;
  if (event.prevEventHash !== expectedPrev) {
    throw new Error(
      head === undefined
        ? `appendCampaignEvent: genesis event must carry prevEventHash "" (got ${event.prevEventHash.slice(0, 12)}…)`
        : `appendCampaignEvent: event prevEventHash does not chain onto the ledger head (expected ${expectedPrev.slice(0, 12)}…, got ${event.prevEventHash.slice(0, 12)}…)`,
    );
  }
  const path = campaignEventsPath(dir);
  mkdirSync(dirname(path), { recursive: true });
  const line = `${JSON.stringify(event)}\n`;
  io.writeFileSync(
    path,
    existsSync(path) ? readFileSync(path, 'utf8').replace(/\n*$/, '\n') + line : line,
  );
}

/**
 * 纯折叠事件 → 状态（唯一的状态推导路径；无 IO、无时钟）。
 * 违反头部声明的 I1–I6 不变量时抛错（fail-closed 状态机）。
 */
export function deriveCampaignState(campaignId: string, events: readonly CampaignEvent[]): CampaignState {
  let state: CampaignState | null = null;

  for (const [i, event] of events.entries()) {
    const payload = event.payload;
    if (payload.type === 'campaign_started') {
      if (state !== null) {
        throw new Error(`deriveCampaignState: duplicate campaign_started at event ${i} — a campaign starts exactly once (invariant I2)`);
      }
      state = {
        campaignId,
        topic: payload.topic,
        budgetTokens: payload.budgetTokens,
        questions: payload.plannedQuestions.map((question, index) => ({ index, question, status: 'pending' as const })),
        cumulativeTokens: 0,
        breakerTripped: false,
        completed: false,
      };
      continue;
    }
    if (state === null) {
      throw new Error(`deriveCampaignState: event ${i} (${payload.type}) arrives before campaign_started — no campaign to fold into (invariant I1)`);
    }
    state = foldCampaignEvent(state, payload);
  }

  if (state === null) {
    throw new Error('deriveCampaignState: no campaign_started event in the log — cannot derive a campaign state');
  }
  return state;
}

/**
 * 单事件状态转移（纯；state 恒非空——初始化由 deriveCampaignState 的
 * campaign_started 分支负责）。非法转移抛错：I3 索引/文本失配、I4 重开、
 * I5 重复/未 start 终态、I6 重复收尾。
 */
function foldCampaignEvent(state: CampaignState, payload: CampaignEventPayload): CampaignState {
  switch (payload.type) {
    case 'campaign_started':
      // unreachable by construction（外层已分流）；留此防御性处理保持函数全定义
      throw new Error('foldCampaignEvent: campaign_started must initialize via deriveCampaignState, not fold (invariant I2)');
    case 'question_started': {
      const q = questionAt(state, payload);
      if (q.status !== 'pending' && q.status !== 'failed') {
        throw new Error(
          `foldCampaignEvent: question_started on "${payload.question}" (index ${payload.index}) but its status is ${q.status} — reopening running / retrying an OK terminal is illegal (invariant I4)`,
        );
      }
      return {
        ...state,
        questions: state.questions.map((x) => (x.index === payload.index ? { ...x, status: 'running' as const } : x)),
      };
    }
    case 'question_completed': {
      const q = questionAt(state, payload);
      assertStatus(q.status, 'running', payload, 'duplicate or premature terminal event (invariant I5)');
      return {
        ...state,
        questions: state.questions.map((x) => (x.index === payload.index ? { ...x, status: 'OK' as const } : x)),
        cumulativeTokens: state.cumulativeTokens + payload.tokens,
      };
    }
    case 'question_failed': {
      const q = questionAt(state, payload);
      assertStatus(q.status, 'running', payload, 'duplicate or premature terminal event (invariant I5)');
      return {
        ...state,
        questions: state.questions.map((x) => (x.index === payload.index ? { ...x, status: 'failed' as const } : x)),
      };
    }
    case 'budget_breaker_tripped':
      // 快照载荷只登记不记账：token 累计仅来自 question_completed（不变量 I7）。
      return { ...state, breakerTripped: true };
    case 'campaign_completed': {
      if (state.completed) {
        throw new Error('foldCampaignEvent: duplicate campaign_completed — a campaign completes exactly once (invariant I6)');
      }
      return { ...state, completed: true };
    }
    // ── SCI-HITL-001：人类输入事件原样折叠（审计层不投影调度状态）──────────
    // 分层铁律的机器面：HITL 事件在主台账上可审计（哈希链覆盖），但
    // deriveCampaignState 的调度/科学投影对它们恒不变——人类批准/先验/驳回
    // 不得自动改写机器裁决状态（SCI-HITL-001）。人类循环状态（paused 等）
    // 由 campaign/human_loop.ts 的 deriveHumanLoopState 独立投影。
    case 'prior_injected':
    case 'annotation':
    case 'resource_veto':
    case 'revision_requested':
    case 'campaign_paused':
    case 'campaign_resumed':
    case 'risk_accepted':
    case 'human_event_reverted':
      return state;
  }
}

/** I3：事件必须引用已规划的问题且文本一致（索引/文本失配 = 台账矛盾）。 */
function questionAt(
  state: CampaignState,
  payload: { readonly index: number; readonly question: string },
): { readonly index: number; readonly question: string; readonly status: 'pending' | 'running' | 'OK' | 'failed' } {
  const q = state.questions[payload.index];
  if (q === undefined) {
    throw new Error(
      `foldCampaignEvent: event references unknown question index ${payload.index} (planned ${state.questions.length}) — invariant I3`,
    );
  }
  if (q.question !== payload.question) {
    throw new Error(
      `foldCampaignEvent: question text mismatch at index ${payload.index} (planned "${q.question}", event says "${payload.question}") — ledger contradiction, invariant I3`,
    );
  }
  return q;
}

function assertStatus(
  actual: 'pending' | 'running' | 'OK' | 'failed',
  required: 'pending' | 'running',
  payload: { readonly type: string; readonly index: number; readonly question: string },
  detail: string,
): void {
  if (actual !== required) {
    throw new Error(
      `foldCampaignEvent: ${payload.type} on "${payload.question}" (index ${payload.index}) but its status is ${actual} — ${detail}`,
    );
  }
}
