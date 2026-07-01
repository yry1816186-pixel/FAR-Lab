# APPENDIX C · Canonical 序列化与哈希算法（信任根算法规格）

> 本附录是 canonical 序列化、proofHash、Merkle/ledgerRoot、inclusion proof 与 verdict-critical 字段的**权威集中处**。
> 状态：`DESIGN_LOCKED`（核心四字段白名单与跨语言算法已锁定）· 部分能力为 `IMPLEMENTED_VERIFIED`（见各节状态标签）· 数值域边界为已知分叉（见 §8）。
> 跨文档一致性：类型名、字段名、enum 值、路径写法以本附录与 `APPENDIX_A_TYPES.md` / `APPENDIX_F_GLOSSARY.md` 为权威；冲突时以三附录为准。
> 一句话：**信任根只落在确定性结构、哈希、冻结协议与可重算执行上——本附录冻结“确定性结构”与“哈希”两根支柱。**

---

## 0. 范围、纪律与铁律

### 0.1 谁必须读本附录

- canonicalHash / canonical_hash 的**任何实现或移植**（TS / Python / Browser / Rust / Go / WASM）；
- proofHash、ledgerRoot、Merkle root / inclusion proof 的实现者；
- 五值裁决内核（`VerdictKernelInput` → `proofHashInputs`）的维护者；
- golden vectors 的作者与回填者；
- 任何想新增“进入 hash 的字段”或“不进入 hash 的字段”的人。

### 0.2 四条铁律（不可逾越）

1. **同一对象的 hash 输入跨实现逐字节相同**（byte-equal）。TS 与 Python 在四字段白名单对象上必须输出同一 64-hex；任一断 = 信任根断。
2. **白名单优先**：进入 hash 的字段用**显式白名单**声明，禁止用 spread 黑名单“扣掉几个字段剩下的全进”。新增字段默认**不**进 hash，除非显式加入白名单并同步 golden vectors。
3. **裁决确定性**：LLM **不得**作为最终裁决者；canonical 序列化不得调用 `Date.now()`、不得依赖 locale、不得依赖时区、不得依赖环境变量或文件系统绝对路径。
4. **状态纪律**：所有数字（测试数、文件数、CI 通过率、golden 向量数、commit、竞品发布时间）一律来自 `far status` 或显式占位符，本附录不写裸数字。

### 0.3 禁用词（本附录内不得作为有效口径）

下列词**仅**在“禁用 / 历史 / 修正”语境出现且必须显式标注，**不得**作为本附录的有效结论口径：

- 证明科学真理 / 物理不可篡改 / 完全可复现 / 全自动科学家 / 通用 AI4S benchmark 或排行榜；
- `far-chain/`（作为真实实现路径）—— 一律写 `<REPOSITORY_ROOT>/`；
- 最新 / 第一 / 唯一（无来源支撑时）。

---

## 1. Canonical 序列化算法

### 1.1 设计目标

对一个进入信任根的 JS/Python 对象，生成**跨实现、跨时间、跨 locale 稳定**的字节表示，作为 sha256 的唯一输入。两台机器、两种语言、两个时区、两种 locale，对同一逻辑对象必须产出同一字节串。

### 1.2 字段排序规则

| 规则 | 说明 |
|---|---|
| 对象 key | **递归字典序升序**（lexicographic by UTF-16 code unit，等价 ECMAScript 字符串默认比较的 `<` 关系） |
| 数组 | **保持原顺序**，不排序。数组元素本身按本算法递归规范化 |
| 嵌套对象 | 递归至叶子 |
| 顶层对象 | 同样排序（顶层不允许是无序 Map 的“插入序”，必须是排序后的对象） |

### 1.3 编码与分隔符

| 项 | 规则 |
|---|---|
| 字节编码 | UTF-8（`encode('utf-8')` / Node `Buffer.from(s, 'utf8')`） |
| 对象分隔 | `{"k":"v","k2":123}` 风格：key 与 value 之间用 `:`，键值对之间用 `,`，**无任何空格** |
| 数组分隔 | `[1,2,3]`：元素之间用 `,`，**无任何空格** |
| 空对象 / 空数组 | `{}` / `[]`，**不**省略 |
| 引号 | 一律 ASCII 双引号 `"`，禁用单引号 |

### 1.4 Unicode 规范化

| 项 | 规则 |
|---|---|
| 规范化形式 | **不做 NFC/NFD 等任何 Unicode 规范化**（输入应当已被上游冻结为稳定字符串；规范化是上游责任，避免不同 OS/ICU 版本产生差异） |
| ASCII 转义 | TS 侧 `fast-json-stable-stringify` 与 Python 侧 `ensure_ascii=False` **必须对齐为“不强制 ASCII 转义”**：非 ASCII 字符以 UTF-8 字节直接出现，而非 `\uXXXX` |
| 控制字符 | U+0000–U+001F 按 JSON 规范转义为 `\u00XX`（与 `JSON.stringify` / `json.dumps` 默认行为一致） |
| 补充平面 / emoji / ZWJ | **已知分叉区**（见 §8 NUMERIC_KNOWN_DIVERGENCE），V1 通过四字段白名单结构性排斥自然语言，避免进入 hash；V3 迁移到 RFC 8785 JCS 后再统一 |

### 1.5 数字、布尔、null 表示

| 类型 | 规则 | 已知分叉 |
|---|---|---|
| 整数 | 无小数点、无前导零、无 `+` 号，如 `42`、`-7`、`0` | — |
| 浮点 | TS `JSON.stringify` 默认表示（`1e-7` → `"1e-7"`）与 Python `json.dumps`（`1e-07`）**在科学计数法零填充上不一致** | **NUMERIC_KNOWN_DIVERGENCE**（§8） |
| 布尔 | 小写 `true` / `false` | — |
| null | 小写 `null` | — |
| NaN / Infinity | **一律拒绝**（throw / abort），不允许出现 |
| 大整数 | 在 JSON number 域内：若超出 `Number.MAX_SAFE_INTEGER`，TS `JSON.stringify` 与 Python 表示可能不同；实现**必须**用字符串承载此类字段（白名单字段在 schema 层声明为 `string`） |

