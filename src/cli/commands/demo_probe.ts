/**
 * demo 环境探测。
 *
 * 背景（findings S1）：demo 全同步零超时——better-sqlite3 native 模块加载异常或
 * Node 版本 <24（无原生 type stripping）时，进程可能永不 exit（用户面前死等）。
 * 同步挂起无法被 timer 中断（事件循环阻塞），故主防线 = 启动前置探测 + fail-fast：
 * demo 逻辑跑任何重活前先验证环境，失败立即打印可读错误并返回非 0（≤5s 内退出）。
 *
 * 诚实边界（顾问红队裁定 + 已排除方案）：不做全局超时看门狗——同步 native 阻塞下
 * timer 不触发，看门狗是无效死代码；探测 + fail-fast 是唯一可靠防线。
 */

import { createRequire } from 'node:module';

// ESM 下无全局 require：createRequire 提供 CJS 加载能力（探测 better-sqlite3 二进制）。
const nodeRequire = createRequire(import.meta.url);

/** 探测结果（ok=false 时 error 非空·含可执行指引）。 */
export interface ProbeResult {
  readonly ok: boolean;
  readonly error: string | null;
}

/** 可注入探测依赖（单测用·默认读真实环境）。 */
export interface ProbeEnvironmentOptions {
  /** 当前 Node 版本字符串（默认 process.version·如 'v24.14.0'）。 */
  readonly nodeVersion?: string;
  /** better-sqlite3 加载+打开验证（默认动态加载并打开 :memory:）。 */
  readonly sqliteLoad?: () => void;
}

/**
 * 解析 Node 主版本号（'v24.14.0' → 24）。解析失败返回 null（fail-closed 视为不满足）。
 */
export function parseNodeMajor(version: string): number | null {
  const m = /^v?(\d+)/.exec(version.trim());
  return m !== null ? Number(m[1]) : null;
}

/**
 * 环境前置探测：Node 主版本 ≥24（原生 type stripping 要求）+ better-sqlite3 可加载可打开。
 *
 * @returns ProbeResult——ok=false 时 error 含版本指引 / Docker 后备指引（现场可执行）。
 */
export function probeEnvironment(options: ProbeEnvironmentOptions = {}): ProbeResult {
  const nodeVersion = options.nodeVersion ?? process.version;
  const major = parseNodeMajor(nodeVersion);
  if (major === null || major < 24) {
    return {
      ok: false,
      error:
        `far demo: Node.js >= 24 required (found ${nodeVersion}) — the CLI uses native type ` +
        `stripping and better-sqlite3 prebuilds. Install Node >= 24, or run the demo inside ` +
        `the provided Docker container (docker run --rm -it <image> node src/cli/far.ts demo).`,
    };
  }

  try {
    const load = options.sqliteLoad ?? ((): void => {
      // 动态加载 + 打开 :memory:（关闭即验证 native 二进制可用·不落磁盘）。
      const Database = nodeRequire('better-sqlite3') as new (path: string) => {
        close(): void;
      };
      const db = new Database(':memory:');
      db.close();
    });
    load();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error:
        `far demo: better-sqlite3 native module unavailable (${detail}). Reinstall via ` +
        `'pnpm install' (prebuilt binaries), or fall back to the provided Docker container ` +
        `(docker run --rm -it <image> node src/cli/far.ts demo).`,
    };
  }

  return { ok: true, error: null };
}

/**
 * GV 失败有界重试。
 *
 * 背景：GV 失败即 exit 7 硬终止（后续 PHASE2/3 精彩内容全看不到）——kernel 行为
 * 瞬时波动或 fixture 同步延迟时现场直接死亡。修复：有界重试 1 次（消除瞬时失败；
 * 持续失败仍如实返回·不掩盖真实漂移）。
 *
 * @param run 执行一次 GV 校验的副作用函数（返回退出码）
 * @param retries 重试次数（默认 1·有界防无限循环）
 * @returns 最后一次运行的退出码（0=成功）
 */
export function retryGoldenOnce(run: () => number, retries = 1): number {
  let exit = run();
  for (let i = 0; i < retries && exit !== 0; i += 1) {
    exit = run();
  }
  return exit;
}
