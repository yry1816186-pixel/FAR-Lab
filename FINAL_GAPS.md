# FINAL_GAPS.md — 终局能力矩阵（唯一人读事实源）

> 机器可读版：`FINAL_ACCEPTANCE.json`。逐域审计报告：`FINAL_EVIDENCE/audit-2026-08-30/`（8 域并行只读审计 + 主代理抽验）。
> 状态词汇：PASS / PARTIAL / FAIL / BLOCKED_EXTERNAL。**任何 FAIL/PARTIAL 不得宣布完成。** 本文件随修复持续更新。

## 总判（2026-09-02，Wave B 本地 OCI/取消传播/trust-root 已验证，托管核验待集成）

当前 66 项终局标准为 20 PASS / 34 PARTIAL / 10 FAIL / 2
BLOCKED_EXTERNAL。Wave 0 的五项实现标准已经集成并通过全门禁；Wave A 已在
独立车道关闭 loaded-shell CLS 的本地根因，并完成多运行时公开源码包、三生态
SBOM 与确定性归档的本地真跑，但 canonical hosted 绿、OIDC attestation 和
GitHub Release 仍未发生，不能提前翻 PASS。当前阻断完成的是四类真相缺口：

1. **平台事实链未闭合**：canonical `main@cc4009c` 的 hosted verify 已绿，但 web-e2e 因 loaded-home CLS 0.123795 连红；本地根因已在 `87a1f3f` 修复并通过 23/23 浏览器门，仍待集成后的 hosted 绿证。Ubuntu+Windows 与 Chromium+Firefox 矩阵已经进入工作流，但 8a5200f 的 hosted run 仍显示等待且 0/2 verify 完成；release-pack 只完成本地真跑，未有 hosted OIDC/GitHub Release。ACC-25 "real Linux target" 实为本机 Docker。
2. **安全实边界**：CodeAct 别名/拆链/getattr、sidecar env、sources egress、OpenAlex key 与 netcdf symlink 已在静态/运行时层修复；Docker Linux OCI 隔离已在本机真实生产路径和对抗路径验证，镜像 tag 在 create 前解析为 immutable image ID 并绑定容器，取消传播已覆盖 warmup/in-flight 调用并验证幂等清理，`runExploration` 与 `wireResearchTools` 均固定拥有 Docker trust root，不再接受 caller-supplied factory。runner 测试只在隔离 Vitest worker 替换模块边界，不能充当运行时扩展或不可伪造 attestation token。清理失败保持可重试并有回归证据。最终源码 SHA 的 hosted Ubuntu 绿证与 Linux `/proc` 清理分支仍开放。D-SEC-01 已把 rootless daemon、gVisor/VM、Windows-native AppContainer+Job 拆为由部署声明触发的独立安全档位，当前单用户 Docker Linux OCI 基线不声称这些能力；provider/MCP 进程边界 egress、SBOM/SAST 与发布签名也仍开放。
3. **科学指标未达标**：rediscovery 0.226/0.7、judge variance 0.267/0.15、relation agreement 0.61/0.8、structured-output 0.011/0.005；评估集 100% 生物医学，无跨领域 held-out。
4. **规模与长程证据空档**：后端 1000+ claim 门仅是明确标注的 SYNTHETIC 容量证据，浏览器真实路径当前只有 7 claims/0 admissible hypotheses；数据面仍受内存上限约束，无 6h+ soak、Windows hosted 绿证与 macOS/WebKit 证据。发布包已在 clean committed copy 上覆盖 root/Web/TUI/Python/desktop 五腿，生成 CycloneDX 1.7（991 components）及两次字节一致的 890-file 归档，但 hosted 签名与真实 GitHub Release 仍为 0 次。

## P0 队列（correctness/safety/scientific-truth/core-flow）

