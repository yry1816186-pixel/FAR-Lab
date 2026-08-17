// src/cli/commands/rubric_args.ts — `far rubric` 参数解析（见 rubric.ts 主实现）。
//
//   far rubric package <runId...> [--seed N] [--out <dir>]
//   far rubric aggregate <packageId> <ratings.csv>... [--out <dir>]

import { runRubricPackage, runRubricAggregate } from './rubric.ts';

function needsValue(args: readonly string[], i: number, flag: string): string {
  const v = args[i + 1];
  if (v === undefined || v.startsWith('--')) {
    process.stderr.write(`far rubric: ${flag} needs a value\n`);
    process.exit(2);
  }
  return v;
}

export function runRubricFromArgs(args: readonly string[]): number {
  const sub = args[0];
  if (sub === 'package') {
    const runIds: string[] = [];
    let seed: number | undefined;
    let outDir: string | undefined;
    for (let i = 1; i < args.length; i += 1) {
      const a = args[i]!;
      if (a === '--seed') {
        const v = needsValue(args, i, a);
        if (!/^\d+$/.test(v)) {
          process.stderr.write(`far rubric package: --seed must be a non-negative integer (got ${v})\n`);
          return 2;
        }
        seed = Number(v);
      } else if (a === '--out') {
        outDir = needsValue(args, i, a);
      } else if (a.startsWith('--')) {
        process.stderr.write(`far rubric package: unknown flag ${a}\n`);
        return 2;
      } else {
        runIds.push(a);
      }
    }
    return runRubricPackage({ runIds, ...(seed !== undefined ? { seed } : {}), ...(outDir !== undefined ? { outDir } : {}) });
  }
  if (sub === 'aggregate') {
    const rest = args.slice(1);
    let packageId: string | undefined;
    const ratingsPaths: string[] = [];
    let outDir: string | undefined;
    for (let i = 0; i < rest.length; i += 1) {
      const a = rest[i]!;
      if (a === '--out') {
        outDir = needsValue(rest, i, a);
      } else if (a.startsWith('--')) {
        process.stderr.write(`far rubric aggregate: unknown flag ${a}\n`);
        return 2;
      } else if (packageId === undefined) {
        packageId = a;
      } else {
        ratingsPaths.push(a);
      }
    }
    if (packageId === undefined) {
      process.stderr.write('far rubric aggregate: a packageId is required\n');
      return 2;
    }
    return runRubricAggregate({ packageId, ratingsPaths, ...(outDir !== undefined ? { outDir } : {}) });
  }
  process.stderr.write(
    `far rubric: expected 'package' or 'aggregate' (got: ${sub ?? '<missing>'})\n` +
      '  far rubric package <runId...> [--seed N] [--out <dir>]\n' +
      '  far rubric aggregate <packageId> <ratings.csv>... [--out <dir>]\n',
  );
  return 2;
}
