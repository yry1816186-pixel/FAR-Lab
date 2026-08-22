# Scout-A 报告：AI Chat/Workspace 前端开源深调研（adopte/extract/adapt 决策）

- 日期：2026-08-23 ｜ 角色：OSS Scout A ｜ 状态：IMPLEMENTED（源码级证据，见"实际读取文件清单"）
- 服务对象：FAR-Lab Human Experience Layer 重建（React 18 + Vite 6 + Tailwind 4，已有 lucide-react/sonner/katex/diff/pdfjs-dist/citation-js）
- 方法：zread 直接读 GitHub 源码（非 README 级）+ LICENSE 原文核验 + 闭源产品（ChatGPT/Claude/豆包）公开文章 pattern 提炼。到决策饱和即停。

---

## 0. TL;DR

1. **提取主源 = LibreChat（MIT，纯 Tailwind，最接近我们的栈）**；Dify 组件可 adapt（修改版 Apache-2.0，有前端 logo/外观专利限制，只做小模块级借鉴+保留声明）；LobeChat/Open WebUI 因 license 与框架限制降级为 pattern-only；Flowise（MUI+CRA）对本项目低价值。
2. **直接 ADOPT 一个 npm 包：`streamdown`（vercel/streamdown，Apache-2.0）** 作为流式 markdown+代码+KaTeX 渲染内核——Dify 已整体迁移到它，这是我们"artifact/文档渲染"能力的最短路径。
3. 五大最高杠杆采纳：Streamdown 渲染内核、LibreChat composer 套件、LibreChat "parts+乐观占位卡" agent 活动架构、Dify file-uploader（含 PDF 高亮）、语义设计 token 体系。
4. 明确规避：巨石组件、粘贴长文本强制转附件、入口按钮漂移、隐藏元素测宽 hack、@ts-ignore。

---

## 1. License 与提取政策表（已核验 LICENSE 原文）

| 仓库 | License（原文核验） | 对 FAR-Lab 的提取政策 |
|---|---|---|
| danny-avila/LibreChat | **MIT** | 允许 direct-extract / adapt（保留版权与许可声明） |
| FlowiseAI/Flowise | **Apache-2.0**（`packages/server/src/enterprise/` 等除外） | 法律上可提取，但前端在 `packages/ui`（CRA/craco+MUI+React Flow），与 Vite+Tailwind4 栈不匹配 → 低优先，pattern-only |
| lobehub/lobe-chat | **LobeHub Community License**（Apache-2.0 基础 + 商业衍生作品分发需商业授权） | 代码级提取构成 derivative 分发 → **pattern-only**；但其独立依赖库 **@lobehub/ui（lobehub/lobe-ui）为 MIT**，可选用 |
| langgenius/dify | **修改版 Apache-2.0**（多租户限制；`web/` 前端不得移除/修改 logo 与版权；"interactive design protected by appearance patent"） | 小模块 adapt 可行（Apache 基础+保留声明），**禁止像素级模仿其界面**；建议仅借鉴行为模式与局部实现思路 |
| open-webui/open-webui | **Open WebUI License**（BSD 式 + branding 保护条款：>50 活跃用户禁止去除/修改品牌；另有 CLA）+ **SvelteKit** | 非 React + license 条款 → **pattern-only** |
| vercel/streamdown | **Apache-2.0**（Copyright 2023 Vercel, Inc.） | **ADOPT npm 包**（保留 NOTICE） |
| lobehub/lobe-ui | **MIT**（Copyright 2023 LobeHub） | 可 ADOPT/选用组件 |

---

## 2. 逐能力最佳候选表

评级口径：**direct-extract**（拿文件改 import 即用）／**adapt**（保留架构、重写绑定层）／**pattern-only**（学行为不抄码）／**build**（无合适应物，自建）。

### 2.1 Composer（多行输入、auto-grow、附件 chip、拖放、粘贴、键盘、发送/停止）

