// src/cli/commands/fec.ts
// 职责：`far fec compile` / `far fec freeze` —— FEC V2 契约编译与冻结哈希重算（P1-1）。
// 真实依赖：compileFec（10 项编译检查）+ computeFecHash（sha256(canonical JSON of FEC VC fields)）。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { compileFec, computeFecHash } from '../../fec/compiler.ts';
import { protectedActionGuard } from '../../agent_loop/guards.ts';
import type {
  CompileFecResult,
  FalsificationPlan,
  FecContractV2,
} from '../../fec/fec_contract.ts';

/** Input parameters for operations involving fec compile options. */
export interface FecCompileOptions {
  readonly claimPath: string;
  readonly outPath: string;
}

/** Input parameters for operations involving fec freeze options. */
export interface FecFreezeOptions {
  readonly fecPath: string;
  readonly actorPath?: string;
}

/** Result/output structure for fec compile success output. */
export interface FecCompileSuccessOutput {
  readonly ok: true;
  readonly plan: FalsificationPlan;
  readonly fecHash: string;
  readonly fec: FecContractV2;
}

/** Result/output structure for fec compile failure output. */
export interface FecCompileFailureOutput {
  readonly ok: false;
  readonly fecHash: string;
  readonly fec: FecContractV2;
  readonly errors: readonly string[];
}

/** Type alias: fec compile output. */
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

/**
 * run fec compile.
 */
export function runFecCompile(options: FecCompileOptions): number {
  if (!existsSync(options.claimPath)) {
    process.stderr.write(`far fec compile: claim file not found: ${options.claimPath}\n`);
    return 2;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(options.claimPath, 'utf8')) as unknown;
  } catch (error) {
    process.stderr.write(`far fec compile: failed to parse claim JSON: ${errorMessage(error)}\n`);
    return 1;
  }

  const parsed = parseFecContract(raw);
  if (!parsed.ok) {
    process.stderr.write(`far fec compile: invalid claim structure: ${parsed.error}\n`);
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
      `far fec compile: FEC compilation failed (exit 7) — ${codes}\n  → ${options.outPath}\n`,
    );
    return 7;
  }

  process.stdout.write(
    `far fec compile: ${fec.fecId} → ${options.outPath} (fecHash=${fecHash.slice(0, 12)}…)\n`,
  );
  return 0;
}

/**
 * run fec freeze.
 */
export function runFecFreeze(options: FecFreezeOptions): number {
  // G1(IC-02):freeze 为受保护动作;发起方=人类 CLI 显式命令
  const guard = protectedActionGuard('freeze', 'cli_user');
  if (!guard.allow) {
    process.stderr.write(`far fec freeze: ${guard.reason}\n`);
    return 1;
  }
  if (!existsSync(options.fecPath)) {
    process.stderr.write(`far fec freeze: fec file not found: ${options.fecPath}\n`);
    return 2;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(options.fecPath, 'utf8')) as unknown;
  } catch (error) {
    process.stderr.write(`far fec freeze: failed to parse fec JSON: ${errorMessage(error)}\n`);
    return 1;
  }

  const parsed = parseFecFile(raw);
  if (!parsed.ok) {
    process.stderr.write(`far fec freeze: ${parsed.error}\n`);
    return 2;
  }

  // RR-1：禁手填 hash，必须由 computeFecHash 真实重算后与 stored 比对。
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
    return 'claim must be an object';
  }
  for (const key of FEC_CONTRACT_REQUIRED_KEYS) {
    if (!Object.hasOwn(raw, key)) {
      return `missing field ${key}`;
    }
  }
  if (raw.contractVersion !== 'FEC/2.0') {
    return `contractVersion must be 'FEC/2.0' (got: ${String(raw.contractVersion)})`;
  }
  if (!isRecord(raw.freeze) || typeof raw.freeze.fecHash !== 'string') {
    return 'freeze.fecHash must be a string';
  }
  return 'unknown structure error';
}

function parseFecFile(
  raw: unknown,
): { readonly ok: true; readonly value: ParsedFecFile } | { readonly ok: false; readonly error: string } {
  if (!isRecord(raw)) {
    return { ok: false, error: 'fec.json must be an object (must contain fecHash and fec fields)' };
  }
  if (typeof raw.fecHash !== 'string' || raw.fecHash.length === 0) {
    return { ok: false, error: 'fec.json is missing the fecHash field (must be a non-empty string)' };
  }
  const contract = parseFecContract(raw.fec);
  if (!contract.ok) {
    return { ok: false, error: `invalid fec field: ${contract.error}` };
  }
  return { ok: true, value: { fecHash: raw.fecHash, fec: contract.value } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
