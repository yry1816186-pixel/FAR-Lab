# 06 路线图与 Definition of Done

> 状态纪律：本文件各阶段/各模块的状态以 `01` 章 §3 状态标签为准（`IMPLEMENTED_VERIFIED` / `IMPLEMENTED_UNVERIFIED` / `PARTIAL` / `DESIGN_LOCKED` / `ROADMAP` / `RESEARCH` / `RETIRED` / `NEEDS_EXTERNAL_VERIFICATION`）。数字型字段（测试数 / 文件数 / migration 数 / CI 通过率 / benchmark 数 / commit hash / 竞品发布时间）一律由 `far status --json` 实测产出，**禁止手填**；未覆盖字段写 `Pending` 或 `NEEDS_EXTERNAL_VERIFICATION`。
> 路径单一写法：所有工程路径以 `<REPOSITORY_ROOT>/` 开头。`far-chain/`（作为真实实现根）是禁用口径，仅可在「已废弃历史规划」语境显式标注后出现。
> 五值裁决枚举固定（`APPENDIX_F_GLOSSARY.md` §3）：`CONFIRMED` / `REFUTED` / `INCONCLUSIVE` / `DEGRADED_SCOPE` / `UNTESTED`，**禁止第六值**。裁决 deterministic，LLM 不得作为最终裁决者。
> 物理档案：本文件并入的深度来源（`FINAL_PACKAGE/21/32/43/55/60/75`）已归档为历史口径；物理档案已退役，备份位于 `C:/Users/RichardYuan/FAR-Lab_Backups/`。本文件自包含，不依赖「详见 FINAL_PACKAGE/X」即可读。

---

## 1. 总体策略

### 1.1 一句话北极星

> 一个 demo claim 完成从 FEC 到 ProofEnvelope，再到独立重算和篡改报红的闭环；评委能在自己的笔记本上零 key 跑通「三路字节相等 + 翻转一字三路报红」。

路线图按依赖顺序推进，**不再使用「全部十五层一次性实现」的旧口径**（`FINAL_PACKAGE/21` §0 的「不分 Wave 一次性完整交付」是历史口径，已被 W0-W5 质量门序列取代）。W0/W2 是仅有的两个 hard gate，本质是【质量门】（数字真实 / fresh-clone exit 0）而非时间门——未过质量门 = 没做完。

### 1.2 关键路径与依赖图

```text
W0(FI-10 真相统一·质量门) ──不通过则 W1-W5 不启动──► W1(查新 + CLI 薄壳 + 叙事)
                                                              │
                                                              ▼
                              W2(FI-9 第三方验证器·质量门) ──不通过则 W3-W5 不启动──►
                                                              │
                       ┌──────────────────────────────────────┴───┐
                       ▼                                            ▼
                  W3(对抗竞技场)                              W4(多域/法庭/Bench125/WASM)
                       │                                            │
                       └──────────────────┬─────────────────────────┘
                                          ▼
                                  W5(Demo + 答辩总验收)
```

底层实现链（V1 实现层 · L0-L15）与产品化层（V2 接入层 · W0-W5）正交叠加：V1 落地是 V2 的前提——若 L0-L3 信任根未绿，V2 接入层无处挂接。

### 1.3 模块依赖（实现层）

```text
信任根(0001-0011) ──► FEC 编排 ──► Falsification DSL ──► ConfoundingGate
       │                  │                │
       ▼                  ▼                ▼
   SciIR(0016)        TESS Harness     verdict 决策树 ──► ProofEnvelope(0017)
                          (sandbox)            │                  │
                                                └──────────────► .far-proof 导出 + fresh-clone 重算
                                                          │
              ┌───────────────────────────────────────────┼─────────────────────┐
              ▼                                           ▼                     ▼
       UQ-Witness                                   ProbeAtlas             FAR-Bench
       (0013/0014)                                  (0012)                 (0015)
              │                                           │                     │
              ▼                                           ▼                     ▼
       Adversarial Game                            replay_forks           Merkle Ledger
       (0019/0024)                                 (0021)                 (0022)
```

> 信任根先行；证伪引擎与 ProofEnvelope 可并行；三柱表可并行；Web Cockpit / CLI 依赖全部后端模块。

---

## 2. W0：事实源和口径清理（质量硬门 · FI-10）

### 2.1 目标

消除旧文档和当前代码现实之间的误导。**未过此门，W1-W5 不启动。** 诚实地修正自己文档的过度声称，本身就是反 theater 项目最强的护城河演示。

### 2.2 任务

