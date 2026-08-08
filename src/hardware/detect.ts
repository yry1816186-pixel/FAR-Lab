/**
 * FAR-Lab 硬件探测层 (Hardware Detection)
 *
 * 目的：用户愿景「适配支持各种计算卡」的探测地基。在**不引入任何 native 依赖**
 * 的前提下，尽力而为地探测当前运行时可用的计算后端：
 *   - CPU（架构 / 核心数 / 内存）
 *   - GPU（nvidia-smi / rocm-smi / macOS Metal）
 *   - WebGPU / WASM（前端与 Node 实验层可用性）
 * 任何探测失败都返回 UNKNOWN（尽力而为，绝不 crash，绝不影响裁决确定性）。
 *
 * 确定性铁律：探测结果只用于**展示与提示**，绝不参与 R0-R9 裁决核的输入。
 * 计算永远走确定性路径；硬件加速是「可选加速层」，不是「正确性依赖」。
 *
 * ADDITIVE ONLY — 不修改任何现有模块。
 */
import * as os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** 探测结果值域 */
export type HardwareProbeStatus = 'OK' | 'UNKNOWN' | 'UNAVAILABLE';

export interface CpuInfo {
  status: HardwareProbeStatus;
  arch: string;
  model: string;
  cores: number;
  /** MiB */
  totalMem: number;
}

export interface GpuInfo {
  status: HardwareProbeStatus;
  /** 已探测到的 GPU 列表（每个含 vendor / name / vramMiB，尽力而为） */
  devices: Array<{ vendor: string; name: string; vramMiB: number | null }>;
  /** 探测失败的原始错误信息（诊断用，不外发敏感信息） */
  probeError: string | null;
}

export interface AcceleratorInfo {
  webgpu: HardwareProbeStatus;
  wasm: HardwareProbeStatus;
  /** Node 当前平台 */
  platform: string;
  /** better-sqlite3 等 native 二进制是否可能可用（仅提示，非保证） */
  note: string;
}

export interface HardwareReport {
  timestamp: string;
  cpu: CpuInfo;
  gpu: GpuInfo;
  accelerator: AcceleratorInfo;
}

const MAX_GPU_PROBE_TIMEOUT_MS = 5000;

/** 探测 CPU */
function detectCpu(): CpuInfo {
  const firstCpu = os.cpus()[0];
  return {
    status: 'OK',
    arch: os.arch(),
    model: firstCpu?.model ?? 'unknown',
    cores: os.cpus().length,
    totalMem: Math.round(os.totalmem() / (1024 * 1024)),
  };
}

/** 探测 GPU（nvidia-smi → rocm-smi → macOS Metal，尽力而为） */
async function detectGpu(): Promise<GpuInfo> {
  const tryProbe = async (cmd: string, args: string[]): Promise<{ vendor: string; name: string; vramMiB: number | null } | null> => {
    try {
      const { stdout } = await execFileAsync(cmd, args, {
        timeout: MAX_GPU_PROBE_TIMEOUT_MS,
        windowsHide: true,
      });
      return parseGpuLine(stdout, cmd);
    } catch {
      return null; // 命令不存在或超时 → 换下一个探测路径
    }
  };

  if (process.platform === 'win32') {
    // Windows: nvidia-smi（通常位于 C:\Windows\System32 或驱动目录）
    const nvidia = await tryProbe('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']);
    if (nvidia) return { status: 'OK', devices: [nvidia], probeError: null };
    return { status: 'UNKNOWN', devices: [], probeError: 'no nvidia-smi found' };
  }

  if (process.platform === 'darwin') {
    // macOS: system_profiler SPDisplaysDataType（无 system_profiler 时降级）
    try {
      const { stdout } = await execFileAsync('system_profiler', ['SPDisplaysDataType'], {
        timeout: MAX_GPU_PROBE_TIMEOUT_MS,
      });
      const name = parseMacMetal(stdout);
      if (name) {
        return {
          status: 'OK',
          devices: [{ vendor: 'Apple', name, vramMiB: null }],
          probeError: null,
        };
      }
      return { status: 'UNKNOWN', devices: [], probeError: 'no Metal device parsed' };
    } catch {
      return { status: 'UNKNOWN', devices: [], probeError: 'system_profiler unavailable' };
    }
  }

  // Linux: nvidia-smi 优先，rocm-smi 其次
  const nvidia = await tryProbe('nvidia-smi', ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits']);
  if (nvidia) return { status: 'OK', devices: [nvidia], probeError: null };
  const rocm = await tryProbe('rocm-smi', ['--showproductname']);
  if (rocm) return { status: 'OK', devices: [rocm], probeError: null };
  return { status: 'UNKNOWN', devices: [], probeError: 'neither nvidia-smi nor rocm-smi found' };
}

/** 解析 nvidia-smi 一行 CSV：`NVIDIA GeForce RTX 4090, 24564` */
function parseGpuLine(stdout: string, cmd: string): { vendor: string; name: string; vramMiB: number | null } | null {
  const line = stdout.split('\n').find((l) => l.trim().length > 0);
  if (!line) return null;
  if (cmd.includes('rocm-smi')) {
    return { vendor: 'AMD', name: line.trim().slice(0, 120), vramMiB: null };
  }
  const parts = line.split(',').map((p) => p.trim());
  const name = parts[0] ?? 'unknown';
  const vram = parts[1] ? Number(parts[1]) : null;
  return {
    vendor: name.includes('NVIDIA') ? 'NVIDIA' : name.includes('AMD') ? 'AMD' : 'unknown',
    name,
    vramMiB: Number.isFinite(vram) && vram !== null ? vram : null,
  };
}

/** 解析 macOS system_profiler 输出中的 Metal 设备名 */
function parseMacMetal(stdout: string): string | null {
  const match = stdout.match(/Chipset Model:\s*(.+)/);
  return match?.[1]?.trim() ?? null;
}

/** 探测加速能力（WebGPU/WASM —— 尽力而为，纯推断） */
function detectAccelerator(): AcceleratorInfo {
  const hasWebGpuFlag =
    typeof (globalThis as Record<string, unknown>).navigator !== 'undefined' &&
    typeof ((globalThis as Record<string, unknown>).navigator as Record<string, unknown>).gpu === 'object';

  const hasWasm = typeof WebAssembly !== 'undefined' && typeof WebAssembly.instantiate === 'function';

  return {
    webgpu: hasWebGpuFlag ? 'OK' : 'UNAVAILABLE',
    wasm: hasWasm ? 'OK' : 'UNAVAILABLE',
    platform: process.platform,
    note:
      'Hardware probes are informational only — verdict determinism never depends on a compute backend.',
  };
}

/** 生成完整硬件报告（幂等、尽力而为、绝不抛出） */
export async function detectHardware(): Promise<HardwareReport> {
  const cpu = detectCpu();
  const gpu = await detectGpu().catch<GpuInfo>(() => ({
    status: 'UNKNOWN',
    devices: [],
    probeError: 'probe crashed',
  }));
  const accelerator = detectAccelerator();

  return {
    timestamp: new Date().toISOString(),
    cpu,
    gpu,
    accelerator,
  };
}