| ID | 缺口 | owner | 状态 |
|---|---|---|---|
| FA-PLT-02 | canonical CI：verify 绿、web-e2e loaded-home CLS 红 | self | **本地根因已修于 87a1f3f（home CLS 0.0001、map 0.0184–0.0185、完整 Chromium 23/23）；待集成后 hosted 绿核验，PARTIAL** |
| FA-EVAL-14 | 提交文档 0.061 旧数三处 + north-star 引用错位 | self | **已修（含两份 PDF 重生成+抽取核验）** |
| FA-SEC-02 | CodeAct 门绕过封堵 + malicious 回归语料 + sidecar env 白名单 | self | **已闭：别名/拆链/getattr 全拒、危险模块运行时擦除、env 最小化** |
| FA-SEC-01 | Exploration CodeAct OS 级隔离 | self | **PARTIAL：单用户本地 Docker Linux OCI 基线已在本机验证（生产真实路径、合同、故障注入、对抗、超时清理、取消传播均绿）；生产 `wireResearchTools` 已移除可替换 factory，低层 runner factory 仅保留为内部测试 seam 并由缺失 attestation 回归锁定，尚非不可伪造 token。最终 SHA 的 hosted Ubuntu job 与 Linux `/proc` attach-client 清理分支待证。rootless/gVisor/Windows-native 已按 D-SEC-01 重裁为条件档位，不作为四项同时满足的基线门** |
| FA-SEC-04 | sources 层 egress destination guard（私网段/重定向/协议） | self | **sources 层已落地；进程边界 allowlist（providers/MCP）开放** |
| FA-SEC-06 | OpenAlex api_key → header + 错误脱敏 | self | **已修（Bearer header + 构造器 chokepoint 脱敏）** |
| FA-SEC-07 | netcdf realpath 围栏 + symlink 回归 | self | **已修** |
| FA-REM-01 | ACC-25 措辞对齐 + suite 日志存档 | self | 待办 |
| FA-SCI-01..04 | rediscovery/judge-variance/relation 治理 + 跨领域 gold suite | self | 分批（评估波次） |
| FA-X-01 | B-QWEN 凭证（09-05 用户裁定） | user | BLOCKED_EXTERNAL |
| FA-W0-01 | CJK/Unicode 证据对齐分词 | self | **已修（目标测试 34/34 通过，含同字符逆序负例）** |
| FA-W0-02 | Agent 五硬化与流式会话车道集成 | self | **已集成并通过最终 232 文件/2346 测试门，PASS** |
| FA-W0-03 | scope 三表单归一为单一语义模型/手风琴界面 | self | **统一模型、共享编辑器、API 边界与 Chromium 旅程均验证，PASS** |
| FA-W0-04 | 全仓卫生/明文秘密检查 | self | **901 文件扫描无 HIGH，路径 0 error；全文件语义审阅另由 W0-05/06 保持开放，PASS** |

## P1 队列（acceptance/reliability/reproducibility 摘要）

**批 2 已闭（2026-08-30）**：FA-DAT-02 far restore+三库备份+损坏 drill（PASS）· FA-DAT-05 verify vacuous 机器可读降级（PASS）· FA-PRF-01 后端容量门 1000+ claims（PASS，明示 SYNTHETIC）· FA-PRF-04 cancel 0.6ms 计时钉死（PASS）· FA-PRF-05 sweep 三测试+FARLAB_DATA_DIR（PASS）· FA-REM-03 probe 全指纹入 provenance+fingerprint（PASS）· FA-SCI-05 注释诚实化（PARTIAL，真 ODE 腿=独立车道）· FA-SCI-04 跨领域 6 题+真实 salted seal 封存（PARTIAL，执行待评估波）。FA-PLT-06 的 NumPy+Rust 双 pin 已于 2026-08-31 闭合为 PASS。

**Wave A 本地已闭（2026-08-31）**：FA-PLT-07 Web 产物 47,856,580B→7,346,964B，零 sourcemap/错置 wasm、单一现代 pdfjs、重能力按需加载、确定性门与真实浏览器 15/15 压测（PASS）· FA-PLT-08 index/模型再验证 + 指纹资源一年 immutable + 强 ETag + GET/HEAD 304，API 78/78 与隔离生产探针（PASS）· FA-HAR-07 启动/管道终止单次结算，缺失 launcher <1s 失败且真实 sidecar 冒烟（PASS）。FA-PLT-02 仅剩 canonical hosted 绿核验，仍为 PARTIAL。

