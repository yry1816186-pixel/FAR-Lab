# FINAL_GAPS.md — 终局能力矩阵（唯一人读事实源）

> 机器可读版：`FINAL_ACCEPTANCE.json`。逐域审计报告：`FINAL_EVIDENCE/audit-2026-08-30/`（8 域并行只读审计 + 主代理抽验）。
> 状态词汇：PASS / PARTIAL / FAIL / BLOCKED_EXTERNAL。**任何 FAIL/PARTIAL 不得宣布完成。** 本文件随修复持续更新。

## 总判（2026-08-30）

工程底座（可靠性/持久化/审计链/outbox/DLQ/租约）真实且被测——这是强项。当前阻断完成的不是"缺功能"，而是四类真相缺口：

1. **事实性声明破裂**：hosted CI 自 08-29 连红（根因=netcdf fixture 越界守卫）；提交文档三处引用已被推翻的 judge-variance 0.061 旧数；ACC-25 "real Linux target" 实为本机 Docker。
2. **安全实边界**：CodeAct 静态门存在已知绕过（别名/拆链/getattr）且 sidecar 全量继承密钥；egress 无闸；api_key 走 URL query 可入错误持久化；netcdf 围栏可被 symlink 穿越。
3. **科学指标未达标**：rediscovery 0.226/0.7、judge variance 0.267/0.15、relation agreement 0.61/0.8、structured-output 0.011/0.005；评估集 100% 生物医学，无跨领域 held-out。
4. **规模与长程证据空档**：数据面全内存（100/200MB 顶）；容量测试最大 ~21 claims；无 6h+ soak；无 windows CI/浏览器矩阵；release 链 0 次真实执行。

## P0 队列（correctness/safety/scientific-truth/core-flow）

| ID | 缺口 | owner | 状态 |
|---|---|---|---|
| FA-PLT-02 | CI 红：netcdf 两用例移入 skipIf 守卫（根因已定位） | self | **已修（本地双向验证；hosted 绿待推送后核验）** |
| FA-EVAL-14 | 提交文档 0.061 旧数三处 + north-star 引用错位 | self | **已修（含两份 PDF 重生成+抽取核验）** |
| FA-SEC-02/01 | CodeAct 门绕过封堵 + malicious 回归语料 + sidecar env 白名单 | self | **静态+运行时层已落地（别名/拆链/getattr 全拒、危险模块运行时擦除、env 最小化）；OS 级隔离仍开放（FA-SEC-01 残余）** |
| FA-SEC-04 | sources 层 egress destination guard（私网段/重定向/协议） | self | **sources 层已落地；进程边界 allowlist（providers/MCP）开放** |
| FA-SEC-06 | OpenAlex api_key → header + 错误脱敏 | self | **已修（Bearer header + 构造器 chokepoint 脱敏）** |
| FA-SEC-07 | netcdf realpath 围栏 + symlink 回归 | self | **已修** |
| FA-REM-01 | ACC-25 措辞对齐 + suite 日志存档 | self | 待办 |
| FA-SCI-01..04 | rediscovery/judge-variance/relation 治理 + 跨领域 gold suite | self | 分批（评估波次） |
| FA-X-01 | B-QWEN 凭证（09-05 用户裁定） | user | BLOCKED_EXTERNAL |

## P1 队列（acceptance/reliability/reproducibility 摘要）

FA-HAR-01 per-tool 超时缝（等兄弟车道落地）· FA-HAR-02 预算/pacing 默认化 · FA-HAR-03 failover live 实证 · FA-HAR-04 72h soak · FA-DAT-01 数据面流式化 · FA-DAT-02 far restore + 三库备份 · FA-SCI-05 ODE 腿（先修注释诚实）· FA-SCI-06 结构化输出复测 · FA-SCI-07 AstaBench/MLR 接入 · FA-REM-02 远程 cell 级去重 · FA-REM-03 probe 指纹 · FA-PRF-01 容量基准 · FA-PRF-02 后端 perf gate · FA-PRF-03 混沌矩阵补 4 项 · FA-PRF-04 cancel 计时回归 · FA-PRF-05 sweep 测试化 · FA-SEC-08 fence crypto-random（兄弟车道）· FA-SEC-09 SBOM/SAST/audit 门 · FA-SEC-11 威胁登记补全 · FA-PLT-01 windows CI + firefox · FA-PLT-03 release-pack 真跑 · FA-HCI-01..03（兄弟车道）· FA-EVAL-02 user-study 协议开发 · FA-EVAL-04 控制面鲜活度。

## P2 队列（architecture/product/performance/frontier 摘要）

FA-HAR-05 steer 接线 · FA-HAR-06 记忆管理面 + 7d 验证 · FA-DAT-03 静态加密决策 · FA-DAT-04 FTS 增量 · FA-DAT-05 verify 空转收紧 · FA-REM-04 Slurm 网关 · FA-SEC-10 发布签名 · FA-SEC-12 web 解压上限 · FA-PLT-04/05/06 CHANGELOG/签名/numpy pin · FA-SCI-08 外部产品对照 · FA-EVAL-01/03 MLR 全量/prompt 工程化 · FA-HCI-04 EN 泄漏残项。

## 强项（不许回退）

outbox/lease/DLQ/原子落地/错误分类（faults.json 10 案全绿）；事件链 prev_hash + 不可变触发器；checkpoint/resume 实战（gold run 2h18m 穿 529/1302，34 resume 零重复计费）；三层结构化输出容错（修复层 75/75+192/192）；同模型直答基线的预声明公平协议（S1 修复由对抗评审抓出）；北向指标防通胀账本（target 只能显式上调）；诚实披露文化（0.58→0.226 自我证伪、insufficient-evidence 正式结论、unexecutable-leg verdict）。

## 停止条件对照（任务书 §17）

| # | 条件 | 现状 |
|---|---|---|
| 1 | 无内部 FAIL/PARTIAL | ✗（12 FAIL / 30 PARTIAL） |
| 2 | clean-clone CI 全绿无隐藏依赖 | ✗（连红，netcdf fixture） |
| 3 | science north-star 达标 | ✗（4 项指标均未达） |
| 4 | 六面真实证据 | 部分（工程强/科学-外部薄） |
| 5 | 24h+ soak & chaos | ✗（无 6h+ soak；混沌 10/14） |
| 6 | Win/macOS/Linux 矩阵 | ✗（仅 ubuntu×chromium） |
| 7 | sandbox attack suite | ✗（语料未建，绕过在） |
| 8 | 全流程 production path | 大体 ✓（gold 场景 A/B live） |
| 9 | clean machine bundle verify | ✓（far verify 16 checks，四 bundle 11/11） |
| 10 | BLOCKED_EXTERNAL 诚实 | ✓（B-QWEN/S-1 如实登记） |
| 11 | 文档与 commit 一致 | ✗（提交文档 0.061；ACC-25 措辞） |
| 12 | 终局红队无新 P0/P1 | ✗（本轮审计即产出新 P0） |

## 修复纪律

- 每修一项：FINAL_ACCEPTANCE.json 状态翻转 + 验证命令 + 证据指针；FINAL_GAPS.md 同步。
- 兄弟车道文件（conversation-stream 面、loop.ts、providers/http.ts、web 十文件、AGENTS/DESIGN/PRODUCT/ACCEPTANCE 规范、演示视频脚本）本轮不改，缺口照记 owner=sibling-lane。
- 评估类修复必须走预声明协议 + 原始 artifact（seed/route/prompt/receipts），禁止 benchmark hard-code。
