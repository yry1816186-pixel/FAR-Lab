# 10 开发入口

本文件是后续工程 agent、开发者或答辩材料负责人进入项目时的第一读取文件。

> 阅读约定
>
> - 路径写法：本目录使用 `<REPOSITORY_ROOT>/` 作为唯一实现根；旧 `far-chain/` 字样仅作为历史规划路径出现，详见 `01_SOURCE_OF_TRUTH_AND_STATUS.md` §1。
> - 五值裁决 enum 固定为 `CONFIRMED / REFUTED / INCONCLUSIVE / DEGRADED_SCOPE / UNTESTED`，禁止第六值（权威定义见 `03_EVIDENCE_CONTRACT_AND_VERDICT.md` §5、`APPENDIX_A_TYPES.md` §0 `VerdictKind`）。
> - LLM 不得作为最终裁决者；所有 verdict 必须由 deterministic verdict kernel 产出（`03` §7、`APPENDIX_E_ANTI_THEATER.md`）。
> - 状态标签：每个能力须带 `IMPLEMENTED_VERIFIED / IMPLEMENTED_UNVERIFIED / PARTIAL / DESIGN_LOCKED / ROADMAP / RESEARCH / RETIRED / NEEDS_EXTERNAL_VERIFICATION` 之一（`01` §3）。未覆盖字段写 `Pending` 或 `NEEDS_EXTERNAL_VERIFICATION`，禁止手填裸数字（`01` §4）。
> - 本文件历史档案溯源见 `08_TRACEABILITY_MATRIX.md`（旧编号→新位置），FINAL_PACKAGE 物理档案已退役，备份位置 `C:/Users/RichardYuan/FAR-Lab_Backups/`。

## 1. 先读结论

项目最终身份：

> FAR-Chain 是 AI4S 科学声明的 claim-level verification layer。它不替代 AI Scientist、workflow、provenance 或同行评审，而是把科学声明编译为可证伪证据契约，绑定证据和统计计划，输出可独立重算、篡改可检测的 ProofEnvelope / Trust Receipt。

当前最重要的工程目标：

```text
claim
  -> FEC V2
  -> evidence binding
  -> measurement/statistical evaluation
  -> deterministic five-value verdict
  -> ProofEnvelope V2
  -> far verify
  -> independent recomputation
  -> tamper red
```

一句话目标（与旧交接 prompt 对齐）：

> 让评委现场 fresh-clone 一条命令，亲眼看一个 AI 科学假设被编译成可证伪声明、在沙盒确定性执行、产出 TS===Python 的复现哈希、经反 theater 裁决落 `INCONCLUSIVE`、封进机器可检的 ProofEnvelope——全部可重放。

工程命门（不是“做得多”，是“做得真”）：

1. `R2 cross_lang byte-equal`——TS 与 Python 对同一输入产出逐字节相等的 canonicalHash；若两套独立实现产出不同字节，信任根基石崩塌。
2. `反 theater`——任何 `ProofCheck.outcome=WARN/FAIL` 时 verdict 不得为 `CONFIRMED`；`SKIP ≠ PASS`（冒充 = 假绿 = theater）。

## 2. 必读文件

按顺序读：

1. [00_PROJECT_BRIEF.md](00_PROJECT_BRIEF.md)
   明确项目是什么、不是什么。

2. [01_SOURCE_OF_TRUTH_AND_STATUS.md](01_SOURCE_OF_TRUTH_AND_STATUS.md)
   明确路径、状态标签、手填数字禁令和外部事实纪律。

3. [03_EVIDENCE_CONTRACT_AND_VERDICT.md](03_EVIDENCE_CONTRACT_AND_VERDICT.md)
   明确 FEC、证据绑定、统计计划和五值裁决。

4. [04_PROOF_ENVELOPE_AND_VERIFIER.md](04_PROOF_ENVELOPE_AND_VERIFIER.md)
   明确 ProofEnvelope、proofHash、`.far-proof` 和 `far verify`。

5. [06_ROADMAP_AND_DOD.md](06_ROADMAP_AND_DOD.md)
   按 W0-W5 开始开发。

