# W-VIZ V6 — 横切交互（2026-08-23）

数据：vitamin run（151 事件 / 50 模型回执 / 38 检索 / 1 工具）。
环境：web/dist `index-Bfm0irmP.js` + 3196 + IAB DOM 断言。

## 落地面

| 面 | 文件 | 内容 |
|---|---|---|
| 事件类别过滤 | `EventsTab.tsx` + `cross-viz.ts` | 类别 chips（全部/阶段与状态/模型调用/检索/工具/子代理/其他）实时计数；类别由实际持有的事件 type 派生（lifecycle 前缀优先），空类不出现 |
| 回执聚合行 | `ProvenanceTab.tsx` + `aggregateReceipts` | 模型调用数/tokens（k·M 格式）/延迟最高与合计（复用 formatDuration）/检索数/工具数——单行汇总先前要逐条展开才能知道的事 |
| 修订质量走向 | `RevisionsTab.tsx` + `qualitySequence` | 链序 categorical 步进（改善→中性→…），≥2 步才渲染；缺失 qualityDelta 不是一步；不做数值趋势线（数据没有那个尺度） |

## 验证（命令级）

- 单测：`tests/cross-viz.test.ts` → **7/7**（分桶计数与顺序/前缀优先/聚合含 usage 缺失/k·M 阈值/质量序列缺省丢弃）
- 全量：**1039 passed / 2 skipped**；root+web tsc 0；build 0；secret-scan 0
- 真实回放：事件过滤「全部 151 / 阶段与状态 27 / 其他 124」真实计数；回执聚合「模型调用 50 延迟 最高21s/合计4.3 分钟 检索 38 工具 1」（tokens 行缺席=该 run 回执无 usage.totalTokens，诚实省略）

## 缓延（理由在档）

- **模型菜单定价/active/fallback**：ResearchComposer 是兄弟会话在途文件（同树未提交），双写风险——待其落地后增量补。
- **库状态/领域分布视图**：57 runs 小数据集，机械控件违反 PRODUCT_HCI §4；库有搜索/过滤已足。
- **QualityTrend live 路径**：全库两条修订分属不同 run（无 ≥2 步的链），渲染空态为正确行为；单测覆盖序列构建。
