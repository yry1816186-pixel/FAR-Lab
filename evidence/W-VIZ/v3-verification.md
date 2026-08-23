# W-VIZ V3 — 实验统计可视化（2026-08-23）

数据：真实 EEL run `run_hzxxc7tgjjq3arkvckdnm6nv4c`（1 stat_report：accuracy point 0.0617、CI95 [0.0185, 0.1049]、exploratory；1 result_set；3 experiment_runs）。
环境：web/dist 新构建（bundle `index-DnNFol_V.js`）+ 3196 serve.mjs + browser-use IAB（reload 后 DOM 断言；截图通道仍坏）。

## 落地面

| 面 | 文件 | 内容 |
|---|---|---|
| CI 森林图 | `web/src/components/detail/viz/ForestPlot.tsx` + `web/src/viz/experiment-viz.ts` | 每份 stat 报告一条横误差条（点=点估计/须=CI），按 metricKey 分组各得诚实标尺；无 CI 报告只画裸点；零参考线只在数据严格跨零时画（填充不得制造跨零）；**不画阈值线**——payload 只有 thresholdProvenance 文本无数值，不发明 |
| 指标相对条 | ExperimentsTab cells + `metricShares` | 条长=同指标在被比较单元格的最大值占比（比较语义，绝不跨指标归一）；单单元格无比较语义→不画 |
| 判定汇总条 | ExperimentsTab `VerdictTallyStrip` + `tallyVerdicts` | 支持/证伪/无判定计数 + POPPER 纪律分层（探索性/次要单列不冒充判定） |
| 顺手修正 | — | ExperimentsTab 从 `index` 键改 fingerprint/序号复合键（React key 纪律） |

## 验证（命令级）

- 单测：`npx vitest run tests/experiment-viz.test.ts` → **9/9**（分组/标尺填充钳零/跨零严格判定/NaN 报告丢弃/裸点行/退化域/相对份额/单格拒画/判定计数；其中一条测试逼出真语义修复：填充不得发明数据没有的零交叉）
- 全量：**1002 passed / 2 skipped**；root tsc 0；web tsc+build 0；secret-scan exit 0
- 真实数据 DOM 回放：`.forest-plot svg` ✓、1 组（accuracy）+1 CI 线+1 点、aria=「cmp_n96mgtsa: 0.062 [0.019, 0.105]」**与 DB payload 逐位吻合**；判定汇总=「支持 0 证伪 0 无判定 1 探索性 1」；指标相对条 3 条

## 诚实边界

- 当前库仅 1 份 stat_report（探索性、无判定）——森林图多行对齐与判定网格的全部价值要等 EEL 更多真实实验产出；已按 schema 正确实现并在真实数据上验证单行路径。
- 像素截图通道仍失效（同 V1/V2 环境限制债）。
