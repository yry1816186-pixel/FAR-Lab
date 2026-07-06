// src/cli/commands/fsm.ts
// 职责：`far fsm advance` —— 9-state CLI 协议 FSM 推进 + stageReceipt 哈希链追加（P2-2）。
// 真实依赖：transition（state_machine）+ computeStageReceipt（sha256(prevReceipt + hashCanonicalJson)）。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { hashCanonicalJson } from '../../evidence_log/hasher.ts';
import {
  computeStageReceipt,
  GENESIS_RECEIPT,
  type StageReceipt,
} from '../stage_receipt.ts';
import {
  CliState,
  isCliEvent,
  isCliState,
  transition,
} from '../state_machine.ts';

export interface FsmAdvanceOptions {
  readonly event: string;
  readonly inputPath: string;
  readonly stateFile: string;
}

export interface FsmStateFile {
  readonly state: CliState;
  readonly prevReceipt: string;
  readonly history: readonly StageReceipt[];
}

export interface FsmAdvanceSuccess {
  readonly ok: true;
  readonly exitCode: 0;
  readonly receipt: StageReceipt;
  readonly nextState: CliState;
  readonly stateFile: string;
}

export interface FsmAdvanceFailure {
  readonly ok: false;
  readonly exitCode: 1 | 2 | 7;
  readonly error: string;
}

export type FsmAdvanceResult = FsmAdvanceSuccess | FsmAdvanceFailure;

export function runFsmAdvance(options: FsmAdvanceOptions): FsmAdvanceResult {
  if (!isCliEvent(options.event)) {
    return { ok: false, exitCode: 2, error: `未知 event: ${options.event}` };
  }

  if (!existsSync(options.inputPath)) {
    return { ok: false, exitCode: 2, error: `input 文件不存在: ${options.inputPath}` };
  }

  let stageOutput: unknown;
  try {
    stageOutput = JSON.parse(readFileSync(options.inputPath, 'utf8')) as unknown;
  } catch (error) {
    return {
      ok: false,
      exitCode: 1,
      error: `input JSON 解析失败: ${errorMessage(error)}`,
    };
  }

  const current = loadStateFile(options.stateFile);
  const result = transition(current.state, options.event);
  if (!result.ok) {
    return {
      ok: false,
      exitCode: 7,
      error: `PROTOCOL_DEVIATION_CRITICAL: from=${result.from} attempted=${result.attempted ?? '<unknown>'} event=${options.event}`,
    };
  }

  // 真实依赖：sha256(prevReceipt + hashCanonicalJson(stageOutput)) —— node:crypto 重算。
  const outputHash = hashCanonicalJson(stageOutput as Record<string, unknown>);
  const receipt = computeStageReceipt(current.prevReceipt, stageOutput);
  const stageReceipt: StageReceipt = {
    stage: result.next,
    prevReceipt: current.prevReceipt,
    outputHash,
    receipt,
  };

  const nextState: FsmStateFile = {
    state: result.next,
    prevReceipt: receipt,
    history: [...current.history, stageReceipt],
  };
  writeStateFile(options.stateFile, nextState);

  return {
    ok: true,
    exitCode: 0,
    receipt: stageReceipt,
    nextState: result.next,
    stateFile: options.stateFile,
  };
}

function loadStateFile(stateFile: string): FsmStateFile {
  if (!existsSync(stateFile)) {
    return { state: CliState.INITIAL, prevReceipt: GENESIS_RECEIPT, history: [] };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(stateFile, 'utf8')) as unknown;
  } catch {
    return { state: CliState.INITIAL, prevReceipt: GENESIS_RECEIPT, history: [] };
  }
  if (!isStateFile(raw)) {
    return { state: CliState.INITIAL, prevReceipt: GENESIS_RECEIPT, history: [] };
  }
  return raw;
}

function isStateFile(value: unknown): value is FsmStateFile {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  if (!isCliState(v.state)) return false;
  if (typeof v.prevReceipt !== 'string' || v.prevReceipt.length === 0) return false;
  if (!Array.isArray(v.history)) return false;
  return true;
}

function writeStateFile(stateFile: string, state: FsmStateFile): void {
  const dir = dirname(stateFile);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