6. [07_RISK_REGISTER_AND_DO_NOT_CLAIM.md](07_RISK_REGISTER_AND_DO_NOT_CLAIM.md)
   防止实现、README、报告和答辩过度宣称。

补充必读（实现级权威附录，遇字段/枚举/schema 冲突以附录为准）：

| 附录 | 权威内容 |
|---|---|
| `APPENDIX_A_TYPES.md` | 全部类型字段定义（`Claim` / `FecContract` / `DatasetBinding` / `ProofEnvelopeV2` / `VerdictKernelInput/Output` 等），`[VC]`/`[META]` 标注 |
| `APPENDIX_B_GOLDEN.md` | golden vectors 机制与数值边界（N1-N4、RFC 8785 JCS 迁移路径） |
| `APPENDIX_C_CANONICAL.md` | canonicalHash 白名单 4 字段 `{stageId, cred, payloadKind, prevHash}`、序列化契约 |
| `APPENDIX_D_PROOF_BUNDLE.md` | `.far-proof` 九分量、离线 package 与 proofHash 算法 |
| `APPENDIX_E_ANTI_THEATER.md` | 反 theater 规则矩阵、deterministic 标记产出点、F6 因果诚信降级 |
| `APPENDIX_F_GLOSSARY.md` | 术语 SSOT（FEC / ProofEnvelope / Trust Receipt / canonicalHash / scope laundering 等） |

## 3. 不要从哪里开始

不要把以下内容作为开发入口：

- `FINAL_PACKAGE/00_WORKSPACE_MAP.md`
- `FINAL_PACKAGE/06_REDEFINED_PROJECT_VISION.md`
- `FINAL_PACKAGE/07_FINAL_ARCHITECTURE.md`
- `FINAL_PACKAGE/HANDOFF_TO_DEV_AGENT.md`
- `FINAL_PACKAGE/FAR-Chain_AI4S_Final_Agent_Prompt.md`

这些都是历史来源或旧交接稿。需要追溯时可读，但必须服从本目录。FINAL_PACKAGE 物理档案已退役（备份位置 `C:/Users/RichardYuan/FAR-Lab_Backups/`），本文件已并入其有效深度内容，不再以“详见 FINAL_PACKAGE/X”作为有效依赖。

被修正的旧口径（不得作为开发依据，仅在“修正”语境可出现）：

| 旧口径 | 新口径 | 出处 |
|---|---|---|
| `far-chain/` 是真实实现子目录 | `<REPOSITORY_ROOT>/` 是当前实现根 | `01` §1 |
| 四值 verdict（`ACCEPTED/REJECTED/DEGRADED/UNTESTED`） | 五值 verdict（`CONFIRMED/REFUTED/INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED`） | `03` §5 |
| 所有层一次性实现 | W0-W5 分阶段依赖实现 | `06` §1 |
| FAR-Bench 是通用 AI4S 榜单 | verification protocol / attack corpus（自测，非通用 benchmark） | `07` |
| `offline_replay` 是生产兜底 | `offline_replay` 是 demo/test profile | `07` |
| Proof-Carrying AI Scientist OS | AI4S claim verification layer | `00` |
| `Auditable/Reproducible` 主卖点 | `Tamper-Evident/Independently Re-computable` | `00` |
| canonicalHash 白名单 `C14` | 白名单 `T3 = {stageId, cred, payloadKind, prevHash}` | `APPENDIX_C_CANONICAL.md` |

## 4. 第一个开发批次

推荐从 W0/W1 开始，不要直接跳到 V3。

### 4.0 执行顺序（关键路径，按依赖推进）

