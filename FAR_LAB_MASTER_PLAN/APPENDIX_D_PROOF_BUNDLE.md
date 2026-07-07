# 附录 D · `.far-proof` 证据包与第三方重算验证器完整规格

> 权威集中处。本附录以实现级深度吸收 `FINAL_PACKAGE/69`（独立重算 verifier 架构）、`57`（第三方验证器协议）、`51`（流式证明链与 WASM）、`70`（ProofEnvelope 可组合性与 Claim Graph）四份详设，以及 `src/evidence_log/`、`src/proof_envelope/`、`src/far_proof/` 的实际代码接口。冲突时以本附录 + `APPENDIX_A_TYPES.md` + `APPENDIX_C_CANONICAL.md` 为准。
>
> 铁律：本附录描述的是 **tamper-evident / independently re-computable** 的证据包，不声称证明科学结论为真、不声称物理不可篡改、不声称完全可复现。

---

## 0. 范围与诚实边界

| 项 | 本附录覆盖 | 本附录不覆盖 / 不声称 |
|---|---|---|
| `.far-proof` bundle 物理结构 | 完整目录树与每文件 JSON schema | 不声称已通过第三方 RO-Crate/PROV-O 官方校验器（V3 路线图） |
| `far verify` 输出 | 完整输出 JSON schema 与 exit code 语义 | 不把 V1 Node self-check 包装为"第三方独立验证生态已完成" |
| diff report 错误码 | 全表与定位语义 | 不声称所有错误码均已 `IMPLEMENTED_VERIFIED` |
| 第三方重算路径 | CLI / Web Crypto / 离线包三路径详设 | WASM 全验为 V2/V3 路线（增益非依赖） |
| canonicalHash / proofHash | 算法、字段白名单、跨语言一致性策略 | 不声称跨语言 `1e-7` 鸿沟已解决（已知边界，诚实披露） |

**核心口径（贯穿全文）**：`.far-proof` 是 **项目自验证的离线重算包**；导出格式 V1 minimal，RO-Crate/PROV-O 合规化在 V3 路线图。其真正价值是"独立可重算性"——fresh-clone 评委用自己的机器、用项目提供的工具、从原始 claim 重算到 `proofHash` 全程可复现、断网可跑、工具可审计。这 **不依赖** 导出格式是否 RO-Crate 合规。

---

## 1. `.far-proof` bundle 目录树

### 1.1 设计层目录树（`04` §4 P0 结构，权威设计态）

`04_PROOF_ENVELOPE_AND_VERIFIER.md` §4 定义的设计态目录树，是 verifier 的消费契约：

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

### 1.2 实现层目录树（`src/far_proof/exporter.ts` V1 实测）

当前 `exportFarProof()` 实际产出的九分量目录树（代码实测 `src/far_proof/exporter.ts`）：

