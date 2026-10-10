# 性能/可靠性/混沌审计（2026-08-30，只读）

> 来源：终局接管第一轮并行审计（Explore 子代理，65 次工具调用）。未运行任何基准，只审计存在的基准与测试。

```
PERF-1 | 现有性能基准维度与分位数 | PARTIAL | tests/fixtures/model-plane/benchmark.ts(7套件,离线stub) + spikes/reliability-perf.mjs → evidence/reliability/perf.json(CLI冷启106-158ms、GET /runs 21ms、15k事件读75ms、chain验证33ms、agent-loop 0.2-0.5ms/turn) + web/e2e/perf.spec.ts(FCP/LCP/CLS/long-tasks) | benchmark.ts只算meanLatencyMs无p50/p95/p99；perf.json单次快照均值；LLM并发吞吐无分位数；DB只15k事件规模 | 长尾(重试链)被均值掩盖 | API p99<500ms；percentile计算加入benchmark并重跑 | perf.json; model-plane-benchmark.test.ts:69-163
CAP-2 | 容量扩展 | FAIL | 多run并行=spikes/reliability-soak.mjs(45 runs/23526 events并发6,chain全绿)；web截断=EventsTab MAX_RENDER=300、ActivityFeed slice；prompt侧 cappedClaimsForPrompt | 1000+ claims/100+ hypotheses无任何测试；web无虚拟化(纯slice截断)；web/e2e/PERF_BASELINE.md 明确自认 ">100 claims/>20 hypotheses: not yet measured" | 目标规模下性能完全未知 | 1000 claims/100 hypotheses 容量 spec 进 CI（合成 fixture 明示 synthetic） | PERF_BASELINE.md 末段; soak.json
PERF-3 | CI performance regression gate | PARTIAL | ci.yml + web perf.spec.ts(LCP<4000ms、CLS<0.1 已抓过真缺陷) | 后端零perf阈值断言：perf.json/soak.json是spike产物不在CI | 后端/DB/LLM链路回归静默通过CI | reliability-perf.mjs -ci 模式(硬阈值 exit 1)挂进 ci.yml | ci.yml
CHAOS-4 | 故障注入测试 | PARTIAL | spikes/reliability-faults.mjs→faults.json(10案全PASS：sigint/db-busy/字节翻转/ENOSPC/EACCES/duplicate-execute/429→502→ECONNRESET→malformed/outbox幂等/双进程并发append/DNS EAI_AGAIN) + wave8-fault-injection.mjs(20次真实跨进程kill+watchdog收养) + wave8-durability/recovery/server-bind-guard/conversation-kernel-durability/llm-tolerance | 缺：TLS证书失败、服务器本体 SIGKILL（现仅 worker）、SSE mid-stream 断流重连 E2E（HCI §19 自认未做）、partial SSE 半截JSON | 网络类混沌只到DNS/连接层 | 全混沌案≥90%覆盖且脚本化可复跑 | faults.json
IDEM-5 | 幂等/exactly-once | PASS | outbox.test.ts(同事务落地+first-write-wins+drain幂等) + scheduler-dlq.test.ts(fence/MAX_JOB_ATTEMPTS/dead-letter) + RunLeaseHeldError 单写者 + receipts 重导不重复计费 + conversationStream seq 去重 | scheduler 与 far.db 是两个 DB 文件，跨库非真 exactly-once（靠 outbox+幂等 drain 近似，已测） | 极低 | 维持；crash-loop 由 DLQ 兜住 | outbox.test.ts
CANC-6 | cancellation 全链路 | PARTIAL | 链路完整：ConversationView conv-stop(本地abort,注释明示server work继续→诚实) → api.ts cancel 端点 → orchestrator wire-cancel 注册表+provider wrapper 注入 signal → http.ts 传输层 abort；跨进程持久化 cancelRequested | 无单测断言"cancel 在 ms 级中止真实 in-flight provider call"（端点测试有三态） | 回归可能退化为"等 stage 边界才取消"(最长300s) | 慢 provider stub + cancel 计时断言 <1s | orchestrator.ts:93; http.ts:1416
TIME-7 | 分层超时体系 | PARTIAL | provider 300s(依实测121s上调,重试≤2) + MCP 30s + ssh 60s+TERM→KILL + lease TTL 660s(evidence-based) + run token 预算 + spend limit fail-closed | 无 per-stage 墙钟超时；无整 run 总 deadline | 系统性慢 stage 只被间接兜住 | stage 墙钟上限 + run 总预算 fail-visible | http.ts:61; gateway.ts:123-131
MEM-8 | 内存/泄漏防护 | PARTIAL | soak.mjs→soak.json(RSS 65.1→107.9MB bounded,handles 0增长,verdict计算非目测) + api.ts MAX_BODY_BYTES=1MB + ingest 10MB/15MB + reply 40k/SSE 5000条 + llm.ts runaway size ceiling | soak 是 spike 不在 CI；无 heap/CPU profiling 测试 | 内存回归只能手动发现 | soak verdict 纳入 CI；RSS 增长率阈值 | soak.json
SOAK-9 | 6h+ soak 证据 | PARTIAL | soak.mjs 自称 ACCELERATED(17.8s 以体量等效) + gold run 12 stage ~2.5h wall-clock(过载穿墙) | 无任何 6h+ 持续运行；gold run 是单次产品验证非稳定性 soak | 长时漂移只有 17.8s 证据 | ≥6h soak 含 RSS/句柄/DB 增长率采样 | VALUE-COMPARISON.md
STUCK-10 | stuck-run 检测与 sweep | PARTIAL | sweep-zombie-runs.mjs(status=running AND stale→partial+审计事件,事务+默认dry-run) + lease 过期→watchdog 收养(20 次验证) | sweep 本身无测试；无独立 liveness 心跳(signal-gap.json 自认 nothing polls)；无定时调度；30min 窗口内真僵尸不可见 | 慢而活的 run 可能被误标 | sweep 加 vitest 包装+纳入 watchdog 轮询 | sweep-zombie-runs.mjs:21-24
SSE-11 | SSE/streaming 背压与重连 | PASS | 服务端：seq 单调、afterSeq 重放、5000 事件环形上限、10min retain、单写者、close() 全 abort；客户端：退避 2s 封顶、seq 游标续传、去重；reconnecting/polling-fallback 诚实状态机(有测) | hub 是进程内 Map：server 重启流即失(靠 retain+重连兜)；res.write 无 drain 检查；多进程不支持 | 单机产品形态下低 | 断线重连零重复零丢失 e2e（已登记未做） | conversation-stream.ts:136-156
```