### 1.6 嵌套与数组规则

- 对象嵌套：递归排序每一层 key。
- 数组嵌套：递归**不排序**，元素按本算法规范化后顺序拼接。
- 数组元素若是对象：对象自身排序，但数组整体顺序不变。
- 混合类型数组（如 `[1, "a", {"b":2}]`）：合法，按上述规则逐元素规范化。

### 1.7 确定性要求（禁用清单）

下列任何一项都会破坏确定性，**禁止**出现在 canonical 序列化路径上：

1. `Date.now()` / `new Date()` / `time.time()` 等 wall-clock（**例外**：已被冻结的 ISO-8601 字符串字段可进入 hash，因为它是数据不是当前时间）；
2. locale-sensitive 比较（如 Python 默认 `sorted()` 在某些 locale 下对非 ASCII 顺序不同 —— 必须用 code-unit 比较）；
3. 环境变量、用户名、主机名、临时目录、绝对文件路径（除非该路径本身是语义字段且已规范化为 `<REPOSITORY_ROOT>/` 前缀，见 §7）；
4. 哈希指针回指自身（自指对象），必须先 `Omit` 掉 `currentHash` / `proofHash` / `seq` 等自指字段；
5. 无序集合（`Set` / `dict` 视图）未经排序直接迭代；
6. 浮点不可表示值（NaN / Infinity）；
7. TS 原生 `JSON.stringify`（**不排序 key**，跨语言漂移）—— TS 侧**必须**用 `fast-json-stable-stringify@^2.1`。

### 1.8 参考实现伪代码

```text
function canonicalJson(value): string
  // 输入：已通过白名单与 assertNoNaN 校验的对象/数组/标量
  // 输出：UTF-8 字节等价的规范化 JSON 字符串（无空格、key 字典序、数组保序）

  if value is null:        return "null"
  if value is boolean:     return value ? "true" : "false"
  if value is number:
      if isNaN(value) or isInfinity(value): throw CANONICAL_REJECT_NON_FINITE
      return numberToString(value)   // TS: JSON.stringify(number); Python: repr(number) via json.dumps
  if value is string:
      return jsonEscapeString(value) // 双引号包裹 + 控制字符 \u00XX 转义 + 非 ASCII 直接 UTF-8

  if value is array:
      parts = []
      for elem in value:             // 不排序
          parts.push(canonicalJson(elem))
      return "[" + join(parts, ",") + "]"

  if value is object:
      keys = sortKeysByCodeUnit(keys(value))   // 递归字典序
      parts = []
      for k in keys:
          parts.push(jsonEscapeString(k) + ":" + canonicalJson(value[k]))
      return "{" + join(parts, ",") + "}"

  throw CANONICAL_UNSUPPORTED_TYPE   // 函数/undefined/Symbol 等不得进入
```

`jsonEscapeString(s)` 必须满足：

- 用 `"` 包裹；
- U+0000–U+001F 转义为 `\u00XX`；
- `"` / `\` 转义；
- 其余字符以 UTF-8 字节直接出现（**不**强制转非 ASCII，与 Python `ensure_ascii=False` 对齐）。

### 1.9 TS 侧与 Python 侧的**等价**调用

```ts
// TS（项目内唯一允许的 stable-stringify 实现）
import stableStringify from "fast-json-stable-stringify"; // ^2.1.0
const canonical: string = stableStringify(obj);           // 递归排序 key
const bytes: Buffer = Buffer.from(canonical, "utf8");
const digest: string = crypto.createHash("sha256").update(bytes).digest("hex");
// 禁用：JSON.stringify(obj) —— 不排序 key
```

```python
# Python（项目内唯一允许的 canonical_json 实现）
import hashlib, json
def canonical_json(obj) -> str:
    return json.dumps(
        obj,
        sort_keys=True,          # 递归字典序
        allow_nan=False,         # NaN/Infinity 抛 ValueError
        separators=(",", ":"),   # 无空格
        ensure_ascii=False,      # 与 TS stableStringify 对齐：不强制 ASCII 转义
    )

def canonical_hash(obj) -> str:
    return hashlib.sha256(canonical_json(obj).encode("utf-8")).hexdigest()
