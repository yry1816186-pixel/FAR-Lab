# 02 · 系统走查：数据流、模块地图、25 个命令全景

> 学习目标：建立全系统心智模型——一条 claim 从进来到 sealed verdict 走了哪些
> 模块；25 个命令按生命周期怎么分组；每个命令在真实工作流里的角色。
> 前置：01。产出：能对着 `far demo` 的每一段输出解释背后的模块。
> 动手前置：本机有 Node ≥ 24 + pnpm（`node src/cli/far.ts doctor` 自检）。

---

## 2.1 一条 claim 的生命周期（核心数据流）

```
                    ┌─────────────────────────────────────────────────┐
                    │                 FAR-Lab 核心链路                   │
                    └─────────────────────────────────────────────────┘

 1. Claim 声明        FEC 编译        Evidence 收集        R0-R9 裁决
 ┌──────────┐    ┌─────────────┐   ┌───────────────┐   ┌──────────────┐
 │ claim +  │───▶│ falsification│──▶│ 统计检验结果   │──▶│ 确定性规则树  │
 │ falsif-  │    │ spec (metric│   │ + 证据记录     │   │ 5 值裁决      │
 │ ication- │    │ /threshold/ │   │ + 反剧场扫描   │   │ + reasonCodes │
 │ spec     │    │ comparator) │   │ + 执行指纹     │   │              │
 └──────────┘    └─────────────┘   └───────────────┘   └──────┬───────┘
                                                              │
 6. 独立重算       5. 封签            4. 证据链落库
 ┌─────────────┐   ┌──────────────┐   ┌──────────────┐         │
 │ 第三方用公开  │◀──│ ProofEnvelope│◀──│ SHA-256 哈希链 │◀────────┘
 │ 算法重算哈希  │   │ proofHash   │   │ + Merkle 根   │
 │ ≠ 则 tampered│   │ + 结论密封   │   │ + 生命周期墓碑 │
 └─────────────┘   └──────────────┘   └──────────────┘
```

关键点：**每一步都产生可验证的痕迹**——统计结果带 testId/pValue/effectSize，
裁决带 decisiveRuleId/reasonCodes，密封带 proofHash，全部进哈希链。
这就是"内容寻址证据链"：证据的地址就是它的内容哈希，篡改任何字节都会让
链头校验失败。

## 2.2 模块地图（src/ 按职责分组）

| 分组 | 模块 | 职责 | 教学章 |
|---|---|---|---|
| **裁决** | `falsifiability/` | R0-R9 内核、FEC 编译、阈值语义 | 03 |
| **统计** | `statistics/` | z/t 检验、效应量、多重比较、功效 | 04 |
| **反剧场** | `anti_theater/` | 22 个欺诈检测器 + lint 聚合 | 05 |
| **证据** | `evidence_log/` | 哈希链、Merkle、生命周期、检索 | 06 |
| **证明** | `far_proof/` · `proof_envelope/` | 证明包导出/验证、封签 | 07 |
| **接口** | `cli/` · `api/` | 25 命令、REST API（Fastify） | 08 |
| **前端** | `frontend/` | 15 页 React+D3 仪表盘 | 09 |
| **数据** | `demo_seeds/` · `benchmark/` · `science_harness/` | 30 科学问题种子、工具链 | 10 |
| **生产** | `db/` · `schema/` · `far_proof/offline_package.ts` | SQLite、迁移、离线包 | 11 |
| **扩展** | `v2_domain/` · `math/` · `llm_gateway/` · `agent_loop/` · `confounding_gate/` | V2 收据、数学验证、LLM 网关、FSM | 12 |

## 2.3 25 个命令全景（far.ts 实测注册，2026-08-06）

按生命周期分组：

### 环境与诊断
| 命令 | 作用 | 退出码契约 |
|---|---|---|
| `far doctor` | 环境自检（Node/pnpm/Python/依赖/原生模块），缺 API key 只 WARN | 0 全绿 / 1 FAIL / 2 WARN |
| `far version` | 打印版本 + git HEAD | 0 |

### 声明与验证（核心链路）
| 命令 | 作用 |
|---|---|
| `far fec` | FEC 编译/冻结（把 claim 变成可执行的测量计划） |
| `far verify` | 独立重算验证 bundle / 证据链（`--bundle` 模式） |
| `far verify-golden` | 14 个 golden vector 过真实内核（`--all` 全跑） |
| `far status` | 单一 SSOT 状态报告（`--db` 校验链头） |
| `far lifecycle` | 撤回/更正/取代生命周期（墓碑式 append-only） |
| `far replay` | 重放 agent 运行轨迹 |
| `far schedule` | 定期重验证（JSON 持久化 + 到期判定） |

