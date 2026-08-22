# promptfoo + deepeval + lm-eval-harness 侦察报告（Wave-9，2026-08-22）

三仓合并存档（各自完整侦察由子 Agent 完成，此处保留全部机制条目要点）。

## promptfoo（MIT 已验证；crescendo 子目录独立 LICENSE 未验——不移植该件）

**断言系统**：加权断言聚合+阈值覆盖（`src/assertions/assertionsResult.ts`，test 级 threshold 压过单断言 pass）；namedScores/namedScoreWeights 每指标加权账本+用户评分回调可覆盖终判；llm-rubric JSON 评分管线（`src/matchers/rubric.ts`：rubric 从字符串/file:// 加载→nunjucks 渲染→容错 JSON 恢复→阈值复检→`metadata.renderedGradingPrompt` 溯源）；G-Eval 两步（`matchesGEval`：步骤生成→按步骤 0-10 评分）；事实性 A-E 分类（子集/超集/相等/不一致/风格，每类分数可配 `grading.factuality.*`）；嵌入相似度 3 度量+反向量规（依赖嵌入 provider，破零依赖，不采用）；ROUGE（与 TF-IDF 同构，不采用）。

**红队架构**：插件/评分器对（`src/redteam/plugins/base.ts`：nunjucks 评分标准+严格未定义变量错误+`graderGuidance` 注入优先级约定"prioritize this guidance"+few-shot `graderExamples`+拒答/空输出短路）；Best-of-N 攻击预算（`strategies/bestOfN.ts`+`providers/bestOfN.ts`：并发 N 候选至首成，`useBasicRefusal` 确定性回退省 judge 调用）。

**回归/CI/存储**：`PROMPTFOO_PASS_RATE_THRESHOLD`+可配置退出码（朴素 pass-rate 门控——我们按 CI 下限更强，不采用）；`--filter-failing`（按旧 run 只重跑失败/仅断言/错误三类，测试↔结果连接=vars+provider 深等价+`_`前缀运行时变量过滤）；跨 run diff 视图（testIdx 行对齐+`different`-only 过滤器；连接键应换稳定 ID）；`--resume`（持久化配置保序跳过已完成）+`--retry-errors`（成功才删旧错误）；磁盘缓存+单飞（错误响应不缓存——纪律正确）；jsonOnly 评审 provider 独立槽（judge≠生成器，FAR-Lab 已同构）；SQL 聚合 namedScores 重加权（预加权每行部分和→任意子集确定性重聚合——模式采纳）；人工评分覆盖为 componentResults（human 标记+清除后重算）。

**诚实差距**：无 LLM 调用 seed 控制（确定性=缓存回放）；无 judge 投票/多数决（Best-of-N 是攻击策略非共识）；无统计 CI。

## deepeval（Apache-2.0 全仓单许可已验证）

**G-Eval**：CoT 步骤编译器（criteria→3-4 步可审计清单，可预生成冻结）；**logprob 期望分**（`g_eval/utils.py calculate_weighted_summed_score`：top_logprobs 过滤 <1% 概率+非十进制，Σ(score×p)/Σp——单点分→分布期望，±0.5 方差正攻，需 provider logprobs）；rubric 分数带+归一化（非重叠 range 各绑 outcome，(score−min)/span）；能力探测降级（`no_log_prob_support`→schema/JSON 纯文本路径）。

**输出稳健**：trimAndLoadJson（花括号切片+仅一次去尾逗号重试+失败设 error 抛出不静默）；verdict 归一化（"No, it's off-topic"→no；带外值→None 剔除不崩）；schema 优先三级梯（structured→json_object→裸文本+trim+validate）。

**指标内部**：faithfulness 三段（truths 提取可限条数 ∥ claims 提取→逐 claim yes/no/**idk** 三态；idk 可双罚 `penalize_ambiguous_claims`）；hallucination 逐 context verdict+反向阈值（score<=threshold 才成功）；summarization QA 对双答一致性（固定问题列表可外部注入！coverage=P(摘要yes|原文yes)，min(coverage,alignment) 拒偏科）；arena 身份掩蔽+随机假名+**每次渲染 shuffle（未播种——移植必须播种）**。

**系统件**：flaky 指标语义（可报告不得定 pass/fail；每 case 至少一个非 flaky 阈值指标）；内容寻址缓存（input/output/context/hyperparameters 全入键+metric 配置全同才命中）；GEPA 进化 rubric 优化（`optimizer/algorithms/gepa`：holdout 分层+播种 `random.Random(seed)`+反思变异+Pareto 非支配+patience——judge 校准正道，需 live）；n 采样原语（OpenAI n 参数，logprob 不可用时的退路）。

**负例警示**：评分模板示例 JSON 的 score 字段填 score_range[0]（最低分锚定风险，上游未消除——FAR-Lab judge prompt 示例禁用固定低分）；上游 determinism 仅 temp=0 无 seed；OSS 无 kappa/人工一致性工具（全库检索证实，商业平台功能）。

## lm-evaluation-harness（MIT 已验证；metrics.py 的 exact_match_hf_evaluate 头声明移植自 HF evaluate Apache-2.0——移植该函数需带归属）

**任务规范**：TaskConfig 数据类（doc_to_text/target/choice+metric_list+filter_list+generation_kwargs+repeats+metadata）；**本地数据双通道**（`dataset_kwargs` 传 data_files/data_dir 加载本地 json/csv；`custom_dataset` 可调用对象完全脱离 HF——HF 不可达环境的同构解）。

**统计**：`stderr_for_metric` 分派纪律（闭式优先/白名单 bootstrap/不可算显式 N/A 不假装）；`pooled_sample_stderr`（合并方差公式，组级 SE）；`combined_sample_stderr` 上游自我废弃（"don't use unless a statistician…"）；aggregate_subtask_metrics 的 micro(weight_by_size)/macro 显式开关。

**重复与归约**：repeats 克隆请求+`take_first/take_first_k/majority_vote` 命名管线（gsm8k-cot-self-consistency.yaml：repeats:64 一次生成同时报 score-first/maj@64/maj@8——"一次预算多归约"蓝本）。

**确定性/溯源**：四种子（python/numpy/torch/fewshot 独立默认 0,1234,1234,1234 全回写 results config）；种子化 few-shot 采样器（同 split 剔除评估文档防泄漏）；CachingLM（**do_sample=True 强制绕过缓存**否则 repeats 全同——judge 缓存硬规则）；请求构建缓存键含全部影响因子；样本级 doc/prompt/target 三 sha256；函数以 `inspect.getsource` 序列化入结果；任务 metadata.version 纪律（跨版本不静默比较；**观察到的破损**：`--check_integrity` 引用的 tests/test_version_stable.py 在 master 不存在，原因 UNVERIFIED）。

**负发现**：核心无 token-F1（api/metrics.py 的 f1 是 sklearn 类级 macro）；pass@k 核心不在（humaneval utils 是 HF evaluate 薄包装）。