```text
.far-proof/
├── proof_envelopes.jsonl          # 已 seal 的 ProofEnvelope（每行一条，09 §5）
├── repro_runs.jsonl               # 复现运行记录（每行一条）
├── call_records.redacted.jsonl    # call_records 链（已脱敏：排除 request/response payload）
├── claim_graph.json               # claim 依赖子图（verdict_nodes + evidence_edges，09 §5 + 15 §7）
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

| 差异 | 设计态（`04` §4） | 实现态（`exporter.ts`） | 原因 |
|---|---|---|---|
| 单 claim 包 vs 多 claim 流 | `claim.json` 单文件 | `proof_envelopes.jsonl` 多行 | 实现态一次导出整条运行，支持多 envelope |
| ledger/chain + merkle | `chain.json` + `merkle.json` | `call_records.redacted.jsonl`（链在字段 `prev_hash`/`current_hash`） | V1 用 call_records head hash 桥接 ledgerRoot，原生 Merkle ledger 在 V3 |
| bindings/、runs/、measurements/ | 独立目录 | 暂合并在 `repro_runs.jsonl` | V1 minimal；完整分区为 V2 升级 |
| 新增 OTel / RO-Crate / PROV / claim_graph | 未列 | 已实现（V1 基本格式） | `15_OPEN_SCIENCE_EXPORT.md` 引入的九分量 |

**状态**：设计态目录树 = `DESIGN_LOCKED`（verifier 消费契约，V2 升级目标）；实现态九分量 + `far export far-proof` + 离线 package = `IMPLEMENTED_VERIFIED`（代码与 CLI 已测）。这仍不等于第三方 RO-Crate/PROV-O 校验器认证；外部格式合规路径见 §7.3。

---

## 2. bundle 内每个文件的完整 JSON schema

> 字段名以 `APPENDIX_A_TYPES.md` / `APPENDIX_C_CANONICAL.md` 为权威；本附录与 `src/` 代码（P2）对齐。所有 `*Hash` 字段为小写 64 位 hex（sha256）；所有 ISO 时间戳为 UTC、冻结态（verifier 不调用 `now`）。

### 2.1 `claim.json`

设计态 claim 单文件（`04` §4 + `02` §4 `Claim`）：

```json
{
  "$schema": "urn:far:claim.v1.json",
  "claimId": "C-ASTRO-0001",
  "naturalLanguage": "模型 X 在数据集 D 上对任务 T 的准确率 > 0.72",
  "domain": "astronomy",
  "scope": {
    "dataset": "D",
    "population": "redshift z<1 galaxies",
    "task": "T",
    "limitations": ["仅限 z<1 子集"]
  },
  "author": {
    "actorType": "ai_agent",
    "actorId": "agent-001",
    "humanEndorser": null
  },
  "createdAt": "2026-06-15T08:00:00.000Z"
}
```

字段约束：

| 字段 | 类型 | 必填 | 进 proofHash | 说明 |
|---|---|---|---|---|
| `claimId` | string | 是 | 是 | ULID 或 `C-<DOMAIN>-<NNNN>`；空串触发 `RULE-PE-001` FAIL |
| `naturalLanguage` | string | 是 | 否（normalized 文本进） | 原文展示用；进 hash 的是 normalized 版本 |
| `domain` | string | 是 | 是 | 受控词表 |
| `scope` | ScopeSpec | 是 | 是 | scope 未定义触发 `SCOPE_UNBOUNDED` |
| `author` | ActorRef | 是 | 是 | LLM 产出须标 `actorType: "ai_agent"` + `humanEndorser` |
| `createdAt` | string (ISO-8601) | 是 | 否 | 创建时间，非 seal 时间 |

### 2.2 `fec.json`

设计态 FEC 单文件（`03` §1 `FecContract` + `src/falsifiability/contracts.ts` V1 子集）：

```json
{
  "$schema": "urn:far:fec.v1.json",
  "fecId": "01H...",
  "claimId": "C-ASTRO-0001",
  "measurableImplication": "准确率在测试集上的 95% CI 下界 > 0.72",
  "metric": "accuracy",
  "comparator": "gt",
  "thresholdValue": 0.72,
  "alpha": 0.0125,
  "seed": 42,
  "bonferroniApplied": true,
  "population": "redshift z<1 galaxies",
  "effectSizeExpected": 0.3,
  "powerAnalysisN": 1000,
  "compiledBy": "deterministic_compiler",
  "compiledAt": "2026-06-15T08:01:00.000Z",
  "locked": true,
  "preregistrationHash": "a1b2c3...(64 hex)",
  "createdAt": "2026-06-15T08:01:00.000Z"
}
```

**V1 实现态（`contracts.ts` 实测字段）**：`contractId` / `claimId` / `preregistrationHash` / `measurableImplication` / `metric` / `comparator`（`gt|lt|eq|range`）/ `thresholdValue` / `alpha`（默认 0.0125）/ `seed`（默认 42）/ `bonferroniApplied`（默认 true）/ `population`（默认 `"unknown"`）/ `effectSizeExpected` / `powerAnalysisN` / `compiledBy`（恒 `"deterministic_compiler"`，禁 LLM）/ `compiledAt` / `locked`（恒 `true`）/ `createdAt`。

`preregistrationHash` 计算伪代码（反 p-hacking，F8）：

```text
preregistrationHash = sha256(canonicalJson({
  contractId, claimId, measurableImplication, metric, comparator,
  thresholdValue, alpha, seed, bonferroniApplied, population,
  compiledBy: "deterministic_compiler", compiledAt
}))
# canonicalJson = fast-json-stable-stringify（排序 key + 拒 NaN/Infinity + 拒 undefined）
```

### 2.3 `bindings/datasets.json`

设计态（`03` §3.1 `DatasetBinding`）：

```json
{
  "datasets": [
    {
      "datasetId": "D-001",
      "contentHash": "64hex",
      "schemaHash": "64hex",
      "rowCount": 10000,
      "columnFingerprint": "64hex",
      "statsFingerprint": "64hex",
      "sourceUri": "<WORKSPACE_ROOT>/data/d.parquet",
      "retrievalTimestamp": "2026-06-15T07:00:00.000Z",
      "license": "CC-BY-4.0",
      "consentOrPrivacyTag": "public-research",
      "scopeCoverage": {
        "population": "redshift z<1 galaxies",
        "coverageFraction": 0.85,
        "degradationNotes": []
      }
    }
  ]
}
```

| 字段 | 进 hash | 触发降级的条件 |
|---|---|---|
| `contentHash` | 是 | 与重算不符 → `DATASET_HASH_MISMATCH` |
| `schemaHash` | 是 | schema 变更 → `DATASET_HASH_MISMATCH` |
| `statsFingerprint` | 是 | 统计指纹漂移 → `DATASET_HASH_MISMATCH` 或 `DEGRADED_SCOPE` |
| `scopeCoverage.coverageFraction < 1.0` | 是 | → verdict 降级为 `DEGRADED_SCOPE` |
| `sourceUri` | 否（脱敏后） | 必须归一化为 `<WORKSPACE_ROOT>/` 前缀 |

### 2.4 `bindings/workflows.json`

设计态（`03` §3.2 `WorkflowBinding`）：

```json
{
  "workflows": [
    {
      "workflowId": "W-001",
      "workflowHash": "64hex",
      "engine": "script",
      "containerDigest": "sha256:...",
      "environmentHash": "64hex",
      "commandHash": "64hex",
      "seedPolicy": { "kind": "fixed", "value": 42 },
      "networkPolicy": "off"
    }
  ]
}
```

`networkPolicy` 取值：`off` / `allowlist` / `unrestricted-with-warning`。Production 默认 `off` 或显式声明；`off` 是 proofHash 友好态。

### 2.5 `runs/run-*.json`

设计态（`03` §3.3 `ExperimentRunBinding`）：

```json
{
  "runId": "R-001",
  "startedAt": "2026-06-15T08:05:00.000Z",
  "endedAt": "2026-06-15T08:30:00.000Z",
  "actor": { "actorType": "deterministic_runner", "actorId": "runner-001" },
  "inputHashes": ["64hex", "64hex"],
  "outputHashes": ["64hex"],
  "logHashes": ["64hex"],
  "exitCode": 0,
  "resourceProfile": { "vcpu": 4, "memoryMb": 8192 },
  "deviations": []
}
```

`deviations` 非空 → 进 verdict 决策（`criticalProtocolDeviation` → `UNTESTED`）。

### 2.6 `measurements/result-*.json`

设计态（`02` §4 `MeasurementResult`）：

```json
{
  "measurementId": "M-001",
  "runId": "R-001",
  "metricValues": { "accuracy": 0.745, "nll": 0.51 },
  "rawArtifactHashes": ["64hex"],
  "runEnvironment": {
    "nodeVersion": "v20.11.0",
    "pythonVersion": "3.11.7",
    "gitCommitSha": "64hex(40)",
    "envHash": "64hex"
  },
  "stderrHash": "64hex",
  "stdoutHash": "64hex"
}
```

`rawArtifactHashes` 缺失 → `UNTESTED`（`03` §8 anti-theater：missing raw artifact）。

### 2.7 `verdict.json`

设计态（`03` §7 `VerdictKernelOutput`）：

```json
{
  "verdict": "CONFIRMED",
  "reasonCodes": ["EVIDENCE_SUFFICIENT", "STATS_SUPPORTS", "SCOPE_FULL"],
  "ruleTrace": [
    { "ruleId": "V-001", "ruleName": "fec_compilable_check", "outcome": "PASS" },
    { "ruleId": "V-005", "ruleName": "scope_evaluation", "outcome": "PASS", "detail": "coverage=1.0" },
    { "ruleId": "V-008", "ruleName": "stats_supports", "outcome": "PASS" }
  ],
  "evidenceSufficiency": { "sufficient": true, "missing": [] },
  "scopeReport": { "isDegraded": false, "coverageFraction": 1.0 },
  "statisticalReport": {
    "effectSize": 0.31,
    "pValue": 0.003,
    "confidenceInterval": [0.73, 0.76],
    "power": 0.92,
    "multipleTestingCorrection": "bonferroni",
    "assumptions": { "normalityMet": true }
  },
  "inputHashes": ["64hex", "64hex"]
}
```

**五值裁决 enum（固定，禁止第六值）**：

```ts
type VerdictKind =
  | "CONFIRMED"
  | "REFUTED"
  | "INCONCLUSIVE"
  | "DEGRADED_SCOPE"
  | "UNTESTED";
```

裁决优先级（`03` §6）：`DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED`。

deterministic verdict kernel 伪代码（`03` §7）：

```text
function decideFiveValueVerdict(input):
  if not isFrozenAndCompilable(input.fec): return untested("FEC_NOT_READY")
  if missingRequiredEvidence(input):        return untested("EVIDENCE_MISSING")
  if criticalProtocolDeviation(input):      return untested("CRITICAL_DEVIATION")
  scope  = evaluateScope(input)
  stats  = evaluateStatistics(input)
  theater = evaluateAntiTheater(input)
  if scope.isDegraded:              return degraded("SCOPE_DEGRADED", scope)
  if theater.hasFail:               return inconclusiveOrUntested(theater)
  if stats.refutes:                 return refuted(stats)
  if stats.conflicting or underpowered: return inconclusive(stats)
  if stats.supports:                return confirmed(stats)
  return untested("NO_DECISION_PATH")
