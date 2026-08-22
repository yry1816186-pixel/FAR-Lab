# B12 能力管理面差距盘点（R6-pre，只读分析）

- 日期 2026-08-22；基线 commits：b173216（D-096 模型路由）+ 8024565（D-097 agent kernel，含 mcp.ts）+ ec27eca（HEAD）
- 对照承诺：`.planning/PLAN-product-experience.md:37`（B12：路由管理器健康/延迟/用途/默认策略/探针 + 检索族/实验适配器注册表 + 配置健康检查；MCP 先 OSS 尽调再决策）；`.planning/PLAN-reuse-adoption.md:81-83`（R6：对照 D-096 盘点剩余）
- 方法：全量读 api.ts 路由与 model-config 处理器、SettingsPanel/NewRunForm、cli probe、sources 注册表；grep mcp 全仓；`curl http://127.0.0.1:3196/api/v1/health` 实测（exit 0，见下）

## 表1 已有能力

| 面 | 证据 (file:line) | 覆盖度 |
|---|---|---|
| 模型路由 REST 全 CRUD | src/server/api.ts:1072-1087（GET/POST /api/v1/model-configs、GET/PUT/DELETE /:id、PUT /active、POST /:id/test）；实现 784-960 | create(842)/update(860,缺 apiKey=保留旧钥)/delete(886,删活动默认自动清空)/setActive(898,id 或 null)——全有 |
| 路由探针（服务端） | api.ts:919-960 testModelConfig：一次 maxTokens=16 真调用，返回 ok/latencyMs/error；支持已存 configId 或未保存 draft | 延迟+健康已有；secrets 不出服务器（modelConfigSummary 805-817 仅回 mask） |
| Settings 面板（web） | web/src/components/SettingsPanel.tsx:37-316：列表/新建/编辑/删除(两步确认 201-216)/设默认(186)/逐项测试+延迟徽章(117-126,194)/draft 先测后存(286-299)/5 预设(29-35)/env 默认展示(152-158)/无钥徽章(171) | 管理操作齐备；挂接 App.tsx:504 + 头部按钮 390 + 命令面板 283 |
| run 级路由选择 | api.ts:503-512 校验 providerConfigId；src/domain/run.ts:70-74 存储；解析链 run>active>env；NewRunForm.tsx:246-261 高级选项内路由选择器（env 默认+自定义） | 已有 |
| `far probe` | src/cli/main.ts:181-231：config 模式不触网（test-only/missing-key/key-present）；--live 每路由一次最小调用（ready/blocked/unreachable+http+原因）；坏路由 exit 1 | **只遍历 listProviders() 内置路由**（zai/dashscope/deepseek-归档/test-stub），不含 mcfg_* 自定义路由 |
| GET /health | api.ts:583-606：db 实测 503、watchdog、gitCommit、providers[]{name,kind,liveReady}（仅 env 在场判断，无主动探网） | 实测：curl 127.0.0.1:3196 → `{"status":"ok",...,"providers":[zai live true, dashscope false, deepseek archived, test-stub test]}`；**providers[] 不含自定义路由** |
| web 健康条 | web/src/hooks/useHealth.ts:33-46（30s 慢轮询、fail-visible）；WelcomeView.tsx:44-49 渲染 "N/M routes ready" | 仅统计内置 live 路由 |
| 检索族注册表 | src/sources/index.ts:33-47 SOURCE_FAMILIES=['openalex','arxiv','crossref'] + 工厂 49-56 | 纯代码常量；grep api.ts/web 无任何 list/configure/health 面（预期确认：无） |
| 实验适配器 | src/experiment/*.ts（gateway/executor/scheduler…）；CLI `far experiment` run/enqueue/worker/status/cancel/logs（src/cli/experiment.ts:95-228）；web 只读投影 /runs/:id/experiments（api.ts:1034-1043） | 运维 CLI 有；无注册表/配置/健康面（预期确认：无） |
| 语言/主题设置 | 不在 Settings 面板；命令面板项 web/src/App.tsx:289-302（theme cycle / lang toggle） | 已由别处满足，非缺口 |
| MCP | src/agent/mcp.ts:40,169（McpStdioClient+mcpToolAdapter，D-097）；唯一引用方 tests/agent-mcp.test.ts:5 | 休眠库+测试，零生产接线、零配置/管理面；无 OSS 尽调记录（research/ 仅 RESEARCH_BASELINE.md:25 提及协议域） |

## 表2 缺口清单（按价值排序）

| # | 差距 | 用户价值 | 实现面 | 规模 | 建议批位 |
|---|---|---|---|---|---|
| G1 | 探测面碎片化：health providers[] 与 `far probe` 只看内置 env 路由；当活动默认是自定义 mcfg 时，健康条显示的是内置路由就绪度（可能误导） | 高——B12 核心承诺"健康/探针"；用户主用自定义路由时状态条失真 | server: api.ts:583 health() 增加 activeRoute 投影（label/modelId/keySet，语义=钥在场，不主动探网，与 D-060 一致）；web: useHealth.ts:33 投影优先 activeRoute；CLI: main.ts:181 probe 遍历 model_config（--live 复用 testModelConfig 的 provider 调用） | S（≤0.5 天） | **B12 本批** |
| G2 | 路由"用途"展示缺失：run.providerConfigId 已存（domain/run.ts:74）但 run 详情不显示该 run 用了哪条路由；Settings 无使用计数 | 中——科学溯源已由 receipts 覆盖（ProvenanceTab.tsx:38-54 模型+延迟），路由级只是产品便利 | web: RunDetail Overview 增一行 label；api 无需改（run 对象已含字段） | S | B14 打磨（非 B12 阻塞） |
| G3 | 检索族/实验适配器注册表面（B12 字面承诺） | 低——族是编译期常量且只有 3 个，用户无法增删；做成注册表 UI=常量回显 | — | — | **不做**：无动态加载机制，UI 面只是回显代码常量，属装饰性面板（同 MCP 的 UI-truth 问题）；如未来族可配置再立项 |
| G4 | MCP 管理面 | 无——mcp.ts 是休眠库（仅测试引用），无真实 MCP 子系统可管 | — | — | **不做（记台账）**：管理面=空壳违反 UI-truth；B12 原文即"MCP 先 OSS 尽调再决策"，尽调未做且 agent 内核未接线——待真实接线需求出现再按 farlab-control-plane:integration-fusion 评估 |

## 裁决建议

- **B12 本批做 G1（唯一 ≤1 天等值且补齐承诺核心的项）**：health/probe 覆盖活动自定义路由。注意语义红线：liveReady 保持"钥在场"推断，不做环境自动探网（与 api.ts:583 注释及 probe 的显式 --live 设计一致）。
- G2 记 B14；G3/G4 记不做台账（理由见表2）。B12 其余字面承诺（CRUD/默认策略/探针触发/延迟/secrets 遮蔽/配置健康）已由 D-096 交付，无返工项。

## 探针触发面（far probe --live ↔ Settings 按钮接线点）

- 面板按钮 → `POST /api/v1/model-configs/test`（api.ts:919；SettingsPanel.tsx:80-85 runTest，逐项 194、draft 286-299）——**此接线已存在**，无需新 endpoint。
- CLI 侧：`far probe [name] --live`（main.ts:181）走内置 providers 的裸 fetch；如需统一，可在 probe 内对 model_config 复用 `createCustomProvider(cfg).structuredCall` ping（api.ts:947-956 同款），而非复制 wire 分支。
- 剩余差距不是"按钮缺失"而是**聚合缺失**：health 条与 probe 不遍历 mcfg（=G1）。
