# PROGRESS — AVO×NOOA Deep Fusion (/goal)

## 当前状态
[STATE: EXECUTE-S8] Supervisor (G2) + Lineage (G3) 已落地并集成 pass 边界，commit cd98ec0。全量 1248 passed/2 skipped/107 files 绿。

## 提交链
- 35f9cd0: 源核验 + 差距分析 (research/avo-nooa/{01,02})
- 88172c4: Route A sidecar spike 4/4 PASS + Route 裁决 (03-route-verdict.md)
- cd98ec0: supervisor.ts + lineage.ts + orchestrator 接线, 18 个新测试

## S8 剩余
- ~~evaluator 家族显式化 (G8)~~ DONE 917f5ed (5 evaluators + /evaluations API)
- ~~exploratory CodeAct 执行接线~~ DONE 35c99a1 (run_exploration op + runExploration 编排器, 4 真实 sidecar 测试)
- ~~pass-by-reference / event query API (G5/G6)~~ DONE d64f2a1 (queryRunEvents + previewFor, 7 测试)

## 门禁证据 (2026-08-24 03:17 → 本轮, 最新)
- vitest 全量: **1300 passed / 3 skipped** (117 files; sibling 新增文件含 skip)
- tsc --noEmit GREEN; npm run build GREEN; eslint 全仓 GREEN
- secret-scan PASS · path-hygiene 0 errors · completion-gate PASS


## S10a 状态 (2026-08-24 04:1x)
- 离线可行性 DONE a70265b: 真实 sidecar 全链路 (gate->sandbox->artifact->receipt->event) 本环境验证通过
- offline benchmark 8aba4bb: 2 个真实 workload, 行动分歧复现, plan_next_action <2ms
- live-LLM 对比矩阵: BLOCKED-live (zai 周限额至 08-29 10:03; 无其他可用路由, 已穷尽实测)
- adversarial review: 待 web 投影完成后与 S10b 一并执行 (Santa 双审查)


## 本轮新增 (04:2x-04:4x, 与 sibling 安全 lane 并行)
- 5772dec: web ResearchStatePanel (G2/G3/G8 三投影进 research tab), web build 绿
- f489e78: far research fork CLI (RU-2 分支写入面), 真实 fork 验证 + lineage 立现 revision chain
- sibling 落地(非本 lane): dunder-escape 封禁/T3/T4 安全层/forkRun+PROV-O/ACC-39..41
- 全量: 1321 passed / 3 skipped / 120 files (fork 前复测)


## Adversarial Review 完成 (44a5d08)
- 委派双审查因子 agent 402 失败 -> 主 Agent 自查 + 生产数据实证 (06-adversarial-review.md)
- P1-1 unproductive_cycle 死路径修复: 改消费真实 IterationRecord.snapshot.fingerprint
- P1-2 lineage 截断修复: parentRunId 逐跳 getRun + listRunsByParent, 不再有 1000 上限静默丢失
- P2 inputHash 双哈希修正: receipt 恢复第三方可验证性
- 全量复测: 1352 passed / 3 skipped / 128 files


## P0 逃逸修复 (0bc30c3/1439cf5, 2026-08-24 05:3x)
- **live 实证逃逸**: np.f2py.os.system() 真实执行了命令 — numpy 自动 import 的子模块重导出 os/sys, 无需 import 语句无需 dunder
- 双层修复: TS 门 (深链 depth>=3 从绑定根 + loader/import-system 属性 -> E-ESCAPE) + Python AST 门镜像同一策略
- 回归测试 codeact-escape-regression.test.ts 钉死两层; 正常分析代码 (np.array/statistics.mean) 不受影响
- 教训: dunder 封禁只挡住了经典链; 真正的边界是"从绑定根出发的属性图可达性", 静态近似 = 深度限制


