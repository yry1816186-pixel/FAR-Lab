// src/platform/dotenv.ts
// 职责：CLI 入口 .env 水合（hydration）——dotenv 标准语义的最小零依赖实现。
//
// 背景（现实纠偏 2026-08-19）：仓库文档与 `far research` 错误提示均承诺
// 「把 DASHSCOPE_API_KEY 放进 .env」，且 scripts/dev.mjs 已为 API 子进程实现
// 同样的加载；但 CLI 入口（far.ts）从未加载 .env —— 用户按文档操作后
// `far doctor` / `far research` / `far api` 仍报告 credential not configured，
// 真实 LIVE 通路被一个加载缺口误判为 BLOCKED_BY_CREDENTIAL。本模块闭合此缺口。
//
// 语义（与 scripts/dev.mjs loadDotEnvOverrides 严格一致——那边是参考实现，
// 这边是 src 内可测 SSOT；dev.mjs 为纯 .mjs 脚本无法复用 TS 模块，保留其
// 原实现，两侧语义由本文件注释锚定，漂移时以本文件 + tests/platform/dotenv
// 为准）：
//   1. 文件缺失 → 完全 no-op（离线/无凭据环境照常工作）；
//   2. 真实环境变量优先（已存在于 env 的键绝不覆盖）；
//   3. 文件内同名键首次出现优先；
//   4. 支持空行、`#` 注释、`export KEY=VALUE` 前缀、成对单/双引号剥离、CRLF；
//   5. 值永不被打印或返回——hydrate 只返回加载的键名（审计用），不返回值。
//
// 安全边界：本模块只读 `<repo>/.env`（调用方传入路径），不递归、不跟随
// symlink 语义之外的任何位置；解析失败行静默跳过（best-effort，与 dev.mjs
// 一致——.env 是本地凭据边界，格式错误不应让 CLI 崩溃）。
//
// 关闭通道：`FAR_DOTENV=off` 时 CLI 入口跳过水合（far.ts 判定，本模块保持
// 纯函数）。用途：① 测试需要严格 hermetic 的凭据真空（开发机真实 .env 不得
// 渗入 credential-absence 断言）；② 用户临时想以无凭据态运行。
//
// Cannot-prove：本模块证明「.env 按上述语义进入 process.env」；不证明任何
// 凭据真实有效（那是 `far doctor --probe-credentials` 的实测面）。
import { existsSync, readFileSync } from 'node:fs';

/**
 * 解析 .env 文本为键值对（纯函数，无 IO）。
 * 同名键首次出现优先；畸形行（无 `=` / 空键）静默跳过。
 */
export function parseDotEnv(content: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const assignment = line.startsWith('export ') ? line.slice('export '.length) : line;
    const eq = assignment.indexOf('=');
    if (eq <= 0) continue; // 缺键或缺 '='——静默跳过（best-effort loader）
    const key = assignment.slice(0, eq).trim();
    const value = assignment.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (key in out) continue; // 文件内首次出现优先
    out[key] = value;
  }
  return out;
}

export interface DotEnvHydration {
  /** 实际写入 env 的键名（仅供审计计数/点名；值永不返回）。 */
  readonly loadedKeys: readonly string[];
  /** .env 文件是否存在。 */
  readonly filePresent: boolean;
}

/**
 * 将 envPath（若存在）按 dotenv 语义水合进 `env`（典型为 process.env）：
 * 已存在的键一律不覆盖。返回加载的键名（不返回值）。
 */
export function hydrateEnvFromDotEnv(
  env: NodeJS.ProcessEnv,
  envPath: string,
): DotEnvHydration {
  if (!existsSync(envPath)) return { loadedKeys: [], filePresent: false };
  const parsed = parseDotEnv(readFileSync(envPath, 'utf8'));
  const loaded: string[] = [];
  for (const [key, value] of Object.entries(parsed)) {
    if (key in env) continue; // 真实环境变量优先（dotenv 标准语义）
    env[key] = value;
    loaded.push(key);
  }
  return { loadedKeys: loaded, filePresent: true };
}
