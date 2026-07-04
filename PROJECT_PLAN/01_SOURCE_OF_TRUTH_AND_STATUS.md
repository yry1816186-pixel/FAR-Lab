# 01 单一事实源与状态规则

> 本文件是 FAR-Chain 全项目文档体系的**根 SSOT**。它冻结四件事：仓库路径事实、文档优先级 P0-P3、状态标签 taxonomy、禁止手填裸统计与外部事实纪律。
>
> 跨文档权威关系：类型字段以 `APPENDIX_A_TYPES.md` 为权威、canonical 字节规则以 `APPENDIX_C_CANONICAL.md` 为权威、术语语义与表述口径以 `APPENDIX_F_GLOSSARY.md` 为权威、本文件（01）冻结状态纪律与路径约定。冲突时：类型字段→A、字节规则→C、术语语义→F、状态/路径/优先级→本 01。本 01 与三附录构成 P0 内部四权威。
>
> 自包含声明：`FINAL_PACKAGE/`（旧 `00`-`86` + `_digest`）是**已归档历史口径**，物理档案已退役，离线完整备份位于 `C:/Users/RichardYuan/FAR-Lab_Backups/`。本文件不再以 `FINAL_PACKAGE/X` 作为有效依赖；引用旧编号仅作来源溯源，物理档案的查阅路径为 `C:/Users/RichardYuan/FAR-Lab_Backups/FINAL_PACKAGE/`。
>
> 一句话口径：**任何对外材料中出现裸数字、禁用词、`far-chain/` 作为真实实现根、第六值 verdict、LLM 作为最终裁决者，即视为违反本 SSOT。**

---

## 1. 仓库路径事实

最终口径中，当前实现仓库就是 `<REPOSITORY_ROOT>/`。

### 1.1 单一路径前缀铁律

`<REPOSITORY_ROOT>` 即**工作区根目录**（包含 `src/` `schema/` `frontend/` `tests/` `golden_vectors/` 的目录），**不是** `far-chain/` 子目录。

- **禁止继续把 `far-chain/` 子目录当作真实实现根**。旧文档中出现的 `far-chain/` 一律解释为历史规划路径，不作为当前工程路径（来源溯源：旧 `56_SOURCE_OF_TRUTH_RECONCILIATION.md` §2.2 已订正；旧 `01_PROJECT_FACTS.md` §0.1「运行时代码 = 0 行」属 stale 历史判断，已被实现推翻）。
- 命令示例中**禁止**写 `cd far-chain && pnpm install`——评委照此跑会直接失败（路径级崩溃，被红队列为 W0 硬门 RR-1）。
- `packages/` → `src/` 路径订正：当前 `src/` 扁平现实优先，多包拆分只作为 V3 路线。

### 1.2 标准路径表

| 约定 | 含义 |
|---|---|
| `<REPOSITORY_ROOT>/src` | TypeScript / 核心实现 |
| `<REPOSITORY_ROOT>/tests` | 测试 |
| `<REPOSITORY_ROOT>/schema` | 数据库 schema 和 migration |
| `<REPOSITORY_ROOT>/schema/migrations` | SQL migration（0001-0008 已锁；0009+ 走独立 migration，见 `APPENDIX_F_GLOSSARY.md` §7.4） |
| `<REPOSITORY_ROOT>/frontend` | 前端或 browser verifier 相关资产 |
| `<REPOSITORY_ROOT>/repro` | Python 或其他复核实现 |
| `<REPOSITORY_ROOT>/repro/far_chain_repro` | Python canonical_hash / verify_chain 等确定性复核 |
| `<REPOSITORY_ROOT>/golden_vectors` | golden vectors（`REPRO_CONTEXT_FIXTURE` 单向量 expectedHex = `96a6372bdf04…af4abf4`，**非 merkle 根**） |
| `<REPOSITORY_ROOT>/PROJECT_PLAN` | 最终规划和执行口径（P0 文档源，含本文件 + `APPENDIX_A/C/F` 三权威） |
| `<REPOSITORY_ROOT>/FINAL_PACKAGE` | 【已归档历史口径】设计/规划/答辩档案，物理档案已退役，备份在 `C:/Users/RichardYuan/FAR-Lab_Backups/` |

### 1.3 跨平台路径纪律

- Windows 路径、空格路径、离线目录都必须可运行（`far verify` P0 验收项）；
- 命令一律写 `<REPOSITORY_ROOT>/` 或显式"工作区根即实现仓"；
- 不写真实个人路径、用户名、邮箱、密钥或本机信息（守 S1 / 隐私门）。

---

## 2. 文档优先级（P0-P3）

| 优先级 | 来源 | 说明 |
|---|---|---|
| **P0** | 顶层 `PROJECT_PLAN/`（本文件 + `APPENDIX_A_TYPES.md` + `APPENDIX_C_CANONICAL.md` + `APPENDIX_F_GLOSSARY.md` + 02-10 章正文） | 最终规划和执行口径 |
| **P1** | 可执行状态命令（`far status --json`）、CI、测试输出 | 实现状态与数量的唯一事实源 |
| **P2** | 当前代码（`<REPOSITORY_ROOT>/src` 等） | 接口和能力以实际代码为准 |
| **P3** | 旧 `00`-`86` 与 `_digest`（已归档至 `C:/Users/RichardYuan/FAR-Lab_Backups/`） | 历史来源，不直接覆盖 P0/P1/P2 |

### 2.1 冲突裁决规则

- **若 P0 与代码现实（P2）冲突** → **开修订项**（`09_GAP_CLOSURE_LOG.md`），**不是**用旧文档覆盖代码；
- **若 P0 内部四权威冲突** → 类型字段以 `APPENDIX_A_TYPES.md` 为准、canonical 字节规则以 `APPENDIX_C_CANONICAL.md` 为准、术语语义以 `APPENDIX_F_GLOSSARY.md` 为准、状态/路径/优先级以本 01 为准；
- **若 P0 与 P1 冲突**（如文档声称 X 测试通过但 `far status` / CI 报告不同） → **以 P1 为事实源**，开修订项订正 P0 文档；
- **若 P0 与 P3 冲突** → P0 胜，P3 仅作来源溯源（`08_TRACEABILITY_MATRIX.md` 保留旧编号 → 新位置映射）。

### 2.2 附录三权威咬合