## Disconnected-PoC 审计关闭 (e0639ae)
- grep 证明 runExploration/queryRunEvents/previewFor 无生产 caller -> research-tools capability 建立
- wireResearchTools: G4/G5/G6 变成标准 AgentTool (zod schema + execute + riskClass + summarize)
- refine 会话注册三工具 + permission allow 规则; gate 拒绝向模型回传违规码
- 全量: 1389 passed / 3 skipped / 134 files; tsc/lint/build GREEN


## 最终收敛状态 (2026-08-24, 会话收敛点)
- 全量: **1429 passed / 3 skipped / 140 files** — remote-executor 偶发已由 sibling 的 sshd 就绪轮询修复
- tsc / lint (0 errors) / build GREEN; completion-gate 仅 G-04 unsatisfied (竞赛路由凭证, 外部)
- disconnected-PoC 审计关闭: G4/G5/G6 全部经 research-tools capability 接入 refine 内核循环 (e0639ae)
- adversarial review 闭环: P0 沙箱逃逸 (np.f2py.os) + P1×2 + P2×1 全部修复并有回归测试
- AVO 融合确定性范围 COMPLETE; 剩余 S10b live 矩阵与 G-04 同源等待凭证

## 关键不变量 (实现中已验证)
- supervisor/lineage 均为只读视图, 不产生第二权威
- supervisor_observation note 每边界恰好一条 (幂等可审计)

## 已完成证据
- 01-source-verification.md: 四源全验真 + Windows 测试矩阵归因 (483 core green)
- 02-farlab-gap-analysis.md: G1-G8 差距，P0=G1调度权/G2supervisor/G4CodeAct冲突
- NOOA @97f52de clone 在 .cache/nooa（Windows 补丁: fcntl/SIGUSR2 guard）
- 真实 workload: .far-run/far.db 有完整 run 历史（84 questions, 660 hyps, 3 experiment specs）

## 关键裁决记录
1. G4 裁决: CodeAct 引入 exploratory 层；confirmatory 层保持 D-086-5（预注册 spec 只能经 deterministic gate 从探索产出生成）。两者不冲突。
2. Supervisor 不在 NOOA 中，必须自建；观测面用 event_query/ATIF 思路。

## 环境事实 (2026-08-24)
- zai 路由: ZHIPU_API_KEY set 但 **rate-limited 至 2026-08-29** (error 1310 weekly cap)
- 无 DASHSCOPE/OPENAI/ANTHROPIC key → live LLM 对比 benchmark BLOCKED-live
- test-stub provider 可用于确定性离线对比（executionMode=test, receipt 标注诚实）

## 已排除方案
- deepseek: banned 2026-08-22 (user directive), provider plane archived
- 直接 vendor 整个 NOOA: requires-python >=3.12,<3.14 + litellm 重依赖链，与 zod-only Node 产品不变量冲突 → 桥接而非 vendor

## Live 路由穷尽记录 (2026-08-24 02:44, 全部一手实测)
- zai anthropic-compat (secrets.env key): 429 code 1310 周限额，重置 2026-08-29 10:03:58
- zai paas/v4 (同 key): 429 code 1113 余额不足/无可用资源包
- zcode-plan bigmodel-start-plan (180char key, zcode.z.ai): 3007 captcha verify failed（网关反爬需 ZCode CLI 握手）+ 变换 UA 后 401
- deepseek anthropic (zcode custom provider): 402 Payment Required (Insufficient Balance)
- nuaa relay (token.nuaa.edu.cn): 483 非 JSON 错误页
- 本地推理四端口 (ollama 11434/lmstudio 1234/llamacpp 8080/vllm 8000): 连接拒绝，未运行
- 结论: **live LLM 对比 benchmark BLOCKED-live 至 08-29 或用户提供新路由**。spike 用 test-stub 确定性离线对比推进，receipt.executionMode=test 诚实标注。

## 下一步
S8: Scientific AVO 设计落地 — Supervisor 观测面 + Lineage 查询 + evaluator 家族，先写失败测试 (TDD) 再实现。live-LLM 对比等 key 恢复或用户提供路由。