```text
信任根 ─────────────────────────────────────────────►
  T-W1-01 5表DDL+trigger → T-W1-02 TS canonicalHash
  → T-W1-03 Python canonical_hash → T-W1-04 cross_lang(目标真绿)
  → T-W1-05 扩展列 → T-W1-06 三柱表 → T-W1-07 falsifiability_contracts
  → T-W1-08 agent_loop入链+request_id
        │
        ▼
TESS+证伪 ──────────────────────────────────────────►
  T-W2-01 dataset_resolver → T-W2-03 sandbox_runner
  → T-W2-05 SciIR compiler → T-W2-02 Falsification DSL
  → T-W2-04 verdict决策树 → T-W2-07 ConfoundingGate(F6门控)
  → T-W2-06 Hero Demo claim fixture(三 claimType)
        │
        ▼
ProofEnvelope+导出 ─────────────────────────────────►
  T-W3-01 ProofEnvelope+proofHash → T-W3-02 Validator 9规则
  → T-W3-03 repro_deterministic / proof bundle → T-W3-04 .far-proof导出
  → T-W3-05 README_REPLAY+fresh-clone validator
        │
        ▼
R2真绿+UQ ─────────────────────────────────────────►
  T-W4-01 golden_vectors回填(E4) → T-W4-02 cross_lang CI gate
  → T-W4-03 UQ-Witness → T-W4-04 反theaterCI断言
```

> 关键桥接依赖（不可乱序）：
> - `T-W4-01`（golden 真绿）是 `T-W3-04`（`.far-proof` 导出）的前置——ProofEnvelope 导出含 reproHash。
> - `T-W2-07`（ConfoundingGate F6）是 `T-W2-06`（hero-B causal fixture）的前置。

### 4.1 W0-A：状态事实源

目标：让 `far status --json` 或等价命令成为实现状态唯一来源。

最小输出（`01` §5 Status Dump 规范）：

```json
{
  "project": "FAR-Chain",
  "generatedAt": "ISO-8601",
  "commit": "string",
  "nodeVersion": "string",
  "test": {
    "status": "pass|fail|pending",
    "count": "number|Pending"
  },
  "capabilities": {
    "canonicalHash": "IMPLEMENTED_VERIFIED|...",
    "fiveValueVerdict": "IMPLEMENTED_VERIFIED|...",
    "proofEnvelope": "PARTIAL|...",
    "farVerify": "IMPLEMENTED_VERIFIED|...",
    "browserVerifier": "PARTIAL|...",
    "pythonVerifier": "PARTIAL|..."
  },
  "warnings": [
    "No hand-filled metrics in public materials"
  ]
}
```

验收：

- `commit` 来自 `git rev-parse HEAD`，禁止手填；
- `test.status` / `test.count` 来自 CI 或 `vitest`/`pytest` 输出；
- `capabilities.*` 每项带状态标签，未覆盖字段写 `Pending` 或 `NEEDS_EXTERNAL_VERIFICATION`；
- 禁止继续在文档里手填测试数、文件数、CI 通过率、benchmark 数（`01` §4）。

### 4.2 W0-B：路径清理

目标：公开材料和开发说明只使用 `<REPOSITORY_ROOT>/`。

检查命令（POSIX，CI/fresh-clone 评委机可跑）：

```bash
rg -n "far-chain/" README.md docs PROJECT_PLAN src tests
```

发现旧路径时，改为 `<REPOSITORY_ROOT>/` 或明确标注为历史路径。命中时须确认它只出现在“禁用/历史/修正”语境里。

### 4.3 W1-A：信任根回归

目标：确认 canonical hash、evidence chain、golden vectors、migration runner 在 clean checkout 可跑。

实现要点（canonicalHash 双实现，权威契约见 `APPENDIX_C_CANONICAL.md`）：

- TS 实现：`fast-json-stable-stringify@^2.1 + sha256`，白名单 4 字段 `{stageId, cred, payloadKind, prevHash}`。
- Python 实现：`json.dumps(sort_keys=True, allow_nan=False, separators=(',',':'), ensure_ascii=False) + hashlib.sha256`，同 4 字段白名单。
- 易错点（缺一即假阴）：
  - 字段白名单两实现必须一致；
  - Python `separators=(',',':')`（无空格）+ `ensure_ascii=False`（Unicode 直传）；
  - Python `allow_nan=False`（NaN/Infinity 抛 ValueError），TS 显式拒绝 NaN/Infinity 序列化；
  - 浮点 `1.0`（JS→`1` / Py→`1.0`）、大整数 `>2^53`（IEEE754 丢精度）、科学计数为已知数值边界 N1-N4，golden_vectors 须含数值样本对拍（`APPENDIX_B_GOLDEN.md`）；day-1 若漂移，按 RFC 8785 JCS 迁移（只改值序列化规则，不破坏白名单 4 字段语义），COLLECTION 历史 baseline 不改。