| 候选 | 关键文件 | 证据要点 | 评级 |
|---|---|---|---|
| **LibreChat（首选）** | `client/src/components/Chat/Input/ChatForm.tsx`；`client/src/hooks/Input/useTextarea.ts`；`Input/SendButton.tsx`、`Input/StopButton.tsx`、`Input/CollapseChat.tsx`、`Input/TextareaHeader.tsx` | 纯 Tailwind className；`TextareaAutosize`；react-hook-form 托管 text；IME 三重防护（`isComposing` ref + `e.key==='Process'` + `e.keyCode===229`）；`enterToSend` 可切换（Enter 发送 vs Ctrl+Enter）；粘贴文件→`clipboardData.files` 重命名时间戳；>3 行折叠 + `mask-image` 渐隐；focus 时 `shadow-lg` 状态；发送/停止按钮按 `isSubmitting && showStopButton` 互换；`max-h-[45vh]` 上限 | **adapt**（剥离 Recoil/librechat-data-provider 两个依赖，换 zustand + 我们自己的 schema；UI 层基本可直接用） |
| Dify | `web/app/components/base/chat/chat/chat-input-area/index.tsx` + `chat-input-area/hooks.ts`（useTextAreaHeight） | `react-textarea-autosize`；Safari `compositionend` 后延迟 50ms 复位 isComposingRef；`e.nativeEvent.isComposing`；**Cmd/Ctrl+↑↓ 输入历史回溯**（historyRef）；`sendOnEnter` prop 显式面向 CJK 用户；发送前校验"本地文件未上传完则 toast 阻止" | adapt（输入历史 + sendOnEnter + 50ms 补丁值得并入我们的 hook） |
| Open WebUI | `src/lib/components/chat/MessageInput.svelte` + `common/RichTextInput.svelte`（Tiptap） | 字符命令建议（`@ # $ : /` 五类 suggestion）；Safari IME 用**事件时间戳窗口（500ms）判断**而非布尔——比布尔法更稳；拖拽支持拖入"会话/文件夹/笔记"变成引用（`application/x-open-webui-drag` 自定义 MIME 与 SortableJS 区分） | pattern-only（Tiptap+建议列表+拖入引用的概念；Safari 时间戳法可抄进 hook） |
| LobeChat | `src/features/ChatInput/InputEditor/*`（Lexical 插件族：`ActionTagPlugin`、`LocalFileTagPlugin`、`ReferTopicPlugin`）；`SendArea/SendButton.tsx` | Lexical 富文本 composer：@提及、**文件内联为标签节点**、拖话题进输入框变引用 chip、InputHistoryPopup；SendButton 有 `generating`（点击变停止）+ 权限门控 Tooltip（viewOnly 时灰化并解释） | pattern-only（LobeChat 主仓受限）。若未来需要"引用假设/证据变成内联 chip"，Lexical 是天花板方案，但先别上——用 textarea+chips 起步 |

闭源 pattern（ChatGPT，来源见 §6）：**calm default**（空输入栏不带任何模式 chip）；`+` 单一入口聚合附件/创建/模式；附件=缩略图+dismiss；模式激活后在栏内留**可移除的持久 chip**，placeholder 随模式切换（Deep research 预填报告占位文本）；语音按钮在右侧与 `+` 对称。

### 2.2 附件管线（类型图标、大小、上传/解析进度、失败重试、预览、删除）

| 候选 | 关键文件 | 证据要点 | 评级 |
|---|---|---|---|
| **Dify（首选）** | `web/app/components/base/file-uploader/`：`file-uploader-in-chat-input/file-item.tsx`、`file-image-item.tsx`、`file-list.tsx`、`hooks.ts`、`store.tsx`、`file-type-icon.tsx`、`pdf-preview.tsx`、`pdf-highlighter-adapter.tsx`、`file-from-link-or-local/index.tsx` | zustand store + 原生 HTML5 DnD（`useFile`：dragEnter/Leave/Over/Drop + clipboard paste，**无 react-dnd 依赖**）；`file-type-icon` 全类型图标；PDF 预览 + **pdf-highlighter-adapter（引用命中高亮）**——对"证据-文献核对"场景直接对口；上传中/完成/失败三态 in chip | **adapt**（Tailwind+zustand 与我们栈一致；注意保留 Apache 声明、不复制视觉皮肤） |
| LibreChat | `client/src/components/Chat/Input/Files/`：`FileContainer.tsx`、`FilePreview.tsx`、`ProgressCircle.tsx`、`RemoveFile.tsx`、`DragDropWrapper.tsx`、`DragDropOverlay.tsx`、`DragDropModal.tsx`、`AttachFileChat.tsx`；`hooks/Files/useFileHandling.ts`；`useAutoSave`（在 ChatForm 内调用） | chip 卡片=图标+文件名+类型副标题+hover 删除；subtitle 支持注入"Preparing preview…/Preview unavailable"（spinner/alert 图标）；DragDropWrapper：**overlay 常驻渲染避免挂载开销**；拖入后弹 Modal 让用户选处理方式；**useAutoSave：草稿+文件在会话切换/刷新后恢复** | adapt（MIT 可直接提取；react-dnd 依赖可换原生事件；useAutoSave 思路必须学） |
| Open WebUI | `MessageInput.svelte` 内 `uploadFileHandler`/`inputFilesHandler` | 乐观 UI：`tempItemId` 先入列 → `status:'uploading'` → 成功回填 id / **失败即整项移除**；空文件/超量/超尺寸前置校验 + toast；HEIC→JPEG 转换；图片按设置/配置双来源压缩 | pattern-only（失败即静默移除是弱点：我们应保留失败项+重试按钮——这也是 LibreChat subtitle 注入"Preview unavailable"想解决的） |

