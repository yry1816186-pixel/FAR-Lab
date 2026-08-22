# Wave-8 痛点测量报告（远征前置门）

测量时间：2026-08-22（本会话）。方法：真实 `.far-run/far.db` 只读取证（`spikes/wave8-pain-measurement.mjs`）+ 生产代码（dist）上的确定性构造实验（`spikes/wave8-granularity-construction.mjs`、`spikes/wave8-signal-gap.mjs`）。零模型调用，全部命令级可复跑。

## 判定：痛点成立（3/3），远征继续

北极星 `run-reliability` 现值 "swept-manually" 与下述实证一致；`run-wall-clock` 实测 p50=8.4min（34 个完成 run，真实 DB），高于 target p50≤6min。

## P1 冻结 run：无自动检测、无自动恢复（北极星 run-reliability 直接负责）

- 51 个 run 中 17 个 partial（33% 未完成率）。其中 **3 个死于静默 worker kill**（无 stage_failed 事件 = 进程被 reap，非 stage 逻辑失败）：`run_aqbhgzjq`、`run_wbdtbwm0`、`run_z1d63k`（D-030 已记录其被 reap mid-rank）。
- **检测延迟实测**：zombie sweep 事件时间戳 − 最后生命信号 = **93 / 121 / 243 分钟**（人工执行 sweep 前的冻结时长）。
- **0/17 partial 曾被 resume**——全部工作弃置，由全新 run 重做。resume 语义在 `Orchestrator.execute` 已实现且测试在位（tests/orchestrator-attempt.test.ts），断裂点在**检测+重启动**：没有任何生产代码路径轮询 runs 表。唯一清扫工具是手动脚本 `zcode-harness/scripts/sweep-zombie-runs.mjs`（只标 partial，从不 resume）。
- 构造实验（granularity-construction.json）：worker 死后 DB 留下 `status=running + stage.state=running` —— 与真实库中 3 个静默受害者签名一致。

## P2 CLI 创建即返回 + 分离执行无人监护

- `far research start --json` 在创建即打印 runId（src/cli/main.ts:123），随后**同进程**继续执行（:125 await）。宿主（eval harness/后台任务）读到 runId 后被 reap → 子进程连带死亡 → P1。eval 侧已有手动补丁（eval/rediscovery.mjs waitForTerminal，D-029b 发现 4），但生产侧无 supervisor。
- 损失量化：3 个静默受害者死时已付出的 model-call receipts = **21 / 24 / 34 次**（真金白银的已完成工作弃置）。
- server 侧同样：api.ts create-and-poll + 进程内 fire-and-forget executor；server 进程死 = 同类冻结。**跨进程无单写者锁**（server 仅进程内 one-execution-per-run，api.ts:109）。

## P3 resume 粒度 = stage 级，stage 内零检查点

- checkpoint 单元 = run 行（stage 边界）。`StageRecord.checkpointRef`（src/domain/run.ts:31）**声明后全库无使用**；`subtasks {known,done,total}` 字段同样无人写入。
- 构造实验（evidence/W8/granularity-construction.json，生产 dist orchestrator）：10 子任务 stage 在第 6 个后 kill → 持久化子任务结果 **0**，resume 重做 **10/10**（60% 已完成工作丢失）。
- 真实尺度（34 完成 run 实测）：rank 17 calls/run、build_evidence 10、critique_falsify 8、generate_hypotheses 7。kill 在 rank 90% 处 = resume 重付全部 17 calls。

## 检测阈值设计输入（信号节律测量，evidence/W8/signal-gap.json）

- 34 完成 run、3157 个事件间隔：p50=1.2s、p95=28.6s、**p99=57.4s**、max=122.9min（人类跨会话暂停离群值）。
- 推论：纯 staleness 阈值无法区分"慢而活"与"死"（122min 离群）→ 需要**租约/心跳 + 幂等 resume + 单写者纪律**（正是远征对象框架的核心机制区）。

## 与既有裁决的关系

注册表 Temporal/DBOS 整框架 REJECT、LiteLLM REJECT 维持不变——本测量不构成翻案条件（自研状态机 stage 级持久化+事件审计已过对抗审计）。痛点指向的是**机制缺口**（自动检测/租约/子任务检查点/监督重启动），以最小改动内嵌，不引入框架。

## 量化准入线（Wave-8 野心阶梯）

- baseline：注入失败（kill/freeze）100% 在一个轮询周期内被检测并自动恢复；恢复成功率/恢复时间 ≥50% 改善（对照本报告 93-243min 人工检测 + 0% 自动恢复）。
- target：20-run soak 零冻结（含注入）。
- stretch：并行化 p50 ≤4.5min 且同 seed 同输出（现状 p50=8.4min）。
