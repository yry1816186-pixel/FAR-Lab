# SCIENCE.md — Scientific Intelligence Layer 交接（SCIENCE lane, 2026-08-24）

Branch: `science/intelligence-layer`（隔离 worktree `work/scientific-intelligence`，基线 21f6233）
方法：5 路并行审计（检索/证据/假设/实验统计/评估面）+ 逐项机制分类（prompt heuristic / deterministic algorithm / statistical estimator / IR method / LLM judgment / scientific rule / trained model / external engine）+ 缺陷分级 + 确定性修复 + 离线判别性 benchmark。

---

## 1. 核心发现（按科学质量影响排序）

### P0-1 形式证据层在生产中完全惰性【已修复】
全部生产写入点硬编码 `strength: 'unrated'`（evidence.ts 两处 / falsify.ts / hypothesis-ops.ts），而 `logLrInterval` 对 unrated 一律返回 [0,0] → **每次 live run 的 Σlog-LR 恒 [0,0]/band 'none'、QBAF 恒 0.5、Carneades 恒 scintilla、ACH 诊断性恒空、literature_only_unverified 晋升不可达**。数学机器建好、测过、渲染，但永远输出常数——展示的是常量伪装成测量。
**修复**：`src/domain/evidence-strength.ts` 确定性映射（binding 未验证/certainty 下限→unrated 零权重；high→moderate（文献封顶，strong 保留给实验证据）；moderate+定量→moderate；moderate 非定量/low→weak），每个关系携带可审计 derivation 串；4 个写入点全部接线。BEFORE-lock（unrated→[0,0] 属性）+ AFTER 断言入 `tests/science-formal-revival.test.ts`。

### P0-2 矛盾闭环断裂【已修复】
D-018 claim-claim 矛盾判定后只存储不消费：buildEvidenceBody/ACH 都 `filter(targetHypothesisId)` 排除它们，GRADE inconsistency 域硬编码 0 且从不重算。
**修复**：(a) cross 关系以 claim→claim 攻击/支持边进入 QBAF 图（任一端点是该证据体已链接 claim 时），Σlog-LR 不变（不双计）；(b) evidence stage 末尾确定性重算：被 contradicts 关系触碰的 claim 以真实 contradictionSignals 过完整 finalGradeCertainty 阶梯（新单一所有者，admission 与 rescore 同一代码路径），只降不升、幂等。判别测试：同一证据体加一条矛盾边 → qbafScore 严格下降；D-018 集成测试断言两端 claim high→moderate + summary 计数。

### P0-3 `primary_falsified` 停止规则永不触发（真 bug）【已修复】
decision core 契约要求"caller 标记 falsified 单元为 failed"，但 driver 的 `stateFromRun` 只映射 `run.status`：统计 falsifies 判决→completed→规则死；infra 崩溃反而以错误语义触发。
**修复**：`stateFromReports`——completed + 机械 verdict 含 'falsifies' → failed（+事件 falsified:true 披露，与运维失败可区分）；canceled 优先；运维 failed 不冒充 falsified。

### P0-4 排序层解码失控【已修复】
rank 维度打分（最承重数值输入→composite→种子序）与 revise 全部 3 个调用运行在 **provider 默认温度**，而其他所有判断级都显式设温。
**修复**：rank scoring + revise 3 调用全部 `temperature: 0`。

### P0-5 `e_value_accumulation` 空壳【已修复】
experiment spec 层拒绝它（无 e-value 估计器），但 CampaignSpec 层接受且 campaign driver 可跑（alphaLedger→null）——承诺一个系统算不出的 always-valid inference。
**修复**：CampaignSpec 校验 fail-closed 拒绝（镜像 spec 层语义）；campaign α 份额一致性：frozen unit spec 的 statistics.alpha 超出声明的 campaign share → 单元 fail-closed（拒绝静默超支族预算）。