仍开放：FA-W0-05 五表 SWEEP 已建但仅裁决 5/902（runtime 2/378、tests/evaluation/evidence 2/321、delivery/operations 1/114、product/specs/docs 0/38、governance/assets 0/51）· FA-W0-06 浅断言 1/168 已裁决（扫描器夹具字符串 justified），167 项待逐项裁决 · FA-HAR-01 per-tool 超时缝（兄弟车道）· ~~FA-HAR-02 预算/pacing 默认化~~ **已闭（2026-09-01，9fb2f29 前序 6b8e14d：pacing 默认 600ms/每 provider，env 可关；预算默认 120s 先前已在）** · FA-HAR-03 failover live 实证 · FA-HAR-04 72h soak · FA-DAT-01 数据面流式化 · ~~FA-SCI-05 ODE 腿实现~~ **已闭（2026-09-01，9fb2f29：域+sidecar op+executor+起草器+execute 级联+8 测试含真实 sidecar 解析解对照）** · FA-SCI-06 结构化输出复测 · FA-SCI-07 AstaBench/MLR 接入 · FA-SCI-04 执行 · FA-REM-02 远程 cell 级去重 · FA-PRF-02 后端 perf gate · FA-PRF-03 混沌矩阵补 4 项 · FA-SEC-08 fence crypto-random（兄弟车道）· FA-SEC-09 hosted SBOM/SAST/audit 结果 · FA-SEC-11 威胁登记（R-19/20/21 已登，条目闭待能力闭）· ~~FA-PLT-01 windows/firefox hosted 绿证~~ **已闭（2026-09-01：495e53c 车道+main 全绿，windows verify/firefox e2e/desktop 三平台+release-pack 全过）** · FA-PLT-03 hosted attested release-pack/GitHub Release · FA-HCI-01..03（兄弟车道）· FA-EVAL-02 user-study 协议开发 · FA-EVAL-04 控制面鲜活度。

## P2 队列（architecture/product/performance/frontier 摘要）

FA-HAR-05 steer 接线 · FA-HAR-06 记忆管理面 + 7d 验证 · FA-DAT-03 静态加密决策 · FA-DAT-04 FTS 增量 · FA-DAT-05 verify 空转收紧 · FA-REM-04 Slurm 网关 · FA-SEC-10 hosted OIDC 签名+updater · FA-SEC-12 web 解压上限 · FA-PLT-05 desktop 签名/更新/卸载 · FA-SCI-08 外部产品对照 · FA-EVAL-01/03 MLR 全量/prompt 工程化 · FA-HCI-04 EN 泄漏残项。FA-PLT-04/06 已闭合为 PASS。

## 强项（不许回退）

outbox/lease/DLQ/原子落地/错误分类（faults.json 10 案全绿）；事件链 prev_hash + 不可变触发器；checkpoint/resume 实战（gold run 2h18m 穿 529/1302，34 resume 零重复计费）；三层结构化输出容错（修复层 75/75+192/192）；同模型直答基线的预声明公平协议（S1 修复由对抗评审抓出）；北向指标防通胀账本（target 只能显式上调）；诚实披露文化（0.58→0.226 自我证伪、insufficient-evidence 正式结论、unexecutable-leg verdict）。

## 停止条件对照（任务书 §17）

| # | 条件 | 现状 |
|---|---|---|
| 1 | 无内部 FAIL/PARTIAL | ✗（10 FAIL / 34 PARTIAL） |
| 2 | clean-clone CI 全绿无隐藏依赖 | ✗（canonical main web-e2e CLS 红；本地修复尚未集成/hosted 核验） |
| 3 | science north-star 达标 | ✗（4 项指标均未达） |
| 4 | 六面真实证据 | 部分（工程强/科学-外部薄） |
| 5 | 24h+ soak & chaos | ✗（无 6h+ soak；混沌 10/14） |
| 6 | Win/macOS/Linux 矩阵 | ✗（Windows+Firefox 已配置但 hosted 未完成；macOS/WebKit 未配置） |
| 7 | sandbox attack suite | ✗（本地 Docker Linux OCI 对抗、故障注入、超时清理、取消传播、immutable image pin 和可重试清理已验证；生产 runner/wiring 不再暴露 caller factory，测试仅替换隔离模块边界，仍不等于不可伪造证明；最终 SHA 的 hosted Ubuntu 绿证和 Linux `/proc` 分支尚未闭；更强/原生后端仅在 D-SEC-01 触发条件出现时重开） |
| 8 | 全流程 production path | 大体 ✓（gold 场景 A/B live） |
| 9 | clean machine bundle verify | ✓（far verify 16 checks，四 bundle 11/11） |
| 10 | BLOCKED_EXTERNAL 诚实 | ✓（B-QWEN/S-1 如实登记） |
| 11 | 文档与 commit 一致 | ✗（0.061 旧数已修；ACC-25 "real Linux" 措辞仍开放） |
| 12 | 终局红队无新 P0/P1 | ✗（本轮审计即产出新 P0） |

## 修复纪律

- 每修一项：FINAL_ACCEPTANCE.json 状态翻转 + 验证命令 + 证据指针；FINAL_GAPS.md 同步。
- 用户主工作树中的真实 WIP 与用户自有 3196 服务不改不清；实现经独立 worktree/分支提交。已保存的 conversation-stream 车道已无损集成，不能继续把它写成“待合并”。
- 评估类修复必须走预声明协议 + 原始 artifact（seed/route/prompt/receipts），禁止 benchmark hard-code。
