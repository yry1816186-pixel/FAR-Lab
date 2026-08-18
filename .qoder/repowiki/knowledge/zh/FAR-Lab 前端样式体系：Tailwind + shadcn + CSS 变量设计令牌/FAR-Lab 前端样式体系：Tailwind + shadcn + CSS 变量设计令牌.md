---
kind: frontend_style
name: FAR-Lab 前端样式体系：Tailwind + shadcn + CSS 变量设计令牌
category: frontend_style
scope:
    - '**'
source_files:
    - frontend/tailwind.config.ts
    - frontend/src/index.css
    - frontend/components.json
    - frontend/postcss.config.js
    - frontend/package.json
    - frontend/src/components/theme/ThemeProvider.tsx
    - frontend/src/App.tsx
    - frontend/src/components/ui/button.tsx
    - frontend/src/components/ui/card.tsx
    - frontend/src/components/ui/badge.tsx
---

## 1. 系统/技术栈

- **构建与开发**: Vite (`vite.config.ts`) + TypeScript，PostCSS 管线 (`postcss.config.js` 仅启用 `tailwindcss`、`autoprefixer`)。
- **原子化样式**: Tailwind CSS v3 (`tailwind.config.ts`)，通过 `darkMode: ['class']` 实现亮/暗主题切换。
- **组件库**: 基于 [shadcn/ui](https://ui.shadcn.com/)（`components.json` 中 `$schema` 指向 shadcn schema），以“复制式”组件形式存放在 `src/components/ui/*`（button、card、dialog、badge、alert、input、skeleton、table），配合 Radix UI 底层原语（`@radix-ui/react-*`）。
- **工具库**: `class-variance-authority` + `clsx` + `tailwind-merge` 用于组合变体类名；`lucide-react` 为图标源。
- **动画**: `tailwindcss-animate` 插件提供基础 keyframes，自定义 `accordion-down/up` 等。

## 2. 关键文件

| 文件 | 作用 |
|---|---|
| `frontend/tailwind.config.ts` | 设计令牌集中定义处：品牌色阶、裁决色阶、字体族、字号阶梯、圆角、阴影、动效曲线/时长 |
| `frontend/src/index.css` | CSS 变量令牌根（`:root` 亮色 / `.dark` 暗色），含 brand、shadcn 语义层、verdict 5 值色、全局 base/reset、`prefers-reduced-motion` 无障碍降级 |
| `frontend/components.json` | shadcn 配置（style=default, tsx=true, cssVariables=true, baseColor=slate, iconLibrary=lucide, aliases 映射 `@/components`、`@/lib`、`@/hooks` 等） |
| `frontend/postcss.config.js` | PostCSS 插件链（tailwindcss → autoprefixer） |
| `frontend/package.json` | 依赖声明（React 18、Vite、Tailwind、Radix、TanStack Query、d3、Zod 等） |
| `frontend/src/components/theme/ThemeProvider.tsx` | 亮/暗/system 主题上下文，持久化到 `localStorage('far-chain-theme')`，监听 OS `prefers-color-scheme` |
| `frontend/src/App.tsx` | 应用入口，按路由 `React.lazy` 拆分页面（d3 等重依赖隔离），包裹 `I18nProvider`、`ThemeProvider`、`AppShell` |

## 3. 架构与设计约定

### 3.1 设计令牌（Design Token）分层
`tailwind.config.ts` 顶部注释明确标注 **R-09** 视觉气质：“Precise · Calm · Evidentiary (严谨 / 可信 / 科学 / 学术)”，参考 Apple HIG / Linear / Vercel / Anthropic / DeepMind。令牌分三层：

1. **CSS 变量层** (`index.css` `:root` / `.dark`)：所有颜色以 HSL 三元组（空格分隔，无 `hsl()` 包裹）暴露为 `--brand-*`、`--background`、`--primary`、`--verdict-*` 等变量。
2. **shadcn 语义层**：`border/input/ring/background/foreground/primary/secondary/destructive/muted/accent/popover/card` 等语义 token，分别精调亮/暗两套值。
3. **Tailwind 扩展层** (`tailwind.config.ts` theme.extend)：将 CSS 变量注入 Tailwind 的 `colors.*`，并新增 `brand` 11 阶、`brandaccent`、`verdict`（confirmed/refuted/inconclusive/degraded/untested 及其 `-solid`、`-foreground` 变体）、`fontFamily`（sans/display/mono）、`fontSize`（display/h1..h6 使用 `clamp` 响应式）、`borderRadius`、`boxShadow`、`transitionTimingFunction`（standard/precise/spring）、`transitionDuration`（fast/normal/slow/very-slow）。

### 3.2 主题策略
- 使用 Tailwind `darkMode: ['class']`，由 `ThemeProvider` 在 `<html>` 上切换 `dark` class。
- 主题偏好持久化到 `localStorage('far-chain-theme')`，首次访问回退到 `system` 模式读取 `prefers-color-scheme`。
- 暗色主题下对对比度做了显式审计注释（如 primary 从 brand-500 改为 brand-600 以满足 WCAG AA ≥4.5:1；verdict solid 变体亮度下调以保证白字可读性）。

### 3.3 裁决状态色域（Verdict Palette）
为科学验证场景定制 5 值色阶：`confirmed`、`refuted`、`inconclusive`、`degraded`、`untested`。每个状态提供三档：
- `--verdict-*`：vivid 色，用于图标/边框/强调。
- `--verdict-*-solid`：深色背景 + 白字，保证 WCAG AA ≥4.5:1。
- `--verdict-*-foreground`：前景文本色。

### 3.4 组件组织
- `src/components/ui/*`：shadcn 生成的基础原子组件（button、card、dialog、badge、alert、input、skeleton、table），统一消费 shadcn 语义 token。
- `src/components/layout/*`、`src/components/v2/*`、业务组件（`EvidenceTimeline`、`IntegrityBadge`、`VerdictBadge`、`AblationCharts` 等）位于同级目录。
- `src/lib/*`：共享逻辑（i18n、schemas、API client、merkle、verdict、vizHonesty、utils 等），不直接包含样式。

### 3.5 可访问性与响应式
- 全局 `@media (prefers-reduced-motion: reduce)` 将所有动画/过渡/滚动行为降至近瞬时，满足 WCAG 2.3.3 前庭障碍需求。
- 字体采用 Inter + PingFang SC/Noto Sans SC/Microsoft YaHei 中文回退链；标题使用 display 字族（Geist）。
- 字号使用 `clamp(2rem, 5vw, 3.5rem)` 等响应式 clamp，避免媒体查询断点。

## 4. 约定与约束

- **颜色必须经 CSS 变量消费**：`tailwind.config.ts` 中所有 `colors.*` 均写为 `hsl(var(--x))`，禁止在组件内硬编码十六进制色值。
- **主题切换必须通过 ThemeProvider**：`useTheme()` 在未处于 `ThemeProvider` 时抛错，强制主题上下文边界。
- **裁决色只允许使用预定义的 verdict 色阶**：新增状态需先在 `index.css` 补充变量并在 `tailwind.config.ts` 注册，不得临时新增 token。
- **暗色主题对比度必须达标**：代码注释中多次记录 WCAG AA 失败→修正过程，作为后续修改的约束依据。
- **组件样式优先使用 Tailwind 原子类 + shadcn 组件**：新 UI 元素应复用 `@/components/ui/*` 或基于 Radix 原语组合，而非新建独立 CSS 模块。
- **动画曲线/时长走统一命名**：使用 `transitionTimingFunction` 中的 `standard/precise/spring` 和 `transitionDuration` 中的 `fast/normal/slow/very-slow`，避免随意指定 `cubic-bezier` 或毫秒数。
- **页面级大依赖按需懒加载**：`App.tsx` 中所有页面路由使用 `React.lazy`，d3 等重型库被隔离到对应 chunk，首屏不包含。
- **国际化与主题解耦**：`I18nProvider` 与 `ThemeProvider` 并列包裹，语言文案与视觉主题互不影响。

该体系以 shadcn + Tailwind 为核心，通过 CSS 变量集中管理设计令牌，围绕“严谨·可信·科学·学术”的视觉气质，为 FAR-Lab 的研究工作台、证据链可视化、完整性校验、法庭/竞技场等界面提供一致的样式基础设施。