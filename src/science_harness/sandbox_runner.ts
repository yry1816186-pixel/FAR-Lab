/**
 * Sandbox runner — 类型层执行与确定性 hash 计算（spec 12 §1）。
 *
 * 诚实边界（F4 · 02 §4）：
 *   V1 提供 "resource-bounded & network-restricted venv execution" 的**类型层**实现：
 *   资源规格校验（SR-4 timeout · C19 上限）+ 确定性输出 hash 计算（SR-3）。
 *   严禁声称进程级物理隔离 / strong isolation / tamper-proof / physically isolated。
 *   实际 venv 子进程 spawn + 出站封禁 + GT read-only bind-mount 推迟到 V2+。
 *
 * V1 真实工作：computeSandboxRunResult 接受确定性输入，计算 stdoutHash/stderrHash/
 * artifactTreeHash——这些 hash 是 reproHash / ProofEnvelope 的前置锚（SR-3）。
 *
 * 权威 SSOT：FINAL_PACKAGE/12_EXECUTABLE_SCIENCE_HARNESS.md §1.2-§1.3（SR-1..SR-7）。
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。
 */

import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, type Dirent } from 'node:fs';
import { delimiter, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hashCanonicalJson } from '../evidence_log/index.ts';
import type { NetworkPolicy } from '../schema/enums.ts';
import {
  RESOURCE_LIMITS,
  type ArtifactManifest,
  type SandboxAdapter,
  type SandboxExecutionInput,
  type SandboxResourceSpec,
  type SandboxRunResult,
  type VenvSandboxAdapter,
  type VenvSandboxInput,
} from './types.ts';

const SANDBOX_RUNNER_PY = fileURLToPath(
  new URL('../../repro/science_harness/sandbox_runner.py', import.meta.url),
);

/** V1 默认固定种子（SR-2 · F8 反 p-hacking · 进 reproHash）。 */
export const DEFAULT_SEED = 42;

/**
 * V1 唯一 sandbox adapter：类型层确定性 hash 计算（禁声称进程隔离）。
 * V2+ 将替换为真实 venv 子进程执行。
 */
export const typeLayerSandboxAdapter: SandboxAdapter = {
  adapterId: 'type-layer-sandbox@v1',
  execute(input, resources) {
    return computeSandboxRunResult(input, resources);
  },
};

/**
 * 校验资源规格（02 C19 硬上限 + SR-4 timeout）。
 * 违规抛错——禁静默放宽上限（反假绿）。
 */
export function validateResourceSpec(spec: SandboxResourceSpec): void {
  if (spec.cpu.limitMillicores > RESOURCE_LIMITS.cpuMillicores) {
    throw new Error(
      `sandbox_runner: cpu.limitMillicores ${spec.cpu.limitMillicores} exceeds C19 ceiling ${RESOURCE_LIMITS.cpuMillicores}`,
    );
  }
  if (spec.memory.limitMb > RESOURCE_LIMITS.memoryMb) {
    throw new Error(
      `sandbox_runner: memory.limitMb ${spec.memory.limitMb} exceeds C19 ceiling ${RESOURCE_LIMITS.memoryMb}`,
    );
  }
  if (spec.timeoutMs > RESOURCE_LIMITS.timeoutMs) {
    throw new Error(
      `sandbox_runner: timeoutMs ${spec.timeoutMs} exceeds SR-4 ceiling ${RESOURCE_LIMITS.timeoutMs} (per-check granularity, not whole AgentRun)`,
    );
  }
}

/** sha256(text) — stdout/stderr 内容锚。 */
function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * 计算产出制品树 hash（SR-3 · spec 12 §1.2）。
 * artifacts 按 (path, contentHash) 排序后做 canonical_json → sha256（复用 hashCanonicalJson）。
 */