# LLM 不得进入此内核（C 级红线）；LLM 输出仅作 advisory
```

### 2.8 `proof-envelope.json`

> 注意：设计态字段名是 `ProofEnvelopeV2`（`04` §2，V2 目标态）；V1 实现态字段名是 `ProofEnvelope`（`src/proof_envelope/types.ts`，字段名 `conclusion` 而非 `verdict`，命名裁剪非语义偏离，枚举值集与五值完全一致）。两者并存于本附录，冲突时 V1 实现态以代码 P2 为准。

#### 2.8.1 V1 实现态 ProofEnvelope（`src/proof_envelope/types.ts` 实测）

> ⚠️ **`conclusion` 字段语义声明（防误读为第六值）**：V1 `conclusion` 仅为导出兼容字段，枚举值**严格映射** V2 `verdictTrace.verdict` 的五值（`CONFIRMED`/`REFUTED`/`INCONCLUSIVE`/`DEGRADED_SCOPE`/`UNTESTED`），**禁止第六值**。V2 升级后此字段 `deprecated`，新代码必须改用 `verdictTrace.verdict`（`04` §2 ProofEnvelopeV2 为权威目标态）。字段名裁剪（TS 用 `conclusion` 而非 `verdict`）属命名差异，非语义偏离。

```json
{
  "envelopeId": "01H...",
  "claimId": "C-ASTRO-0001",
  "verdictNodeId": "VN-001",
  "conclusion": "CONFIRMED",
  "proofHash": "64hex(self-excluding)",
  "prevProofHash": "64hex(or GENESIS_PROOF_HASH=0*64)",
  "checks": [
    { "ruleId": "RULE-PE-001", "ruleName": "claim_non_empty", "outcome": "PASS", "detail": "claimId is non-empty" },
    { "ruleId": "RULE-PE-002", "ruleName": "verdict_node_exists", "outcome": "PASS", "detail": "verdictNodeId is non-empty" },
    { "ruleId": "RULE-PE-003", "ruleName": "falsification_spec_present", "outcome": "PASS", "detail": "..." },
    { "ruleId": "RULE-PE-004", "ruleName": "source_anchor_present", "outcome": "PASS", "detail": "..." },
    { "ruleId": "RULE-PE-005", "ruleName": "repro_hash_present", "outcome": "PASS", "detail": "reproHash is 64 hex chars" },
    { "ruleId": "RULE-PE-006", "ruleName": "prev_proof_hash_valid", "outcome": "PASS", "detail": "..." },
    { "ruleId": "RULE-PE-007", "ruleName": "conclusion_matches_checks", "outcome": "PASS", "detail": "..." },
    { "ruleId": "RULE-PE-008", "ruleName": "sealed_by_deterministic", "outcome": "PASS", "detail": "..." },
    { "ruleId": "RULE-PE-009", "ruleName": "known_failures_not_hidden", "outcome": "PASS", "detail": "..." }
  ],
  "knownFailures": [],
  "falsificationSpec": {
    "prediction": "准确率 > 0.72",
    "metric": "accuracy",
    "falsificationThreshold": 0.72,
    "thresholdSemantics": "lower_bound"
  },
  "sourceAnchor": {
    "gitCommitSha": "40hex",
    "dashscopeRequestId": null,
    "isoTimestamp": "2026-06-15T08:30:00.000Z",
    "rawResponseHash": "64hex"
  },
  "reproHash": "64hex(七分量)",
  "sealedBy": "deterministic_sealer",
  "sealedAt": "2026-06-15T08:31:00.000Z",
  "createdAt": "2026-06-15T08:30:00.000Z"
}
```

V1 字段表（实测代码）：

| 字段 | 类型 | 进 proofHash | 说明 |
|---|---|---|---|
| `envelopeId` | string (ULID) | 是 | seal 时生成 |
| `claimId` | string | 是 | 非空（RULE-PE-001） |
| `verdictNodeId` | string | 是 | 非空（RULE-PE-002） |
| `conclusion` | Verdict（5 值，禁第六值） | 是 | 字段名裁剪：TS 用 `conclusion`，语义同 `verdict`；严格映射 V2 `verdictTrace.verdict` 五值，V2 升级后 `deprecated`，新代码须用 `verdictTrace.verdict` |
| `proofHash` | 64hex | 否（self-excluding） | sha256(canonical(其余字段)) |
| `prevProofHash` | 64hex | 是 | 64 位 hex 校验（RULE-PE-006），genesis = `"0".repeat(64)` |
| `checks` | ProofCheckResult[] | 是（排序后） | 9 条规则逐条结果 |
| `knownFailures` | string[] | 是（排序后） | 透明披露已知失败 |
| `falsificationSpec` | FalsificationSpec | 是 | prediction+metric 非空（RULE-PE-003） |
| `sourceAnchor` | SourceAnchor | 是 | gitCommitSha 非空（RULE-PE-004） |
| `reproHash` | 64hex | 是 | 长度=64（RULE-PE-005） |
| `sealedBy` | `"deterministic_sealer"` | 是 | 恒定（禁 LLM，RULE-PE-008 三重保证） |
| `sealedAt` | ISO-8601 | 是 | seal 时间（冻结） |
| `createdAt` | ISO-8601 | 是 | 创建时间 |

`GENESIS_PROOF_HASH = "0".repeat(64)`（链首桥接，`types.ts` 实测）。

#### 2.8.2 V2 目标态 ProofEnvelopeV2（`04` §2）

V2 在 V1 基础上补全 `fecSnapshot` / `protocolFreeze` / `datasetBindings` / `workflowBindings` / `experimentRuns` / `measurementResults` / `statisticalResults` / `verdictTrace` / `antiTheaterReport` / `ledgerRoot` 等完整证据嵌入字段。状态：`DESIGN_LOCKED`（`04` §2 为权威，V2 升级目标）。

### 2.9 `ledger/chain.json` 与 `ledger/merkle.json`

#### 2.9.1 V1 实现态：`call_records.redacted.jsonl`（链在字段中）

V1 的"链"物理形态是 JSONL，每行一个 `call_record`，链由 `prev_hash` → `current_hash` 串联：

```json
{
  "seq": 1,
  "stage_id": "scii_claim_gen",
  "payload_kind": "llm_response",
  "purpose_tag": "claim_draft",
  "model_id": "model-x",
  "dashscope_request_id": "req-...",
  "repro_hash": "64hex",
  "git_commit_sha": "40hex",
  "iso_timestamp": "2026-06-15T08:00:00.000Z",
  "finish_reason": "stop",
  "usage_tokens_total": 1200,
  "prev_hash": "0...0(genesis) 或上一条 current_hash",
  "current_hash": "64hex",
  "created_at": "2026-06-15T08:00:00.000Z"
}
```

> `request_payload` / `response_payload` / `response_payload_hash` / `degraded_from` **已脱敏排除**（防 API key 泄露）。

`canonicalHash`（L0 冻结算法，`src/evidence_log/hasher.ts` 实测）：

```text
canonicalHash(input) = sha256(stableStringify({
  stageId,       # 4 字段白名单之一
  cred,          # ProviderNeutralCredential: {modelId, dashscopeRequestId, reproHash, gitCommitSha, isoTimestamp}
  payloadKind,   # 枚举
  prevHash       # 必填，genesis = "0".repeat(64)
}))
# 关键：仅 4 字段白名单（stageId/cred/payloadKind/prevHash）进 hash
# 数值永不进白名单 → 1e-7 鸿沟与信任根字节相等正交
# 拒 NaN/Infinity；GENESIS_PREV_HASH = "0".repeat(64)
```

**Domain Separation（V2 新对象启用，`69` §4）**：

```ts
type HashDomain =
  | 'far.call_record.v1'   // 现有 call_records，保持不变
  | 'far.fec.v2'
  | 'far.dataset_binding.v1'
  | 'far.workflow_binding.v1'
  | 'far.verdict_trace.v1'
  | 'far.proof_envelope.v2'
  | 'far.claim_graph.v1';
