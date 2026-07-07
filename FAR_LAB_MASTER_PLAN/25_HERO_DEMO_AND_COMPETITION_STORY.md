# 25_HERO_DEMO_AND_COMPETITION_STORY.md — Hero Demo 与比赛故事

> **来源**：调研优化版 `11_HERO_DEMO_AND_COMPETITION_STORY`，并入本主规划作为「主 Demo 设计 / 比赛故事 / 现场冲击点」层。Demo 的工程实现细节以 `05_AI4S_PRODUCT_DEMO_AND_BENCHMARK.md` + `10_DEV_ENTRYPOINT.md` P0-5 为权威；本文件给出 demo 叙事与现场编排。

## 1. Demo 总策略

主 Demo 必须让评委在短时间内看到：AI 生成的科研 claim 被系统“管住了”。成功不是一路绿灯，而是证据不足时降级、反证出现时修订、篡改时验证失败。

## 2. Demo A：TESS 光变曲线可证伪证据链（推荐主 Demo）

- **科研问题**：给定 TESS 公开光变曲线，某候选周期性下降或 flare-like 事件是否被当前数据与冻结协议支持？
- **输入材料**：Qwen 生成的候选假设；TESS/MAST light curve 或 offline fixture；Lightkurve 分析脚本；ADS 文献锚点。
- **Agent 做什么**：生成候选 claim、编译 FEC、选择数据、规划实验、运行/导入分析、生成反证任务、导出 proof。
- **证据链**：ClaimNode -> DatasetSnapshot -> CodeArtifact -> RunRecord -> ResultRecord -> StatisticalTestPlan -> VerdictNode。
- **反证设计**：odd/even transit check、background contamination、randomized period negative control、bootstrap/phase shuffle、data quality flag。
- **可独立复算实验**：offline fixture 必须能本地重放；live MAST path 标 `NEEDS_REAL_ENV`。
- **verdict**：根据证据可能是 `INCONCLUSIVE` 或 `DEGRADED_SCOPE`，不要强行 `CONFIRMED`。
- **导出**：`.far-proof` + audit.html + verifier command。
- **UI 关键画面**：claim graph、FEC freeze、raw data hash、verdict reason codes、tamper diff。
- **评委关键瞬间**：现场改一个 threshold 或 raw data hash，verifier 报 diff，verdict 不再通过。
- **最小版本**：预缓存公开 fixture + 本地统计脚本 + proof verify。
- **增强版本**：真实 MAST/Lightkurve download + ADS citation verify + Qwen real API。
- **失败降级**：MAST 不通则 offline fixture；Qwen 不通则 fixture provider；统计不显著则诚实 `INCONCLUSIVE`。
- **需要真实环境**：`NEEDS_REAL_ENV`、`NEEDS_API_VALIDATION`。

## 3. Demo B：AI Scientist 错误结论被发现、降级、修订

输入一个含 p-hacking/post-hoc threshold 的 mini case。LLM 尝试生成支持性报告，FAR 捕获阈值事后修改、missing raw 或 seed cherry-picking，最终 `INCONCLUSIVE` 或 `UNTESTED`。关键瞬间是：LLM 自评“通过”被 firewall 拒绝，最终 verdict 没有被模型覆盖。

## 4. Demo C：`.far-proof` 导出与评委本地验证

给定 Demo A/B 的 `.far-proof` 包，评委运行 verifier。手动篡改 `result_records.jsonl` 的 metric 或 `claim_graph.json` 的 scope 后，验证失败并输出 diff，不产生伪绿。关键口号：**Your Laptop Is The Verifier**。

## 5. 最终推荐主 Demo

```text
Qwen 提出 TESS 候选假设
  -> FAR 编译 FEC
  -> 绑定公开数据/fixture
  -> 运行/导入 light curve analysis
  -> 发现证据边界或反证
  -> 输出五值 verdict
  -> 导出 .far-proof
  -> 评委本地验证/篡改失败
```

Demo B 作为答辩追问或视频插曲，展示 anti-theater。

## 6. 现场演示脚本

打开 Cockpit -> 显示 Qwen candidate -> Compile FEC -> Bind TESS Data -> Run/Import Analysis -> Judge -> Export `.far-proof` -> terminal verify -> 篡改字段 -> verify diff -> 总结“AI 科研从说服你变成允许你验证和推翻”。

## 7. 来源

- **阿里云天池/挑战杯揭榜挂帅 XH-202619 官方赛题页**：<https://university.aliyun.com/action/tzbjbgs2026>
- **国家天文科学数据中心 XH-202619 赛题说明**：<https://nadc.china-vo.org/article/20250606145916>
- **MAST TESS mission archive**：<https://archive.stsci.edu/missions-and-data/tess>
- **Lightkurve**：<https://lightkurve.github.io/lightkurve/>
- **NASA ADS API docs**：<https://ui.adsabs.harvard.edu/help/api/>
- **Alibaba Cloud Model Studio OpenAI compatibility**：<https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope>
