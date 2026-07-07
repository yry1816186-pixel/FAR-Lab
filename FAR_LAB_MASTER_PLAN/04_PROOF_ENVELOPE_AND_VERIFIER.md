# 04 ProofEnvelope 与独立验证器

> 作用域：本章是 ProofEnvelope V2、`.far-proof` 证据包、`far verify` CLI、独立验证等级 L1-L6、browser verifier 边界、diff report、Trust Receipt、形式化验证路线的**实现级规格章**。
>
> 类型权威：字段名 / 类型名 / enum 值以 `APPENDIX_A_TYPES.md` 为准；canonical 序列化与 proofHash / ledgerRoot / Merkle / inclusion proof 算法以 `APPENDIX_C_CANONICAL.md` 为准；`.far-proof` bundle 物理 JSON schema 与第三方重算三路径详设以 `APPENDIX_D_PROOF_BUNDLE.md` 为准。冲突时以上三附录为准。
>
> 路径约定：实现根一律写 `<REPOSITORY_ROOT>/`，禁止把 `far-chain/` 当真实实现子目录（`far-chain/` 已 `RETIRED`，见 §13）。
>
> 铁律：本章描述的是 **tamper-evident / independently re-computable** 的证据包——不声称证明科学结论为真、不声称物理不可篡改、不声称完全可复现。
>
> 状态纪律：所有能力标注状态标签（`IMPLEMENTED_VERIFIED` / `IMPLEMENTED_UNVERIFIED` / `PARTIAL` / `DESIGN_LOCKED` / `ROADMAP` / `RESEARCH` / `RETIRED` / `NEEDS_EXTERNAL_VERIFICATION`）；禁止手填裸数字（测试数 / 文件数 / CI 通过率 / golden 向量数 / commit / 竞品发布时间）；未覆盖字段写 `Pending` 或 `NEEDS_EXTERNAL_VERIFICATION`。

---

## 1. ProofEnvelope 的职责与诚实边界

ProofEnvelope 是科学声明的**可转交证据包**。它把一次裁决的全部承重证据冻结进一个独立可重算的对象，使第三方拿到 bundle 后能用自己的机器从原始 claim 重算到最终 `proofHash`。

### 1.1 它证明什么

| 项 | 证明方式 |
|---|---|
| claim 与 FEC 已绑定 | `ProofEnvelopeV2.claim` + `fecSnapshot` + `fecHash` 互验 |
| 协议在证据运行前被冻结 | `protocolFreeze.timestamp` 早于所有 `MeasurementResult.collectedAt` |
| 数据 / workflow / 统计计划 / 运行结果 / verdict trace 已进入 proof input | 见 §3 proofHash 白名单 |
| 第三方可以重算 `proofHash` | canonical 序列化跨实现逐字节相同（`APPENDIX_C` §1） |
| 篡改 verdict-critical 字段会被发现 | 任一 VC 字段变化 → `proofHash` 必变 → `PROOF_HASH_MISMATCH`（§8） |

### 1.2 它不证明什么（诚实红线）

| 不声称 | 理由 |
|---|---|
| 科学结论绝对正确 | `verdict` 是 bounded support，不是终局科学真理证书 |
| 实验在物理世界中不可篡改 | 本章口径是 **tamper-evident**，非 tamper-proof（`APPENDIX_C` §11） |
| 同行评审可以被替代 | Trust Receipt 是过程可信收据，不是同行评审替代品 |
| 所有未来数据都会支持该结论 | `verdict` 只对冻结 FEC 下的当前证据负责 |
| 完全可复现 | 真实 LLM 轨道续跑 byte-equal 在 LLM 非确定性下不成立（§12） |

### 1.3 五值裁决与裁决确定性（与 ProofEnvelope 的咬合）

五值裁决 enum 固定，禁止第六值：

```typescript
type VerdictKind =
  | "CONFIRMED"
  | "REFUTED"
  | "INCONCLUSIVE"
  | "DEGRADED_SCOPE"
  | "UNTESTED";
```

裁决优先级（高 → 低）：`DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED`。决策树优先级与伪代码 SSOT 见 `03_EVIDENCE_CONTRACT_AND_VERDICT.md` §6-§7、`APPENDIX_C` §6。

**裁决确定性铁律**：LLM **不得**作为最终裁决者。`verdict` 必须由 deterministic verdict kernel 经固定优先级的 rule trace 产出；自然语言解释只由 `humanExplanationTemplateId + ruleTrace` 渲染，**不**进入 `proofHash`，**不**作为裁决输入（`APPENDIX_A` §5、`APPENDIX_C` §6.2）。

状态：`VerdictKind` enum `DESIGN_LOCKED`；当前 `decideVerdict()` 实现 `PARTIAL`（规则浅，缺完整 rule trace / evidence sufficiency / statistical uncertainty 聚合，见 `APPENDIX_A` §12）。

---

## 2. ProofEnvelope V2 完整结构

### 2.1 完整 TypeScript 定义（V2 目标态）

V2 在 V1 基础上补全 `fecSnapshot` / `protocolFreeze` / `datasetBindings` / `workflowBindings` / `experimentRuns` / `measurementResults` / `statisticalResults` / `verdictTrace` / `antiTheaterReport` / `ledgerRoot` 等完整证据嵌入字段。类型契约权威见 `APPENDIX_A_TYPES.md` §8。

```typescript
type ProofEnvelopeV2 = {
  /** [VC] schema 版本，固定 "far.proof_envelope.v2"。决定 verifier 路径。 */
  schemaVersion: "far.proof_envelope.v2";

  /** [VC] envelope 全局唯一 id（ULID）。进索引不进 proofHash。 */
  envelopeId: string;

  /** [META] 封存时间（ISO-8601）。sealed 后 append-only。非裁决字段。 */
  createdAt: string;

  /** [VC] 关联的 claim 全文快照。 */
  claim: Claim;

  /** [VC] FEC 内容 hash（与 ProtocolFreeze.fecHash 一致；与 sha256(canonicalJson(fecSnapshot)) 互验）。 */
  fecHash: string;

  /** [VC] FEC 全文快照。 */
  fecSnapshot: FecContract;

  /** [VC] 协议冻结快照（含 actor / timestamp / environmentPolicy / deviationPolicyHash）。 */
  protocolFreeze: ProtocolFreeze;

  /** [VC] 数据集绑定列表。 */
  datasetBindings: DatasetBinding[];

  /** [VC] 工作流绑定列表。 */
  workflowBindings: WorkflowBinding[];

  /** [VC] 实验运行绑定列表。 */
  experimentRuns: ExperimentRunBinding[];

  /** [VC] 测量结果列表。 */
  measurementResults: MeasurementResult[];

  /** [VC] 统计结果列表。 */
  statisticalResults: StatisticalResult[];

  /** [VC] 裁决追踪（VerdictKernelOutput 全文）。 */
  verdictTrace: VerdictKernelOutput;

  /** [VC] 反剧场报告。 */
  antiTheaterReport: AntiTheaterReport;

  /** [VC] ledger root（call_records head hash 或 ledger_events Merkle root）。 */
  ledgerRoot: string;

  /**
   * [VC] proofHash = sha256(canonical_json(本对象全部 verdict-critical 字段 - proofHash 自身))。
   * 篡改任一 VC 字段 → proofHash 不匹配 → PROOF_HASH_MISMATCH（§8）。
   */
  proofHash: string;

  /** [META] 可选签名块列表。签名对 proofHash 的结果，不进 proofHash（循环依赖）。 */
  signatures?: SignatureBlock[];

  /** [DOC] 可选的面向人的收据摘要。不进裁决；若进 proofHash 仅作非裁决字段并需明确分区。 */
  humanSummary?: TrustReceiptSummary;
};
```

状态：`DESIGN_LOCKED`（V2 目标态，本章 §2 为权威）；当前实现为 `PARTIAL`（V1 已存在，P0 须升级为 V2 proofHash binding）。

### 2.2 V1 实现态字段裁剪（命名非语义偏离）

V1 实现态字段名是 `ProofEnvelope`（`<REPOSITORY_ROOT>/src/proof_envelope/types.ts` 实测），字段名 `conclusion` 而非 `verdict`——这是**命名裁剪**，非语义偏离，enum 值集与五值完全一致。两者并存于本章，冲突时 V1 实现态以代码为准、V2 目标态以本章 §2.1 + `APPENDIX_A` §8 为准。

V1 实现态字段（`<REPOSITORY_ROOT>/src/proof_envelope/types.ts` 实测）：`envelopeId` / `claimId` / `verdictNodeId` / `conclusion`（5 值）/ `proofHash`（self-excluding）/ `prevProofHash`（genesis = `"0".repeat(64)`）/ `checks`（9 条 RULE-PE-001..009）/ `knownFailures` / `falsificationSpec` / `sourceAnchor`（`gitCommitSha` / `dashscopeRequestId` / `isoTimestamp` / `rawResponseHash`）/ `reproHash`（七分量）/ `sealedBy`（恒 `"deterministic_sealer"`，禁 LLM）/ `sealedAt` / `createdAt`。

`GENESIS_PROOF_HASH = "0".repeat(64)`（链首桥接，V1 实现 `types.ts` 实测）。

### 2.3 SignatureBlock（可选外部签名挂载）

```typescript
interface SignatureBlock {
  /** [META] 签名者标识。 */
  signerId: string;
  /** [META] 签名算法，如 "ed25519"、"rsa-pss-sha256"。 */
  algorithm: string;
  /** [META] 公钥指纹（sha256）。 */
  publicKeyFingerprint: string;
  /** [META] 签名值（base64）。对 proofHash 签名，不进 proofHash。 */
  signature: string;
  /** [META] 签名时间（ISO-8601）。 */
  signedAt: string;
}
```

FAR-Chain **不**强制签名，但支持外部签名挂载。签名是对 `proofHash` 的结果，反过来不能进入 `proofHash`（循环依赖，`APPENDIX_C` §2.3）。状态：`DESIGN_LOCKED`。

### 2.4 ProofEnvelope Validator 规则全表（9+1 条）

