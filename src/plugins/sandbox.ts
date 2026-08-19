// src/plugins/sandbox.ts
// 插件执行沙箱宿主侧（OSS-PLUGIN-001 Acceptance：malicious/timeout/schema 的执行面）。
//
// 架构（v2，实验驱动的设计修订）：**子进程真隔离 + 内层 vm 确定性消毒**。
//   初版进程内 node:vm 方案被实验证伪——Node vm 官方非安全机制，原型链
//   Function constructor 可构造出在宿主 realm 执行的函数（实测 `typeof process`
//   = 'object'，两轮独立实验），进程内无解。修订后每插件调用 = 一个干净 env 的
//   node 子进程（runner.ts），即使 vm 层被逃逸，子进程内无凭据无宿主状态——
//   逃逸遏制由 canary 哨兵用例端到端证明（见 tests/plugins/sandbox.test.ts）。
//
// 契约（每条都有判别测试）：
//   1. 零宿主对象跨边界——输入 JSON 字符串进、输出 JSON 字符串出；
//   2. 子进程 env 最小化（SystemRoot/SystemDrive 仅此二项）——NODE_OPTIONS 不传
//      （防 --require 注入）、PATH 不传（无需查找）、凭据零继承；
//   3. 零时钟零随机（runner 内删 Date / 遮 Math.random）；
//   4. 双层超时——vm 内层 timeout 先掐（报 TIMEOUT），spawnSync 外层硬杀兜底；
//   5. 输出限额——spawnSync maxBuffer 按 manifest.resourceLimits.maxOutputBytes；
//   6. 异常=fail-closed——任何失败返回结构化 SandboxFailure，绝不部分成功。

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { z } from 'zod';
import { canonicalJson, hashCanonicalJson } from '../evidence_log/hasher.ts';
import type { PluginManifest } from './manifest.ts';

/** runner.ts 与本文件同目录（源码即运行时——Node 24 type stripping，bin 同款惯例）。 */
const RUNNER_PATH = join(import.meta.dirname, 'runner.ts');

/** 子进程启动+引导宽限（vm 内层 timeout 之外的兜底硬杀余量）。 */
const SPAWN_GRACE_MS = 2_000;

/**
 * 子进程 env——逃逸遏制核心：只给 Windows node 运行所需的系统根路径。
 * 显式不传：NODE_OPTIONS（--require 注入面）、PATH、所有凭据/配置变量。
 */
function minimalChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  if (process.env.SystemRoot !== undefined) env.SystemRoot = process.env.SystemRoot;
  if (process.env.SystemDrive !== undefined) env.SystemDrive = process.env.SystemDrive;
  return env;
}

/** 检测器输入契约 far.detector-input/v1（只读证据快照 + 裁决上下文，零环境访问）。 */
export const DetectorInputSchema = z
  .object({
    claim: z.object({ claimId: z.string().min(1), claimText: z.string() }).strict(),
    evidences: z
      .array(
        z
          .object({
            evidenceId: z.string().min(1),
            verdict: z.enum(['supports', 'refutes', 'neutral']),
          })
          .strict(),
      )
      .max(4096),
    kernel: z
      .object({ decisiveRuleId: z.string().min(1), machineVerdict: z.string().min(1) })
      .strict(),
  })
  .strict();
export type DetectorInput = z.infer<typeof DetectorInputSchema>;

/** 检测器输出契约 far.detector-result/v1（findings 数组；gate 级仅信号不改五值）。 */
export const DetectorResultSchema = z
  .object({
    findings: z
      .array(
        z
          .object({
            ruleId: z.string().min(3).max(128),
            severity: z.enum(['info', 'warn', 'critical']),
            message: z.string().min(1).max(2048),
            evidenceRefs: z.array(z.string().min(1).max(128)).max(64),
          })
          .strict(),
      )
      .max(256),
  })
  .strict();
export type DetectorResult = z.infer<typeof DetectorResultSchema>;

/** 沙箱失败的结构化原因（机器可读，conformance report 消费）。 */
export type SandboxFailure =
  | { readonly ok: false; readonly failure: 'SOURCE_COMPILE'; readonly detail: string }
  | { readonly ok: false; readonly failure: 'NO_EVALUATE_EXPORT'; readonly detail: string }
  | { readonly ok: false; readonly failure: 'TIMEOUT'; readonly detail: string }
  | { readonly ok: false; readonly failure: 'PLUGIN_THREW'; readonly detail: string }
  | { readonly ok: false; readonly failure: 'OUTPUT_SCHEMA'; readonly detail: string }
  | { readonly ok: false; readonly failure: 'RUNNER_CRASH'; readonly detail: string };

