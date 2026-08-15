# FAR-Lab

**一个证据约束、可证伪、可迭代、可追溯的开源 AI Scientist 科研系统。**

> 🎯 **一句话：FAR-Lab 是一个证据约束、可证伪、可迭代、可追溯、可复现边界清楚的开源 AI Scientist
> 研究系统——它从科学问题出发，调用真实文献与数据源生成并比较候选假设，设计可执行研究计划，
> 吸收人工/文献/工具反馈完成修订，并通过确定性验证内核和内容寻址证据链约束模型幻觉与科研表演。**
>
> 产品关系（科学假设生成与研究计划设计）：
> ```text
> AI Scientist 科研生成、证据整合与研究规划主系统   (far research: 生成候选假设 + 比较 + 研究计划)
>                          ↓
> FAR-Lab 确定性可信验证内核                        (R0–R9 裁决 / FEC 可证伪契约 / 内容寻址证据链)
>                          ↓
> 可追溯证据、裁决、版本与复现包                    (.far-proof / ProofEnvelope / 第三方独立重算)
> ```
>
> 🇬🇧 English: [README.md](README.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%E2%89%A524-green.svg)](https://nodejs.org)
[![Python](https://img.shields.io/badge/python-%E2%89%A511-blue.svg)](https://www.python.org)
[![CI](https://github.com/yry1816186-pixel/FAR-Lab/actions/workflows/ci.yml/badge.svg)](https://github.com/yry1816186-pixel/FAR-Lab/actions/workflows/ci.yml)

> Badge 指向**真实** workflow / 事实。CI badge 状态由 GitHub 实时报告，**不伪造**绿。Release /
> PyPI / Docker badge 在相应发布物存在前故意缺失（`NEEDS_RELEASE_PUBLICATION`）。

---

## 30 秒安装

> 一键安装脚本指向 GitHub Release asset。首次 release 发布前（`NEEDS_RELEASE_PUBLICATION`），用下方
> 开发者安装——`far` 命令完全一致。

**macOS / Linux / WSL**（release 发布后）：
```bash
curl -fsSL https://github.com/yry1816186-pixel/FAR-Lab/releases/latest/download/install.sh | bash
far doctor
far demo tess-offline
```

**当前即可用（开发者安装）**：
```bash
git clone https://github.com/yry1816186-pixel/FAR-Lab.git
cd FAR-Lab
pnpm install
pnpm far doctor            # 环境自诊断（无需 key）
pnpm far demo tess-offline # offline demo —— 零凭据
```

> 本项目以源码分发（git clone + pnpm install），不发布到 npm registry。下文所有命令均写作
> `pnpm far <cmd>`（`far` 脚本包装 `node src/cli/far.ts`）；没有 pnpm 时（例如仅有 Node ≥ 24 的
> 裸 git clone）可直接调用 CLI：`node src/cli/far.ts doctor`。`pnpm install` 之后 `far` bin 亦可用
> （或 `pnpm exec far` / `npx far-lab`）。

`far doctor` 在缺少 API key 时只 **WARN**，绝不阻塞 offline 体验，也绝不读取 key 的值。

---

## 2 分钟 Quickstart

```bash
# 1. 用确定性裁决内核跑 14 条 golden vector（offline·无 key）
pnpm far demo
#   → 14/14 golden vectors PASS · end-to-end demo claim sealed · exit 0

# 2. 用确定性裁决内核跑 14 条 golden vector
pnpm far verify-golden --all

# 3. 导出证明 bundle（步骤 4 篡改演示需要先导出）
pnpm far export far-proof --demo-chain --force

# 4. 看篡改检测实战（macOS / Linux / WSL bash）
mkdir -p /tmp/tampered && cp -r .far-proof /tmp/tampered
sed -i 's/UNTESTED/CONFIRMED/' /tmp/tampered/proof_envelopes.jsonl
pnpm far verify /tmp/tampered
#   → tamperStatus: tampered · recomputation.node: fail · exit 7

#    Windows (PowerShell 7+):
#   New-Item -ItemType Directory -Force tampered | Out-Null
#   Copy-Item -Recurse .far-proof tampered
#   (Get-Content tampered/proof_envelopes.jsonl) -replace 'UNTESTED','CONFIRMED' | Set-Content tampered/proof_envelopes.jsonl
#   pnpm far verify tampered
```

完整 CLI 参考：`pnpm far --help`（分组总览）· 单命令用法：`pnpm far <cmd> --help`。

---

## 科研主流程（三分钟 walkthrough）

```bash
# 1. 运行纵向切片（研究可行性门 → 真实文献检索 → 3-5 个候选假设 → 独立批判 → 研究计划）。
#    检索无需 key（OpenAlex 免费）；模型调用需要 DASHSCOPE_API_KEY
#    （profile 默认 auto：有 key 即 LIVE；无 key 则 fail-closed 并给出指引——见下）。
#    长任务逐阶段 checkpoint 到 .far/research-runs/<runId>/ —— Ctrl+C 诚实取消
#    （state=CANCELLED，已完成阶段保留），崩溃/取消后可 resume。
pnpm far research start "Does stellar activity inflate hot Jupiter radii?" --out run.json
pnpm far research status <runId>     # 生命周期状态 + 逐阶段进度（8 阶段）
pnpm far research resume <runId>     # 从 checkpoint 续跑已崩溃/已取消的 run

# 2. 真实数据分析（NASA Exoplanet Archive live TAP 抓取）。
#    领域门控：非系外行星课题会被拒绝，绝不用错误数据集硬算。
pnpm far research analyze run.json --live
#   → n=392 颗热木星，r=0.587，p<0.001（相关性≠因果——如实表述）

# 3. 专家反馈 → 不可变修订 → 前后计划比较：
pnpm far research feedback run.json --file feedback.json
pnpm far research compare run.json

# 4. 程序化指标 + 确定性重算：
pnpm far research evaluate run.json

# 5. 导出哈希钉住的复现包 + 第三方验证（篡改 → exit 7）：
pnpm far research export run.json --out bundle
pnpm far research verify bundle

# 6. 同样的闭环可通过 Web 工作台 + REST API 使用（异步 + SSE）：
#    pnpm dev   →  API @ http://localhost:3000 + Web 工作台 @ http://localhost:5173
#                  （一条命令同时启动两者；Ctrl+C 同时停止）
#    pnpm api   →  POST /api/v1/research（202 + runId）· GET /research/<id>/status
#                  GET /research/<id>/events（SSE 进度）· POST /research/<id>/cancel
```

**运行模式诚实标注**：每个阶段记录 `modelExecutionMode` / `retrievalExecutionMode` /
`experimentExecutionMode`；聚合 `runMode` 仅当所有影响科学的组件均为 live 时才为 `LIVE`，
否则如实显示 `MIXED` / `RECORDED_REPLAY`，绝不伪装成 live。

---

## LIVE 评估（冻结评估集）

冻结评估集（`src/research/evaluation/frozen_eval_set.json`）以 `scripts/run_frozen_eval.mjs` LIVE 实测
（百炼真实 Qwen + 真实文献检索；确定性层独立重算）：

| 题目 | 模式 | 语料 | 假设数 | 引用绑定 | 可证伪 | 反证查询 | 计划完整度 | 确定性重算 |
|---|---|---|---|---|---|---|---|---|
| hero：热木星半径膨胀 | LIVE | 37 | 3 | 1.00 | 1.00 | 8 | 1.00 | PASS |
| Science-125：地震预测 | LIVE | 28 | 3 | 1.00 | 1.00 | 8 | 1.00 | PASS |
| Science-125：室温超导 | LIVE | 21 | 3 | 1.00 | 1.00 | 8 | 1.00 | PASS |
| Science-125：暗物质自相互作用 | **BLOCKED（限流）** | — | — | — | — | — | — | — |

记录于 2026-08-14 本节所述 commit。如实声明：第 4 题因当日 live 运行总量触发了**全部三家**文献 API 的
HTTP 429 限流而受阻 — 检查点已保存可续跑（`far research resume <runId>`），限流解除后一条命令即可重生成全表。
人工 rubric 维度（科学合理性/新颖性/计划可执行性）**有意不自动评分** — 仅列出供盲评。同一脚本可从
fresh clone + `DASHSCOPE_API_KEY` 复现上表每一个数字。

---

## 项目解决什么问题

大模型生成的科学假设普遍存在三类问题：**不可证伪**（无法被实验否定）、**不可复现**
（换环境结果漂移）、**不可追溯**（结论与证据脱节）。FAR-Lab 用三条机制闭环：

- **可证伪性引擎** — 每个被接纳的 claim 必须携带可执行的证伪规范（指标 + 阈值 + 比较方向），
  否则在入口即被拒。
- **五值裁决内核** — 由**确定性**规则（R0–R9，**非 LLM**）给出裁决：`CONFIRMED` / `REFUTED` /
  `INCONCLUSIVE` / `DEGRADED_SCOPE` / `UNTESTED`。
- **内容寻址证据链** — 所有证据、裁决轨迹、FEC 契约按 SHA-256 落入 append-only 日志；跨语言
  （TypeScript / Python / 浏览器）哈希字节一致。篡改可检测。

---

## 它不是什么

- ❌ **不**证明科学真理。demo 裁决由 **offline fixture** 产出，非真实科学裁决。
- ❌ **不**用 LLM 作最终裁决者。LLM 生成假设；确定性 R0–R9 内核裁决。
- ❌ **不是**「全自动科学家」——假设/计划生成器与验证器是分离角色，研究计划的
  `humanApprovalRequired`（人工批准门）是一等公民。
- ❌ **不**声称物理不可篡改或完全可复现——见「已知边界」。

---

## 核心概念

| 概念 | 含义 |
|------|------|
| **Claim（声明）** | 可证伪的科学声明 + 其证伪规范（指标/阈值/比较方向） |
| **Evidence（证据）** | 测量/观测，按 SHA-256 内容寻址，落入 append-only 哈希链 |
| **Verdict（裁决）** | 五值之一，由确定性 R0–R9 内核给出（优先级：`DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED`） |
| **ProofEnvelope（证明信封）** | 密封的、带 proofHash 的裁决工件，第三方可独立复算 |
| **`.far-proof`** | 自验证 offline bundle（claim graph + redacted chain + proofHash），`far export far-proof` 导出 |
| **FEC** | Falsifiability Evidence Contract——冻结的、带哈希的测量/统计计划 |

深入：见上方概念表与 `far <command> --help`（每条命令的契约与退出码）。

---

## Offline demo（无需 API key）

```bash
pnpm far demo tess-offline
```

全程 offline：14 条 golden vector 经真实 R0–R9 内核，再跑端到端 TESS 声明（`C-ASTRO-0001`）经
FEC 编排 → 内核裁决 → fail-closed 密封。要验证持久化 bundle，先运行
`pnpm far export far-proof --demo-chain --force` 导出，再用 `far verify .far-proof` 验证。

---

## Live provider（Qwen / DashScope / 百炼）

> **`NEEDS_API_KEY`** —— 真实推理计费，默认绝不运行。

```bash
export DASHSCOPE_API_KEY=sk-...          # 切勿提交；见 SECURITY.md
pnpm far ask "<question>" --profile competition_aliyun_qwen

# 代表性 live 路径：真实 Qwen 生成 + 真实 OpenAlex 检索一次完成
# 无需 --profile：默认即 auto —— 设了 DASHSCOPE_API_KEY 就是 LIVE
pnpm far research start "Does stellar activity inflate hot Jupiter radii?" --source openalex
```

**没有 key 时**：`pnpm far research start` **fail-closed**（exit 2）并给出可操作指引——绝不用
合成 fixture 伪造你问题的答案。两条无 key 路径：`pnpm far ground "<question>"`（真实文献检索，
免费无需 key）；或显式 `pnpm far research start "<q>" --profile offline_replay` 接线演示
（`runMode=RECORDED_REPLAY`；证明的是管线接线——引用绑定、确定性评分、Pareto 前沿、计划设计——
**而非**任何科学结论）。确定性验证内核（`pnpm far demo` / `pnpm far verify-golden` /
`pnpm far verify`）零 key 全程 offline。

核心门与 offline demo **无需**此 key 即可运行。CI 的 `competition_qwen_smoke` 是条件门，无 key
时 graceful skip。Provider 配置：见 `.env.example`。

---

## Docker

```bash
docker compose up far-demo      # 一次性 offline TESS demo（无 key）
docker compose up far-api       # 长驻 API server @ http://localhost:3000（offline）
```

默认镜像跑 offline demo / 匿名 API，**绝不**要求 key。要用真实 provider，显式传 env 文件：
`docker compose --env-file .env up far-api`。

> `NEEDS_DOCKER_BUILD_VALIDATION`：镜像本地构建；发布到 GHCR 属 release workflow（`NEEDS_GHCR_PUBLISH`）。

---

## 文档导航

- 本 README（[English](README.md) + 中文）即文档主面：快速开始、安装、架构、概念与命令参考（`far --help` / `far <command> --help`）。
- 仓库刻意只分发源码与面向用户的文档，扩展内部文档不入仓。

---

## 开发者指南

```bash
pnpm install --frozen-lockfile
node scripts/ensure_py_deps.mjs   # 探测 Python 轴（缺失则 graceful skip）
pnpm typecheck && pnpm lint && pnpm test
```

`make bootstrap` / `make verify` / `make demo` 在 macOS/Linux 可用（Windows 直接用 pnpm 命令）。
详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 测试

```bash
pnpm test            # 主回归套件
pnpm run test:py     # Python 验证轴（SymPy / Z3 · 缺失则 graceful skip）
```

套件覆盖 canonical hash、五值裁决、FEC、proof envelope、反剧场与跨语言一致性。
真实后端轴（SymPy/Z3/Dafny/Lean）按环境 skip。

---

## 安全与诚信边界

- **LLM 不作最终裁决者** —— 五值裁决由确定性 R0-R9 内核给出，LLM 绝不裁决。
- **禁手填裸统计数字** —— p 值 / effect size 由 `src/statistics/` 真实算出，绝非字面量。
- **反剧场** —— 23 项检测器抓「假绿测试」（看似绿实则未走真实逻辑）。
- **密钥绝不入库** —— `.env` 已 gitignore；见 [SECURITY.md](SECURITY.md)。
- 真实 API / 真实数据 / 真实 GPU 用量均显式标注 `NEEDS_API_VALIDATION` / `NEEDS_REAL_ENV` /
  `NEEDS_GPU_VALIDATION` / `NEEDS_HUMAN_OPERATION`。

---

## Contributing

见 [CONTRIBUTING.md](CONTRIBUTING.md)。所有改动提交前必须通过
`pnpm typecheck && pnpm lint && pnpm test`。

---

## Citation / License

若本工作有用，请引用：见 [CITATION.cff](CITATION.cff)。

**MIT License** —— 见 [LICENSE](LICENSE)。本项目为独立开源项目，不代表阿里云、DashScope、NAOC、NADC 或任何机构的官方立场。

### 已知边界

1. **浮点序列化** —— 字符串键哈希完全证明；浮点序列化正迁移至 RFC 8785 JCS 规范化。
2. **多模态** —— 当前支持视觉（Qwen-VL）；音频/视频/表格在路线图中。
3. **单机部署** —— 基于 SQLite；多节点 PostgreSQL 为未来工作。实测吞吐为消费级 SSD 上
   O(10²) 行/秒追加 + O(10⁴) 行/秒索引查询（单进程）。不适合高并发多写生产环境
   （>100 并发写入者 → 使用 PostgreSQL）。
4. **1.x 早期阶段** —— API 与 schema 可能在 1.x 线内调整。遵循 semver：破坏性变更升 minor
   版本（1.0 → 1.1），并保留至少一个 minor 版本的弃用窗口。
5. **跨语言哈希范围** —— 字符串键哈希在 TypeScript/Python 间字节一致（CI 验证）；
   浮点键哈希是第 1 项的 V3 RFC 8785 工作；浏览器端 ProofEnvelope 验证器尚未接线（#13）。
6. **TESS demo 科学保真度** —— 离线 demo 使用确定性合成光变曲线（box transit，
   无临边昏暗/污染）与粗粒度 BLS 网格（120 周期）。Bonferroni α'=0.0125 是预登记固定阈值
   （F8），**不是**真实 TESS 频率网格试验因子校正。这是诚实的教学简化，非生产 TESS 验证管线。
7. **CONFIRMED 语义** —— FAR-Lab 的 `CONFIRMED` 裁决含义是"合同一致性有界支持"
   （contract-consistent bounded support），**不是**天文学的"确认系外行星"（后者需要
   RV mass / TTV 证据）。demo 产出的天文学候选应读作 VALIDATED / CANDIDATE。
8. **反剧场运行时接线** —— 23 个反剧场检测器已在离线 `verify` 中完整接线（bundle 重算、
   23 检测器重跑比对），**并已接入生产裁决路径**：science-harness 流水线真跑 `runAntiTheaterLint`
   并把 findings 注入 FEC，内核 R4 / ANTI_THEATER_FAIL 规则据此触发。诚实的缺口在数据而非接线
   —— 多种子 demo 跑在确定性合成光变曲线上；真实在线 TESS 多种子验证是待补的数据项。
9. **篡改检测范围** —— 无密钥 SHA-256 链检测**朴素**篡改（攻击者不重算哈希）。**可选的**
   Ed25519 bundle 签名收窄"一致伪造"窗口：`far sign <bundle> --key <sk.pem>` 生成
   `<bundle>.sig.json` sidecar，`far verify --bundle` 自动校验（加 `--pubkey <pk.pem>` 做公钥
   归属）。攻击者若无私钥却重算被签文件 → 验证失败。仍超出范围：公钥归属是组织 PKI 流程，
   同时持有私钥+写权限的攻击者可重签（DEF-18，V-04）。
10. **确定性 FSM 而非百炼 Agent**（T-035）—— FAR-Lab 使用自研确定性 FSM
    （`src/agent_loop/fsm_runner.ts`）而非阿里云百炼 Agent / 应用编排。这是有意设计：
    FSM 确定性且完全可追溯（每个阶段转换记入 `evidence_log`），而百炼 Agent 是黑盒编排层，
    会破坏可复现性。百炼 Agent 集成是 V2 评估项（若能保持确定性追踪兼容）。
11. **可复现性范围 —— 运行环境漂移** —— `.far-proof` bundle 锁的是**证据**（内容寻址哈希、
    篡改可检测），但与 Docker capsule 不同，**不**锁完整运行环境。为让环境漂移**可检测**，
    每个 bundle 的 `data_manifest.json` 现携带 `envFingerprint`（node/python 版本、平台、架构），
    `far verify --bundle` 在验证环境与录制环境不一致时发出 `ENV_DRIFT` 警告。这只是披露，非保证：
    同版本仍可能因传递依赖而漂移，完整环境锁定（Docker/WholeTale 式）是 V2 项。

## 免责声明（Disclaimer）

FAR-Lab 是**纯研究工具**。其输出为未经人体验证的 AI 生成研究猜想——**非医疗建议**、非临床
验证知识。系统不产出任何临床、剂量或处方内容：确定性临床安全层（`src/discovery/safety/`）
对剂量/处方/人身伤害类请求 fail-closed 拒答，并对临床/流行病/毒理/心理干预类内容强制附加
双语"非医疗建议"横幅。该筛选是词法启发式——无法识别全部可临床行动的内容，也不能替代
监管审查。**任何健康决策前请咨询执业医师。**

12. **图表证据不在范围内（v1）** —— FAR-Lab 的证据管线摄入文本元数据与摘要，以及结构化
    实验观测；**不**从论文图表（效应量曲线/谱线/散点趋势）提取定量证据。主要依赖图表证据
    的 claim 会显示证据覆盖不完整——这是设计上的诚实呈现——直至图表转数据提取落地
    （图像理解 vs 矢量化 PDF 解析两路线 ADR 评估中，赛后轨道）。