验收：

- 任一 chain record 字段变化会 fail；
- golden vectors 固定（CI gate fail-on-mismatch）；
- TS/Python 行为边界明确（Unicode / NaN / Infinity / 排序 / 分隔符 / 数值）；
- status 输出不靠人工填数；
- `R1 append-only`：trigger 拦截 UPDATE/DELETE；
- `R7`：append-only 物理层保护；
- `R8 模型中立`：Core 算法层（canonicalHash / verdict_mapping / appendRecord 的哈希与裁决逻辑）grep 不得出现 `qwen/dashscope/bailian/aliyun`（大小写不敏感）；唯一例外是厂商约束分发点的 profile 钩子文件（`adapters/aliyun_qwen/`），属非算法依赖，CI grep 须精确到算法层或显式排除 profile 钩子。

### 4.4 W2-A：FEC V2 schema

目标：把 FEC 从 optional/partial 推进为 P0 mandatory contract。

FEC 顶层类型（`03` §1、完整字段见 `APPENDIX_A_TYPES.md` §1 `FecContract`）：

```ts
type FecContract = {
  fecId: string;                       // [VC] 如 "FEC-ASTRO-0001"
  claimId: string;                     // [VC] 关联 Claim
  measurableImplication: string;       // [VC] POPPER 风格可测蕴含（至少 1 条）
  scope: ScopeSpec;                    // [VC] 有界 scope；无界 -> SCOPE_UNBOUNDED
  requiredEvidence: EvidenceRequirement[];   // [VC] 缺失任一 -> EVIDENCE_MISSING -> UNTESTED
  datasetRequirements: DatasetRequirement[];
  workflowRequirements: WorkflowRequirement[];
  metric: MetricSpec;                  // [VC] primary metric；事后换 = metric swapping
  threshold: ThresholdSpec;
  direction: "greater" | "less" | "equal" | "within" | "noninferior";
  statisticalPlan: StatisticalPlan;
  powerPlan?: PowerPlan;               // 缺失可能触发 INCONCLUSIVE（功效不足）
  multipleTestingPlan?: MultipleTestingPlan;
  seedPolicy: SeedPolicy;              // seed 预登记；换 seed = p-hacking
  deviationPolicy: DeviationPolicy;    // critical deviation -> UNTESTED
  freeze: ProtocolFreeze;              // [VC] 协议冻结 + FEC canonicalHash
};
```

FEC 编译检查（失败不得输出 `CONFIRMED` 或 `REFUTED`，默认进入 `UNTESTED` 或阻断）：

| 检查 | 失败结果 |
|---|---|
| 是否存在可测 implication | `FEC_NOT_COMPILABLE` |
| 是否有明确 scope | `SCOPE_UNBOUNDED` |
| 是否定义 primary metric | `METRIC_MISSING` |
| 是否定义 threshold 与 direction | `THRESHOLD_MISSING` |
| 是否定义 dataset/workflow 要求 | `EVIDENCE_REQUIREMENT_MISSING` |
| 是否定义统计计划 | `STAT_PLAN_MISSING` |
| 是否说明多重检验和 seed | `PROTOCOL_INCOMPLETE` |

deterministic verdict kernel 伪代码（`03` §7）：

```ts
function decideFiveValueVerdict(input: VerdictKernelInput): VerdictKernelOutput {
  if (!isFrozenAndCompilable(input.fec)) return untested("FEC_NOT_READY");
  if (missingRequiredEvidence(input)) return untested("EVIDENCE_MISSING");
  if (criticalProtocolDeviation(input)) return untested("CRITICAL_DEVIATION");

  const scope = evaluateScope(input);
  const stats = evaluateStatistics(input);
  const theater = evaluateAntiTheater(input);

  // 优先级锁死：DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED
  // DEGRADED_SCOPE 必须在 CONFIRMED 前判定
  if (scope.isDegraded) return degraded("SCOPE_DEGRADED", scope);
  if (theater.hasFail) return inconclusiveOrUntested(theater);
  if (stats.refutes) return refuted(stats);
  if (stats.conflicting || stats.underpowered) return inconclusive(stats);
  if (stats.supports) return confirmed(stats);
  return untested("NO_DECISION_PATH");
}
```

