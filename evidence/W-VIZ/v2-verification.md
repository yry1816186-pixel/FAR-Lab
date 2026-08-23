# W-VIZ V2 — 研究计划结构化交互（2026-08-23）

数据：真实 plan `pln_mqz6tnstcghfk2gkrr84jx8pbb`（3 步线性链 task_0tv→task_sq5→task_7rs；成本 $15,000/$40,000/$5,000 带括号注记）。
验证环境：web/dist 新构建（bundle `index-S3ENnT3G.js`）+ 3196 serve.mjs + browser-use IAB（reload 后 DOM 断言；截图通道已失效——"activity capture failed for guest"，像素证据缺席如实记录，与 V1 同一环境限制债）。

## 落地面

| 面 | 文件 | 内容 |
|---|---|---|
| 步骤 DAG | `web/src/components/detail/viz/PlanDag.tsx` + `web/src/viz/plan-viz.ts` | 自研 SVG（栈决策 A：领域特异结构不引库）；最长路径分层确定性布局；悬停/键盘聚焦隔离传递上下游链（非邻居 0.25 透明）；点击平滑滚动定位步骤卡；无效依赖=红虚线短边+节点角标（接既有 fabrication 防线）；role=button+tabIndex+Enter 键盘可达；aria 全量步骤摘要 |
| 预算汇总条 | `viz/PlanBudget.tsx` + `parseBudget` | 仅解析前导 $ 金额（$15,000 (Reagents…) ✓）；非美元文本（TBD/2 GPU-hours）诚实原文列出绝不猜单位；分段∝金额；合计只在全解析时给出 |
| 决策出口图 | PlanTab `decision-exits` 块 | 数据模型是**平行判据**非嵌套树——形状如实：单干（执行→评估）开三色出口（支持/弱化/证伪）+停止判据门；每卡带 InlineIdRefs 人话标签；原 FieldList 保留为文本形式 |
| 步骤锚点 | PlanTab `id="step-{id}"` | DAG 点击定位目标 |

## 验证（命令级）

- 单测：`npx vitest run tests/plan-viz.test.ts` → **8/8 passed**（分层/tiebreak/肘形边几何/无效引用短边/画布尺寸/传递闭包/预算解析与诚实未解析/决策出口形状）
- 全量：989 passed / 2 skipped；root tsc 0；web tsc+build 0（新 bundle S3ENnT3G）
- 真实数据 DOM 回放（reload 后）：`.plan-dag svg` ✓、**3 节点/2 边**（与真实线性链一致）、预算条 **3 分段** + 「已解析成本合计 $60,000（3 个步骤）」（15k+40k+5k 复核吻合）、**3 张决策出口卡**

## 诚实边界

- 像素截图失败（IAB guest 降级）；DOM 断言完整。
- 决策"树"降级为"平行出口图"：四判据在数据模型中是平行标准，画成嵌套树是错误表达——设计决定，非遗漏。