| 任务 | 验收口径 | 状态标签 |
|---|---|---|
| 统一仓库根路径为 `<REPOSITORY_ROOT>/` | grep 全仓 `far-chain/` 仅在「已废弃历史」语境命中 | `IMPLEMENTED_VERIFIED`（须 `far status` 复核） |
| 建立或补齐 `far status --json`（status-dump SSOT，禁手填） | 占位符全文档回填，零裸数字；输出含测试数/migration 数/golden 向量数/coverage | `IMPLEMENTED_VERIFIED`（`src/cli/status_dump.ts` 实测产出 testCount/coverage/migrationCount/goldenVectorCount/suiteIntegrityRoot/gitCommitSha） |
| 移除公开材料中的手填测试数 | README/PPT/答辩稿零裸 `1038/662/546/1092` 等漂移数字 | `IMPLEMENTED_VERIFIED`（grep README + master-plan 零裸漂移数字，全占位符 `<X_FROM_STATUS_DUMP>`） |
| 将旧 `Auditable/Reproducible` 主卖点替换为 `Tamper-Evident/Independently Re-computable` | grep 全仓 `Auditable/Reproducible` 仅在「修正/历史」语境命中 | `IMPLEMENTED_VERIFIED`（README tagline + 00/24/20/21/22/09/25/30/07/08 selling-point 全替换为 篡改可检测/可独立复算；FAR acronym 统一为 Falsification-Anchored Research） |
| 明确 ProofEnvelope 不是科学真理证书 | PDF/README 含显式「过程可信证据可机器检验，绝非科学结论为真」一句 | `DESIGN_LOCKED` |
| 给所有 external claim 加 `NEEDS_EXTERNAL_VERIFICATION` 或来源 | 谱系锚点（PCC/FPCC/Adam/AlphaProof）节 `frontier_verified='UNVERIFIED'` 时禁 PDF 引用 | `NEEDS_EXTERNAL_VERIFICATION` |
| `golden_vectors` 误述订正（`96a6372bdf04…` = 单向量 expectedHex，非 merkle 根） | manifest 标记演进为 `E4_BACKFILLED_96a6372b` | `IMPLEMENTED_VERIFIED` |
| domain 6 值消歧（`SciIRDomain` 领域枚举 ≠ verdict 笔误） | 仅加消歧注，不改五值枚举 | `DESIGN_LOCKED` |
| 移除无法验证的 commit 引用 | grep 全仓无裸 `07a8005` 等（仓库无对应 commit） | `IMPLEMENTED_VERIFIED`（仅 4 处残留均为审计溯表/任务规格本身的「此 commit 已移除」元引用，零 live anchor；`af4abf4` 是 golden-vector expectedHex 尾非 commit） |
| `$null` 残留清理 + privacy-scan CI | privacy-scan CI 生效 | `IMPLEMENTED_VERIFIED`（$null 零残留·`scripts/privacy_scan.mjs` 11 类密钥形状全仓扫描·build-integrity.yml R9-2-16 CI 步·tests/scripts/privacy_scan.test.mjs 4 测实跑；CI Actions-run 待 maintainer） |
| DO_NOT_CLAIM V2 + 红队风险登记入库 | 与 `07_RISK_REGISTER_AND_DO_NOT_CLAIM.md` 一致 | `DESIGN_LOCKED` |

### 2.3 DOD（W0 质量硬门）

- README、PPT、答辩稿不再引用虚构 `far-chain/` 子目录；
- 任何数量型状态都可由 `far status` 或 CI 复核（禁手填）；
- 风险红线已进入 PR checklist（§9）；
- `far status --json` 是唯一数字源，全 PDF/README/pitch 零裸数字（占位符 `<X_FROM_STATUS_DUMP>`）；
- 形式化锚点（若有）禁用「形式化证明/全系统验证」措辞（CI grep 守「局部锚点」）；
- 查新未完成前「首个」全标 `UNVERIFIED_PRIOR_ART` 或 hedge「据我们所知」。

> 未过 W0 = 没做完（与时间无关，不作为收手点）。W0 是诚实地基——路径虚构/数字漂移会让 W2 的 fresh-clone 直接崩溃。

---

## 3. W1：Core Trust Root（查新 + CLI 薄壳 + 叙事，并行三轨）

### 3.1 目标

确保最小信任根稳定；同时铺开查新、CLI 薄壳与叙事收敛。

### 3.2 任务

#### 3.2.1 Trust Root 加固（信任根先行）

| 任务 | 验收口径 | 状态标签 |
|---|---|---|
| canonical serialization 固化（JCS 对齐，TS `canonicalHash` ≡ Python `canonical_hash`） | 4 字段白名单内（stageId/cred/payloadKind/prevHash）字节相等；数值域 `1e-7` 鸿沟诚实归 RED 待 V3 | `IMPLEMENTED_VERIFIED`（白名单内）/ `PARTIAL`（数值域） |
| golden vectors 覆盖核心类型 | 含 ≥7 条数值域向量（浮点 / >2^53 大整数 / 科学计数 / NFC 中文 / isoTimestamp 毫秒 / 负零 / 超大负数）；占位哈希用语义哨兵 `PLACEHOLDER_UNVERIFIED_<vectorId>` | `PARTIAL` |
| evidence log chain 可重算 | `verifyChainHead`（src/evidence_log/verifier.ts）遍历 `call_records ORDER BY seq` 逐条重算 hash 逐条校验，末行 hash 即链头 | `IMPLEMENTED_VERIFIED`（verifier.ts 实现·tests/api/integrity + tests/ci/verify_chain_smoke + tests/cli/replay_tamper 实跑） |
| migration runner 可在 clean checkout 跑通 | `0001-0008`（实测当前已落盘）+ 路线图 `0009-0025`（待 Ask 裁决编号归属，见 §10 CROSS-CUT-003） | `IMPLEMENTED_VERIFIED`（0001-0008）/ `DESIGN_LOCKED`（0009-0025） |
| TS/Python 对核心 hash 行为对拍 | CI `cross_lang_consistency.test.ts`（TS）启动 Python 子进程跑 `canonical_json.py`，逐 fixture 比对 `expected_ts_hash === expected_py_hash` | `PARTIAL`（数值类已绿） |

#### 3.2.2 查新轨（外部事实核验）

| 任务 | 验收口径 | 状态 |
|---|---|---|
| 打开 `arXiv:2602.20214`（Right-to-History）原文核作者/机构/方法 | `UNVERIFIED`，PDF 第 1 页钉死差异化三连（D1 缺位补位 / D2 runtime 非 benchmark / D3 国产基座） | `NEEDS_EXTERNAL_VERIFICATION` |
| 同构度评估与差异化口径选定 | D1/D2/D3 各有 hedge + 来源 | `NEEDS_EXTERNAL_VERIFICATION` |
| 谱系锚点（PCC 1996 / FPCC Princeton / Adam 2009 / AlphaProof 2025）查新 | `17` 章 30-checklist novelty/priority 查新前置 | `NEEDS_EXTERNAL_VERIFICATION` |
| 「首个 / first」全配 hedge 或来源 | grep 全仓裸「首个 / first」必须伴随谱系锚定语句或「据我们所知 / among the first」 | `IMPLEMENTED_VERIFIED`（README+master-plan grep 零裸 novelty overclaim·全 hedge 为「据我们所知/among the first」或 UNVERIFIED_PRIOR_ART） |

