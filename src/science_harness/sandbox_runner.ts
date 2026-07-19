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
 * 历史溯源：FINAL_PACKAGE/12_EXECUTABLE_SCIENCE_HARNESS.md §1.2-§1.3 SR-1..SR-7（已归档·备份 FAR-Lab_Backups/）·运行时 SSOT 以本文件源码实测为准。
 * 零容忍合规：无 any / @ts-ignore / 空 catch / 双重断言。
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, type Dirent, type Stats } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { PACKAGE_ROOT } from '../paths.ts';
import { hashCanonicalJson } from '../evidence_log/index.ts';
import type { NetworkPolicy } from '../schema/enums.ts';
import type { ExecutionFingerprint } from '../falsifiability/verdict_kernel_v2.ts';
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

const SANDBOX_RUNNER_PY = join(PACKAGE_ROOT, 'repro', 'science_harness', 'sandbox_runner.py');

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
  // FUSION-OS-7：cpu/peak_rss 透传（缺省 0=未测量）。非负有限守卫——防 Python 侧异常负值/NaN 污染指纹。
  const cpuMs = sanitizeResourceMetric(input.cpuMs);
  const peakRssKb = sanitizeResourceMetric(input.peakRssKb);

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
    cpuMs,
    peakRssKb,
  };
}

