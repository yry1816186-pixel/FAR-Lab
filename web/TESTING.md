# web/TESTING.md — 研究者工作台手工走查步骤

> 前提：FAR-Lab HTTP API 已在 `http://localhost:8787` 运行。
> - 生产走查（必须）：启动真实 API（live 模型路由）`npm run build && node dist/server/main.js`（仓库根），它同时会把 `web/dist` 作为静态前端服务。
> - 开发模式：`cd web && npm install && npm run dev`，浏览器打开 `http://localhost:5173`（/api 代理到 8787）。
> - 无配额预走查（可选，TEST-ONLY）：`web/scripts/smoke-server.mjs` 用真实 kernel + 显式测试缝在 8787 提供种子数据（见文件头注释；不得作为交付能力证据）。
>
> 若 API 未启动：页面应显示「API 连接中断 — 自动重试中」横幅与错误重试框（真实断连态，不显示任何假数据）——这本身就是一条有效的状态纪律检查。

## 走查步骤（每步含预期真实状态）

### 1. 空态与初始加载
- 打开页面，Runs 列表先显示骨架加载，随后（无历史 run 时）显示空态指引「尚无研究 run…」。
- 右侧主区显示「从左侧选择一个 run 查看详情」。
- 预期：无任何假数据/假进度；中/英切换按钮可用且立即生效（localStorage 持久化）。

### 2. 新建研究
- 在「新建研究」表单：问题留空直接提交 → 出现必填校验错误「研究问题为必填项」，不发请求。
- 填入问题文本（如 What mechanisms drive the horizontal transfer of antibiotic resistance genes in hospital environments?），可选填 domain 与 goalType，提交。
- 预期：按钮进入「提交中…」禁用态；成功后表单清空，左侧列表立即出现新 run（`POST /api/v1/runs` 202），右侧自动选中该 run 并显示概览。失败时显示错误原文与可重试标注，不伪造成功。

### 3. 观察阶段推进（真实进度）
- 概览 tab「阶段时间线」：11 个阶段按 canonical 顺序列出，未开始的阶段显示「未开始」灰徽章（不隐藏、不编造）。
- 运行期间当前阶段显示「执行中」，完成阶段变「完成」；run 侧栏与概览的核心阶段进度 `n/9` 只增不减（feedback/revise 不计入 9）。
- 事件流 tab：每 2 秒增量出现新事件（seq 递增、最新在前）；切到其他浏览器 tab（页面不可见）再回来 → 轮询暂停期间无请求，回前台后立即补一次拉取。
- 预期：任何时刻没有百分比进度条，只有运行时确知的阶段/子任务计数。

### 4. 取消 run
- 运行中点击「取消 run」→ 按钮短暂禁用（执行中…），run 状态变为「已取消」；事件流出现 run_cancelled 事件。
- 取消后：「取消 run」被禁用并注明原因（终态不可取消）；「恢复 run」保持可用。

### 5. 恢复 run
- 点击「恢复 run」→ run 回到运行态（`POST /api/v1/runs/:id/resume`），时间线中对应阶段的 attempt 编号 +1（从检查点续跑），事件流出现 run_resumed。
- 预期：恢复不是重跑假进度，而是从持久化 checkpoint 继续（attempt/事件可证）。

### 6. 证据 tab（来源/声明/关系）
- run 完成后打开「证据」：来源表含 标题/年份/深度/访问态/核验徽章（如 crossref_doi·resolved）/contentHash 前 12 位；行锚点 `#src-…`。
- 声明列表：每条声明带绑定状态徽章（verified / resolved_unaligned / …）、等宽 quote 引文块、「查看来源 #n」链接点击后滚动并高亮对应来源行。
- 关系汇总：supports/contradicts/… 计数 chips + 反证列表（含 claim 文本与来源标题）；无反证时显示「仅代表检索范围内未发现，不等于不存在」。
- 预期：数据与 API 返回一致；对照 CLI `far research inspect --evidence` 或报告 md 抽查 2-3 条一致。

### 7. 假设 tab
- 评分对照表固定显示声明「分数为可检查的决策辅助，非客观概率…」；每行展开可见维度分+rationale+producer/calibration。
- 代表假设卡片：statement/mechanism/前提（带 [kind] 标注）/预测；「证伪规格」可展开显示全部字段（观测/测量/判定规则/支持/弱化/证伪条件等）；completenessCheck 未通过时红徽章并列出缺失字段；testability/noveltyLabel 徽章；簇信息（簇 key + 簇内候选数）。