验收：

- 缺 FEC 不允许 `CONFIRMED`；
- 缺数据进入 `UNTESTED`；
- scope 缩小进入 `DEGRADED_SCOPE`；
- 所有 verdict 有 rule trace（`VerdictKernelOutput.ruleTrace`）；
- 反 theater：任何 `ProofCheck.outcome=WARN/FAIL` 时 verdict ≠ `CONFIRMED`（机器化为 CI 断言）；
- `SKIP ≠ PASS`：`all_pass` 路径严格要求所有 outcome=`PASS`（SKIP/WARN/FAIL 均排除）；
- 决策树优先级 5 路径单测全覆盖；
- enum 严格 5 值，无隐式第六值。

三 claimType 覆盖（Hero Demo fixture，**已交付 #12** · `countDeliveredV1ClaimFixtures()===3`）：

| Claim | claimType | 域 | 设计性 verdict | 说明 |
|---|---|---|---|---|
| `C-ASTRO-0001` | `existence` | TESS astronomy | `INCONCLUSIVE` | TESS 数据本身不可证伪 |
| `hero-A-001` | `quantitative` | MMLU-physics | `INCONCLUSIVE` | RULE-FS-001 不可证伪（`buildHeroAChecks`：M1 PASS + M2/M3 WARN → `mixed`） |
| `hero-B-002` | `causal` | CoT 幻觉率 | `DEGRADED_SCOPE` | L7-L3 ConfoundingGate F6 门控（全 PASS checks 本会 `CONFIRMED` → `decideVerdictWithConfounding(FAIL)` 降级 `DEGRADED_SCOPE`） |

### 4.5 W3-A：`far verify`

目标：让 `.far-proof` 可以在干净环境中被验证。

`.far-proof` bundle 结构（`04` §4、九分量实现态见 `APPENDIX_D_PROOF_BUNDLE.md`）：

```text
claim.json
fec.json
bindings/
  datasets.json
  workflows.json
runs/
  run-*.json
measurements/
  result-*.json
verdict.json
proof-envelope.json
ledger/
  chain.json
  merkle.json
README_RECEIPT.md
```

proofHash 契约（`04` §3）：

```text
proofHash = sha256(canonical_json(ProofEnvelope 所有字段 - proofHash 自身))
```

`canonical_json` 须含 `separators=(',',':')` + `ensure_ascii=False`（缺则含 Unicode/数值字段的 ProofEnvelope 重算假阴）。

CLI（`04` §5）：

```bash
far verify --bundle path/to/.far-proof --json
far verify --bundle path/to/.far-proof --mode chain
far verify --bundle path/to/.far-proof --mode envelope
far verify --bundle path/to/.far-proof --explain
```

输出最小字段：

```json
{
  "status": "PASS|FAIL|WARN",
  "verdict": "CONFIRMED|REFUTED|INCONCLUSIVE|DEGRADED_SCOPE|UNTESTED",
  "proofHash": "64-hex",
  "ledgerRoot": "64-hex",
  "tamperStatus": "clean|tampered|unknown",
  "scopeStatus": "full|degraded|unknown",
  "recomputation": {
    "node": "pass|fail|not-run",
    "python": "pass|fail|not-run",
    "browser": "pass|fail|not-run"
  },
  "errors": [],
  "warnings": []
}
```

验收：

- `far verify --bundle demo/.far-proof --json` 输出结构化结果；
- 修改 proof-critical 字段会 fail（`PROOF_HASH_MISMATCH` / `LEDGER_ROOT_MISMATCH` / `FEC_HASH_MISMATCH` / `DATASET_HASH_MISMATCH` / `VERDICT_TRACE_MISMATCH`，`04` §8）；
- Python/browser verifier 至少覆盖 P0 指定范围（诚实标注边界，browser 若用 TS 编译产物不得包装成完全不同语言实现）；
- Trust Receipt 明确 limitation（“该声明在冻结 FEC 与当前证据范围内得到 X。这不是终局科学真理证书，而是该证据包满足既定可证伪契约、且可被独立重算的信任收据。”，`04` §9）；
- bundle 内不含密钥、不含真实个人隐私路径、所有引用文件都有 hash、Windows 路径/空格路径/离线目录可运行。