```

规则：V2 新对象 canonical hash 输入必须含 `hashDomain`，防不同对象同形 JSON 语义混淆。V1 hash 保持不改。

#### 2.9.2 `chain.json`（设计态，V2 目标）

```json
{
  "schemaVersion": "far.chain.v1",
  "genesisHash": "0...0",
  "headHash": "64hex(最后一条 current_hash)",
  "recordCount": 125,
  "records": [ { "seq": 1, "prevHash": "...", "currentHash": "...", "domain": "far.call_record.v1" } ]
}
```

#### 2.9.3 `merkle.json`（设计态，V3 路线）

```json
{
  "schemaVersion": "far.merkle.v1",
  "leafCount": 125,
  "root": "64hex",
  "algorithm": "sha256-binary-tree",
  "leafHashes": ["64hex"]
}
```

状态：V1 无原生 Merkle ledger（migration 0022 = V3）；V1 用 call_records head hash 桥接 `ledgerRoot`（`types.ts` 注释自述）。Merkle 全树 = `ROADMAP`。

### 2.10 `README_RECEIPT.md`（Trust Receipt）

设计态（`04` §9）。`exporter.ts` 实际产出 `README_REPLAY.md`（含 fresh-clone 重放手册 + hash 验证状态 + 已知限制 + 诚实声明）。

Trust Receipt 内容字段：claim、verdict、evidence scope、proofHash、verifier command、tamper status、limitations、required next action。

中文口径模板（`04` §9，权威）：

```text
该声明在冻结的 FEC 与当前证据范围内得到 CONFIRMED。
这不是终局科学真理证书，而是该证据包满足既定可证伪契约、
且可被独立重算的信任收据。
```

英文口径模板：

```text
This claim is CONFIRMED under the frozen FEC for dataset scope X,
with proofHash Y. The receipt does not certify universal scientific truth.
It certifies that the sealed evidence package satisfies the stated contract
and can be independently recomputed.
```

---

## 3. 打包要求（强制护栏）

### 3.1 内容安全

| 要求 | 实现 | 验证点 |
|---|---|---|
| 不含密钥 | `call_records.redacted.jsonl` 排除 `request_payload`/`response_payload` | grep `sk-`/`api_key`/token 模式 |
| 不含真实 PII 路径 | 本地绝对路径归一化为 `<WORKSPACE_ROOT>/` 前缀 | path leak attack 红队（`69` §10） |
| 所有引用文件有 hash | `contentHash`/`schemaHash`/`statsFingerprint`/`rawArtifactHashes`/`envHash`/`gitCommitSha` | 缺则 `MISSING_HASH` |
| 缺文件给结构化错误 | verifier 返回 diff report 错误码（§5） | 非 vague crash |
| Windows/空格/离线可运行 | 路径用 forward slash + 引号包裹；零网络依赖 | Windows-first demo path（`69` §8） |

### 3.2 Windows-first demo path（`69` §8）

- **Zero network mode**：bundle 含 Node script、Python package、standalone browser `verify.html`，断网可跑。
- **No native build requirement** for judge path：评委机器无需编译原生模块。
- **Plan B/C**：若 Python 缺失，browser + Node 仍可演示 tamper-evident proof；Python 是 packaged fallback。
- **本地路径归一化**：所有展示路径渲染为 `<WORKSPACE_ROOT>/...`。

### 3.3 bundle integrityHash（防自指）

`57` §3.4：离线包 `integrityHash` = 所有文件 sha256 的聚合，**不含自身**（防自指）。当前实现见 `src/far_proof/offline_package.ts`，计算口径为 `sha256(sorted("path sha256" entries).join("\n"))`，排除 `integrity.json` 自身：

```text
integrityHash = sha256(sorted([path + " " + sha256(file) for file in bundle if file != "integrity.json"]).join("\n"))
# integrity.json 文件自身的 hash 不纳入（防 self-reference）
# 验收：demo_chain_replay.test.ts 验证完整性、篡改检测与 tar.zst 解包后 verify.sh 实跑
```

---

## 4. `far verify` 输出 JSON schema（完整）

### 4.1 设计态 P0 输出（`04` §5，权威）

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
| `verdict` | Verdict | 5 值之一 | envelope 内 conclusion |
| `proofHash` | 64hex | 重算值 | 须与 envelope 内一致 |
| `ledgerRoot` | 64hex | 重算值 | call_records head hash（V1）/ Merkle root（V3） |
| `tamperStatus` | enum | `clean` / `tampered` / `unknown` | 篡改检测 |
| `scopeStatus` | enum | `full` / `degraded` / `unknown` | scope 覆盖 |
| `recomputation.node` | enum | `pass` / `fail` / `not-run` | Node 重算 |
| `recomputation.python` | enum | `pass` / `fail` / `not-run` | Python 独立重算 |
| `recomputation.browser` | enum | `pass` / `fail` / `not-run` | Browser Web Crypto 重算 |
| `errors` | ErrorEntry[] | 错误码列表 | 见 §5 |
| `warnings` | string[] | 非阻断警告 | 如跨语言数值边界已知限制 |

### 4.2 分级输出（`69` §5，`far verify --mode`）

```bash
far verify --bundle .far-proof --mode full          # 全链路
far verify --bundle .far-proof --mode chain         # 仅 call_records 链
far verify --bundle .far-proof --mode envelope      # 仅 proofHash 重算
far verify --db far.sqlite --chain-only             # 直接验 DB
far verify --envelope proof_envelopes.jsonl --proof-hash
far verify --vectors golden_vectors.json --lang node
far verify --claim B7 --full-trace                  # 单 claim 全链重算
```

分级 JSON 输出（`69` §5）：

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

`verifiedLevels` 取值：`chain` / `merkle` / `proofEnvelope` / `verdictTrace` / `claimGraph`（`69` §2 L0-L6 分层）。`brokenAt` = 断裂的 seq 或 null。

### 4.3 CLI exit code 语义（`57` §3.1，权威）

| exit code | 含义 |
|---|---|
| `0` | 全链重算匹配（PASS） |
| `7` | repro 不匹配（FAIL，篡改或漂移，`04` §22 既有语义） |
| 非 0 非 7 | 运行时错误（缺文件、schema 不支持等） |

### 4.4 单 claim 全链重算语义（`57` §3.1）

```text
claim (B7)
  → SciIR 节点          [评委重算 canonicalHash]
  → falsification_spec  [评委重算]
  → reproHash (七分量)  [评委重算]
  → verdict (5 值)      [评委跑 verdict_mapping 决策树]
  → ProofEnvelope       [评委重算 objectHash/proofHash]
  → .far-proof          [评委比对]