#### 3.2.3 CLI 薄壳轨（FI-1 产品化）

CLI 状态机（`FINAL_PACKAGE/75` §5，作为设计 SSOT）：

```text
CLAIM_CANDIDATE
  -> FEC_PROPOSED
  -> FEC_VALIDATED
  -> FEC_FROZEN
  -> EVIDENCE_BOUND
  -> MEASUREMENT_RAN
  -> STATISTICS_EVALUATED
  -> VERDICT_DECIDED
  -> ENVELOPE_SEALED
  -> VERIFIED
```

> 非法状态转移成为 protocol deviation，绝不静默覆写。

CLI 命令集（设计 SSOT，工程实现见 `<REPOSITORY_ROOT>/src/cli/`）：

```bash
far status [--json] [--db <path>]              # status-dump SSOT（W0 硬门）
far verify --bundle <path> [--mode chain|envelope|full] [--json]
far fec compile --claim claim.json --out fec.json
far fec freeze --fec fec.json --actor reviewer.json
far bind dataset --fec fec.json --path data.csv
far measure run --fec fec.json --binding dataset.json --sandbox offline
far anti-theater lint --bundle .far-proof
far graph impact --bundle .far-proof --changed-node <id>
far ask "<question>"                            # 6-stage FSM 流式产出 verdict + .far-proof
far replay <run>                                # 确定性续跑（仅 deterministic track）
```

| 任务 | 验收口径 | 状态 |
|---|---|---|
| `far` CLI 默认 `offline_replay` profile | fresh-clone 零 key 跑通 | `IMPLEMENTED_VERIFIED`（**17 子命令全落地**·见 05 §9.2：含 ask/stream/repl/replay/court/arena/init + `@far-chain/cli` 包）；剩余 `ROADMAP`：真实多模型（凭据门）+ 形式化验证器 + 真实 OS sandbox |
| 接真实 provider 须显式 `--profile competition_aliyun_qwen` + env key | verdict 由 deterministic `verdict_mapping` 产出，CLI 不自评 | `DESIGN_LOCKED` |
| CLI e2e 测试 | fresh-clone `npx` exit 0 | `IMPLEMENTED_VERIFIED`（fresh-clone smoke 通过；`competition_qwen_smoke`/`snapshot_liveness_smoke` 需 `DASHSCOPE_API_KEY` 跳过） |

#### 3.2.4 叙事轨（FI-8 进攻性叙事）

| 任务 | 验收口径 | 状态 |
|---|---|---|
| pitch / abstract V2 覆盖 | 从「防御性诚实（我们不声称 X）」翻转为「进攻性可验证信任（你能验证 X）」 | `PARTIAL` |
| 用户面文档砍到净增 ≤3（README 极简版 + 一页 abstract + 10 分钟手册） | 设计层文档允许完整；用户面文档禁膨胀 | `PARTIAL` |
| 「可验证」指「过程可信证据可机器检验」，**绝非**「证明科学结论为真」 | PDF/README 显式 hedge | `DESIGN_LOCKED` |

### 3.3 DOD（W1）

- 修改任一 chain record 字段会触发验证失败（append-only trigger + external anchor 兜底）；
- golden vectors 在 CI 中固定；1e-7、Unicode（NFC/NFD）、字段排序、null/undefined、isoTimestamp 毫秒等边界明确归位（已解归 `IMPLEMENTED_VERIFIED`，未解归 `PARTIAL` + `NUMERIC_KNOWN_DIVERGENCE`）；
- 查新结论（Right-to-History / 谱系锚点）落 `NEEDS_EXTERNAL_VERIFICATION` 或带 hedge 的来源；
- CLI e2e fresh-clone `npx` exit 0；
- 用户面文档净增 ≤3。

---

## 4. W2：FEC V2 与 Verdict Kernel（含第三方验证器质量硬门 · FI-9）

### 4.1 目标

让 claim 不再直接跳到 verdict，而是必须经过 FEC 和统计计划；同时让外部能独立重算验证。**未过此门，W3-W5 不启动。**

### 4.2 任务

#### 4.2.1 FEC V2 schema 与 verdict kernel

| 任务 | 验收口径 | 状态 |
|---|---|---|
| 定义 `FecContractV2` schema（claim / bindings / statPlan / verdictRule / falsificationSpec） | 字段集合冻结，与 `APPENDIX_A_TYPES.md` FEC 子类型一致 | `DESIGN_LOCKED` |
| 增加 deterministic validator（`validateFEC`） | 缺 FEC 不能输出 `CONFIRMED` | `DESIGN_LOCKED`（实现 `PARTIAL`） |
| 实现 protocol freeze（`freezeProtocol`） | actor 签名后 `frozenAt` 不可改；改则 `PROTOCOL_DEVIATION_CRITICAL` | `DESIGN_LOCKED` |
| verdict 输入改为 metric-first | 统计结果按冻结规则映射到五值 | `DESIGN_LOCKED`（实现 `PARTIAL`，见 67 章） |
| 输出 `VerdictRuleTrace` | 支持/反证/冲突/功效不足均有 deterministic trace | `DESIGN_LOCKED`（实现 `PARTIAL`） |
| 建立 10 个 verdict golden vectors | 覆盖 5 值 × 边界（缺数据 / scope 缩小 / 反证 / 冲突 / 通过） | `IMPLEMENTED_VERIFIED`（14 GV 落盘 golden_vectors/cases/GV-01..14.json·`far verify-golden --all` 14/14 PASS 经真实内核） |
| LLM evidence label 只能作为辅助，不得直接决定 verdict | verdict 由 deterministic `verdict_mapping` 5 路径产出 | `DESIGN_LOCKED` |

verdict 决策树优先级（`APPENDIX_F_GLOSSARY.md` §3 锁定，禁新增路径）：