独立验证等级（`04` §6，当前只能声称 P0 目标完成可演示的独立重算闭环）：

| 等级 | 含义 |
|---|---|
| L1 | 同仓库 Node 重算 |
| L2 | Python 独立实现重算 |
| L3 | Browser Web Crypto / standalone verifier |
| L4 | Rust/Go/WASM 独立实现（V2/V3） |
| L5 | 第三方维护 verifier（生态成熟目标） |
| L6 | 形式化验证核心 invariant（研究路线） |

### 4.6 Day-1 六项实测（不能由 LLM 代办，仅搭好脚手架）

| 编号 | 实测项 | 能否 LLM 代办 | 状态 |
|---|---|---|---|
| E1 | snapshot liveness（GET /v1/models 确认 qwen3.7-max-2026-05-20 存活 + 维护期） | 不能 | `NEEDS_REAL_ENV` |
| E2 | dashscopeRequestId 字段名（curl -i 抓 header/body 三候选） | 不能 | `NEEDS_REAL_TEST` |
| E3 | addCycleGuard 钻石拓扑防环（better-sqlite3 :memory:） | 部分 | 待实测 |
| E4 | golden_vectors 双向回填（TS+Python 对拍） | 命门 | 单向量已回填真实 hex、byte-equal 真绿；剩余数值域边界按 NUMERIC_KNOWN_DIVERGENCE 诚实归 RED，待 RFC 8785 JCS 迁移 |
| E5 | threadpool_info() CI BLAS 可观测性（ubuntu+numpy 后端） | 部分 | `NEEDS_REAL_ENV` |
| E6 | competition_qwen_smoke 真实计费 + 控制台截图 | 不能 | `NEEDS_HUMAN_OPERATION`；CI 上若 skipped ≠ passing |

## 5. 开发红线

> 违反任何一条 = 任务失败。冲突时按红线优先级裁决链：`L0 任务铁律/CLAUDE.md > L1 宪法 > L2 T1-T12 信任根（R2 最高工程优先）> L2 F1-F12 反 theater > L2 Z1-Z16 零容忍 > L3 DO_NOT_CLAIM/表述口径`。冲突时砍新方案不改红线。

核心红线：

- 不引入 LLM final judge（`sealedBy`/`createdBy`/`compiledBy`/`computed_by` 禁止 `llm` 值；deterministic 标记产出点见 `APPENDIX_E_ANTI_THEATER.md`）。
- 不增加第六个 verdict。
- 不把 ProofEnvelope 写成科学真理证明（bounded support，非科学真理；`04` §1）。
- 不把 `offline_replay` 写成生产兜底。
- 不把 FAR-Bench 写成通用 AI4S 排行榜。
- 不把 V2/V3 路线写成当前完成。
- 不手填测试数、文件数、benchmark 数、commit、CI 通过率（`01` §4）。

不可降级项（外部依赖不可控时可降级，但因“未实现”不可降级；降级 = 把 verdict 落 `DEGRADED_SCOPE`/`UNTESTED`/`INCONCLUSIVE` 并标注 `degraded_from`+`reason`+`baseline_exempt`，不是把失败包装成成功）：

1. 绝不伪造 `CONFIRMED`（数据缺失→`UNTESTED`；代码跑不通→`DEGRADED_SCOPE`；结果不一致→`INCONCLUSIVE`/`REFUTED`）。
2. 绝不隐藏/删除 `knownFailures`（append-only + 诚实）。
3. 绝不 `--no-verify` 跳过 CI。
4. 绝不把占位红 / golden 占位当真绿；数值域边界漂移须诚实归 RED，禁止改算法/加 fallback 掩盖。
5. `Math.random()` / `Date.now()` 禁进确定性路径（破坏 repro）。
6. 绝不静默换模型（FallbackChain 每次降级必记 `call_records.degraded_from` + `reason` + `trigger_signal`）。
7. `cross_lang byte-equal` 不成立不可降级——必须修；首里程碑前修不好则不能声称达成，Demo 须诚实展示 R2 设计期红。
8. 绝不声称进程级物理隔离——当前是 type-layer purpose_tag + CI 审计，只能诚实声明弱隔离事实。

