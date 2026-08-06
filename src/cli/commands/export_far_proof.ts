// src/cli/commands/export_far_proof.ts
// CLI wrapper for the real .far-proof exporter and optional offline package builder.

import { existsSync, readdirSync, rmSync } from 'node:fs';

import Database from 'better-sqlite3';

import {
  buildDemoChain,
  computeEnvHash,
  DEMO_EXPORTED_AT,
  DEMO_GIT_COMMIT_SHA,
  DEMO_MODEL_SNAPSHOT,
  DEMO_RUN_ID,
} from '../../far_proof/demo_chain.ts';
import { exportFarProof, packageFarProofBundle, type FarProofExportResult, type FarProofPackageResult } from '../../far_proof/index.ts';
import { protectedActionGuard } from '../../agent_loop/guards.ts';

/** Type alias: export far proof source. */
export type ExportFarProofSource =
  | { readonly kind: 'demoChain' }
  | {
      readonly kind: 'db';
      readonly dbPath: string;
      readonly runId: string;
      readonly modelSnapshot: string;
      readonly gitCommitSha: string;
      readonly envHash: string;
    };

/** Input parameters for operations involving export far proof options. */
export interface ExportFarProofOptions {
  readonly source: ExportFarProofSource;
  readonly outputDir: string;
  readonly exportedAt?: string;
  readonly packageBundle: boolean;
  readonly archivePath?: string;
  readonly force: boolean;
  readonly json: boolean;
}

/** Result/output structure for export far proof cli result. */
export interface ExportFarProofCliResult {
  readonly schemaVersion: 'far.export_far_proof.result.v1';
  readonly source: 'demoChain' | 'db';
  readonly outputDir: string;
  readonly filesWritten: readonly string[];
  readonly chainVerified: boolean;
  readonly verifiedCount: number;
  readonly brokenAtSeq: number | null;
  readonly package: {
    readonly archivePath: string;
    readonly archiveSha256: string;
    readonly integrityHash: string;
    readonly fileCount: number;
    readonly warnings: readonly string[];
  } | null;
  readonly limitations: readonly string[];
}

/**
 * run export far proof.
 */
export function runExportFarProof(options: ExportFarProofOptions): number {
  // G1(IC-02):export 为受保护动作;发起方=人类 CLI 显式命令(LLM 路径不存在,llm_suggestion 必 deny)
  const guard = protectedActionGuard('export', 'cli_user');
  if (!guard.allow) {
    process.stderr.write(`far export far-proof: ${guard.reason}\n`);
    return 1;
  }
  const prepared = prepareOutputDir(options.outputDir, options.force);
  if (!prepared.ok) {
    process.stderr.write(`far export far-proof: ${prepared.error}\n`);
    return 2;
  }

  let db: Database.Database | undefined;
  try {
    const source = options.source;
    if (source.kind === 'demoChain') {
      db = new Database(':memory:');
      buildDemoChain(db);
    } else {
      db = new Database(source.dbPath, { readonly: true, fileMustExist: true });
    }

    const exportedAt = options.exportedAt ?? defaultExportedAt(source);
    const exportResult = exportFarProof({
      db,
      outputDir: options.outputDir,
      runId: runIdFor(source),
      modelSnapshot: modelSnapshotFor(source),
      gitCommitSha: gitCommitShaFor(source),
      envHash: envHashFor(source),
      exportedAt,
    });

    const packageResult = options.packageBundle
      ? packageFarProofBundle({
          bundleDir: options.outputDir,
          ...(options.archivePath !== undefined ? { archivePath: options.archivePath } : {}),
          generatedAt: exportedAt,
        })
      : null;

    const result = buildCliResult(source.kind, exportResult, packageResult);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(renderExportSummary(result));
    }
    return exportResult.hashVerification.ok ? 0 : 7;
  } catch (error) {
    process.stderr.write(`far export far-proof: failed — ${errorMessage(error)}\n`);
    return 1;
  } finally {
    db?.close();
  }
}

function prepareOutputDir(outputDir: string, force: boolean): { readonly ok: true } | { readonly ok: false; readonly error: string } {
  if (!existsSync(outputDir)) {
    return { ok: true };
  }
  const entries = readdirSync(outputDir);
  if (entries.length === 0) {
    return { ok: true };
  }
  if (!force) {
    return { ok: false, error: `output directory already exists and is non-empty; pass --force to overwrite (${outputDir})` };
  }
  rmSync(outputDir, { recursive: true, force: true });
  return { ok: true };
}

function defaultExportedAt(source: ExportFarProofSource): string {
  return source.kind === 'demoChain' ? DEMO_EXPORTED_AT : new Date().toISOString();
}

function runIdFor(source: ExportFarProofSource): string {
  return source.kind === 'demoChain' ? DEMO_RUN_ID : source.runId;
}

function modelSnapshotFor(source: ExportFarProofSource): string {
  return source.kind === 'demoChain' ? DEMO_MODEL_SNAPSHOT : source.modelSnapshot;
}

function gitCommitShaFor(source: ExportFarProofSource): string {
  return source.kind === 'demoChain' ? DEMO_GIT_COMMIT_SHA : source.gitCommitSha;
}

function envHashFor(source: ExportFarProofSource): string {
  if (source.kind === 'db') {
    return source.envHash;
  }
  return computeEnvHash({
    schemaVersion: 11,
    nodeVersion: process.version,
    providerProfile: 'offline_replay',
  });
}

function buildCliResult(
  source: 'demoChain' | 'db',
  exportResult: FarProofExportResult,
  packageResult: FarProofPackageResult | null,
): ExportFarProofCliResult {
  return {
    schemaVersion: 'far.export_far_proof.result.v1',
    source,
    outputDir: exportResult.outputDir,
    filesWritten: exportResult.filesWritten,
    chainVerified: exportResult.hashVerification.ok,
    verifiedCount: exportResult.hashVerification.verifiedCount,
    brokenAtSeq: exportResult.hashVerification.brokenAtSeq,
    package: packageResult === null
      ? null
      : {
          archivePath: packageResult.archivePath,
          archiveSha256: packageResult.archiveSha256,
          integrityHash: packageResult.integrityHash,
          fileCount: packageResult.fileCount,
          warnings: packageResult.warnings,
        },
    limitations: [
      'V1 .far-proof export is self-verifiable but not third-party RO-Crate/PROV-O certified.',
      'call_records.redacted.jsonl intentionally excludes request/response payloads.',
      'CONFIRMED remains bounded support and requires human scientific endorsement before acceptance.',
    ],
  };
}

function renderExportSummary(result: ExportFarProofCliResult): string {
  const lines = [
    'FAR .far-proof Export',
    '════════════════════════════════════════════════════════════',
    `source              : ${result.source}`,
    `outputDir           : ${result.outputDir}`,
    `filesWritten        : ${result.filesWritten.length}`,
    `chainVerified       : ${result.chainVerified ? 'ok' : `broken at seq ${result.brokenAtSeq ?? '?'}`}`,
    result.package !== null ? `archive             : ${result.package.archivePath}` : undefined,
    result.package !== null ? `integrityHash       : ${result.package.integrityHash}` : undefined,
    'boundary            : V1 self-verifiable bundle, not external RO-Crate/PROV-O certification',
    '════════════════════════════════════════════════════════════',
    '',
  ].filter((line): line is string => line !== undefined);
  return lines.join('\n');
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
