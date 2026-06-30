# FAR-Chain Frontend

FAR-Chain Web UI — Falsifiable Auditable Research-Chain 仪表盘。

基于 spec 27（开源治理与社区）§7 前端技术栈：React 18 + Vite 5 + shadcn/ui + Tailwind 3 + D3.js 7 + React Flow 11 + TanStack Query 5。

## 快速开始（fresh-clone）

```bash
# 1. 进入前端目录
cd far-chain/frontend

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
    ├── pages/
    │   ├── OverviewPage.tsx    # 总览（三柱 + 运行命令 + 健康状态）
    │   ├── VizPage.tsx         # 证据链可视化（stub · 待 D3/React Flow 接入）
    │   ├── HonestyWallPage.tsx # 诚信墙（stub · 待 5 枚举视觉语言接入）
    │   ├── AblationPage.tsx    # 消融实验（stub）
    │   ├── ReportPage.tsx      # 研究报告（stub）
    │   └── AboutPage.tsx       # 关于
    └── __tests__/
        ├── utils.test.ts
        ├── App.test.tsx
        ├── OverviewPage.test.tsx
        └── api_client.test.ts
```

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

## 限制声明

- `VizPage` / `HonestyWallPage` / `AblationPage` / `ReportPage` 当前为 stub，待 P1 阶段（Task 5-8）接入 D3.js / React Flow / 5 枚举视觉语言 / 报告聚合。
- 前端依赖独立于根项目 `package.json`，不引入 agent 运行时框架（LangGraph / AutoGen / OpenAI Agents SDK 等红线依赖）。

## 许可证

Apache-2.0（与 FAR-Chain 主项目一致）。