| 附录 | 权威域 | 边界 |
|---|---|---|
| `APPENDIX_A_TYPES.md` | 类型字段名、TS interface 字段、enum 字段集合 | 不定义术语语义（语义归 F） |
| `APPENDIX_C_CANONICAL.md` | canonical 序列化字节规则、key 排序、数值格式化、白名单处理 | 不定义术语语义；与 A 的字段名必须一致 |
| `APPENDIX_F_GLOSSARY.md` | 术语语义、命名主名/弃用名、禁用词、路径约定 | 不重定义字段；引用 A 的字段名、C 的字节规则 |

---

## 3. 状态标签 taxonomy（全标签含义）

所有能力必须标注状态，不允许混写"已实现"和"应实现"。每个能力描述**必须带且只带一个**下列核心状态标签。

| 标签 | 含义 | 适用场景 |
|---|---|---|
| `IMPLEMENTED_VERIFIED` | 已在当前代码和测试中核实 | 有测试 + CI + golden vector 实测为绿的能力 |
| `IMPLEMENTED_UNVERIFIED` | 代码存在，但本轮未完成测试核实 | 有实现但测试未覆盖或未跑 |
| `PARTIAL` | 有局部实现，尚未闭环 | 如 ProofEnvelope V1（有 self-check 但未到 V2 binding） |
| `DESIGN_LOCKED` | 设计已定，可进入实现 | schema / interface / 状态机已冻结，代码未写 |
| `ROADMAP` | 方向明确，但不作为当前完成能力 | Rust/Go verifier、external transparency log、formal proof |
| `RESEARCH` | 研究设想，不能写入当前功能声明 | TLA+ 全系统形式化、Self-Improving Reliability Compiler |
| `RETIRED` | 旧口径废弃，只保留历史解释 | 4 值 verdict、`far-chain/` 路径、OS 口径 |
| `NEEDS_EXTERNAL_VERIFICATION` | 外部事实未在当前回合复核，答辩前必须查证 | 外部竞品发布时间、arXiv 引用、novelty 查新、snapshot 维护期 |

### 3.1 状态标注扩展词（修饰词，不替代 8 个核心标签）

`已存在` / `已设计` / `待实现` / `待实测` / `MVP必须实现` / `可选增强` / `长期路线` / `UNKNOWN` / `UNVERIFIED` / `NEEDS_REAL_TEST` / `NEEDS_REAL_ENV` / `NEEDS_HUMAN_OPERATION` / `NEEDS_GPU_VALIDATION` / `COMPETITION_MUST` / `OPEN_SOURCE_ENHANCEMENT` / `PAPER_ROUTE` / `FUTURE_VISION` / `DO_NOT_CLAIM_AS_DONE`

这些是**修饰词**，与上述 8 个核心标签**配合使用**。例如："canonicalHash — `IMPLEMENTED_VERIFIED`（4 字段白名单 + 数值类已实证；RFC 8785 边界 `NEEDS_REAL_TEST`）"。

### 3.2 状态标签强制纪律

- **禁止"已实现"与"应实现"混写**：任一能力描述若同时出现"已有实现痕迹"和"应补齐"，必须拆为两条带不同标签的描述；
- **禁止手填裸状态**：如"覆盖率 92.80%"必须改写为来自 `far status --json` 的字段引用；
- **状态变更需留 audit trail**：能力从 `PARTIAL` 升级到 `IMPLEMENTED_VERIFIED` 必须在 `09_GAP_CLOSURE_LOG.md` 登记。

---

## 4. 禁止手填裸统计

以下信息**不得手动写死**在 README、PPT、答辩稿或报告中：

- 测试数量；
- TS / Python 文件数量；
- CI 通过率；
- benchmark 数量；
- 当前 commit；
- 当前外部竞品发布时间和功能；
- 覆盖率（line / branch / function）；
- migration 数量；
- golden vector 数量；
- 文档计数（如"32 / 39 / 43 份"）；
- suite integrity root / merkle root 实测值；
- "第一" / "唯一" / "最新"等强时效或强 novelty 结论。

### 4.1 历史数字漂移（已订正，仅作溯源）

> 来源：旧 `56_SOURCE_OF_TRUTH_RECONCILIATION.md` §2.1 红队核实。这些数字曾四方漂移（`546 / 662 / 1038 / 1092`），是诚信红线（RR-1 W0 硬门）。此处保留作为**已订正的反面教材**，不作为有效口径。

| 来源 | 历史声称 | 状态 |
|---|---|---|
| 早期文档（旧 01/03/04/12/17/23/25/26/28/39） | `546 pass` | stale |
| 旧 40 号 | `662 主环 / 1038 总计` | 部分 stale |
| 旧 README.md:93 | `1038 tests pass`（硬编码） | stale |
| 旧红队 score_projection | `1092 测试 fresh-clone 全绿` | 凭空多出 54 |
| **status-dump CLI（唯一 SSOT）** | `<TEST_COUNT_FROM_STATUS_DUMP>` | 待 CLI 实测回填 |

**根因**：测试数随实现增长，文档手填数字滞后/超前；README badge 硬编码 shields.io；评分段又凭空造新数字。没有一个单一真源。**修复**：`far status --json` 从 `git HEAD` 实测 `pnpm test` pass 数，作为唯一数字源。

### 4.2 这些信息必须来自

1. `far status --json` 或等价 status dump；
2. CI 输出；
3. `git rev-parse HEAD`；
4. 可复核脚本；
5. 答辩前重新检索的外部来源。

### 4.3 占位符纪律

若 status 工具尚未覆盖某字段，该字段在文档中**只能写**：

- `Pending`（工具即将覆盖，待回填）；或
- `NEEDS_EXTERNAL_VERIFICATION`（需答辩前人工查证，如外部竞品发布时间）；或
- 显式占位符 `<X_FROM_STATUS_DUMP>`（CI 构建时由 `far status --json` 回填）。

**禁止**：把一次性手填的数字直接写进 README/文档（即使加了"实测于 X 日"也属于禁用，因为日期一过即 stale）。

### 4.4 status-dump 覆盖字段映射（与 §5 字段表对照）