export function computeArtifactTreeHash(artifacts: readonly ArtifactManifest[]): string {
  const sorted = [...artifacts]
    .map((a) => ({ path: a.path, contentHash: a.contentHash, bytes: a.bytes }))
    .sort((a, b) => {
      const pathCmp = a.path.localeCompare(b.path);
      if (pathCmp !== 0) return pathCmp;
      return a.contentHash.localeCompare(b.contentHash);
    });
  return hashCanonicalJson({ artifacts: sorted });
}

/**
 * 计算 SandboxRunResult（V1 类型层核心）。
 *
 * 输入为确定性产物（exitCode/stdout/stderr/artifacts）；本函数计算所有 hash 字段
 * 并强制 V1 不变量：seed 默认 42（SR-2）、networkBlocked 默认 true（SR-5·类型层声明）、
 * singleThreaded=true（SR-7）。
 *
 * 注意：本函数不 spawn 子进程、不执行真实网络封禁（F4·V1 类型层）。
 * 它只对调用方提供的确定性输入计算 hash 锚——这是 reproHash 的前置条件。
 */
export function computeSandboxRunResult(
  input: SandboxExecutionInput,
  resources: SandboxResourceSpec,
): SandboxRunResult {
  validateResourceSpec(resources);

  const seed = input.seed ?? DEFAULT_SEED;
  const networkBlocked = input.networkBlocked ?? true;

  // SR-4：超时但 exitCode=0 是矛盾的——确定性输入须如实反映。
  // 不强制改写 exitCode（保留调用方真相），但 timedOut 字段独立记录。
  return {
    exitCode: input.exitCode,
    stdoutHash: sha256Hex(input.stdout),
    stderrHash: sha256Hex(input.stderr),
    artifacts: input.artifacts,
    artifactTreeHash: computeArtifactTreeHash(input.artifacts),
    wallClockMs: input.wallClockMs,
    timedOut: input.timedOut,
    networkBlocked,
    seed,
    singleThreaded: true, // SR-7 · nthread=1 单线程确定性
  };
}

/**
 * 由 SandboxRunResult 计算 reproHash 前置指纹（spec 12 §6）。
 * 复用 hashCanonicalJson 对确定性字段做 canonical hash。
 * 注意：此 hash 喂给上游 reproHash / ProofEnvelope，但不等于 proofHash（proofHash 由 sealer 计算）。
 */
export function computeSandboxReproFingerprint(result: SandboxRunResult): string {
  return hashCanonicalJson({
    exitCode: result.exitCode,
    stdoutHash: result.stdoutHash,
    stderrHash: result.stderrHash,
    artifactTreeHash: result.artifactTreeHash,
    seed: result.seed,
    singleThreaded: result.singleThreaded,
    networkBlocked: result.networkBlocked,
  });
}

// ---------------------------------------------------------------------------
// V2 venv sandbox（P1-6 · 真实 spawn 子进程）
// ---------------------------------------------------------------------------
// 复用 cas_backend.ts:spawnSympy / smt_backend.ts:buildPythonEnv 的 spawn 模板：
//   spawn(pythonCmd, [scriptPath], { env: buildVenvPythonEnv(), stdio:3×pipe, timeout })
//   stdin = JSON cfg；stdout = JSON result。
// 诚实边界（07_RISK_REGISTER §188）：networkPolicy 仅驱动 Python 侧 best-effort，非 OS 级隔离。

/**
 * venv 子进程环境：PYTHONPATH 注入 repro/ + .python-deps/（复用 smt_backend.ts:274 模板）。
 * `.python-deps/` 是 ensure_py_deps.mjs 的本地安装根，让子进程能 import threadpoolctl/numpy 等。
 */
export function buildVenvPythonEnv(): NodeJS.ProcessEnv {
  const existing = process.env.PYTHONPATH;
  const parts = [resolve('repro'), resolve('.python-deps')];
  if (existing !== undefined && existing.length > 0) {
    parts.push(existing);
  }
  return { ...process.env, PYTHONPATH: parts.join(delimiter) };
}

let venvAvailableCache: boolean | null = null;

