// src/plugins/conformance.ts
// 插件 conformance 套件驱动器（OSS-PLUGIN-001 Acceptance 的机器化面）。
//
// REQ Acceptance 五类探针全部内置：
//   1. malicious plugin   —— 内置逃逸样本（require/process/原型链/globalThis 出口）
//   2. permission denial  —— permissions 非空声明的插件必须被拒载
//   3. version mismatch   —— hostVersionRange 不含宿主 API 版本必须被拒载
//   4. timeout            —— 同步死循环必须被 resourceLimits.maxDurationMs 掐断
//   5. schema             —— 输出不符合 far.detector-result/v1 必须 fail-closed
// 加目标插件自身注册全流程（含黄金向量过检 + 确定性双跑）。
// 报告 = REQ Evidence 要求的 plugin conformance report（canonical JSON，可入 CI 断言）。

import { z } from 'zod';
import { registerPlugin, type RegisterOutcome } from './registry.ts';
import { runPluginOnce, DetectorInputSchema } from './sandbox.ts';
import { PLUGIN_HOST_API_VERSION, PluginManifestSchema } from './manifest.ts';

export interface ConformanceCheck {
  readonly name: string;
  readonly status: 'PASS' | 'FAIL' | 'SKIP';
  readonly detail: string;
}

export interface ConformanceReport {
  readonly pluginId: string | null;
  readonly hostApi: string;
  readonly verdict: 'PASS' | 'FAIL';
  readonly checks: readonly ConformanceCheck[];
  readonly registerOutcome: RegisterOutcome;
}

const ConformanceReportSchema = z.object({
  pluginId: z.string().nullable(),
  hostApi: z.string(),
  verdict: z.enum(['PASS', 'FAIL']),
  checks: z.array(z.object({ name: z.string(), status: z.enum(['PASS', 'FAIL', 'SKIP']), detail: z.string() })),
});

/** 最小合法 DetectorInput（探针共用；字段语义见 far.detector-input/v1）。 */
const PROBE_INPUT = {
  claim: { claimId: 'C-PROBE', claimText: 'probe claim' },
  evidences: [{ evidenceId: 'EV-PROBE-1', verdict: 'supports' }],
  kernel: { decisiveRuleId: 'R7_PRIMARY_TEST_CONFIRMS', machineVerdict: 'CONFIRMED' },
} as const;

/** base manifest 模板（探针在其上做单字段突变——每类拒绝路径只动一个变量）。 */
function probeManifest(overrides: Record<string, unknown>): Record<string, unknown> {
  const source = `function evaluate(input) { return { findings: [] }; }`;
  return {
    id: 'farlab.probe.conformance',
    version: '0.0.1',
    capabilityType: 'verdict-detector',
    kind: 'advisory',
    schemas: { input: 'far.detector-input/v1', output: 'far.detector-result/v1' },
    permissions: [],
    determinismProfile: 'pure-function',
    networkAccess: 'none',
    dataAccess: 'input-snapshot-only',
    resourceLimits: { maxDurationMs: 1000, maxOutputBytes: 65536 },
    trustLevel: 'untrusted',
    compatibility: { hostApi: 'far.plugin-host/v1', hostVersionRange: '^1.0.0' },
    provenance: { author: 'farlab conformance', contentHash: '0'.repeat(64) },
    failureBehavior: 'fail-closed',
    license: 'MIT',
    goldenVectors: [
      { vectorId: 'probe-1', input: PROBE_INPUT, expectedOutput: { findings: [] } },
    ],
    pluginSource: source,
    ...overrides,
  };
}

/**
 * 对目标插件跑完整 conformance 套件。
 * @param rawManifest 目标插件 manifest（原始对象，走真实注册全流程）
 */