**结论**：管线骨架取 Dify（zustand+原生 DnD+类型图标+PDF 高亮），chip 形态与失败态取 LibreChat（失败可见+可重试），草稿持久化取 LibreChat useAutoSave，HEIC/压缩取 Open WebUI pattern。

### 2.3 流式 + Agent 活动渲染（token、工具调用块、步骤过渡、取消）

| 候选 | 关键文件 | 证据要点 | 评级 |
|---|---|---|---|
| **LibreChat（首选架构）** | `client/src/components/Chat/Messages/Content/ContentParts.tsx`、`Content/ToolCall.tsx`、`Content/ToolCallGroup.tsx`、`Content/InProgressCall.tsx`、`Content/Parts/PendingSkillCall.tsx`、`Content/ProgressText.tsx`、`hooks/useProgress`/`useExpandCollapse` | **parts 内容模型**（TEXT/TOOL_CALL/THINK…每 part 独立 memo `PartWithContext`）；`groupSequentialToolCalls` 把连续工具调用折叠成组；**PendingSkillCall 乐观占位卡**：提交瞬间先渲染"Running X"卡，真实 content part 到达后翻转为"Ran X"，finalize 后被真实 tool_call part 替换（源码注释里写明了完整生命周期——这就是我们要的"研究步骤流"形态）；ToolCall：`useProgress` 平滑假进度+ProgressText、`cancelled = !isSubmitting && progress<1 && !error` 推断、错误态、`aria-live` 播报、OAuth 内联授权；并行执行走 `ParallelContentRenderer` 列布局 | **adapt**（架构映射到我们的步骤：证据检索/假设生成/评估/排序；数据层换成 zustand+我们的 SSE） |
| Dify | `web/app/components/base/chat/chat/answer/workflow-process.tsx`、`answer/tool-detail.tsx`、`answer/reasoning-panel.tsx`、`thought/index.tsx` | 步骤折叠面板：running/succeeded/failed/paused 四态**背景色语义**（state-success-hover / state-destructive-hover / state-warning-hover）；折叠态标题=最后节点标题或错误；展开显示 TracingPanel 明细；错误块 `role=alert` | adapt（轻量：四态色+折叠标题规则+错误内联） |
| Open WebUI | `src/lib/components/chat/Messages/ResponseMessage/StatusHistory.svelte` + `StatusHistory/StatusItem.svelte` | 状态**时间线**：圆点+竖线连接的历史步骤列表，默认只显示最新一项，点击展开全部——比 Dify 面板更轻 | pattern-only（时间线视觉模式，适合"多步骤研究流程"摘要视图） |
| LobeChat | `src/store/chat/agents/StreamingHandler.ts`、`agents/transports/*`（ClientLLMTransport 等） | 客户端运行时级流处理（压缩传输/子代理/工具 transports）——能力最强但为重客户端架构服务 | pattern-only（对 FAR-Lab 属过度工程，前期不取） |

### 2.4 Artifact / 文档查看器（markdown+代码、KaTeX、折叠 section）

