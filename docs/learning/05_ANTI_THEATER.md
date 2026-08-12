# 05 · 反剧场检测：22 个统计欺诈检测器逐个拆解

> 学习目标：理解"剧场"（theater）指什么；掌握 23 个检测器的分类框架；
> 对每个检测器能说出：检测什么攻击 / 怎么实现 / 为什么误报率=0；
> 理解 finding 如何投影进内核并改变 verdict。
> 前置：03, 04。产出：能画出"攻击 → 检测器 → verdict 影响"映射。
> 代码：`src/anti_theater/detectors/`（23 个检测器，全部纯函数）。

---

## 5.1 什么是"剧场"？

一个测试可以通过三种方式变绿：真的通过了、**看起来**通过了、**假装**通过了。
剧场 = 第三种。例如：

- 后端是 placeholder，测试没碰到真实逻辑（fake-pass）
- 阈值在看完结果之后才定（posthoc-threshold）
- 种子挑有利的报，不利的隐藏（seed-cherry）
- 声称测 accuracy@5，实际跑 accuracy@1（metric-swap）
- 结果不好就悄悄把范围从"全部数据"改成"子集"（scope-launder）

FAR-Lab 的反剧场层不是"猜"，而是**确定性检测**：每个检测器基于精确的集合
差集 / SHA-256 哈希比对 / 数值比较，误报率=0（见 5.4）。

## 5.2 分类框架：六类攻击

23 个检测器按攻击面分六类（这个分类就是你的记忆骨架）：

| 类 | 攻击本质 | 检测器 |
|---|---|---|
| **A. 假绿** | 测试/证据没碰真实逻辑 | fake_pass, label_only, fake_degraded |
| **B. 数据造假** | 数据缺失/伪造/漂移 | missing_raw, data_hash_fake, provenance_unbound, dataset_drift, dep_float_drift |
| **C. 统计欺诈** | p-hacking 家族 | phack_alpha, phack_correction, phack_pcurve, optional_stopping, stopping_rule, hark, posthoc_threshold |
| **D. 声明偷换** | 测量/范围/种子被换 | metric_swap, scope_launder, seed_cherry |
| **E. 裁决越权** | LLM/人试图覆盖判定 | judge_override, report_mismatch |
| **F. 复现漂移** | 声称的流程≠实际跑的 | workflow_digest, overfit |

## 5.3 逐个拆解（22/22）

### A 类：假绿

| 检测器 | 检测什么 | 实现要点 |
|---|---|---|
| `AT-FAKE-PASS` | 测试通过但没触发真实逻辑 | 结构比对：执行轨迹 vs 声称覆盖的代码路径 |
| `AT-LABEL-ONLY` | 证据只是标签/声称，不是测量 | 证据必须有 measurement 数值 + 溯源，纯文本标签判 FAIL |
| `AT-FAKE-DEGRADED` | 人为降级 verdict 掩盖失败 | 降级必须有真实 scope/协议依据，无依据降级判 FAIL |

### B 类：数据造假

| 检测器 | 检测什么 | 实现要点 |
|---|---|---|
| `AT-MISSING-RAW` | 只有汇总数字，无原始数据 | 证据记录必须引用原始测量（或明确豁免路径） |
| `AT-DATA-HASH-FAKE` | 数据哈希伪造/未重算 | 重算数据内容哈希，与声称的哈希比对 |
| `AT-PROVENANCE-UNBOUND` | 结论无数据溯源 | 每条结论必须有 sourceAnchor → 数据集绑定链 |
| `AT-DATA-DRIFT` | 评估数据偏离声明数据集 | 数据集身份哈希 + 版本比对 |
| `AT-DEP-FLOAT-DRIFT` | 浮点漂移被利用来伪造相等 | canonical 序列化 + 数值比较容差审计 |

### C 类：统计欺诈（p-hacking 家族）

| 检测器 | 检测什么 | 实现要点 |
|---|---|---|
| `AT-PHACK-ALPHA` | α 阈值事后改动 | FEC 冻结的 α vs 实际使用的 α，哈希比对 |
| `AT-PHACK-CORRECTION` | 多重比较校正被跳过/做假 | 检验次数 m 与校正方法必须匹配 FEC 计划 |
| `AT-PHACK-MARGINAL-P` | 边缘显著主 p 值（marginal primary p） | 单个主校正 p 值落在 [0.04, 0.05) 且 familySize≥3——p-hacking 风险信号（非 p-curve 分布检验；跨研究 p-curve 作为推荐随访） |
| `AT-OPTIONAL-STOPPING` | 边收集数据边看结果 | 数据收集时间线与检验时间线交叉审计 |
| `AT-STOPPING-RULE` | 违反预注册停止规则 | 停止时机 vs FEC 声明的 stopping rule |
| `AT-HARK` | 先看结果再编假设 | FEC 编译时间 vs 最早数据收集时间（measurementCutoff） |
| `AT-POSTHOC-THRESHOLD` | 阈值看完结果才定 | 阈值必须冻结在 FEC 里，运行期不可变 |

### D 类：声明偷换

| 检测器 | 检测什么 | 实现要点 |
|---|---|---|
| `AT-METRIC-SWAP` | 主指标被偷换（accuracy@5→@1） | frozen primaryMetricHash vs 运行期重算哈希，不等即 FAIL（见下方代码走读） |
| `AT-SCOPE-LAUNDER` | 范围事后缩小 | 声明 scope vs 实际评估 scope，覆盖率比对 |
| `AT-SEED-CHERRY` | 隐藏不利种子 | declaredSeeds − ranSeeds 集合差非空 → HIDDEN_FAILED_RUN |

