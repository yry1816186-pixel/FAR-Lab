# 08 · CLI 与 API：25 个命令逐个讲 + REST 接口

> 学习目标：掌握 `far` CLI 的 25 个命令（按生命周期分组）；理解退出码契约
> （0/1/2/7）；理解 REST API 的 16 个端点与前端的关系；知道 LLM 只出现在
> `ask`/`stream`/`repl` 三个交互命令里。
> 前置：02-07。产出：能用 CLI 完成一次"claim→verify"完整巡检。
> 权威参考：`far --help`（活文档）；`docs/cli-reference.md`（32 节详解）。

---

## 8.1 设计原则（先看全局）

1. **零凭据可用**：除 LLM 交互命令外，全部离线可用，不需要 API key。
2. **退出码是契约**：0 成功 / 1 运行错误 / 2 参数错误 / 7 验证失败或篡改。
   CI 和脚本依赖这些码做判断——这是"面向生产"的 CLI 设计。
3. **LLM 只在生成侧**：`ask`/`stream`/`repl` 生成假设；`verify`/`demo`/
   `status` 等裁决路径**永不碰 LLM**。
4. **fail-closed**：验证类命令遇到任何异常输入 → 非零退出，绝不假装成功。

## 8.2 25 个命令分组速查（实测 `far.ts`，2026-08-06）

### 环境与诊断
```
far version        版本 + git HEAD
far doctor         环境自检（Node/pnpm/Python/依赖/原生模块/离线fixture校验）
far status         单一 SSOT 状态报告（--db 校验链头）
```

### 核心验证链路
```
far fec            FEC 编译/冻结（把 claim 变成可执行测量计划）
far verify        验证 bundle / 证据链（--bundle 独立重算模式）
far verify-golden  14 golden vectors 过真实内核（--all 全跑）
far lifecycle     撤回/更正/取代生命周期（墓碑 append-only）
far replay        重放 agent 运行轨迹
far schedule      定期重验证（JSON 持久化 + 到期判定）
```

### 证据与证明包
```
far export         导出证明包（far-proof / receipt / receipt-v2 三种格式）
far audit-seed-cherry   反剧场展示：种子挑选攻击检测
far audit-multiseed     真实多种子审计（BLS + numpy）
far backup         SQLite VACUUM INTO 备份（拒绝备份损坏库）
```

### 交互与运行
```
far ask            LLM 生成假设（唯一需要 API key 的核心命令）
far stream         流式交互
far repl           REPL 交互
far fsm            六阶段 FSM 推进（--resume 崩溃恢复）
far c-astro        C-ASTRO-0001 在线 TESS 数据接线（lightkurve+MAST）
far real-paper     真实论文验证流程
```

### 演示与基准
```
far demo           一键演示（14 golden + 端到端 + 真实统计）
far demo tess-offline   聚焦 TESS 离线 verdict（诚实 UNTESTED）
far bench          Science-125 benchmark
far court          法庭式质询演示
far arena          多引擎对打演示
```

### 服务
```
far api            启动 REST API 服务（Fastify，优雅关停）
far init           初始化工作区
```

## 8.3 退出码契约（必记）

| 码 | 含义 | 典型场景 |
|---|---|---|
| 0 | 成功 / PASS | `far verify` clean |
| 1 | 运行错误 | 运行时异常、链校验失败 |
| 2 | 参数错误 | 未知子命令、非法参数 |
| 7 | FAIL / 篡改 / 协议偏离 | `far verify` tampered、FEC 编译 HARD_FAIL |

> 学习点：7 是故意选的"远离 0/1/2"的值，避免脚本把 FAIL 误判成普通错误。
> 这也让 `echo $?` 的判断在任何 shell 里都无歧义。

## 8.4 REST API（16 个 OpenAPI paths，实测 `/documentation/json`）

`far api` 启动 Fastify 服务（默认 :3000），前端通过 Vite 代理调用。

### 系统
```
GET /health          存活探针（Docker healthcheck 用）
GET /ready           就绪探针
GET /documentation/json   Swagger 文档（自动生成）
```

### 假设与裁决
```
POST /hypothesize    提交 claim → 触发六阶段 FSM 流水线
GET  /verdict        当前 verdict 列表
GET  /verdict/:id    单条 verdict 详情
GET  /verdict/by_hypothesis/:hypoId   按假设查 verdict
GET  /report/:runId  运行报告
GET  /report/:runId/paper  论文格式报告
```

### 证据与完整性
```
GET /evidence/:id             单条证据
GET /evidence/chain/:headHash 从链头回溯整条证据链
GET /integrity/root           Merkle 根
GET /integrity/proof/:seq     Merkle inclusion proof（单条证据的审计路径）
GET /integrity/receipt        收据完整性
```

### 收据（V2）
```
GET  /receipts                收据列表
GET  /receipts/:id            单张收据
GET  /receipts/:id/verify     独立验证一张收据
POST /receipts                创建收据
POST /receipts/verify         批量验证
GET  /receipts/demo           V2 演示收据
```

### 演示与基准
```
GET /benchmark         benchmark 列表
GET /court/demo        法庭演示数据
GET /arena/demo        竞技场演示数据
```

> 学习点：注意 `/integrity/proof/:seq` —— 它暴露 Merkle inclusion proof
> 的 HTTP 接口，意味着**前端可以在浏览器里逐条验证证据**（O(log n)），
> 不需要下载整条链。06 章学的 Merkle 树在这里变成 API。

## 8.5 动手练习

1. `node src/cli/far.ts doctor` —— 读每个检查项，解释为什么它重要。
2. `node src/cli/far.ts status --db <demo.db>` —— 先看无 db 的 pending 输出。
3. `node src/cli/far.ts verify-golden --all` —— 14 条全跑，对照 03 章。
4. 起 API：`node src/cli/far.ts api`（后台），`curl localhost:3000/health`，
   然后 `/verdict`、`/integrity/root`。停掉服务。
5. （进阶）`far fec --help` 看 FEC 子命令，然后 `far export receipt-v2`
   对比三种导出格式。
6. （进阶）写一个 5 行 shell 脚本：`far verify .far-proof; [ $? -eq 0 ] && echo CLEAN || echo FAIL`。

## 自测

- [ ] 能默写退出码 0/1/2/7 的含义
- [ ] 能说出哪个命令需要 API key（ask）以及为什么只有它需要
- [ ] 能说出 3 个以上"LLM 永不参与"的命令
- [ ] 知道 /integrity/proof/:seq 是干嘛的（Merkle inclusion proof）
- [ ] 能说出 `far export` 的三种格式

→ 下一步：[09 前端可视化](09_FRONTEND.md) —— 15 个页面的数据流。