全部匹配 → exit 0；任一不符 → exit 7
```

---

## 5. Diff Report 错误码全表

### 5.1 错误码全表（`04` §8 权威 + 扩展）

| 错误码 | 触发条件 | 定位说明（diff report 输出） | 关联 verifier 层级 |
|---|---|---|---|
| `PROOF_HASH_MISMATCH` | envelope 内 `proofHash` 与重算值不符 | 输出：哪个 canonical field 变化（expected vs actual 的 field diff） | L4 ProofEnvelope proofHash |
| `LEDGER_ROOT_MISMATCH` | call_records 链断裂（`prev_hash` 不连续或 `current_hash` 重算不符） | 输出：哪条 record 或 seq 断裂（`brokenAtSeq` + `expectedHash` + `actualHash`） | L2 chain verifier |
| `FEC_HASH_MISMATCH` | FEC 被替换（`preregistrationHash` 或 `fecHash` 不符） | 输出：FEC 哪个字段变化（measurableImplication/metric/threshold/alpha/seed） | L5 verdict trace |
| `DATASET_HASH_MISMATCH` | 数据内容（`contentHash`）、schema（`schemaHash`）或 stats（`statsFingerprint`）变化 | 输出：哪个 hash 字段变化 + 是否触发 `DEGRADED_SCOPE` | L5 verdict trace |
| `VERDICT_TRACE_MISMATCH` | verdict kind 或 reason code 被改，或 rule trace 重算不符 | 输出：verdict 值差异 或 哪条 ruleId 的 outcome 变化 | L5 FEC/verdict trace |
| `UNSUPPORTED_SCHEMA_VERSION` | envelope `schemaVersion` 不在 verifier 支持列表 | 输出：unsupported version X，supported=[...] | L0（前置门） |

### 5.2 扩展错误码（实现态补充）

| 错误码 | 触发条件 | 定位说明 |
|---|---|---|
| `MISSING_REQUIRED_FILE` | bundle 缺 `04` §4 P0 必需文件 | 输出：缺哪个文件（claim.json/fec.json/verdict.json/proof-envelope.json） |
| `MISSING_HASH` | 引用文件无对应 hash 字段 | 输出：哪个引用缺 hash（如 measurement 缺 rawArtifactHashes） |
| `REDUNDANT_PATH_LEAK` | bundle 内出现未归一化的绝对路径 | 输出：哪个字段含 leak（path leak attack 防御） |
| `RULE_PE_VIOLATION` | ProofEnvelope Validator 9/10 规则有 FAIL/WARN | 输出：哪条 `RULE-PE-00X` 失败 + detail |
| `ANTITHEATER_FAIL` | WARN/FAIL check 存在但 conclusion=`CONFIRMED` | 输出：触发 RULE-PE-007（`hasAntiTheaterViolation`） |
| `CHAIN_EMPTY` | call_records 为空（无 genesis 后续） | 输出：recordCount=0 |
| `ENV_HASH_MISMATCH` | fresh-clone 重放时 `envHash` 不符 | 输出：expected vs actual envHash（`57` §5.4 fresh-clone lock） |
| `COMMIT_SHA_MISMATCH` | fresh-clone 重放时 `gitCommitSha` 与 HEAD 不符 | 输出：expected commit vs HEAD（code snapshot lock） |

### 5.3 错误码定位输出格式

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

## 6. ProofEnvelope Validator 规则全表

### 6.1 现有 9 条规则（`src/proof_envelope/validator.ts` 实测，`IMPLEMENTED_VERIFIED`）

| Rule ID | 名称 | 检查逻辑 | FAIL 条件 | WARN 条件 |
|---|---|---|---|---|
| `RULE-PE-001` | `claim_non_empty` | `claimId.trim()` 非空 | claimId 为空 | — |
| `RULE-PE-002` | `verdict_node_exists` | `verdictNodeId.trim()` 非空 | verdictNodeId 为空 | — |
| `RULE-PE-003` | `falsification_spec_present` | `prediction`+`metric` 非空 | prediction 或 metric 为空 | — |
| `RULE-PE-004` | `source_anchor_present` | `gitCommitSha`+`rawResponseHash` 非空 | gitCommitSha 为空 | rawResponseHash 为空（offline replay?） |
| `RULE-PE-005` | `repro_hash_present` | `reproHash.length === 64` | 长度 ≠ 64 | — |
| `RULE-PE-006` | `prev_proof_hash_valid` | 长度=64 且匹配 `/^[0-9a-f]{64}$/` | 长度错或非 hex | — |
| `RULE-PE-007` | `conclusion_matches_checks` | 无 WARN/FAIL check 时 conclusion 可 CONFIRMED | WARN/FAIL 存在但 conclusion=CONFIRMED（反 theater F1） | WARN/FAIL 存在且 conclusion≠CONFIRMED（正确降级） |
| `RULE-PE-008` | `sealed_by_deterministic` | sealedBy 恒 `"deterministic_sealer"`（TS 类型+DB CHECK+sealer 硬编码三重保证） | V1 违反路径不存在，规则恒 PASS | — |
| `RULE-PE-009` | `known_failures_not_hidden` | knownFailures 透明披露 | — | knownFailures 含空串；或 knownFailures 非空但 conclusion=CONFIRMED |

`CheckOutcome` enum：`PASS` / `WARN` / `FAIL` / `SKIP`（`types.ts`）。

### 6.2 新增 RULE-PE-010（独立可重算性，`57` §3.3，`IMPLEMENTED_VERIFIED`）

> 协议变更已落地为 V2 validator 第 10 条。它仍是 FI-9 新增协议规则，非"既有规则测试"；当前证据为 TS self-check、Python 跨语言对拍、Browser Web Crypto 重算与离线包脚本路径。

| Rule ID | 名称 | 检查逻辑 | FAIL 条件 |
|---|---|---|---|
| `RULE-PE-010` | `independently_recomputable` | ProofEnvelope 必须可被一条不依赖项目 CI 的路径（CLI/Web Crypto/离线包）从原始 claim 重算到 `proofHash` 匹配 | 重算不符 |

**实现状态**：全 10 条逐条测试已注册（`validator.10-rules-coverage.test.ts`），RULE-PE-010 篡改 proofHash 会 FAIL；ProofEnvelope 是信任根对外接口，规则逻辑不得 day-1 才验证（诚实红线）。

### 6.3 `proofHash` 计算（self-excluding，`src/proof_envelope/proof_hash.ts` 实测）

```text
computeProofHash(envelope):
  fieldsForHash = envelope - proofHash     # self-excluding
  sortedChecks  = sort(fieldsForHash.checks,    by (ruleId, outcome))
  sortedFailures = sort(fieldsForHash.knownFailures, lexicographic)
  canonical = stableStringify({ ...rest, checks: sortedChecks, knownFailures: sortedFailures })
  return sha256(canonical)