| 文档中的占位符 | status-dump 字段 | 实测来源 |
|---|---|---|
| `<TEST_COUNT_FROM_STATUS_DUMP>` | `testCount` | `pnpm test` 实跑 pass 数 |
| `<TS_FILE_COUNT>` | `tsFileCount` | `glob src/**/*.ts` |
| `<MIGRATION_COUNT>` | `migrationCount` | `glob schema/migrations/*.sql` |
| `<GOLDEN_VECTOR_COUNT>` | `goldenVectorCount` | 读 `golden_vectors.json` |
| `<COVERAGE_LINE>` / `<COVERAGE_BRANCH>` | `coverageLine` / `coverageBranch` | `pnpm coverage` 实跑 |
| `<SUITE_INTEGRITY_ROOT>` | `suiteIntegrityRoot` | 读取 `benchmark/benchmark_report.json`（由 `runBenchmark` 生成） |
| `<DOC_COUNT>` | `docCount` | `glob FINAL_PACKAGE/*.md`（历史）或 `PROJECT_PLAN/*.md`（当前） |
| `<COMMIT_SHA>` | `commitSha` | `git rev-parse HEAD`（若存在） |

---

## 5. Status Dump 规范

P0 工程应补齐一个机器可读状态输出，它是全项目数字与状态的**唯一 SSOT 源**。

### 5.1 CLI 调用

```bash
far status              # 人类可读状态报告
far status --json       # 机器可读 JSON，供文档构建时回填占位符
```

> 工程入口：`src/cli/far.ts`（`far` CLI 家族子命令）。`far status` 是 FI-1 CLI 家族子命令，也是 FI-10 诚实地基的唯一数字源。