export function runConformance(rawManifest: unknown, opts: { readonly now?: () => string } = {}): ConformanceReport {
  const checks: ConformanceCheck[] = [];

  // ── 探针 1：malicious plugin（内置逃逸样本：require / process.exit / 原型链读宿主 env / fetch）──
  // v2 子进程架构语义：原型链逃逸到「子进程 process」结构性无法根除（Node vm 非
  // 安全机制），遏制标准 = 逃逸后宿主资产（凭据 env）不可及——探针读宿主哨兵
  // FAR_SANDBOX_CANARY，输出含哨兵值 = 遏制失效（ESC）；ABSENT = 遏制成立（PASS）。
  const escapes: readonly [string, string][] = [
    ['require', `function evaluate(input) { const r = require('node:fs'); return { findings: [] }; }`],
    ['process', `function evaluate(input) { process.exit(0); return { findings: [] }; }`],
    ['prototype-chain', `function evaluate(input) { var f=(function(){return this})().constructor.constructor; var p=f('return process')(); var c=(p&&p.env)?String(p.env.FAR_SANDBOX_CANARY ?? 'ABSENT'):'NO_ENV'; return { findings: [{ ruleId: 'x.escape', severity: 'critical', message: 'canary='+c, evidenceRefs: [] }] }; }`],
    ['fetch', `function evaluate(input) { fetch('http://127.0.0.1:1/leak'); return { findings: [] }; }`],
  ];
  const prevCanary = process.env.FAR_SANDBOX_CANARY;
  process.env.FAR_SANDBOX_CANARY = 'conformance-canary-zz';
  for (const [name, pluginSource] of escapes) {
    // 探针 manifest 走真实 zod parse（字段全合法；探针不走注册流程，contentHash 无需对账）。
    const parsedProbe = PluginManifestSchema.safeParse(
      probeManifest({ pluginSource, id: `farlab.probe.malicious-${name}` }),
    );
    if (!parsedProbe.success) {
      checks.push({ name: `malicious:${name}`, status: 'FAIL', detail: `probe manifest itself invalid: ${parsedProbe.error.issues[0]?.message}` });
      continue;
    }
    const outcome = runPluginOnce(
      parsedProbe.data,
      DetectorInputSchema.parse(PROBE_INPUT),
      '2026-01-01T00:00:00.000Z',
    );
    // 前两类（require/fetch/process.exit）以 fail-closed 为准；prototype-chain 以
    // 哨兵不可及为准（子进程 process 可达但 env 干净）。
    if (name === 'prototype-chain') {
      const leaked = outcome.ok && outcome.result.findings.some((f) => f.message.includes('conformance-canary-zz'));
      checks.push({
        name: `malicious:${name}`,
        status: leaked ? 'FAIL' : 'PASS',
        detail: leaked
          ? 'ESCAPED — 宿主哨兵泄漏进插件输出，逃逸遏制失效'
          : `contained (${outcome.ok ? '子进程可达但宿主哨兵 ABSENT' : `${outcome.failure}: ${outcome.detail.slice(0, 60)}`})`,
      });
    } else {
      const blocked = !outcome.ok;
      checks.push({
        name: `malicious:${name}`,
        status: blocked ? 'PASS' : 'FAIL',
        detail: blocked ? `isolated (${outcome.failure}: ${outcome.detail.slice(0, 80)})` : 'ESCAPED — 沙箱隔离失效',
      });
    }
  }
  if (prevCanary === undefined) {
    delete process.env.FAR_SANDBOX_CANARY;
  } else {
    process.env.FAR_SANDBOX_CANARY = prevCanary;
  }

  // ── 探针 2：permission denial ──
  const perm = registerPlugin(probeManifest({ permissions: ['read-evidence'] }));
  checks.push({
    name: 'permission-denial',
    status: !perm.ok && perm.reason === 'MANIFEST' ? 'PASS' : 'FAIL',
    detail: !perm.ok ? `${perm.reason}: ${perm.detail[0]?.slice(0, 100)}` : '非空 permissions 未被拒绝——V1 纯函数宿主只接受空权限清单',
  });

  // ── 探针 3：version mismatch ──
  const ver = registerPlugin(probeManifest({ compatibility: { hostApi: 'far.plugin-host/v1', hostVersionRange: '9.9.9' } }));
  checks.push({
    name: 'version-mismatch',
    status: !ver.ok && ver.reason === 'MANIFEST' ? 'PASS' : 'FAIL',
    detail: !ver.ok ? `${ver.reason}: ${ver.detail[0]?.slice(0, 100)}` : '不兼容版本范围未被拒绝',
  });

  // ── 探针 4：timeout（同步死循环）──
  const loop = registerPlugin(probeManifest({
    id: 'farlab.probe.infinite-loop',
    pluginSource: 'function evaluate(input) { while (true) {} return { findings: [] }; }',
    resourceLimits: { maxDurationMs: 120, maxOutputBytes: 65536 },
  }));
  // 注册本身必须失败（黄金向量过检时死循环被 timeout 掐断）
  checks.push({
    name: 'timeout',
    status: !loop.ok ? 'PASS' : 'FAIL',
    detail: !loop.ok ? `${loop.reason}: ${loop.detail[0]?.slice(0, 100)}` : '死循环插件通过了注册——timeout 未生效',
  });

  // ── 探针 5：schema（输出不合法）──
  const badOut = registerPlugin(probeManifest({
    id: 'farlab.probe.bad-output',
    pluginSource: 'function evaluate(input) { return { verdict: "CONFIRMED" }; }',
    goldenVectors: [{ vectorId: 'v1', input: PROBE_INPUT, expectedOutput: { verdict: 'CONFIRMED' } }],
  }));
  checks.push({
    name: 'schema-output',
    status: !badOut.ok ? 'PASS' : 'FAIL',
    detail: !badOut.ok ? `${badOut.reason}: ${badOut.detail[0]?.slice(0, 100)}` : '非法输出结构未 fail-closed——插件试图伪造 verdict 字段未被拒',
  });

  // ── 目标插件注册全流程（含向量过检 + 确定性双跑）──
  const reg = registerPlugin(rawManifest, { ...(opts.now !== undefined ? { now: opts.now } : {}) });
  checks.push({
    name: 'target:register',
    status: reg.ok ? 'PASS' : 'FAIL',
    detail: reg.ok
      ? `id=${reg.registration.id} v${reg.registration.version} vectors=${reg.registration.vectorCount} signed=${reg.registration.signatureVerified}`
      : `${reg.reason}: ${reg.detail[0]?.slice(0, 140)}`,
  });

  const verdict = checks.every((c) => c.status !== 'FAIL') ? 'PASS' : 'FAIL';
  const pluginId = reg.ok ? reg.registration.id : null;
  const report: ConformanceReport = { pluginId, hostApi: PLUGIN_HOST_API_VERSION, verdict, checks, registerOutcome: reg };
  ConformanceReportSchema.parse(toPlainReport(report));
  return report;
}

/** 报告的 canonical 投影（registerOutcome 递归拍平为纯 JSON，可哈希可入 CI）。 */
export function toPlainReport(report: ConformanceReport): Record<string, unknown> {
  return {
    pluginId: report.pluginId,
    hostApi: report.hostApi,
    verdict: report.verdict,
    checks: report.checks,
    register: report.registerOutcome.ok
      ? { ok: true, id: report.registerOutcome.registration.id, version: report.registerOutcome.registration.version, contentHash: report.registerOutcome.registration.contentHash }
      : { ok: false, reason: report.registerOutcome.reason, detail: report.registerOutcome.detail },
  };
}
