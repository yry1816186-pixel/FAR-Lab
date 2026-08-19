# FAR-Lab Verdict Detector Plugin SDK

第三方裁决辅助检测器（verdict-detector）的构建与合规指南。宿主契约 SSOT：
`src/plugins/manifest.ts`（zod schema）；本文件是教程面——照抄 `tests/plugins/fixtures/positive_only_base.ts` 即可构建合规插件，无需读宿主内部实现。

## 一分钟最小插件

```ts
import { definePlugin } from '../../src/plugins/sdk.ts';
import { runConformance } from '../../src/plugins/conformance.ts';

const result = definePlugin({
  id: 'org.example.my-detector',          // 反向域名式（≥3 段小写）
  version: '1.0.0',                        // semver 三段
  capabilityType: 'verdict-detector',      // V1 唯一能力类型
  kind: 'advisory',                        // advisory=只标注；gate=可产生 INCONCLUSIVE/UNTESTED 信号
  schemas: { input: 'far.detector-input/v1', output: 'far.detector-result/v1' },
  permissions: [],                         // V1 必须空——纯函数零权限
  determinismProfile: 'pure-function',
  networkAccess: 'none',
  dataAccess: 'input-snapshot-only',
  resourceLimits: { maxDurationMs: 500, maxOutputBytes: 65536 },
  trustLevel: 'untrusted',
  compatibility: { hostApi: 'far.plugin-host/v1', hostVersionRange: '^1.0.0' },
  provenance: { author: 'Your Org' },      // contentHash 由 definePlugin 自动回填
  failureBehavior: 'fail-closed',
  license: 'Apache-2.0',
  goldenVectors: [ /* ≥1 条 {vectorId, input, expectedOutput}——注册即全量跑 */ ],
  pluginSource: `function evaluate(input) {
    // 纯函数：只读 input，返回 { findings: [{ruleId, severity, message, evidenceRefs}] }
    return { findings: [] };
  }`,
});
if (!result.ok) throw new Error(result.issues.join('\n'));   // 逐字段修复指引

const report = runConformance(result.manifest);               // 五类 Acceptance 探针
if (report.verdict !== 'PASS') throw new Error('conformance failed');
```

## 检测器输入/输出契约

- 输入 `far.detector-input/v1`：只读证据快照 + 裁决上下文（`claim` / `evidences[]` / `kernel`）。零环境访问。
- 输出 `far.detector-result/v1`：`{ findings: [{ ruleId, severity: info|warn|critical, message, evidenceRefs }] }`。
  **插件不能改变五值裁决**（gate 级至多触发 INCONCLUSIVE/UNTESTED 信号；advisory 只标注）。裁决权架构上不外包。

## 确定性纪律（违反 = fail-closed 吊销）

| 禁区 | 执行面行为 |
|---|---|
| `require` / `process` / `fetch` / `importScripts` | 不可用（TypeError → 本次调用 fail-closed） |
| `Date`（真实时钟） | 被删除；唯一时间源 = `far.fixedTimestamp`（注册时冻结） |
| `Math.random` | 被遮蔽为 undefined |
| 同步死循环 | `resourceLimits.maxDurationMs` 硬超时掐断 |
| 输出超限 | `maxOutputBytes` / schema 字段上限拒绝 |

执行架构：**每次调用 = 一个干净 env 的隔离子进程**（内层 vm 做确定性消毒）。
原型链逃逸（`constructor.constructor`）到达的只是无凭据的子进程——宿主资产
（env 凭据/DB/文件系统）结构性不可及；`tests/plugins/sandbox.test.ts` 的 canary
哨兵用例端到端证明该边界。

## 注册语义

1. **manifest 四道门**：zod schema → hostApi major → hostVersionRange → 签名（如声明）。
2. **contentHash 对账**：`canonical(manifest+pluginSource+vectors)` 的 sha256 必须与声明一致（`definePlugin` 自动计算）。改动任何内容后重跑 `definePlugin`。
3. **黄金向量全量过检 + 双跑**：每条向量在沙箱实跑并与期望 canonical 一致；同输入两次运行字节相同。
4. **运行时抽验**：每次调用附带一条注册向量复验，漂移即吊销且本次 fail-closed。

## Versioning 与 migration

- HOST API 语义版本 = `PLUGIN_HOST_API_VERSION`（`far.plugin-host/vMAJOR.MINOR.PATCH`）。
- 插件声明 `hostVersionRange`（精确 `1.2.0` 或 `^1.0.0` 同 major）。宿主 major 升级时旧插件按 `HOST_API_MISMATCH` / `HOST_VERSION_MISMATCH` 拒载（fail-closed，不静默兼容）。
- 插件自身 `version` major 变更需重新过 conformance（报告披露）。

## Conformance（CI 接入点）

`runConformance(manifest)` 内置五类探针（对齐 OSS-PLUGIN-001 Acceptance）：
malicious×4（require/process.exit/原型链读宿主 env/fetch）、permission-denial、
version-mismatch、timeout、schema-output，外加目标插件注册全流程。
CI 断言样例见 `tests/plugins/conformance.test.ts`（本仓库示例插件随全量测试逐跑）。

## Publishing checklist

1. `definePlugin(...)` 校验通过（contentHash 已回填）。
2. `runConformance(manifest).verdict === 'PASS'`。
3. manifest（含 pluginSource 与 goldenVectors）作为单一 JSON 发布；声明
   `signature: {algorithm: 'ed25519', value}` 时必须可被宿主校验（未签名的插件可加载，报告如实标注 unsigned）。
4. 在目标宿主执行注册；保留 `registration`（contentHash/vectorCount/registeredAt）作为教程回执（SDK tutorial receipt）。