| Rule ID | 名称 | 检查逻辑 | FAIL 条件 | WARN 条件 | 状态 |
|---|---|---|---|---|---|
| `RULE-PE-001` | `claim_non_empty` | `claimId.trim()` 非空 | claimId 为空 | — | `IMPLEMENTED_VERIFIED` |
| `RULE-PE-002` | `verdict_node_exists` | `verdictNodeId.trim()` 非空 | verdictNodeId 为空 | — | `IMPLEMENTED_VERIFIED` |
| `RULE-PE-003` | `falsification_spec_present` | `prediction`+`metric` 非空 | prediction 或 metric 为空 | — | `IMPLEMENTED_VERIFIED` |
| `RULE-PE-004` | `source_anchor_present` | `gitCommitSha`+`rawResponseHash` 非空 | gitCommitSha 为空 | rawResponseHash 为空（offline replay?） | `IMPLEMENTED_VERIFIED` |
| `RULE-PE-005` | `repro_hash_present` | `reproHash.length === 64` | 长度 ≠ 64 | — | `IMPLEMENTED_VERIFIED` |
| `RULE-PE-006` | `prev_proof_hash_valid` | 长度=64 且匹配 `/^[0-9a-f]{64}$/` | 长度错或非 hex | — | `IMPLEMENTED_VERIFIED` |
| `RULE-PE-007` | `conclusion_matches_checks` | 无 WARN/FAIL check 时 conclusion 可 CONFIRMED | WARN/FAIL 存在但 conclusion=CONFIRMED（反 theater F1） | WARN/FAIL 存在且 conclusion≠CONFIRMED（正确降级） | `IMPLEMENTED_VERIFIED` |
| `RULE-PE-008` | `sealed_by_deterministic` | sealedBy 恒 `"deterministic_sealer"`（TS 类型 + DB CHECK + sealer 硬编码三重保证） | V1 违反路径不存在，规则恒 PASS | — | `IMPLEMENTED_VERIFIED` |
| `RULE-PE-009` | `known_failures_not_hidden` | knownFailures 透明披露 | — | knownFailures 含空串；或 knownFailures 非空但 conclusion=CONFIRMED | `IMPLEMENTED_VERIFIED` |
| `RULE-PE-010` | `independently_recomputable` | ProofEnvelope 必须可被一条不依赖项目 CI 的路径（CLI / Web Crypto / 离线包）从原始 claim 重算到 `proofHash` 匹配 | 重算不符 | — | `IMPLEMENTED_VERIFIED`（TS `verifyProofHashV2` self-check + Python 镜像 `repro/far_chain_repro/proof_hash.py` 跨语言 byte-equal 对拍·`tests/proof_envelope/v2/cross_lang.test.ts` 5/5 绿·Ask 阶层已确认 TS+Python 双路径） |

`CheckOutcome` enum：`PASS` / `WARN` / `FAIL` / `SKIP`（`<REPOSITORY_ROOT>/src/proof_envelope/types.ts`）。

> **诚实红线**：`RULE-PE-010` 是 FI-9 新增的协议规则，**不是**"既有规则测试"。须先 spec 再测；交付前须给全 10 条逐条测试绿（`validator.10-rules-coverage.test.ts`）。ProofEnvelope 是信任根对外接口，规则逻辑不能 day-1 才验证。

### 2.5 ProofEnvelope proofHash 计算（self-excluding）

`<REPOSITORY_ROOT>/src/proof_envelope/proof_hash.ts` 实测：

```text
computeProofHash(envelope):
  fieldsForHash = envelope - proofHash           # self-excluding
  sortedChecks   = sort(fieldsForHash.checks,    by (ruleId, outcome))
  sortedFailures = sort(fieldsForHash.knownFailures, lexicographic)
  canonical = stableStringify({ ...rest, checks: sortedChecks, knownFailures: sortedFailures })
  return sha256(canonical)

verifyProofHash(envelope):
  return computeProofHash(envelope without proofHash) === envelope.proofHash
```

跨语言对齐设置（V1 已实现 TS 自洽；跨语言 byte-equal 待 V2 Python 镜像）：

| 设置 | TS | Python（V2 镜像须对齐） |
|---|---|---|
| separators | 无空格（`fast-json-stable-stringify` 默认） | `separators=(',', ':')` |
| sort_keys | 一致排序 | `sort_keys=True` |
| ensure_ascii | UTF-8 直传 | `ensure_ascii=False` |
| Unicode | 不做 ASCII escape | 不做 ASCII escape |

状态：TS `computeProofHash` / `verifyProofHash` `IMPLEMENTED_VERIFIED`；Python 侧 ProofEnvelope hash `IMPLEMENTED_VERIFIED`（`repro/far_chain_repro/proof_hash.py` + `far verify` 的 `recomputation.python` 轴）；Browser Web Crypto proofHash `IMPLEMENTED_VERIFIED`（standalone `frontend/public/verify.html` + `tests/proof_envelope/v2/browser_standalone.test.ts`）；Rust/Go `ROADMAP`（V2）；WASM `ROADMAP`（V3）。

---

## 3. proofHash 纪律（字段白名单）

proofHash 算法 SSOT 见 `APPENDIX_C_CANONICAL.md` §2。本节是其在本章的落地视图。

### 3.1 必须进入 proofHash 的字段（权威白名单）

| 字段 | 来源对象 | 说明 |
|---|---|---|
| `schemaVersion` | `ProofEnvelopeV2` | 形如 `"far.proof_envelope.v2"`，决定 verifier 路径 |
| `claim.id` + normalized claim text | `Claim` | claim 的稳定标识与规范化文本（自然语言须先 normalize：去多余空白、统一换行 `\n`、trim） |
| `claim.domain` / `claim.scope` | `Claim` | 领域与 scope，影响裁决范围 |
| `fecHash` | `FecContract` | FEC 整体摘要（FEC 内部字段由 `APPENDIX_C` §3 单独 canonical 化再 hash） |
| `fecSnapshot` | `FecContract` | FEC 完整快照（与 `fecHash` 互验：`fecHash === sha256(canonicalJson(fecSnapshot))`） |
| `protocolFreeze` | `ProtocolFreeze` | 含 `fecHash` / `actor` / `timestamp`（已冻结 ISO-8601）/ `environmentPolicy` / `deviationPolicyHash` |
| `datasetBindings[]` | `DatasetBinding[]` | 数组保序；每元素含 `contentHash` / `schemaHash` / `statsFingerprint` / `scopeCoverage` |
| `workflowBindings[]` | `WorkflowBinding[]` | 含 `workflowHash` / `containerDigest` / `environmentHash` / `commandHash` / `seedPolicy` / `networkPolicy` |
| `experimentRuns[]` | `ExperimentRunBinding[]` | 含 `runId` / `startedAt` / `endedAt` / `actor` / `inputHashes` / `outputHashes` / `logHashes` / `exitCode` / `deviations` |
| `measurementResults[]` | `MeasurementResult[]` | 含 `metricValue` / `rawArtifactHashes` / `runId` / `runEnvironment` / stdout/stderr hashes |
| `statisticalResults[]` | `StatisticalResult[]` | 含 `effectSizeObserved` / `pValue` / `confidenceInterval` / `assumptionDiagnostics` |
| `verdictTrace.verdict` | `VerdictKernelOutput` | 五值 enum 之一（§1.3） |
| `verdictTrace.reasonCodes` | `VerdictKernelOutput` | 字符串数组保序 |
| `verdictTrace.ruleTrace` | `VerdictKernelOutput` | 完整规则轨迹（每条 `ruleId` / `outcome` / `inputs` / `messageCode`） |
| `verdictTrace.decisiveRuleId` | `VerdictKernelOutput` | 决定性规则 id |
| `verdictTrace.evidenceSufficiency` | `VerdictKernelOutput` | 证据充分性报告 |
| `verdictTrace.protocolDeviations` | `VerdictKernelOutput` | 协议偏离日志 |
| `antiTheaterReport` | `AntiTheaterReport` | 反剧场检查结果（label-only / LLM override / post-hoc threshold / dataset drift / scope laundering 等）；类型权威见 `APPENDIX_A_TYPES.md` §7，运行时由 `runAntiTheaterLint`（`src/anti_theater/lint.ts`）产出并注入此字段 |
| `ledgerRoot` | ledger | 见 `APPENDIX_C` §4，Merkle 根或 hash chain 链头 |
| `verdictKernelVersion` | `VerdictKernelOutput` | 裁决内核版本字符串，锁定规则优先级表 |
| `rulePriorityTableHash` | 裁决内核 | 规则优先级表的 hash（防"偷偷改优先级"） |
| `proofHashInputs[]` | `VerdictKernelOutput` | 裁决内核声明的、本裁决实际依赖的输入字段 hash 列表（数组保序） |

### 3.2 不可进入 proofHash 的字段（及原因）

| 字段 | 原因 |
|---|---|
| `proofHash`（自身） | 自指；会形成无限递归。先 `Omit` 自身再 hash |
| `envelopeId` | 非语义字段，仅用于索引；改 id 不应改变裁决可信度 |
| `signatures[]` | 签名是对 proofHash 的结果，不能反过来进入 proofHash（循环依赖） |
| `humanSummary` / `humanExplanationTemplateId` 渲染后的自然语言 | 解释字段必须可删除而不改变 verdict；模板 id 可进、渲染产物不进 |
| UI 展示顺序、布局、主题 | 非语义 |
| 本地文件绝对路径 | 非语义且环境相关（除非该路径本身是冻结协议字段且已规范化为 `<REPOSITORY_ROOT>/` 前缀） |
| 非决定性时间戳（如"生成 envelope 的当前时间"） | wall-clock 不可进；**只有** freeze / seal 这类已被冻结的事件时间戳可进 |
| debug 日志全文 | 除非其 hash 被显式声明为 evidence 并列入 `measurementResults.rawArtifactHashes` |
| `recomputation` 报告本身（Node / Python / Browser pass/fail） | 这是**验证结果**不是裁决输入；它是 proofHash 的**消费者**不是**生产者** |

### 3.3 proofHash 计算伪代码（与 `APPENDIX_C` §2.4 一致）

