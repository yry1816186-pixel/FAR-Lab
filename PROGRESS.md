# PROGRESS — WORKSTREAM C final convergence (2026-08-24 session)

## 当前状态
[STATE: CONVERGENCE-ROUND-2] 全套 1389/3skip 绿已达成过（05:52）。当前在收敛 remote-executor.test.ts
的残余 flake（~30% 失败率，两种失败形态）。

## 已完成证据（本会话）
1. putMemory FTS delete-then-insert（P2 HANDOFF #1）：RED→GREEN，sibling 86f12b2 独立同修。
2. deriveTrustClass 接入 semanticFindingsForRun（P2 HANDOFF #2）：生产 caller 建立。
3. lineage.ts allRuns 残留引用 → loadRun() null-guard：修复 6 个测试失败。
4. research-tools.test.ts fixture TDZ（runId 未定义）：修复 4 个失败 + eslint unused var。
5. remote-executor docker fixture 卫生（beforeAll rm -f，commit aa9d93a）+ sshd 轮询就绪
   （先 host-key 文件轮询 commit 3294feb，再升级为真实 ssh round-trip 轮询未提交）。

## 当前问题：remote-executor 残余 flake 两种形态
- 形态A: leftovers 断言失败 — `ls /tmp/farlab | wc -l` 返回空而非 '0'。
  根因假设: /tmp/farlab 不存在时 `ls ... 2>/dev/null | wc -l` 应输出 0，
  但若 gateway.exec 的 ssh 本身瞬时失败（code!=0 被 exec 吞为数据），stdout 为空。
  即: 清理后立刻查询偶发 ssh 连接抖动 → stdout 空。
- 形态B: probe 阶段 "device unreachable or has no python3" — sshd 刚就绪即被
  executeRemoteExperiment 的 probe() 打，偶发握手失败。
- 共性根因: 容器内 sshd 单进程、Windows Docker 端口转发偶发 RESET；
  测试对一次瞬时 ssh 失败零容忍。这是环境级 flake，不是产品逻辑缺陷。

## 已排除方案
- 固定 sleep 1500ms（原始）→ 负载下不够。
- host-key 文件存在性轮询 → 文件构建期就存在，不代表 sshd 就绪。
- 当前: 真实 ssh echo round-trip 轮询（60x500ms）— 已消除形态B的大多数实例。

## 下一步
1. 对形态A: leftovers 查询加重试（最多3次，非0且非空则重查），或接受 stdout 空=
   目录不存在=清理成功的语义（`ls /tmp/farlab 2>/dev/null | wc -l` 在目录缺失时
   输出 0；空 stdout 只能是 ssh 抖动）→ 重试是正解。
2. 提交轮询升级 + 重试；再连跑6次验证稳定。