```

> **重要**：TS 的 `fast-json-stable-stringify` 与 Python 的 `json.dumps(sort_keys=True, ensure_ascii=False, separators=(",",":"))` 在**四字段白名单对象**（字符串/嵌套字符串对象/整数）上**已实证 byte-equal**（`IMPLEMENTED_VERIFIED`，由 `cross_lang_consistency` 对拍守卫）。浮点科学计数法零填充为已知分叉，见 §8。

---

## 2. proofHash 计算

### 2.1 定义

`proofHash` 是对 **ProofEnvelope 中所有 verdict-critical 字段**做 canonical 序列化后 sha256 的 64 字符小写 hex。它是 envelope 的唯一稳定摘要：篡改任一 verdict-critical 字段 → proofHash 必变 → 第三方重算即发现。

### 2.2 进入 proofHash 的字段（权威白名单）

| 字段 | 来源对象 | 说明 |
|---|---|---|
| `schemaVersion` | `ProofEnvelopeV2` | 形如 `"far.proof_envelope.v2"`，决定 verifier 路径 |
| `claim.id` + normalized claim text | `Claim` | claim 的稳定标识与规范化文本（自然语言须先 normalize：去多余空白、统一换行 `\n`） |
| `claim.domain` / `claim.scope` | `Claim` | 领域与 scope，影响裁决范围 |
| `fecHash` | `FecContract` | FEC 整体摘要（FEC 内部字段由 §3 单独 canonical 化再 hash） |
| `fecSnapshot` | `FecContract` | FEC 完整快照（与 `fecHash` 互验：`fecHash === sha256(canonicalJson(fecSnapshot))`） |
| `protocolFreeze` | `ProtocolFreeze` | 含 `fecHash` / `actor` / `timestamp`（已冻结 ISO-8601）/ `environmentPolicy` / `deviationPolicy` |
| `datasetBindings[]` | `DatasetBinding[]` | 数组保序，每元素含 `contentHash`/`schemaHash`/`statsFingerprint`/`scopeCoverage` 等 |
| `workflowBindings[]` | `WorkflowBinding[]` | 含 `workflowHash`/`containerDigest`/`environmentHash`/`commandHash`/`seedPolicy`/`networkPolicy` |
| `experimentRuns[]` | `ExperimentRunBinding[]` | 含 `runId`/`startedAt`/`endedAt`/`actor`/`inputHashes`/`outputHashes`/`logHashes`/`exitCode`/`deviations` |
| `measurementResults[]` | `MeasurementResult[]` | 含 `metricValues`/`rawArtifactHashes`/`runId`/`runEnvironment`/stdout/stderr hashes |
| `statisticalResults[]` | `StatisticalResult[]` | 含 `effectSize`/`pValue`/`confidenceInterval`/`power`/`multipleTestingCorrection`/`assumptions` |
| `verdictTrace.verdict` | `VerdictKernelOutput` | 五值 enum 之一（§5） |
| `verdictTrace.reasonCodes` | `VerdictKernelOutput` | 字符串数组保序 |
| `verdictTrace.ruleTrace` | `VerdictKernelOutput` | 完整规则轨迹（每条 `ruleId`/`outcome`/`inputs`/`messageCode`） |
| `verdictTrace.decisiveRuleId` | `VerdictKernelOutput` | 决定性规则 id |
| `verdictTrace.evidenceSufficiency` | `VerdictKernelOutput` | 证据充分性报告 |
| `verdictTrace.protocolDeviations` | `VerdictKernelOutput` | 协议偏离日志 |
| `antiTheaterReport` | `AntiTheaterReport` | 反剧场检查结果（label-only / LLM override / post-hoc threshold / dataset drift / scope laundering 等） |
| `ledgerRoot` | ledger | 见 §4，Merkle 根或 hash chain 链头 |
| `verdictKernelVersion` | `VerdictKernelOutput` | 裁决内核版本字符串，锁定规则优先级表 |
| `rulePriorityTableHash` | 裁决内核 | 规则优先级表的 hash（防“偷偷改优先级”） |
| `proofHashInputs[]` | `VerdictKernelOutput` | 裁决内核声明的、本裁决实际依赖的输入字段 hash 列表（数组保序） |

### 2.3 不可进入 proofHash 的字段清单（及原因）

| 字段 | 原因 |
|---|---|
| `proofHash`（自身） | 自指；会形成无限递归。先 `Omit` 自身再 hash |
| `envelopeId` | 非语义字段，仅用于索引；改 id 不应改变裁决可信度 |
| `signatures[]` | 签名是对 proofHash 的结果，不能反过来进入 proofHash（循环依赖） |
| `humanSummary` / `humanExplanationTemplateId` 渲染后的自然语言 | 解释字段必须可删除而不改变 verdict；模板 id 可进、渲染产物不进 |
| UI 展示顺序、布局、主题 | 非语义 |
| 本地文件绝对路径 | 非语义且环境相关（除非该路径本身是冻结协议字段且已规范化，见 §7） |
| 非决定性时间戳（如“生成 envelope 的当前时间”） | wall-clock 不可进；**只有** freeze / seal 这类已被冻结的事件时间戳可进 |
| debug 日志全文 | 除非其 hash 被显式声明为 evidence 并列入 `measurementResults.rawArtifactHashes` |
| `recomputation` 报告本身（Node/Python/Browser pass/fail） | 这是**验证结果**不是裁决输入；它是 proofHash 的**消费者**不是**生产者** |

### 2.4 proofHash 计算伪代码

```text
function computeProofHash(envelope): string
  // 第 1 步：从 envelope 中提取 verdict-critical 子集（白名单）
  proofInput = {
    schemaVersion:        envelope.schemaVersion,
    claim:                normalizeClaim(envelope.claim),
    fecHash:              envelope.fecHash,
    fecSnapshot:          envelope.fecSnapshot,           // 与 fecHash 互验
    protocolFreeze:       envelope.protocolFreeze,
    datasetBindings:      envelope.datasetBindings,
    workflowBindings:     envelope.workflowBindings,
    experimentRuns:       envelope.experimentRuns,
    measurementResults:   envelope.measurementResults,
    statisticalResults:   envelope.statisticalResults,
    verdictTrace:         stripNonSemantic(envelope.verdictTrace),
    antiTheaterReport:    envelope.antiTheaterReport,
    ledgerRoot:           envelope.ledgerRoot,
    verdictKernelVersion: envelope.verdictTrace.kernelVersion,
    rulePriorityTableHash:envelope.verdictTrace.rulePriorityTableHash,
    proofHashInputs:      envelope.verdictTrace.proofHashInputs,
  }
  // Omit: envelopeId, proofHash, signatures, humanSummary, recomputation, UI fields

  // 第 2 步：断言 FEC 一致性（fast-fail）
  assert envelope.fecHash === sha256(canonicalJson(envelope.fecSnapshot))

  // 第 3 步：断言无 NaN/Infinity
  assertNoNaN(proofInput)   // 递归扫描，命中即 throw

  // 第 4 步：canonical 序列化（§1）
  canonical = canonicalJson(proofInput)

  // 第 5 步：sha256 → 64 hex 小写
  return sha256hex(canonical)