```text
function computeProofHash(envelope): string
  // 第 1 步：从 envelope 中提取 verdict-critical 子集（白名单）
  proofInput = {
    schemaVersion:         envelope.schemaVersion,
    claim:                 normalizeClaim(envelope.claim),
    fecHash:               envelope.fecHash,
    fecSnapshot:           envelope.fecSnapshot,            // 与 fecHash 互验
    protocolFreeze:        envelope.protocolFreeze,
    datasetBindings:       envelope.datasetBindings,
    workflowBindings:      envelope.workflowBindings,
    experimentRuns:        envelope.experimentRuns,
    measurementResults:    envelope.measurementResults,
    statisticalResults:    envelope.statisticalResults,
    verdictTrace:          stripNonSemantic(envelope.verdictTrace),
    antiTheaterReport:     envelope.antiTheaterReport,
    ledgerRoot:            envelope.ledgerRoot,
    verdictKernelVersion:  envelope.verdictTrace.kernelVersion,
    rulePriorityTableHash: envelope.verdictTrace.rulePriorityTableHash,
    proofHashInputs:       envelope.verdictTrace.proofHashInputs,
  }
  // Omit: envelopeId, proofHash, signatures, humanSummary, recomputation, UI fields

  // 第 2 步：断言 FEC 一致性（fast-fail）
  assert envelope.fecHash === sha256(canonicalJson(envelope.fecSnapshot))

  // 第 3 步：断言无 NaN/Infinity
  assertNoNaN(proofInput)                                     // 递归扫描，命中即 throw

  // 第 4 步：canonical 序列化（APPENDIX_C §1）
  canonical = canonicalJson(proofInput)

  // 第 5 步：sha256 → 64 hex 小写
  return sha256hex(canonical)

function normalizeClaim(claim): Claim
  return {
    ...claim,
    naturalLanguage: normalizeWhitespace(claim.naturalLanguage)  // 统一 \n、trim、折叠多空格
  }
```

`sha256hex`：标准 SHA-256，无 salt，无 domain tag（V2 新对象的 domain separation 见 `APPENDIX_C` §9），输出 64 字符小写 hex。

### 3.4 verdict-critical 字段权威清单（diff report 落点）

> 本节是 §3.1 的"裁决维度"视图：哪些字段改变就会改变 verdict 或 proofHash。任何 verifier diff report 必须能落到本表的一行。SSOT 见 `APPENDIX_C` §7。

| 层 | 字段 | 改变后果 | diff report code |
|---|---|---|---|
| claim | `claim.id` / normalized text / `domain` / `scope` | proofHash 变 | `CLAIM_HASH_MISMATCH` |
| FEC | `fecSnapshot` / `fecHash` | proofHash 变；裁决路径可能变 | `FEC_HASH_MISMATCH` |
| protocol | `protocolFreeze`（actor / timestamp / envPolicy / deviationPolicy） | proofHash 变；timestamp 非 freeze/seal 则不进 | `PROTOCOL_FREEZE_MISMATCH` |
| dataset | `contentHash` / `schemaHash` / `statsFingerprint` / `scopeCoverage` | proofHash 变；scope drift → `DEGRADED_SCOPE` | `DATASET_HASH_MISMATCH` |
| workflow | `workflowHash` / `containerDigest` / `environmentHash` / `commandHash` / `seedPolicy` / `networkPolicy` | proofHash 变；digest mismatch → verifier RED | `WORKFLOW_HASH_MISMATCH` |
| run | `inputHashes` / `outputHashes` / `logHashes` / `exitCode` / `deviations` | proofHash 变 | `RUN_HASH_MISMATCH` |
| measurement | `metricValue` / `rawArtifactHashes` / stdout/stderr hashes | proofHash 变 | `MEASUREMENT_HASH_MISMATCH` |
| statistics | `effectSizeObserved` / `pValue` / `confidenceInterval` / `assumptionDiagnostics` | proofHash 变；可能改变 verdict（p 越 alpha 等） | `STATISTICAL_RESULT_MISMATCH` |
| verdict | `verdict` / `reasonCodes` / `ruleTrace` / `decisiveRuleId` / `evidenceSufficiency` / `protocolDeviations` / `kernelVersion` / `rulePriorityTableHash` | proofHash 变 | `VERDICT_TRACE_MISMATCH` |
| anti-theater | `antiTheaterReport`（label-only / LLM override / post-hoc threshold / dataset drift / scope laundering / missing raw artifact / metric swapping / seed cherry-picking） | proofHash 变；可能强制 `UNTESTED` / `INCONCLUSIVE` | `ANTI_THEATER_FAIL` |
| ledger | `ledgerRoot` / `chainHead` | proofHash 变；chain 断 → `LEDGER_ROOT_MISMATCH` | `LEDGER_ROOT_MISMATCH` |
| schema | `schemaVersion` | verifier 路径变；不支持则 `UNSUPPORTED_SCHEMA_VERSION` | `UNSUPPORTED_SCHEMA_VERSION` |

---

## 4. `.far-proof` bundle

`.far-proof` bundle 是评委 fresh-clone 后**断网可跑**的离线重算包。物理 JSON schema、九分量目录树、打包护栏、integrityHash、RO-Crate 合规路径选择的完整 SSOT 见 `APPENDIX_D_PROOF_BUNDLE.md`。本节给设计态骨架与本章消费契约；当前 V1 minimal 实现已提供 `far export far-proof` CLI、`.far-proof.tar.zst`、`verify.sh` 与 `integrity.json` 的项目自验证离线包。

### 4.1 设计态 P0 目录树（verifier 消费契约）

```text
.far-proof/
├── claim.json
├── fec.json
├── bindings/
│   ├── datasets.json
│   └── workflows.json
├── runs/
│   └── run-*.json
├── measurements/
│   └── result-*.json
├── verdict.json
├── proof-envelope.json
├── ledger/
│   ├── chain.json
│   └── merkle.json
└── README_RECEIPT.md
```

状态：设计态目录树 `DESIGN_LOCKED`（verifier 消费契约，V2 升级目标）；实现态九分量 + `far export far-proof` + V1 minimal 离线打包链路 `IMPLEMENTED_VERIFIED`（`exporter.ts` / `export_far_proof.ts` / `offline_package.ts` 生成 `.far-proof`、tar.zst、verify.sh、integrity.json，并由 CLI 测试与 `demo_chain_replay.test.ts` 解包实跑）；外部 RO-Crate/PROV-O 校验器认证仍未完成。

### 4.2 实现态九分量（`exporter.ts` V1 实测）

当前 `exportFarProof()` 实际产出（详见 `APPENDIX_D` §1.2）：

```text
.far-proof/
├── proof_envelopes.jsonl          # 已 seal 的 ProofEnvelope（每行一条）
├── repro_runs.jsonl               # 复现运行记录
├── call_records.redacted.jsonl    # call_records 链（已脱敏：排除 request/response payload）
├── claim_graph.json               # claim 依赖子图（verdict_nodes + evidence_edges）
├── otel-trace.jsonl               # OTel GenAI span（V1 从 call_records 投影，非原生 SDK）
├── ro-crate-metadata.json         # RO-Crate 元数据（V1 minimal，非 validator-compliant）
├── prov.ttl                       # PROV-O provenance（V1 基本）
├── data_manifest.json             # 本包文件清单 + 计数
├── README_REPLAY.md               # fresh-clone 重放手册
├── code/
│   └── MANIFEST.md                # code/ 目录诚实说明：快照在 HEAD，重放靠 git checkout
└── figures/                       # 运行时生成的图（占位结构）
```

**设计态 vs 实现态差异（诚实说明）**：

| 差异 | 设计态（§4.1） | 实现态（`exporter.ts`） | 原因 |
|---|---|---|---|
| 单 claim 包 vs 多 claim 流 | `claim.json` 单文件 | `proof_envelopes.jsonl` 多行 | 实现态一次导出整条运行，支持多 envelope |
| ledger/chain + merkle | `chain.json` + `merkle.json` | `call_records.redacted.jsonl`（链在字段 `prev_hash`/`current_hash`） | V1 用 call_records head hash 桥接 ledgerRoot，原生 Merkle ledger 在 V3 |
| bindings/、runs/、measurements/ | 独立目录 | 暂合并在 `repro_runs.jsonl` | V1 minimal；完整分区为 V2 升级 |
| 新增 OTel / RO-Crate / PROV / claim_graph | 未列 | 已实现（V1 基本格式） | `15_OPEN_SCIENCE_EXPORT.md` 引入的九分量 |

### 4.3 打包要求（强制护栏）

| 要求 | 实现点 | 验证点 |
|---|---|---|
| 不含密钥 | `call_records.redacted.jsonl` 排除 `request_payload` / `response_payload` | grep `sk-` / `api_key` / token 模式 |
| 不含真实 PII 路径 | 本地绝对路径归一化为 `<REPOSITORY_ROOT>/` 前缀 | path leak attack 红队（§11.2） |
| 所有引用文件有 hash | `contentHash` / `schemaHash` / `statsFingerprint` / `rawArtifactHashes` / `envHash` / `gitCommitSha` | 缺则 `MISSING_HASH` |
| 缺文件给结构化错误 | verifier 返回 diff report 错误码（§8） | 非 vague crash |
| Windows / 空格 / 离线可运行 | 路径用 forward slash + 引号包裹；零网络依赖 | Windows-first demo path（§10） |

bundle `integrityHash`（防自指）= 所有文件 sha256 的聚合，**不含自身**（防 self-reference）：

```text
integrityHash = sha256(sorted([sha256(file) for file in bundle if file != manifest]))
# manifest 文件自身的 hash 不纳入（防 self-reference）
# 验收：bundle.integrity-hash.test.ts 须验证 integrityHash 不含自身
```

实现状态：`src/far_proof/offline_package.ts` 写入 `integrity.json`（schema `far.proof_bundle.integrity.v1`），`verify.sh` 先本地重算完整性，再调用 `far verify --bundle ... --mode full --json`；当前测试覆盖正常包、篡改检测、tar.zst 解包后脚本实跑。

### 4.4 RO-Crate 合规两条路径（二选一须显式声明）

| 路径 | 内容 | 触发条件 | 诚实措辞 |
|---|---|---|---|
| **路径 A（满血目标·真合规）** | 交付前让 `exporter.ts` 真正通过 ≥1 个独立开源 RO-Crate 校验器（如 `ro-crate-validator` / `ro-crate-py`）+ PROV-O 校验，把校验日志作为证据进 CI | **必做** | "`.far-proof` 通过独立 RO-Crate / PROV-O 校验器（附日志）"——可称"第三方独立验证" |
| **路径 B（诚实兜底）** | 不改 exporter，但措辞严格降级 | 仅当独立校验器与 V1 minimal 格式规范不兼容（**外部技术依赖**，非时间妥协）时触发 | "`.far-proof` 是**项目自验证的离线重算包**（导出格式 V1 minimal，RO-Crate 合规化在 V3 路线图）"——**禁用"第三方独立验证"措辞** |

