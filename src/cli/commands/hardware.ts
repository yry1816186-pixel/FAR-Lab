// src/cli/commands/hardware.ts
// far hardware —— 运行时硬件与可用计算后端探测。
//
// 设计红线：
//   · 尽力而为探测（nvidia-smi / rocm-smi / system_profiler），任何缺失 → UNKNOWN，绝不 crash。
//   · 探测信息仅用于展示与提示，**绝不参与 R0-R9 裁决核输入**（确定性铁律）。
//   · --json 输出结构化报告（供 CI/脚本消费）。
//   · 零网络、零 API 调用。
//
// 退出码：0 总是成功（探测失败 ≠ 命令失败——信息性命令）。

import type { HardwareReport } from '../../hardware/detect.ts';
import { detectHardware } from '../../hardware/detect.ts';

/** Input parameters for hardware command. */
export interface HardwareOptions {
  readonly json: boolean;
}

function fmtCpu(cpu: HardwareReport['cpu']): string {
  return [
    `arch        ${cpu.arch}`,
    `model       ${cpu.model}`,
    `cores       ${cpu.cores}`,
    `memory      ${cpu.totalMem} MiB`,
  ].join('\n');
}

function fmtGpu(gpu: HardwareReport['gpu']): string {
  if (gpu.status === 'OK' && gpu.devices.length > 0) {
    return gpu.devices
      .map(
        (d) =>
          `  - ${d.name} (${d.vendor}${d.vramMiB !== null ? ` · ${d.vramMiB} MiB` : ''})`,
      )
      .join('\n');
  }
  return `  - none detected (${gpu.probeError ?? 'no GPU probe available'})`;
}

function fmtAccel(accel: HardwareReport['accelerator']): string {
  return [
    `platform    ${accel.platform}`,
    `webgpu      ${accel.webgpu}`,
    `wasm        ${accel.wasm}`,
  ].join('\n');
}

/**
 * Runs the far hardware command: best-effort runtime hardware/accelerator probe.
 * @param opts - Hardware options including JSON output flag.
 * @returns Exit code: 0 always (informational).
 */
export async function runHardware(opts: HardwareOptions): Promise<number> {
  const report = await detectHardware();

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }

  process.stdout.write('\n  FAR-Lab · far hardware (runtime compute backend probe)\n');
  process.stdout.write('  ─────────────────────────────────────────────────────\n');
  process.stdout.write(`  CPU\n${fmtCpu(report.cpu)}\n`);
  process.stdout.write(`\n  GPU\n${fmtGpu(report.gpu)}\n`);
  process.stdout.write(`\n  Accelerator\n${fmtAccel(report.accelerator)}\n`);
  process.stdout.write(`\n  ${report.accelerator.note}\n`);
  process.stdout.write('  ─────────────────────────────────────────────────────\n');
  process.stdout.write('  tip: deterministic verdicts never depend on the compute backend; hardware is an optional acceleration layer only.\n\n');

  return 0;
}
