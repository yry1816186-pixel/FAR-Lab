# FAR-Lab

**可证伪 · 可审计 · 可复现的 AI for Science 研究框架**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

FAR-Lab 是一个面向科学假设生成与验证的研究框架。它不追求"全自动科学家"的叙事，
而是用确定性的裁决内核与内容寻址的证据链，把 LLM 产出的假设约束在**可证伪、可复算、
可追溯**的工程边界内。

> 本文档不手填测试数、覆盖率等会随版本漂移的精确指标。运行 `pnpm ci-all` 获取当前权威值。

---

## 为什么需要它

大模型生成的科学假设普遍存在三类问题：**不可证伪**（无法被实验否定）、**不可复现**
（换环境结果漂移）、**不可追溯**（结论与证据脱节）。FAR-Lab 用三条机制闭环这三类问题：

- **可证伪性引擎** — 每个假设必须携带可执行的验证方法，否则不予接纳。
- **五值裁决内核** — 确定性规则（非 LLM 裁决）给出 CONFIRMED / REFUTED /
  INCONCLUSIVE / DEGRADED_SCOPE / UNTESTED 五种结论。
- **内容寻址证据链** — 所有证据、裁决轨迹、FEC 契约按 SHA-256 落库，append-only
  触发器防止篡改，跨语言（TypeScript / Python / 浏览器）哈希字节一致。

---

## 核心能力

### 五值裁决系统

| 裁决 | 语义 |
|------|------|
| `CONFIRMED` | 假设通过全部校验 |
| `REFUTED` | 证据否定假设 |
| `INCONCLUSIVE` | 证据不足以判断 |
| `DEGRADED_SCOPE` | 假设范围收窄但仍成立 |
| `UNTESTED` | 未提交证据 |

裁决由确定性内核 `src/falsifiability/verdict_kernel_v2.ts` 给出。LLM 不参与最终裁决——
这是框架的硬约束，由 `pnpm no-llm-judge-scan` 在 CI 中强制。

### 六阶段研究流程

```
理解 → 整合 → 假设 → 证据 → 计划 → 反馈
```

每阶段有结构化输出 schema 与状态机约束，事件按因果链持久化。

### 可验证的完整性

- 证据哈希链（TS `canonicalHash` ≡ Python `canonical_hash`，字节相等）
- 套件级 Merkle 聚合根，浏览器侧可用 Web Crypto 独立重算复核
- 14 条 Golden Vector 用例覆盖五值裁决的全部路径（`golden_vectors/cases/GV-01..14.json`）

---

## 技术架构

```
Frontend (React + Vite, 独立 npm 工作区)
    ↓ REST API
Backend (Fastify 5 + TypeScript)
    ├── agent_loop      六阶段 FSM
    ├── llm_gateway     模型无关调度层（competition adapter 隔离厂商耦合）
    ├── evidence_log    append-only 哈希链
    ├── falsifiability  可证伪性 + 五值裁决内核
    ├── fec             证据链编排 + 冻结契约
    └── anti_theater    反"测试假绿"检测器（20 项）
    ↓
SQLite（append-only triggers · 内容寻址 CAS）
```

---

## 快速开始

### 环境要求

- Node.js ≥ 24
- Python 3.11 / 3.12（可选，启用 SymPy / Z3 数学验证轴）
- pnpm 10.x

### 安装

```bash
git clone https://github.com/yry1816186-pixel/FAR-Lab.git
cd FAR-Lab
pnpm install
node scripts/ensure_py_deps.mjs   # 探测 Python 验证轴，按需安装
```

### 运行测试

```bash
pnpm test            # 主回归套件
pnpm ci-all          # 完整 CI 流水线（含跨语言、覆盖率、扫描门）
node scripts/depth_gate.mjs   # 深度接线门（AST caller 校验 + 账本一致性）
```

### 命令行工具

`far` 命令依赖 Node ≥ 24 原生 type-stripping（bin 直接指向 `src/cli/far.ts`）。克隆后任选其一启用：