> `exporter.ts` 实测原文自声明："This export does NOT pass third-party RO-Crate or PROV-O validators (V3 roadmap)" + "RO-Crate metadata (V1 minimal, not validator-compliant)"。未过合规前，**禁止**把 `.far-proof` 包装为"第三方独立验证路径"。

> **裁决**：无论走 A 还是 B，核心价值不变——"独立可重算性"的真正含义是"fresh-clone 评委用自己机器从 claim 重算到 proofHash 全程可复现"，这**不依赖**导出格式是否 RO-Crate 合规。RO-Crate 合规是"格式可被第三方工具解析"，hard gate 是"密码学链可被第三方重算"。两者正交。但措辞必须精确区分，不可混用。

### 4.5 "独立可重算"精确定义（防 overclaim）

**"第三方独立验证"精确指**：

1. fresh-clone 评委用自己的机器，**无项目成员协助**，跑通验证。
2. **从原始 claim 到 proofHash 全链重算**——不是"信任项目给的 hash"，而是"自己重算出来比对"。
3. **断网可跑**——纯本地，不依赖项目服务端存活、不依赖云凭证。
4. **工具可审计**——验证器源码可读、可被替换（极端情况评委可用自己写的 hash 实现重算）。

**"第三方独立验证"绝不指**：

1. 导出格式已通过 IETF / RO-Crate 官方认证（那是路径 A 的目标，未完成前不声称）。
2. 证明科学结论为真（守 C9）。
3. 项目团队代替评委验真（那就还是自验证）。

---

## 5. `far verify` CLI 与输出 schema

### 5.1 P0 CLI 命令族

```bash
# 评委 fresh-clone 后，零配置、零密钥、断网
git clone <repo> && cd <REPOSITORY_ROOT>
pnpm install
pnpm far verify                                   # 验整条套件链
pnpm far verify --bundle path/to/.far-proof --json
pnpm far verify --bundle path/to/.far-proof --mode full          # 全链路
pnpm far verify --bundle path/to/.far-proof --mode chain         # 仅 call_records 链
pnpm far verify --bundle path/to/.far-proof --mode envelope      # 仅 proofHash 重算
pnpm far verify --bundle path/to/.far-proof --explain            # 人类可读解释
pnpm far verify --db far.sqlite --chain-only                     # 直接验 DB
pnpm far verify --envelope proof_envelopes.jsonl --proof-hash
pnpm far verify --vectors golden_vectors.json --lang node
pnpm far verify --claim B7 --full-trace                          # 单 claim 全链重算
# → exit 0 = 全链重算匹配（PASS）；exit 7 = repro 不匹配（FAIL，篡改或漂移）
```

挂接：复用已落地的 `verifyChainHead`（`<REPOSITORY_ROOT>/src/evidence_log/verifier.ts`）+ `canonicalHash` + `verifyProofHashV2`（`<REPOSITORY_ROOT>/src/proof_envelope/v2/proof_hash.ts`）+ `validateProofEnvelopeV2`（`<REPOSITORY_ROOT>/src/proof_envelope/v2/validator.ts`）+ 内嵌 `antiTheaterReport` 一致性校验（源自 `runAntiTheaterLint`·`<REPOSITORY_ROOT>/src/anti_theater/lint.ts`）。是既有纯函数的 CLI 壳（入口 `src/cli/far.ts` → `src/cli/commands/verify.ts`）。

P0 实装命令子集（`IMPLEMENTED_VERIFIED`·task #11）：

```bash
far verify --envelope <ProofEnvelopeV2.json> [--mode envelope|chain|full] [--json] [--explain]
far verify --db <evidence_log.sqlite> [--mode chain] [--json]
far verify --envelope <env.json> --db <db.sqlite> --mode full --json   # envelope + chain
far verify --bundle <.far-proof-dir> [--mode chain|envelope|full] [--json] [--explain]
far export far-proof --demo-chain --out <.far-proof-dir> [--package] [--json]
far export far-proof --db <evidence_log.sqlite> --out <.far-proof-dir> \
  --run-id <id> --model-snapshot <snapshot> --git-commit <40hex> --env-hash <64hex>
```

- `--mode` 默认从 flags 推断（`--bundle`→full；仅 `--envelope`→envelope；仅 `--db`→chain；两者→full）。
- exit 0 = PASS / 7 = FAIL（proofHash 失配 / FAIL 规则 / 链断） / 2 = 参数错误 / 1 = 运行时错误。
- 10 字段输出 schema 见 §5.2（`recomputation.python` 调 Python proofHash 镜像重算；`recomputation.browser = not-run`，浏览器 ProofEnvelope verifier 留 Phase 2 / #13）。
- 诚实边界（反 overclaim）：envelope 模式验封存信封自洽（proofHash 重算 + 10 规则 + 内嵌 anti-theater 报告一致性）；`--lint-input` 提供时独立重算 20 detector 并与内嵌报告深度对比（#11b·`verifiedLevels` 披露 `antiTheaterLint`），否则不重算原始证据。verifier 不校验 lint-input 与 envelope 的语义对齐（评委自负）。

状态：`verifyChainHead` / `verifyProofHashV2` / `validateProofEnvelopeV2` / `runAntiTheaterLint` 为 `IMPLEMENTED_VERIFIED`；`far verify` CLI P0（envelope/chain/full + `--envelope`/`--db`/`--bundle`/`--mode`/`--json`/`--explain`）`IMPLEMENTED_VERIFIED`（valid→exit 0；tampered→exit 7；bad-arg→exit 2；missing-file→exit 1；空格路径可运行）；`far export far-proof` CLI（`--demo-chain` 或 `--db` + 显式 run/model/git/env 元数据，`--package` 生成 `verify.sh` / `integrity.json` / `.tar.zst`）`IMPLEMENTED_VERIFIED`；`--bundle` 为 V1 minimal 自验证路径（必需文件 + redacted call_records 链 + V1 proofHash），输出 WARN 披露非 RO-Crate/PROV-O 第三方认证；`--vectors` / `--claim --full-trace` 仍 `ROADMAP`；`--lint-input`（20-detector 独立重算 + 与内嵌报告深度对比）`IMPLEMENTED_VERIFIED`。

### 5.2 输出 JSON schema（设计态 P0，权威）

```json
{
  "status": "PASS",
  "verdict": "CONFIRMED",
  "proofHash": "64hex",
  "ledgerRoot": "64hex",
  "tamperStatus": "clean",
  "scopeStatus": "full",
  "recomputation": {
    "node": "pass",
    "python": "not-run",
    "browser": "not-run"
  },
  "errors": [],
  "warnings": []
}
```

| 字段 | 类型 | 取值 | 说明 |
|---|---|---|---|
| `status` | enum | `PASS` / `FAIL` / `WARN` | 整体验证结果 |
| `verdict` | `VerdictKind` | 五值之一 | envelope 内 verdict / conclusion |
| `proofHash` | 64hex | 重算值 | 须与 envelope 内一致 |
| `ledgerRoot` | 64hex | 重算值 | call_records head hash（V1）/ Merkle root（V3） |
| `tamperStatus` | enum | `clean` / `tampered` / `unknown` | 篡改检测 |
| `scopeStatus` | enum | `full` / `degraded` / `unknown` | scope 覆盖 |
| `recomputation.node` | enum | `pass` / `fail` / `not-run` | Node 重算 |
| `recomputation.python` | enum | `pass` / `fail` / `not-run` | Python 独立重算 |
| `recomputation.browser` | enum | `pass` / `fail` / `not-run` | Browser Web Crypto 重算 |
| `errors` | `ErrorEntry[]` | 错误码列表 | 见 §8 |
| `warnings` | `string[]` | 非阻断警告 | 如跨语言数值边界已知限制 |

### 5.3 分级输出（`--mode` 分层）

```json
{
  "ok": true,
  "verifiedLevels": ["chain", "merkle", "proofEnvelope", "verdictTrace"],
  "chainHead": "64hex",
  "proofHead": "64hex",
  "brokenAt": null,
  "warnings": [],
  "honestyBoundary": "Node verifier; Rust/Go V2"
}
```

`verifiedLevels` 取值：`chain` / `merkle` / `proofEnvelope` / `verdictTrace` / `claimGraph`（对应 §6 七层分层）/ `antiTheaterLint`（#11b·`--lint-input` 20-detector 独立重算层·加性轴·透明披露，非 §6 七层之一）。`brokenAt` = 断裂的 seq 或 null。

### 5.4 CLI exit code 语义（权威）

| exit code | 含义 |
|---|---|
| `0` | 全链重算匹配（PASS） |
| `7` | repro 不匹配（FAIL，篡改或漂移，既有语义） |
| 非 0 非 7 | 运行时错误（缺文件、schema 不支持等） |

### 5.5 单 claim 全链重算语义（`--claim <id> --full-trace`）

```text
claim (B7)
  → SciIR 节点          [评委重算 canonicalHash]
  → falsification_spec  [评委重算]
  → reproHash (七分量)  [评委重算]
  → verdict (五值)      [评委跑 verdict_mapping 决策树]
  → ProofEnvelope       [评委重算 objectHash / proofHash]
  → .far-proof          [评委比对]
全部匹配 → exit 0；任一不符 → exit 7
```

---

## 6. 独立验证等级 L1-L6

### 6.1 七层 verifier 分层（架构）

```text
Level 0: hash primitive vectors           （sha256 / stable-stringify 基元）
Level 1: canonical JSON vectors           （排序 / unicode / numeric 边界）
Level 2: call_records chain verifier      （prev_hash → current_hash 连续性）
Level 3: Merkle root / proof verifier     （inclusion proof）
Level 4: ProofEnvelope proofHash verifier （self-excluding 重算）
Level 5: FEC / statistical verdict rule trace verifier （五值裁决内核重算）
Level 6: claim graph propagation verifier （依赖传播）
```

交付节奏：V1 = L0-L4；V2 硬化 = Rust / Go L0-L4 + L5；V3 = WASM + formal spec + reproducibility bundle。

### 6.2 独立验证等级（对外口径表）

