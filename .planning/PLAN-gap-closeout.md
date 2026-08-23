# PLAN — GAP-CLOSEOUT（用户实测反馈五缺口全量闭环）

> 触发：2026-08-23 用户真实使用反馈（run_jpktce50q7wqc68rkg64ztm3me）。
> 实测审计：12 源（83% Crossref，OpenAlex 429 退化）· claims 抽取 3/12 · 反证 1/15 relations · 假设 10 组零同质（强）· 计划内核深（强）· feedback/revise skip（feedback.ts:27 无信号即 skip）· export 未落盘。
> 硬约束：禁真实 API 实测（验证离线/确定性，必须 live 标 BLOCKED-live）；Node 端 zod-only；同树兄弟会话禁 git add -A；UI 状态映射真实状态。

## 用户已批准的决策（2026-08-23）

1. 翻译层 = **混合**：假设/计划关键结论生成时双语（离线确定）；证据/文献详情按需翻译+缓存。
2. 优先级 = **全量最强方案，不偷懒**（按 P0→P1→P2 依赖序执行，不做单选）。
3. 实验类型扩展 = **先调研出方案再实施**（W-F 产出设计文档 → 用户门）。

## 关键问题集（排序）

- **P0-G1 证据层薄**：检索限流退化单源；抽取覆盖率 25%；反证缺额 → 毒化下游一切
- **P0-G2 闭环断裂**：plan 后 execute/feedback/revise 不默认接续；skip 无引导；export 无落盘引导 → "已完成"实为半程
- **P1-G3 假设可视化**：HX-4 未收尾（画布+平衡可视化，栈已批准 @xyflow/react + echarts 6）
- **P1-G4 内容双语**：混合方案待实施
- **P1-G5 实验类型只支持 ML**：医学文献型（维生素 D 类）无法闭环 → W-F 调研先行
- **P2-G6 agent 证据缺口狩猎**：BP1 质量门再生未接证据缺口感知

## 工作图

| 工作流 | 所有权/文件面 | 依赖 | 验证门 |
|---|---|---|---|
| W-A 证据层 | src/sources/*、pipeline/stages/retrieve.ts+evidence.ts（无兄弟冲突） | 无 | 离线确定性 vitest（fixture 源/限流模拟）+ 既有 run 回放 |
| W-E 闭环默认化 | pipeline 编排+feedback/revise/execute；**接管 EEL 所有权（原会话 dormant，已登记）** | W-A 弱依赖 | 离线确定性全链测试（execute 离线路径已具备） |
| W-F 实验类型调研 | research/eel/statistical-experiment-type-scout.md（新文件，独立） | 无（后台并行） | 设计文档 → 用户批准门 |
| W-B 可视化画布 | web/（**阻塞：兄弟会话 17 文件在途，需协调**） | W-A 数据变厚后更有意义 | 真实 run 浏览器走查 + axe |
| W-C 双语层 | domain schema+pipeline 生成钩子（Node 端先行）→ server/api+web（后半阻塞同上） | 无强依赖 | schema 单测 + 离线生成测试 |
| W-D 缺口狩猎 | src/agent/loop.ts 接证据缺口感知 | W-A 落地后 | agent 回放测试 |

关键路径：W-A → W-E → (W-B+W-C web 段)；W-F 独立后台；W-D 收尾。

## 批次切片（每片: 实现→集成→真实路径→测试→commit，显式文件清单）

1. A1 检索多源并发+429 退避/故障转移（源级 Promise 并行、限流指数退避、逐源诚实降级记录）
2. A2 抽取覆盖率门禁（fulltext 可得源中 claims 抽取率 < 阈值 → 触发补充/再生，不达标诚实标注 DEGRADED）
3. A3 反证配额（强制反证搜索产出 N 候选或显式记录未达标原因，禁止静默 1/15）
4. E1 闭环默认接续（plan 完成且存在适用实验路径 → execute 自动跑；实验结果自动产 FeedbackSignal → feedback→revise 自动链）
5. E2 诚实 skip/引导面（skip 理由结构化进 API；"已完成"改为真实阶段完成度；export 显式引导）
6. B/C web 段（兄弟协调后）
7. D 缺口狩猎

## 反劣质门

证据薄→可视化只是好看；闭环不诚实→比没有更糟；翻译不落盘缓存→每次重译是浪费。每片问：这改变科研人员的哪个真实决策？
