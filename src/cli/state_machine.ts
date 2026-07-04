// src/cli/state_machine.ts
// 职责：9-state CLI 协议 FSM + INITIAL（P2-2）。
// 真实依赖：纯状态机判定，配合 stage_receipt.ts 形成 sha256 哈希链。
// Authority: CLAUDE.md §4 P2-2（spec 的 9-state CLI 协议 FSM，CLAIM_CANDIDATE→…→VERIFIED）。

export const CLI_STATES = [
  'INITIAL',
  'CLAIM_CANDIDATE',
  'FEC_PROPOSED',
  'FEC_VALIDATED',
  'EVIDENCE_GATHERED',
  'STATISTICS_COMPUTED',
  'VERDICT_RENDERED',
  'PROOF_SEALED',
  'AUDITABLE',
  'VERIFIED',
] as const;
export type CliState = (typeof CLI_STATES)[number];

export const CLI_EVENTS = [
  'ADVANCE_CLAIM_CANDIDATE',
  'ADVANCE_FEC_PROPOSE',
  'ADVANCE_FEC_COMPILE',
  'ADVANCE_EVIDENCE_GATHER',
  'ADVANCE_STATISTICS',
  'ADVANCE_VERDICT',
  'ADVANCE_PROOF_SEAL',
  'ADVANCE_AUDITABLE',
  'ADVANCE_VERIFIED',
] as const;
export type CliEvent = (typeof CLI_EVENTS)[number];

// 字符串常量保运行时引用（替代 enum 的 CliState.FOO 表达式）。
export const CliState = {
  INITIAL: 'INITIAL',
  CLAIM_CANDIDATE: 'CLAIM_CANDIDATE',
  FEC_PROPOSED: 'FEC_PROPOSED',
  FEC_VALIDATED: 'FEC_VALIDATED',
  EVIDENCE_GATHERED: 'EVIDENCE_GATHERED',
  STATISTICS_COMPUTED: 'STATISTICS_COMPUTED',
  VERDICT_RENDERED: 'VERDICT_RENDERED',
  PROOF_SEALED: 'PROOF_SEALED',
  AUDITABLE: 'AUDITABLE',
  VERIFIED: 'VERIFIED',
} as const satisfies Record<string, CliState>;

export const CliEvent = {
  ADVANCE_CLAIM_CANDIDATE: 'ADVANCE_CLAIM_CANDIDATE',
  ADVANCE_FEC_PROPOSE: 'ADVANCE_FEC_PROPOSE',
  ADVANCE_FEC_COMPILE: 'ADVANCE_FEC_COMPILE',
  ADVANCE_EVIDENCE_GATHER: 'ADVANCE_EVIDENCE_GATHER',
  ADVANCE_STATISTICS: 'ADVANCE_STATISTICS',
  ADVANCE_VERDICT: 'ADVANCE_VERDICT',
  ADVANCE_PROOF_SEAL: 'ADVANCE_PROOF_SEAL',
  ADVANCE_AUDITABLE: 'ADVANCE_AUDITABLE',
  ADVANCE_VERIFIED: 'ADVANCE_VERIFIED',
} as const satisfies Record<string, CliEvent>;

const EVENT_TO_TARGET: ReadonlyMap<CliEvent, CliState> = new Map<CliEvent, CliState>([
  [CliEvent.ADVANCE_CLAIM_CANDIDATE, CliState.CLAIM_CANDIDATE],
  [CliEvent.ADVANCE_FEC_PROPOSE, CliState.FEC_PROPOSED],
  [CliEvent.ADVANCE_FEC_COMPILE, CliState.FEC_VALIDATED],
  [CliEvent.ADVANCE_EVIDENCE_GATHER, CliState.EVIDENCE_GATHERED],
  [CliEvent.ADVANCE_STATISTICS, CliState.STATISTICS_COMPUTED],
  [CliEvent.ADVANCE_VERDICT, CliState.VERDICT_RENDERED],
  [CliEvent.ADVANCE_PROOF_SEAL, CliState.PROOF_SEALED],
  [CliEvent.ADVANCE_AUDITABLE, CliState.AUDITABLE],
  [CliEvent.ADVANCE_VERIFIED, CliState.VERIFIED],
]);

export const legalTransitions: ReadonlyMap<CliState, ReadonlySet<CliState>> = new Map<
  CliState,
  ReadonlySet<CliState>
>([
  [CliState.INITIAL, new Set<CliState>([CliState.CLAIM_CANDIDATE])],
  [CliState.CLAIM_CANDIDATE, new Set<CliState>([CliState.FEC_PROPOSED])],
  [CliState.FEC_PROPOSED, new Set<CliState>([CliState.FEC_VALIDATED])],
  [CliState.FEC_VALIDATED, new Set<CliState>([CliState.EVIDENCE_GATHERED])],
  [CliState.EVIDENCE_GATHERED, new Set<CliState>([CliState.STATISTICS_COMPUTED])],
  [CliState.STATISTICS_COMPUTED, new Set<CliState>([CliState.VERDICT_RENDERED])],
  [CliState.VERDICT_RENDERED, new Set<CliState>([CliState.PROOF_SEALED])],
  [CliState.PROOF_SEALED, new Set<CliState>([CliState.AUDITABLE])],
  [CliState.AUDITABLE, new Set<CliState>([CliState.VERIFIED])],
]);

export type TransitionOk = { readonly ok: true; readonly next: CliState };
export type TransitionFail = {
  readonly ok: false;
  readonly reason: 'PROTOCOL_DEVIATION_CRITICAL';
  readonly from: CliState;
  readonly attempted: CliState | undefined;
};
export type TransitionResult = TransitionOk | TransitionFail;

const CLI_STATE_SET: ReadonlySet<string> = new Set(CLI_STATES);
const CLI_EVENT_SET: ReadonlySet<string> = new Set(CLI_EVENTS);

export function isCliState(value: unknown): value is CliState {
  return typeof value === 'string' && CLI_STATE_SET.has(value);
}

export function isCliEvent(value: unknown): value is CliEvent {
  return typeof value === 'string' && CLI_EVENT_SET.has(value);
}

// fail-closed: 非法转移不静默覆写，强制返回 PROTOCOL_DEVIATION_CRITICAL（CLAUDE.md §2 第 3 类）。
export function transition(current: CliState, event: CliEvent): TransitionResult {
  const target = EVENT_TO_TARGET.get(event);
  if (target === undefined) {
    return { ok: false, reason: 'PROTOCOL_DEVIATION_CRITICAL', from: current, attempted: undefined };
  }
  const allowed = legalTransitions.get(current);
  if (allowed === undefined || !allowed.has(target)) {
    return { ok: false, reason: 'PROTOCOL_DEVIATION_CRITICAL', from: current, attempted: target };
  }
  return { ok: true, next: target };
}