function normalizeClaim(claim): Claim
  return {
    ...claim,
    naturalLanguage: normalizeWhitespace(claim.naturalLanguage)  // 统一 \n、trim、折叠多空格
  }
```

`sha256hex`：

```text
function sha256hex(s: string): string
  bytes = utf8Encode(s)
  digest = sha256(bytes)            // 标准 SHA-256，无 salt，无 domain tag（domain tag 见 §9，仅 V2 新对象）
  return lowercaseHex(digest)       // 64 字符，小写
```

### 2.5 proofHash 状态

| 能力 | 状态 |
|---|---|
| `computeProofHash()` TS 实现 | `IMPLEMENTED_VERIFIED`（白名单对象 byte-equal 由 cross_lang 对拍守卫） |
| Python 侧 ProofEnvelope hash | `IMPLEMENTED_UNVERIFIED`（chain/merkle 已实现，proof envelope hash 待补） |
| Browser Web Crypto proofHash | `PARTIAL`（Merkle/Suite 已实现，proof envelope hash 待补） |
| Rust / Go proofHash | `ROADMAP`（V2） |
| WASM proofHash | `ROADMAP`（V3） |

---

## 3. CanonicalHash / canonical_hash（call_records 信任根）

call_records 的 hash chain 是 L0 信任根基座。它的 canonical 输入与 §1 的通用算法一致，但有一个**铁律级约束**：四字段白名单。

### 3.1 CanonicalInput 结构（call_records 专用）

```ts
type CanonicalInput = {
  stageId: string;          // 进 hash
  cred: BailianCredential;  // 进 hash（嵌套对象，递归排序）
  payloadKind: PayloadKind; // 进 hash（9 值 enum 之一）
  prevHash: string;         // 进 hash（上一条 currentHash；首条 = GENESIS_PREV_HASH）
  // 以下字段进入 audit 列，但 NOT 进 hash（黑名单的反面 = 白名单）
  purposeTag?: string;      // 审计列，不进 hash
  seq?: number;             // 自指序号，不进 hash
  currentHash?: string;     // 自指结果，不进 hash
  requestPayload?: unknown; // 审计载荷，不进 hash
  responsePayload?: unknown;// 审计载荷，不进 hash
  finishReason?: string;    // 审计载荷，不进 hash
  usageTokensTotal?: number;// 审计载荷，不进 hash
};
```

### 3.2 四字段白名单铁律（API-1）

> **铁律**：进入 `canonicalHash` 的字段**只能是** `{ stageId, cred, payloadKind, prevHash }`。
> 实现**禁止**用 spread 黑名单（`{ ...input, currentHash: undefined }`），必须**显式白名单**。
> 违反后果：加 `purposeTag` 等审计列时静默带进 hash → 假绿 → hash 漂移 → 信任根崩。

```ts
// TS（项目唯一允许写法）
function canonicalHash(input: CanonicalInput): string {
  const whitelisted = {
    stageId: input.stageId,
    cred: input.cred,
    payloadKind: input.payloadKind,
    prevHash: input.prevHash,
  };
  // 三重防护
  assert(input.prevHash !== undefined, "prevHash undefined");
  assertNoNaN(whitelisted);                       // NaN/Infinity throw
  const stable = stableStringify(whitelisted);    // fast-json-stable-stringify ^2.1
  assert(stable !== undefined, "stableStringify undefined");
  return sha256hex(stable);
}
```

```python
# Python（项目唯一允许写法）
def canonical_hash(hashable) -> str:
    whitelisted = {
        "stageId":     hashable["stageId"],
        "cred":        hashable["cred"],
        "payloadKind": hashable["payloadKind"],
        "prevHash":    hashable["prevHash"],
    }
    return hashlib.sha256(canonical_json(whitelisted).encode("utf-8")).hexdigest()
```

### 3.3 payloadKind 9 值 enum（进 hash 的合法值）

`payloadKind ∈ { hypothesis, narrative, evidence, plan, code_gen, dialogue, meta, measurement, verdict_trace }`。

> 9 值的精确清单与 status 以 `APPENDIX_A_TYPES.md` 为权威；本附录仅锁定“它进 hash 且必须是这 9 个字符串之一”。

### 3.4 GENESIS_PREV_HASH

```text
GENESIS_PREV_HASH = "0".repeat(64)   // 64 个 '0'，首条 call_record 的 prevHash
```

### 3.5 verifyChainHead 算法（验证期）

```text
function verifyChainHead(records: CallRecord[]): void
  // records 按 seq ASC 排序
  expectedPrev = GENESIS_PREV_HASH
  for row in records:
      canonical = rowToCanonicalInput(row)   // 转 camelCase 嵌套，Omit seq/currentHash，保留 prevHash
      recompute = canonicalHash(canonical)
      if recompute !== row.currentHash:
          throw ChainIntegrityError("currentHash mismatch at seq=" + row.seq)
      if row.prevHash !== expectedPrev:
          throw ChainIntegrityError("prevHash chain break at seq=" + row.seq)
      expectedPrev = row.currentHash
  // 全过 = chain 完整（tamper-evident，非 tamper-proof，见 §11）
```

### 3.6 appendRecord 算法（写入期）

```text
function appendRecord(input: CanonicalInput, db): string
  assert input.prevHash === chainHead(db)        // 必须接在链头
  currentHash = canonicalHash(input)
  INSERT INTO call_records (
    seq, prevHash, currentHash, stageId, cred, payloadKind, purposeTag,
    request_payload, response_payload, finish_reason, usage_tokens_total
  ) VALUES (...)
  // 2 个 trigger 守卫：no_update / no_delete（任一触发 RAISE(ABORT)）
  return currentHash
