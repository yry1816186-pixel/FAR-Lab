# Wave-8 融合验证总档 — 编排/持久化机制内嵌（D-054）

日期 2026-08-22 · 全部命令级证据 · 零新服务、零新依赖（zod-only 不变量未动，node:sqlite 已在位）。

## 0. 结论（TLDR）

| 痛点 | 融合前（实测） | 融合后（实测） | 证据 |
|---|---|---|---|
| P1 冻结 run 检测+恢复 | 93/121/243 分钟人工 sweep；0/17 自动恢复 | **kill→采纳 5033-5060ms**（TTL 5s + 轮询粒度内 = 一个轮询周期）；**20/20 soak 零冻结** | §3 fault-injection.json |
| P2 跨进程双执行 | CLI 与 server 可同时 execute 同一 run（api.ts 仅进程内 Map） | 租约条件获取拒绝第二执行者（RunLeaseHeldError）；被夺取者下次 transition 前中止**且不写 run 状态**（RunLeaseLostError → note 事件） | §2 测试 |
| P3 resume 粒度 | 构造实验 10 子任务 kill@6 → resume 重做 10/10（60% 完成工作丢失） | **每种 kill 位置（2-11 全域×2）重做恒 ≤1 个在飞子任务**（exec=13/12+1）；rank 评分批+对局、hypotheses 策略调用逐个幂等落库 | §2+§3 |

北极星 run-reliability：baseline（注入失败 100% 一个轮询周期内恢复）✅ + stretch（20-run soak 零冻结）✅。run-wall-clock：未并行化（stretch 条件性，如实未启动；live 测量被 D-036 阻塞）——无回退。

## 1. 落地机制（源码级抽取自 9 仓远征，SCOUT S1/S2）

**S2 step_outputs（dbos operation_outputs OAOO + langgraph put_writes 幂等纪律）**
- 迁移 v2：`step_outputs(run_id, stage, step_key, json, created_at, PK(run_id,stage,step_key))` + `step_fingerprints(run_id, stage, fingerprint, PK)`（src/persistence/db.ts）
- Store：`getStepOutput/putStepOutput/countStepOutputs` + `getStepFingerprint/putStepFingerprint/clearStepOutputs`；put 时发 `checkpoint_saved` 事件（RunEvent 枚举既有类型首次启用）
- StageContext 新增 `checkpointed(stage,key,inputsFingerprint,fn)` memoization 助手（src/app/orchestrator.ts makeContext）——先做**输入指纹门**（指纹变化→整 stage step_outputs 失效+note 事件审计，Wave-5 审计 P3 缺陷的修复：升级后 resume 不重放过期缓存），再查表命中返回，未命中执行+落库+续租
- 采纳：rank 评分批（key=`score-batch:<首hypId>`，fp=targets+claims+指令哈希）、rank 锦标赛对局（key=`pair:<aId>:<bId>`，fp=question+cards+判定 prompt 哈希；仅缓存成功判定）、generate_hypotheses 策略（key=`strategy:<name>`，fp=question+claims+relations 哈希，依赖链按序重放确定性成立）
- **KEEP**：critique_falsify / build_evidence 已有域状态重入幂等（per-hyp/per-doc 落库），不为统一而重写
- key 纪律（dbos 教训）：稳定领域 id 而非循环计数——天然兼容未来并行化
- `StageRecord.checkpointRef`（原零使用字段）在 stage done 时激活为 `step_outputs:<N>` 可见指针

**S1 租约/心跳/watchdog（dbos recoverPendingWorkflows + temporal sticky-lease/heartbeat + 心跳搭便车）**
- 迁移 v2：runs 行级列 `lease_holder/lease_expires_at`（行级而非 doc JSON，便于 SQL 扫描；ResearchRun zod schema 不动）
- `acquireLease` 条件 UPDATE（过期可回收=冻结恢复路径；同 holder 可重入）；`renewLease/releaseLease/listExpiredLeaseRuns`
- execute() 先取租约再动状态；**每次持久化写（transition/receipt/step checkpoint）同事务续租**（心跳搭便车，零定时器零写放大）；终态释放
- TTL=120s 默认（实测合法信号间隔 p99=57.4s，安全余量>2×）；`FARLAB_LEASE_TTL_MS` 运维旋钮（下限 5s，故障注入/紧 SLA 用）
- 断权 fencing：transition 前校验 holder；丢失 → RunLeaseLostError → **不写 run 状态**只记 note 事件（采纳者拥有状态权）
- server watchdog 内嵌（src/server/api.ts）：轮询 `listExpiredLeaseRuns` → note 事件 + 接管 execute（resume 语义跳过 done stage + 已存子任务）；内存退避（≥10×interval）防快失败热循环；`watchdogIntervalMs` 选项（默认 30s，0=关）
- CLI：`far research status` 显示真实租约状态（含 `[FROZEN — resume to recover]`）；冻结 run 直接 `far research resume`（过期租约自动回收）
- zombie sweep 脚本保留为全灭场景兜底（watchdog 需有活进程）

