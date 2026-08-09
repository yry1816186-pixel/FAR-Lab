# 09 · 前端可视化：15 个页面与数据流

> 学习目标：理解前端在整个系统里的角色（可视化验证层，不是裁决层）；
> 掌握 16 条路由（15 页面 + 404）；理解页面如何消费 REST API；
> 理解"完整性徽章"和 Merkle 证明在 UI 里怎么呈现。
> 前置：08。产出：本地起全栈，走通 Overview → Court 用户旅程。
> 技术栈：React 18 + Vite 5 + Tailwind 3 + shadcn/ui + D3 + React Flow + TanStack Query。

---

## 9.1 前端在系统里的位置（重要）

前端**永远不裁决**。它做三件事：

1. **可视化**：把 verdict / 证据链 / Merkle 根画出来（D3 + React Flow）。
2. **演示**：Hero demo（60 秒篡改检测）、法庭/竞技场对抗演示。
3. **消费 API**：通过 Vite 代理调 `far api` 的 22 个端点。

裁决永远在服务端的确定性内核里完成——前端只是"读取和展示"。
这个边界保证了：**UI 美化不影响任何 verdict 的正确性**。

## 9.2 14 条路由（实测 App.tsx）

| 路由 | 页面 | 作用 |
|---|---|---|
| `/` 与 `/overview` | OverviewPage | 系统总览 + 后端健康状态（默认落地页） |
| `/viz` | VizPage | D3 可视化（证据链/关系图） |
| `/integrity` | IntegrityPage | Merkle 根 + 完整性证明 |
| `/leaderboard` | LeaderboardPage | benchmark 排行榜 |
| `/court` | CourtPage | 法庭式质询演示 |
| `/arena` | ArenaPage | 多引擎对打演示 |
| `/honesty` | HonestyWallPage | 诚实墙（系统不能做什么） |
| `/ablation` | AblationPage | 消融实验 |
| `/report` | ReportPage | 运行报告 |
| `/about` | AboutPage | 关于 |
| `/versions` | VersionDiffPage | 版本差异 |
| `/wizard` | WizardPage | 引导式 claim 提交 |
| `/v2-receipt` | V2ReceiptPage | V2 收据验证（六维保证） |
| `*` | NotFoundPage | 404 |

## 9.3 关键组件与库

| 组件/库 | 作用 |
|---|---|
| `AppShell.tsx` | 全局导航外壳 |
| `VerdictBadge.tsx` | verdict 彩色徽章（5 值配色） |
| `IntegrityBadge.tsx` | 完整性徽章（clean/tampered） |
| `EvidenceTimeline.tsx` | 证据时间线 |
| `AblationCharts.tsx` | 消融图表 |
| `AssuranceDimensionCard.tsx` | V2 六维保证卡片 |
| `ReceiptUploader.tsx` | V2 收据上传/验证 |
| `lib/merkle.ts` | 前端 Merkle 计算（浏览器端验证） |
| `lib/integrity-golden.ts` | 完整性 golden 数据 |
| `lib/i18n/` | 中英双语（en.ts / zh.ts / messages.ts） |

> 学习点：`lib/merkle.ts` 在**浏览器里**计算 Merkle 根——配合
> `/integrity/proof/:seq` API，前端可以逐条验证证据而不用信任后端。
> 这是"验证者不需要信任被验证者"理念在前端的延伸。

## 9.4 动手：跑全栈

```bash
# 终端 1：后端 API
node src/cli/far.ts api

# 终端 2：前端（frontend/ 目录）
cd frontend && npm install && npm run dev
# → http://localhost:5173（Vite 代理 /hypothesize /evidence /verdict 等到 :3000）
```

走一遍：`/overview`（健康卡片）→ `/hero`（篡改演示）→ `/integrity`
（Merkle 根）→ `/court`（质询演示）→ `/v2-receipt`（收据验证）。

如果后端没起，Overview 会显示"后端不可达"——**页面仍能渲染**，
这是错误边界的正确实现（ErrorBoundary + 优雅降级）。

## 9.5 前端测试（~200 个）

`frontend/src/__tests__/`：
- 页面级：每个 page 一个 test（渲染 + 交互）
- 组件级：ErrorBoundary / IntegrityBadge / api_client
- 无障碍：`a11y_baseline.test.tsx`

跑法：`cd frontend && npm run test`（Vitest）。

## 自测

- [ ] 能说出前端为什么不能裁决（边界）
- [ ] 能说出 5 个以上路由的用途
- [ ] 知道 lib/merkle.ts 在浏览器里算什么
- [ ] 知道后端没起时前端如何降级
- [ ] 能本地起全栈并走通一个页面

→ 下一步：[10 Benchmark](10_BENCHMARKS.md) —— 30 个科学问题种子解剖。