| 等级 | 含义 | 对外口径 | 当前状态 |
|---|---|---|---|
| L1 | 同仓库 Node 重算 | 基础 verifier | `verifyChainHead()` / `verifyProofHashV2()` / `validateProofEnvelopeV2()` `IMPLEMENTED_VERIFIED`；`far verify` CLI P0（envelope/chain/full·`--envelope`/`--db`/`--bundle`/`--mode`）`IMPLEMENTED_VERIFIED`；`--lint-input`（20-detector 独立重算 + 内嵌报告深度对比）`IMPLEMENTED_VERIFIED` |
| L2 | Python 独立实现重算 | 跨语言独立重算 | SQLite / JSON chain verifier、Merkle verifier、`canonical_json.py`（`<REPOSITORY_ROOT>/repro/far_chain_repro/`）`IMPLEMENTED_UNVERIFIED`；proof envelope hash 待 V2 镜像 |
| L3 | Browser Web Crypto / standalone verifier | 评委本机可视化验真 | `<REPOSITORY_ROOT>/frontend/src/lib/merkle.ts`（Merkle / Suite）`IMPLEMENTED_VERIFIED`；`frontend/public/verify.html` standalone ProofEnvelope V2 proofHash verifier `IMPLEMENTED_VERIFIED` |
| L4 | Rust / Go / WASM 独立实现 | V2 / V3 加强 | Rust / Go `ROADMAP`（V2）；WASM `ROADMAP`（V3，`packages/wasm-verifier/`） |
| L5 | 第三方维护 verifier | 生态成熟目标 | `ROADMAP` |
| L6 | 形式化验证核心 invariant | 研究路线 | `RESEARCH`（§11） |

### 6.3 诚实口径（反 overclaim）

当前若只有 Node / Python / browser 局部能力，**不得**说"完全第三方验证生态已完成"。可以说"P0 目标是完成可演示的独立重算闭环"。

当前诚实口径是：Node / Python 异语言链路 + Browser 独立环境 Merkle / Suite / ProofEnvelope V2 proofHash 重算；Browser **不是**第三种语言实现（standalone JS + Web Crypto），也不验证原始 evidence 或外部 RO-Crate 合规。V2 明确补 Rust / Go，V3 补 WASM / formal spec。**不把设计规划伪装成已实现。**

---

## 7. Browser verifier 边界

Browser verifier 是评委体验的关键，但必须诚实标注。

### 7.1 可验证范围

- Merkle root、Merkle inclusion proof、call_records chain head（复用 `<REPOSITORY_ROOT>/frontend/src/lib/merkle.ts` 的 `buildMerkleTree` / `verifyInclusionProof`）；
- ProofEnvelope V2 `proofHash`（standalone `frontend/public/verify.html`，内置 canonical JSON + Web Crypto SHA-256，测试直接抽取页面脚本与 TS/Python fixture 对拍）；
- 用 `crypto.subtle`（Web Crypto）**纯前端**重算 `suiteIntegrityRoot` + 任一证据的 inclusion proof，三处一致断言（前端 golden + 后端 aggregator + 报告声称值），不等即红色弹窗。

### 7.2 诚实边界

| 边界 | 说明 |
|---|---|
| TS 编译产物 | 若 browser 使用 TS 编译产物，**不得**把它包装成完全不同语言实现 |
| schema 与 canonicalization | Web Crypto 能独立计算 hash，但 schema 和 canonicalization 仍需 golden vectors 锚定 |
| proof envelope hash | Browser 覆盖 ProofEnvelope V2 proofHash；不覆盖 V1 `.far-proof` bundle、raw evidence 重跑或外部认证 |
| 页面离线 | 页面必须离线可打开或有 U 盘 Plan B（standalone `verify.html` 零网络依赖） |
| 篡改演示 | 篡改演示必须**真实修改 verdict-critical 字段**，不得只改 UI |

### 7.3 状态

`merkle.ts`（Merkle / Suite）`IMPLEMENTED_VERIFIED`；standalone `frontend/public/verify.html` ProofEnvelope V2 proofHash verifier `IMPLEMENTED_VERIFIED`（断网可打开，页面内联脚本由 `browser_standalone.test.ts` 直接执行验证）。

---

## 8. Diff report（错误码全表）

验证失败时，输出必须帮助定位到具体字段、具体 record / seq。

### 8.1 错误码全表（设计态权威）

| 错误码 | 触发条件 | 定位说明（diff report 输出） | 关联 verifier 层级 |
|---|---|---|---|
| `PROOF_HASH_MISMATCH` | envelope 内 `proofHash` 与重算值不符 | 输出：哪个 canonical field 变化（expected vs actual 的 field diff） | L4 ProofEnvelope proofHash |
| `LEDGER_ROOT_MISMATCH` | call_records 链断裂（`prev_hash` 不连续或 `current_hash` 重算不符） | 输出：哪条 record 或 seq 断裂（`brokenAtSeq` + `expectedHash` + `actualHash`） | L2 chain verifier |
| `FEC_HASH_MISMATCH` | FEC 被替换（`preregistrationHash` 或 `fecHash` 不符） | 输出：FEC 哪个字段变化（measurableImplication / metric / threshold / alpha / seed） | L5 verdict trace |
| `DATASET_HASH_MISMATCH` | 数据内容（`contentHash`）、schema（`schemaHash`）或 stats（`statsFingerprint`）变化 | 输出：哪个 hash 字段变化 + 是否触发 `DEGRADED_SCOPE` | L5 verdict trace |
| `VERDICT_TRACE_MISMATCH` | verdict kind 或 reason code 被改，或 rule trace 重算不符 | 输出：verdict 值差异 或 哪条 ruleId 的 outcome 变化 | L5 FEC / verdict trace |
| `UNSUPPORTED_SCHEMA_VERSION` | envelope `schemaVersion` 不在 verifier 支持列表 | 输出：unsupported version X，supported=[...] | L0（前置门） |

### 8.2 扩展错误码（实现态补充）

| 错误码 | 触发条件 | 定位说明 |
|---|---|---|
| `MISSING_REQUIRED_FILE` | bundle 缺 §4.1 P0 必需文件 | 输出：缺哪个文件（claim.json / fec.json / verdict.json / proof-envelope.json） |
| `MISSING_HASH` | 引用文件无对应 hash 字段 | 输出：哪个引用缺 hash（如 measurement 缺 `rawArtifactHashes`） |
| `REDUNDANT_PATH_LEAK` | bundle 内出现未归一化的绝对路径 | 输出：哪个字段含 leak（path leak attack 防御） |
| `RULE_PE_VIOLATION` | ProofEnvelope Validator 9 / 10 规则有 FAIL / WARN | 输出：哪条 `RULE-PE-00X` 失败 + detail |
| `ANTITHEATER_FAIL` | WARN / FAIL check 存在但 conclusion = `CONFIRMED` | 输出：触发 `RULE-PE-007`（`hasAntiTheaterViolation`） |
| `CHAIN_EMPTY` | call_records 为空（无 genesis 后续） | 输出：recordCount = 0 |
| `ENV_HASH_MISMATCH` | fresh-clone 重放时 `envHash` 不符 | 输出：expected vs actual envHash（fresh-clone lock） |
| `COMMIT_SHA_MISMATCH` | fresh-clone 重放时 `gitCommitSha` 与 HEAD 不符 | 输出：expected commit vs HEAD（code snapshot lock） |
| `CLAIM_HASH_MISMATCH` | claim.id / normalized text / domain / scope 变化 | 输出：哪个 claim 字段变化 |
| `PROTOCOL_FREEZE_MISMATCH` | `protocolFreeze`（actor / timestamp / envPolicy / deviationPolicy）变化 | 输出：哪个 freeze 字段变化 |
| `WORKFLOW_HASH_MISMATCH` | `workflowHash` / `containerDigest` / `environmentHash` / `commandHash` / `seedPolicy` / `networkPolicy` 变化 | 输出：哪个 workflow 字段变化 |
| `RUN_HASH_MISMATCH` | `inputHashes` / `outputHashes` / `logHashes` / `exitCode` / `deviations` 变化 | 输出：哪个 run 字段变化 |
| `MEASUREMENT_HASH_MISMATCH` | `metricValue` / `rawArtifactHashes` / stdout / stderr hashes 变化 | 输出：哪个 measurement 字段变化 |
| `STATISTICAL_RESULT_MISMATCH` | `effectSizeObserved` / `pValue` / `confidenceInterval` / `assumptionDiagnostics` 变化 | 输出：哪个 statistics 字段变化 |
| `ANTI_THEATER_FAIL` | `antiTheaterReport` 任一 finding fail | 输出：哪个 attackKind 触发 |

### 8.3 错误码定位输出格式

```json
{
  "errors": [
    {
      "code": "PROOF_HASH_MISMATCH",
      "severity": "fail",
      "envelopeId": "01H...",
      "expected": "a1b2...",
      "actual": "c3d4...",
      "fieldDiff": {
        "field": "conclusion",
        "expected": "CONFIRMED",
        "actual": "REFUTED"
      },
      "remediation": "检查 envelope 内 conclusion 字段是否被篡改"
    }
  ]
}
```

---

## 9. Trust Receipt（信任收据）

Trust Receipt 是面向人的简明收据，**不是**替代 ProofEnvelope 的新事实源。它是 ProofEnvelope 的可读投影。

### 9.1 结构化摘要（`TrustReceiptSummary`）

```typescript
interface TrustReceiptSummary {
  /** [DOC] claim 摘要文本。 */
  claimSummary: string;
  /** [DOC] verdict（与 verdictTrace.verdict 一致；不一致 → natural-language-verdict-mismatch finding）。 */
  verdict: VerdictKind;
  /** [DOC] 证据 scope 摘要。 */
  evidenceScope: string;
  /** [DOC] proofHash（hex）。 */
  proofHash: string;
  /** [DOC] 验证命令示例，如 "far verify --bundle x.far-proof --json"。 */
  verifierCommand: string;
  /** [DOC] tamper 状态：'clean' / 'tampered' / 'unknown'。 */
  tamperStatus: "clean" | "tampered" | "unknown";
  /** [DOC] 局限性声明列表（如"仅 TESS sector 14 单目标"）。 */
  limitations: string[];
  /** [DOC] 要求的下一步动作（如"需多 sector 复核"）。 */
  requiredNextAction?: string;
}
```

状态：`IMPLEMENTED_VERIFIED`（`src/cli/commands/export_receipt.ts` + `tests/cli/export_receipt.test.ts`）：`far export receipt` 输出 JSON/Markdown，支持 V2 envelope 与 V1 minimal `.far-proof`，并在 limitations 中披露 DOC 投影、非真理证书、非第三方 RO-Crate/PROV-O 认证等边界。

