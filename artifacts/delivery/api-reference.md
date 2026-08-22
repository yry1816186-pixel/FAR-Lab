# FAR-Lab HTTP API 参考（/api/v1）

> 与 `src/server/api.ts` 路由表逐一对账（2026-08-22，D-067 时点；契约测试 `tests/api.test.ts`）。本 API 同时是 CLI 与 Web/桌面三表面的共同底座——**语义与 CLI 完全一致**（api.ts 头注：CLI 是行为参照）。

## 通用约定

- **传输**：本地单用户；仅 loopback（Host/Origin 双检查，跨源/DNS-rebinding 拒绝 400——安全边界是有意设计）。
- **变更动词带请求体时必须 `Content-Type: application/json`**（CSRF 防线）；请求体上限 1MB（超限 400，连接排空后回包）。
- **错误信封**（一切非 2xx）：`{ "error": { "code", "message", "retryable", "runId?" } }`；`code ∈ not_found | validation | already_running | internal`。
- **长任务模型**：create-and-poll——POST 立即 202，进度经 `GET /runs/:id`（真实阶段/子任务计数，**无发明百分比**）与事件流观察。
- **可靠性**：同 run 同时仅一个执行者（跨进程租约）；服务器 watchdog 在约 30s 轮询周期内自动领养"running 但租约过期"的冻结 run（resume 语义续跑，事件记 `watchdog_adoption`）。

## 端点

### 运行生命周期

| 方法与路径 | 说明 | 请求/响应要点 |
|---|---|---|
| `POST /runs` | 创建并异步执行 | 体 `{text, domain?, goalType?}`（goalType ∈ explanatory/predictive/interventional/methodological/exploratory）→ 202 `{runId}`；text 空/domain 空/goalType 非法 → 400 |
| `GET /runs` | 列表摘要 | `{runs:[{id,status,currentStage,createdAt,lastError?,progress?{done,total}}]}`；progress 仅运行时确知时出现 |
| `GET /runs/:id` | 详情（含 stages 数组） | 附加投影 `leaseInfo{holder,expiresAt,live}`（D-060：running+live=false 即冻结信号）；未知 run 404 |
| `POST /runs/:id/cancel` | 请求取消（阶段间生效） | 202 `{requested:true}`；无可取消项时诚实返回 `{requested:false, reason}` 而非报错 |
| `POST /runs/:id/resume` | 恢复/续跑（阶段边界跳过已完成） | 202 `{runId}`；已在执行 → 409 already_running |

### 检视（全部 GET，404 先于任何读取）

| 路径 | 说明 |
|---|---|
| `/runs/:id/events?afterSeq=N` | append-only 事件流增量（seq 游标；type 含 stage_*/run_*/feedback_received/revision_created/receipt_recorded/note） |
| `/runs/:id/question` | 结构化研究问题（scope/constraints/goalType） |
| `/runs/:id/sources` | 来源文档（深度/访问态/解析态/核验态/内容哈希） |
| `/runs/:id/evidence` | `{claims, relations}`；claim 绑定四态 + 逐字 locator；relation 11 类带极性 |
| `/runs/:id/hypotheses` | `{hypotheses, scorecards, tournament}`（D-016 锦标赛含 matches+standings+uncertainty） |
| `/runs/:id/plan` | `{plan \| null}`——未生成时 null 是诚实空非错误 |
| `/runs/:id/revisions` | `{feedbacks, revisions, versionDiffs}` 因果修订链 |
| `/runs/:id/receipts` | 全链回执（model_call/source_retrieval/tool_exec…；usage/延迟/输入输出哈希） |
| `/runs/:id/report` | 报告 markdown 文本（text/markdown；JSON 信封不冒充报告——前端显式拒绝） |
| `/runs/:id/bundles` | **D-060 新增**：一等 bundle 发现 `[{id,createdAt,evidenceLevel}]`（替代事件正则扫描） |
| `/runs/:id/corpus` | **D-060 新增**：检索透明——`{corpus \| null}`：执行过的查询计划（purpose 含 counter_evidence×2）/familyFailures/融合统计 |

### 反馈、导出与核验

| 方法与路径 | 说明 |
|---|---|
| `POST /runs/:id/feedback` | 体 `{source, content, targetKind?, targetId?}`；source 九选一；target 可选但**存在性 fail-closed**（五种目标类型指向不存在的对象 → 400，含 evidence_relation——D-060 修复）→ 201 `{feedbackId}`；触发 revise 的是下一次 resume |
| `POST /runs/:id/reexport` | 修订新于最新 bundle 时重跑 export；三重诚实守卫：执行中 409 / 无 bundle 400 / 无新修订 400 → 202 |
| `GET /verify/:bundleId` | **第三方核验**：10 项检查逐项真实执行（不可执行按 FAIL 计）→ 200 `{verdict: verified\|degraded\|failed, checks[10], failedChecks, replayGuidance?}`；bundle 不存在时同样出报告（verdict=failed）而非 404——报告即答案 |

### 运维

| 方法与路径 | 说明 |
|---|---|
| `GET /health` | **D-060 新增**：`{status:ok, db:'ok', providers:[{name,kind,liveReady}], gitCommit, time}`；DB 不可读 → 503 `{status:'degraded'}`；**密钥值永不出现**（仅布尔 liveReady，测试含泄漏扫描） |

### 静态前端

非 `/api` GET/HEAD → 服务 `web/dist`（存在时，SPA 回退 index.html）；未构建时根路径返回诚实提示 `{frontend:{built:false,…}}` 而非假装。

## CLI ↔ API 对应（同一内核）

`far runs|verify|research start/status/inspect/cancel/resume/export/feedback`（`--json` 全命令）与上述端点语义一致；`far probe [--live]`（路由健康三态）、`far data info`（数据足迹）为 CLI 本地能力。
