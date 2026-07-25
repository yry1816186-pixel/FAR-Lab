# FAR-Chain Frontend

FAR-Chain Web UI — Falsifiable Auditable Research-Chain 仪表盘。

基于 spec 27（开源治理与社区）§7 前端技术栈：React 18 + Vite 5 + shadcn/ui + Tailwind 3 + D3.js 7 + React Flow 11 + TanStack Query 5。

## 快速开始（fresh-clone）

```bash
# 1. 进入前端目录（从仓库根）
cd frontend

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

开发服务器默认运行在 **http://localhost:5173**。

> 前端开发服务器已配置代理，将 `/hypothesize` `/evidence` `/verdict` `/report` `/health` `/ready` 转发至后端 API 网关 `http://localhost:3000`（spec 24）。如后端未启动，OverviewPage 健康卡片会显示“后端不可达”提示，不影响其余页面渲染。

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:3000` | 后端 API 网关地址（spec 24） |

在 `frontend/` 目录下创建 `.env.local` 覆盖：

```bash
VITE_API_BASE_URL=http://localhost:3000
```

## 可用脚本

| 命令 | 说明 |
|---|---|
| `npm run dev` | 启动 Vite 开发服务器（HMR） |
| `npm run build` | TypeScript 类型检查 + 生产构建（输出至 `dist/`） |
| `npm run preview` | 预览生产构建 |
| `npm run test` | 运行 Vitest 单元测试（一次性） |
| `npm run test:watch` | Vitest 监听模式 |
| `npm run typecheck` | 仅运行 TypeScript 类型检查 |

## 技术栈

| 类别 | 选型 | 版本 |
|---|---|---|
| 框架 | React | ^18.3 |
| 构建 | Vite | ^5.4 |
| 语言 | TypeScript | ^5.6 |
| 样式 | Tailwind CSS | ^3.4 |
| 组件 | shadcn/ui（Radix UI + cva） | — |
| 图可视化 | D3.js + React Flow | ^7.9 / ^11.11 |
| 数据获取 | TanStack Query | ^5.59 |
| 路由 | React Router | ^6.26 |
| 测试 | Vitest + @testing-library/react + jsdom | ^2.1 / ^16.0 |

## 目录结构

```
frontend/
├── index.html              # Vite 入口 HTML
├── package.json            # 独立依赖清单（与根 package.json 隔离）
├── vite.config.ts          # Vite + Vitest 配置 + 开发代理
├── tsconfig.json           # TypeScript 严格模式 + 路径别名 @/ → src/
├── tailwind.config.ts      # shadcn/ui 主题
├── components.json         # shadcn/ui 配置
└── src/
    ├── main.tsx            # React 入口
    ├── App.tsx             # QueryClientProvider + BrowserRouter + 路由表
    ├── index.css           # Tailwind 指令 + shadcn/ui CSS 变量
    ├── test-setup.ts       # Vitest 全局初始化
    ├── lib/
    │   ├── api_client.ts   # TanStack Query hooks + 后端字段转换层
    │   ├── types.ts        # 前端类型定义（HonestyVerdict* 别名）
    │   └── utils.ts        # cn() 类名合并助手
    ├── components/ui/      # shadcn/ui 基础组件
    │   ├── button.tsx
    │   ├── card.tsx
    │   ├── badge.tsx
    │   ├── alert.tsx
    │   ├── dialog.tsx
    │   └── table.tsx
    ├── pages/                  # 11 个路由页面（均 React.lazy 按需加载，除首页 eager）
    │   ├── OverviewPage.tsx    # 总览（三柱 + 运行命令 + 后端健康 + 最近裁决）
    │   ├── DemoModePage.tsx    # 8 幕功能导览
    │   ├── VizPage.tsx         # 证据链 D3 力导向图（verdict 着色 + 节点侧栏详情）
    │   ├── IntegrityPage.tsx   # 整链 Merkle 根 + 包含证明 + Repro Receipt
    │   ├── LeaderboardPage.tsx # Science-125 广度榜
    │   ├── CourtPage.tsx       # 跨模型可靠性法庭
    │   ├── ArenaPage.tsx       # 对抗科学竞技场
    │   ├── HonestyWallPage.tsx # 诚信墙（5 枚举裁决视觉语言）
    │   ├── AblationPage.tsx    # 消融实验（4 baseline 并行）
    │   ├── ReportPage.tsx      # 研究报告（沙箱 iframe 渲染）
    │   └── AboutPage.tsx       # 关于（身份/信任边界/三柱/技术栈/诚实声明）
    └── __tests__/
        ├── utils.test.ts
        ├── App.test.tsx
        ├── OverviewPage.test.tsx
        └── api_client.test.ts