```text
1. data_missing              -> UNTESTED          (证据基缺失，F9)
2. scope_narrow              -> DEGRADED_SCOPE    (F2 优先级 1 锁死；含 F_s<2 触发)
3. refutation_sufficient     -> REFUTED           (统计证据满足反驳方向)
4. inconclusive              -> INCONCLUSIVE      (证据冲突 / 功效不足 / seed cherry-picking)
5. all_pass                  -> CONFIRMED         (前置三重留痕：ClaimSchema 4 字段 + BreakerProbe 痕迹 + 无 integrityFlags)
```

> `DEGRADED_SCOPE` 必须在 `CONFIRMED` 前判定。优先级在任何语言实现、任何 verifier、任何 demo 中保持一致。

#### 4.2.2 第三方验证器（FI-9 · 质量硬门主体）

| 任务 | 验收口径 | 状态 |
|---|---|---|
| `far verify`（fresh-clone 单命令验真） | 整条套件链 + 单 claim 全链重算 exit 0 | `IMPLEMENTED_VERIFIED`（envelope/chain/full + `--bundle` V1 minimal） |
| standalone `verify.html`（Web Crypto，断网可跑） | 拖入 / 粘贴 ProofEnvelope V2 JSON，浏览器 Web Crypto 重算 `proofHash`；无外链、无 fetch/import；篡改 VC 字段 → FAIL | `IMPLEMENTED_VERIFIED`（`frontend/public/verify.html` + `browser_standalone.test.ts` 直接执行页面脚本） |
| ProofEnvelope Validator 9 规则 + 第 10 条（独立可重算性） | 全 10 条逐条测试用例绿（第 10 条是新增协议规则，走 Ask 阶层确认） | `IMPLEMENTED_VERIFIED`（10-rule validator + RULE-PE-010 TS/Python/browser/离线包重算路径） |
| Python verifier 扩展到 ProofEnvelope | `repro/far_chain_repro/proof_hash.py` 重算 `proofHash`，`far verify` 输出 `recomputation.python` | `IMPLEMENTED_VERIFIED` |
| `.far-proof` 离线 tar.zst demo bundle | `integrityHash` = 所有文件 sha256（不含自身），评委本地 `verify.sh` 一键重放 | `IMPLEMENTED_VERIFIED`（`offline_package.ts` + tar.zst 解包脚本实跑） |
| RO-Crate 合规（路径 A）或降级措辞（路径 B）选定 | 路径 A 须通过至少一个独立开源 RO-Crate 校验器；路径 B 显式声明「项目自验证的离线重算包，导出格式 V1 minimal」 | 路径 B `IMPLEMENTED_VERIFIED`；路径 A `NEEDS_EXTERNAL_VERIFICATION` |
| 《10 分钟复算手册》 | 非项目成员 fresh-clone 实跑 exit 0 留证（截图/录屏） | `ROADMAP` |

### 4.3 DOD（W2 质量硬门）

- 缺 FEC 不能输出 `CONFIRMED`；
- 缺数据进入 `UNTESTED`；scope 缩小进入 `DEGRADED_SCOPE`；
- 支持、反证、冲突、功效不足均有 deterministic trace；
- verdict enum 只有五值；
- clean checkout 可以验证 demo bundle；
- 修改 proof envelope 任一关键字段会 fail；
- CLI JSON 输出可被前端和报告复用；
- browser verifier 有诚实边界说明（明示已覆盖 proofHash / Merkle / chain 哪一层）；
- Windows/离线 Plan B 已演练；
- **非项目成员 fresh-clone exit 0**（这是特等 vs 一等的分水岭——质量门，与时间无关）。

> 诚实护栏（涉及「第三方」声称最严）：绝不可把项目自验证包装成第三方验证；Validator 第 10 条已 spec + 测试验证，但仍必须按路径 B 降级措辞披露；手册明示无网络凭证也能 fresh-clone 重放（守 C16）。

---

## 5. W3：Anti-Theater Harness 与 FAR-Bench P0（对抗竞技场 · FI-2）

### 5.1 目标

把反剧场从口号变成攻击套件；让一个假设被结构化证伪载荷诚实反驳到 `REFUTED`，全链可重放。

### 5.2 任务

| 任务 | 验收口径 | 状态 |
|---|---|---|
| 建立 10 个 P0 FAR-Bench cases | 覆盖 label-only evidence / post-hoc threshold / dataset drift / metric swap / scope laundering | `IMPLEMENTED_VERIFIED`（20 attackId 超过 10·5 类全覆盖·tests/anti_theater/anti_theater_attack_corpus.test.ts 23 测实跑） |
| 每个 case 有 expected verdict 或 expected fail | 每个 failure 有 deterministic reason code（`FEC_NOT_COMPILABLE` / `DATASET_BINDING_MISSING` / `MEASUREMENT_FAILED` / `PROTOCOL_DEVIATION_CRITICAL` / `SCOPE_MISMATCH` / `CONTRADICTORY_EVIDENCE` / `PROOF_HASH_MISMATCH` 等） | `DESIGN_LOCKED` |
| CI 运行 attack corpus | 所有 attack cases 可重复运行 | `IMPLEMENTED_VERIFIED`（attack_corpus.test.ts + agent_attack_cases.test.ts 在 CI `node --test tests/anti_theater` 实跑·零 flaky） |
| 生成 benchmark receipt | receipt 进 evidence_log，hash-anchored | `DESIGN_LOCKED` |
| 确定性 arbiter（纯函数，零 LLM） | `aggregateVerdict` 全 SKIP/弱反驳 → `INCONCLUSIVE` 非 `CONFIRMED`（守 F1 反 theater） | `DESIGN_LOCKED` |
| `RefutationPayload.attackKind` 三类 | `metric_threshold` / `counterexample_sample` / `citation_failure`（枚举冻结，禁止第四类不经 Ask 扩展） | `DESIGN_LOCKED` |
| 实时 SSE 流 + ArenaPage + 反驳记分板 | 一个假设被诚实反驳到 `REFUTED`，全链可重放 | `ROADMAP` |
| 离线 persona fixture（demo 兜底） | 明示 `mode=offline_persona_simulation` | `DESIGN_LOCKED` |