### 5.2 完整 JSON schema（机器可读 SSOT）

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "FarStatusDump",
  "description": "FAR-Chain 全项目状态与数字的唯一 SSOT 源。所有字段从 git HEAD 实测，零手填。",
  "type": "object",
  "required": [
    "project", "generatedAt", "commit", "nodeVersion", "platform",
    "test", "coverage", "fileCounts", "goldenVectors", "capabilities",
    "chainHead", "suiteIntegrityRoot", "warnings"
  ],
  "additionalProperties": false,
  "properties": {
    "project": {
      "type": "string",
      "const": "FAR-Chain",
      "description": "项目主名（与 APPENDIX_F_GLOSSARY.md §1.1 一致）。"
    },
    "generatedAt": {
      "type": "string",
      "format": "date-time",
      "description": "ISO-8601 时间戳，表示 dump 生成时刻。"
    },
    "commit": {
      "type": "object",
      "description": "git HEAD 实测。无 commit 时全字段为 null。",
      "required": ["sha", "shortSha", "branch", "isDirty"],
      "properties": {
        "sha": { "type": ["string", "null"], "pattern": "^[0-9a-f]{40}$" },
        "shortSha": { "type": ["string", "null"] },
        "branch": { "type": ["string", "null"] },
        "isDirty": { "type": "boolean" }
      }
    },
    "nodeVersion": { "type": "string", "description": "运行时 Node 版本，如 v20.11.0。" },
    "platform": {
      "type": "object",
      "required": ["os", "arch"],
      "properties": {
        "os": { "type": "string", "enum": ["win32", "linux", "darwin"] },
        "arch": { "type": "string", "enum": ["x64", "arm64", "ia32"] }
      }
    },
    "test": {
      "type": "object",
      "required": ["status", "totalCount", "passedCount", "failedCount", "skippedCount"],
      "properties": {
        "status": { "type": "string", "enum": ["pass", "fail", "pending"] },
        "totalCount": { "type": ["number", "string"], "description": "数字或 'Pending'。" },
        "passedCount": { "type": ["number", "string"] },
        "failedCount": { "type": ["number", "string"] },
        "skippedCount": { "type": ["number", "string"] },
        "runnerName": { "type": "string", "description": "如 'vitest' / 'pnpm test'。" }
      }
    },
    "coverage": {
      "type": "object",
      "required": ["status", "line", "branch", "function"],
      "properties": {
        "status": { "type": "string", "enum": ["pass", "fail", "pending"] },
        "line": { "type": ["number", "string"], "description": "百分比数字或 'Pending'。" },
        "branch": { "type": ["number", "string"] },
        "function": { "type": ["number", "string"] },
        "tool": { "type": "string", "description": "如 'c8' / 'vitest --coverage'。" }
      }
    },
    "fileCounts": {
      "type": "object",
      "description": "实测文件计数。未覆盖字段为 'Pending'。",
      "properties": {
        "tsSourceCount": { "type": ["number", "string"] },
        "tsTestCount": { "type": ["number", "string"] },
        "pythonCount": { "type": ["number", "string"] },
        "frontendCount": { "type": ["number", "string"] },
        "sqlMigrationCount": { "type": ["number", "string"] },
        "docCount": { "type": ["number", "string"] }
      }
    },
    "goldenVectors": {
      "type": "object",
      "description": "golden vector 实测。",
      "properties": {
        "count": { "type": ["number", "string"] },
        "reproContextFixtureExpectedHex": {
          "type": "string",
          "const": "96a6372bdf040677c26700456856ec365b478f9e3bf8824e4b2b9d123af4abf4",
          "description": "REPRO_CONTEXT_FIXTURE 单向量 expectedHex（非 merkle 根，非 proofHash）。"
        },
        "crossLangByteEqual": {
          "type": "string",
          "enum": ["verified", "divergence", "pending"],
          "description": "TS===Python===Browser 对拍状态。四字段白名单 verified；浮点科学计数法 divergence。"
        },
        "numericKnownDivergence": {
          "type": "array",
          "items": { "type": "string" },
          "description": "已知分叉列表，如 ['1e-7 科学计数法零填充']。"
        }
      }
    },
    "chainHead": {
      "type": "object",
      "description": "evidence_log DB 链头验证结果；未传 --db 时为 pending。",
      "properties": {
        "status": { "type": "string", "enum": ["ok", "broken", "pending"] },
        "reason": { "type": "string" },
        "verifiedCount": { "type": "number" },
        "brokenAtSeq": { "type": "number" }
      }
    },
    "suiteIntegrityRoot": {
      "type": "string",
      "description": "benchmark/benchmark_report.json 中的套件级完整性根；无法读取时为 'Pending'。",
      "pattern": "^[0-9a-f]{64}$|^Pending$"
    },
    "capabilities": {
      "type": "object",
      "description": "能力口径表（由 src/cli/status_dump.ts 生成）。值为本 §3 的 8 个状态标签之一。",
      "required": [
        "canonicalHash", "fiveValueVerdict", "fecV2", "proofEnvelopeV2",
        "farVerify", "farExportReceipt", "farExportFarProof", "farBenchRun",
        "browserVerifier", "pythonVerifier"
      ],
      "additionalProperties": false,
      "properties": {
        "canonicalHash": { "$ref": "#/$defs/StatusTag" },
        "fiveValueVerdict": { "$ref": "#/$defs/StatusTag" },
        "fecV2": { "$ref": "#/$defs/StatusTag" },
        "proofEnvelopeV2": { "$ref": "#/$defs/StatusTag" },
        "farVerify": { "$ref": "#/$defs/StatusTag" },
        "farExportReceipt": { "$ref": "#/$defs/StatusTag" },
        "farExportFarProof": { "$ref": "#/$defs/StatusTag" },
        "farBenchRun": { "$ref": "#/$defs/StatusTag" },
        "browserVerifier": { "$ref": "#/$defs/StatusTag" },
        "pythonVerifier": { "$ref": "#/$defs/StatusTag" }
      }
    },
    "warnings": {
      "type": "array",
      "items": { "type": "string" },
      "description": "诚实警告列表，默认至少含一条提醒：禁手填裸数字。"
    }
  },
  "$defs": {
    "StatusTag": {
      "type": "string",
      "enum": [
        "IMPLEMENTED_VERIFIED",
        "IMPLEMENTED_UNVERIFIED",
        "PARTIAL",
        "DESIGN_LOCKED",
        "ROADMAP",
        "RESEARCH",
        "RETIRED",
        "NEEDS_EXTERNAL_VERIFICATION"
      ]
    }
  }
}
```

### 5.3 字段来源与用途对照

| 字段 | 来源 | 用途 |
|---|---|---|
| `testCount` | `pnpm test` 实跑 pass 数 | 替换全文档 `<TEST_COUNT_FROM_STATUS_DUMP>` |
| `tsFileCount` | `glob src/**/*.ts` | 替换"137/145 TS 文件"漂移 |
| `migrationCount` | `glob schema/migrations/*.sql` | 替换"0001-0008 vs 0018/0026"矛盾 |
| `goldenVectorCount` | 读 `golden_vectors.json` | 替换"8/9/10 向量"漂移 |
| `coverageLine` / `coverageBranch` | `pnpm coverage` 实跑 | 替换"92.80% / 79.56%"漂移 |
| `suiteIntegrityRoot` | 读取 `benchmark/benchmark_report.json`（由 `runBenchmark` 生成） | 替换 golden 根声称 |
| `docCount` | `glob PROJECT_PLAN/*.md`（当前） | 替换"32/39/43 份"漂移 |
| `commitSha` | `git rev-parse HEAD`（若存在） | 替换旧 `07a8005`（红队核实仓库曾有/无 commit 漂移） |
| `capabilities.*` | 各能力当前代码 + 测试核实 | 替换 §6 能力口径表中的状态枚举 |

### 5.4 构建时回填

CI 在文档构建阶段跑 `far status --json`，把占位符 `<X_FROM_STATUS_DUMP>` 替换为实测值。**禁手填数字**——这是 W0 验收门 RR-1 的 grep 校验项。

### 5.5 最小可演示 dump（status 工具未覆盖字段时）

当 `far status` 尚未实现时，人类文档引用统计时，应引用这个 JSON 的字段，而不是复制粘贴一次性数字。最小示例：

```json
{
  "project": "FAR-Chain",
  "generatedAt": "<ISO-8601>",
  "commit": { "sha": "<COMMIT_SHA>", "shortSha": null, "branch": null, "isDirty": true },
  "nodeVersion": "Pending",
  "platform": { "os": "win32", "arch": "x64" },
  "test": { "status": "pending", "totalCount": "Pending", "passedCount": "Pending", "failedCount": "Pending", "skippedCount": "Pending", "runnerName": "Pending" },
  "coverage": { "status": "pending", "line": "Pending", "branch": "Pending", "function": "Pending", "tool": "Pending" },
  "fileCounts": {
    "tsSourceCount": "Pending", "tsTestCount": "Pending",
    "pythonCount": "Pending", "frontendCount": "Pending",
    "sqlMigrationCount": "Pending", "docCount": "Pending"
  },
  "goldenVectors": {
    "count": "Pending",
    "reproContextFixtureExpectedHex": "96a6372bdf040677c26700456856ec365b478f9e3bf8824e4b2b9d123af4abf4",
    "crossLangByteEqual": "verified",
    "numericKnownDivergence": ["1e-7 科学计数法零填充 (TS→1e-7 / Py→1e-07)"]
  },
  "chainHead": { "status": "pending", "reason": "未提供 --db" },
  "suiteIntegrityRoot": "Pending",
  "capabilities": {
    "canonicalHash": "IMPLEMENTED_VERIFIED",
    "fiveValueVerdict": "IMPLEMENTED_VERIFIED",
    "fecV2": "PARTIAL",
    "proofEnvelopeV2": "PARTIAL",
    "farVerify": "IMPLEMENTED_VERIFIED",
    "farExportReceipt": "IMPLEMENTED_VERIFIED",
    "farExportFarProof": "IMPLEMENTED_VERIFIED",
    "farBenchRun": "IMPLEMENTED_VERIFIED",
    "browserVerifier": "IMPLEMENTED_VERIFIED",
    "pythonVerifier": "IMPLEMENTED_VERIFIED"
  },
  "warnings": [
    "No hand-filled metrics in public materials",
    "Cross-language byte-equal is verified on 4-field whitelist only; 1e-7 scientific notation divergence disclosed."
  ]
}
```

---

## 6. 当前能力口径

基于旧文档归并与本轮代码审计，当前可作为规划基线的能力分层如下。**进入开发前仍须由 `far status`、CI 和代码审计重新确认**（状态标签定义见 §3）。

> 本表与 `APPENDIX_F_GLOSSARY.md` §1.1 FAR-Chain 定位、`APPENDIX_A_TYPES.md` 类型族状态总结、`APPENDIX_C_CANONICAL.md` 各能力状态表保持一致；冲突时以三附录与本表的当前字段为准。

### 6.1 能力口径表

| 能力 | 状态 | 规划口径 |
|---|---|---|
| evidence log chain | `PARTIAL` | 已有实现痕迹（append-only + canonicalHash + chain verifier + Merkle root/proof），需以代码和测试确认闭环；payload/evidence/verdict node 不直接进 chain leaf 是已知闭环缺口 |
| canonical hash / golden vector | `IMPLEMENTED_VERIFIED` | 属于核心信任根，必须保持最高优先级。四字段白名单 + 数值类已实证 byte-equal；浮点科学计数法（`1e-7` 鸿沟）按 `NUMERIC_KNOWN_DIVERGENCE` 诚实归 RED，待 V3 迁移 RFC 8785 JCS |
| five-value verdict | `PARTIAL` | 语义已锁定（`VerdictKind` 5 值 enum 冻结，禁止第六值）；工程上需升级为 metric-first deterministic kernel（输出 rule trace + reason codes + evidence sufficiency + statistical uncertainty） |
| ConfoundingGate F6（因果混杂门） | `IMPLEMENTED_VERIFIED`（#12） | `claimType='causal'` 时 verdict kernel 在 R7 CONFIRMED 前调用确定性 d-separation + 后门路径枚举（非 LLM 推理混杂）。`src/confounding_gate/`（Koller-Friedman Bayes-Ball·修正 SSOT §7.5.1 伪代码两处缺陷见 03）+ R-causal 门（`verdict_kernel_v2.ts`·非因果 claim 字节级零回归）+ science_harness hero-B 路径 + CG-1/2/5/6 CI 门（`pnpm run confounding-gate-scan`）。三 claimType hero fixture 全交付（`countDeliveredV1ClaimFixtures()===3`）；claimType 暂为 kernel 输入提示（非哈希保护·封存任务延后） |
| ProofEnvelope V1 | `PARTIAL` | V1 有 9 rule validator + sealer + proofHash + DB backstop + TS 重算脚本；P0 要升级为 V2 proofHash binding（绑定 SciIR fields + claim graph + cross-language proofHash） |
| Python verifier | `IMPLEMENTED_VERIFIED` | chain/Merkle verifier + ProofEnvelope V2 proofHash 镜像已实现；`far verify` 会输出 `recomputation.python`，仍不声称完整 verdict trace / 原始证据重跑 |
| Browser verifier | `IMPLEMENTED_VERIFIED` | Merkle/Suite verifier + standalone `frontend/public/verify.html` Web Crypto ProofEnvelope V2 proofHash 重算已实现；边界：不是第三种语言实现，不验证原始 evidence，也不等于外部 RO-Crate 认证 |
| `far status` | `IMPLEMENTED_VERIFIED` | `src/cli/status_dump.ts` + `src/cli/commands/status.ts` 生成机器可读 SSOT；testCount/coverage 由 CLI spawn 实测，suiteIntegrityRoot 读 tracked benchmark report；禁止手填裸数字 |
| `far verify` | `IMPLEMENTED_VERIFIED`（P0） | 已实装 envelope/chain/full 模式（`src/cli/commands/verify.ts`·task #11）；评委本机重算 proofHash（RULE-PE-010）+ 10 规则 + 内嵌 anti-theater 报告一致性 + call_records 链头；Windows/空格/离线路径已 smoke 验证（valid→exit 0 / tampered→exit 7 / bad-arg→exit 2 / missing-file→exit 1）；`--lint-input`（20-detector 独立重算 + 内嵌报告深度对比·任何发散 → exit 7）`IMPLEMENTED_VERIFIED`；`--bundle`（V1 minimal `.far-proof` 必需文件 + redacted call_records 链 + V1 proofHash 重算；valid→exit 0/WARN，tampered→exit 7）`IMPLEMENTED_VERIFIED` |
| `far export receipt` | `IMPLEMENTED_VERIFIED` | `src/cli/commands/export_receipt.ts` 输出 Trust Receipt JSON/Markdown；支持 `--envelope` ProofEnvelope V2 与 `--bundle` V1 minimal `.far-proof` 投影；篡改输入拒发（exit 7）；`humanSummary` / receipt 不进 proofHash |
| `far export far-proof` | `IMPLEMENTED_VERIFIED` | `src/cli/commands/export_far_proof.ts` 从 `--demo-chain` 或已有 `--db` 导出 V1 `.far-proof` 九分量；`--package` 生成 `verify.sh` + `integrity.json` + `.tar.zst`；仍按 V1 minimal 诚实披露，非外部 RO-Crate/PROV-O 认证 |
| `far bench run` | `IMPLEMENTED_VERIFIED` | `src/cli/commands/bench.ts` 运行 6-seed offline demo benchmark profile；`--json` 输出 `BenchmarkReport`，`--domain` 可筛选，`suiteIntegrityRoot` 可复现；不声称通用 AI4S leaderboard |
| FEC（Falsification Evidence Contract） | `PARTIAL` | V1 = optional contract（`fecAppendClaim` 原子链路 + `registerContract` + 0005 append-only contract 表 + `auditContract`）；V2 = mandatory，绑定 statistical plan + evidence requirements + measurement plan；缺 FEC 时不允许输出 CONFIRMED/REFUTED，只能 UNTESTED 或 fail-closed |
| anti-theater harness | `PARTIAL` | 现有 anti-theater guard（FAIL+CONFIRMED 被 SQLite trigger ABORT）；P0 至少覆盖 10 个攻击样例（label-only evidence / post-hoc threshold / dataset drift / scope laundering / missing raw artifact / LLM reviewer override / metric swapping / seed cherry-picking / workflow digest mismatch / natural-language verdict mismatch） |
| FAR-Bench | `DESIGN_LOCKED` | 当前按 evaluation protocol / attack corpus 处理（profile_id 永远 `competition_aliyun_qwen`），不宣称泛 benchmark 成熟；P0 升级到 FAR-Bench125（V2）；通用 AI4S benchmark / 排行榜属禁用口径（D6） |
| Rust / Go / WASM verifier | `ROADMAP` | V2/V3 路线；当前不声称已实现 |
| external transparency log | `ROADMAP` | V3；当前 ledgerRoot 仅本地 append-only，不说区块链 |
| full formal specification（TLA+ / Dafny / Lean） | `RESEARCH` | 仅局部 invariant 锚点（V3 research）；不声称全系统形式化（D7） |
| GPU 资源编排 | `ROADMAP` | W6+ 路线图；W1-W5 不应声称 GPU 支持 |
| Model Court / Self-Improving Reliability Compiler | `RESEARCH` | 路线图级研究设想，名字冲击力强易误导，禁写入当前功能声明 |

### 6.2 三号卖点的当前诚实口径（来源：旧 76 §3.2 / 65 §1）

| 卖点 | 当前证据 | 真实状态 | 深化方向 |
|---|---|---|---|
| **Your Laptop Is The Verifier** | `verifyChainHead` 在 `src/evidence_log/verifier.ts`；Python chain verifier 在 `repro/far_chain_repro/verify_chain.py`；Browser Merkle verifier 在 `frontend/src/lib/merkle.ts`；standalone browser verifier 在 `frontend/public/verify.html`；`far verify` P0 envelope+chain+bundle 在 `src/cli/commands/verify.ts`；离线包在 `src/far_proof/offline_package.ts` | 部分闭环。TS/Python/Browser ProofEnvelope V2 proofHash、TS V1 `.far-proof` bundle、`.far-proof.tar.zst` + `verify.sh` + `integrity.json`、chain/Merkle/envelope 重算已闭环；外部 RO-Crate 认证、非项目成员 fresh-clone 留证未闭环 | 非项目成员 fresh-clone 录屏；外部 RO-Crate/PROV-O 校验日志（路径 A）仍为远期项 |
| **五值 anti-theater verdict** | `src/falsifiability/verdict.ts` 纯规则覆盖五值；SQL enum 同步 | 部分闭环。规则确定，但目前主要消费 `supportsClaim/refutesClaim` 布尔或简单 threshold；统计计划与 rule trace 不够深；存在 LLM evidence label 自举风险 | 升级为 metric-first deterministic kernel（输出 rule trace） |
| **脱平台密码学主权** | offline replay、hash chain、proofHash、no-LLM final judge scan | 部分闭环。provider 不在 trust root，但部分 agent evidence label 仍来自 LLM | deterministic measurement facts 取代 LLM vote |

### 6.3 34 项浅点摘要（来源：旧 65 §3）

> 完整 34 项浅点审计总表见旧 `65_SHALLOW_POINT_AUDIT_AND_DEEPENING_ROADMAP.md`（已归档）。这里仅登记与状态纪律直接相关的 P0 浅点；其余浅点的深化文档归属已并入 02-10 章与 APPENDIX。

| 浅点簇 | 当前状态 | 深化归属 |
|---|---|---|
| FEC 只是字段锚点 / `measurableImplication` 不可执行 / `supportsClaim` 由谁判 / 五值裁决规则过浅 / LLM judge 自举 | `PARTIAL` 风险存在 | 03 章（FEC + verdict） |
| EvidenceLog 绑定原始数据/代码/env/seed / envHash/lock/container 不足复现 / seed/RNG/浮点控制 | `PARTIAL` | 02 章（架构）+ APPENDIX_C |
| ProofEnvelope 可组合性 / 三路 verifier 真独立性 / Browser 同源 TS / Go/Rust/WASM / canonicalization 稳定性 / hash domain separation | `PARTIAL` / `ROADMAP` | 04 章（ProofEnvelope）+ APPENDIX_C |
| anti-theater 防 PASS / negative/placebo test / p-hacking / cherry-picking / UNTESTED 强制 | `PARTIAL` | 03 章 §8 + APPENDIX_E |
| AI4S 真实数据/workflow / PROV/RO-Crate / DVC/MLflow / scientific supply-chain | `ROADMAP` / `DESIGN_LOCKED` | 05 章 + 后续 |

---

## 7. 外部事实纪律

涉及外部产品、论文、竞品、发布时间、引用和 novelty 时，必须满足：

- **答辩或提交前重新检索**（不依赖训练数据或历史记忆）；
- **记录来源链接和读取日期**（每个外部事实附 `[已实证·来源·日期]` 或 `[须day-1核验·方法]` 标注）；
- **使用 hedge 措辞**（"据我们所知" / "在公开可查范围内"）；
- **避免"绝对第一" / "无人做到" / "最新" / "唯一"**（无来源支撑时）；
- **若无法复核，标注 `NEEDS_EXTERNAL_VERIFICATION`**，并在答辩前补查新。

本 SSOT **不把任何外部竞品事实作为无需复核的永久事实**。

### 7.1 引用核实项（来源：旧 01 §5.3 / 39 §4 H7）

- KB 中 Robin Nature(s41586-026-10652-y)、PaperRepro(2603.00058)、SocSci(2606.11447)、CodeEvolve(2605.04677) 等 **26xx arXiv 编号年份异常**，PDF 引用前必须核实原文存在性（RR-14 arXiv 文献幻觉风险）。
- 「据我们所知首个」学术查新未做（H7）→ PDF 第 1 页钉死差异化三连 D1/D2/D3（D1 缺位补位 / D2 runtime 非 benchmark / D3 国产基座）+ `UNVERIFIED_PRIOR_ART`，答辩前查新。

### 7.2 snapshot 维护期纪律（来源：旧 39 §4 H10 / 56 §4）

- 参赛基座快照 `qwen3.7-max-2026-05-20`（无百炼官方维护期承诺）；
- 团队 2026-06-27 verified_live，**删除"~2026-07-08 维护期"虚构断言**（红队核实为无来源虚构日期）；
- snapshot 下线风险以**竞赛周 day-0 GET /v1/models 实测复核**为准（`NEEDS_REAL_ENV·R14`）；
- FallbackChain 主→备：`qwen3.7-max-2026-05-20` → `qwen3-235b-a22b`（不越 Qwen 家族白名单 9 值）。

### 7.3 悬空 SSOT 引用纪律（来源：旧 39 §5）

下列上游源**不在当前 workspace**，评委/开发 day-1 须核对存在性与内容（按 D3 如实登记，不编造、不假装已对照）：

| 引用形态 | 用途 | 当前可达性 |
|---|---|---|
| `round5 §X.Y` / `round7-9` | 规范级 SSOT 源 | 不在 workspace（已归档至 `C:/Users/RichardYuan/FAR-Lab_Backups/`） |
| `COLLECTION_01-05` | 44 份编号规范合并源 | 不在 workspace（仅 `_digest/` 有摘要，已归档） |
| `FAR_Lab_Psi_Final_MD_Package` | 上一轮正式产物（12 文档） | 不在 workspace（已归档） |
| `1.txt/2.txt/3.txt` | 历史方案演化稿 | 不在 workspace（已归档） |

> `_digest/` 是上述上游的代理摘要快照，含历史 V1/V2/V3 描述——属"源描述非项目分期"，按 scope 保留不动，已随 FINAL_PACKAGE 归档。

---

## 8. 禁用词与表述红线（与 APPENDIX_F_GLOSSARY.md §6 / 07 章 §2 一致）

> 本节是表述红线的快速索引；权威全文在 `APPENDIX_F_GLOSSARY.md` §6。本 SSOT 与 07 章禁用词表、56 §4-§5 措辞订正清单构成三处一致来源，冲突时以 APPENDIX_F 为准。

### 8.1 核心禁用词（表述红线 · D1-D15）

下列词**仅**在"禁用 / 历史 / 修正"语境出现且必须显式标注，**不得**作为有效结论口径：

- 证明科学真理 / 物理不可篡改 / 物理隔离 / 物理拦截 / 完全可复现 / 全自动科学家 / 全自动无人 / 通用 AI4S benchmark 或排行榜 / 取代同行评审 / 全系统形式化已验证 / 跨语言字节相等已实证 LIVE（无 hedge）/ 第三方验证生态已完成 / "第一" / "唯一" / "最新"（无来源支撑）/ `far-chain/`（作为真实实现路径）/ `96a6372b` 是 merkle 根 / 任意裸测试数 / 发现新科学规律（TESS demo 未 vetting 时）。

完整 D1-D15 改写对照表见 `APPENDIX_F_GLOSSARY.md` §6.1。最常用三条：

| # | 禁用 | 改写 |
|---|---|---|
| D2 | 物理不可篡改 / 物理拦截 / 物理隔离 / 事后篡改不可行 | append-only **tamper-evident**（链头 hash 变化可检测）；trigger 防 UPDATE/DELETE 但 **DROP TRIGGER 可绕过 DB 层防护**，靠 external anchor（gitCommitSha / crossref DOI）兜底，**非 tamper-proof** |
| D8 | 所有语言完全一致 / 跨语言字节相等已实证 LIVE（无 hedge） | 4 字段白名单 + 数值类已实证 byte-equal；**已知 `1e-7` 科学计数法鸿沟**（TS→`1e-7` / Py→`1e-07`）诚实披露 |
| D10 | 最新 / 第一 / 唯一（无来源支撑、无 hedge） | "据我们所知首个" + 差异化三连（D1 缺位补位 / D2 runtime 非 benchmark / D3 国产基座）+ `UNVERIFIED_PRIOR_ART`（查新前）+ 答辩前查新 |

### 8.2 CI grep 禁用词门（W0 落地）

```yaml
# .github/workflows/honesty-grep-gate.yml（W0 拟新增）
- name: 诚实 grep 门（禁用词零容忍）
  run: |
    # 全 PDF/README/pitch/摘要 零裸禁用词
    ! rg -q "物理拦截|物理隔离|物理不可篡改|证明.*科学真理|全自动无人|首个(?!.*据我们所知)|已通过 IETF|全系统形式化" \
        README.md docs/ PROJECT_PLAN/ --glob '!56_*' --glob '!43_*' --glob '!59_*'
```

**例外**：本 01 / APPENDIX_F / 07 章自身在"禁用词表 / 订正清单"里引用原措辞是**元层面演示**，不触发门。

---

## 9. 红队风险登记（与状态纪律咬合）

> 来源：旧 `56_SOURCE_OF_TRUTH_RECONCILIATION.md` §6 红队风险登记 V2。完整登记见 `07_RISK_REGISTER_AND_DO_NOT_CLAIM.md`；本 SSOT 只保留与状态纪律、数字 SSOT、路径 SSOT 直接相关的 RR-* 条目。

| ID | 风险 | 严重度 | 缓解 | 状态 |
|---|---|---|---|---|
| RR-1 | 数字 / 路径 / 反向 over-claim 漂移在交付前未消解 → fresh-clone 路径级崩溃 | CRITICAL | 本 01 §1 路径铁律 + §4 禁手填裸统计 + §5 status-dump CLI（W0 硬门） | 进行中 |
| RR-2 | `.far-proof` 自验证冒充第三方验证 → 击穿 proof-carrying 卖点 | CRITICAL | 路径 A（过 RO-Crate 校验）or 路径 B（"项目自验证离线重算包，V1 minimal"） | 路径 B 已落地并由 WARN 口径披露；路径 A 仍 `NEEDS_EXTERNAL_VERIFICATION` |
| RR-5 | WASM `1e-7` 鸿沟现场暴露 → 跨语言字节相等亮点崩塌 | HIGH | 把鸿沟做成 demo 卖点（现场 diff），不掩盖；按 `NUMERIC_KNOWN_DIVERGENCE` 诚实归 RED | 待实现 |
| RR-7 | snapshot 下线风险（团队 2026-06-27 verified_live，**无百炼官方维护期承诺**） → demo 崩 | HIGH | day-0 实测 GET /v1/models 复核；demo 兜底走 `offline_replay` profile；FallbackChain 接线 | 待实现（本 §7.2） |
| RR-14 | arXiv 26xx 文献幻觉风险 | MEDIUM | citation_integrity_warning：逐条核作者/机构/原文（本 §7.1） | 待查新 |

---

## 10. W0 验收门（hard gate · 不通过则 P0 工程不启动）

> 来源：旧 `56_SOURCE_OF_TRUTH_RECONCILIATION.md` §7。本节是状态纪律与诚实地基的验收清单。

- [ ] `far status` CLI 实测产出单一 SSOT 数字源，全 PDF/README/pitch 零裸数字（grep 校验 `<X_FROM_STATUS_DUMP>` 占位符已回填）。
- [ ] 全文档 `far-chain/` → `<REPOSITORY_ROOT>/` 替换完成（grep 零命中，除元层面引用）。
- [ ] `golden_vectors` 误述订正（`96a6372bdf04` = `REPRO_CONTEXT_FIXTURE` 单向量 expectedHex，非 merkle 根）。
- [ ] domain 6 值消歧注（`SciIRDomain` 领域枚举 6 值，正确，非 verdict 笔误；verdict 5 值 enum 冻结）。
- [ ] commit 引用移除或 CLI 实测回填。
- [ ] §8 措辞订正清单全文档落地（CI grep 禁用词门通过）。
- [ ] `$null` PowerShell 残留清理 + privacy-scan CI 生效。
- [ ] DO_NOT_CLAIM（APPENDIX_F §6）+ 红队风险登记（本 §9 + 07 章）入库。

---

## 11. 与其他文档的咬合

| 文档 | 关系 |
|---|---|
| `APPENDIX_A_TYPES.md` | 类型字段名权威；本 01 引用其状态总结，冲突时以 A 的字段名为准 |
| `APPENDIX_C_CANONICAL.md` | canonical 字节规则权威；本 01 §4-§5 的数字 SSOT 与其 §10 golden vectors 一致 |
| `APPENDIX_F_GLOSSARY.md` | 术语语义 / 禁用词 / 路径 / 文档优先级权威；本 01 §1-§2-§8 与其 §6-§7-§8 一致 |
| `02_ARCHITECTURE.md` | Core Trust Root 分区、数据对象最小内容 |
| `03_EVIDENCE_CONTRACT_AND_VERDICT.md` | FEC 结构、五值 enum、裁决内核、anti-theater 规则（状态以本 01 §6 为口径） |
| `04_PROOF_ENVELOPE_AND_VERIFIER.md` | ProofEnvelope V2、proofHash 纪律、`.far-proof` bundle、独立验证等级 |
| `05_AI4S_PRODUCT_DEMO_AND_BENCHMARK.md` | demo 中篡改演示须真实改 verdict-critical 字段 |
| `07_RISK_REGISTER_AND_DO_NOT_CLAIM.md` | 禁用词、红队风险登记、tamper-evident 措辞（本 01 §8-§9 与其一致） |
| `08_TRACEABILITY_MATRIX.md` | 旧 `far-chain/` 路径废弃、旧 4 值 verdict 废弃、旧编号 → 新位置映射（来源溯源） |
| `09_GAP_CLOSURE_LOG.md` | P0 与代码冲突时的修订项登记处 |

---

## 12. 历史口径与已退役内容（仅作溯源）

> 下列口径在历史 `FINAL_PACKAGE` 中出现过，现 `RETIRED`，仅保留溯源。物理档案已退役，备份位置 `C:/Users/RichardYuan/FAR-Lab_Backups/`。

| 历史口径 | 现口径 | 来源（旧编号 → 新位置） |
|---|---|---|
| `far-chain/` 是真实实现子目录 | `<REPOSITORY_ROOT>/` 是当前实现根 | 旧 `56` §2.2 → 本 01 §1 |
| `9f1d2f0c…0000` golden 占位值 | `RETIRED`，被 `96a6372bdf04…af4abf4` 真实值取代 | 旧 `56` §2.3 → APPENDIX_C §10 |
| `96a6372b` 是 merkle 根 | **是 `REPRO_CONTEXT_FIXTURE` 单向量 expectedHex，非 merkle 根，非 proofHash** | 旧 `56` §2.3 → APPENDIX_C §10 / APPENDIX_F §2.6 |
| 4 值 verdict（`ACCEPTED/REJECTED/DEGRADED/UNTESTED`） | 5 值 verdict（`CONFIRMED/REFUTED/INCONCLUSIVE/DEGRADED_SCOPE/UNTESTED`） | 旧 `02_CONSTRAINTS_AND_RED_LINES` §F2 → APPENDIX_A §0 / APPENDIX_F §3.1 |
| `1038 / 662 / 546 / 1092 tests`（任意裸测试数） | `<TEST_COUNT_FROM_STATUS_DUMP>`（本 01 §4.1） | 旧 `56` §2.1 → 本 01 §4 |
| `commit 07a8005` 作为 fresh-clone 复验锚点 | 移除或由 `far status` 实测回填 | 旧 `39` §0 → 本 01 §5.3 |
| 物理拦截 / 物理隔离 / 事后篡改不可行 | tamper-evident（非 tamper-proof） | 旧 `56` §4 R6 → APPENDIX_C §11 / APPENDIX_F §3.8 |
| 跨语言字节相等"已实证 LIVE"（全域） | 四字段白名单已实证；浮点科学计数法已知分叉 | 旧 `56` §4 R7 → APPENDIX_C §8 |
| `FAR-Lab Ψ` / `FAR-Chain Ω` / `Proof-Carrying AI Scientist OS` | `真研 FAR-Lab`（项目集）/ `FAR-Chain`（系统主名） | 旧 `01` §5.2 / `76` → APPENDIX_F §1 / §4 |
| snapshot 维护期 `~2026-07-08`（无来源虚构） | snapshot 下线风险以 day-0 GET /v1/models 实测为准（无百炼官方维护期承诺） | 旧 `39` §4 H10 → 本 01 §7.2 |

> 旧编号（如 `01_PROJECT_FACTS.md`、`56_SOURCE_OF_TRUTH_RECONCILIATION.md`、`76_DESIGN_PHASE_COMPLETION_VERDICT.md`、`39_FINAL_AUDIT_REPORT.md`、`65_SHALLOW_POINT_AUDIT_AND_DEEPENING_ROADMAP.md`）作为来源溯源保留；其物理档案随 `FINAL_PACKAGE` 退役，备份见 `C:/Users/RichardYuan/FAR-Lab_Backups/`。后续维护引用本 01 + 三附录（A/C/F）即可，不再回引旧编号作为有效依赖。

---

## 13. 答辩口径（SSOT 与状态侧）

**问：你们的数字（测试数 / 文件数 / 覆盖率）从哪里来？**
答：从 `far status --json` 实测，全文档零裸数字。CI 构建阶段跑 `far status`，把 `<X_FROM_STATUS_DUMP>` 占位符替换为 git HEAD 实测值。任何手填数字都会被 honesty-grep-gate 拦下。

**问：你们的路径是什么？评委照文档能跑起来吗？**
答：仓库根就是 `<REPOSITORY_ROOT>/`（工作区根即实现仓），不是 `far-chain/` 子目录。旧文档里的 `far-chain/` 是历史规划路径，已订正。评委照当前文档 `cd <REPOSITORY_ROOT>` 即可。

**问：你们怎么保证状态声称是诚实的？**
答：每个能力都带一个 8 值状态标签（`IMPLEMENTED_VERIFIED` 到 `NEEDS_EXTERNAL_VERIFICATION`），禁止"已实现"与"应实现"混写。我们敢在交付前自爆数字漂移 / 路径虚构 / 反向 over-claim（红队 RR-1 W0 硬门），这本身就是反-theater 项目最强的护城河演示。

**问：外部事实（竞品发布时间、arXiv 引用、novelty）怎么处理？**
答：答辩前重新检索，记录来源链接和读取日期，使用 hedge 措辞，不依赖训练数据。无法复核的标 `NEEDS_EXTERNAL_VERIFICATION`。本 SSOT 不把任何外部竞品事实作为无需复核的永久事实。

---

> 本 SSOT 冻结四件事：仓库路径事实、文档优先级 P0-P3、状态标签 taxonomy、禁止手填裸统计与外部事实纪律。任何修改路径前缀、状态标签集合、文档优先级、数字来源或禁用词的提议，必须同时修改本文件、`APPENDIX_A_TYPES.md`、`APPENDIX_C_CANONICAL.md`、`APPENDIX_F_GLOSSARY.md`、schema、golden vectors 和所有 verifier——否则不成立。