/** FUSION-OS-7：资源度量守卫——非负有限数，否则归 0（未测量）。防 NaN/负值/Infinity 污染执行指纹比对。 */
function sanitizeResourceMetric(value: number | undefined): number {
  if (value === undefined) return 0;
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

/**
 * FUSION-OS-7：从 SandboxRunResult 提取执行指纹三元组（wall/cpu/peak_rss）。
 * 供 caller（orchestrator）记录到 StatisticalResult.executionFingerprint 作复算基线，
 * 或与复算观测三元组比对（flagExecutionFingerprintMagnitudeMismatch·定义于 verdict_kernel_v2）。
 * ExecutionFingerprint 类型定义于 verdict_kernel_v2.ts（StatisticalResult 字段的归属内核类型）。
 */
export function executionFingerprintFromSandboxResult(result: SandboxRunResult): ExecutionFingerprint {
  return { wallMs: result.wallClockMs, cpuMs: result.cpuMs, peakRssKb: result.peakRssKb };
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
 * venv 子进程环境（FUSION-OS-8）：白名单 + secret 剥离 + PYTHONPATH 注入。
 *
 * 旧实现 `{ ...process.env }` 把全部环境透传给 Python 子进程，用户脚本可经 `os.environ` 读到
 * OPENAI_API_KEY / *_TOKEN / *_SECRET —— 来源不可自填红线的注入面。Open Science secret-strip
 * 范式：显式白名单（Python 启动所需的最小集）+ secret key 正则剥离（纵深防御，Python 侧 apply_env_hardening 二次剥离）。
 *
 * `.python-deps/` 是 ensure_py_deps.mjs 的本地安装根，让子进程能 import threadpoolctl/numpy 等。
 */
const VENV_ENV_ALLOWLIST: ReadonlySet<string> = new Set([
  'PATH',
  'PATHEXT',
  'SYSTEMROOT',
  'SYSTEMDRIVE',
  'WINDIR',
  'TEMP',
  'TMP',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'PYTHONHOME',
  'PYTHONPATH',
  'PYTHONUTF8',
  'PYTHONDONTWRITEBYTECODE',
  'NO_PROXY',
]);

const SECRET_ENV_PATTERN = /(API_KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|PRIVATE_KEY|ACCESS_KEY)/i;

let pythonDepsCompatibleCache: boolean | null = null;

// .python-deps is git-tracked and may contain cross-platform binaries (e.g. Linux .so on Windows).
// Probe scipy (compiled extension) — if it fails, .python-deps is incompatible and must be skipped
// in favor of system Python packages, otherwise import chains like lightkurve→scipy break.
function isPythonDepsCompatible(): boolean {
  if (pythonDepsCompatibleCache !== null) return pythonDepsCompatibleCache;
  const pythonDepsDir = resolve('.python-deps');
  if (!existsSync(pythonDepsDir)) {
    pythonDepsCompatibleCache = false;
    return false;
  }
  const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
  const probeEnv = { ...process.env, PYTHONPATH: [resolve('repro'), pythonDepsDir].join(delimiter) };
  // 探针目标须是 ensure_py_deps.mjs requiredModules 实际装的（numpy）——曾误用 scipy
  // （不在依赖列表），导致 CI 探针恒 false → PYTHONPATH 不含 .python-deps →
  // sandbox ModuleNotFoundError(numpy) → c_astro BLS 持续失败（build-integrity 4 run）。
  const r = spawnSync(pythonCmd, ['-c', 'import numpy'], { encoding: 'utf8', env: probeEnv, timeout: 10_000 });
  pythonDepsCompatibleCache = r.status === 0;
  return pythonDepsCompatibleCache;
}

export function buildVenvPythonEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    // FUSION-OS-8 secret-strip：剥离 key 名匹配 secret 模式的 env（API_KEY/SECRET/TOKEN/...）。
    if (SECRET_ENV_PATTERN.test(key)) continue;
    // 白名单：仅放行 Python 启动 + 确定性执行所需的最小 env 集。
    if (!VENV_ENV_ALLOWLIST.has(key)) continue;
    env[key] = value;
  }
  const existing = process.env.PYTHONPATH;
  const parts = [resolve('repro')];
  const compatible = isPythonDepsCompatible();
  if (compatible) {
    parts.push(resolve('.python-deps'));
  }
  if (existing !== undefined && existing.length > 0) {
    if (compatible) {
      parts.push(existing);
    } else {
      const pythonDepsAbs = resolve('.python-deps');
      const filtered = existing.split(delimiter).filter(p => p !== pythonDepsAbs);
      if (filtered.length > 0) parts.push(filtered.join(delimiter));
    }
  }
  env.PYTHONPATH = parts.join(delimiter);
  return env;
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

let venv312PythonCache: string | null | undefined = undefined;

// 发现 .venv312（Python 3.12·lightkurve 兼容）并验证 lightkurve+astroquery 可 import。
// 系统 python 3.14 无稳定 lightkurve wheel → P1-6 真在线取数须走此 venv；缺/坏则返回 null，
// 调用方据 null 走 cached_fixture 降级（02 F1 never-fabricate）。
export function resolveVenvPython(): string | null {
  if (venv312PythonCache !== undefined) return venv312PythonCache;
  const venvDir = resolve('.venv312');
  const pythonExe = process.platform === 'win32'
    ? join(venvDir, 'Scripts', 'python.exe')
    : join(venvDir, 'bin', 'python');
  if (!existsSync(pythonExe)) {
    venv312PythonCache = null;
    return null;
  }
  const r = spawnSync(pythonExe, ['-c', 'import lightkurve, astroquery'], {
    timeout: 15_000,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  venv312PythonCache = r.status === 0 ? pythonExe : null;
  return venv312PythonCache;
}

interface RawVenvResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly artifacts: readonly ArtifactManifest[];
  readonly wallClockMs: number;
  readonly timedOut: boolean;
  readonly networkBlocked: boolean;
  readonly cpuMs: number;
  readonly peakRssKb: number;
}

interface PythonSandboxManifest {
  readonly exitCode?: number;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly artifacts?: readonly ArtifactManifest[];
  readonly wallClockMs?: number;
  readonly networkBlocked?: boolean;
  readonly cpuMs?: number;
  readonly peakRssKb?: number;
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
 * FUSION-OS-4：spawnVenv 前 workingDir 预算预扫（Open Science gitScanWorker 范式·用户态降级版）。
 *
 * 收窄在 spawn 前对 workingDir 的伪造/洪水窗口：拒绝 .git 目录（git flood·artifact 扫描爆量 +
 * 仓库泄漏）、拒绝任意 symlink（O_NOFOLLOW 策略·永不跟随·防 path traversal 逃逸）、拒绝文件数超 cap
 * （zip-bomb / 洪水）。container 检测为信息性 best-effort（不拒绝·记录隔离弱化态）。
 *
 * 诚实边界（07_RISK_REGISTER §188）：本扫描是用户态字符串/lstat 检查，非 OS 级 fs 隔离（mount namespace /
 * seccomp）。真 OS 级隔离仍是 V2 路线。本层收窄的是「spawn 前显式拒绝已知恶意形状」，非强隔离保证。
 */
export const PREFLIGHT_DEFAULT_FILE_CAP = 5000;

export interface PreflightOptions {
  readonly fileCap?: number;
}

export interface PreflightResult {
  readonly ok: boolean;
  readonly reason: string;
  readonly containerDetected: boolean;
  readonly fileCount: number;
}

export function preflightWorkingDir(workingDir: string, options?: PreflightOptions): PreflightResult {
  const containerDetected = detectContainer();
  if (workingDir.length === 0) {
    return { ok: true, reason: 'no workingDir', containerDetected, fileCount: 0 };
  }
  const base = resolve(workingDir);
  if (!existsSync(base)) {
    return { ok: false, reason: `preflight: workingDir not found: ${base}`, containerDetected, fileCount: 0 };
  }
  let dirStat: Stats;
  try {
    dirStat = statSync(base);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `preflight: workingDir stat failed: ${message}`, containerDetected, fileCount: 0 };
  }
  if (!dirStat.isDirectory()) {
    return { ok: false, reason: `preflight: workingDir not a directory: ${base}`, containerDetected, fileCount: 0 };
  }
  // .git-cap：workingDir 内含 .git（git flood / 仓库泄漏）→ 拒绝。
  if (existsSync(join(base, '.git'))) {
    return { ok: false, reason: `preflight: .git not allowed in workingDir (git-flood)`, containerDetected, fileCount: 0 };
  }
  const fileCap = options?.fileCap ?? PREFLIGHT_DEFAULT_FILE_CAP;
  let fileCount = 0;
  const symlinkHit = preflightWalk(base, base, (entry) => {
    fileCount += 1;
    return entry.isFile() || entry.isDirectory();
  });
  if (symlinkHit !== null) {
    return {
      ok: false,
      reason: `preflight: symlink not allowed (O_NOFOLLOW): ${symlinkHit}`,
      containerDetected,
      fileCount,
    };
  }
  if (fileCount > fileCap) {
    return {
      ok: false,
      reason: `preflight: file count ${fileCount} exceeds cap ${fileCap} (flood/zip-bomb)`,
      containerDetected,
      fileCount,
    };
  }
  return { ok: true, reason: 'ok', containerDetected, fileCount };
}

// O_NOFOLLOW walk：lstatSync 每个条目（永不跟随 symlink）；symlink → 返回相对路径（拒绝信号）。
// 返回 null = 干净；返回 string = 命中的 symlink 相对路径。
function preflightWalk(
  base: string,
  dir: string,
  onRegular: (entry: Dirent) => boolean,
): string | null {
  let entries: readonly Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      const full = resolve(dir, entry.name);
      return full.slice(base.length).replace(/^[\\/]+/, '');
    }
    if (entry.isDirectory()) {
      onRegular(entry);
      const sub = preflightWalk(base, resolve(dir, entry.name), onRegular);
      if (sub !== null) return sub;
    } else if (entry.isFile()) {
      onRegular(entry);
    } else {
      // 非常规非符号链接（FIFO/socket/blk/chr）→ 当未知形状拒绝（fail-closed）。
      const full = resolve(dir, entry.name);
      return full.slice(base.length).replace(/^[\\/]+/, '');
    }
  }
  return null;
}