### 9.2 内容字段清单

- claim；
- verdict；
- evidence scope；
- proofHash；
- verifier command；
- tamper status；
- limitations；
- required next action。

### 9.3 示例口径（中英双语，权威）

英文口径：

```text
This claim is CONFIRMED under the frozen FEC for dataset scope X,
with proofHash Y. The receipt does not certify universal scientific truth.
It certifies that the sealed evidence package satisfies the stated contract
and can be independently recomputed.
```

中文口径：

```text
该声明在冻结的 FEC 与当前证据范围内得到 CONFIRMED。
这不是终局科学真理证书，而是该证据包满足既定可证伪契约、
且可被独立重算的信任收据。
```

### 9.4 诚实护栏

Trust Receipt 是 `[DOC]` 字段，永远不进入裁决决策；其 `verdict` 字段必须与 `verdictTrace.verdict` 一致，不一致触发 `natural-language-verdict-mismatch` 反剧场 finding（`APPENDIX_A` §7）。对外口径必须含"bounded support，非科学真理证书"声明。

---

## 10. 第三方独立验证三路径（FI-9 详设）

### 10.1 三条独立路径（redundancy · 任一可证）

| 路径 | 工具 | 断网 | 适合谁 | 状态 |
|---|---|---|---|---|
| CLI | `far verify` | 是 | 命令行评委 / 复现者 | `far verify` CLI P0（envelope/chain/full·`--envelope`/`--db`/`--bundle`/`--mode`·exit 0/7）`IMPLEMENTED_VERIFIED`；`--lint-input`（20-detector 重算·exit 7 on divergence）`IMPLEMENTED_VERIFIED` |
| Web Crypto | `verify.html`（standalone） | 是 | 浏览器评委 / 非技术背景 | `merkle.ts` + `frontend/public/verify.html` ProofEnvelope V2 proofHash verifier `IMPLEMENTED_VERIFIED` |
| 离线包 | `.far-proof.tar.zst` + `verify.sh` + `integrity.json` | 是 | 想拿走证据信的评委 | V1 minimal 自验证包 `IMPLEMENTED_VERIFIED`；输出 WARN 披露非 RO-Crate/PROV-O 第三方认证 |

三条路径**互相独立、殊途同归**——任一一条都可达"自己重算匹配"。这是 redundancy，也是诚实：评委无法质疑"你是不是只在演示路径上做了手脚"。

### 10.2 Windows-first demo path

| 项 | 说明 |
|---|---|
| Zero network mode | bundle 含 Node script、Python package、standalone browser `verify.html`，断网可跑 |
| No native build requirement | 评委机器无需编译原生模块 |
| Plan B / C | 若 Python 缺失，browser + Node 仍可演示 tamper-evident proof；Python 是 packaged fallback |
| 本地路径归一化 | 所有展示路径渲染为 `<REPOSITORY_ROOT>/...` |

### 10.3 W2 hard gate（验收门）

- [x] 全 10 条 Validator 规则测试绿。
- [ ] 一名**非项目成员** fresh-clone 后按《第三方 10 分钟复算手册》实跑 exit 0（须留截图 / 录屏）。
- [x] 三条独立路径（CLI / Web Crypto / 离线包）本机验证路径全部 exit 0。
- [x] §4.4 路径 B 已显式落实（V1 minimal 项目自验证离线重算包 + WARN 降级措辞）；路径 A 仍需外部校验日志。
- [ ] 全 PDF / README / pitch 零"第三方独立验证"裸声称（须配 §4.5 精确定义）。

### 10.4 Golden / Mutation Vectors

| Suite | 内容 |
|---|---|
| `canonical_json_vectors` | strings / unicode / arrays / objects / numeric boundaries / rejects |
| `chain_vectors` | valid chain / broken prev / broken current |
| `merkle_vectors` | odd leaves / proof direction / tamper leaf |
| `proof_envelope_vectors` | valid / tampered proofHash / reordered checks |
| `fec_vectors` | alpha changed / stopping rule changed |
| `verdict_trace_vectors` | 全部五值（CONFIRMED / REFUTED / INCONCLUSIVE / DEGRADED_SCOPE / UNTESTED） |

每个 mutation vector 必须声明期望的 `brokenAtSeq` 或 failing rule id。向量数量与覆盖率**不手填**，一律来自 `far status`；缺失字段写 `Pending` 或 `NEEDS_EXTERNAL_VERIFICATION`。

---

## 11. 跨语言一致性与已知边界

### 11.1 canonicalHash 4 字段白名单（结构性护城河）

`<REPOSITORY_ROOT>/src/evidence_log/hasher.ts` 实测：`canonicalHash` 仅对 4 字段白名单 hash——`stageId` / `cred` / `payloadKind` / `prevHash`，均为字符串 / 枚举 / 凭证对象。**数值永不进白名单**，故白名单内天然字节相等，与 RFC 8785 数值序列化无关。算法 SSOT 见 `APPENDIX_C` §3。

### 11.2 `1e-7` 科学计数法鸿沟（诚实披露）

**根因（一句话）**：不同语言的 JSON 序列化器对极小浮点数（`1e-7` 量级）的科学计数法格式化策略不同——TS `fast-json-stable-stringify` 输出 `1e-7`，Python `json.dumps` 输出 `1e-07`。两者数值相等但字节序列不同 → canonicalHash 不一致。发生在**数值类 golden 向量**（白名单之外的 `golden_vectors.json`），与信任根字节相等**正交**。

**解药（不掩盖，做成 demo 卖点）**：同屏展示 TS `1e-7` vs Python `1e-07` 字节 diff，口播"我们连这个已知鸿沟都诚实标注——白名单内已字节相等 + 数值类已实证（含 1e-7 鸿沟）；科学计数法这个边界我们选择披露而非粉饰"。

**工程兜底（若评委追问）**：

- **方案 A（首选）**：白名单内对数值类统一走 RFC 8785 JCS 规范化，把 `1e-7` 类边界纳入 JCS number serialization 规则。
- **方案 B（降级）**：明确"4 字段白名单 + 数值类已字节相等；科学计数法边界是已知限制，列 V3 路线图"，不冒充已解。

### 11.3 RFC 8785 emoji / ZWJ gold-plating 删除（RR-12）

删除"覆盖 emoji / ZWJ / 组合字符的 RFC 8785 全规范"目标——canonicalHash 4 字段白名单结构性排斥自然语言 emoji 边界。文档明示："RFC 8785 全规范（含 emoji / ZWJ）不适用于 FAR-Chain 的结构化 claim 字段——我们的白名单设计天然规避了这类边界。"

> 注：RR-12 属 `56` §6 风险登记体系，与 `43` §0.3 红队发现 R12（文档太多悖论）是**两套不同编号体系**，勿混。

### 11.4 WASM 三语言字节相等（V3 路线）

```text
canonicalHash 算法（同一份规范）：
  ├─ TS:   <REPOSITORY_ROOT>/src/evidence_log/hasher.ts       (LIVE)
  ├─ Py:   <REPOSITORY_ROOT>/repro/far_chain_repro/canonical_json.py  (LIVE)
  └─ WASM: <REPOSITORY_ROOT>/packages/wasm-verifier/          (待实现·第三语言)
```

CI 三向 golden 断言：同一 fixture，TS / Py / WASM 输出字节相同的 hash。扩展 `<REPOSITORY_ROOT>/repro/tests/test_cross_lang_consistency.py` 至三向。

**降级（若 WASM hash 漂移）**：降级为"TS + Python 双语言 + 浏览器 JS 重算"（复用已落地 `<REPOSITORY_ROOT>/frontend/src/lib/merkle.ts`）。WASM 是性能 / 体验增益，**非**信任根依赖——双语言字节相等 + JS 浏览器重算已足够支撑 FI-9 第三方验真。

### 11.5 Domain Separation（V2 新对象）

V2 起所有**新**对象的 canonical hash 输入必须携带 `hashDomain` tag，防止不同对象同形 JSON 语义混淆。现有 V1 hash（call_records）保持不改。

```typescript
type HashDomain =
  | "far.call_record.v1"          // V1 现有，无 domain tag（向后兼容）
  | "far.fec.v2"
  | "far.dataset_binding.v1"
  | "far.workflow_binding.v1"
  | "far.verdict_trace.v1"
  | "far.proof_envelope.v2"
  | "far.claim_graph.v1"
  | "far.ledger_event.v1";
```

```text
function domainTaggedHash(domain: HashDomain, obj: object): string
  tagged = { __hashDomain: domain, payload: obj }
  return sha256hex(canonicalJson(tagged))
```

状态：`DESIGN_LOCKED`，实现为 `ROADMAP`（V2）。算法 SSOT 见 `APPENDIX_C` §9。

### 11.6 流式证明链（FI-6，V3 路线）

```text
agent_loop / fsm_runner.ts (6-stage FSM, 确定性)
   │ 每阶段完成 → emit stage_event { stage, canonicalHash, partialRoot }
   ▼
packages/streaming/sse.ts (SSE / stdio 流式传输)
   │
   ▼
浏览器 / CLI 实时显示 hash-link 增长
```

**铁律**：流式**不引入非确定性**——禁 `Math.random` / `Date.now` 进 hash 路径。流式只是把已落地的 `appendRecord` 事件流出去，算法不变。状态：`ROADMAP`（V3）。

---

## 12. Replay 时光机与续跑 byte-equal 诚实边界（FI-7）

### 12.1 设计意图

```text
append-only + forkable 证据链
   │
   ├─ Scrub: 在 agent 推理时间线上任意定位证据节点
   │
   ├─ Fork:  在任一证据节点 fork → counterfactual replay → 重跑 verdict
   │         (forked_from 显式标注，绝不与原链混淆)
   │
   └─ Sensitivity Analysis: 证据敏感性分析（改某证据 → verdict 怎么变）
```

### 12.2 续跑 byte-equal 诚实边界（最关键）

> **必须诚实**：续跑 byte-equal **仅 deterministic track（offline_replay）可达成**；**真实 LLM 轨道续跑 byte-equal 在 LLM 非确定性下不成立**。

| Track | 续跑 byte-equal？ | 理由 |
|---|---|---|
| `offline_replay`（deterministic fixture） | 可 byte-equal | 完全确定性，无 LLM 调用非确定性 |
| 真实 LLM（`competition_aliyun_qwen`） | **不可 byte-equal** | LLM 采样非确定（即使 temp=0 亦有数值漂移），续跑产出不同字节 |