## Top 3（按真实风险）

1. **容量基准（CAP-2，FAIL）**：ACC-19 声称 representative workloads 已测，实测最大规模 ~21 claims/15k 事件，与 1000+ claims 差两个数量级。一处合成大 corpus fixture 政策决定 + 容量 spec 即可把最大未知变已知。
2. **后端 perf gate 进 CI（PERF-1+3）**：唯一在 CI 的 perf 阈值是 web LCP/CLS；后端无 p95/p99、无阈值。
3. **sweep-zombie 测试化+自动化（STUCK-10）**：zombie run 误表状态是被记录过的真实痛点，但脚本零测试、零调度、无 heartbeat 判据。

## 混沌矩阵

| 故障注入 | 覆盖 | 指针 |
|---|---|---|
| 进程 kill(worker, mid-run, 跨进程) | ✓ | wave8-fault-injection.mjs(20 runs); fault-injection.json |
| SIGINT mid-run | ✓ | faults.json sigint-mid-run |
| kill -9 服务器本体 mid-write | ✗ | 仅 worker 覆盖 |
| crash→重启→resume | ✓ | wave8-durability / conversation-kernel-durability / agent-resume |
| 断网/DNS fail | ✓ | faults.json dns-resolution-failure |
| TLS/cert 失败 | ✗ | 无 CERTERR 注入 |
| 429/5xx | ✓ | faults.json model-fault-sequence 过真重试核 |
| partial/malformed response | ✓ | llm-tolerance / json-repair |
| DB locked/busy | ✓ | faults.json db-busy-concurrent-writer |
| DB corruption | ✓ | faults.json db-corruption-detected |
| disk full / perm denied | ✓ | faults.json ENOSPC/EACCES |
| duplicate event/double-dispatch | ✓ | outbox / faults.json duplicate-execute-rejected |
| 并发 append 竞态 | ✓ | faults.json concurrent-append-two-processes |
| SSE reconnect（真实断流 E2E） | ✗(单元✓) | HCI §19 登记未做 |
| crash-loop→DLQ | ✓ | scheduler-dlq.test.ts |
| schema 降级/新库旧码 | ✓ | reliability-db-guards.test.ts |

总评：可靠性工程（outbox/lease/DLQ/原子落地/错误分类）真实且被测；短板集中在容量规模未测、后端 perf 无 gate、6h+ soak 缺失、sweep 无测试。