零容忍（新代码中出现 = 变更被拒）：

| # | 禁止 | 必须 |
|---|------|------|
| 1 | `: any` / `as unknown as X`（双重断言绝对禁） | `unknown` + 收窄 / type guard；必要窄断言 `as X` 须配注释说明依据 |
| 2 | `@ts-ignore` / `@ts-nocheck` | 修正类型源头 |
| 3 | `catch {}` 空块 | 处理/重新抛出/logger.error |
| 4 | 加宽类型 / 加 `?.` 掩盖 null / fallback 掩盖 bug | 修正数据源头 |
| 5 | 删参数修 arity / 注释失败代码 / stub 替代真实实现 | 修正调用方/实现 |
| 6 | 修改测试期望值让测试通过 | 修正实现代码 |
| 7 | 硬编码 URL / Secret 明文 | config/env 读取 |
| 8 | 未 await 的 Promise / 未 catch 的异步 | await + catch |
| 9 | `innerHTML` / `dangerouslySetInnerHTML` | 安全替代 |
| 10 | mutate props/arguments | 不可变操作 |

表述口径红线：

- 禁说“区块链”（正确 = transparency-log-style local append-only proof ledger + Merkle root + inclusion proof）。
- 禁说“证明科学真理”（ProofEnvelope 只证明 claim 经过哪些 check/失败/降级/锚定/可回放，`CONFIRMED` = bounded support）。
- 禁说“全自动”（密钥授权/控制台截图/报名提交/凭证核验须人工）。
- 禁说“已物理隔离”除非真做 + 测试证明。
- 禁说“发现新科学规律”。
- 禁说“已跑通”未实测项。

## 6. 完成一个 PR 前检查（可复制的 rg 命令）

### 6.1 禁用口径扫描

```bash
rg -n "证明科学真理|物理不可篡改|完全可复现|全自动科学家|通用 AI4S benchmark|far-chain/" README.md docs PROJECT_PLAN src tests
```

如果命中，确认它只出现在“禁用/历史/修正”语境里。

补充禁用口径扫描（表述红线）：

```bash
rg -n "区块链|已物理隔离|发现新科学规律|最新|第一|唯一" README.md docs PROJECT_PLAN src tests
```

命中“最新/第一/唯一”时须确认全带“据我们所知”或限定维度（如“最强可靠性层”非绝对宣称），无来源支撑的裸峰值词 = 过度宣称。

### 6.2 五值 enum 一致性

```bash
rg -n "CONFIRMED|REFUTED|INCONCLUSIVE|DEGRADED_SCOPE|UNTESTED" PROJECT_PLAN src tests
```

确保 enum 仍是五值，没有新增隐式第六值。如发现旧四值残留（`ACCEPTED/REJECTED/DEGRADED/UNTESTED`）须清理：

```bash
rg -n "ACCEPTED|REJECTED" PROJECT_PLAN src tests
```

### 6.3 canonicalHash 白名单（C14 已回写为 T3）

```bash
rg -n "C14" PROJECT_PLAN APPENDIX_*.md src tests
```

活文档 canonicalHash 白名单语境禁出现 `C14`（白名单四字段为 `T3 = {stageId, cred, payloadKind, prevHash}`）。

### 6.4 模型中立（R8）

```bash
rg -niE "qwen|dashscope|bailian|aliyun" src tests
```

Core 算法层（canonicalHash / verdict_mapping / appendRecord 的哈希与裁决逻辑）须 0 命中。命中仅允许出现在：`adapters/aliyun_qwen/`（唯一 Qwen 通道）、L0 evidence_log + L2 falsifiability 的 `competition_aliyun_qwen` profile 钩子（厂商约束分发点，含 qwen 子串，非算法依赖）。

### 6.5 安全（无 secrets）

```bash
rg -n "DASHSCOPE_API_KEY=|sk-" README.md docs PROJECT_PLAN src tests frontend
rg -n "\.env" .gitignore
```

第一条须 0 明文命中；第二条须确认 `.env*` 在 `.gitignore`。

### 6.6 CausalModel schema（无 backdoorSet/variableType/edgeType/bidirected）

