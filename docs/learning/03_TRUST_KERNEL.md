# 03 · 信任内核：R0-R9 确定性裁决规则树

> 学习目标：逐条理解 R0-R9 规则树的 17+ 条规则（5 个值 × 优先级锁死）；理解
> golden vectors 为什么是内核的行为契约；理解"确定性"为什么是信任的根基。
> 前置：01, 02。产出：能解释任意 verdict 的 decisiveRuleId 为什么是它。
> 代码：`src/falsifiability/verdict_kernel_v2.ts`（774 行，纯函数，无 IO 无 LLM）。

---

## 3.1 为什么必须是确定性内核？

想象两种裁决方式：

- **LLM 裁判**：同一个 claim，同一批证据，问两次可能得到不同 verdict；无法审计
  推理链；无法被第三方独立重算；生成假设的模型带着同样的偏见来裁判自己的假设。
- **确定性规则树**：给定完全相同的输入，永远输出完全相同的 verdict + 完整的
  规则 trace（哪条规则触发、为什么）。任何人可以用公开代码重算，结果字节级一致。

FAR-Lab 选后者。整个内核是一个**纯函数**：

```
输入: VerdictKernelInput（FEC + 统计结果 + 协议偏离 + 反剧场发现 + ...）
输出: VerdictKernelOutput（verdict + reasonCodes + decisiveRuleId + ruleTrace + ...）
```

内核不读数据库、不调用网络、不碰 LLM。所有输入由调用方（orchestrator）预先算好，
内核只做一件事：**按固定优先级跑规则树，第一条决定性规则胜出**。

## 3.2 五值语义（先记牢）

| 值 | 含义 | 通俗说法 |
|---|---|---|
| `CONFIRMED` | 证据与 FEC 契约一致，有界支持 | "按契约看，证据支持这个说法" |
| `REFUTED` | 主检验显著反驳 | "按契约看，证据否定了这个说法" |
| `INCONCLUSIVE` | 证据矛盾/功效不足/有警告 | "证据不够下结论" |
| `DEGRADED_SCOPE` | 证据只覆盖部分范围 | "在缩小的范围内成立" |
| `UNTESTED` | 门没通过，根本没测 | "无法测试/拒绝测试" |

⚠️ 注意 `CONFIRMED` 的精确语义：**"contract-consistent bounded support"**——
它不等于"科学为真"。代码注释里写得很清楚：CONFIRMED means the evidence is
consistent with the FEC contract within bounds。这也是 README Known limits #7
强调的：astronomy 里的 CONFIRMED ≠ "确认系外行星"。

## 3.3 优先级锁死（最重要的一个表）

```
DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED
```

这不是随意排序，而是**保守性排序**：越"危险"的结论越优先。
- 如果证据既支持又反驳（矛盾），系统宁可给 INCONCLUSIVE 也不给 CONFIRMED。
- 如果范围退化，宁可降级也不假装全面成立。
- UNTESTED 在最底——它表示"什么都没测"，而 INCONCLUSIVE 表示"测了但不确定"。

## 3.4 规则树逐条拆解（对应代码 line 315-566）

### 门阶段（fail-fast，全部 UNTESTED）

| 规则 | 触发条件 | 含义 | 代码位置 |
|---|---|---|---|
| `R0_SCHEMA_INVALID` | FEC contractVersion 不被 verifier 支持 | 连格式都不对 | L318 |
| `R1_FEC_NOT_COMPILABLE` | fec 为 null / 编译失败（含 HARKing 检测） | 没有可执行的测量计划 | L331 |
| `R2_NO_VALID_DATASET_BINDING` | 数据集绑定为空或全无效 | 没有绑定真实数据 | L345 |
| `R3_CRITICAL_PROTOCOL_DEVIATION` | 协议偏离含 critical（alpha 篡改/metric 偷换/提前停止/后验排除） | 流程被污染 | L368 |

这四个门保证：**没有 FEC、没有数据绑定、流程被污染 → 一律 UNTESTED，不进入
统计裁决**。这就是"门口拒绝不可证伪 claim"的实现。

### 范围阶段

| 规则 | 触发条件 | 含义 | 代码位置 |
|---|---|---|---|
| `R4_SCOPE_MISMATCH_NONCRITICAL` | 证据只覆盖 claim 的部分范围 | 结论降级为 DEGRADED_SCOPE | L386 |

例：claim 说"材料在 300K 超导"，证据只在 280K 测过 → 范围不匹配（非关键）
→ DEGRADED_SCOPE，而不是假装全面成立。

### 统计阶段（核心裁决）

