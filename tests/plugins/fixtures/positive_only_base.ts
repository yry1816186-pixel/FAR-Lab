// tests/plugins/fixtures/positive_only_base.ts
// SDK 示例插件 farlab.sample.positive-only-base（SPEC 首例候选：检测「证据基全为正」，
// 与内置 evidenceBaseBias 互补的第三方视角——advisory 级）。
//
// 这是教程的完整面：一个真实检测器从草稿到 conformance 的全部代码。第三方照抄
// 本文件结构即可构建自己的插件（无需读宿主内部实现）：
//   1. pluginSource 写纯函数 evaluate(input) —— 只读 input，返回 { findings: [...] }
//   2. goldenVectors 至少 1 条（input/expectedOutput 成对；注册时全量跑+确定性双跑）
//   3. definePlugin() 校验并回填 contentHash
//   4. runConformance(manifest).verdict === 'PASS'
//
// 禁区（沙箱强制，违反即 fail-closed 吊销）：require/process/fetch/Date/Math.random。

import { definePlugin } from '../../../src/plugins/sdk.ts';
import type { DetectorInput } from '../../../src/plugins/sandbox.ts';

/** 检测逻辑：无任何反驳证据且 ≥2 条支持 = 证据基全为正（publication-bias 风险信号；中性证据不算正）。 */
const PLUGIN_SOURCE = `function evaluate(input) {
  var evidences = input.evidences || [];
  var supports = 0, i;
  for (i = 0; i < evidences.length; i++) {
    if (evidences[i].verdict === 'refutes') { return { findings: [] }; }
    if (evidences[i].verdict === 'supports') { supports++; }
  }
  if (supports < 2) { return { findings: [] }; }
  return {
    findings: [{
      ruleId: 'farlab.sample.positive-only-base.all-supporting',
      severity: 'warn',
      message: 'Evidence base is entirely supportive (' + supports + ' supporting, 0 refuting) — publication/search bias risk; no counter-evidence was exercised.',
      evidenceRefs: evidences.map(function (ev) { return ev.evidenceId; }),
    }],
  };
}`;

const VECTOR_INPUT_MIXED: DetectorInput = {
  claim: { claimId: 'C-SAMPLE-1', claimText: 'sample claim with mixed evidence' },
  evidences: [
    { evidenceId: 'EV-1', verdict: 'supports' },
    { evidenceId: 'EV-2', verdict: 'refutes' },
  ],
  kernel: { decisiveRuleId: 'R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE', machineVerdict: 'INCONCLUSIVE' },
};

const VECTOR_INPUT_ALL_POSITIVE: DetectorInput = {
  claim: { claimId: 'C-SAMPLE-2', claimText: 'sample claim with all-supporting evidence' },
  evidences: [
    { evidenceId: 'EV-1', verdict: 'supports' },
    { evidenceId: 'EV-2', verdict: 'supports' },
    { evidenceId: 'EV-3', verdict: 'neutral' },
  ],
  kernel: { decisiveRuleId: 'R7_PRIMARY_TEST_CONFIRMS', machineVerdict: 'CONFIRMED' },
};

/** 示例插件完整 manifest（definePlugin 已校验并回填 contentHash）。 */
export const POSITIVE_ONLY_BASE_PLUGIN = definePlugin({
  id: 'farlab.sample.positive-only-base',
  version: '1.0.0',
  capabilityType: 'verdict-detector',
  kind: 'advisory',
  schemas: { input: 'far.detector-input/v1', output: 'far.detector-result/v1' },
  permissions: [],
  determinismProfile: 'pure-function',
  networkAccess: 'none',
  dataAccess: 'input-snapshot-only',
  resourceLimits: { maxDurationMs: 500, maxOutputBytes: 65536 },
  trustLevel: 'untrusted',
  compatibility: { hostApi: 'far.plugin-host/v1', hostVersionRange: '^1.0.0' },
  provenance: { author: 'FAR-Lab sample (SDK tutorial)' },
  failureBehavior: 'fail-closed',
  license: 'Apache-2.0',
  goldenVectors: [
    {
      vectorId: 'mixed-evidence-no-finding',
      input: VECTOR_INPUT_MIXED,
      expectedOutput: { findings: [] },
    },
    {
      vectorId: 'all-supporting-warns',
      input: VECTOR_INPUT_ALL_POSITIVE,
      expectedOutput: {
        findings: [
          {
            ruleId: 'farlab.sample.positive-only-base.all-supporting',
            severity: 'warn',
            message: 'Evidence base is entirely supportive (2 supporting, 0 refuting) — publication/search bias risk; no counter-evidence was exercised.',
            evidenceRefs: ['EV-1', 'EV-2', 'EV-3'],
          },
        ],
      },
    },
    {
      vectorId: 'single-evidence-skipped',
      input: {
        claim: { claimId: 'C-SAMPLE-3', claimText: 'single evidence' },
        evidences: [{ evidenceId: 'EV-ONLY', verdict: 'supports' }],
        kernel: { decisiveRuleId: 'R7_PRIMARY_TEST_CONFIRMS', machineVerdict: 'CONFIRMED' },
      },
      expectedOutput: { findings: [] },
    },
  ],
  pluginSource: PLUGIN_SOURCE,
});
