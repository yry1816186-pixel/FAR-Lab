# @far-lab/tui

FAR-Lab 终端研究工作台（v3：实时研究观察 + 常驻研究对话 + 审批卡）。

```
cd packages/tui && npm install
npm start            # node --experimental-strip-types src/main.ts
npm test             # node:test 确定性测试 42 用例（纯核心 + 渲染 + 离线 e2e）
FAR_URL=http://127.0.0.1:3196/api/v1  # 默认（本地服务端）
```

## 双工作区（Tab 或 1/2 切换）

### 研究
- 列表（↑↓/jk·Enter·q）+ 阶段叙事详情（与 Web 时间线同语义：✓✗● + 中文阶段名 + 真实 pipeline 摘要）
- **实时模式**：详情视图附着服务端 SSE 事件流（`GET /runs/:id/events/stream`），
  阶段状态实时重绘；断线自动重连（指数退避封顶 8s）并以 Last-Event-ID/afterSeq
  游标续接，连接状态如实显示（连接中/实时/重连中）
- 研究控制（确认后执行）：`c` 取消 · `r` 从检查点恢复 · `f` 分叉（另一方向）
- 对象检视：`h` 假设 · `e` 证据主张 · `l` 谱系（修订链/反证边计数） · `x` 导出报告
  （写出至 `./far-tui-exports/<runId>.report.md`）

### 对话（常驻研究 agent）
- 对话列表 + 新建（`n`）；打开后进入聊天视图——消息走**真实对话通道**（与 Web 相同，
  模型线路由服务端解析；失败如实显示 replyError 横幅且消息保留）
- 回合渲染：角色标签 / 工具轨迹条（工具名+成败+时长，不含负载）/ 用量条
  （provider·model·latency·tokens·模型/工具调用数）/ 候选研究问题
- **审批卡**：`launch_research` / `create_automation` / `cancel_automation` /
  `create_tool_integration` 提案 → 待审批时 y 批准 · a 批准并记住此类 · n 拒绝
  （Aider io.py 词汇表血统）；卡上风险级别与参数摘要是**服务端计算**的
  （RU-3 T6，不信模型自述）
- `l` 凝结研究问题并启动：与问题 composer 同纪律——**就绪即止**，
  真实启动由 FAR_ALLOW_LIVE=1 门控（2026-08-23 no-live-API 指令）
- 待审批期间 y/a/n 归审批，写消息用 `m`

### 会话恢复与命令
- 客户端状态持久化（`~/.far-lab/tui-state.json`，FARLAB_TUI_STATE 可覆盖）：
  记住上次视图与对话，启动时自动恢复上次对话（损坏/缺失→静默回列表，绝不致命）
- `/` 进入命令行：`/refresh` `/open <run_|conv_ id>` `/new [标题]` `/back` `/quit` `/help`

## 行式降级（mintty/Git Bash/管道 stdin）
同一 HTTP 面的编号菜单：研究实时观察（2s 轮询至终态）+ 取消/恢复/分叉；
对话浏览、发消息、逐条审批。raw-mode 探测失败自动进入（Scout B 结论，架构要求非装饰）。

## Composer（全屏/行式双实现）
多行输入（Ctrl+J 换行——终端无法传 Shift+Enter）；bracketed-paste 原文插入
（粘贴永不解析为命令键，Codex paste-burst 语义）；CJK IME 多字符负载按文本插入；
确认走审批词汇表（y/n/q）。问题 composer 就绪即止（FAR_ALLOW_LIVE 门控）。

## 隔离与纪律
- 独立 package.json + lockfile；主产品 far 依赖面零改动（zod-only 不变）

## 远程/无头使用模型（R2-03，均经真实代码核验）
服务端事实（非本包所有，引用自 src/server/api.ts F-1 守卫 + 默认绑定）：
默认绑定 127.0.0.1，且 Host/Origin 头校验只放行 loopback 来源（防 DNS rebinding）——
本产品是**本地单用户**工具，没有跨网认证面，这是边界而非缺陷。

三种安全形态（全部保持"服务端只见 loopback 连接"）：
1. **SSH 上的 TUI（推荐）**：`ssh <host>` 后在远端直接 `far-tui`（FAR_URL 默认该机
   loopback）。终端即传输层；数据目录归属 = 该 OS 用户。
2. **SSH 隧道 + 本地 TUI/浏览器**：`ssh -L 3196:127.0.0.1:3196 <host>`（服务端
   `far serve` 或 `node scripts/serve.mjs`），本地 `FAR_URL=http://127.0.0.1:3196/api/v1`
   的 TUI 或浏览器打开 `http://localhost:3196`。隧道出口仍是 loopback，F-1 不被绕过。
3. **无头服务器 + 浏览器**：同上隧道形态的 Web 工作台；无图形界面的服务器用
   `far serve` + CLI 完整降级。

会话恢复语义：TUI 附着的 SSE 流断线后按游标续接（Last-Event-ID/afterSeq）；
run 执行体（lease）过期即"冻结"，TUI 详情以 [已冻结] 如实标注并用 `r` 恢复。
把 API 暴露给 loopback 之外（含反向代理）需要认证层——属 lane 12/13 域，
以 handoff 提出，本包不自行扩大攻击面。

## 验证状态
- 离线 e2e（真实 createApiServer + 脚本化 stub provider，零网络零密钥）：
  SSE 增量投递/关闭后静默/游标续接只送新事件；对话发消息→agent 回复；
  审批卡带服务端风险级别与参数摘要→批准后 executed 且产出 run_；脚本化
  provider 失败→研究者消息保留 + replyError；cancel 的诚实契约
- 纯核心 node:test：SSE 分帧解析（任意切点重组/CR/注释/多行 data）、退避策略、
  增量阶段合并与全量推导等价、提案词汇表、状态文件往返/损坏回退、斜杠命令
- 渲染（ink-testing-library 无 TTY）：v2 五项全保留 + v3 十项（对话 tab/聊天
  视图/审批三键/真实发送/FAR_ALLOW_LIVE 门控/实时详情事件更新/取消分叉确认流/
  子视图/Esc 分层/静态注入无订阅）
- 已知外部缺陷（非本包）：无材料对话批准 launch_research 必失败（seeds:[] 违反
  1-50 下限）——已记 handoff r2-2026-08-24-from-03-to-08-seedless-launch-research
- 仅 raw-mode 交互手感（延迟/焦点）留真实终端（与 v2 相同的诚实边界）
