# PROGRESS — Technology Intelligence & Source Fusion Expedition (/goal)

## 当前状态
[STATE: P0-ADJUDICATED] Coverage Tree v1 + Registry 建立;P0 三 RU
(RU-1/2/3)深研完成并裁决(SOURCE_VERIFIED);首批融合批次=COGSEC T0/T1。

## 已完成(2026-08-24)
- 源码能力盘点(Explore agent,source-verified):src/agent 16 文件 kernel 真实
  (loop 499L/permissions/compaction/mcp/subagents/skills/rollout/hooks)、
  12-stage pipeline 全景、EEL、providers、server API 1996L、persistence。
- COVERAGE-TREE.md v1(research/tech-intel/):6 大陆 → ~175 叶子;
  STRONG ~85 / PARTIAL ~28 / DESIGN ~11 / MISSING ~46 / REJ-TRIG ~8。
- 11 视角独立 blind-spot hunt(reports 存档 blindspot/BLINDSPOT-REPORTS-v0.md):
  最大意外 = 认知层安全全空白(2 独立 hunter 确认,OWASP Agentic 2026)、
  MinHash-LSH 零依赖去重解锁、fastembed sidecar 路线解锁 embedding 簇、
  Kuzu 已死避开、AER/Execution-Lineage/AutoSci/DataPRM 等 2026 前沿 lead。
- P0 深研(全部 SEARCH_SATURATED + 源码级验证,packets RU{1,2,3}-*.md):
  - RU-1 MEMORY:BUILD far.db governed projection;EXTRACT TencentDB-Agent-Memory
    (L0-L3/hybrid/audit/reindex/node:sqlite+sqlite-vec 生产先例)、ADAPT AutoSci
    SciMem(schema 治理/lifecycle/failure_reason)、ACT-R 衰减;fastembed
    证据门控;Mem0/Letta/Cognee/Graphiti REJECT
  - RU-2 LINEAGE:BUILD 邻接+CTE(migration v5: lineage_edges+event_tags);
    ADOPT Execution-Lineage replay 语义;EXTRACT AER 字段形/LangGraph 游标;
    LangGraph fork 泄漏反例=硬不变量;PROV-O 双导出
  - RU-3 COGSEC:ADOPT spotlighting(>50%→<2% ASR)+AgentDojo/promptfoo;
    EXTRACT FIDES taint 格+CaMeL policy 协议(离线 106/106);T0-T8 成本梯队
  - 跨 RU 裁决:taint/trust 统一词汇,单一 owner=src/domain zod 层

## 关键裁决(本阶段)
1. 研究 corpus 已有(candidate-driven)但缺 technology-space 视图 — 本任务
   补的是后者;TECH_CANDIDATES waves 保持为证据层。
2. 记忆衬底 = far.db 内 governed projection(无第二权威 DB);LLM 可起草
   摘要但接受/拒绝由确定性 lint+溯源可解析性门拥有。
3. HCI 类 RU-11 实施受用户规则门控:先研究出方案、批准后实施。
4. 环境约束不变:禁 live-LLM 实测(验证一律离线/确定性;live 标 BLOCKED-live)、
  禁 DeepSeek、兄弟会话同树(只用显式文件列表提交)。

## 环境事实
- zai 路由 rate-limited 至 2026-08-29(前次远征已穷尽 live 路由,勿再逐轮探测)
- 外部研究用 WebSearch/zread;候选执行验证 = clone+install+test 离线
- CaMeL 离线评估克隆在 Temp\camel-eval(PYTHONPATH=src + pydantic-ai)

## 下一步(按序)
1. 首批融合:COGSEC T0(localhost 加固,server 区——先查兄弟会话 lane 冲突)
   + T1(spotlighting,pipeline/sources prompt 组装);确定性注入语料门
2. 第二批:RU-2 lineage(migration v5 = schema 变更,先按变更确认线告知用户)
   + RU-1 memory schema(同上)
3. P1 研究波次:RU-5 QUANT / RU-6 SCISOFT / RU-7 STORAGE / RU-8 CAMPAIGN /
   RU-9 CTXENG / RU-10 CORPUS / RU-14 EVAL-EXEC
4. 每 RU 完成 = checkpoint;Completion gate 见 goal §22(11 条)