/** Python 是否在 PATH 上（spawn 探针·缺则调用方诚实 skip）。 */
export function isVenvPythonAvailable(pythonCmd?: string): boolean {
  const cmd = pythonCmd ?? (process.platform === 'win32' ? 'python' : 'python3');
  if (pythonCmd === undefined && venvAvailableCache !== null) {
    return venvAvailableCache;
  }
  try {
    const r = spawnSync(cmd, ['-c', 'import sys; print(sys.version_info[:2])'], {
      timeout: 5000,
      encoding: 'utf8',
      env: buildVenvPythonEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const ok = r.status === 0 && r.stdout.trim().length > 0;
    if (pythonCmd === undefined) venvAvailableCache = ok;
    return ok;
  } catch {
    if (pythonCmd === undefined) venvAvailableCache = false;
    return false;
  }
}

interface RawVenvResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly artifacts: readonly ArtifactManifest[];
  readonly wallClockMs: number;
  readonly timedOut: boolean;
  readonly networkBlocked: boolean;
}

interface PythonSandboxManifest {
  readonly exitCode?: number;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly artifacts?: readonly ArtifactManifest[];
  readonly wallClockMs?: number;
  readonly networkBlocked?: boolean;
}

/**
 * 扫描 workingDir 递归收集 artifacts（sha256 + bytes）。
 * Python 子进程在 happy path 自己发 manifest（它是产物权威）；本函数是超时/崩溃 fallback。
 * 与 sandbox_runner.py:scan_artifacts 同算法。
 */
export function collectArtifacts(workingDir: string): ArtifactManifest[] {
  const base = resolve(workingDir);
  const out: ArtifactManifest[] = [];
  walkArtifacts(base, base, out);
  return out;
}

function walkArtifacts(base: string, dir: string, out: ArtifactManifest[]): void {
  let entries: readonly Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      walkArtifacts(base, full, out);
    } else if (entry.isFile()) {
      try {
        const data = readFileSync(full);
        const rel = full.slice(base.length).replace(/^[\\/]+/, '');
        out.push({
          path: rel,
          contentHash: createHash('sha256').update(data).digest('hex'),
          bytes: data.length,
        });
      } catch {
        // 不可读文件跳过（best-effort，非 fail-closed——收集阶段允许丢）
      }
    }
  }
}

/**
 * 真 spawn venv 子进程执行用户脚本。
 *
 * 协议：stdin = {script, seed, networkPolicy, allowedHosts, workingDir, timeoutMs}；
 * stdout = Python manifest JSON（exitCode/stdout/stderr/artifacts/wallClockMs/networkBlocked）。
 *
 * 超时（spawn timeout 强杀）：code=null + signal → timedOut=true，TS 侧 collectArtifacts 补 manifest。
 * 崩溃（Python 未发 JSON，如 import 失败）：fail-soft，TS 侧补 manifest。
 */