### 8. 计划 tab
- 全字段结构化渲染：目标/绑定假设/变量/对照/纳入排除/数据需求表（availability 徽章）/工具需求表/步骤（方法/输入输出/失败条件/依赖/成本）/指标/统计/四类判定规则/混杂/备择解释/资源/风险/伦理/前置/信息增益/备选分支/可复现性要求/引用声明。
- executabilityCheck 通过绿徽章 / 未通过红徽章+缺失项。

### 9. 反馈 → 修订（因果链）
- 概览 tab 底部「提交反馈」：内容留空提交 → 必填校验；选 source（如 human_expert）、填内容（可展开高级选项指定 targetKind/targetId）提交 → 「反馈已记录（201 Created）」。
- 打开「修订」tab：出现 反馈块 → 修订块（from→to 版本、因果说明、操作列表 before→after、质量变化徽章）→ 版本差异块（语义摘要、条目、剩余不确定性）的因果链；提交后尚未修订时如实显示「已记录反馈但尚无修订」。
- 概览的「恢复 run」在 completed+有反馈时变为可用（无反馈时禁用并注明「无待处理反馈」）。

### 10. 溯源与 bundle 验证 + 报告下载
- 溯源 tab：receipts 表（kind/执行模式 live·test 徽章/provider/model/延迟/哈希短码/时间），行可展开看 usage/查询/工具明细；非 live 存在时显示黄色警示横幅。
- Bundle 验证：输入 bundle id（D-060 起快填 chip 来自一等 API `GET /runs/:id/bundles`；旧服务器 404 时回退事件流扫描），点「验证」→ 渲染 verdict（verified/degraded/failed）+ 10 项检查逐项 PASS/FAIL 与详情；replay 级别另显示重放指引。
- 重新导出（D-060）：run 已结算且有 bundle 时出现「重新导出（含最新修订）」按钮；无新于 bundle 的修订时服务端诚实拒绝并显示原因；成功后 bundle chips 刷新出现新 id。
- 报告：点「下载报告 (.md)」下载 `<runId>.report.md`；「报告预览」展开原始 markdown；报告未生成（export 未完成）时显示阶段感知空态而非报错。

### 10b. 冻结可见性与证据行（D-060 新增）
- 冻结提示：run 显示「执行中」但 `leaseInfo.live=false` 时，概览出现黄色提示（服务器 watchdog 约一个轮询周期 ~30s 内自动领养续跑；也可手动恢复）——测试法：kill 执行进程后立即查看概览。
- 证据行前导符：证据 tab claims 列表与关系汇总出现认知状态字形 ✓（已验证/绿）✗（未解析/红）▲（对齐存疑/琥珀）–（缺失/灰）——这是界面中唯一饱和色出现处（§8.3「无彩色界面，彩色即证据」）。

## 附加状态纪律检查（建议纳入走查）
- 断连：停掉 API 进程 → 顶部出现红色「API 连接中断 — 自动重试中」横幅，轮询自动继续；重启 API → 横幅消失，数据恢复。不出现假成功。
- partial run：人为制造中途失败（如断网重试超限）→ 概览显示红色部分完成提示 + 失败阶段与错误原文，不渲染假完成态。
- 键盘可达：纯键盘完成 新建 run → 选中 run → Tab 切换（方向键）→ 展开证伪规格 → 提交反馈；焦点环始终可见。
- 主题：系统切深色模式 → 全部界面跟随（语义色对比度 ≥4.5:1）；`prefers-reduced-motion` 下骨架动画停用。
- i18n：切 English 后所有标签切换（领域内容如 statement/rationale 保持原文，不机翻）。

## 开发者自检记录（W3 交付前已执行，非替代主线 GUI 走查）
- `npx tsc -p web/tsconfig.json --noEmit` → exit 0；`cd web && npm run build` → exit 0（dist/index.html + assets 产出）。
- 仓库根 `npx vitest run` → 13 files / 186 tests 全绿（web 不影响根测试）。
- vite dev 冒烟：`/` 200（HTML 含 #root/main.tsx），`/api` 代理在无后端时 ECONNREFUSED（证明代理接线，UI 显示断连横幅）。
- 契约冒烟（TEST-ONLY smoke-server.mjs，真实 kernel + 种子数据）：全部 GET/POST 端点信封与前端归一层逐一比对通过（runs 摘要含 progress、plan:null、404/400 错误信封、report text/markdown、verify verdict=verified/10 checks）。
- 浏览器渲染自检（开发性，非正式走查）：首屏/概览/证据/溯源 tab 用真实种子数据渲染无运行时错误；取消按钮禁用注明原因、completed+有反馈时恢复可用；页面级无横向溢出；:focus-visible 样式生效。
