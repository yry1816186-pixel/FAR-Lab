# 21_COMPETITION_AND_JUDGE_VIEW.md — 比赛适配与评委视角审计

> **来源**：调研优化版 `02_COMPETITION_ALIGNMENT_AND_JUDGE_VIEW`，并入本主规划作为「比赛适配 / 评委视角 / 答辩口径」层。本文件是 FAR_LAB_MASTER_PLAN 工程骨架所缺的竞赛叙事；与 `27_DEFENSE_SCRIPT_AND_QA.md`、`26_COMPETITION_PDF_STRUCTURE.md`、`28_DEMO_VIDEO_SCRIPT.md` 配合使用。

## 1. 赛题适配结论

FAR-Chain 适配 XH-202619 的方式不是把自己伪装成“又一个全自动 AI Scientist”，而是作为 AI Scientist 的**可信验证与证据链运行时**：国产开源大模型可以生成假设、研究计划、代码与解释，但最终科学 claim 必须进入 FEC、证据绑定、统计/因果/反证检查、deterministic verdict 与 proof package。这样既满足“AI Scientist 研发与应用”，又凸显“可验证科学研究假设自动生成”的可信落地。

## 2. 最适合赛道/方向

| 赛道/方向 | 适配度 | 理由 | 最小交付 |
|---|---:|---|---|
| 科研问题方向：可验证假设生成/研究计划 | 高 | FEC 把假设转成可测契约；verdict 给出可验证结论边界 | Qwen 生成候选假设 + FAR 编译/审核/降级 |
| 科研问题方向：闭环实验任务规划 | 高 | ExperimentPlan/RunRecord/ResultRecord 可形成闭环 | TESS light curve 检测与反证计划 |
| 数据场景方向：科学数据可追溯/复用 | 高 | `.far-proof` + RO-Crate/PROV 映射直接命中 | proof package + audit report |
| 科普/内容方向 | 低 | 项目核心不是科普生成 | 只作可视化解释，不做主赛道 |

## 3. 是否必须使用阿里云 AI 大模型及产品能力

是。官方赛题强调使用阿里云 AI 大模型及产品能力。推荐方案：

```text
Model-neutral FAR Core
  + Provider Gateway
      + competition_aliyun_qwen profile
          + DashScope / Model Studio OpenAI-compatible API
          + Qwen model family
          + API trace capture
          + cached/offline fixture strictly separated
```

Core 保持模型中立，比赛演示 profile 使用 Qwen/百炼/DashScope。这样既满足比赛，又避免把核心可靠性系统绑死在单一 provider。

## 4. 是否有具体学科问题

推荐主 Demo：**TESS 光变曲线候选事件的可证伪证据链**。科研问题不是“发现新行星”，而是更可控的：

> 给定公开 TESS 光变曲线与文献先验，某候选周期性/flare-like 事件是否被当前数据与预注册检测协议支持，是否存在混杂/伪阳性，能否导出第三方可验证 proof package？

这比“生成一个论文题目”更贴近真实数据、可运行、可审计，也能避免过度科学宣称。

## 5. 是否有科研闭环

闭环为：

1. Qwen 生成候选假设/研究计划。
2. FAR 编译 FEC，冻结数据、指标、阈值、反证条件。
3. Dataset Resolver 拉取或加载 TESS fixture。
4. Harness 运行可复现实验或导入已运行结果。
5. Statistical Judge / Causal Assumption Checker / Integrity Firewall 产出结构化检查。
6. Deterministic Verdict 产出五值结论。
7. ProofEnvelope 导出 `.far-proof`。
8. 评委本地 verifier 重算 proofHash/verdict/diff。

## 6. 评委最可能质疑什么与答辩回应