### 5.3 DOD（W3）

- 所有 attack cases 可重复运行；
- 每个失败都有 reason code；
- 不用 LLM-as-judge（仲裁器 deterministic，检查「① 矛盾 metric 越过阈值 ② 反例样本命中 ③ 引用查证失败」三类机械判据）；
- FAR-Bench 对外口径是 verification protocol，**不是**泛 AI4S 排行榜（守 C13，禁「哪个 AI 更聪明」口径）；
- verdict 落 `REFUTED` / `INCONCLUSIVE` 是诚实的，不是表演。

> 诚实护栏：若所有反驳都 SKIP/弱 → verdict 落 `INCONCLUSIVE` 而非 `CONFIRMED`（守 F1）；反驳者模型分歧本身被记录（喂给 W4 跨模型法庭）；明确声明「竞技场测的是『能否被结构化证伪』，不测『AI 有多聪明』」。

---

## 6. W4：多域平台 / 跨模型法庭 / Bench-125 / WASM（FI-3 / FI-4 / FI-5 / FI-6 满血）

### 6.1 目标

把单域 demo 升维为多域平台；把 novelty=0 命门转为真实的元科学发现；性能 wow + 体验 wow 双杀。

### 6.2 任务（四项全部满血交付）

| FI | 满血交付（唯一目标） | 验收口径 | 物理约束 / 诚实边界（保留） | 状态 |
|---|---|---|---|---|
| **FI-3 Court**（跨模型可靠性法庭） | 离线 persona 证书 + 真实多模型证书（两档都做） | `agreement_matrix` 结构化计算 verdict kind + evidence 指纹；颁发 `ReliabilityCertificate`；CourtPage 一致性热力图 | 真实多模型须多 key（`NEEDS_HUMAN_OPERATION`） | `IMPLEMENTED_VERIFIED`（persona 档全通：far court CLI + GET /court/demo API + CourtPage 前端可视化·computeAgreement(unanimous/majority/split/null) + detectRefuterAttack 反剧场 + ReliabilityCertificate · 12 测；唯一剩真实多模型档 NEEDS_HUMAN_OPERATION 多 key） |
| **FI-4 DomainPack** | 5 pack 全绿（TESS LIVE + 4 新 pack：蛋白折叠 / 催化剂 / 碳通量 / 地震前兆） | 每 pack = {dataset_resolver, claim_fixtures, falsification_templates, verdict_thresholds, math_backend_hints}；每 pack 跑通一个 claim 完整链 | verdict_threshold 必须 preregistration 锁（守 F8） | `PARTIAL`（TESS LIVE IMPLEMENTED_VERIFIED + 4 新 pack falsification 结构 IMPLEMENTED_VERIFIED：protein/catalyst/carbon/seismic harness · F8 预登记阈值 · verdict_mapping · 8 测·claim_fixtures 复用 demo seed b7/c3/e2/g5；真实 LIVE 数据集 resolver 仍 offline V2） |
| **FI-5 Bench-125** | 125 题全 fixture + 套件根可验 + Resolution Curve | 复用已落地 `suiteIntegrityRoot` + SuiteVerifier；评委浏览器独立重算 125 题套件根 | Resolution Curve 须过 R5 三审查门（反自我指涉 theater 质量门）；不过门则曲线本身不做（Bench-125 仍满血） | `ROADMAP`（6 seed 已 `IMPLEMENTED_VERIFIED`） |
| **FI-6 WASM + 流式** | WASM 三向字节相等 + 流式 hash-link + perf 基准 | TS ≡ Python ≡ WASM 三向 golden；canonicalHash µs 级基准进 CI | 若 `1e-7` 鸿沟在 WASM 编译产物重现，诚实降级双语言 + JS（技术约束，非时间妥协） | `ROADMAP` |

### 6.3 DOD（W4）

- 5 DomainPack 各自跑通一个示范 claim（非该领域全解，守 C16）；
- Bench-125 套件根可由评委浏览器独立重算；
- WASM 验真产物与 TS/Python 三向字节相等（或诚实降级并标注）；
- 跨模型法庭产出真实的元科学发现（用确定性方法测量「哪些 claim 类型上 AI 模型不可靠」），证书明确标注「模型分歧 ≠ 任一模型错」，只标「此处可靠性低、须人工裁决」；
- 榜单排的是证据链工程完整性 + 可复现性，**绝不**排「哪个 AI 更聪明」（守 C13）；
- verdict 多数仍是 offline fixture，诚实标注「非真实科学裁决」；125 题若部分无 fixture，诚实落 `UNTESTED` 进榜。

> 诚实护栏：分歧是结构化计算（比对 verdict kind + evidence 指纹），非 LLM-judge；不声称「找出最准的模型」（那是通用 benchmark 红线 C13），只声称「标出可靠性盲区」。

---

## 7. W5：Demo、报告与答辩闭环（FI-7 满血 + 总验收）

### 7.1 目标

把工程闭环转化为评委可亲手验证的体验——评委的笔记本就是验证器。

### 7.2 动线四幕（`FINAL_PACKAGE/60` 主线 · 全部复用已落地信任根 · 零 key 零服务端）

#### 第 1 幕 · 首屏 30 秒 · `npx` 一行起

| 动作 | 展示 | 复用资产 | 状态 |
|---|---|---|---|
| 评委终端 `npx far demo`（roadmap 原名 `far-verify-demo`，实际命令为 `far demo`） → 自动跑 `offline_replay` profile 的 C-ASTRO-0001 | 6 阶段 FSM 流式打印，每阶段末尾吐 `stageReceipt` hash；结尾密封 `chainHead` | `runAgentLoop`（fsm_runner）+ `offline_replay` profile（零 key）+ `canonicalHash`（`<REPOSITORY_ROOT>/src/evidence_log/hasher.ts`） | `IMPLEMENTED_VERIFIED`（`far demo` exit 0·真实 oneSampleZTest p=1.398e-4 → FEC gate → R7 CONFIRMED → ASK-9 密封 INCONCLUSIVE） |