| 候选 | 关键文件 | 证据要点 | 评级 |
|---|---|---|---|
| **streamdown 包（首选内核）** | npm `streamdown` + `@streamdown/math`（vercel/streamdown，Apache-2.0）；Dify 集成配方：`web/app/components/base/markdown/streamdown-wrapper.tsx`、`markdown-utils.ts`、`markdown-blocks/`（code-block、ThinkBlock、Link、Img 等） | 专为流式 LLM 输出设计：`mode='streaming'`、`parseIncompleteMarkdown`（处理截断的半截 markdown）、默认 raw→sanitize→harden rehype 管线；Dify 的 wrapper 展示了**定制 sanitize schema**（逐 tag 白名单属性、从 clobber 列表移除 `name` 等）与组件映射（code/img/video/audio/a/details）；math 插件接 KaTeX（`singleDollarTextMath` 可配） | **direct-extract（ADOPT 包）**——我们已有 katex，接入成本最低 |
| LibreChat | `client/src/components/Chat/Messages/Content/Markdown.tsx` + `MarkdownComponents.tsx` + `MarkdownErrorBoundary.tsx`；`client/src/components/Artifacts/`（`Artifacts.tsx`、`Artifact.tsx`、`ArtifactTabs.tsx`、`ArtifactVersion.tsx`、`ArtifactPreview.tsx`、`DownloadArtifact.tsx`） | 备选渲染链：remarkMath+remarkGfm+remark-supersub+remark-directive+rehypeKatex+rehypeHighlight，`preprocessLaTeX` 预处理，`MarkdownErrorBoundary` 渲染降级；**Artifacts 侧板**：Radix Tabs code/preview、多版本 `ArtifactVersion` 切换、copy/download、markdown 内 `artifactPlugin` 直接触发侧板打开；移动端=可拖拽 bottom sheet（pointer capture + **snap 到 30/50/90/100** + 按高度插值动态 blur backdrop） | adapt（Artifacts 侧板交互整套可搬：版本切换/双 tab/sheet 拖拽/snap；若用 Streamdown 则 Markdown.tsx 只做组件映射参考） |
| Dify | `web/app/components/base/chat/chat/citation/index.tsx` + `citation/popup.tsx` + `tooltip.tsx` | 引用按 documentId 分组、一行放不下折叠成 `+N`；popup 展示命中段落 | pattern-only（概念好：引用分组+popop 展示命中片段；但其用**隐藏绝对定位元素测宽**实现折叠——勿抄实现，用 ResizeObserver） |

Claude artifacts 闭源 pattern：≥15 行独立产物才升格为侧板；聊天列=控制面、侧板=产物面；版本可回溯；**教训**（Reddit 实测抱怨）：侧板入口按钮曾漂移/消失导致发现性崩坏——入口必须常驻可预期。对 FAR-Lab：研究计划/假设卡/证据表都应是 artifact 侧板的一等公民。

### 2.5 App Shell 与导航 IA（侧栏、空状态、首启、命令面板、设置/模型选择）

| 候选 | 关键文件 | 证据要点 | 评级 |
|---|---|---|---|
| LibreChat | `client/src/components/Nav/`（`NewChat.tsx`、`SearchBar.tsx`、`NavToggle.tsx`、`Favorites/`、`Bookmarks/`、`Settings.tsx`+`SettingsTabs/` 分域）；`client/src/components/Chat/Landing.tsx`；`Chat/Menus/Endpoints/ModelSelector.tsx` | 侧栏按"新会话/搜索/收藏/书签/设置分域 Tabs"组织；Landing：**时间+星期感知问候**（凌晨/早晨/周末/下午/晚上不同文案）、`SplitText` 逐行入场动画（@react-spring/web, easeOutCubic）、按内容行数动态留白；`centerFormOnLanding` 使表单在空会话时垂直居中、首条消息后滑落到底部（`transition-all duration-200 sm:mb-28`）——**这是 ChatGPT 式"落地页→工作台"过渡的干净实现** | adapt（Nav 结构小而清楚；Landing+表单滑落动画直接值回票价） |
| Dify | `web/app/components/base/chat/chat-with-history/sidebar/`（`index.tsx`、`item.tsx`、`list.tsx`、`rename-modal.tsx`、`operation.tsx`）；`embedded-chatbot/theme/theme.ts` | 会话列表项内联 rename/operation；嵌入式 chatbot 的 theme 定制层（外部传入主题变量） | pattern-only（会话列表操作的组织方式；嵌入主题定制层概念） |
| Open WebUI | `src/lib/components/chat/Settings/`（50+ 文件分域） | 设置面碎片化到极致（Account/Advanced/Audio/Connections/Interface/Integrations/Notifications/Personalization/Tools/Usage…） | 反例（pattern：设置要收敛为少量分域+搜索） |
| （空白区）命令面板 | 五仓均无 cmdk 级实现 | — | **build**（自建：cmdk 或自写，配我们已有的 sonner；这是"AI-native 研究操作系统"应有的 Cmd+K 动作入口） |

