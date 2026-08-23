# W-VIZ V5 — 证据图升级（2026-08-23）

数据：`run_jpktce50q7wqc68rkg64ztm3me`（≤40/列路径 + 4 条 claim_claim 边）与 `run_tcvvqcwstf32t7mkzpe64b3cp6`（44 claims → 截断路径）。
环境：web/dist `index-ZKDpUTe3.js` + 3196 + IAB DOM 断言。

## 落地面（全部在 `web/src/components/detail/EvidenceGraph.tsx`）

| 面 | 内容 |
|---|---|
| 诚实截断 | 静默 slice(0,40) → 工具栏警示「为可读性每列先显示 40 个节点（N 个未显示）」+「显示全部」按钮（showAll 提升上限）；计数行继续显示真实总数 |
| 节点拖拽 | 节点 mousedown 走 beginNodeDrag（stopPropagation 与背景平移分流）；拖拽增量按 view.k 反变换保持指针 1:1；偏移表随「重置视图」清空；grab/grabbing 光标 |
| 边强度 | claim_claim 边携带 relation.strength（strong 2.2/moderate 1.6/weak 1.0/unrated 1.2 线宽）+ 本地化 title |
| source 点击 | 来源节点点击平滑滚动定位证据页来源表行（`src-{id}` 锚点已存在）——来源不再无着陆面 |

## 验证（命令级）

- 全量：**1008 passed / 2 skipped**（V5 为交互布线，纯逻辑增量薄，无新单测——组件行为由真实数据回放覆盖）；root+web tsc 0；build 0；secret-scan 0
- 真实回放：
  - vitamin run：`.graph-node--draggable` **30 节点**；4 条 claim_claim 虚线边 stroke-width **1.2**（真实 relations strength=unrated 的映射值，旧代码恒 1.4）
  - 44-claims run：截断警示文本 + 「显示全部」按钮真实渲染（64 可见节点/4 隐藏）

## 诚实边界

- 拖拽/滚动的指针级手感同像素截图一起列入 ENV-LIMITED GUI 重验债（IAB 点击通道已死）；DOM 结构与状态机已验。