```bash
rg -n "backdoorSet|variableType|edgeType|bidirected" PROJECT_PLAN APPENDIX_*.md src tests
```

CausalModel 已对齐 SSOT：`CausalEdgeKind` 3 值（`direct_cause` / `probable_cause` / `spurious_correlation`）、`node_kind` 4 值（`observed` / `latent` / `intervention` / `outcome`）、`controlledConfounders` + `unmeasuredConfoundersSuspected`。残留字段值仅允许出现在迁移说明注释语境。

### 6.7 PR Checklist 自答（`06` §9）

每个工程 PR 必须回答：

- 是否改变 verdict-critical 字段；
- 是否更新 proofHash input；
- 是否更新 golden vectors；
- 是否影响 Python/browser verifier；
- 是否引入 LLM final judge；
- 是否影响 status dump；
- 是否增加外部事实或强口号；
- 是否需要更新 Trust Receipt 和 docs。

### 6.8 验证双档

| 档 | 触发 | 范围 | 用途 |
|---|---|---|---|
| 增量档 | 单文件改动 | 改动文件 typecheck + 相关单测 + 受影响 cross_lang | 开发中（WIP 可暂红，留 TODO + 原因） |
| 全量档 | commit/PR/里程碑/声称完成 | CI 12 步全跑 + 全量 test + golden + fresh-clone | 交付门（必须全绿） |

> WIP 纪律：增量档可暂红（留 TODO + 原因）；**commit/PR/声称完成前必须全量档全绿**。

### 6.9 何时声称“完成”（反幻觉）

- 可声称：CI 12 步（+附加）全跑全绿，有 run URL + 截图为证。
- 不可声称：任何步骤红/skip/未跑；golden 占位未回填却称 R2 绿。
- 状态词：`CI_DESIGNED`（当前）/ `CI_PARTIAL`（部分绿）/ `CI_GREEN`（全绿，有证）。
- 有残留错误不说“完成”；修一个暴露三个→全修完；无法修复→说“无法修复”并解释，不伪造。

## 7. 当前能力规划口径（进入开发前由 `far status`/CI/代码审计重新确认）

| 能力 | 规划口径 | 状态标签 |
|---|---|---|
| evidence log chain | 已有实现痕迹，需以代码和测试确认状态 | `PARTIAL` |
| canonical hash / golden vector | 属核心信任根，最高优先级 | `DESIGN_LOCKED` |
| five-value verdict | 语义已锁定，工程上需升级为 metric-first deterministic kernel | `DESIGN_LOCKED` |
| ProofEnvelope V1 | 视为 partial，P0 升级为 V2 proofHash binding | `PARTIAL` |
| Python verifier | chain/Merkle + ProofEnvelope V2 proofHash 独立重算已完成；完整 verdict trace 重放仍待补 | `IMPLEMENTED_VERIFIED` |
| Browser verifier | standalone ProofEnvelope V2 proofHash + Merkle/Suite 已完成；raw evidence / RO-Crate 边界须继续标注 | `IMPLEMENTED_VERIFIED` |
| `far status` | 已成为状态事实源（JSON 输出由测试覆盖） | `IMPLEMENTED_VERIFIED` |
| `far verify` | envelope/chain/full/bundle P0 已补齐；fresh-clone 非项目成员留证仍待补 | `IMPLEMENTED_VERIFIED` |
| FAR-Bench | evaluation protocol / attack corpus，不宣称泛 benchmark 成熟 | `DESIGN_LOCKED` |
| Rust/Go independent verifier | V2 | `ROADMAP` |
| full WASM verifier / formal proof / public verifier ecosystem | V3 | `RESEARCH` |

## 8. 外部事实纪律（`01` §7）

涉及外部产品、论文、竞品、发布时间、引用和 novelty 时：

- 答辩或提交前重新检索；
- 记录来源链接和读取日期；
- 使用 hedge 措辞；
- 避免“绝对第一”“无人做到”“最新/第一/唯一”等无来源支撑的强时效结论；
- 若无法复核，标注 `NEEDS_EXTERNAL_VERIFICATION`。

本 SSOT 不把任何外部竞品事实作为无需复核的永久事实。