| 规则 | 触发条件 | 含义 | 代码位置 |
|---|---|---|---|
| `R5_CONTRADICTORY_SIGNIFICANT_EVIDENCE` | 既有显著支持又有显著反驳 | INCONCLUSIVE | L426 |
| `R6_PRIMARY_TEST_REFUTES` | 主检验显著反驳（跨过反驳阈值） | REFUTED | L462 |
| `R7_PRIMARY_TEST_CONFIRMS` | 主检验显著支持 + 无警告假设 + 无 integrity flags + 功效足够 | CONFIRMED | L535 |
| `R8_INSUFFICIENT_POWER_OR_NULL` | 功效不足 / 统计量缺失 / 假设诊断警告 | INCONCLUSIVE | L552 |
| `R9_ALL_TESTS_SKIPPED` | 所有检验都被跳过 | UNTESTED | L566 |

关键细节（代码注释 L11-15）：
- **R7 加 `!hasWarnAssumption`**：任何统计假设诊断（正态性/分布漂移/异方差）出现
  warn → 不得 CONFIRMED，降 R8。GV-01 反 theater 自检就抓这个。
- **R7 要求 integrityFlags 为空**：seed cherry-pick / metric swap 会在 integrityFlags
  里追加 `p_hacking_risk`，直接阻断 CONFIRMED。
- **mde（minimum detectable effect）可选**：FEC 里没做功效分析 → effectSize 门
  跳过。诚实降级：不知道功效就不能说"充分"。

### 附加规则（causal / 溯源 / 指纹 / 派生形式）

| 规则 | 触发条件 | 含义 |
|---|---|---|
| `R_CAUSAL_CONFOUNDING_FAIL/WARN` | claimType='causal' 且 ConfoundingGate 判 FAIL | 因果声称必须过混淆门（F6 红线） |
| `R_IDENTIFIER_FABRICATION` | claim 带 identifier（DOI/arXiv）但系统 trace 不到 | REFUTED（标识符伪造） |
| `R_IDENTIFIER_RESOLUTION_ENV_FAILURE` | identifier 无法解析（环境故障） | UNTESTED（非伪造） |
| `R_EXECUTION_FINGERPRINT_MISMATCH` | 复算资源轮廓发散 >10x（wall/cpu/RSS） | DEGRADED_SCOPE（结果不可复现） |
| `R_DERIVATION_FORM_MISMATCH` | 统计值派生形式与 FEC 声明不一致 | INCONCLUSIVE（值对但来历不对） |

## 3.5 Golden Vectors：内核的行为契约

`golden_vectors/golden_vectors.json` + `src/cli/commands/verify_golden.ts`：
14 个精心构造的输入-输出对，覆盖每个规则分支。它们的作用：

1. **重构安全网**：谁改内核，必须让 14 个向量全部 PASS，否则行为漂移立即暴露。
2. **可执行文档**：比任何 prose 都精确地定义了"什么输入 → 什么 verdict → 什么规则"。
3. **跨语言验证**：`verify-golden --all` 可以在 node / python 后端都跑，
   保证 TS 与 Python 的裁决字节一致。

演示输出里你能看到：
```
PASS GV-01: CONFIRMED via R7_PRIMARY_TEST_CONFIRMS
PASS GV-07: INCONCLUSIVE via R8_INSUFFICIENT_POWER_OR_NULL
PASS GV-12: INCONCLUSIVE via R8_INSUFFICIENT_POWER_OR_NULL  (seed cherry-pick)
PASS GV-14: REFUTED via R_IDENTIFIER_FABRICATION
```

## 3.6 动手练习

1. **读规则树**：打开 `src/falsifiability/verdict_kernel_v2.ts` L286-570，
   对照上面的表逐条看触发条件。找出 R5 和 R6 的先后关系为什么这样排。
2. **跑 golden vectors**：`node src/cli/far.ts verify-golden --all`，把 14 条
   输出抄下来，标注每条对应 3.4 表的哪一行。
3. **追一个 trace**：`far demo` 的 ③ C-MMLU-A-0001 输出 `R7_PRIMARY_TEST_CONFIRMS`。
   打开 `src/science_harness/hero_a_pipeline.ts` 找 `statistics` 输入：
   p=1.4e-4 < α，effectSize=1.93，无 warn → 为什么是 R7？如果 p=0.08 呢？
4. **（进阶）自己造一个输入**：写 10 行脚本调 `decideFiveValueVerdict`，
   传一个 `fec=null` → 观察返回 UNTESTED/R1。再传一个带 critical
   protocolDeviation 的 → 观察 R3。

## 自测

- [ ] 能默写 5 值 + 优先级顺序
- [ ] 能解释 R0-R3 为什么全部产出 UNTESTED
- [ ] 能说出 R7 需要哪三个条件同时满足（支持/无警告/无 integrity flag + 功效）
- [ ] 知道 golden vectors 是干什么的、有 14 个
- [ ] 知道 CONFIRMED ≠ 科学为真

→ 下一步：[04 统计引擎](04_STATISTICS.md) —— p 值、效应量、多重比较，每个公式为什么。
