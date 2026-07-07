# 26_COMPETITION_PDF_STRUCTURE.md — 比赛 PDF 结构

> **来源**：调研优化版 `15_COMPETITION_PDF_STRUCTURE`。本文件给出参赛 PDF 的页面级骨架与「不可写 / 必须降级」红线；内容素材抽取自 `00_PROJECT_BRIEF`、`02_ARCHITECTURE`、`03_EVIDENCE_CONTRACT_AND_VERDICT`、`04_PROOF_ENVELOPE_AND_VERIFIER`、`25_HERO_DEMO_AND_COMPETITION_STORY`。

| 页码 | 标题 | 核心图 | 文字重点/评委感知价值 |
| --- | --- | --- | --- |
| 1 | 封面：真研 FAR-Lab / FAR-Chain | 系统总览图 | 评委一眼知道不是普通 AI 工具 |
| 2 | 问题：AI Scientist 的可靠性缺口 | 失败链路对比图 | 痛点明确 |
| 3 | 核心定位：Proof-Carrying AI Scientist Runtime | claim-to-proof 流程图 | 创新明确 |
| 4 | 赛题适配：Qwen + TESS + 可验证假设 | 赛题要求映射表 | 符合比赛 |
| 5 | 系统架构 | 分层架构图 | 工程可信 |
| 6 | SciIR / FEC | schema 与状态机图 | 可实现 |
| 7 | 五值 deterministic verdict | 裁决优先级图 | 科学诚实 |
| 8 | Evidence Ledger / proofHash | Merkle/ledger 图 | 篡改可检测 |
| 9 | Anti-Theater Harness | 攻击与防御矩阵 | 反伪科研 |
| 10 | .far-proof package | 目录结构图 | 第三方可验证 |
| 11 | Hero Demo：TESS | 光变曲线 + claim graph | AI4S 真实场景 |
| 12 | 现场验证：Your Laptop Is The Verifier | tamper diff 截图 | 冲击力 |
| 13 | 评测设计 | 指标矩阵 | 不是只讲故事 |
| 14 | 开源路线 | repo structure | 国际价值 |
| 15 | 风险与诚实边界 | DO_NOT_CLAIM wall | 可信 |
| 16 | 总结与请求 | 一句话 + 下一步 | 收束 |

## 不能写进 PDF 的话

- “已经完成真实全自动科学发现”。
- “证明 AI 结论为真”。
- “已真实接入百炼并稳定运行”除非有日志。
- “已通过 GPU/CI/比赛平台”除非有证据。
- “比 Co-Scientist/Robin 更强”。

## 必须诚实降级

真实 Qwen API：`NEEDS_API_VALIDATION`；TESS live data：`NEEDS_REAL_ENV`；外部 RO-Crate/PROV validator：`NEEDS_EXTERNAL_VALIDATION`。