### E 类：裁决越权

| 检测器 | 检测什么 | 实现要点 |
|---|---|---|
| `AT-JUDGE-OVERRIDE` | LLM/人试图覆盖确定性 verdict | 裁决链中不允许非确定性改写 verdict |
| `AT-REPORT-MISMATCH` | 人读摘要与结构化 verdict 矛盾 | 报告层必须与 kernel 输出一致 |

### F 类：复现漂移

| 检测器 | 检测什么 | 实现要点 |
|---|---|---|
| `AT-WORKFLOW-DIGEST` | 声称的复现流程≠实际跑的 | 工作流 digest（哈希）比对 |
| `AT-OVERFIT` | 过拟合信号（train/test 泄漏） | 评估数据与训练数据身份交集检查 |

## 5.4 为什么误报率=0？（两个代码走读）

### 走读 1：metric_swap（67 行，`src/anti_theater/detectors/metric_swap.ts`）

攻击：FEC 封存时声明 accuracy@5，跑完结果后悄悄改成 accuracy@1，让结果"刚好达标"。

防线（预注册时冻结 + 运行期重算比对）：
```ts
frozen   = input.preregistrationRecord.primaryMetricHash   // 封存时冻结的哈希
executed = hashCanonicalJson({ metric: input.fec.metric }) // 运行期用当前声明重算
if (frozen !== executed) → FAIL  // 不等 = 指标在封存后被篡改
```

为什么零误报：SHA-256 是**密码学精确比较**（64 hex），两个不同的 metric
spec 产生相同哈希的概率可以忽略。注释 L23-24 明说：
"hash 比对是密码学精确比较（64-hex sha256），无误报空间"。

### 走读 2：seed_cherry（111 行，`src/anti_theater/detectors/seed_cherry.ts`）

攻击：声明 5 个种子，只报跑得好的 2 个，藏起 3 个失败的。

防线（确定性集合差）：
```ts
declaredSeeds = input.preregistrationRecord.declaredSeeds   // 预注册声明
ranSeeds      = new Set(runRegistry.runs.map(r => r.seed))   // 实际跑的
missing = declaredSeeds.filter(s => !ranSeeds.has(s))        // 集合差
if (missing.length > 0) → FAIL  // 声明了但没跑 = 隐藏了失败 run
```

零误报保证：触发条件全部是**确定性集合差 + SHA-256 精确比较**，
"无启发式 / 无近似 / 无概率判定"（L43-44）。第二个子路径
SEED_POLICY_MISMATCH 同样用哈希比对。

### 共同模式（记住这个，就看懂了全部 22 个）

```
预注册冻结 (freeze) → 运行期重算 (recompute) → 精确比对 (compare) → 不等即 FAIL
```

大部分检测器都是这个模式的不同实例：FEC 在假设提出时**冻结**关键参数
（α、metric、scope、种子、停止规则、阈值），检测器在运行期**重算**，
**比对**冻结值，任何不一致都是攻击信号。这就是"确定性反剧场"的根基：
**预注册 + 哈希冻结**。

## 5.5 finding 如何影响 verdict

```
detectors → runAntiTheaterLint → findings → toKernelFindings → VerdictKernelInput.antiTheaterFindings
```

严重度映射（03 章见过）：
- **FAIL** → 内核 `ANTI_THEATER_FAIL` → verdict 强制 **UNTESTED**，密封被阻断
- **WARN** → 归入 hasWarnAssumption → **R8 INCONCLUSIVE**
- **PASS** → 无影响

注意：即使统计上 p<0.001，只要有一个反剧场 FAIL，verdict 就是 UNTESTED。
这就是"一个绿色结果 ≠ 一个真实结果"的强制执行。

## 5.6 动手练习

1. **读一个检测器**：打开 `src/anti_theater/detectors/optional_stopping.ts`，
   找到它的冻结端和运行期端，画出和 metric_swap 同构的"freeze→recompute→compare"。
2. **跑攻击语料**：`tests/anti_theater/anti_theater_attack_corpus.test.ts`
   是现成的攻击测试集。跑 `pnpm run test:anti_theater`（或 node --test
   tests/anti_theater/anti_theater_attack_corpus.test.ts），观察每个攻击
   怎么被对应检测器抓到。
3. **看真实触发**：`node src/cli/far.ts audit-seed-cherry`——用真实夹具
   跑种子挑选检测。输出里找 HIDDEN_FAILED_RUN。
4. **（进阶）反向思考**：如果攻击者**先偷换 metric 再重算所有哈希**呢？
   这需要同时攻破 FEC 冻结流程——这正是 V2 引入 Ed25519 签名要收窄的窗口
   （README Known limits #9）。

## 自测

- [ ] 能说出六类攻击框架，每类至少 2 个检测器
- [ ] 能画出 23 个检测器的共同模式（freeze→recompute→compare）
- [ ] 知道 FAIL/WARN 分别把 verdict 推向哪里
- [ ] 能解释为什么这套设计误报率=0（哈希精确比较）
- [ ] 知道 pre-registration 在整个系统里的核心地位

→ 下一步：[06 证据链](06_EVIDENCE_CHAIN.md) —— SHA-256 哈希链与 Merkle 根。