## 2. 测试证据（tests/wave8-durability.test.ts，13/13 绿）

关键判别用例：
- KILL-AND-RESUME：10 子任务 kill@7 → 持久化 6、resume 仅执行 7-10（executions=11=10+1）✅
- 双执行拒绝：他进程活租约下 execute → RunLeaseHeldError ✅
- 断权中止：租约被夺后 worker 完成悬挂 stage → status 仍 'running'（未被污染）+ lease_lost_abort note×1 ✅
- 完成释放租约 / 心跳续租 / 冻结签名只含 status=running+过期租约 / 过期租约 CLI resume 直恢复 ✅
- watchdog：40ms 周期 200ms 内采纳冻结 run+note 事件；**活租约不采纳**（慢 worker 保护）✅

**Mutation 抽查（判别力证明，注入缺陷→红→还原→绿）**：
- M1 破坏缓存读（checkpointed 恒执行 fn）→ KILL-AND-RESUME 红 ✅→还原绿 ✅
- M2 破坏租约独占（acquireLease 恒过）→ 双执行拒绝红 ✅→还原绿 12/12 ✅
- M3 破坏指纹门（不匹配不清缓存）→ INPUTS-FINGERPRINT GATE 红 ✅→还原绿 13/13 ✅
（M2 首次假阳性系 sed 未命中+变异体语法错误两轮 harness 失误，修正后以 python 确认变异落盘再测——如实记录）

**Wave-5 审计 P3 缺陷（跨会话移交）已修复**：checkpoint key 原未绑定 payload，升级后 resume 会重放过期缓存——新增 step_fingerprints 输入指纹门（dbos application_version 门控的内嵌形态），M3 证明判别力。指纹门落地后 soak 复跑 20/20 依旧全过。

## 3. 真进程故障注入 + 20-run soak（evidence/W8/fault-injection.json）

- 载体：spikes/wave8-fi-driver.mjs（真 dist orchestrator 子进程；worker 模式 kill@K 硬退出 86，watchdog 模式跨进程轮询接管）+ spikes/wave8-fault-injection.mjs（父进程编排）
- 配置：TTL=5s（env 旋钮）、poll=1s、12 子任务/轮、kill 点 2-11 全域每点×2
- 结果（exit 0）：**20/20 PASS**——终态全 completed、零冻结；kill→采纳 5033/5043/5060 ms（min/median/max）；跨进程子任务执行数恒 13=12+1（仅重做在飞 1 个）；step_outputs 与无 kill 基线**逐字节一致**×20（同输入同输出）

## 4. 诚实披露

1. **全量套件 3 失败位于并行会话车道**（pipeline-hypotheses W5-F5 falsify 重标注 ×1、sources-fulltext W6/F5 引用剥离 ×2）：本会话未触碰 falsify.ts/fulltext.ts；同一批 W8 改动在 11:25 全量跑 446/446 全绿，失败由并行会话 11:25 后落盘的改动引入——归其会话修复，本 Wave 文件全绿（469 passed 中含 W8 12/12）。
2. resume 路由的跨进程租约冲突在 HTTP 层表现为 202+stderr 日志（run 状态不被污染）；CLI 直连路径显式抛错。未做异步 409（改 202 契约超本 Wave 范围）。
3. stage 内 handler 自发的 putObject（如 falsify per-hyp）不在 fencing 校验点内——断权竞态窗口内可能重复写域对象（与融合前行为一致，严格更优；fencing 覆盖 orchestrator 全部写点）。
4. 20-run soak 用确定性 stub 子任务（离线，D-036 模型路由阻塞下唯一可执行口径）；live run 级 soak 留待路由恢复，反转触发已记录。
5. claude-flow 抽取部分（crates/v3 symlink 不可解压）无持久化原语——REJECT 记录在案。

