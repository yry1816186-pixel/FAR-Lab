# FAR-Lab

**Falsifiable · Auditable · Reproducible Research Framework**

一个面向 AI for Science 的可证伪、可审计、可复现研究框架。

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)](https://github.com/yry1816186-pixel/FAR-Lab)
[![Test Coverage](https://img.shields.io/badge/coverage-92%25-green.svg)](./tests)

---

## 项目简介

FAR-Lab 是一个科学假设生成与验证框架,致力于解决 AI 在科学研究中的可信度问题。不同于传统的 "生成式 AI 科学家" 系统,FAR-Lab 强调:

- **可证伪性**: 每个假设都必须包含可验证的方法
- **可审计性**: 所有推理过程都有完整的证据链
- **可复现性**: 跨语言(TS/Python)哈希一致性保证

本项目参加 **XH-202619 揭榜挂帅挑战杯**,赛道一 · 方向 1 · A — "科学假设生成与研究计划设计"。

---

## 核心特性

### 1. 六阶段研究流程

```
理解 → 整合 → 假设 → 证据 → 计划 → 反馈
```

每个阶段都有严格的结构化输出和验证机制。

### 2. 五值裁决系统

| 裁决结果 | 含义 |
|---------|------|
| `CONFIRMED` | 假设通过所有验证 |
| `REFUTED` | 假设被证据反驳 |
| `INCONCLUSIVE` | 证据不足,无法判断 |
| `DEGRADED_SCOPE` | 假设范围缩小但仍有效 |
| `UNTESTED` | 未提交证据 |

### 3. 证据链追踪

- 所有 LLM 调用、数据来源、裁决结果都记录在 append-only 哈希链中
- 跨语言一致性: TypeScript 与 Python 的哈希结果字节完全相同
- SQLite 触发器强制防篡改

---

## 技术架构

```
Frontend (React + Vite)
    ↓ REST API
Backend (Fastify + TypeScript)
    ├── Agent Loop (6-stage FSM)
    ├── LLM Gateway (model-neutral)
    ├── Evidence Log (hash chain)
    ├── Falsifiability Engine
    └── Verification System
        ↓
SQLite (append-only triggers)
```

**核心模块**:
- `agent_loop`: 六阶段 FSM 流程控制
- `llm_gateway`: 模型无关的 LLM 调度层
- `evidence_log`: 证据哈希链管理
- `falsifiability`: 可证伪性检查引擎
- `benchmark`: Science-125 基准测试套件

---

## 快速开始

### 安装

```bash
git clone https://github.com/yry1816186-pixel/FAR-Lab.git
cd FAR-Lab
pnpm install && pip install -e ".[dev]"
```

### 运行测试

```bash
# 运行完整测试套件(约3分钟)
pnpm run ci-all

# 预期结果: 1038 tests pass, 92.80% coverage
```

### 启动服务

```bash
# 启动后端服务
pnpm run dev:backend

# 启动前端界面
pnpm run dev:frontend
```

访问 `http://localhost:5173` 查看 Web 界面。

---

## 项目统计

| 指标 | 数值 |
|------|------|
| 总测试数 | 1,038 (后端 883 + 前端 155) |
| 代码覆盖率 | 92.80% line / 79.56% branch |
| 源代码文件 | 220 files / 31,657 LOC |
| 测试文件 | 81 files / 17,501 LOC |

**技术栈**:
- Backend: TypeScript, Fastify 5, better-sqlite3
- Frontend: React 18, Vite, shadcn/ui, D3.js
- Python: reproducible hash verification, SymPy, NumPy

---

## 示例演示

项目包含 6 个 Science-125 标准问题的完整验证示例:

| 问题 | 领域 | 裁决结果 |
|------|------|---------|
| 脉冲星 P0 | 天文学 | CONFIRMED |
| 行星轨道衰减 | 天文学 | INCONCLUSIVE |
| 蛋白质折叠 | 生物学 | REFUTED |
| 催化剂活性 | 化学 | DEGRADED_SCOPE |
| 碳通量 | 生态学 | CONFIRMED |
| 地震前兆 | 地质学 | UNTESTED |

运行示例:
```bash
pnpm test:demo_seeds
```

---

## 评估标准对照

针对 XH-202619 赛题的六条评价锚:

| # | 评价标准 | 实现机制 |
|---|---------|---------|
| 1 | 闭环链条完整 | 六阶段 FSM + 证据图 DAG |
| 2 | 计划可执行 | Stage 5 输出可执行检查项 |
| 3 | 假设有证据支撑 | 强制 falsification_method |
| 4 | 数据真实影响下轮 | VerdictNode → 下轮调整 |
| 5 | 迭代过程清楚 | AgentRunEvent 因果追踪 |
| 6 | 每轮质量逐步提升 | VerdictNode 版本链 |

---

## 已知限制

我们诚实声明项目的当前限制:

1. **数值域哈希**: 字符串键哈希完全证明,浮点序列化边界尚在 RFC 8785 JCS 迁移中
2. **多模态限制**: 仅支持视觉模态(Qwen-VL),无音频/视频/表格路径
3. **单机架构**: 当前基于 SQLite,多节点 PostgreSQL 在路线图中
4. **Pre-1.0**: API 和 schema 可能变化

---

## 文档导航

- [开发指南](README.dev.md) - W1/W2/W3 里程碑与命令映射
- [变更日志](CHANGELOG.md) - V1 版本发布记录
- [交付报告](DELIVERY_REPORT.md) - 评审提交清单
- [贡献指南](CONTRIBUTING.md) - 设置与 PR 流程
- [安全政策](SECURITY.md) - 漏洞报告与密钥策略
- [前端文档](frontend/README.md) - UI 架构与 API 合约

---

## 许可证

MIT License - 详见 [LICENSE](LICENSE)

---

## 致谢

本项目为 XH-202619 揭榜挂帅挑战杯参赛作品,由阿里云、NAOC、NADC、塔山跨学科创新协会、集思谱联合命题。

本项目不代表阿里云、DashScope、NAOC、NADC 或任何政府机构的官方背书。