```

### 3.7 hash chain 状态

| 能力 | 状态 |
|---|---|
| `canonicalHash` TS（四字段白名单） | `IMPLEMENTED_VERIFIED` |
| `canonical_hash` Python（四字段白名单） | `IMPLEMENTED_VERIFIED` |
| TS↔Python byte-equal（白名单对象） | `IMPLEMENTED_VERIFIED`（cross_lang_consistency 守卫） |
| `verifyChainHead` TS / Python | `IMPLEMENTED_VERIFIED` |
| append-only trigger（no_update / no_delete） | `IMPLEMENTED_VERIFIED`（SQLite `:memory:` 实测） |
| 浮点科学计数法跨语言对齐 | `NUMERIC_KNOWN_DIVERGENCE`（§8，V3 迁移 RFC 8785） |

---

## 4. Merkle 树与 ledgerRoot

### 4.1 定位

- `ledgerRoot` 是 ProofEnvelope 绑定的**本地 append-only proof ledger 的根哈希**。
- **不**说区块链；公开 transparency log 是 V3 路线（`08_TRACEABILITY_MATRIX.md` §3）。
- V1：`ledgerRoot` 可由 hash chain 链头充当；V2 起提供 Merkle root 与 inclusion proof。

### 4.2 ledger 对象（增量层，接入点 C）

| 表 | 字段 | 说明 |
|---|---|---|
| `ledger_events` | `event_id` / `prev_hash` / `current_hash` / `payload_kind` / `created_at` | 与 `call_records` **同构**的 append-only 事件流，用于非 LLM-call 事件（dataset 绑定、workflow 绑定、verdict seal 等） |
| `merkle_roots` | `tree_id` / `root_hash` / `leaf_count` / `built_at` | 一棵 Merkle 树的根与元数据 |

### 4.3 Merkle 树算法

| 项 | 规则 |
|---|---|
| 叶子 | 每个事件的 `current_hash`（64 hex），按 `event_id` 字典序或写入序（冻结一种，**默认写入序**） |
| 叶子规范化 | 叶子字符串先 canonicalJson（即 `"..."` 包裹）再 sha256，防止恶意叶子值与内部节点碰撞 |
| 内部节点 | `sha256(canonicalJson([leftHex, rightHex]))`，即 `[left, right]` 数组的 canonical JSON 的 sha256 |
| 奇数叶子 | 末尾复制自身（duplicate last leaf）或挂到上一层；**项目冻结：duplicate last leaf** |
| 空树 | `EMPTY_MERKLE_ROOT = sha256(canonicalJson([])) = sha256("[]")` |
| 域分离 | V2 新对象（ledger/claim graph/proof envelope 等）的 hash 输入**必须**包含 `hashDomain` tag（见 §9），防不同对象同形 JSON 语义混淆 |

```text
function merkleRoot(leafHashes: string[]): string
  if leafHashes.length === 0:
      return sha256hex(canonicalJson([]))         // = sha256("[]")
  level = leafHashes.map(h => h)                  // 64 hex 字符串数组，写入序
  while level.length > 1:
      nextLevel = []
      i = 0
      while i < level.length:
          left  = level[i]
          right = (i + 1 < level.length) ? level[i + 1] : level[i]   // 奇数复制末叶
          parent = sha256hex(canonicalJson([left, right]))
          nextLevel.push(parent)
          i += 2
      level = nextLevel
  return level[0]
```

### 4.4 ledgerRoot 与 chainHead 的关系

| 场景 | ledgerRoot 取值 |
|---|---|
| V1（无独立 ledger 表） | `ledgerRoot = chainHead`（call_records 最后一条 `currentHash`） |
| V2（有 ledger_events + merkle_roots） | `ledgerRoot = merkleRoot(所有 ledger_events 的 current_hash)`；envelope 同时绑定 `chainHead` 与 `ledgerRoot` |

### 4.5 ledgerRoot / Merkle 状态

| 能力 | 状态 |
|---|---|
| hash chain chainHead（V1 ledgerRoot） | `IMPLEMENTED_VERIFIED` |
| Merkle root 计算 TS | `IMPLEMENTED_VERIFIED` |
| Merkle root 计算 Python | `IMPLEMENTED_VERIFIED` |
| Merkle root 计算 Browser（Web Crypto） | `IMPLEMENTED_VERIFIED` |
| ledger_events / merkle_roots 表（V2） | `DESIGN_LOCKED`（migration 接入点 C） |
| 公开 transparency log | `ROADMAP`（V3） |

---

## 5. Inclusion Proof 结构

### 5.1 用途

第三方拿到一个叶子（某条 `ledger_event` / `call_record`）和 inclusion proof，**无需**整棵树即可验证该叶子确实在某个 `ledgerRoot` 下——这是“Your Laptop Is The Verifier”的Merkle 侧支柱。

### 5.2 结构

```ts
type MerkleInclusionProof = {
  schemaVersion: "far.merkle_proof.v1";
  treeId: string;              // 对应 merkle_roots.tree_id
  leafIndex: number;           // 叶子在树中的位置（0-based，写入序）
  leafHash: string;            // 64 hex，被证明的叶子 hash
  rootHash: string;            // 64 hex，声称的根
  leafCount: number;           // 树的总叶子数（用于重建奇数层）
  path: MerkleProofStep[];     // 从叶子到根的路径
};

