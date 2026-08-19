// src/cli/commands/plugin.ts
// `far plugin verify <manifest.json>` —— 第三方插件的 conformance 验证出口
// （OSS-PLUGIN-001 Acceptance 的 CLI 面）。
//
// 用法：
//   far plugin verify path/to/manifest.json [--json]
//
// exit 语义（对齐 far planning 门禁惯例）：0 = conformance PASS / 7 = FAIL（探针
// 或注册未过）/ 2 = 参数或文件错误。--json 输出 canonical 单文档（census §4-1：
// stdout 无 banner/装饰）。

import { readFileSync } from 'node:fs';

import { runConformance, toPlainReport } from '../../plugins/conformance.ts';
import { canonicalJson } from '../../evidence_log/hasher.ts';

function usage(): string {
  return [
    'far plugin verify <manifest.json> [--json]',
    '',
    '  Runs the full conformance battery against the plugin manifest:',
    '  malicious x4 / permission-denial / version-mismatch / timeout /',
    '  schema-output probes + target registration (golden vectors,',
    '  determinism double-run, contentHash reconciliation).',
    '',
    '  exit: 0 PASS · 7 FAIL · 2 bad args / unreadable file',
  ].join('\n');
}

export async function runPluginCommand(args: readonly string[]): Promise<number> {
  const rest = args[0] === 'verify' ? args.slice(1) : args;
  const json = rest.includes('--json');
  const positional = rest.filter((a) => !a.startsWith('--'));
  const file = positional[0];

  if (positional.length > 0 && args[0] !== 'verify') {
    process.stderr.write(`far plugin: unknown subcommand '${positional[0]}' (supported: 'verify')\n${usage()}\n`);
    return 2;
  }
  if (file === undefined) {
    process.stderr.write(`far plugin: missing manifest path\n${usage()}\n`);
    return 2;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    process.stderr.write(`far plugin: cannot read manifest '${file}': ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  const report = runConformance(raw);

  if (json) {
    process.stdout.write(`${canonicalJson(toPlainReport(report))}\n`);
    return report.verdict === 'PASS' ? 0 : 7;
  }

  process.stdout.write(`FAR-Lab plugin conformance — host ${report.hostApi}\n`);
  for (const check of report.checks) {
    const mark = check.status === 'PASS' ? '✔' : check.status === 'SKIP' ? '·' : '✖';
    process.stdout.write(`  ${mark} ${check.name.padEnd(28)} ${check.detail}\n`);
  }
  process.stdout.write(`\n  verdict: ${report.verdict}${report.pluginId !== null ? ` (${report.pluginId})` : ''}\n`);
  return report.verdict === 'PASS' ? 0 : 7;
}
