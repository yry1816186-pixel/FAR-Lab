# PACKAGE_MANIFEST

**版本：Project-First Agentic Governance Directive 2026.08-v3**
**生成日期：2026-08-05**

## 完整性摘要

- Markdown 文件：24 个（不含本清单）
- 总控提示词：662 行
- 单文件兼容版：9,567 行
- 专业模块：11 个（含 v2 完整基线）
- 可执行模板：8 个
- v2 结构性缺口审计：11 类、88 项
- v2 原文件 SHA-256：`a27776d2af1796ec55982eeae2b4d8ff30b5de36ba465d39651c739e5b240441`
- 包内 v2 基线 SHA-256：`a27776d2af1796ec55982eeae2b4d8ff30b5de36ba465d39651c739e5b240441`
- 原文完整性：`MATCH`

## 文件清单

| 路径 | 字节 | 行数 | SHA-256 | 用途 |
|---|---:|---:|---|---|
| `FAR-LAB_MASTER_PROMPT_V3.md` | 23,680 | 662 | `0ecb3796292afbf8ea3729b2222469cca41c44253df45da06edebfe40862ea96` | 始终加载的执行内核：指令层级、状态机、权限、上下文、恢复、完成定义。 |
| `FAR-LAB_MASTER_PROMPT_V3_MONOLITHIC.md` | 245,879 | 9,567 | `d56a407bb03a65c612bbf6666814e6e219dee6f55d7ee7c5f08564552248859b` | 不支持分层加载时使用的单文件兼容版。 |
| `README.md` | 5,240 | 103 | `b75f175e05794cc81e279f87fbe9e3579f1ba9306ea245e7a52a9ddf886a45fe` | 安装、加载、跨代理使用和重要边界。 |
| `V3_OPTIMIZATION_AUDIT.md` | 26,900 | 493 | `9735bbba72a276330f7d78307631fc274eec08a6496d1132e2f00b18209cc016` | v2 审计、88 项结构性缺口、对标映射和 v3 设计理由。 |
| `modules/MODULE_MANIFEST.md` | 2,740 | 27 | `b94f52d057844bf915ce213ed8e1cd2ffbd721b39edf590108f60b71c4169646` | 阶段到模块的路由、加载预算和冲突规则。 |
| `modules/01_EXECUTION_AND_REPOSITORY_FORENSICS.md` | 9,890 | 343 | `886cfd22830fc58bdaa786b1590429bd6582cad534c2edc34e44a398b44f7f91` | 仓库边界、代码地图、历史、配置、取证和成熟度。 |
| `modules/02_STRATEGY_USERS_PRODUCT_AND_SERVICE.md` | 13,139 | 462 | `32b432a46a99d391e1f327186c6e887209b9f1b3798ad1b8738e598fd8c92706` | 问题、战略、用户、JTBD、服务蓝图、范围和采用。 |
| `modules/03_EXPERIENCE_FRONTEND_HTML5_ACCESSIBILITY.md` | 13,578 | 604 | `8b31508a1bfd62c042e5ccbffb5af15da6333b28cd9e81ab04c985f1768df414` | IA、页面合同、React、HTML5、无障碍、内容和性能。 |
| `modules/04_AGENT_RUNTIME_CONTEXT_MEMORY_AND_ORCHESTRATION.md` | 22,203 | 934 | `e471ac2b4b29feea0a869b25fc137431827f2ea339a2d299e2f0fd91f08a17ce` | 代理循环、工具、权限、sandbox、上下文、会话、记忆、多代理和遥测。 |
| `modules/05_CLI_API_TOOLS_MCP_SKILLS_AND_PLUGINS.md` | 16,013 | 729 | `ede822366f7c8d49d2d32fff150d2340588cee5eb6bd3f7e19b61e7594a76330` | CLI/API/SDK、工具、MCP、ACP、A2A、skills、plugins、hooks 和集成。 |
| `modules/06_DATA_EVIDENCE_SCIENCE_AND_MODEL_GOVERNANCE.md` | 12,914 | 710 | `43390efa37a16c4cb7dacad062eb0060cc40aef40dce91c0746bc8fe736d6e0e` | 数据、血缘、证据、科学评估、复现和模型治理。 |
| `modules/07_SECURITY_PRIVACY_PLATFORM_SRE_AND_SUPPLY_CHAIN.md` | 15,463 | 841 | `1899b149cef17f0f3a9b9b7a67e2f4969a91decc71048dc700e9802a7a5d17e7` | 安全、隐私、法律、部署、SRE、成本和供应链。 |
| `modules/08_EVALUATION_TESTING_RELEASE_DOCS_AND_OSS_GOVERNANCE.md` | 12,818 | 752 | `79e8504b678791833f240f9eb18b979e4e745a68c9a2923268f59f893c256cfd` | 测试、代理/科学评测、发布、文档、支持和开源治理。 |
| `modules/09_DELIVERABLES_MATRICES_AND_TEMPLATES.md` | 11,580 | 592 | `4bc78dbfa92e8632f4569a414390484da3ae2340309fa86752529bba8974b47a` | 权威文档、运行文件、登记册、矩阵和交付验收。 |
| `modules/10_TOP_AGENT_BENCHMARK_PROTOCOL.md` | 15,635 | 609 | `f8de6e8afa36497603819c9f293f75c4c19b64dfbdff88504e6baee26e705f49` | 顶级项目对标、统一能力矩阵、公平评测和超越标准。 |
| `modules/20_V2_DOMAIN_COVERAGE_BASELINE.md` | 57,725 | 1,731 | `a27776d2af1796ec55982eeae2b4d8ff30b5de36ba465d39651c739e5b240441` | 用户原 v2 原文的完整、未摘要兼容基线。 |
| `templates/RUN_STATE_TEMPLATE.md` | 3,440 | 127 | `9abc74b2d10c809ada92c4d52bbdb0459e497fc8283844caf113c5cf9aaae9f0` | 跨会话恢复、上下文和下一原子动作。 |
| `templates/TASK_GRAPH_TEMPLATE.md` | 2,078 | 70 | `a3e8cb511c4fda4553f850424fe7cc821a2611f897e79275da41b614ae206a5e` | 任务 DAG、所有权、预算、验收和并行合并。 |
| `templates/EVIDENCE_LEDGER_TEMPLATE.md` | 1,895 | 43 | `d47a5c9df5c3038ca87a492eb482b51bed352d4f169156da3a6c2aaa8138882f` | 证据定位、等级、新鲜度、冲突和运行证据。 |
| `templates/CLAIM_LEDGER_TEMPLATE.md` | 848 | 16 | `490ccc2c089bab74a420475813a1ef9a296ac31860a647a6bca09ab1acadb6ae` | 主张、反证、可证伪条件、置信度和公开边界。 |
| `templates/SUBAGENT_CONTRACT_TEMPLATE.md` | 1,741 | 75 | `15ced3805f23f92219d76e5ddf1bc0c24c3e6b529686930125d3fb976dbd4972` | 子代理最小上下文、权限、预算、输出和父代理验收。 |
| `templates/COVERAGE_MATRIX_TEMPLATE.md` | 1,577 | 40 | `d7c8bf5faf23fe01eabe4abd7459fbc557cf58e78184a19e55068a555dd585bb` | 九轴、代理轴和科学工作流轴的状态覆盖。 |
| `templates/TRACEABILITY_MATRIX_TEMPLATE.md` | 1,004 | 16 | `ebd0b3b86a387d6694def16c1f0e39f0c626b5936df77f2aadab244e976c7301` | 问题到用户、接口、数据、权限、测试和运维的双向追踪。 |
| `templates/BENCHMARK_GAP_MATRIX_TEMPLATE.md` | 2,248 | 60 | `bba4766f25d6bf936156954941f6494da4efed7e95c9b78b5898ed9d02b34de1` | 同条件能力差距、任务结果、失败和超越判定。 |

## 质量校验

- 所有必需文件存在且非空；
- 所有 Markdown 代码围栏成对；
- 所有文件均为 UTF-8；
- v2 基线与用户上传原文件逐字节哈希一致；
- 单文件版包含总控、模块清单、模块 01–10、v2 基线和全部模板；
- 总控包含模块 10 的强制加载规则；
- 关键执行概念存在：运行状态、任务图、上下文预算、指令冲突、权限三态、sandbox、子代理合同、MCP/ACP/A2A、重放、压缩、评测和开源治理；
- `V3_OPTIMIZATION_AUDIT.md` 的缺口 ID 连续按 A–K 分类，共 88 项；
- 未把提示词设计写成项目实现或领先事实。

## 使用边界

本包提供审计与设计规范，不包含 FAR-Lab 仓库取证结果，不替代实际实现、测试、用户研究、科学验证、安全评估或独立 benchmark。所有随时间变化的项目、协议、模型、标准、法律和依赖信息必须在执行时重新查询当前官方来源。