### P1 级（已修）：
- **引用图扩展（PRISMA 雪球）**：OpenAlex adapter 新增 `searchFiltered`（filter= 参数，可选接口方法，无该能力的家族诚实跳过）；retrieve stage 在融合/重排/选择之前执行有界追逐——top-3 openalex 种子（按 RRF）× 前向 `cites:`（每种子 6 条）+ 后向 `referenced_works` 批量 `ids.openalex:`（≤50 id 一批）；每次追逐搜索 receipted + 查询入 CorpusSnapshot（purpose `citation_chase`）+ fusion.citationChaseSearches 计数；追逐结果经同一去重池/RRF/席位竞争（赢得席位而非保证席位）；失败 fail-visible 不阻断（enrichment 语义）。
- **plan→执行统计缝（预注册完整性）**：plan-formal 冻结门新增 `IMPLEMENTABLE_PLAN_STATISTICS` fail-closed（当前=bootstrap_ci|descriptive）——冻结承诺无执行器的 permutation/wilson/kappa/mde_gate 现在被拒；plan 生成提示词同步收缩（不再宣传不可执行枚举、不再建议已被 spec 层拒绝的 e_value_accumulation）。
- **eValue 激活**：VanderWeele-Ding 闭式原本零生产调用者；新增 `extractRiskRatios`（RR/risk ratio/relative risk 有界正则，去重，拒绝退化值），evidence 入场时 quote 含 RR 即在 claim uncertainties 披露最小未测混杂强度（建议性披露，不降级）。
- **BT 无置信区间** → seeded 非参 bootstrap（mulberry32, 1000 重采样, percentile 95% CI；Chatbot-Arena 式 resampled-MLE）；standings 携带 ciLow/ciHigh（additive-optional，兼容旧记录）；uncertainty 文本升级为 top-2 CI 重叠披露（重叠=掷硬币级区分）。
- **撤稿状态顺序依赖** → update-to 数组顺序不再决定状态；优先级 reinstated > retracted > EoC > corrected（[correction, retraction] 旧读作 corrected 的缺陷已锁测试）。
- **MinHash 注释漂移**（注释 0.8 vs 代码 0.5）→ 阈值命名为常量 + 注释对齐实测校准。

---

## 2. 机制分类结论（每项判定的真实机制，不许混淆）

| 层 | 真 statistical estimator / deterministic algorithm | LLM judgment（诚实标注 uncalibrated） | 外部引擎 |
|---|---|---|---|
| 检索 | RRF k=60、去重三级（主键/模糊标题/MinHash 0.5）、arXiv 零结果级联、席位下限 | 查询规划、RankGPT 滑窗 rerank（失败回退 RRF） | OpenAlex/arXiv/Crossref/EPMC、response cache |
| 证据 | quote 对齐门（Jaccard≥0.8）、GRADE-lite 阶梯、GRIM/范围守卫、**新：relationStrength + inconsistency rescore** | claim 抽取（temp 0）、stance、D-018 成对判定、链接审计 | 标识符解析 |
| 形式层 | Σlog-LR（Kent/Mosteller-Youtz 阶梯）、QBAF（Potyka 阻尼 0.5 不动点）、Carneades 阈值、ACH 诊断性/移除敏感性、**新：claim-claim 矛盾边** | 无（纯计算） | 无 |
| 假设 | MinHash+并查集近重复合并、释义守卫（Jaccard 0.85）、可判定性 regex 门 | 三策略生成、聚类、novelty 标签、文献 novelty（OpenAlex 邻居） | OpenAlex |
| 排序 | 固定权重 composite、circle 赛程、换序聚合、BT-ILSR、**新：bootstrap CI** | 维度打分（**新：temp 0**）、pairwise 判决（0.1） | 无 |
| 实验/统计 | 机械判决（LLM 永不判）、Bonferroni 等分、DL+z-CI、百分位 bootstrap、implied power、proper scoring rules（RPS/Brier） | plan 提案、meta 效应量提案 | scipy/sklearn/cleanlab（sidecar 锁定） |
| 筛选 | TF-IDF+SGD 在线模型（seeded）、WSS@95 式停止 | 无 | 无 |

---

## 3. 已知未修缺口（按建议优先级，接手者从这里继续）

### 高价值（P1，本轮未及实施）：
1. **screening 池错位**（检索审计 P0-2）：ASReview 层在截断后 ≤12 文档语料上运行，覆盖率估计/停止规则统计上无意义。修法：池化预选池（池条目持久化或延迟解析）+ poolSize<30 时诚实 underpowered 披露。（注：完整修复需动 store 持久层——sibling lane 中改文件，未能本轮实施。）
2. **剩余死算法激活或删除**：conformalInterval（正确实现，val split 已在）、revision-predicates（revise 用自己的 changedFields）、RatingDistribution+熵、search-allocation.allocateSamples——仍零生产调用者。宪法第 5 条：要么接线要么删。（eValue 已于本轮接线。）
3. **矛盾判定精度**（证据审计 P0-3，自测 contradicts 精度 ~30%）：确定性数值一致性检查（extractStats 已有：同主题对的不重叠 CI/方向冲突自动降级）+ quote 锚定三向蕴含判定（quote A=premise）。
4. **元分析 CI**：DL z-CI 小 k 欠覆盖；加 Hartung-Knapp t_{k-2}（需 TS t 分位数 ~40 行或 sidecar）。
5. **permutation/wilson/kappa 执行器**：本轮以 fail-closed 门守住预注册完整性；真实现（scipy 已锁）后把枚举值加回 IMPLEMENTABLE_PLAN_STATISTICS。