```bash
pnpm link --global          # 注册全局 `far`（推荐）
# 或免安装直接调用：
node src/cli/far.ts status          # 等价于 `far status`
node src/cli/far.ts verify-golden --all
```

```bash
far status                # 仓库状态与迁移计数
far verify-golden --all   # 用真实内核裁决跑全部 Golden Vector
far demo                  # 一键演示（14 GVs + demo chain + 真实统计驱动裁决·无需凭据）
far fec compile --claim examples/fec/sample_fec_contract.json --out fec.compiled.json
                          # 编译 FEC 冻结契约（fecHash 重算；示例契约见 examples/fec/）
far export far-proof --demo-chain --out far-proof-bundle   # 导出可独立复算的证明包
far verify --bundle far-proof-bundle                      # 第三方独立重算验证导出包
```

### 全栈运行（API + Web 仪表盘）

```bash
pnpm api                  # 终端 1：启动 REST API @ http://localhost:3000（离线 demo·自动种子裁决数据）
cd frontend && npm install && npm run dev   # 终端 2：Vite 开发服务器 @ http://localhost:5173
```

前端默认连 `localhost:3000`（可用 `VITE_API_BASE_URL` 覆盖）。API 启动即种子 demo 裁决（C-ASTRO-0001·机器裁决 UNTESTED：legacy 路径不注入统计→R6 不触发；真实统计驱动的 CONFIRMED 经 `far demo` 或 hero pipeline 演示），仪表盘可直接查看证据链与裁决。生产模式：`pnpm api --persist ./far-chain.db --protected`（需 `FAR_JWT_SECRET`）。

前端是 `frontend/` 下的独立工作区（React + Vite + Radix + d3 + reactflow）。

---

## Science-125 示例

项目内置覆盖五个领域、五种裁决的基准用例：

| 问题 | 领域 | 裁决 |
|------|------|------|
| 脉冲星 P0 | 天文学 | CONFIRMED |
| 行星轨道衰减 | 天文学 | INCONCLUSIVE |
| 蛋白质折叠（CASP15） | 生物学 | REFUTED |
| 催化剂活性（SAC） | 化学 | DEGRADED_SCOPE |
| 碳通量 | 生态气候 | CONFIRMED |
| 地震前兆 | 地学 | UNTESTED |

```bash
pnpm test:demo_seeds
```

---

## 工程治理

框架用一组机器门把"深度功能是否真接到生产路径"从软规则变成 CI exit code：

- **深度接线门** `scripts/depth_gate.mjs` — AST 校验生产调用方、账本诚实性、统计模块非占位。
- **反剧场扫描** `pnpm anti-theater-scan` — 检测器确定性、LLM 不在裁决回路。
- **零容忍扫描** `pnpm zero-tolerance` — `:any` / 硬编码 secret / 空断言等反模式。

接线状态记录在 `FAR_LAB_MASTER_PLAN/DEPTH_LEDGER.md`（机器可读）。贡献流程见
[CONTRIBUTING.md](CONTRIBUTING.md)。

---

## 已知边界

1. **浮点序列化** — 字符串键哈希完全证明；浮点序列化正迁移至 RFC 8785 JCS 规范化。
2. **多模态** — 当前支持视觉模态（Qwen-VL）；音频/视频/表格路径在路线图中。
3. **单机部署** — 基于 SQLite；多节点 PostgreSQL 为未来工作。
4. **Pre-1.0** — API 与 schema 可能调整。

---

## 文档

- [CONTRIBUTING.md](CONTRIBUTING.md) — 环境搭建、PR 流程、质量门、零容忍规则
- [CHANGELOG.md](CHANGELOG.md) — 版本变更记录
- [SECURITY.md](SECURITY.md) — 漏洞报告与密钥策略
- [FAR_LAB_MASTER_PLAN/](FAR_LAB_MASTER_PLAN/) — 架构与设计文档

---

## 许可证

MIT License — 详见 [LICENSE](LICENSE)。

本项目为 XH-202619 揭榜挂帅挑战杯参赛作品。不代表阿里云、DashScope、NAOC、NADC
或任何机构的官方立场。
