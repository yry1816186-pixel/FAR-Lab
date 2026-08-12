# FAR-Lab

**可证伪 · 篡改可检测 · 可独立复算的 AI for Science 研究框架**

> FAR-Lab 是面向 AI4S 科学声明的**声明级验证层**。它不追求「全自动科学家」叙事，而是用
> 确定性裁决内核与内容寻址证据链，把 LLM 产出的假设约束在**可证伪、可复算、可追溯**的工程
> 边界内。
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
node src/cli/far.ts doctor            # 环境自诊断（无需 key）
node src/cli/far.ts demo tess-offline # offline demo —— 零凭据
```

`far doctor` 在缺少 API key 时只 **WARN**，绝不阻塞 offline 体验，也绝不读取 key 的值。

---

## 2 分钟 Quickstart

```bash
# 1. 用确定性裁决内核跑 14 条 golden vector（offline·无 key）
node src/cli/far.ts demo
#   → 14/14 golden vectors PASS · end-to-end demo claim sealed · exit 0

# 2. 用确定性裁决内核跑 14 条 golden vector
node src/cli/far.ts verify-golden --all

# 3. 导出证明 bundle（步骤 4 篡改演示需要先导出）
node src/cli/far.ts export far-proof --demo-chain --force

# 4. 看篡改检测实战（macOS / Linux / WSL bash）
mkdir -p /tmp/tampered && cp -r .far-proof /tmp/tampered
sed -i 's/UNTESTED/CONFIRMED/' /tmp/tampered/proof_envelopes.jsonl
node src/cli/far.ts verify /tmp/tampered
#   → tamperStatus: tampered · recomputation.node: fail · exit 7

#    Windows (PowerShell 7+):
#   New-Item -ItemType Directory -Force tampered | Out-Null
#   Copy-Item -Recurse .far-proof tampered
#   (Get-Content tampered/proof_envelopes.jsonl) -replace 'UNTESTED','CONFIRMED' | Set-Content tampered/proof_envelopes.jsonl
#   node src/cli/far.ts verify tampered
```

完整 CLI 参考：`node src/cli/far.ts --help`。

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
- ❌ **不是**通用 AI4S benchmark。它是验证层。
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

深入：[docs/concepts/far-proof.md](docs/concepts/far-proof.md) · [docs/concepts/evidence-ledger.md](docs/concepts/evidence-ledger.md)

---

## Offline demo（无需 API key）

```bash
node src/cli/far.ts demo tess-offline
```

全程 offline：14 条 golden vector 经真实 R0–R9 内核，再跑端到端 TESS 声明（`C-ASTRO-0001`）经
FEC 编排 → 内核裁决 → fail-closed 密封。要验证持久化 bundle，先运行
`node src/cli/far.ts export far-proof --demo-chain --force` 导出，再用 `far verify .far-proof` 验证。

---

## Live provider（Qwen / DashScope / 百炼）

> **`NEEDS_API_KEY`** —— 真实推理计费，默认绝不运行。

```bash
export DASHSCOPE_API_KEY=sk-...          # 切勿提交；见 SECURITY.md
node src/cli/far.ts ask "<question>" --profile competition_aliyun_qwen
```

核心门与 offline demo **无需**此 key 即可运行。CI 的 `competition_qwen_smoke` 是条件门，无 key
时 graceful skip。配置：[docs/providers/qwen-dashscope.md](docs/providers/qwen-dashscope.md)

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

- [快速开始](docs/quickstart.md) · [安装](docs/installation.md)
- 概念：[far-proof](docs/concepts/far-proof.md) · [evidence-ledger](docs/concepts/evidence-ledger.md)
- Provider：[Qwen / DashScope](docs/providers/qwen-dashscope.md)
- 治理：[发布流程](docs/governance/release-process.md) · [发布计划](docs/governance/OPEN_SOURCE_RELEASE_PLAN.md)

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
- **反剧场** —— 22 项检测器抓「假绿测试」（看似绿实则未走真实逻辑）。
- **密钥绝不入库** —— `.env` 已 gitignore；见 [SECURITY.md](SECURITY.md)。
- 真实 API / 真实数据 / 真实 GPU / 比赛提交均显式标注 `NEEDS_API_VALIDATION` / `NEEDS_REAL_ENV` /
  `NEEDS_GPU_VALIDATION` / `NEEDS_HUMAN_OPERATION`。

---

## Contributing

见 [CONTRIBUTING.md](CONTRIBUTING.md)。所有改动提交前必须通过
`pnpm typecheck && pnpm lint && pnpm test`。

---

## Citation / License

若本工作有用，请引用：见 [CITATION.cff](CITATION.cff)。

**MIT License** —— 见 [LICENSE](LICENSE)。本项目为 XH-202619 揭榜挂帅挑战杯参赛作品，不代表
阿里云、DashScope、NAOC、NADC 或任何机构的官方立场。

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
   23 检测器重跑比对）。生产路径运行时接线为 V2 路线图项，等待真实 multi-seed 数据。
9. **篡改检测范围** —— 无密钥 SHA-256 链检测**朴素**篡改（攻击者不重算哈希）。
   重算全部公开哈希的一致伪造（consistent forgery）超出 V1 范围（DEF-18，V-04 PoC）。
   V2 将以 Ed25519 签名收窄此窗口。
10. **确定性 FSM 而非百炼 Agent**（T-035 · 评委04）—— FAR-Lab 使用自研确定性 FSM
    （`src/agent_loop/fsm_runner.ts`）而非阿里云百炼 Agent / 应用编排。这是有意设计：
    FSM 确定性且完全可追溯（每个阶段转换记入 `evidence_log`），而百炼 Agent 是黑盒编排层，
    会破坏可复现性。百炼 Agent 集成是 V2 评估项（若能保持确定性追踪兼容）。