#### 第 2 幕 · 灵魂时刻 ① · 三路字节相等

| 路径 | 命令 | 复用资产 | 状态 |
|---|---|---|---|
| ① Node TypeScript | `far verify --db <path>` / `far verify --bundle <path>` | `verifyChainHead`（`<REPOSITORY_ROOT>/src/evidence_log/verifier.ts`）+ bundle verifier | `IMPLEMENTED_VERIFIED` |
| ② Python | `python3 -m far_chain_repro.verify_chain` | `<REPOSITORY_ROOT>/repro/far_chain_repro/verify_chain.py` | `IMPLEMENTED_VERIFIED` |
| ③ 浏览器 Web Crypto | 打开 `verify.html`，粘 ProofEnvelope V2 JSON，重算 proofHash | `<REPOSITORY_ROOT>/frontend/public/verify.html` + `<REPOSITORY_ROOT>/frontend/src/lib/merkle.ts` | `IMPLEMENTED_VERIFIED`（ProofEnvelope V2 proofHash + Merkle/Suite；不验证 raw evidence） |

#### 第 3 幕 · 灵魂时刻 ② · 翻转一字三路报红

评委亲手翻转 `.chain` 表中任一 `call_records` 的 payload 字符 → 三路（Node / Python / Browser）同时报红 → `PROOF_HASH_MISMATCH` reason code。

#### 第 4 幕 · 老实承认 · 1e-7 红基线

主讲人主动展示 `cross_lang_consistency.test.ts` 的 `1e-7` 科学计数法鸿沟（TS `fast-json-stable-stringify`→`1e-7`，Python `json.dumps`→`1e-07`），诚实标 RED 待 V3 迁移——反 theater 姿态本身就是可信度证明。

### 7.3 任务

| 任务 | 验收口径 | 状态 |
|---|---|---|
| 准备 `Your Laptop Is The Verifier` 演示包（含 U 盘离线包） | 评委笔记本无 `DASHSCOPE_API_KEY` 也能跑通三路验真 | `PARTIAL`（核心离线包已 `IMPLEMENTED_VERIFIED`；仍缺非项目成员 fresh-clone 录屏与预编译环境包） |
| 准备 Trust Receipt 一页 | 自然语言解释是次要的，结构化 JSON 才是主口径 | `IMPLEMENTED_VERIFIED`（`far export receipt` JSON/Markdown；V2 envelope + V1 `.far-proof`，篡改拒发） |
| 准备风险边界页 | 与 `07_RISK_REGISTER_AND_DO_NOT_CLAIM.md` 一致 | `DESIGN_LOCKED` |
| 准备 Q&A 防守稿 | 赛道回扣（生成可证伪的假设 vs 生成漂亮的假设） | `PARTIAL` |
| FI-7 TimeMachine（必做满血） | scrub + fork + deterministic 续跑 + 三跑 byte-equal 录屏（仅 deterministic track，赛道诚实标注：续跑 byte-equal 仅 deterministic track 成立、真实 LLM 轨道不成立） | `ROADMAP` |
| 六灵魂时刻演练 + 三级降级预案 | 各路径演练含断网（demo-day 现场鲁棒性）；非项目成员 fresh-clone exit 0 | `ROADMAP` |
| 答辩 DO_NOT_CLAIM V2 内化 | 全员禁说清单 | `DESIGN_LOCKED` |
| 全用户面零裸数字 + 零裸「首个」 | status-dump 回填 + hedge | `PARTIAL` |
| 答辩前复核外部竞品和论文事实 | Right-to-History / 谱系锚点查新结论落 `NEEDS_EXTERNAL_VERIFICATION` 或 hedge | `NEEDS_EXTERNAL_VERIFICATION` |

### 7.4 DOD（W5 总门 · 答辩前总门）

- 现场无需外部 API key 即可演示验证闭环；
- 评委能亲手篡改并看到红灯（三路同时报红）；
- 主讲人能解释每一个 verdict（五值 + reason code）；
- 所有强 novelty 说法都有来源或 hedge（「据我们所知 / among the first」+ 谱系锚定语句）；
- 未实现项不包装成已完成（每个能力有状态标签，禁手填数字）；
- 续跑 byte-equal 仅 deterministic track 成立的赛道诚实标注保留；
- demo-day 三级降级预案（含断网）演练通过。

> 未过 W5 总门不上答辩台。

---

## 8. V2 / V3 路线图

> V2/V3 的能力标注 `ROADMAP` / `RESEARCH` 状态标签；外部竞品/论文引用须 hedge 并标 `NEEDS_EXTERNAL_VERIFICATION`。

### 8.1 V2（产品化 + 体验 wow + 元科学新颖性）

| 项 | 内容 | 状态 |
|---|---|---|
| `far` CLI 工具链 | 30 秒 fresh-clone 零密钥上手（status/verify/verify-golden/export/bench/fec/fsm/demo/api） | `IMPLEMENTED_VERIFIED`（见 05 §9.2） |
| `far ask`/`repl`/`stream` 交互壳 + 流式产出 `.far-proof` | REPL 提问/追问/fork + SSE 流式打印每阶段 | `ROADMAP`（W1 薄壳轨·见 05 §9.2） |
| 对抗科学竞技场（多 refuter 实时攻击） | deterministic arbiter + 反驳记分板（W3） | `ROADMAP` |
| 跨模型可靠性法庭 | 同一 claim 跑多模型，结构化检测一致/分歧，颁发 ReliabilityCertificate（W4） | `DESIGN_LOCKED`（persona 档 `PARTIAL`，真实档 `NEEDS_HUMAN_OPERATION`） |
| Domain Pack 插件架构 | 5+ pack（W4） | `ROADMAP` |
| FAR-Bench 125 + 可验证 live leaderboard | 浏览器独立重算套件根（W4） | `ROADMAP` |
| 实时流式证明链 + WASM 浏览器全验 | 三向字节相等 + µs 级 perf 基准（W4） | `ROADMAP` |
| Rust/Go independent verifier | 第三语言独立验证器 | `ROADMAP` |
| claim graph propagation | `buildClaimGraph` / `propagateGraphVerdict` | `ROADMAP` |
| signed transparency log prototype | 本地 Merkle 账本（非上链）之上的签名透明日志原型 | `RESEARCH` |