**禁止声称**："时光机证明 AI 可重现"——仅 deterministic track 可 byte-equal，真实 LLM 轨道不成立。

### 12.3 架构挂接（零改 L0-L3）

```text
packages/timemachine/                    ← 接入层新增
  fork.ts                                (counterfactual fork，forked_from 标注)
  scrub.ts                               (时间线 scrub)
  sensitivity.ts                         (证据敏感性分析，纯函数)
schema/migrations/XXXX_rng_checkpoint.sql ← 新建旁挂表（FK → call_records.seq）
                                           不进 canonicalHash 4 字段白名单
                                           （解循环依赖：checkpoint 依赖 seq，seq 进 hash，故 checkpoint 不进）
```

**零改证明**：fork 是接入层（`forked_from` 显式标注，不覆盖原链）；RNG checkpoint 是旁挂表（FK → `call_records.seq`），**不进** canonicalHash 4 字段白名单。所有 claim 仍走同一 FEC + 同一 verdict_mapping + 同一哈希链。

状态：`DESIGN_LOCKED`（设计 + 待实现，非既有）。

---

## 13. ProofEnvelope 可组合性与 Claim Graph（V2 路线）

> 状态：`DESIGN_LOCKED`（节点 / 边模型已定）→ `ROADMAP`（传播算法、增量 Merkle 待实现）。

### 13.1 节点模型

```typescript
export type ClaimGraphNodeKind =
  | 'claim' | 'evidence' | 'dataset' | 'workflow'
  | 'method' | 'measurement' | 'statistical_result'
  | 'verdict' | 'proof_envelope';

export interface ClaimGraphNode {
  nodeId: string;
  kind: ClaimGraphNodeKind;
  objectHash: string;
  status: 'active' | 'stale' | 'retracted' | 'superseded';
  envelopeRefs: string[];
}
```

### 13.2 边模型

```typescript
export type ClaimGraphEdgeKind =
  | 'depends_on' | 'supports' | 'refutes' | 'contradicts'
  | 'narrows_scope' | 'derived_from' | 'uses_dataset'
  | 'uses_workflow' | 'sealed_by' | 'superses';

export interface ClaimGraphEdge {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  kind: ClaimGraphEdgeKind;
  edgeHash: string;
  rule: string;
}
```

### 13.3 Aggregated Verdict 与传播规则

```typescript
export interface AggregateVerdict {
  claimNodeId: string;
  localVerdict: VerdictKind;
  propagatedVerdict: VerdictKind;
  propagationTrace: PropagationStep[];
  impactedBy: string[];
}
```

传播规则：

1. parent claim depends on child claim。
2. child `REFUTED` → parent **不能**保持无条件 `CONFIRMED`。
3. dataset drift → 所有依赖的 measurement 变 stale。
4. stale measurement → 关联 verdict 变 `DEGRADED_SCOPE` 或需重算。
5. contradiction edge（更强证据）→ claim 变 `INCONCLUSIVE` 或被 rule trace `REFUTED`。

### 13.4 增量 Merkle 更新

```text
nodeHash  = H(domain="far.graph.node.v1", canonical(node))
edgeHash  = H(domain="far.graph.edge.v1", canonical(edge))
graphRoot = Merkle(sorted(nodeHash + edgeHash))
```

部分重算：仅变更 dataset 节点的后代重算；未变更子树保留 prior Merkle proof；claim impact report 含 before / after graphRoot。

### 13.5 API 草案

```typescript
export function buildClaimGraph(envelopes: ProofEnvelopeV2[]): ClaimGraph;
export function propagateGraphVerdict(graph: ClaimGraph, changedNodeId: string): AggregateVerdict[];
export function diffProofHeads(before: ProofHead, after: ProofHead): ProofDiff;
export function queryImpactedClaims(graph: ClaimGraph, evidenceNodeId: string): ClaimImpactReport;
```

### 13.6 红队 Graph 攻击与防御

| 攻击 | 防御 |
|---|---|
| 隐藏依赖边 | envelope dependency completeness lint |
| Cycle laundering | cycle guard；cycles 须显式 fixed-point 语义 |
| Refuted child 被忽略 | propagation invariant test |
| Dataset drift 只标文件不标 claim | impacted claim query 必须非空 |
| Supersession 隐藏 retraction | retraction 与 supersession 是不同边 |
| 合并不兼容 FEC 的 envelope | FEC compatibility check |

### 13.7 demo story

1. AI scientist 生成 claim A（依赖 dataset D + workflow W）。
2. ProofEnvelope seal `CONFIRMED`。
3. Judge 改 D 一行。
4. Dataset binding 变红。
5. Graph 高亮 claim A 与衍生 claim B。
6. claim A 传播 verdict 变 `DEGRADED_SCOPE` 或 `UNTESTED`。
7. UI 显示："这不是模型说错了，而是证据链不再支持原声明。"

---

## 14. 形式化验证路线（L6 / RESEARCH）

### 14.1 关键不变量（V2 / V3 形式化锚点）

1. 影响 verdict 的字段必须进入 proofHash。
2. protocol freeze 后承重字段变化必须改变 head。
3. 五值裁决互斥。
4. 五值裁决完备。
5. `UNTESTED` 不能误报 `CONFIRMED`。
6. `DEGRADED_SCOPE` 不能隐藏 same-scope refutation。
7. verifier 跨语言输出一致。
8. append-only log 不允许 update / delete 不留痕。

### 14.2 Tool Mapping（外部工具，须 hedge）

| Tool | 来源 | FAR 用途 | 状态 |
|---|---|---|---|
| TLA+ | Microsoft / Lamport | state machine / freeze invariant | `RESEARCH`（V2） |
| Dafny | dafny.org | hash input / verdict function contracts | `RESEARCH`（V3） |
| Lean | lean-lang.org | V3 proof of exclusivity / completeness | `RESEARCH`（V3） |
| Alloy | alloytools.org | graph dependency / cycle checks | `RESEARCH`（V2） |

> 外部工具与论文链接须 hedge 并标 `NEEDS_EXTERNAL_VERIFICATION`；不编造未验证的 API 签名或能力。

### 14.3 TLA+ Sketch（V2 锚点）

```text
VARIABLES state, fec, evidence, verdict, proofHead

Freeze == state = "FEC_VALIDATED" /\ fecHash' = Hash(fec)
MutateAfterFreeze == state \in {"FEC_FROZEN", "EVIDENCE_BOUND"} /\ fec' # fec
Invariant == MutateAfterFreeze => proofHead' # proofHead
```

### 14.4 Dafny Sketch（V3 锚点）

```dafny
datatype Verdict = Confirmed | Refuted | Inconclusive | DegradedScope | Untested

predicate MutuallyExclusive(v: Verdict)
{
  v.Confirmed? || v.Refuted? || v.Inconclusive? || v.DegradedScope? || v.Untested?
}
```

### 14.5 Property-based Tests（V1 可达）

- random field mutation changes hash；
- random evidence sets output exactly one verdict；
- no evidence always `UNTESTED`；
- scope narrower + refutation priority invariant；
- proofHash excludes only proofHash field。

### 14.6 V1 / V2 / V3 形式化范围

| Version | Formal scope |
|---|---|
| V1 | property tests + golden vectors |
| V2 | TLA+ one freeze invariant + Alloy graph cycle |
| V3 | Dafny / Lean kernel anchors + cross-language conformance |

### 14.7 答辩口径（形式化）

**问：你们形式化覆盖整个系统了吗？**
答：不声称形式化覆盖整个系统。我们会形式化最承重的不变量：freeze 后不可无痕修改、五值互斥完备、`UNTESTED` 不误报 `CONFIRMED`、`proofHash` 绑定承重字段。

---

## 15. 性能目标与 red-team 测试

### 15.1 性能目标（design targets，非实测）

| 指标 | V1 target | V2 target |
|---|---:|---:|
| 100-record chain verify | < 1s | < 200ms |
| 1k-record proof envelope bundle | < 5s | < 1s |
| standalone browser load | < 2s | < 1s |
| proof bundle size | < 10MB demo | chunked for large datasets |

> 这些是 **design targets**，非 current measured claims。实测进 CI（守 O11，禁目标值冒充实测）。实测数值由 `far status` 报告，**不手填**。

### 15.2 red-team 测试（`69` §10）

| 攻击 | 期望 |
|---|---|
| shared canonicalization bug（TS / Python 数值向量分歧） | expected red until JCS migration |
| locale attack（非英文 locale 下 hash 不变） | pass |
| timezone attack（verifier 时区变化，sealed timestamp 不变） | pass |
| path leak attack（绝对路径归一化出去） | pass |
| browser import failure（standalone bundle smoke with Playwright） | pass |
| dependency drift（lock hash mismatch warning） | warn |

---

## 16. Rust / Go / Python verifier 接口（V2 路线）

```rust
pub trait FarVerifier {
    fn verify_chain(&self, records: &[CallRecord]) -> VerifyReport;
    fn verify_merkle(&self, proof: &MerkleProof) -> VerifyReport;
    fn verify_envelope(&self, envelope: &ProofEnvelopeV2) -> VerifyReport;
}
```

```go
type FarVerifier interface {
    VerifyChain(records []CallRecord) VerifyReport
    VerifyMerkle(proof MerkleProof) VerifyReport
    VerifyEnvelope(envelope ProofEnvelopeV2) VerifyReport
}
```

Python reference mirrors TypeScript first；Rust / Go 是 **differential hardening**，**非** source of truth。状态：`ROADMAP`（V2）。

---

## 17. 诚实护栏与答辩口径汇总

### 17.1 诚实护栏（反 overclaim 全表）