### 2.6 设计系统（token、明暗主题、motion、图标）

| 候选 | 关键文件 | 证据要点 | 评级 |
|---|---|---|---|
| **LibreChat（首选）** | `client/tailwind.config.cjs` | **语义 token 全 CSS 变量化**：`--text-primary/secondary/tertiary/warning/destructive`、`--surface-primary…chat/submit/destructive`（十余档 surface）、`--border-light/medium/heavy/xheavy`；`darkMode:'class'`；插件 `tailwindcss-animate` + `tailwindcss-radix`；keyframes：slide-in/out-left/right（300ms cubic-bezier(.25,.1,.25,1)）、accordion（用 `--radix-accordion-content-height` 变量做高度动画）；品牌绿 `#10a37f` + OpenAI 式灰阶；Inter/Roboto Mono | **adapt**（token 名单+CSS 变量模式天然映射到 Tailwind 4 `@theme`；沿用我们的 IBM Plex） |
| Dify | `web/app/components/base/**`（class 命名体系） | token 命名法更工程化：`bg-components-panel-bg-blur`、`text-text-tertiary`、`border-components-chat-input-border`、排版 token `body-lg-regular`/`system-xs-medium`、状态色 `state-success-hover` | pattern（命名学：`{域}-{角色}-{状态}` 三段式，值得在 @theme 里贯彻） |
| LobeChat | 依赖 `@lobehub/ui`（lobehub/lobe-ui，**MIT**） | antd 主题 token 体系 + lobe-ui 高质量 chat 组件（ActionIcon、Logo、ThemeProvider 等） | 可选 ADOPT（少量引入 lobe-ui 组件不违和；但引入 antd 体系会与我们 Tailwind4 冲突——建议只借单体无 antd 依赖的组件，或不用） |
| Open WebUI | 各 .svelte 内联色值（`bg-white dark:bg-gray-900/60` 等散落） | 无集中 token | 反例 |

### 2.7 状态架构（流式状态、乐观 UI、错误/toast 纪律）

| 候选 | 关键文件 | 证据要点 | 评级 |
|---|---|---|---|
| LibreChat | `ChatForm.tsx` 尾部 `ChatFormWrapper`；`client/src/store/`（Recoil atoms 按域分文件 + `jotai-utils.ts`）；`store/toast.ts` | **防流式重渲染的 memo 隔离模式**（源码注释明说"prevents ChatForm from re-rendering on every streaming chunk"）：Context 拆原子值传入 memo 组件；`stableConversation` 用依赖白名单 `useMemo` 稳定引用（流中标题生成等 metadata 更新不再触发）；回调用 `ref+useCallback([])` 冻结 | **pattern 必学**（照搬到 zustand：selector 订阅最小集 + 引用稳定化） |
| Dify | `file-uploader/store.tsx`（zustand）、`chat/context-provider.tsx`、`@langgenius/dify-ui/toast` | zustand + Provider 分层；发送路径上"文件未上传完→toast.info 阻止"、"isResponding→toast.info"——**用 toast 做前置防错而非事后报错** | adapt（zustand 模式与防错式 toast 纪律） |
| LobeChat | `src/store/chat/`（`slices/message|topic|thread|portal/`，每 slice `action.ts+initialState.ts+selectors/`，附大量测试） | zustand slices + 独立 selectors 文件 + selector 隔离测试——大型前端 zustand 组织的最佳实践 | pattern（目录组织照抄：`slice/{action,initialState,selectors}` 三件套） |
| Open WebUI | `$lib/stores` 全局 Svelte stores | 全局单例，测试性差 | 反例参考 |

---

## 3. Top-5 最高杠杆采纳（按 UX 影响 / 集成成本排序）

