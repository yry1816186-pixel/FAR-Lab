# FAR-Lab — 证据约束的科学假说生成与研究计划工作台

XH-202619 赛道一 · 方向 1 · A：科学假说生成与研究计划设计。输入一个真实科学问题，系统执行：真实文献检索（OpenAlex/arXiv/Crossref/EuropePMC，含强制反证搜索）→ 逐字绑定声明（对不上就降级，绝不编造）→ 多策略生成可证伪假设集 → 锦标赛排序（Bradley-Terry，含不确定性）→ 带阈值来源标注与多重检验纪律的可执行研究计划 → 因果反馈修订 → 可第三方独立核验的复现导出。

## 快速开始

```bash
npm install && npm run build

# 一条真实研究问题走完整管线（live 模型路由）
DEEPSEEK_API_KEY=... node dist/cli/main.js research start "你的科学问题" --domain oncology --goal exploratory

# 查看进度 / 导出 / 第三方核验
node dist/cli/main.js research runs
node dist/cli/main.js research export <run-id> --format bundle --out out/
node dist/cli/main.js verify <bundle-id>     # 独立复算，exit 0 = verified

# 本地 Web 工作台（React + HTTP API）
# API 服务器：src/server/api.ts 的 createApiServer(app)（tests/api.test.ts 覆盖 33 项契约）；
# 独立启动脚本属发布工程待办（如实：当前以编程方式装配，W3 GUI 实测见 evidence/W3/）。
```

模型路由 model-agnostic：`FARLAB_MODEL_PROVIDER` = `deepseek`（默认，strict function calling）| `dashscope`（阿里云百炼 Qwen，竞赛强制路由）| `zai`。各路由独立 env key，fail-closed。

## 质量与真实验证（不是宣称，是命令）

- `npm test` — 274/274（vitest）；`npm run typecheck`。
- `node zcode-harness/scripts/completion-gate.mjs` — 完成门禁（当前 NOT_READY：唯一失败项为外部 DeepSeek 余额阻塞，见下）。
- 证据目录 `evidence/`（每个能力对应真实 run 的命令级证据）；决策账本 `.control/DECISIONS.jsonl`（D-001..D-035）；评估 `eval/`（MLR-Bench 外部对比 / FIRE-Bench 复现评估 / LLM-judge）。

## 当前三项外部门（2026-08-22 实测）

1. **DeepSeek 账户余额耗尽**（HTTP 402）——阻塞全部 live 运行与判分；充值即恢复。
2. **DASHSCOPE_API_KEY 缺席**——竞赛强制“千问经百炼+凭证”路由待 live 验证（`node spikes/qwen-route-probe.mjs` 一命令出回执；提交截止 2026-09-05）。
3. **OPENALEX_API_KEY 可选**——不间断检索与全文（GROBID TEI）抓取。

## 文档地图

- 交付报告：`final_delivery.md`（R1 全量 + EV1→Wave-3 增补）
- 宪法与规范：`AGENTS.md`、`project-spec/`（ACCEPTANCE.md 等）
- 控制面：`.control/`（EXECUTION_STATE / FRONTIER_STATUS / BLOCKERS / DECISIONS）
- 技术注册表：`research/TECH_CANDIDATES.md`（KEEP/ADOPT/EXTRACT/REJECT 全记录）；Wave-3 决策馈送 `research/WAVE3-SCOUT.md`
- 模型目录快照：`research/reference/models-dev-catalog.json`（193 providers，MIT）

安全基线：secrets 永不入库/入日志；web 工作台 XSS 面已审计（`evidence/W-WEB/xss-surface-audit.md`）；不可信文献数据在 prompt 中带围栏。
