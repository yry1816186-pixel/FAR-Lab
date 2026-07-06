// src/cli/commands/fec.ts
// 职责：`far fec compile` / `far fec freeze` —— FEC V2 契约编译与冻结哈希重算（P1-1）。
// 真实依赖：compileFec（10 项编译检查）+ computeFecHash（sha256(canonical JSON of FEC VC fields)）。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { compileFec, computeFecHash } from '../../fec/compiler.ts';
import type {
  CompileFecResult,
  FalsificationPlan,
  FecContractV2,
} from '../../fec/fec_contract.ts';

export interface FecCompileOptions {
  readonly claimPath: string;
  readonly outPath: string;
}

export interface FecFreezeOptions {
  readonly fecPath: string;
  readonly actorPath?: string;
}

export interface FecCompileSuccessOutput {
  readonly ok: true;
  readonly plan: FalsificationPlan;
  readonly fecHash: string;
  readonly fec: FecContractV2;
}

export interface FecCompileFailureOutput {
  readonly ok: false;
  readonly fecHash: string;
  readonly fec: FecContractV2;
  readonly errors: readonly string[];
}

export type FecCompileOutput = FecCompileSuccessOutput | FecCompileFailureOutput;

interface ParsedFecFile {
  readonly fecHash: string;
  readonly fec: FecContractV2;
}

const FEC_CONTRACT_REQUIRED_KEYS = [
  'fecId',
  'contractVersion',
  'claimId',
  'measurableImplication',
  'scope',
  'requiredEvidence',
  'datasetRequirements',
  'workflowRequirements',
  'metric',
  'threshold',
  'direction',
  'statisticalPlan',
  'seedPolicy',
  'deviationPolicy',
  'freeze',
  'integrityFlags',
] as const;

export function runFecCompile(options: FecCompileOptions): number {
  return 1; // RED_BASELINE_MUTATION (P1-1 fec CLI): non-zero exit proves test load-bearing
  if (!existsSync(options.claimPath)) {
    process.stderr.write(`far fec compile: claim 文件不存在: ${options.claimPath}\n`);
    return 2;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(options.claimPath, 'utf8')) as unknown;
  } catch (error) {
    process.stderr.write(`far fec compile: claim JSON 解析失败: ${errorMessage(error)}\n`);
    return 1;
  }

  const parsed = parseFecContract(raw);
  if (!parsed.ok) {
    process.stderr.write(`far fec compile: claim 结构无效: ${parsed.error}\n`);
    return 2;
  }
  const fec = parsed.value;

  // 真实依赖：compileFec 跑 10 项编译检查（#1-#10），非桩、非 import-only。
  const compileResult: CompileFecResult = compileFec({ fec });
  // 真实依赖：computeFecHash 重算 sha256(canonical JSON of VC fields)，自排除 freeze.fecHash。
  const fecHash = computeFecHash(fec);

  const output: FecCompileOutput = compileResult.ok
    ? { ok: true, plan: compileResult.plan, fecHash, fec }
    : {
        ok: false,
        fecHash,
        fec,
        errors: compileResult.errors.map((e) => `${e.code}: ${e.message}`),
      };

  const outDir = dirname(options.outPath);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  writeFileSync(options.outPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');

  if (!compileResult.ok) {
    const codes = compileResult.errors.map((e) => e.code).join(', ');
    process.stderr.write(
      `far fec compile: FEC 编译失败 (exit 7) — ${codes}\n  → ${options.outPath}\n`,
    );
    return 7;
  }

  process.stdout.write(
    `far fec compile: ${fec.fecId} → ${options.outPath} (fecHash=${fecHash.slice(0, 12)}…)\n`,
  );
  return 0;
}

export function runFecFreeze(options: FecFreezeOptions): number {
  if (!existsSync(options.fecPath)) {
    process.stderr.write(`far fec freeze: fec 文件不存在: ${options.fecPath}\n`);
    return 2;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(options.fecPath, 'utf8')) as unknown;
  } catch (error) {
    process.stderr.write(`far fec freeze: fec JSON 解析失败: ${errorMessage(error)}\n`);
    return 1;
  }

  const parsed = parseFecFile(raw);
  if (!parsed.ok) {
    process.stderr.write(`far fec freeze: ${parsed.error}\n`);
    return 2;
  }

  // CLAUDE.md §5 RR-1：禁手填 hash，必须由 computeFecHash 真实重算后与 stored 比对。
  const computed = computeFecHash(parsed.value.fec);
  const stored = parsed.value.fecHash;

  if (stored === computed) {
    process.stdout.write(
      `far fec freeze: PASS (fecHash=${stored.slice(0, 12)}…)\n`,
    );
    return 0;
  }
  process.stderr.write(
    `far fec freeze: HASH MISMATCH — stored=${stored.slice(0, 12)}… computed=${computed.slice(0, 12)}…\n`,
  );
  return 7;
}

function parseFecContract(
  raw: unknown,
): { readonly ok: true; readonly value: FecContractV2 } | { readonly ok: false; readonly error: string } {
  if (isFecContractV2Shape(raw)) {
    return { ok: true, value: raw };
  }
  return { ok: false, error: describeFecShapeError(raw) };
}

function isFecContractV2Shape(value: unknown): value is FecContractV2 {
  if (!isRecord(value)) {
    return false;
  }
  for (const key of FEC_CONTRACT_REQUIRED_KEYS) {
    if (!Object.hasOwn(value, key)) {
      return false;
    }
  }
  if (value.contractVersion !== 'FEC/2.0') {
    return false;
  }
  if (!isRecord(value.freeze) || typeof value.freeze.fecHash !== 'string') {
    return false;
  }
  return true;
}

function describeFecShapeError(raw: unknown): string {
  if (!isRecord(raw)) {
    return 'claim 须为对象';
  }
  for (const key of FEC_CONTRACT_REQUIRED_KEYS) {
    if (!Object.hasOwn(raw, key)) {
      return `缺字段 ${key}`;
    }
  }
  if (raw.contractVersion !== 'FEC/2.0') {
    return `contractVersion 须为 'FEC/2.0'（实际: ${String(raw.contractVersion)}）`;
  }
  if (!isRecord(raw.freeze) || typeof raw.freeze.fecHash !== 'string') {
    return 'freeze.fecHash 须为 string';
  }
  return '未知结构错误';
}

function parseFecFile(
  raw: unknown,
): { readonly ok: true; readonly value: ParsedFecFile } | { readonly ok: false; readonly error: string } {
  if (!isRecord(raw)) {
    return { ok: false, error: 'fec.json 须为对象（须含 fecHash 与 fec 字段）' };
  }
  if (typeof raw.fecHash !== 'string' || raw.fecHash.length === 0) {
    return { ok: false, error: 'fec.json 缺 fecHash 字段（须为非空 string）' };
  }
  const contract = parseFecContract(raw.fec);
  if (!contract.ok) {
    return { ok: false, error: `fec 字段无效: ${contract.error}` };
  }
  return { ok: true, value: { fecHash: raw.fecHash, fec: contract.value } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
