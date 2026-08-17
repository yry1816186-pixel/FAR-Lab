// src/research/checkpoint_schema.ts
// 职责：RunCheckpoint 的解析与版本迁移（CAMPAIGN-CHECKPOINT-001 状态版本要素）。
// 从 run_lifecycle.ts 抽出（856>800 复杂度预算——抽取而非豁免）。
//
// 版本纪律：无 schemaVersion = v1 legacy（既有 checkpoint 向后兼容）；已知版本经
// CHECKPOINT_MIGRATIONS 注册表逐级迁移；更高版本 fail-closed（未来数据不伪造理解）。

import type { RunCheckpoint } from './run_lifecycle.ts';
import { assertValidResearchRunId } from './run_store_security.ts';
import { RESEARCH_STAGE_IDS } from './orchestrator.ts';

export function parseCheckpoint(raw: string): RunCheckpoint {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('checkpoint.json is not an object');
  }
  const cp = parsed as Record<string, unknown>;
  // CAMPAIGN-CHECKPOINT-001（状态版本要素）：无 schemaVersion = v1 legacy（向后兼容，
  // 已有 checkpoint 不受影响）；已知版本走迁移注册表；未知更高版本 fail-closed——
  // 新版本 checkpoint 对旧代码是「未来数据」，静默解析会伪造理解。
  if (cp.schemaVersion !== undefined) {
    if (typeof cp.schemaVersion !== 'number' || !Number.isInteger(cp.schemaVersion) || cp.schemaVersion < 1) {
      throw new Error(`checkpoint.json has invalid schemaVersion (${String(cp.schemaVersion)})`);
    }
    if (cp.schemaVersion > CHECKPOINT_SCHEMA_VERSION) {
      throw new Error(
        `checkpoint.json schemaVersion ${String(cp.schemaVersion)} is newer than supported ${CHECKPOINT_SCHEMA_VERSION} — migration required before this build can read it (fail-closed)`,
      );
    }
    const migrated = migrateCheckpointPayload(cp);
    return parseMigratedCheckpoint(migrated);
  }
  const stageIds0 = RESEARCH_STAGE_IDS as readonly string[];
  if (
    typeof cp.runId !== 'string' ||
    typeof cp.question !== 'string' ||
    typeof cp.profile !== 'string' ||
    typeof cp.state !== 'string' ||
    !Array.isArray(cp.completedStages) ||
    cp.completedStages.some((s) => !stageIds0.includes(s as string)) ||
    typeof cp.ctx !== 'object' || cp.ctx === null
  ) {
    throw new Error('checkpoint.json is structurally invalid (state/completedStages/ctx)');
  }
  try {
    assertValidResearchRunId(cp.runId);
  } catch {
    throw new Error('checkpoint.json has an invalid research run id');
  }
  // Intentional conversion: the critical fields are structurally validated
  // above; TS itself recommends the explicit `unknown` boundary for this
  // (single assertion, never the banned `as unknown as` chain).
  const validated: unknown = cp;
  return validated as RunCheckpoint;
}

/** 当前 checkpoint schema 版本（CAMPAIGN-CHECKPOINT-001 状态版本 SSOT）。 */
export const CHECKPOINT_SCHEMA_VERSION = 1;

/**
 * 版本迁移注册表：from→to 的确定性变换。当前只有 v1（恒等）——未来 v2 时在此追加
 * `2: (cp) => transform(cp)` 并把 CHECKPOINT_SCHEMA_VERSION 升 2；旧 checkpoint 经
 * 此表逐级升级（1→2→3），绝不跳级猜测。
 */
export const CHECKPOINT_MIGRATIONS: Readonly<Record<number, (cp: Record<string, unknown>) => Record<string, unknown>>> = {
  1: (cp) => cp,
};

/** 按注册表把任意 ≤ 当前版本的 checkpoint 载荷迁移到当前版本（纯函数）。 */
export function migrateCheckpointPayload(cp: Record<string, unknown>): Record<string, unknown> {
  const from = typeof cp.schemaVersion === 'number' ? cp.schemaVersion : 1;
  let current = cp;
  for (let v = from; v < CHECKPOINT_SCHEMA_VERSION; v += 1) {
    const step = CHECKPOINT_MIGRATIONS[v];
    if (step === undefined) {
      throw new Error(`checkpoint migration ${v}->${v + 1} not registered (fail-closed)`);
    }
    current = { ...step(current), schemaVersion: v + 1 };
  }
  return current;
}

function parseMigratedCheckpoint(cp: Record<string, unknown>): RunCheckpoint {
  const stageIds = RESEARCH_STAGE_IDS as readonly string[];
  if (
    typeof cp.runId !== 'string' ||
    typeof cp.question !== 'string' ||
    typeof cp.profile !== 'string' ||
    typeof cp.state !== 'string' ||
    !Array.isArray(cp.completedStages) ||
    cp.completedStages.some((s) => !stageIds.includes(s as string)) ||
    typeof cp.ctx !== 'object' || cp.ctx === null
  ) {
    throw new Error('checkpoint.json is structurally invalid (state/completedStages/ctx)');
  }
  try {
    assertValidResearchRunId(cp.runId);
  } catch {
    throw new Error('checkpoint.json has an invalid research run id');
  }
  const validated: unknown = cp;
  return validated as RunCheckpoint;
}

