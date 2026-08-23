# W-VIZ V4 — 阶段甘特图（2026-08-23）

数据：真实 run `run_jpktce50q7wqc68rkg64ztm3me`（12 个有起止时间的阶段）。
环境：web/dist 新构建（bundle `index-eUkp-fPH.js`）+ 3196 + browser-use IAB DOM 断言。

## 落地面

| 面 | 文件 | 内容 |
|---|---|---|
| 阶段甘特 | `web/src/components/detail/viz/StageGantt.tsx` + `web/src/viz/stage-viz.ts` | 条=真实 [startedAt, endedAt] 区间（间隔=等待如实保留）；进行中阶段止于注入的 now（30s tick，虚线描边=已耗时非完成度）；条内深色嵌条=子任务进度；×N=重试；状态色（done 绿/failed 红/running 蓝/其他灰）；时长文本人话单位（42s/3.4 分钟/2.1 小时） |
| 集成 | StageTimeline | 甘特领航 + 原表保留精确记录 |

## 验证（命令级）

- 单测：`tests/stage-viz.test.ts` → **6/6**（真实时长/归一几何/起点排序/运行中止于注入 now 且不冒充完成/done 无 endedAt 不算 live/未启动不产条/空输入/时长格式）
- 全量：**1008 passed / 2 skipped**；root+web tsc 0；build 0
- 真实数据 DOM 回放：`.stage-gantt svg` ✓、**12 条**、aria=「范围界定 1s；文献检索 1.3 分钟；来源核验 17s；证据构建 6s；假设生成 41s；批判与证伪 38s；排序评分 24s；研究计划 16s；…」——时间去向首次成图

## 诚实边界

- 像素截图通道同前失效；DOM+aria 证据完整。
