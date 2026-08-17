// src/cli/commands/rubric.ts — `far rubric` 盲评工具族（2.md §4.4，day-r13）。
//
//   far rubric package <runId...> [--seed N] [--out <dir>]
//       → <dir>/<packageId>/: README.md（说明+条目）/ ratings-template.csv /
//         package.json（盲侧）/ SHA256SUMS（包完整性侧车）
//       → .far/rubric/<packageId>/key.json（评委不可见的映射钥匙 + seed）
//   far rubric aggregate <packageId> <ratings.csv>... [--out <dir>]
//       → 聚合报告（md + json）：逐项 mean±sd、成对 Cohen's κ、Krippendorff's α
//
// 诚实契约：工具只统计 CSV 里真实存在的评分——不模拟评分者、不插补缺行、
// 单评分者的 κ/α 显式标 null。exit 0 成功 / 2 参数错 / 3 解析错。

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  aggregateRatings,
  buildBlindPackage,
  parseRatingsCsv,
  RatingsParseError,
  renderRubricReport,
  renderRatingsTemplate,
  rubricSha256,
  type BlindKey,
  type RatingRow,
} from '../../research/evaluation/rubric.ts';
import type { RunStore } from '../../research/run_lifecycle.ts';
import { resolveRunStore } from './research.ts';

/** Key root — NEVER inside the package directory (evaluator must not see it). */
function keyRoot(): string {
  return process.env.FAR_RUBRIC_DIR ?? '.far/rubric';
}
function defaultPackDir(): string {
  return process.env.FAR_RUBRIC_PACK_DIR ?? `${keyRoot()}/packs`;
}

export interface RubricPackageOptions {
  readonly runIds: readonly string[];
  readonly seed?: number;
  readonly outDir?: string;
  readonly store?: RunStore;
  readonly now?: () => Date;
}

export interface RubricAggregateOptions {
  readonly packageId: string;
  readonly ratingsPaths: readonly string[];
  readonly outDir?: string;
}

function loadKey(packageId: string): BlindKey {
  const keyPath = join(keyRoot(), packageId, 'key.json');
  if (!existsSync(keyPath)) {
    throw new Error(`no key for package ${packageId} (expected ${keyPath}) — package it first`);
  }
  return JSON.parse(readFileSync(keyPath, 'utf8')) as BlindKey;
}

/** `far rubric package` — build the blind pack + the private key. */
export function runRubricPackage(opts: RubricPackageOptions): number {
  if (opts.runIds.length === 0) {
    process.stderr.write('far rubric package: at least one runId is required\n');
    return 2;
  }
  const store = opts.store ?? resolveRunStore();
  const runs = opts.runIds.map((id) => {
    const run = store.loadRun(id);
    if (run === null) throw new Error(`run ${id} not found in the run store`);
    return run;
  });
  const { pkg, key } = buildBlindPackage(runs, {
    ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
    ...(opts.now !== undefined ? { now: opts.now } : {}),
  });

  const packDir = join(opts.outDir ?? defaultPackDir(), pkg.packageId);
  mkdirSync(packDir, { recursive: true });
  const itemsJson = JSON.stringify(
    pkg.items.map((i) => ({
      blindId: i.blindId,
      question: i.question,
      statement: i.statement,
      mechanism: i.mechanism,
      predictions: i.predictions,
      falsification: i.falsification,
      limitations: i.limitations,
    })),
    null,
    2,
  );
  const readme = [
    pkg.instructions,
    '',
    '## Items',
    '',
    ...pkg.items.map(
      (i) =>
        `### ${i.blindId}\n\n- question: ${i.question}\n- statement: ${i.statement}\n- mechanism: ${i.mechanism}\n- predictions: ${i.predictions.map((p) => `\n    - ${p}`).join('')}\n- falsification: ${i.falsification}\n- limitations/risks: ${i.limitations.map((p) => `\n    - ${p}`).join('')}`,
    ),
  ].join('\n');
  const template = renderRatingsTemplate(pkg);
  const manifest = `${rubricSha256(readme)}  README.md\n${rubricSha256(template)}  ratings-template.csv\n${rubricSha256(itemsJson)}  package.json\n`;
  writeFileSync(join(packDir, 'README.md'), readme, 'utf8');
  writeFileSync(join(packDir, 'ratings-template.csv'), template, 'utf8');
  writeFileSync(join(packDir, 'package.json'), itemsJson, 'utf8');
  writeFileSync(join(packDir, 'SHA256SUMS'), manifest, 'utf8');

  const keyDir = join(keyRoot(), pkg.packageId);
  mkdirSync(keyDir, { recursive: true });
  writeFileSync(join(keyDir, 'key.json'), `${JSON.stringify(key, null, 2)}\n`, 'utf8');

  process.stdout.write(
    `rubric package ${pkg.packageId}: ${pkg.items.length} items from ${pkg.sourceRunCount} run(s), seed=${pkg.seed}\n` +
      `  pack (share with raters): ${packDir}\n` +
      `  key (NEVER share):        ${join(keyDir, 'key.json')}\n`,
  );
  return 0;
}

/** `far rubric aggregate` — parse CSVs, aggregate, write report. */
export function runRubricAggregate(opts: RubricAggregateOptions): number {
  if (opts.ratingsPaths.length === 0) {
    process.stderr.write('far rubric aggregate: at least one ratings CSV is required\n');
    return 2;
  }
  let key: BlindKey;
  try {
    key = loadKey(opts.packageId);
  } catch (err) {
    process.stderr.write(`far rubric aggregate: ${(err as Error).message}\n`);
    return 2;
  }
  const rows: RatingRow[] = [];
  for (const p of opts.ratingsPaths) {
    try {
      rows.push(...parseRatingsCsv(readFileSync(p, 'utf8')));
    } catch (err) {
      if (err instanceof RatingsParseError) {
        process.stderr.write(`far rubric aggregate: ${p}: ${err.message}\n`);
        return 3;
      }
      throw err;
    }
  }
  const agg = aggregateRatings(opts.packageId, rows);
  const report = renderRubricReport(agg, key);
  const outDir = opts.outDir ?? join(keyRoot(), opts.packageId);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'aggregation.md'), `${report}\n`, 'utf8');
  writeFileSync(
    join(outDir, 'aggregation.json'),
    `${JSON.stringify({ ...agg, key }, null, 2)}\n`,
    'utf8',
  );
  const worst = agg.agreement.reduce(
    (w, a) => (a.krippendorffAlpha !== null && (w === null || a.krippendorffAlpha < w) ? a.krippendorffAlpha : w),
    null as number | null,
  );
  process.stdout.write(
    `rubric aggregate ${opts.packageId}: ${agg.raterCount} rater(s), ${agg.ratedItems} item(s), ${rows.length} rows\n` +
      `  report: ${join(outDir, 'aggregation.md')}\n` +
      (worst !== null && worst < 0.667
        ? `  NOTE: worst Krippendorff α=${worst.toFixed(3)} < 0.667 — conclusions from these ratings are NOT reliable at the conventional threshold\n`
        : ''),
  );
  return 0;
}
