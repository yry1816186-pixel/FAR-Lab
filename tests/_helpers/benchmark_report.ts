/**
 * benchmark report ensure-helper —— 仓库内容政策适配。
 *
 * benchmark/benchmark_report.json 是确定性生成物（scripts/generate_benchmark.ts·
 * fixed now → suiteIntegrityRoot 稳定锚），按政策不再 git 跟踪（.gitignore /benchmark/）。
 * 需要读该文件的测试统一经 ensureBenchmarkReport() 先确定性生成（存在则零开销跳过）。
 *
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 桩返回。
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url).replace(/[\\/][^\\/]*$/, '');
export const REPO_ROOT = join(here, '..', '..');
export const REPORT_PATH = join(REPO_ROOT, 'benchmark', 'benchmark_report.json');

export function ensureBenchmarkReport(): void {
  if (existsSync(REPORT_PATH)) return;
  const gen = spawnSync('pnpm', ['benchmark:generate'], { cwd: REPO_ROOT, encoding: 'utf8', shell: true });
  if (gen.status !== 0) {
    throw new Error(
      `benchmark:generate 失败（exit ${gen.status ?? '?'}）：${String(gen.stderr ?? gen.stdout ?? '').slice(0, 300)}`,
    );
  }
}