### 中价值（P2 摘要）：
语言偏见未披露（强制英文查询；语料脚本计数器 + CJK 问题原生查询变体）；检索无饱和度量（列表重叠/唯一率）；doc-type/date filter 缺失（勘误可作证据入池）；GRADE 域弱代理（不精确=有数字、间接性=15 年新鲜度、无设计类型区分）；无实体规范化（IL-6→il,6 全丢弃→主题门退化；缩写展开正则可修）；novelty 层单 OpenAlex 家族无 failover；screening 停止估计无不确定性；跨版本 α 账本 log-only；Bonferroni-only（可加 Holm 选项）；无 n-solver/精确 power（scipy 已锁）；bayesian 标签无执行器；percentile-only bootstrap（无 BCa）；GRADE/floorCertainty 不进 rank composite；gap-seek 单源解析 resolved:true 过度声明；extractMeanN 均值×n 全交叉伪 GRIM 对。

### 评估面遗留：
rediscovery 金集 5 任务全生医、单标注者；LLM 盲评 live-gated（BLOCKED-live 政策下不可跑）；rank/revise 解码参数现在已钉但 prompt-regression.mjs 尚未锁 `temperature:` 调用点（建议加正则提取防回退）。

---

## 4. Benchmark 资产（离线、确定性、零 API）

| 文件 | 覆盖 | 判别性设计 |
|---|---|---|
| `tests/science-formal-revival.test.ts` | strength 映射全分支、finalGradeCertainty、Σlog-LR/QBAF/promotion/ACH 复活、矛盾边传播 | BEFORE-lock（unrated→[0,0] 惰性域可检测）+ AFTER 非退化断言；同证据体±1 矛盾边 qbaf 严格降；Σlog-LR 不变（防双计） |
| `tests/science-rank-statistics.test.ts` | BT bootstrap CI（seeded 字节复现/10-0 支配 CI 分离/未参赛无 CI）、primary_falsified 契约（completed+falsifies→failed）、composite ±10% 权重扰动排序稳定性 | 确定性双调用相等；支配对 CI 不相交；canceled/运维 failed 不冒充 falsified |
| `tests/science-retrieval-bench.test.ts` | 多学科 qrels（生医/ML）nDCG@10：RRF 融合 ≥ 每个单一列表；跨列表佐证 > 单列表命中；反证席位下限（低排名失败复现不被 cap 挤出） | 与 eval/retrieval-baseline.mjs 同 nDCG 公式族；融合无回退窗口断言 |
| 集成扩展 | pipeline-evidence D-018 测试断言 rescore 闭环（两端 claim high→moderate + summary 计数 + cross strength=moderate）；eValue 管道测试（RR quote → E-value 披露）；pipeline-retrieve 引用追逐测试（cites:/ids.openalex 过滤语法、receipt、fusion 计数、追逐文档赢得池席位）；plan-formal 不可执行统计拒绝测试（4 拒 2 纳） | 全部走真实 stage 管道路径（stub adapter/provider，零 live API） |

外部方法调研结论（SOURCE→INSPECT→ADOPT/ADAPT）：BT+bootstrap CI = Chatbot Arena/lmarena 标准法（ADOPT，seeded 内置实现）；conformal Elo/PPI 校准（arXiv 2606.13221/2601.18777）= 记录为校准升级路径（需人工锚点集，未采）；Hartung-Knapp（Cochrane 2022 起）= 记录待实施；Holm = 可选策略待加。

---

## 5. 门禁与证据

- 基线：21f6233 vitest 1390+28（dist 重建后失败文件复跑全过）/4 skip。
- 变更后全量：见本次提交（build+tsc+vitest full suite 输出附于提交说明）；新增测试 22 项，更新断言 6 项（全部是从锁定缺陷行为→锁定正确确定性语义）。
- 变更文件清单（全部 worktree 分支，主树 sibling mid-edit 文件零接触）：
  - 新增：src/domain/evidence-strength.ts、tests/science-{formal-revival,rank-statistics,retrieval-bench}.test.ts
  - 修改：src/domain/{claim,evidence-body,scorecard,campaign,index}.ts、src/pipeline/stages/{evidence,falsify,rank,revise,retrieve,verify}.ts、src/app/campaign-driver.ts、src/server/hypothesis-ops.ts、tests/{pipeline-evidence,campaign-spec,campaign-runtime,retraction-gate}.test.ts
- 接口边界：无新依赖（zod-only 不变）；schema 变更全部 additive-optional（TournamentStanding.ciLow/ciHigh）；Agent Runtime 接口不变——本层只强化既有 stage/domain 的科学语义。

## 6. 与 Agent Runtime 的边界

本层不做编排（无第二 workflow engine）：所有修复落在 domain 纯函数 + 既有 stage 写入点 + 既有 campaign driver 状态映射。运行时合同（stage machine/checkpoint/receipt/事件）未动。