/**
 * FUSION-OS-2：跨平台进程组 kill（Open Science setsid+kill -- -$pgid 范式）。
 *
 * POSIX：detached=true 让 child 成为新进程组 leader（pgid=child.pid），process.kill(-pid) 组播 SIGKILL，
 * 杀尽孤孙（numpy/OpenBLAS 线程 / subprocess.Popen 子进程——它们继承父的 group·不 setsid）。
 * Windows：无 POSIX 进程组，taskkill /T /PID 递归杀进程树（/T=tree /F=force）。
 * 兜底：组 kill 失败（race 自然退出 / 权限）→ child.kill('SIGKILL') 单进程兜底。
 */
export function killProcessGroup(child: ChildProcess): void {
  const pid = child.pid;
  if (pid === undefined) return;
  if (process.platform === 'win32') {
    const r = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    if (r.status === 0) return;
    // taskkill 非零（PID 已死 / 权限）→ 落到单进程兜底。
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
      return;
    } catch {
      // ESRCH（组已死）/ EPERM → 落到单进程兜底（race 自然退出·best-effort）。
    }
  }
  try {
    child.kill('SIGKILL');
  } catch {
    // 已死——best-effort，finish 路径不依赖此成功。
  }
}

// container 检测（信息性 best-effort·非拒绝）：/.dockerenv 或 /proc/1/cgroup 含 docker/lxc/kubepods。
function detectContainer(): boolean {
  try {
    if (existsSync('/.dockerenv')) return true;
    const cgroup = '/proc/1/cgroup';
    if (!existsSync(cgroup)) return false;
    const text = readFileSync(cgroup, 'utf8');
    return /docker|lxc|kubepods/.test(text);
  } catch {
    // best-effort 信息性检测：cgroup 不可读（权限）→ 视为未检测到。非 fail-closed 路径。
    return false;
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

  // FUSION-OS-4：spawn 前 workingDir 预扫（.git flood / symlink O_NOFOLLOW / 文件数 cap）。
  // fail-closed——preflight 拒绝则不 spawn，返回 exitCode 126（与 SR-4 ceiling throw 区分：throw 用于
  // 调用方编程错误，preflight 拒绝是 sandbox 输入形状拒绝·落 RawVenvResult 让 caller 审计）。
  const preflight = preflightWorkingDir(input.workingDir ?? '');
  if (!preflight.ok) {
    return Promise.resolve({
      exitCode: 126,
      stdout: '',
      stderr: preflight.reason,
      artifacts: [],
      wallClockMs: 0,
      timedOut: false,
      networkBlocked: networkPolicy === 'off',
      cpuMs: 0,
      peakRssKb: 0,
    });
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
    // FUSION-OS-2：detached=true 让子进程成为独立进程组 leader（POSIX·pgid=child.pid）/ 新 console（win）。
    // 不用 Node `timeout` 选项——它只对单进程发 SIGTERM，孤孙（numpy/OpenBLAS 线程 / subprocess）逃逸。
    // 自管 timer + killProcessGroup 组播清理（process.kill(-pgid) POSIX / taskkill /T win）。
    const child = spawn(pythonCmd, [SANDBOX_RUNNER_PY], {
      env: buildVenvPythonEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const start = Date.now();
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      killProcessGroup(child);
    }, timeoutMs);

    const finish = (result: RawVenvResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
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
        cpuMs: 0,
        peakRssKb: 0,
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
          cpuMs: 0,
          peakRssKb: 0,
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
          cpuMs: 0,
          peakRssKb: 0,
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
        cpuMs: typeof parsed.cpuMs === 'number' ? parsed.cpuMs : 0,
        peakRssKb: typeof parsed.peakRssKb === 'number' ? parsed.peakRssKb : 0,
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
    if (raw.exitCode !== 0 && raw.stderr.trim().length > 0) {
      console.error(`[venv-sandbox] exitCode=${raw.exitCode} stderr:\n${raw.stderr.slice(0, 2000)}`);
    }
    const execInput: SandboxExecutionInput = {
      exitCode: raw.exitCode,
      stdout: raw.stdout,
      stderr: raw.stderr,
      artifacts: raw.artifacts,
      wallClockMs: raw.wallClockMs,
      timedOut: raw.timedOut,
      seed,
      networkBlocked: raw.networkBlocked,
      cpuMs: raw.cpuMs,
      peakRssKb: raw.peakRssKb,
    };
    return computeSandboxRunResult(execInput, resources);
  },
};