### 8.2 V3（生态 + 形式化 + 长跑）

| 项 | 内容 | 状态 |
|---|---|---|
| public third-party verifier ecosystem | 公开第三方验证器协议（`FINAL_PACKAGE/57` 已设计） | `ROADMAP` |
| full WASM verifier | 浏览器零服务端全验 `.far-proof` | `ROADMAP` |
| formal spec and model checking | Lean/TLA+/Alloy 信任根不变式（局部锚点非全系统形式化）；TLA+ append-only 链长单调递增最小不变式 | `RESEARCH`（`NEEDS_EXTERNAL_VERIFICATION`：须对应工具链 fresh-clone 可用） |
| FAR-Level profile / FAR-Bench 500 | 扩展到 500 题大规模 benchmark | `RESEARCH` |
| large hidden-set benchmark | 大规模隐藏集 benchmark | `RESEARCH` |
| long-running scientific custody | 长跑科研托管 | `RESEARCH` |
| C7 单点根因消除（若 V1/V2 实战证明 modelId 进 hash 运维代价过大） | 改 `verifyChainHead` 算法白名单四字段（越 Ask 层红线，V3 提 Ask 重新评估） | `RESEARCH` |
| RO-Crate / PROV-O 严格合规 | 第三方开源校验器全过（W2 路径 A 的远期形态） | `ROADMAP` |
| 数值域 byte-equal 形式化迁移 | 解决 `1e-7` 等数值域 `NUMERIC_KNOWN_DIVERGENCE`（emoji / ZWJ / 指数零填充 / 补充平面） | `RESEARCH` |

### 8.3 错误模型（与五值裁决的映射 · `FINAL_PACKAGE/75` §6）

| Code | 含义 | verdict effect |
|---|---|---|
| `FEC_NOT_COMPILABLE` | claim 无法映射到可测量蕴含 | `UNTESTED` |
| `FEC_NOT_FROZEN` | freeze 前执行 | `UNTESTED` |
| `DATASET_BINDING_MISSING` | 无有效 dataset | `UNTESTED` |
| `MEASUREMENT_FAILED` | 主测量失败 | `UNTESTED` / `INCONCLUSIVE` |
| `PROTOCOL_DEVIATION_CRITICAL` | 使结果失效 | `UNTESTED` |
| `SCOPE_MISMATCH` | 证据覆盖范围比 claim 窄 | `DEGRADED_SCOPE` |
| `CONTRADICTORY_EVIDENCE` | 支持/反证冲突 | `INCONCLUSIVE` |
| `PROOF_HASH_MISMATCH` | 篡改 | verifier RED（不落 verdict，直接报红） |

---

## 融合织入（Open Science 工程范式迁移·DESIGN_PROPOSED·2026-07-05）

> 来源：`FAR_LAB_MASTER_PLAN/FUSION_OPEN_SCIENCE_DESIGN.md` + `FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md` §C 末段。Open Science = Claude Code 分支重品牌化的执行层 agent 工作区；FAR-Chain = 验证层。迁移边界：只迁工程范式（反剧场 / fail-closed 服务门 / 收窄伪造窗口 / 内容寻址 CAS / derivable 标记 / 进程组 kill / AST 结构门），绝不迁 OS 的 LLM-裁决语义。下述条目全 NOT_BUILT，属未来 backlog，不抢当前 next_action。

### 与本文档（06_ROADMAP_AND_DOD）相关的融合缺口

- **P-FUSION 波次（DESIGN_PROPOSED，W0-W5 之后的独立延伸波次）**：迁移 Open Science 工程范式，14 项 FUSION-OS-1..14 全 NOT_BUILT。**不抢 W0-W5 当前优先级**（W0-W5 是 P0 工程闭环 + keystone bot，见 DEPTH_LEDGER §A next_action=KEYSTONE_DEPTH_EVIDENCE_BOT）。
- **建议取序**：FUSION-OS-1（反剧场实时接线·最高杠杆·闭合当前最大活体缺口）→ FUSION-OS-11（DB CHECK 五值 enum·红线级强制）→ FUSION-OS-13/14（内核 form/identifier 规则）→ FUSION-OS-9/10/12（schema：blob CAS / derivable / supersede）→ FUSION-OS-2/3/4/7/8（sandbox 加固）→ FUSION-OS-5/6（verifier AST 门 + provenance）。
- **验收门**：每项接线须升 DEPTH_LEDGER §C 对应行至 WIRED_RED，物证由 keystone bot CI 双跑写回 WIRED_GREEN；agent 不得手填。
- **边界**：真 OS 级网络/cpu/mem 隔离仍 V2（07_RISK_REGISTER §188 自承），P-FUSION 的 sandbox 项是用户态降级，绝不宣称运行时隔离。

> 接线时升 WIRED_RED，物证由 keystone bot CI 双跑写回 WIRED_GREEN（见 DEPTH_LEDGER §D）。取序建议见 CLAUDE.md §4 P-FUSION。

---

## 9. PR Checklist

每个工程 PR 必须回答（任一「是」须在 PR 描述显式说明影响与对策）：

