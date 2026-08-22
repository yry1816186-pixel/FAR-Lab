# Wave-6 最高执行指令 · 检索与 RAG 基础设施源码远征

> 使用方式：整份作为 /goal 交给新窗口。共同基线见 `research/WAVE-PROMPTS/_COMMON-BASELINE.md`（粘贴时一并带上）。

## 〇、接续点

**开启 Wave-6：高并发子 Agent 深读"检索/RAG/查询规划"基础设施源码——FAR-Lab 的证据质量上游。当前三源检索（OpenAlex 日预算+arXiv+Crossref）+ RRF 融合 + LLM listwise rerank 是自建轻量版；本 Wave 找更强的开源查询规划、多跳检索、引用级 grounding、检索评估机制，源码级融合。先读注册表防重复（RankGPT 模式已 EXTRACT D-015；HyDE 已拒；本地 ONNX rerank 触发未满足；S2AG 证据门缓延）。**

## 一、对象清单（起点；核实存在与许可，主动扩充）

| 系统 | 线索 | 重点 |
|---|---|---|
| Future-House/paper-qa | 与 Wave-5 重叠——本 Wave 视角取其**检索面** | 段落级 chunking、检索预算、引用绑定算法 |
| assafelovic/gpt-researcher | 核实 | 多 agent 深研规划：子问题分解、来源多样性、人机报告 |
| langchain-ai/open-deep-research（及同类 open deep research 实现） | 核实 | 深研循环：搜索-阅读-补搜的停止条件与压缩 |
| dzhng/deep-research 及 npm 生态同类 | 核实 | TS 原生实现参考（近 FAR-Lab 技术栈） |
| sunnweiwei/RankGPT | 已 EXTRACT 模式，深挖源码 | permutation 构造、滑动窗口、token 预算细节 |
| 查询分解/改写系统（如 query2doc、step-back、多查询生成的开源实现） | 核实 | 确定性查询计划改进（注册表 B"query decomposition"缓延项的重访证据门） |
| 检索评估（BEIR 复现、miniCOIL/QDrant 评估器等轻量件） | 核实 | FAR-Lab 检索质量的可回归度量 |
| 同类主动扩充 | Tavily/Exa 等 API 的开源客户端模式、学术 RAG（ScholarQA 类）、任何调研中发现 | 同维度解剖 |

## 二、本 Wave 特有警戒
- **API 依赖边界**：多数深研系统绑商业搜索 API（Tavily/Exa/fireworks）——融合其**编排与评估机制**，检索后端保持 FAR-Lab 自有三源+keyless 原则；新 API 需 key 的只做适配器位（同 OpenAlex key 模式），不得硬依赖。
- rerank/embedding 本地化仍受 zod-only+零依赖门控；ONNX 路线触发条件未变（pool>60）。
- 检索改动直接动证据主路径：每个融合项必须带 before/after 检索质量基准（用 Wave-6 自建的评估器或确定性指标：verify 率、反证席命中率、claim binding 率）。

## 三、维度侧重（维度体系 v2 编号）
重点组：**C6/C9（搜索工具与检索纪律）**、**B3/B7（检索结果压缩与污染防护）**、**G6（检索回归防护）**、**I4（结构化查询输出）**；每仓普查+高价值深钻。

## 四、开场序列
| 步 | 动作 | DoD |
|---|---|---|
| 1 | 基线恢复序；status→IN_PROGRESS，phase=wave6-retrieval-rag | 控制面一致 |
| 2 | 并发分发调研（每仓+横切：查询规划/grounding/评估 三线） | 机制清单带 file:line |
| 3 | shortlist → `research/WAVE6-SCOUT.md`（含"先建检索质量基线再融合"的测量计划） | 排序+触发测量 |
| 4 | 融合计划 + DECISIONS | 理由落盘 |
| 5 | 执行融合：**先基线后改动**，benchmark before/after + 对抗审计 | 证据落 evidence/W6/ |
| 6 | 收口（基线 DoD 全项） | 三处一致，提交成功 |