type MerkleProofStep = {
  siblingHash: string;         // 64 hex
  position: "left" | "right";  // sibling 在父节点中的位置
};
```

### 5.3 验证算法

```text
function verifyInclusionProof(proof: MerkleInclusionProof): boolean
  computed = proof.leafHash
  for step in proof.path:
      if step.position === "left":
          // sibling 是左孩子，leaf 是右孩子
          computed = sha256hex(canonicalJson([step.siblingHash, computed]))
      else: // "right"
          computed = sha256hex(canonicalJson([computed, step.siblingHash]))
  return computed === proof.rootHash
  // 注意：verifier 必须独立用 leafCount 与 leafIndex 重建路径形状，
  //       不得信任 proof.path 的顺序本身（防 path 重排攻击）
```

### 5.4 篡改检测矩阵

| 篡改 | 检测点 |
|---|---|
| 改叶子值 | `leafHash` 与 `canonicalJson(叶子内容)` 的 sha256 不符 → 第一层 computed 就错 |
| 改 sibling | 某层 `computed` 偏离 → 最终 `computed !== rootHash` |
| 改 rootHash | verifier 独立重算 root（从全树或从独立 channel 取 root）即可发现 |
| 删叶子（声称不在树里其实真不在） | inclusion proof 不存在；不存在性证明 V2 提供（空子树证据） |
| path 重排 | verifier 用 `leafIndex` 重建路径形状，重排后形状不符 |

### 5.5 inclusion proof 状态

| 能力 | 状态 |
|---|---|
| Merkle inclusion proof 验证 TS | `IMPLEMENTED_VERIFIED` |
| Merkle inclusion proof 验证 Python | `IMPLEMENTED_VERIFIED` |
| Merkle inclusion proof 验证 Browser | `IMPLEMENTED_VERIFIED` |
| 非存在性证明 | `ROADMAP`（V2） |

---

## 6. 五值裁决 enum 与裁决确定性（与 hash 的关系）

### 6.1 五值 enum（固定，禁止第六值）

```ts
type VerdictKind =
  | "CONFIRMED"
  | "REFUTED"
  | "INCONCLUSIVE"
  | "DEGRADED_SCOPE"
  | "UNTESTED";
```

> `UNTESTED` 是第五值。SQLite `RAISE(ABORT)` 是数据库触发器操作，**不是**裁决值。禁止任何第六值，除非同时修改本 SSOT、schema、golden vectors、所有 verifier 与答辩口径。

### 6.2 LLM 不得作为最终裁决者

裁决**必须** deterministic：

- 规则优先级固定（R0–R9，见 `03_EVIDENCE_CONTRACT_AND_VERDICT.md` §6 与 `FINAL_PACKAGE/67`）；
- 证据按 `(evidenceId, sourceHash)` 排序、测试按 `testId` 排序、规则按固定优先级应用、首条决定性规则胜出；
- 自然语言解释**只**由 `humanExplanationTemplateId + ruleTrace` 渲染，**不**进入 `proofHash`，**不**作为裁决输入。

### 6.3 裁决可重算 = verdict 进 proofHash

`verdictTrace.verdict` 进入 `proofHash`（§2.2）。篡改 verdict → proofHash 必变 → 第三方重算 verdict trace（用同一 `VerdictKernelInput`）得到不同 verdict → `proofHash` mismatch → `VERDICT_TRACE_MISMATCH`（`04` §8）。

---

## 7. verdict-critical 字段权威清单（对照 APPENDIX_A）

> 本节是 §2.2 的“裁决维度”视图：哪些字段**改变就会改变 verdict 或 proofHash**。任何 verifier diff report 必须能落到本表的一行。

| 层 | 字段 | 改变后果 | diff report code |
|---|---|---|---|
| claim | `claim.id` / normalized text / `domain` / `scope` | proofHash 变 | `CLAIM_HASH_MISMATCH` |
| FEC | `fecSnapshot` / `fecHash` | proofHash 变；裁决路径可能变 | `FEC_HASH_MISMATCH` |
| protocol | `protocolFreeze`（actor/timestamp/envPolicy/deviationPolicy） | proofHash 变；timestamp 非 freeze/seal 则不进 | `PROTOCOL_FREEZE_MISMATCH` |
| dataset | `contentHash` / `schemaHash` / `statsFingerprint` / `scopeCoverage` | proofHash 变；scope drift → `DEGRADED_SCOPE` | `DATASET_HASH_MISMATCH` |
| workflow | `workflowHash` / `containerDigest` / `environmentHash` / `commandHash` / `seedPolicy` / `networkPolicy` | proofHash 变；digest mismatch → verifier RED | `WORKFLOW_HASH_MISMATCH` |
| run | `inputHashes` / `outputHashes` / `logHashes` / `exitCode` / `deviations` | proofHash 变 | `RUN_HASH_MISMATCH` |
| measurement | `metricValues` / `rawArtifactHashes` / stdout/stderr hashes | proofHash 变 | `MEASUREMENT_HASH_MISMATCH` |
| statistics | `effectSize` / `pValue` / `confidenceInterval` / `power` / `multipleTestingCorrection` / `assumptions` | proofHash 变；可能改变 verdict（p 越 alpha 等） | `STATISTICAL_RESULT_MISMATCH` |
| verdict | `verdict` / `reasonCodes` / `ruleTrace` / `decisiveRuleId` / `evidenceSufficiency` / `protocolDeviations` / `kernelVersion` / `rulePriorityTableHash` | proofHash 变 | `VERDICT_TRACE_MISMATCH` |
| anti-theater | `antiTheaterReport`（label-only / LLM override / post-hoc threshold / dataset drift / scope laundering / missing raw artifact / metric swapping / seed cherry-picking） | proofHash 变；可能强制 `UNTESTED`/`INCONCLUSIVE` | `ANTI_THEATER_FAIL` |
| ledger | `ledgerRoot` / `chainHead` | proofHash 变；chain 断 → `LEDGER_ROOT_MISMATCH` | `LEDGER_ROOT_MISMATCH` |
| schema | `schemaVersion` | verifier 路径变；不支持则 `UNSUPPORTED_SCHEMA_VERSION` | `UNSUPPORTED_SCHEMA_VERSION` |

> 本表与 `APPENDIX_A_TYPES.md` 的字段定义一一对照；若两文档字段名冲突，以 `APPENDIX_A_TYPES.md` 为权威，本附录同步订正。

---

## 8. 已知数值域分叉（NUMERIC_KNOWN_DIVERGENCE）

> **诚实披露**：TS 与 Python 的 canonical 序列化在**浮点科学计数法零填充**上不一致，这是已知分叉，不是 bug。本附录不掩盖。

| 项 | TS 行为 | Python 行为 | 状态 |
|---|---|---|---|
| `1e-7` 序列化 | `"1e-7"` | `"1e-07"` | 已知分叉，归 RED |
| `1e21` 以上 | `"1e+21"` | `"1e+21"`（多数一致） | 边界待核 |
| NaN / Infinity | `assertNoNaN` 抛错 | `allow_nan=False` 抛 ValueError | 一致（双拒） |

**缓解（V1）**：

1. **四字段白名单结构性排斥浮点**：`call_records` 的 canonical hash 输入（stageId/cred/payloadKind/prevHash）全部是字符串/嵌套字符串对象，**不含浮点**，因此 cross_lang byte-equal 在信任根上成立（`IMPLEMENTED_VERIFIED`）。
2. **ProofEnvelope 中的数值字段**（pValue、effectSize 等）若进入 proofHash，须在 schema 层声明为字符串承载（如 `"pValue": "0.043"`）或在 V1 显式纳入 NUMERIC_KNOWN_DIVERGENCE 归 RED。
3. **V3 迁移**：统一迁移到 RFC 8785 JCS（JSON Canonicalization Scheme），消除科学计数法零填充差异；同时处理补充平面 / emoji / ZWJ 序列化边界。

> **CI 守卫**：`cross_lang_consistency.test.ts` 对拍 golden vectors；白名单对象对拍为真绿，浮点向量按 NUMERIC_KNOWN_DIVERGENCE 诚实归 RED（非设计期故意红，非 bug）。

---

## 9. Domain Separation（V2 新对象）

V2 起所有**新**对象的 canonical hash 输入必须携带 `hashDomain` tag，防止不同对象同形 JSON 语义混淆。现有 V1 hash（call_records）保持不改。

```ts
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