verifyProofHash(envelope):
  return computeProofHash(envelope without proofHash) === envelope.proofHash
```

**跨语言对齐（V1 已实现 TS 自洽；跨语言 byte-equal 待 V2 Python 镜像）**：

| 设置 | TS | Python（V2 镜像须对齐） |
|---|---|---|
| separators | 无空格（`fast-json-stable-stringify` 默认） | `separators=(',', ':')` |
| sort_keys | 一致排序 | `sort_keys=True` |
| ensure_ascii | UTF-8 直传 | `ensure_ascii=False` |
| Unicode | 不做 ASCII escape | 不做 ASCII escape |

---

## 7. 第三方独立验证路径（FI-9，三路径详设）

### 7.1 三条独立路径（`57` §4，redundancy · 任一可证）

| 路径 | 工具 | 断网 | 适合谁 | 状态 |
|---|---|---|---|---|
| CLI | `far verify` | 是 | 命令行评委/复现者 | `IMPLEMENTED_VERIFIED`（envelope/chain/full + V1 minimal `--bundle` 自验证；V1 bundle 输出 WARN 披露非 RO-Crate/PROV-O 认证） |
| CLI export | `far export far-proof` | 是 | 需要从 demo chain 或已有 DB 生成证据包的评委/复现者 | `IMPLEMENTED_VERIFIED`（`--demo-chain` / `--db`；`--package` 生成 `verify.sh` + `integrity.json` + `.tar.zst`；V1 minimal 边界不变） |
| Web Crypto | `verify.html`（standalone） | 是 | 浏览器评委/非技术背景 | `frontend/src/lib/merkle.ts` + `frontend/public/verify.html` ProofEnvelope V2 proofHash verifier `IMPLEMENTED_VERIFIED` |
| 离线包 | `.far-proof.tar.zst` + `verify.sh` + `integrity.json` | 是 | 想拿走证据信的评委 | V1 minimal 自验证包 `IMPLEMENTED_VERIFIED`；输出 WARN 披露非 RO-Crate/PROV-O 认证 |

### 7.2 "独立可重算"精确定义（`57` §2.2，防 overclaim）

**"第三方独立验证"精确指**：

1. fresh-clone 评委用自己的机器，无项目成员协助，跑通验证。
2. 从原始 claim 到 proofHash 全链重算——不是"信任项目给的 hash"，而是"自己重算出来比对"。
3. 断网可跑——纯本地，不依赖项目服务端存活、不依赖云凭证。
4. 工具可审计——验证器源码可读、可被替换（极端情况评委可用自己写的 hash 实现重算）。

**"第三方独立验证"绝不指**：

1. 导出格式已通过 IETF / RO-Crate 官方认证（路径 A 目标，未完成前不声称）。
2. 证明科学结论为真（守 C9）。
3. 项目团队代替评委验真（那就还是自验证）。

### 7.3 RO-Crate 合规两条路径（`57` §2.1，二选一须显式声明）

| 路径 | 内容 | 触发条件 | 诚实措辞 |
|---|---|---|---|
| **路径 A（满血目标·真合规）** | 交付前让 `exporter.ts` 真正通过 ≥1 个独立开源 RO-Crate 校验器（如 `ro-crate-validator`/`ro-crate-py`）+ PROV-O 校验，把校验日志作为证据进 CI | **必做** | "`.far-proof` 通过独立 RO-Crate/PROV-O 校验器（附日志）"——可称"第三方独立验证" |
| **路径 B（诚实兜底）** | 不改 exporter，但措辞严格降级 | 仅当独立校验器与 V1 minimal 格式规范不兼容（外部技术依赖）时触发 | "`.far-proof` 是项目自验证的离线重算包（导出格式 V1 minimal，RO-Crate 合规化在 V3 路线图）"——**禁用"第三方独立验证"措辞** |

> `exporter.ts` 实测原文自声明："This export does NOT pass third-party RO-Crate or PROV-O validators (V3 roadmap)" + "RO-Crate metadata (V1 minimal, not validator-compliant)"。未过合规前，禁止把 `.far-proof` 包装为"第三方独立验证路径"。

### 7.4 W2 hard gate（`57` §6，验收门）

- 全 10 条 Validator 规则测试绿。
- 一名**非项目成员** fresh-clone 后按《10 分钟复算手册》实跑 exit 0（须留截图/录屏）。
- 三条独立路径（CLI / Web Crypto / 离线包）本机验证路径全部 exit 0；非项目成员 fresh-clone 留证仍单列。
- §2 路径 A 或 B 已显式选定并落实。
- 全 PDF / README / pitch 零"第三方独立验证"裸声称（须配 §7.2 精确定义）。

---

## 8. 独立重算 Verifier 分层架构（`69` §2）

### 8.1 七层 verifier 分层

```text
Level 0: hash primitive vectors           （sha256/stable-stringify 基元）
Level 1: canonical JSON vectors           （排序/unicode/numeric 边界）
Level 2: call_records chain verifier      （prev_hash→current_hash 连续性）
Level 3: Merkle root/proof verifier       （inclusion proof）
Level 4: ProofEnvelope proofHash verifier （self-excluding 重算）
Level 5: FEC/statistical verdict rule trace verifier （五值裁决内核重算）
Level 6: claim graph propagation verifier （依赖传播·70 §3）
```

交付节奏：V1 = L0-L4；V2 硬化 = Rust/Go L0-L4 + L5；V3 = WASM + formal spec + reproducibility bundle。

### 8.2 各实现路径当前状态（`69` §1 + 代码实测）

| 路径 | 当前能力 | 状态 |
|---|---|---|
| Node TS | `verifyChainHead()`（`src/evidence_log/verifier.ts`）；`computeProofHash()`/`verifyProofHash()`；`validateProofEnvelope()` 9 规则；TS script + `far verify --bundle` 可重算 `.far-proof` proofHash | `IMPLEMENTED_VERIFIED`（链+proofHash+CLI bundle） |
| Python | SQLite/JSON chain verifier；Merkle verifier；`canonical_json.py`；ProofEnvelope V2 `proof_hash.py`（`repro/far_chain_repro/`） | `IMPLEMENTED_VERIFIED`（chain/Merkle + V2 proofHash；browser 仍待补） |
| Browser | `frontend/src/lib/merkle.ts`（Merkle/Suite）+ `frontend/public/verify.html`（standalone ProofEnvelope V2 proofHash，Web Crypto） | `IMPLEMENTED_VERIFIED`；边界：非第三语言实现，不验证 raw evidence / 外部 RO-Crate |
| Rust | 无 | `ROADMAP`（V2） |
| Go | 无 | `ROADMAP`（V2） |
| WASM | 无完整 verifier | `ROADMAP`（V3，`packages/wasm-verifier/`） |
| CLI | `far status` + `far verify` | `IMPLEMENTED_VERIFIED`（status SSOT；verify envelope/chain/full/bundle） |

> 诚实口径：当前 Node/Python 异语言链路 + Browser 独立环境 Merkle/Suite 重算；Browser **不是**第三种跨语言 ProofEnvelope verifier。V2 补 Rust/Go/ProofEnvelope，V3 补 WASM/formal spec。不把设计规划伪装成已实现。

### 8.3 Canonicalization Policy（`69` §3）

| 主题 | 策略 |
|---|---|
| JSON key order | lexicographic sort |
| whitespace | none |
| unicode | UTF-8, no ASCII escaping mismatch |
| floats | V1 已知 `1e-7` 科学计数法鸿沟暴露（详见 §9）；V2 JCS/RFC 8785 policy decision |
| NaN/Infinity | reject（`hasher.ts` `assertNoNonFiniteNumber` 实测） |
| time | ISO timestamp 已冻结；verifier 不调用 `now` |
| locale | no locale-sensitive formatting（locale attack 防御） |
| path | 归一化为 `<WORKSPACE_ROOT>` 后再 hash（path 非 semantic 时） |

### 8.4 Golden / Mutation Vectors（`69` §7）

| Suite | 内容 |
|---|---|
| `canonical_json_vectors` | strings, unicode, arrays, objects, numeric boundaries, rejects |
| `chain_vectors` | valid chain, broken prev, broken current |
| `merkle_vectors` | odd leaves, proof direction, tamper leaf |
| `proof_envelope_vectors` | valid, tampered proofHash, reordered checks |
| `fec_vectors` | alpha changed, stopping rule changed |
| `verdict_trace_vectors` | 全五值（CONFIRMED/REFUTED/INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED） |

Mutation vectors 必须含 expected `brokenAtSeq` 或 failing rule id。

### 8.5 Rust / Go / Python 接口（`69` §6，V2 路线）

```rust
pub trait FarVerifier {
    fn verify_chain(&self, records: &[CallRecord]) -> VerifyReport;
    fn verify_merkle(&self, proof: &MerkleProof) -> VerifyReport;
    fn verify_envelope(&self, envelope: &ProofEnvelope) -> VerifyReport;
}
```

```go
type FarVerifier interface {
    VerifyChain(records []CallRecord) VerifyReport
    VerifyMerkle(proof MerkleProof) VerifyReport
    VerifyEnvelope(envelope ProofEnvelope) VerifyReport
}
```

Python reference mirrors TypeScript first；Rust/Go 是 differential hardening，非 source of truth。

---

## 9. 跨语言一致性与已知边界

### 9.1 canonicalHash 4 字段白名单（结构性护城河）

`src/evidence_log/hasher.ts` 实测：`canonicalHash` 仅对 4 字段白名单 hash——`stageId` / `cred` / `payloadKind` / `prevHash`，均为字符串/枚举/凭证对象。**数值永不进白名单**，故白名单内天然字节相等，与 RFC 8785 数值序列化无关。

### 9.2 `1e-7` 科学计数法鸿沟（`51` §2，诚实披露）

**根因（一句话）**：不同语言的 JSON 序列化器对极小浮点数（`1e-7` 量级）的科学计数法格式化策略不同——TS `fast-json-stable-stringify` 输出 `1e-7`，Python `json.dumps` 输出 `1e-07`。两者数值相等但字节序列不同 → canonicalHash 不一致。发生在**数值类 golden 向量**（白名单之外的 `golden_vectors.json`），与信任根字节相等正交。

**解药（不掩盖，做成 demo 卖点）**：同屏展示 TS `1e-7` vs Python `1e-07` 字节 diff，口播"我们连这个已知鸿沟都诚实标注——白名单内已字节相等 + 数值类已实证（含 1e-7 鸿沟）；科学计数法这个边界我们选择披露而非粉饰"。

**工程兜底（若评委追问）**：
- 方案 A（首选）：白名单内对数值类统一走 RFC 8785 JCS 规范化，把 `1e-7` 类边界纳入 JCS number serialization 规则。
- 方案 B（降级）：明确"4 字段白名单 + 数值类已字节相等；科学计数法边界是已知限制，列 V3 路线图"，不冒充已解。

### 9.3 RFC 8785 emoji/ZWJ gold-plating 删除（`51` §3，RR-12 风险登记）

删除"覆盖 emoji/ZWJ/组合字符的 RFC 8785 全规范"目标——canonicalHash 4 字段白名单结构性排斥自然语言 emoji 边界。文档明示："RFC 8785 全规范（含 emoji/ZWJ）不适用于 FAR-Chain 的结构化 claim 字段——我们的白名单设计天然规避了这类边界。"

> 注：RR-12 属 `56` §6 风险登记体系，与 `43` §0.3 红队发现 R12（文档太多悖论）是两套不同编号体系，勿混。

### 9.4 WASM 三语言字节相等（`51` §4，V3 路线）

```text
canonicalHash 算法（同一份规范）：
  ├─ TS:   src/evidence_log/hasher.ts                 (LIVE)
  ├─ Py:   repro/far_chain_repro/canonical_json.py    (LIVE)
  └─ WASM: packages/wasm-verifier/                    (待实现·第三语言)
