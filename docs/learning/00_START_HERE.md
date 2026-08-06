# FAR-Lab 学习路径 · 从这里开始

> 这不是一份 README 的复述，而是一条**完整的、连贯的、动手的学习路线**。
> FAR-Lab 不是玩具 demo——它是一个真实的 AI4S 科学验证系统：25 个 CLI 命令、
> 22 个反剧场统计欺诈检测器、确定性 R0-R9 裁决内核、内容寻址证据链、可独立重算的
> 证明包。本路径带你把每一层拆开、看懂、亲手验证。

---

## 学完这条路，你将能

1. 说清楚 AI4S（AI for Science）可复现性危机的三个失败模式，以及为什么"生成假设的
   模型不能同时当裁判"。
2. 解释为什么验证层必须用**确定性内核**（R0-R9 规则树）而不是 LLM 打分。
3. 独立走通完整链路：Claim → FEC → Evidence → R0-R9 → Verdict → ProofEnvelope →
   第三方独立重算 → 篡改检测。
4. 读懂 22 个反剧场检测器——每一个检测什么、怎么实现、为什么能抓。
5. 理解 SHA-256 哈希链 / Merkle 根 / 跨语言（TS/Python/浏览器）字节级一致。
6. 亲手导出 `.far-proof` 证明包，篡改一个字节，看系统如何拒绝。
7. 扩展系统：新增一个检测器、一个 benchmark 种子、一个 CLI 子命令。

---

## 三条路径，按身份选

| 你是谁 | 走哪条路 | 预计用时 |
|---|---|---|
| **想快速看到价值**（评委/访客） | 02 系统走查 → 07 证明包（含篡改演示） | 1-2 小时 |
| **系统学习者**（默认） | 00 → 01 → … → 12 全走 | 2-3 天 |
| **扩展者/贡献者**（想给项目加东西） | 01 → 03 → 05 → 10 → 12 | 1-2 天 |

---

## 章节地图

| 章 | 学什么 | 动手产出 | 前置 |
|---|---|---|---|
| [01 问题域](01_FOUNDATIONS.md) | AI4S 可复现性危机、三个失败模式、真实案例（Bem/OSC/LK-99/Theranos） | 说出每个案例被哪个检测器抓 | 无 |
| [02 系统走查](02_SYSTEM_TOUR.md) | 全系统数据流、25 个命令全景、模块地图 | 跑通 `far demo` 并解释每段输出 | 无 |
| [03 信任内核](03_TRUST_KERNEL.md) | R0-R9 规则树、5 值语义、golden vectors、为什么确定性 | 逐条解释 14 个 golden vector 的裁决理由 | 01, 02 |
| [04 统计引擎](04_STATISTICS.md) | z/t 检验、效应量、多重比较校正（Bonferroni/Holm/BH-FDR）、功效 | 用 `src/statistics/` 复算一个 p 值并手工验证 | 03 |
| [05 反剧场检测](05_ANTI_THEATER.md) | 22 个检测器逐个讲：检测什么/实现/绕过尝试 | 对着攻击语料跑检测器，理解 FAIL 路径 | 03, 04 |
| [06 证据链](06_EVIDENCE_CHAIN.md) | SHA-256 哈希链、Merkle 根、跨语言字节一致、生命周期墓碑 | 篡改一条记录，验证链头校验失败 | 03 |
| [07 证明包](07_PROOF_BUNDLE.md) | `.far-proof` 导出 → 独立验证 → 篡改检测全流程 | 导出→验证→篡改→验证 exit 7 | 06 |
| [08 CLI 与 API](08_CLI_AND_API.md) | 25 个命令逐个讲、REST API、退出码契约 | 用 `far doctor`/`far status`/`far verify` 完成一次真实巡检 | 02-07 |
| [09 前端可视化](09_FRONTEND.md) | 15 个页面、D3 图、完整性徽章、i18n | 本地起 `pnpm api` + 前端，走完 Overview→Court | 08 |
| [10 Benchmark](10_BENCHMARKS.md) | 30 个科学问题种子、28 个领域、种子解剖 | 读懂一个种子从 raw input 到 verdict 的全过程 | 03, 04 |
| [11 生产化](11_PRODUCTION.md) | Docker、安全边界、供应链、CI、发布流程 | `docker compose up far-api` 起服务 | 08 |
| [12 扩展指南](12_EXTENDING.md) | 加检测器/加种子/加命令的标准路径 | 新增一个种子并通过测试 | 03-10 |

---

## FAR-Lab 式学习契约

这个项目验证的核心理念，同样适用于你的学习过程：

1. **证据 > 声称**：每章结论都配一个可运行的命令。跑它，看真实输出，再相信。
2. **确定性 > 感觉**：遇到"为什么这个实现长这样"，先读源码再下结论，不猜。
3. **反剧场**：如果某个练习"太顺了"，怀疑自己是否真的走过了真实逻辑路径。
4. **失败路径也是学习路径**：每章都安排了"让它失败"的练习（篡改、错误输入）——
   理解系统如何 fail-closed，比理解它如何 pass 更有价值。

---

## 仓库地图（学习视角）

```
src/
├── falsifiability/      ← 03 信任内核（R0-R9 裁决）
├── statistics/          ← 04 统计引擎（p 值/效应量/多重比较）
├── anti_theater/        ← 05 反剧场检测（22 个检测器）
├── evidence_log/        ← 06 证据链（哈希链/Merkle/生命周期）
├── far_proof/           ← 07 证明包（导出/独立验证/篡改检测）
├── cli/                 ← 08 命令行（25 个命令）
├── api/                 ← 08 REST API（Fastify）
├── demo_seeds/          ← 10 benchmark 种子（32 个真实科学问题）
├── science_harness/     ← 10 科学工具链适配（BLS/astropy 等）
├── fec/                 ← FEC 编排（Falsifiability Evidence Contract）
├── proof_envelope/      ← ProofEnvelope（封签/哈希/独立重算）
├── v2_domain/           ← V2 收据协议（六维保证/生命周期）
├── agent_loop/          ← 六阶段 FSM（agent 运行循环）
├── llm_gateway/         ← LLM 网关（Qwen 等，只生成不裁决）
├── confounding_gate/    ← 混淆门（BLS 等统计陷阱防护）
├── math/                ← 数学验证（SMT/CAS/Lean4/Dafny 后备链）
├── db/  schema/         ← SQLite 存储与 schema 迁移
└── report/  trace/      ← 报告渲染与 session 录制
```

---

## 下一步

→ 从 [01 问题域](01_FOUNDATIONS.md) 开始。如果你只有 1 小时，直接跳
[02 系统走查](02_SYSTEM_TOUR.md) 和 [07 证明包](07_PROOF_BUNDLE.md)。