> **规则**：V1 call_records hash **不**加 domain tag（保 byte-equal 回归）。V2 新对象（FEC / dataset binding / workflow binding / verdict trace / proof envelope / claim graph / ledger event）启用 domain separation。状态：`DESIGN_LOCKED`，实现为 `ROADMAP`（V2）。

---

## 10. Golden Vectors 与跨语言对拍

### 10.1 用途

固定不变的 canonical 输入 fixture + 期望 sha256 hex，三用途：

1. **跨语言 byte-equal**：TS hex === Python hex === Browser hex；
2. **跨时间回归**：重构 canonical 实现后回测，hex 不变；
3. **snapshot 迁移重算锚点**：升级序列化算法（V3 → RFC 8785）时，已知向量重算并记录 before/after hex。

### 10.2 当前 fixture 范围（状态纪律）

- `REPRO_CONTEXT_FIXTURE`：单向量 expectedHex `96a6372bdf04…af4abf4`（**`IMPLEMENTED_VERIFIED`**，E4 双向生成回填真实值；**非 merkle 根**，是一个 canonical 输入向量的 sha256）。
- 数值类向量（浮点 / 大整数 / NaN-reject）：覆盖范围以 `golden_vectors.json` 实测为准，状态由 `far status` 报告（**不手填数字**）。
- 历史 `9f1d2f0c…0000` 占位值：已 `RETIRED`（W0 FI-10 被真实 `96a6372b` 取代）。

### 10.3 mutation vectors（必含期望失败点）

| Suite | 内容 |
|---|---|
| `canonical_json_vectors` | strings / unicode / arrays / objects / numeric boundaries / rejects |
| `chain_vectors` | valid chain / broken prev / broken current |
| `merkle_vectors` | odd leaves / proof direction / tamper leaf |
| `proof_envelope_vectors` | valid / tampered proofHash / reordered checks |
| `verdict_trace_vectors` | 全部五值 |

每个 mutation vector 必须声明期望的 `brokenAtSeq` 或失败 rule id。

> 向量数量与覆盖率不手填，一律来自 `far status`；缺失字段写 `Pending` 或 `NEEDS_EXTERNAL_VERIFICATION`。

---

## 11. tamper-evident 与 tamper-proof 的边界（诚实口径）

| 性质 | 是否成立 | 说明 |
|---|---|---|
| chain hash 断裂可检测 | **是**（tamper-**evident**） | 任一 record 的 prevHash/currentHash 被改，verifyChainHead 抛 `ChainIntegrityError` |
| SQLite trigger 防 UPDATE/DELETE | **是**（DB 层守卫） | `:memory:` 实测为绿 |
| 防 DROP TRIGGER | **否** | DROP TRIGGER 可绕过 DB 层防护 |
| 防 DROP TABLE / 物理篡改 db 文件 | **否** | 靠 external anchor（`gitCommitSha` / crossref DOI / 公开 transparency log V3）兜底 |
| 物理不可篡改 | **否**（禁用词） | 不得声称“物理不可篡改”；正确口径：“append-only tamper-evident，靠 external anchor 兜底为可检测” |

> 因此本附录所有“信任根”声称都应读作 **tamper-evident**，不是 tamper-proof。这与 `07_RISK_REGISTER_AND_DO_NOT_CLAIM.md` 的 R6 / `01` 的诚实口径一致。

