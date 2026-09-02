# FAR-Lab 终局收口 — Mission State（Wave B 车道）

> 目标：/goal 2026-09-02「FAR-Lab 重建总任务」持久执行。本文是可恢复执行状态，每窗口结束前更新。
> 总任务书：FARLAB_REBUILD_MASTER_MISSION.md。验收账本：FINAL_ACCEPTANCE.json / FINAL_GAPS.md / .control/。

## FRAME

- 持久目标：以真实能力+证据闭 66 项终局标准（当前 20 PASS / 34 PARTIAL / 10 FAIL / 2 BLOCKED_EXTERNAL），停止条件见 FINAL_ACCEPTANCE.stopConditions。
- 本车道（lane/endgame-waveb）职责：FA-SEC-01 探索沙箱 OS 级隔离收口 + 平台事实链闭合（FA-PLT-02/03）。
- 兄弟车道资产（不触碰、不入库）：brand/、competition-inputs/、submission/、.impeccable/。

## 状态（2026-09-02 本窗口）

- **Wave B 代码已提交 `d17e706`**（28 文件 +2603/-97）：OCI 沙箱（experiment-runtime Dockerfile/policy/sandbox_main + exploration-sandbox.ts + 四套测试）、取消传播/trust-root 生产接线、ci.yml hosted exploration-sandbox job、completion-gate requiredEvidence 防洗绿校验、BLOCKERS.json B-FA-SEC-01-HOSTED-OCI 登记。
- 提交前全门禁复验（本窗口重跑）：tsc 0 错；定向 eslint 0 错；sandbox:verify PASS（镜像重建后 sha256:f00cad3d…，Dockerfile 未变、基镜像刷新）；全量 vitest 236 files/2370 过/15 跳（102.7s）；opt-in OCI 4 files/13 过；secret/path 扫描 0 error。
- Wave D（HCI）已于 58c4c92 闭账；主线在 495e53c；87a1f3f（Wave A CLS 修复）是本车道祖先——车道合并即可推进 FA-PLT-02 hosted 绿。

## 执行计划（按序）

1. [DONE] 本地门禁复验 + 代码提交 d17e706。
2. [DONE] 账本刷新（FINAL_ACCEPTANCE head→d17e706、EXECUTION_STATE、本文件）+ docs 提交。
3. [RUNNING] 推送 lane/endgame-waveb → 观察 hosted ci.yml（重点 exploration-sandbox job on ubuntu-latest）。
4. [TODO] 绿证：从 job summary 抓 run URL/source SHA/image ID → 写入 BLOCKERS.json resolutionEvidence → 闭 B-FA-SEC-01-HOSTED-OCI → FA-SEC-01 状态更新。
5. [TODO] 评估主线收口：车道 hosted 全绿后合并 main（顺带 FA-PLT-02 canonical web-e2e hosted 绿核验）。
6. [TODO] 若 hosted 红：按日志定位环境差异修复重推；不得以本地证据替代。
7. [NEXT-WAVE] 完成后按 FINAL_GAPS P0 队列继续：FA-REM-01（ACC-25 措辞+suite 日志）、FA-SCI-01..04 评估波次、FA-SEC-04 进程边界 egress、FA-W0-05/06 全仓裁决推进。

## 环境与工具事实

- 主会话有 PowerShell 工具（ToolSearch select:PowerShell 可加载）；Bash 亦可用但全局规则禁用于日常命令。
- Docker Desktop 在线（Server 29.5.2，linux 引擎）；本机镜像 farlab-experiment-runtime:sec01 当前 ID sha256:f00cad3d…（与账本旧记录 4836603… 不同=基镜像重建漂移，Dockerfile 未变，已在 FINAL_ACCEPTANCE 记录）。
- 远程：github.com/yry1816186-pixel/FAR-Lab；ci.yml `on: push` 无分支过滤——推车道即触发全矩阵（verify/web-e2e/exploration-sandbox/release-pack/audit）。
- 全仓 lint 仍被兄弟未跟踪 submission/final/create_docx.js 两处 no-undef 阻断（已知，不触碰）；本车道定向 lint 0 错。

## 教训（继承+新增）

- 编辑期间跑 build 拿不一致快照——typecheck 先行、失败即停。
- PowerShell here-string 写源码文件会触发 hook 误拦——源码一律 Edit/Write 工具。
- 镜像 ID 会随基镜像刷新漂移——证据记录 Dockerfile 内容 + SHA，勿把镜像 ID 当唯一锚。
- add 后未即时 commit 有 rebase 吞改动前科——stage 白名单后立即 commit。