## 5. 复跑命令

```
npx vitest run tests/wave8-durability.test.ts   # 15/15
node spikes/wave8-fault-injection.mjs            # 20/20, exit 0
node spikes/wave8-pain-measurement.mjs           # 融合前基线取证
node spikes/wave8-signal-gap.mjs                 # TTL 设计输入
```

## 6. 对抗审计（独立子 Agent，2026-08-2２）与修复闭环

审计范围：W8 全部 11 个改动文件 + 证据 JSON 交叉复算 + 生产库只读核验。判定：主张 1/2/5 SUPPORTED；主张 3/4 原仅在合成 harness 上成立（被 P0-1 在真实 rank stage 击破）→ 修复后成立。

| 级别 | 发现 | 修复 |
|---|---|---|
| P0-1 | rank 双指纹族（scoring/pairs）共用 (run,stage) 一行——每次运行互清除+伪 step_checkpoint_invalidated 审计事件+锦标赛中断恢复全 stage 重做 | step_outputs/step_fingerprints 增加 family 列（迁移 v3，两表生产 0 行安全重建 PK）；失效只清本 family；回归测试 FAMILY-INDEPENDENCE + mutation M4 红→绿 |
| P1-1 | 指纹覆盖不全：scoring 只哈希 id 不哈希假设内容/systemPrompt；strategy 漏 def.instruction/DIVERSITY_DISCIPLINE；BATCH_SIZE 改版会脏命中 | scoring 指纹=完整投影+prompt+批次划分；strategy 指纹补 instruction 常量；pair 指纹本已全覆盖（审计确认） |
| P1-2 | TTL 120s 尾部余量为零（provider 层总重试预算即 120s，receipt 在链路完成后才记） | 默认 TTL→240s（=2× 单链最坏合法间隙 + >4× 实测 p99）；注释如实记录推导 |
| P1-3 | 断权 worker 的 handler 内 putObject 无 fencing → 双 scorecard 矛盾输出（已披露但被低估） | makeContext 增加 disowned()；assertNotCancelled 升级为 fencing 检查点（falsify/evidence/rank/hypotheses 循环既有调用点零改动获得保护）；orchestrator catch 识别 'run lease lost' 前缀走不写状态中止 |
| P2-1 | migrate() 事务外读 user_version，双进程并发首开撞 duplicate column | 事务内（BEGIN IMMEDIATE 后）重查 user_version |
| P2-2 | watchdog sweep 无 try/catch，SQLITE_BUSY 可击穿 server 进程 | sweep 整体 try/catch + stderr 日志，下周期重试 |
| P2-3 | 心跳续租无判别测试（probeLease 空转） | 新增 HEARTBEAT RENEWAL 测试：两次持久化写的 lease expiresAt 严格递增断言（删 renewLease 即红） |
| P2-4 | cancel() 整文档读改写与 owner transition 竞态（丢失更新可复活 done stage） | Store.requestCancel 用 json_set 单语句原子置位 |
| P2-5/6 | lastAdoptedAt 无界（以 DB run 数为界，记录不修）；同进程重入仅 server executing map 防护（产品路径已覆盖，记录披露） | 记录为已知边界 |
| P2-7 | 证据卫生：采纳延迟数字过期/命名（watchdog 启动起算）、12/12 vs 13/13 不一致、"条件 UPDATE"描述不准（实为 BEGIN IMMEDIATE 内 SELECT+UPDATE）、"同事务续租"描述不准（piggyback 语句）、harness readOnly 注释错误、getStepOutput 无 zod 校验+null 值不缓存 | 全部修正；null 不缓存记录为已知边界（当前所有 fn 返回值均为对象，非空） |

修复后验证：W8 测试 15/15、mutation M1-M4 全部红→绿、soak 20/20 复跑通过、生产库副本 v1→v3 迁移无损。审计原文由审计 Agent 返回主 Agent（未写仓库），本表为其结论+修复对照。