- 是否改变 verdict-critical 字段（`VerdictKind` 枚举 / `verdict_mapping` 5 路径 / `FecContractV2` 字段集合）；
- 是否更新 `proofHash` input（`objectHash` 聚合字段）；
- 是否更新 golden vectors（含 verdict golden / canonicalHash golden / NUMERIC_GOLDEN_VECTORS）；
- 是否影响 Python/browser verifier（`repro/far_chain_repro/verify_chain.py` / `frontend/src/lib/merkle.ts` / standalone `verify.html`）；
- 是否引入 LLM final judge（禁止——裁决必须 deterministic）；
- 是否影响 status dump（`far status --json` 输出 schema / 字段）；
- 是否增加外部事实或强口号（「首个 / 最新 / 唯一 / 完全可复现 / 物理不可篡改 / 证明科学真理 / 全自动科学家 / 通用 AI4S benchmark」等禁用词，须 hedge + 来源 + `NEEDS_EXTERNAL_VERIFICATION`）；
- 是否需要更新 Trust Receipt 和 docs（用户面文档净增 ≤3）；
- 是否触发 W0/W2 质量门回归（路径虚构 / 数字漂移 / fresh-clone 失败）。

禁用词清单（仅在「禁用 / 历史 / 修正」语境可出现且必须显式标注）：证明科学真理、物理不可篡改、完全可复现、全自动科学家、通用 AI4S benchmark/排行榜、`far-chain/`（作为真实实现路径）、最新 / 第一 / 唯一（无来源支撑）。

---

## 10. 追溯与缺漏条目（诚实标注）

### 10.1 追溯矩阵（旧 FINAL_PACKAGE 编号 → 本文件新位置 · 物理档案已退役）

| 旧编号（FINAL_PACKAGE） | 旧主题 | 新位置（本文件） | 物理档案状态 |
|---|---|---|---|
| `21` §0-§10 | 实现路线图（取消分期·历史口径） | §1.1（北极星）/ §1.3（模块依赖） | 已归档历史口径，备份 `C:/Users/RichardYuan/FAR-Lab_Backups/` |
| `32` §1-§7（簇 A-E） | 彻底升级五簇（信任根数学 / 执行级反 theater / novelty 再锚 / 快照迁移溯源 / 诚实可视化） | §3（信任根）/ §4（verdict kernel）/ §6（多域）/ §1.1（novelty hedge） | 已归档 |
| `43` §0-§3 | 究极升级总纲（FI-1 ~ FI-10） | §1（FI 映射）/ §3.2.3（FI-1）/ §4.2.2（FI-9）/ §5（FI-2）/ §6（FI-3/4/5/6）/ §7（FI-7） | 已归档 |
| `55` §1-§6 | V2 实施路线图（W0-W5 全 FI 满血） | §1.2（关键路径）/ §2-§7（W0-W5） | 已归档 |
| `60` §0-§3 | Your Laptop Is The Verifier 主线 | §7.2（动线四幕） | 已归档 |
| `75` §1-§10 | 工程实现蓝图（Module Map / 接口 / 状态机 / 错误模型） | §3.2.3（CLI 命令 + 状态机）/ §8.3（错误模型） | 已归档 |

### 10.2 已知缺漏 / 待 Ask 裁决（诚实标注，不假装全解）

1. **CROSS-CUT-003（migration 编号 SSOT 矛盾）**：`§8.0` 冻结 SSOT 止于 `0015`，而 `FINAL_PACKAGE/21` 路线图层引用 `0016-0025`。属 Ask 层裁决（改 Schema），本文件按工作假设编号标注，不裁决归属。状态：`NEEDS_EXTERNAL_VERIFICATION`（须主控复核）。
2. **0010 双占（`integrity_events` vs `system_prompt_transparency`）**：待 Ask 裁决编号，裁决前两表 DDL 各自正确。状态：`NEEDS_EXTERNAL_VERIFICATION`。
3. **`far status --json` 输出完整性**：`src/cli/status_dump.ts` 实测产出 testCount/coverage/migrationCount/goldenVectorCount/suiteIntegrityRoot/gitCommitSha 等字段（fresh-clone smoke 验证）。状态：`IMPLEMENTED_VERIFIED`。
4. **standalone `verify.html` 断网可跑**：`frontend/public/verify.html` 已封装为零外链 standalone，拖入/粘贴 ProofEnvelope V2 JSON 后用 Web Crypto 重算 `proofHash`；raw evidence / RO-Crate 外部认证不在此路径内。状态：`IMPLEMENTED_VERIFIED`。
5. **ProofEnvelope Validator 第 10 条规则**：新增协议规则（独立可重算性），已由 `validator.10-rules-coverage.test.ts`、TS/Python/browser proofHash 重算与离线包脚本路径覆盖。状态：`IMPLEMENTED_VERIFIED`。
6. **C7 单点（modelId 进 hash）**：snapshot 切换触发整链重算，根因消除须改 `verifyChainHead` 白名单四字段（越 Ask 层红线），V3 提 Ask 重新评估。当前仅「事后可复现性兜底」，verdict 落 `DEGRADED_SCOPE`。状态：`RESEARCH`。
7. **GPU 确定性本质未解**：参赛锁 Qwen 经百炼 API，无法控制百炼后端 GPU reduction；byte-equal 可能本质不可达，V3 UQ 降级是更可能终态。状态：`RESEARCH`。
8. **数值域 byte-equal（`1e-7` 鸿沟等）**：归 `NUMERIC_KNOWN_DIVERGENCE` 诚实标 RED 待 V3 迁移，非任何方案可代办。状态：`PARTIAL`。
9. **外部查新（Right-to-History / 谱系锚点）**：`arXiv:2602.20214` 原文与 PCC/FPCC/Adam/AlphaProof 优先级须查新核实，PDF 前必须打开原文核作者/机构/方法。状态：`NEEDS_EXTERNAL_VERIFICATION`。
10. **断点续跑 byte-equal**：仅 deterministic track（`offline_replay`）成立，真实 LLM 轨道不成立——赛道诚实标注保留，做满血但不进核心差异化 overclaim。状态：`ROADMAP`（deterministic 档）/ `RESEARCH`（真实 LLM 档）。

> 缺漏条目不构成「已完成」的反证，仅标注「未覆盖」——任何「已完成」声称必须有 `far status` 实测 + CI 输出为证（铁律：改后必验 + 证据驱动）。本文件不手填任何裸数字。