export type SandboxOutcome =
  | { readonly ok: true; readonly result: DetectorResult; readonly durationMs: number }
  | SandboxFailure;

interface RunnerOkReply {
  readonly ok: true;
  readonly resultJson: string;
}
interface RunnerFailReply {
  readonly ok: false;
  readonly failure: 'SOURCE_COMPILE' | 'NO_EVALUATE_EXPORT' | 'TIMEOUT' | 'PLUGIN_THREW';
  readonly detail: string;
}

/**
 * 在隔离子进程中执行一次插件 evaluate。
 *
 * @param manifest 已过 reviewManifest 四道门的 manifest（resourceLimits 由此执行）
 * @param input 只读证据快照（JSON 字符串注入子进程，宿主对象零跨边界）
 * @param fixedTimestamp 注册时刻冻结的 ISO 时间串——插件唯一可见时间源（确定性）
 */
export function runPluginOnce(
  manifest: PluginManifest,
  input: DetectorInput,
  fixedTimestamp: string,
): SandboxOutcome {
  const started = process.hrtime.bigint();
  const job = {
    pluginSource: manifest.pluginSource,
    inputJson: JSON.stringify(input),
    fixedTimestamp,
    maxDurationMs: manifest.resourceLimits.maxDurationMs,
    pluginId: manifest.id,
    pluginVersion: manifest.version,
  };
  const r = spawnSync(process.execPath, [RUNNER_PATH], {
    input: JSON.stringify(job),
    encoding: 'utf8',
    timeout: manifest.resourceLimits.maxDurationMs + SPAWN_GRACE_MS,
    maxBuffer: manifest.resourceLimits.maxOutputBytes + 4096,
    env: minimalChildEnv(),
    windowsHide: true,
  });
  const durationMs = Number(process.hrtime.bigint() - started) / 1e6;

  if (r.error !== undefined) {
    const code = (r.error as NodeJS.ErrnoException).code ?? '';
    if (code === 'ETIMEDOUT' || r.signal !== null) {
      return { ok: false, failure: 'TIMEOUT', detail: `outer hard-kill after ${manifest.resourceLimits.maxDurationMs + SPAWN_GRACE_MS}ms (signal ${r.signal ?? 'n/a'})` };
    }
    if (code === 'ENOBUFS') {
      return { ok: false, failure: 'OUTPUT_SCHEMA', detail: `output exceeded maxOutputBytes=${manifest.resourceLimits.maxOutputBytes}` };
    }
    return { ok: false, failure: 'RUNNER_CRASH', detail: `spawn failed: ${r.error.message}` };
  }
  if (r.status !== 0) {
    return { ok: false, failure: 'RUNNER_CRASH', detail: `runner exited ${r.status}: ${(r.stderr ?? '').slice(0, 256)}` };
  }

  let reply: RunnerOkReply | RunnerFailReply;
  try {
    reply = JSON.parse(r.stdout) as RunnerOkReply | RunnerFailReply;
  } catch {
    return { ok: false, failure: 'RUNNER_CRASH', detail: `runner stdout not JSON: ${(r.stdout ?? '').slice(0, 256)}` };
  }
  if (!reply.ok) {
    return { ok: false, failure: reply.failure, detail: reply.detail };
  }

  let rawResult: unknown;
  try {
    rawResult = JSON.parse(reply.resultJson);
  } catch {
    return { ok: false, failure: 'OUTPUT_SCHEMA', detail: 'evaluate returned a value that is not JSON-serializable data' };
  }
  const parsed = DetectorResultSchema.safeParse(rawResult);
  if (!parsed.success) {
    return {
      ok: false,
      failure: 'OUTPUT_SCHEMA',
      detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ').slice(0, 512),
    };
  }
  return { ok: true, result: parsed.data, durationMs };
}

/** 内容哈希口径：canonical(manifest 除 contentHash/signature 外 + pluginSource + vectors)。 */
export function pluginContentHash(manifest: PluginManifest): string {
  const { provenance, signature: _sig, ...rest } = manifest;
  return hashCanonicalJson({
    ...rest,
    provenance: { author: provenance.author, ...(provenance.sourceUrl !== undefined ? { sourceUrl: provenance.sourceUrl } : {}) },
  });
}

/** canonical 序列化出口（注册表与 conformance report 复用同一字节口径）。 */
export function pluginCanonicalBytes(value: unknown): string {
  return canonicalJson(value);
}