| 风险 | 守卫 |
|---|---|
| 自验证冒充第三方验证（R11） | §4.4 路径 A / B 二选一前置；`exporter.ts` 未过 RO-Crate 合规前禁用"第三方独立验证"措辞 |
| Validator 第 10 条被当"既有规则测试" | §2.4 拆分状态：第 10 条是新增协议规则；当前已 spec + validator 测试 + TS/Python/browser/离线包重算证据 |
| "10 分钟手册"项目成员自己跑 | §10.3 W2 验收门要求非项目成员实跑 |
| 离线包依赖后端在线 | tar.zst 静态分发，`verify.sh` 纯本地重算完整性并调用本地 `far verify --bundle` |
| 把"可重算"读成"证明为真" | §4.5 四条"绝不指"钉死（守 C9） |
| Validator 规则 day-1 才验证 | 全 10 条测试交付前必绿（诚实红线） |
| `1e-7` 鸿沟被掩盖 → 现场暴露崩塌（RR-5） | §11.2 做成 demo 卖点（现场 diff），不掩盖 |
| RFC 8785 gold-plating（RR-12） | §11.3 删 emoji / ZWJ；白名单结构性排斥是护城河 |
| WASM hash 漂移 | §11.4 三向 golden 断言；漂移则降级双语言 + JS |
| 流式引入非确定性 | §11.6 禁 random / Date 进 hash 路径 |
| 性能目标值冒充实测 | §15.1 实测进 CI（守 O11） |
| 续跑 byte-equal 被读成"真实 LLM 可重现" | §12.2 明示：仅 deterministic track；真实 LLM 不成立 |
| fork 与原链混淆 → 伪造机 | `forked_from` 强制显式标注；反事实 verdict 不覆盖原 verdict |
| 形式化被吹成"全系统已形式化" | §14.7 只形式化最承重不变量 |

### 17.2 答辩口径

**问：三路 verifier 真的独立吗？**
答：当前诚实口径是 Node / Python 异语言链路 + Browser 独立环境 Merkle / Suite 重算；Browser **不是**第三种跨语言 ProofEnvelope verifier。V2 明确补 Rust / Go / ProofEnvelope，V3 补 WASM / formal spec。我们不把设计规划伪装成已实现。

**问：`.far-proof` 是第三方独立验证吗？**
答：取决于 RO-Crate 合规路径选择（§4.4）。若走路径 A（`exporter.ts` 过独立 RO-Crate / PROV-O 校验器）则可称"第三方独立验证"；若走路径 B（V1 minimal 格式）则只能称"项目自验证的离线重算包"。`exporter.ts` 当前自声明 V1 minimal，未过校验器（V3 路线图）。但"独立可重算性"的真正含义——fresh-clone 评委用自己机器从 claim 重算到 proofHash 全程可复现——**不依赖**导出格式合规。

**问：这不就是知识图谱吗？**
答：不是。普通知识图谱表达"知识之间有关联"，Claim Graph 表达"哪条可验证证据支撑了哪个裁决"。它的关键动作是**传播 proof failure**：底层数据漂移会让上游结论降级或重算，而不是继续绿色。

**问：proofHash 能证明科学结论为真吗？**
答：不能（守 C9）。proofHash 证明的是"该证据包满足既定可证伪契约、且可被独立重算"，是 **tamper-evident / independently re-computable** 的过程可信可机器检，非真理证明。

**问：篡改真的能被发现吗？**
答：chain hash 任一断裂、Merkle inclusion proof 任一 sibling 不符、proofHash 任一 verdict-critical 字段变化，都会被独立重算的 verifier 检出。这是 **tamper-evident**，不是 tamper-proof——DROP TRIGGER 可绕过 DB 层，所以靠 external anchor（`gitCommitSha` / crossref DOI / V3 公开日志）兜底。

**问：proofHash 怎么保证 LLM 没偷偷改 verdict？**
答：verdict 由 deterministic kernel 产出的 rule trace 决定，rule trace 进 proofHash；自然语言解释不进。第三方用同一 `VerdictKernelInput` 重算 verdict，若与 envelope 中的 verdict 不符 → `VERDICT_TRACE_MISMATCH`。

---

## 18. 与其他章节的咬合

| 文档 | 关系 |
|---|---|
| `APPENDIX_A_TYPES.md` | 类型 / 字段名 / enum 值权威；本章 `ProofEnvelopeV2` / `SignatureBlock` / `TrustReceiptSummary` 与之对照，冲突时以 A 为准 |
| `APPENDIX_C_CANONICAL.md` | canonical 序列化 / proofHash / ledgerRoot / Merkle / inclusion proof 算法权威；本章 §3 / §11 与之一致 |
| `APPENDIX_D_PROOF_BUNDLE.md` | `.far-proof` bundle 物理 JSON schema / 三路径详设 / 错误码全表的实现级 SSOT；本章 §4 是其设计态骨架 |
| `01_SOURCE_OF_TRUTH_AND_STATUS.md` | 状态标签 / 禁手填数字 / 路径约定（`<REPOSITORY_ROOT>/`） |
| `02_ARCHITECTURE.md` | ProofEnvelope 是 §2.3 Proof and Verification Layer 的核心对象；`far verify` 是该层 CLI |
| `03_EVIDENCE_CONTRACT_AND_VERDICT.md` | FEC / 五值裁决 / anti-theater 是 `verdict.json` 的语义源；本章是其可转交载体规格 |
| `05_AI4S_PRODUCT_DEMO_AND_BENCHMARK.md` | "Your Laptop Is The Verifier"主线依赖本章 §10 fresh-clone 验真路径；demo 篡改演示须真实改 verdict-critical 字段 |
| `06_ROADMAP_AND_DOD.md` | L4 Rust / Go、L5 WASM、L6 formal spec 进路线图分阶段 |
| `07_RISK_REGISTER_AND_DO_NOT_CLAIM.md` | 禁用词（证明科学真理 / 物理不可篡改 / 完全可复现 / 第三方独立验证裸声称）在本章落地为具体守卫 |

---

## 19. 旧档案溯源与备份位置

> `FINAL_PACKAGE/` 即将被删除。本章已完整并入上述七份详设内容（`51` / `52` / `57` / `69` / `70` / `83`），禁止把"详见 FINAL_PACKAGE/X"作为有效依赖。

| 旧编号 | 物理档案 | 备份位置 | 并入本章位置 |
|---|---|---|---|
| `51` | `FINAL_PACKAGE/51_STREAMING_PROOF_CHAIN_AND_WASM.md` | `C:/Users/RichardYuan/FAR-Lab_Backups/` | §11.2（1e-7 鸿沟）、§11.3（RR-12 删除）、§11.4（WASM 三语言）、§11.6（流式证明链） |
| `52` | `FINAL_PACKAGE/52_REPLAY_TIME_MACHINE.md` | `C:/Users/RichardYuan/FAR-Lab_Backups/` | §12（Replay 时光机 + 续跑 byte-equal 诚实边界） |
| `57` | `FINAL_PACKAGE/57_THIRD_PARTY_VERIFIER_PROTOCOL.md` | `C:/Users/RichardYuan/FAR-Lab_Backups/` | §10（三路径）、§5.4（exit code）、§4.3（integrityHash）、§2.4（RULE-PE-010）、§4.4-§4.5（RO-Crate 合规与独立可重算定义） |
| `69` | `FINAL_PACKAGE/69_INDEPENDENT_RECOMPUTATION_VERIFIER_ARCHITECTURE.md` | `C:/Users/RichardYuan/FAR-Lab_Backups/` | §6（七层分层）、§5.3（分级输出）、§11（canonicalization 与已知边界）、§15（性能 / red-team）、§16（Rust / Go 接口） |
| `70` | `FINAL_PACKAGE/70_PROOF_ENVELOPE_COMPOSABILITY_AND_CLAIM_GRAPH.md` | `C:/Users/RichardYuan/FAR-Lab_Backups/` | §13（节点 / 边 / 传播 / 增量 Merkle / Graph 攻击） |
| `83` | `FINAL_PACKAGE/83_FORMAL_SPECIFICATION_AND_VERDICT_INVARIANTS.md` | `C:/Users/RichardYuan/FAR-Lab_Backups/` | §14（关键不变量 / Tool Mapping / TLA+ / Dafny / V1-V2-V3 形式化范围） |

物理档案已退役（`FINAL_PACKAGE/` 待删除），溯源用途仅作历史来源解释；权威内容以本章与 `APPENDIX_A` / `APPENDIX_C` / `APPENDIX_D` 为准。备份位置：`C:/Users/RichardYuan/FAR-Lab_Backups/`。后续维护引用本章与三附录即可，不再回引旧编号作为有效依赖。

---

> 本章冻结 ProofEnvelope V2、`.far-proof` bundle、`far verify` CLI、独立验证等级 L1-L6、browser verifier 边界、diff report、Trust Receipt、形式化验证路线的实现级口径。任何修改五值 enum、proofHash 白名单、错误码全表、三路径定义或 W2 hard gate 的提议，必须同时修改本章、`APPENDIX_A_TYPES.md`、`APPENDIX_C_CANONICAL.md`、`APPENDIX_D_PROOF_BUNDLE.md`、golden vectors、所有 verifier 与答辩口径——否则不成立。

---

## 融合织入（Open Science 工程范式迁移·DESIGN_PROPOSED·2026-07-05）

> 来源：`FAR_LAB_MASTER_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md` + `FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md` §C 末段。Open Science = Claude Code 分支重品牌化的执行层 agent 工作区；FAR-Chain = 验证层。迁移边界：只迁工程范式（反剧场 / fail-closed 服务门 / 收窄伪造窗口 / 内容寻址 CAS / derivable 标记 / 进程组 kill / AST 结构门），绝不迁 OS 的 LLM-裁决语义。下述条目全 NOT_BUILT，属未来 backlog，不抢当前 next_action。

### 与本文档（04_PROOF_ENVELOPE_AND_VERIFIER）相关的融合缺口

- **FUSION-OS-5**：独立验证器加载期 AST 结构门 —— 禁止顶层 network/IO/LLM call 表达式（用 TS Compiler API 扫描）；Open Science `kernel.py` AST 白名单范式。使验证器自身不可被注入副作用。
- **FUSION-OS-3**：`packageFarProofBundle` 的 seal 写入必须在收割所有工件后最后一步执行，且验证期检测 newer-than-seal 的文件 → 判 stale；Open Science sentinel 重导出在 tar 后 `.phase` 前范式，缩窄伪造窗口。
- **FUSION-OS-6**：LLM 产出的 provenance 字段强制 null，由系统侧 hash 重算绑定；加 `provenanceClass: system-derived|llm-asserted|user-uploaded` 标记 —— Open Science `data_vid=None` + forged marker 注入范式，反剧场红线「来源不可自填」可执行化。

> 接线时升 WIRED_RED，物证由 keystone bot CI 双跑写回 WIRED_GREEN（见 DEPTH_LEDGER §D）。取序建议见 CLAUDE.md §4 P-FUSION。