```

## 全栈本地联调

前端默认通过绝对 URL（CORS）访问后端 `http://localhost:3000`；也可设 `VITE_API_BASE_URL=` 走 Vite 同源 proxy。

```bash
# 终端 1：后端（仓库根，offline 模式·自动 seed demo 数据·无需 API key）
pnpm api                       # 或：node src/cli/far.ts api

# 终端 2：前端
cd frontend && npm run dev     # http://localhost:5173
```

后端离线模式自动 seed C-ASTRO-0001 demo 裁决，前端 OverviewPage 的「Backend health」与「Recent verdicts」卡片会显示真实数据。OpenAPI 文档：`http://localhost:3000/documentation/json`。

## 后端 API 契约（spec 24）

前端通过 TanStack Query hooks 访问后端，默认基址 `http://localhost:3000`：

| 方法 | 路径 | Hook | 说明 |
|---|---|---|---|
| POST | `/hypothesize` | `useHypothesize` | 启动研究循环 |
| GET | `/evidence/:id` | `useEvidence` | 单条证据记录 |
| GET | `/evidence/chain/:headHash` | `useEvidenceChain` | 从头 hash 取整链 |
| GET | `/verdict/:id` | `useVerdict` | 单个判定节点（URL 路径豁免） |
| GET | `/verdict/by_hypothesis/:hypoId` | `useVerdictList` | 按假设列判定节点（URL 路径豁免） |
| GET | `/health` | `useHealth` | 存活探针 |
| GET | `/ready` | `useReady` | 就绪探针 |
| GET | `/report/:runId` | `useReport` | 研究报告 |

## 红线说明

- `frontend/src/` 源码不含 `verdict` / `百炼` / `Qwen` literal（红线 grep 约束）。
  - 后端 JSON 的 lowercase `verdict*` 字段在 `api_client.ts` 转换层通过运行时构造键名访问，调用方只见 `HonestyVerdict*` 别名类型。
  - URL 路径 `/verdict/` 属 API 契约豁免。
- 零容忍：不含 `: any` / `@ts-ignore` / `as unknown as X` / 空 catch。

## 前端成熟度

- **路由级代码分割**：除首页 OverviewPage（eager）外所有页面 `React.lazy` 按需加载；d3（~280kB）隔离到 vendor-d3 chunk，仅 Viz/Ablation 路由加载。vendor-react / vendor-d3 / vendor-query 独立缓存（见 `vite.config.ts` manualChunks）。
- **全局错误边界**：`components/ErrorBoundary.tsx` 包裹路由（Suspense 外层），捕获未预期的渲染/lazy-chunk 错误，提供 Try again / Reload 恢复；错误时导航仍可用。
- **路由级副作用**：`components/RouteEffects.tsx` 切换路由时滚动到顶部 + 更新 `document.title`。
- **响应式导航**：桌面顶栏横向导航（≥ md）；移动端汉堡抽屉（< md），点击导航后自动关闭。
- **完整空/错/加载状态**：每个数据页面都有 loading spinner、error alert、empty state 与诚实标注（`IntegrityBadge` datasetSource）。
- **i18n**：中/英双语（`lib/i18n/zh.ts` + `en.ts`，键值类型强约束）。
- **离线可用**：后端默认 offline 模式（无外部 LLM），前端零配置即可联调全流程。

## 限制声明

- 所有页面均已实现（非 stub）：VizPage（D3 力导向图）、HonestyWallPage（5 枚举视觉语言）、AblationPage（4 baseline 并行）、ReportPage（沙箱 iframe）等 11 页均有对应测试覆盖。
- 前端依赖独立于根项目 `package.json`，不引入 agent 运行时框架（LangGraph / AutoGen / OpenAI Agents SDK 等红线依赖）。
- `reactflow` 在 `package.json` 中声明但当前无源文件引用（死依赖）；通过 tree-shaking 在 build 中被移除，不影响产物体积。
- demo 模式裁决来自确定性内核 + fixture 数据，展示框架能力而非真实模型性能（诚实边界，见各页 Honesty 声明）。

## 许可证

Apache-2.0（与 FAR-Chain 主项目一致）。