### 证据与证明包
| 命令 | 作用 |
|---|---|
| `far export` | 导出 `.far-proof` 证明包（`far-proof` / `receipt` / `receipt-v2`） |
| `far audit-seed-cherry` | 反剧场展示：cherry-pick 夹具过真实检测路径 |
| `far audit-multiseed` | 真实多种子审计（BLS + numpy，检测 seed_cherry） |
| `far backup` | SQLite `VACUUM INTO` 备份，拒绝备份损坏库 |

### 交互与运行
| 命令 | 作用 |
|---|---|
| `far ask` | LLM 生成假设（需要 API key，LLM 只生成不裁决） |
| `far stream` / `far repl` | 流式 / REPL 交互 |
| `far fsm` | 六阶段 FSM 状态推进（`--resume` 崩溃恢复） |
| `far c-astro` | C-ASTRO-0001 在线 TESS 数据集生产接线（lightkurve+MAST） |
| `far real-paper` | 真实论文验证流程（需要数据） |

### 演示与基准
| 命令 | 作用 |
|---|---|
| `far demo` | 一键演示：14 golden vectors + 端到端 claim + 真实统计 claim |
| `far demo tess-offline` | 聚焦 TESS 离线 verdict（诚实标注 UNTESTED 语义） |
| `far bench` | Science-125 benchmark 运行 |
| `far court` / `far arena` | 对抗演示（court=法庭式质询, arena=多引擎对打） |

### 服务
| 命令 | 作用 |
|---|---|
| `far api` | 启动 REST API 服务（Fastify，SIGINT/SIGTERM 优雅关停） |
| `far init` | 初始化工作区 |

## 2.4 动手：跑一遍 `far demo` 并解读

```bash
node src/cli/far.ts demo
```

三段输出对应三个模块：

1. **① 14 Golden Vectors** → `src/falsifiability/verdict_kernel_v2.ts` 的真实规则树。
   每条输出 `PASS GV-0N: <verdict> via <rule>`。Golden vector 是"裁决内核的
   最小行为契约"——它们保证重构内核时行为不漂移。
2. **② 端到端 demo claim（C-ASTRO-0001）** → `src/far_proof/demo_chain.ts`。
   注意它得到 **UNTESTED / NO_DECISION_PATH**——这是**故意的**：种子没注入
   统计量，R6/R7 无法触发。系统宁可拒绝也不假装知道。这就是 fail-closed。
3. **③ 真实统计 claim（C-MMLU-A-0001）** → `src/science_harness/hero_a_pipeline.ts`。
   `oneSampleZTest` 现场算出 p=1.4e-4 → R7 触发 CONFIRMED。对比②：
   **一旦注入真实统计量，内核就能从 UNTESTED 走到 CONFIRMED**——同一套规则，
   不同输入，不同结局。这是理解内核确定性的最佳对照实验。

> 观察点：③ 的 sealed conclusion 是 INCONCLUSIVE 而不是 CONFIRMED——
> 因为 ASK-9 规则：**机器密封层不允许直接产出 CONFIRMED**，必须人工背书。
> 内核可以判 CONFIRMED，但"对外密封"要更保守。

## 2.5 动手练习

1. 跑 `far doctor`，解释每个检查项对应什么依赖。
2. 跑 `far demo`，把三段的 decisive rule 记下来，画一个
   "输入 → 规则 → 输出" 的小表。
3. 跑 `far export far-proof --demo-chain --force && far verify .far-proof`，
   观察 tamperStatus: clean / exit 0。
4. （进阶）`far demo tess-offline` 和 `far demo` 对比，解释为什么
   tess-offline 的 claim 是 UNTESTED 而 MMLU 是 CONFIRMED。

## 自测

- [ ] 能画出 claim → FEC → evidence → kernel → seal → verify 的数据流
- [ ] 能解释为什么 demo ② 是 UNTESTED 而不是 CONFIRMED
- [ ] 能说出 25 个命令里至少 10 个的作用
- [ ] 知道 ASK-9 规则对 CONFIRMED 密封的限制

→ 下一步：[03 信任内核](03_TRUST_KERNEL.md) —— R0-R9 规则树逐条拆解。