export async function spawnVenv(
  input: VenvSandboxInput,
  resources: SandboxResourceSpec,
): Promise<RawVenvResult> {
  const pythonCmd = input.pythonCmd ?? (process.platform === 'win32' ? 'python' : 'python3');
  const networkPolicy: NetworkPolicy = input.networkPolicy ?? 'off';
  const timeoutMs = input.timeoutMs ?? resources.timeoutMs;
  // SR-4 fail-closed：input.timeoutMs 不得绕过 C19/SR-4 硬上限（executeAsync 只校验 resources.timeoutMs，
  // 此处对 effective 值二次校验，封 input.timeoutMs 旁路——禁静默放宽上限·反假绿）。
  if (timeoutMs > RESOURCE_LIMITS.timeoutMs) {
    throw new Error(
      `sandbox_runner: effective timeoutMs ${timeoutMs} exceeds SR-4 ceiling ${RESOURCE_LIMITS.timeoutMs}`,
    );
  }

  const cfg = {
    script: input.script,
    seed: input.seed ?? DEFAULT_SEED,
    networkPolicy,
    allowedHosts: input.allowedHosts ?? [],
    workingDir: input.workingDir ?? '',
    timeoutMs,
  };

  return new Promise<RawVenvResult>((promiseResolve) => {
    const child = spawn(pythonCmd, [SANDBOX_RUNNER_PY], {
      env: buildVenvPythonEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const start = Date.now();
    let timedOut = false;
    let settled = false;

    const finish = (result: RawVenvResult): void => {
      if (settled) return;
      settled = true;
      promiseResolve(result);
    };

    child.stdout.on('data', (c: Buffer) => stdoutChunks.push(c));
    child.stderr.on('data', (c: Buffer) => stderrChunks.push(c));

    child.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
      if (signal !== null || code === null) timedOut = true;
    });

    child.on('error', () => {
      // ENOENT：python 不在 PATH。fail-soft（调用方应先 isVenvPythonAvailable 探针）。
      finish({
        exitCode: 127,
        stdout: '',
        stderr: `venv spawn failed: ${pythonCmd} not on PATH`,
        artifacts: [],
        wallClockMs: Date.now() - start,
        timedOut: false,
        networkBlocked: networkPolicy === 'off',
      });
    });

    child.on('close', (code: number | null) => {
      const stdoutText = Buffer.concat(stdoutChunks).toString('utf8');
      const stderrText = Buffer.concat(stderrChunks).toString('utf8');
      const wallClockMs = Date.now() - start;
      const fallbackArtifacts = input.workingDir ? collectArtifacts(input.workingDir) : [];

      if (timedOut) {
        finish({
          exitCode: 124,
          stdout: stdoutText,
          stderr: stderrText,
          artifacts: fallbackArtifacts,
          wallClockMs,
          timedOut: true,
          networkBlocked: networkPolicy === 'off',
        });
        return;
      }

      let parsed: PythonSandboxManifest | null;
      try {
        parsed = JSON.parse(stdoutText) as PythonSandboxManifest;
      } catch {
        parsed = null;
      }

      if (parsed === null) {
        // Python 崩溃前未发 JSON（import 失败等）——fail-soft。
        finish({
          exitCode: code ?? 1,
          stdout: stdoutText,
          stderr: stderrText,
          artifacts: fallbackArtifacts,
          wallClockMs,
          timedOut: false,
          networkBlocked: networkPolicy === 'off',
        });
        return;
      }

      finish({
        exitCode: typeof parsed.exitCode === 'number' ? parsed.exitCode : (code ?? 1),
        stdout: typeof parsed.stdout === 'string' ? parsed.stdout : '',
        stderr: typeof parsed.stderr === 'string' ? parsed.stderr : stderrText,
        artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
        wallClockMs: typeof parsed.wallClockMs === 'number' ? parsed.wallClockMs : wallClockMs,
        timedOut: false,
        networkBlocked:
          typeof parsed.networkBlocked === 'boolean' ? parsed.networkBlocked : networkPolicy === 'off',
      });
    });

    child.stdin.write(JSON.stringify(cfg));
    child.stdin.end();
  });
}

/**
 * V2 venv sandbox adapter（P1-6）：真 spawn 子进程，复用 computeSandboxRunResult 计算 hash 锚。
 * 与 V1 typeLayerSandboxAdapter 共存（V1 仍是确定性 hash 路径的 fallback）。
 */
export const venvSandboxAdapter: VenvSandboxAdapter = {
  adapterId: 'venv-sandbox@v2',
  isAvailable() {
    return isVenvPythonAvailable();
  },
  async executeAsync(input, resources) {
    validateResourceSpec(resources);
    const seed = input.seed ?? DEFAULT_SEED;
    const raw = await spawnVenv(input, resources);
    const execInput: SandboxExecutionInput = {
      exitCode: raw.exitCode,
      stdout: raw.stdout,
      stderr: raw.stderr,
      artifacts: raw.artifacts,
      wallClockMs: raw.wallClockMs,
      timedOut: raw.timedOut,
      seed,
      networkBlocked: raw.networkBlocked,
    };
    return computeSandboxRunResult(execInput, resources);
  },
};
