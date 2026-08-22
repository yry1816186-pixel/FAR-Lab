# outlines / xgrammar / lm-format-enforcer / guidance — Wave-7 紧凑报告（license 核验 + 适用性判定；深钻因环境限速收敛——诚实边界见 §3）

## 0. License 核验（2026-08-22，GitHub API + raw 实证）

| 库 | SPDX | 证据 |
|---|---|---|
| dottxt-ai/outlines | Apache-2.0 | raw.githubusercontent LICENSE 头部亲读 + API |
| mlc-ai/xgrammar | Apache-2.0 | api.github.com `license.spdx_id` |
| noamgat/lm-format-enforcer | MIT | raw LICENSE 亲读（Copyright (c) 2023 Noam Gat） |
| guidance-ai/guidance | MIT | api.github.com `license.spdx_id` |

## 1. 适用性判定（核心结论）

四家均为**本地约束解码器**（编译 schema/grammar→token 掩码，插入采样循环）：
- outlines：regex/JSON Schema→FSM/CFG（interegular+outlines-core）；xgrammar：JSON Schema→EBNF→自适应 token 掩码（bitmask 压缩、跨 token 约束）；lm-format-enforcer：schema→字符级 CharacterLevelParser（consume_character 状态推进 + 允许字符集→token 白名单）；guidance：模板 interleaved 生成（{{gen}}/{{select}} 编译为确定性段+生成槽，llguidance 文法）。

**FAR-Lab 是 API 侧**（DeepSeek strict-FC beta 服务端约束 + zod 客户端校验）：
1. 约束编译分类学的对照价值已由**更强证据取代**——DeepSeek beta 端点的真实子集是 live 探测的（D-029：bare-{} 400/无 properties 400/anyOf-null 可用），不是文档推断；我们投影的边界以运行时实证为准。
2. 字符级状态机价值（lm-format-enforcer 的字符串状态推进）被 jsonrepair 的字符串机器（R17-R28）覆盖——后者直接作用于我们的损坏面（模型输出修复），前者作用于解码约束面（我们无本地解码）。
3. 流式渐进校验所需算法已从 partial-json 家族实读获得（streaming 报告）。

**判定：learn-only，全部不入融合路径**。记注册表：
- B（缓延）：四家约束解码源码深钻——反转触发：(a) FAR-Lab 引入本地推理/流式 token 级约束；(b) zod→JSON Schema 投影重构为 schema-based（届时 outlines/xgrammar 的关键词支持表为对照基准）。
- C（拒绝当下）：任何形式的本地解码约束引擎引入——违反最小架构（无本地模型面）与 zod-only（C++/Python 组件不可入运行时）。

## 2. 已知机制要点（公开文档级，非深钻——不作为融合依据）

- outlines 对 unsupported JSON Schema 关键词采 warn-and-ignore 策略（vs 我们 UNPROJECTABLE 整体回退——服务端 400 硬约束下 warn-continue 不可行，我们的哨兵策略正确）。
- xgrammar 的 schema→EBNF 拒绝表与其编译预算（深度限制）与我们投影 depth>12→UNPROJECTABLE 同型。
- lm-format-enforcer 的 JsonSchemaParser 字符级消费与 jsonrepair 字符串机器同族思想（状态推进+分隔符前瞻）。

## 3. 诚实边界

本轮**未做**四库源码逐 file:line 深钻（环境限速致子 Agent 全灭，主 Agent 上下文预算优先给了决策依赖线：jsonrepair/流式/zod/instructor/失败分类学）。§2 要点为公开文档级陈述，**不入 DECISIONS 证据链**；若任一缓延触发条件成立，按本报告 §1 重开深钻。