```

CI 三向 golden 断言：同一 fixture，TS/Py/WASM 输出字节相同的 hash。扩展 `repro/tests/test_cross_lang_consistency.py` 至三向。

**降级（若 WASM hash 漂移）**：降级为"TS+Python 双语言 + 浏览器 JS 重算"（复用已落地 `frontend/src/lib/merkle.ts`）。WASM 是性能/体验增益，**非**信任根依赖——双语言字节相等 + JS 浏览器重算已足够支撑 FI-9 第三方验真。

---

## 10. ProofEnvelope 可组合性与 Claim Graph（`70`，V2 路线）

> 状态：`DESIGN_LOCKED`（节点/边模型已定）→ `ROADMAP`（传播算法、增量 Merkle 待实现）。

### 10.1 节点模型

```ts
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

### 10.2 边模型

```ts
export type ClaimGraphEdgeKind =
  | 'depends_on' | 'supports' | 'refutes' | 'contradicts'
  | 'narrows_scope' | 'derived_from' | 'uses_dataset'
  | 'uses_workflow' | 'sealed_by' | 'supersedes';

export interface ClaimGraphEdge {
  edgeId: string;
  fromNodeId: string;
  toNodeId: string;
  kind: ClaimGraphEdgeKind;
  edgeHash: string;
  rule: string;
}
```

### 10.3 Aggregated Verdict 与传播规则

```ts
export interface AggregateVerdict {
  claimNodeId: string;
  localVerdict: Verdict;
  propagatedVerdict: Verdict;
  propagationTrace: PropagationStep[];
  impactedBy: string[];
}
```

传播规则（`70` §3）：

1. parent claim depends on child claim。
2. child `REFUTED` → parent 不能保持无条件 `CONFIRMED`。
3. dataset drift → 所有依赖的 measurement 变 stale。
4. stale measurement → 关联 verdict 变 `DEGRADED_SCOPE` 或需重算。
5. contradiction edge（更强证据）→ claim 变 `INCONCLUSIVE` 或被 rule trace `REFUTED`。

### 10.4 增量 Merkle 更新

```text
nodeHash  = H(domain="far.graph.node.v1", canonical(node))
edgeHash  = H(domain="far.graph.edge.v1", canonical(edge))
graphRoot = Merkle(sorted(nodeHash + edgeHash))
```