1. **ADOPT `streamdown`（Apache-2.0）作流式渲染内核**，参照 Dify `streamdown-wrapper.tsx` 的 sanitize schema 定制与 `code/a/details` 组件映射，math 插件接我们已有的 katex。影响面=所有模型输出/研究文档渲染；成本≈一个依赖+一个 wrapper。它内建 `parseIncompleteMarkdown`（半截 markdown 流式渲染）与 streaming 模式，是五仓中两家（Dify 已迁、LibreChat 自建插件链苦撑）验证过的路线。
2. **EXTRACT LibreChat composer 套件（MIT）**：`ChatForm.tsx`+`useTextarea.ts`+`SendButton/StopButton/CollapseChat`。核心收获：IME 三重防护、enterToSend、粘贴即附件、>3 行折叠渐隐、发送/停止互换。改造点：Recoil→zustand、剥离 `librechat-data-provider`。这直接决定"研究提问输入"的每天手感。
3. **ADAPT LibreChat "parts + 乐观占位卡" agent 活动架构**（`ContentParts.tsx`/`ToolCall.tsx`/`PendingSkillCall.tsx`）：把我们的研究步骤（文献检索→假设生成→反证→排序→计划）建模为 parts 流，提交瞬间渲染乐观占位卡、结果到达翻转、失败保留可见+可重试。这是"AI-native 研究操作系统"区别于普通聊天的核心体验，且 MIT 源码已把生命周期注释写透。
4. **ADAPT Dify `file-uploader`（zustand+原生 DnD）+ `pdf-highlighter-adapter`**：证据文件管线（chip/类型图标/进度/失败重试/PDF 命中高亮）——"证据→文献定位"是 FAR-Lab 特有刚需，五仓中唯一现成实现。chip 失败态与草稿恢复补 LibreChat `FileContainer`+`useAutoSave` 行为。
5. **ADAPT 语义 token 体系到 Tailwind 4 `@theme`**：以 LibreChat `tailwind.config.cjs` 的变量名单为底（text/surface/border 三族+状态色），采 Dify 三段式命名法，`darkMode:'class'`+slide/fade keyframes 统一 motion。成本一天，收益是之后所有组件的暗色/一致性免费。

（次级但建议列入：LibreChat Landing 的"空会话居中→首条消息滑落"过渡 + 时间感知问候；Claude 式 artifact 侧板用 LibreChat `Artifacts.tsx` 交互骨架实现版本切换与移动端 sheet。）

---

## 4. 反模式清单（必须规避）

1. **巨石组件**：Open WebUI `MessageInput.svelte` 约 2000 行（附件上传、变量替换、语音、拖拽、命令建议、状态面板全在一个文件），且大量 `document.getElementById` 全局寻址与遗留 `console.log`——不可测试、不可维护。我们按 ≤300 行/组件 + 单一职责切分。
2. **粘贴长文本强制转附件**（ChatGPT 2026 行为，社区强烈反弹）：>10k 字符粘贴被转成 attachment 后无法在 composer 内编辑。FAR-Lab 处理长文献文本时应保留可编辑性或提供明确选择。
3. **入口漂移**：Claude artifacts 面板按钮曾移位/消失（Reddit r/ClaudeAI 实测抱怨），侧板/面板入口必须常驻、位置可预期。
4. **失败即静默移除**：Open WebUI 上传失败直接把文件项从列表删掉，用户失去重试语境。保留失败态 chip+重试按钮（LibreChat 的 subtitle 注入"Preview unavailable"方向正确）。
5. **隐藏元素测宽 hack**：Dify citation 用绝对定位+`opacity-0` 的影子元素测量 chip 宽度决定折叠——不响应 resize、脆弱。用 ResizeObserver / container query。
6. **@ts-ignore 逃逸**：LibreChat `Markdown.tsx` 对 remark/rehype 插件 props 使用 `@ts-ignore`。我们提取时必须以正确类型收窄（`Pluggable[]` 显式声明），AGENTS.md 零容忍。
7. **设置碎片化**：Open WebUI `Settings/` 50+ 文件、十几处分域；Dify 设置亦重。收敛为少数分域+设置内搜索。
8. **主题色值散落**：Open WebUI 大量内联 `dark:bg-gray-900/60` 式硬编码，无 token 源头。一切色值走 `@theme` token。
9. **客户端运行时过度工程**：LobeChat 把 LLM 传输/压缩/子代理都做进浏览器（`store/chat/agents/transports/*`）。FAR-Lab 前端只消费 SSE/流式事件，编排留给后端/模型路由层。
10. **license 违规风险**：勿从 LobeChat/Open WebUI 主仓直接搬代码（社区许可 branding/衍生分发条款）；勿像素级模仿 Dify 界面（外观专利声明）。本文所有 pattern-only 项均为行为借鉴，非代码/视觉复制。

---

## 5. 闭源基准 pattern 摘要（仅行为，不复制像素）