| 质疑 | 是否成立 | 回应 |
|---|---|---|
| 这是不是普通 RAG/多 Agent？ | 不成立 | RAG/多 Agent 产生材料；FAR 的主语是 claim-level FEC、deterministic verdict、proof package 和可反证链。 |
| 你们是否真的做科学发现？ | 部分成立 | MVP 不宣称发现新科学，而是证明 AI 生成科研 claim 能被可审计验证与降级；真实发现是路线图。 |
| 为什么 `CONFIRMED` 不代表真？ | 应主动解释 | 它只表示在冻结 FEC 和当前 evidence 下 bounded support；这比“AI 说对了”更诚实。 |
| 使用了国产开源大模型吗？ | 需要真实验证 | Competition profile 接入 Qwen/DashScope，真实 API smoke test 标 `NEEDS_API_VALIDATION`。 |
| Demo 是否只是剧本？ | 风险高 | 用 offline fixture + raw hash + verifier tamper failure + diff report 证明不是纯剧本；真实 MAST 拉取标 `NEEDS_REAL_ENV`。 |
| 为什么不用 LLM-as-judge？ | 不用作最终裁判 | LLM 可辅助审稿/摘要，但 verdict 由 deterministic kernel 和统计/因果规则决定。 |
| 和 Co-Scientist/Robin/AI Scientist-v2 比有什么不同？ | 核心问题不同 | 它们擅长生成/探索/执行；FAR 专注验证、反证、复现、审计、导出。 |
| 是否开源有价值？ | 成立 | `.far-proof` schema、validator、anti-theater fixtures、benchmarks 都可独立复用。 |

## 7. 项目一句话定位

**FAR-Chain 不是替 AI 生成更多科研结论，而是让 AI 生成的每个科研结论都携带可审计、可复现、可证伪、可降级的证据包。**

## 8. 60 秒答辩开场

今天的 AI Scientist 已经能提出很多假设、写代码、跑实验，甚至生成论文。但真正危险的问题不是“AI 想得够不够多”，而是：它说出的科学结论，第三方能不能知道证据从哪来、数据有没有变、阈值有没有事后调整、失败实验有没有被隐藏、统计检验是否正确、结论是否应该降级。我们的项目真研 FAR-Lab / FAR-Chain，就是面向国产大模型 AI Scientist 的可证伪证据链运行时。Qwen 可以生成假设和计划，FAR 把它编译成 FEC 证据契约，绑定 TESS 等真实科学数据、代码、运行、统计检验和反证条件，最后输出五值 deterministic verdict 与 `.far-proof` 包。评委不需要相信我们的 PPT，也不需要相信大模型；只要在自己的机器上验证 proof package，改一个关键字段就会看到 proofHash 和 verdict trace 失败。这就是我们和普通 AI Scientist demo 的区别。

## 9. 与普通 AI Scientist demo 的区别

| 普通 demo | FAR-Chain |
|---|---|
| 生成假设/论文/图表 | 绑定 claim、证据、数据、代码、运行与 verdict |
| LLM 自评结论 | deterministic five-value verdict |
| 成功样例导向 | 失败/反证/撤回一等记录 |
| 很难复查 | `.far-proof` 可导出、可验证、可 diff |
| 强调“AI 很聪明” | 强调“AI 科研过程可被第三方推翻” |

## 10. 来源

- **阿里云天池/挑战杯揭榜挂帅 XH-202619 官方赛题页**：赛题、赛道、时间、必须使用阿里云 AI 大模型及产品、TESS/科学数据方向约束。<https://university.aliyun.com/action/tzbjbgs2026>
- **国家天文科学数据中心 XH-202619 赛题说明**：赛题合作方、AI4S 场景、TESS/天文知识图谱等数据场景。<https://nadc.china-vo.org/article/20250606145916>
- **Alibaba Cloud Model Studio: OpenAI compatibility of DashScope**：Qwen/DashScope OpenAI-compatible provider profile。<https://www.alibabacloud.com/help/en/model-studio/compatibility-of-openai-with-dashscope>
- **Alibaba Cloud Model Studio: First API call to Qwen**：API key、WorkspaceId、环境变量安全与调用约束。<https://www.alibabacloud.com/help/en/model-studio/first-api-call-to-qwen>
- **Google Research / Nature: AI co-scientist**：多智能体科学假设生成与评审机制。<https://research.google/blog/accelerating-scientific-breakthroughs-with-an-ai-co-scientist/>
- **Sakana AI Scientist-v2**：端到端 AI 论文/实验代理的能力与风险对比。<https://github.com/SakanaAI/AI-Scientist-v2>
- **FutureHouse Robin multi-agent scientific discovery**：假设—实验—数据分析闭环对比。<https://www.futurehouse.org/research/demonstrating-end-to-end-scientific-discovery-with-robin-a-multi-agent-system>