---

## 12. 与其他文档的咬合

| 文档 | 关系 |
|---|---|
| `APPENDIX_A_TYPES.md` | 字段名 / 类型名权威；本附录字段与之对照，冲突时以 A 为准 |
| `APPENDIX_F_GLOSSARY.md` | 术语权威；canonical / proofHash / ledgerRoot / tamper-evident 等定义以 F 为准 |
| `01_SOURCE_OF_TRUTH_AND_STATUS.md` | 状态标签、禁手填数字、路径约定（`<REPOSITORY_ROOT>/`） |
| `02_ARCHITECTURE.md` | Core Trust Root 分区、数据对象最小内容、实现原则 |
| `03_EVIDENCE_CONTRACT_AND_VERDICT.md` | FEC 结构、五值 enum、裁决内核输入输出、anti-theater 规则 |
| `04_PROOF_ENVELOPE_AND_VERIFIER.md` | ProofEnvelope V2 结构、proofHash 纪律、`.far-proof` bundle、独立验证等级、diff report |
| `05_AI4S_PRODUCT_DEMO_AND_BENCHMARK.md` | demo 中篡改演示须真实改 verdict-critical 字段（本附录 §7） |
| `07_RISK_REGISTER_AND_DO_NOT_CLAIM.md` | 禁用词（物理不可篡改 / 证明科学真理 等）、tamper-evident 措辞 |
| `08_TRACEABILITY_MATRIX.md` | 旧 `far-chain/` 路径废弃、旧 4 值 verdict 废弃、Rust/Go/WASM verifier 降级为 V2/V3 |

---

## 13. 历史口径与已退役内容（仅作溯源）

> 下列口径在历史 `FINAL_PACKAGE` 中出现过，现 `RETIRED`，仅保留溯源。物理档案已退役，备份位置 `C:/Users/RichardYuan/FAR-Lab_Backups/`。

| 历史口径 | 现口径 | 来源（旧编号 → 新位置） |
|---|---|---|
| `far-chain/` 是真实实现子目录 | `<REPOSITORY_ROOT>/` 是当前实现根 | `56` §2.2 → `01` §1 / `08` §2 |
| `9f1d2f0c…0000` golden 占位值 | `RETIRED`，被 `96a6372bdf04…af4abf4` 真实值取代 | `56` §2.3 / `digest_C01` → 本附录 §10 |
| `96a6372b` 是 merkle 根 | **是 REPRO_CONTEXT_FIXTURE 单向量 expectedHex，非 merkle 根** | `56` §2.3 → 本附录 §10 |
| 4 值 verdict | 5 值 verdict（+ `UNTESTED`） | `03_EXISTING_ARCHITECTURE` §7 → `03_EVIDENCE_CONTRACT_AND_VERDICT.md` §5 / 本附录 §6 |
| 旧“扁平化 hash 输入”写法 | 嵌套 CanonicalInput，Omit `seq`/`currentHash`，保留 `prevHash` | `03_EXISTING_ARCHITECTURE` §4 N1 → 本附录 §3 |
| `physical interception / 物理拦截` | tamper-evident（非 tamper-proof） | `56` §4 R6 → 本附录 §11 |
| 跨语言字节相等“已实证 LIVE”（全域） | 四字段白名单已实证；浮点科学计数法已知分叉 | `56` §4 R7 / `digest_C01` → 本附录 §8 |

> 旧编号（如 `03_EXISTING_ARCHITECTURE.md`）作为来源溯源保留；其物理档案随 `FINAL_PACKAGE` 退役，备份见 `C:/Users/RichardYuan/FAR-Lab_Backups/`。后续维护引用本附录与 `APPENDIX_A/F` 即可，不再回引旧编号作为有效依赖。

---

## 14. 答辩口径（canonical 与 hash 侧）

**问：你们的 hash 真的跨语言逐字节相等吗？**
答：在四字段白名单对象（call_records 信任根）上**是**，由 TS/Python/Browser 三路 cross_lang 对拍守卫。在浮点科学计数法上有一个已知分叉（`1e-7` vs `1e-07`），我们把它做成诚实披露 + demo 卖点（现场 diff），不掩盖；V3 统一迁移到 RFC 8785 JCS。

**问：篡改真的能被发现吗？**
答：chain hash 任一断裂、Merkle inclusion proof 任一 sibling 不符、proofHash 任一 verdict-critical 字段变化，都会被独立重算的 verifier 检出。这是 **tamper-evident**，不是 tamper-proof——DROP TRIGGER 可绕过 DB 层，所以靠 external anchor（gitCommitSha / crossref DOI / V3 公开日志）兜底。

**问：proofHash 怎么保证 LLM 没偷偷改 verdict？**
答：verdict 由 deterministic kernel 产出的 rule trace 决定，rule trace 进 proofHash；自然语言解释不进。第三方用同一 `VerdictKernelInput` 重算 verdict，若与 envelope 中的 verdict 不符 → `VERDICT_TRACE_MISMATCH`。

**问：LLM 能当裁决者吗？**
答：不能。LLM 可生成候选 claim / 草拟 FEC / 解释，但裁决由固定优先级的 deterministic 规则做；`UNTESTED` 优先于 `INCONCLUSIVE`，`REFUTED` 不得被 `DEGRADED_SCOPE` 隐藏。

---

> 本附录冻结信任根的“确定性结构”与“哈希”两根支柱。任何修改四字段白名单、五值 enum、proofHash 白名单、Merkle 算法或 NUMERIC_KNOWN_DIVERGENCE 处置的提议，必须同时修改本附录、`APPENDIX_A_TYPES.md`、golden vectors、所有 verifier 与答辩口径——否则不成立。