- **ChatGPT composer**（aiuxplayground teardown）：calm default（空栏无 chip）；单一 `+` 入口聚合能力；附件=缩略图+dismiss；模式 chip 持久可移除、placeholder 随模式变（Deep research 有预填占位与范围过滤=**预发送契约**）；语音在右、与 `+` 对称。短板：Web 端输入区不支持直接拖文件入栏（社区痛点——我们要支持）；不同模式行视觉权重相同，无法预期耗时（研究工作台应给步骤以耗时/进度语义）。
- **Claude artifacts**：≥15 行独立产物升格侧板；聊天=控制面、侧板=产物面；版本可回溯；发现性教训见反模式 3。
- **豆包**（woshipm/知乎/火山引擎文章）：低门槛+拟人化为核心；语音交互（自然度/响应时间）是强项；网页版改版走"快捷菜单+界面降噪"路线。对科研工具的启示：默认界面降噪（少 chrome、聚焦任务），高级能力收进显式菜单而非平铺。

## 6. 信息来源

实际读取的仓库文件（zread 源码级）：

- danny-avila/LibreChat：`LICENSE`、`client/src/components/Chat/Input/ChatForm.tsx`、`client/src/components/Chat/Input/Files/FileContainer.tsx`、`client/src/components/Chat/Input/Files/DragDropWrapper.tsx`、`client/src/hooks/Input/useTextarea.ts`、`client/src/components/Chat/Messages/Content/ToolCall.tsx`、`client/src/components/Chat/Messages/Content/Markdown.tsx`、`client/src/components/Chat/Messages/Content/ContentParts.tsx`、`client/src/components/Artifacts/Artifacts.tsx`、`client/src/components/Chat/Landing.tsx`、`client/tailwind.config.cjs`；结构：`Chat/`、`Artifacts/`、`store/`、`Nav/`
- langgenius/dify：`LICENSE`、`web/app/components/base/chat/chat/chat-input-area/index.tsx`、`web/app/components/base/chat/chat/answer/workflow-process.tsx`、`web/app/components/base/chat/chat/citation/index.tsx`、`web/app/components/base/markdown/streamdown-wrapper.tsx`；结构：`base/chat/`、`base/markdown/`、`base/file-uploader/`
- lobehub/lobe-chat：`LICENSE`；结构：`src/features/ChatInput/`（InputEditor/ActionTag 插件族、SendArea、ActionBar、store/）、`src/store/chat/`（slices/agents transports）
- open-webui/open-webui：`LICENSE`；`src/lib/components/chat/MessageInput.svelte`、`src/lib/components/chat/Messages/ResponseMessage/StatusHistory.svelte`；结构：`src/lib/components/chat/`
- FlowiseAI/Flowise：`LICENSE.md`；根结构（前端=`packages/ui`，CRA/MUI）
- vercel/streamdown：`LICENSE`（Apache-2.0）；lobehub/lobe-ui：`LICENSE`（MIT）

闭源参考（公开文章）：[ChatGPT composer teardown](https://aiuxplayground.com/teardowns/chatgpt/composer/)、[Claude Artifacts teardown](https://aiuxplayground.com/teardowns/claude/artifacts/)、[AI UX Patterns: Attachments](https://www.shapeof.ai/patterns/attachments)、[Drag-and-Drop UX Guidelines](https://smart-interface-design-patterns.com/articles/drag-and-drop-ux/)、[OpenAI Release Notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes)、[粘贴转附件社区反馈](https://community.openai.com/t/chatgpt-converts-pasted-text-to-file-attachment/1369430)、[Claude 面板按钮消失抱怨](https://www.reddit.com/r/ClaudeAI/comments/1ngn5ya/show_artifacts_panel_button_vanished_and_its/)、[五大 AI app 体验对比](https://www.woshipm.com/ai/6341767.html)、[豆包网页版改版](https://developer.volcengine.com/articles/7473796661194522650)、[豆包语音交互分析](https://zhuanlan.zhihu.com/p/716827396)

遗留不确定项（UNVERIFIED）：各仓当前 HEAD commit 未逐一定位（读的是默认分支最新）；`@streamdown/math` 与我们 katex 版本的兼容性、streamdown 在 Vite 6 的打包表现需在集成 spike 中实测；LibreChat 提取物对 React 18 的兼容（其为 React 18/19 过渡期代码）需以我们的 TS 严格模式跑通为准。