部分重算：仅变更 dataset 节点的后代重算；未变更子树保留 prior Merkle proof；claim impact report 含 before/after graphRoot。

### 10.5 API 草案（`70` §6）

```ts
export function buildClaimGraph(envelopes: ProofEnvelope[]): ClaimGraph;
export function propagateGraphVerdict(graph: ClaimGraph, changedNodeId: string): AggregateVerdict[];
export function diffProofHeads(before: ProofHead, after: ProofHead): ProofDiff;
export function queryImpactedClaims(graph: ClaimGraph, evidenceNodeId: string): ClaimImpactReport;
```

### 10.6 红队 Graph 攻击与防御（`70` §8）

| 攻击 | 防御 |
|---|---|
| 隐藏依赖边 | envelope dependency completeness lint |
| Cycle laundering | cycle guard；cycles 须显式 fixed-point 语义 |
| Refuted child 被忽略 | propagation invariant test |
| Dataset drift 只标文件不标 claim | impacted claim query 必须非空 |
| Supersession 隐藏 retraction | retraction 与 supersession 是不同边 |
| 合并不兼容 FEC 的 envelope | FEC compatibility check |

### 10.7 demo story（`70` §7）

1. AI scientist 生成 claim A（依赖 dataset D + workflow W）。
2. ProofEnvelope seal `CONFIRMED`。
3. Judge 改 D 一行。
4. Dataset binding 变红。
5. Graph 高亮 claim A 与衍生 claim B。
6. claim A 传播 verdict 变 `DEGRADED_SCOPE` 或 `UNTESTED`。
7. UI 显示："这不是模型说错了，而是证据链不再支持原声明。"

---

## 11. 性能目标与 red-team 测试

### 11.1 性能目标（`69` §9，design targets，非实测）

| 指标 | V1 target | V2 target |
|---|---:|---:|
| 100-record chain verify | < 1s | < 200ms |
| 1k-record proof envelope bundle | < 5s | < 1s |
| standalone browser load | < 2s | < 1s |
| proof bundle size | < 10MB demo | chunked for large datasets |

> 这些是 design targets，非 current measured claims。实测进 CI（守 O11，禁目标值冒充实测）。

### 11.2 red-team 测试（`69` §10）

| 攻击 | 期望 |
|---|---|
| shared canonicalization bug（TS/Python 数值向量分歧） | expected red until JCS migration |
| locale attack（非英文 locale 下 hash 不变） | pass |
| timezone attack（verifier 时区变化，sealed timestamp 不变） | pass |
| path leak attack（绝对路径归一化出去） | pass |
| browser import failure（standalone bundle smoke with Playwright） | pass |
| dependency drift（lock hash mismatch warning） | warn |

---

## 12. 答辩口径（诚实护栏汇总）

**问：三路 verifier 真的独立吗？**（`69` §11）
答：当前诚实口径是 Node/Python 异语言链路 + Browser 独立环境 Merkle/Suite 重算；Browser 不是第三种跨语言 ProofEnvelope verifier。V2 明确补 Rust/Go/ProofEnvelope，V3 补 WASM/formal spec。我们不把设计规划伪装成已实现。

**问：`.far-proof` 是第三方独立验证吗？**（`57` §2）
答：取决于 RO-Crate 合规路径选择。若走路径 A（exporter 过独立 RO-Crate/PROV-O 校验器）则可称"第三方独立验证"；若走路径 B（V1 minimal 格式）则只能称"项目自验证的离线重算包"。`exporter.ts` 当前自声明 V1 minimal，未过校验器（V3 路线图）。但"独立可重算性"的真正含义——fresh-clone 评委用自己机器从 claim 重算到 proofHash 全程可复现——不依赖导出格式合规。

**问：这不就是知识图谱吗？**（`70` §10）
答：不是。普通知识图谱表达"知识之间有关联"，Claim Graph 表达"哪条可验证证据支撑了哪个裁决"。它的关键动作是传播 proof failure：底层数据漂移会让上游结论降级或重算，而不是继续绿色。

**问：proofHash 能证明科学结论为真吗？**
答：不能（守 C9）。proofHash 证明的是"该证据包满足既定可证伪契约、且可被独立重算"，是 tamper-evident / independently re-computable 的过程可信可机器检，非真理证明。

---

## 13. 与其他章节的咬合

- **→ `02_ARCHITECTURE.md`**：ProofEnvelope 是 §2.3 Proof and Verification Layer 的核心对象；`far verify` 是该层 CLI。
- **→ `03_EVIDENCE_CONTRACT_AND_VERDICT.md`**：FEC、五值裁决、anti-theater 是 `verdict.json` 的语义源；本附录是其可转交载体规格。
- **→ `04_PROOF_ENVELOPE_AND_VERIFIER.md`**：本附录是 `04` 的实现级深化（`04` 给设计态骨架，本附录给完整 JSON schema + 错误码全表 + 三路径详设）。
- **→ `05_AI4S_PRODUCT_DEMO_AND_BENCHMARK.md`**："Your Laptop Is The Verifier"主线依赖本附录的 fresh-clone 验真路径。
- **→ `06_ROADMAP_AND_DOD.md`**：L4 Rust/Go、L5 WASM、L6 formal spec 进路线图分阶段。
- **→ `07_RISK_REGISTER_AND_DO_NOT_CLAIM.md`**：禁用词（证明科学真理/物理不可篡改/完全可复现/第三方独立验证裸声称）在本附录落地为具体守卫。

---

## 14. 旧档案溯源与备份位置

> `FINAL_PACKAGE/` 即将被删除。本附录已完整并入上述四份详设内容，禁止把"详见 FINAL_PACKAGE/X"作为有效依赖。

| 旧编号 | 物理档案 | 备份位置 | 并入本附录位置 |
|---|---|---|---|
| `69` | `FINAL_PACKAGE/69_INDEPENDENT_RECOMPUTATION_VERIFIER_ARCHITECTURE.md` | `C:/Users/RichardYuan/FAR-Lab_Backups/` | §8（分层架构）、§4（分级输出）、§9（canonicalization）、§11（性能/red-team） |
| `57` | `FINAL_PACKAGE/57_THIRD_PARTY_VERIFIER_PROTOCOL.md` | `C:/Users/RichardYuan/FAR-Lab_Backups/` | §7（三路径）、§4.3（exit code）、§3.3（integrityHash）、§6.2（RULE-PE-010） |
| `51` | `FINAL_PACKAGE/51_STREAMING_PROOF_CHAIN_AND_WASM.md` | `C:/Users/RichardYuan/FAR-Lab_Backups/` | §9.2（1e-7 鸿沟）、§9.3（RR-12 删除）、§9.4（WASM 三语言） |
| `70` | `FINAL_PACKAGE/70_PROOF_ENVELOPE_COMPOSABILITY_AND_CLAIM_GRAPH.md` | `C:/Users/RichardYuan/FAR-Lab_Backups/` | §10（节点/边/传播/增量 Merkle） |

物理档案已退役（`FINAL_PACKAGE/` 待删除），溯源用途仅作历史来源解释；权威内容以本附录为准。备份位置：`C:/Users/RichardYuan/FAR-Lab_Backups/`。
