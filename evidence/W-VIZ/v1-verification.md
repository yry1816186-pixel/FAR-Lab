# W-VIZ V1 — 假设对比画布可视化（2026-08-23）

批次：VIZ V1（.planning/PROPOSAL-viz-interaction.md，用户已批准 V1-V6 全量 + 栈 A）
数据：真实 run `run_jpktce50q7wqc68rkg64ztm3me`（zai 路由，6 scorecards / 15 tournament matches / 6 standings / 0 evidence bodies / achAnalysis=null）
验证环境：web/dist 新构建（echarts 懒加载 chunk `RadarCompare-*.js` 453.75 kB，主 chunk 975.54 kB）+ 3196 既有 serve.mjs 实例；browser-use IAB（Playwright MCP 锁被兄弟会话占用）。

## 落地面

| 面 | 文件 | 内容 |
|---|---|---|
| 评分雷达图 | `web/src/components/detail/viz/RadarCompare.tsx` | echarts/core 按需（radar+tooltip+aria+SVG renderer），对比视图顶部懒加载；公共已评分维度交集（<3 拒绘并给人话原因，绝不伪造 0 值）；role=img + 完整数据 aria + 折叠数据表回退 |
| 维度热图 | `web/src/components/detail/viz/DimensionHeatmap.tsx` | 假设×维度 HTML 表，色深∝分值（中性蓝，定量同一性非成败语义），null 诚实留空；进方法披露区 |
| 对局交叉表 | `web/src/components/detail/viz/TournamentCrosstab.tsx` | 循环赛 chess 式交叉表（无 bracket——round-robin 没有诚实的树形），行视角 W-L-T 聚合，复赛按计数合并 |
| ACH 净贡献矩阵 | `web/src/components/detail/viz/AchNetTable.tsx` | 判别力 top-K 主张×假设，正绿负红·=无绑定（null≠0），发散色锚定 shown cells max|net| |
| logLR 天平进对比 | `CompareView.tsx` | 证据平衡行复用 EvidenceBalance 签名元素（logLR 区间/证据体），不再裸计数 |
| band/QBAF/实验轴 | `EvidenceBalance.tsx` + `HypothesisCard.tsx` | logLrBand（9 档 Jeffreys 闭枚举，web types 从 string 收紧为 union——类型源头修复）+ qbafScore + experimentalAxes 徽章 |
| 共享平衡计算 | `web/src/viz/compare-viz.ts` | buildHypothesisBalances 纯函数统一卡片/对比两处计算（消灭分叉） |
| echarts 入口 | `web/src/viz/echarts.ts` | tree-shaken 单源注册点（后续 V3/V4 图表复用） |

## 验证（命令级）

- 单测：`npx vitest run tests/compare-viz.test.ts` → **11/11 passed**（雷达交集/拒绘、热图排序与 null、ACH null≠0 与真 0 保留、交叉表双序聚合/no_contest、平衡极性分账）
- 全量：`npx vitest run` → **966 passed / 2 skipped**；root `tsc --noEmit` exit 0；web `tsc+vite build` exit 0；`secret-scan.mjs` exit 0（检出项全为既有合成测试向量）
- 真实数据 DOM 回放（IAB）：
  - 对比视图（№1+№4）：雷达容器 svg **23 个 path** 渲染 + aria 携带真实分值（#1: scientific_plausibility 0.90, evidence_grounding 0.80…；6 公共维度）
  - 证据平衡行：aria「证据平衡：1 条支持关系，1 条反例关系」+ 未解决不确定项计数（EvidenceBalance 元素落地）
  - 方法披露区：热图 **85 个数值格**（真实 0.xx 值+色深内联）；交叉表 **36 个记录格**（15 局聚合为 1✓ 等）
  - 视觉复核（analyze_image）：对比表格/维度条像素确认；雷达像素截图未取得（见下）

## 诚实边界

1. **ACH 矩阵 / logLR band / qbafScore / 实验轴徽章：IMPLEMENTED + 单测覆盖，live 无数据可触发**——far.db 全库 0 个 evidence_body/ach_analysis 对象（objects 表 kind 清单核验），旧 top-3 文本 UI 同样从未为任何真实 run 渲染过。下次管线跑 Wave-S 阶段后自然浮现。
2. **像素级截图未取得**：IAB 会话点击在 reload 后静默失效（坐标点击/节点点击/playwright click 三路全灭；cua.scroll/dom_cua.scroll 30s 超时），两张已归档截图视口错位未含雷达/热图。DOM 级渲染证据（svg path 数/数值格/记录格/aria）完整；像素复验列入既有「ENV-LIMITED GUI 交互重验」债（等健康浏览器会话）。
3. 截图归档：`v1-compare-radar.png`（对比表格区）、`v1-methods-heatmap-crosstab.png`（过程视口）——仅作过程记录，非渲染证明。

## 顺带发现（非本批引入）

- `web` npm audit：pdfjs-dist 高危公告（GHSA-hq66-cqwq-w95j，>=5.6.83<6.2.108）为**既有问题**，归 R1 摄入 lane 属主处置。
