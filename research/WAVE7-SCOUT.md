# WAVE7-SCOUT — 结构化输出与模型面基础设施源码远征 shortlist（2026-08-22）

> 八线侦察全部落档 `research/wave7-reports/`（instructor / jsonrepair / streaming-partial-json / zod-v4-tojsonschema / failure-taxonomy / provider-strict-diff / constrained-decoding-libs 紧凑）。环境注记：子 Agent 全 10 路因 ZCode 账户级限速（1302）阵亡，主线收归——jsonrepair/zod/流式/分类学/provider 五线由主 Agent 亲读亲测，instructor 报告为阵亡 Agent 遗留完整稿（file:line 已抽验通过），outlines/xgrammar/lm-format-enforcer/guidance 为 license 核验 + 适用性判定（深钻诚实收敛，见该报告 §3）。

## 0. 防重复核对（对照注册表与前 Wave）

- jsonrepair：WAVE3 #10 曾 REJECT（引包破 zod-only）——本 Wave 按用户指令以 **EXTRACT 算法路径重访**，不引包 ✅ 不冲突。
- strict-FC 默认传输（D-026/D-030）不动；本 Wave 机制与其互补（修复层/纪律层），零回退 prompt-only。
- LiteLLM REJECT 维持；四家约束解码库（本地解码器）learn-only（我们 API 侧）。

## 1. Shortlist（EV 排序，license+安全+zod-only 已逐项审）

| # | 融合项 | 来源（license） | EV | 决策 | 要点 |
|---|---|---|---|---|---|
| **W7-F1** | **jsonrepair 修复状态机 EXTRACT → TS 零依赖**（38 规则全量，作为 extractJsonText 第 4 层；legacy 引号扫描**保留**为第 3 层） | josdejong/jsonrepair 3.15.0（**ISC**，实证） | **高** | **GO（已执行）** | live 最高频损坏类（内引号 ~20% @≥20k、控制字符）+ 截断补全 + 词法族一次性覆盖；蓝图=wave7-reports/jsonrepair.md §1-2；**执行修正**：fuzz 实证 legacy 层在邻接双引号形状上独占修复面（引擎抛出），且 live 全样本（冒号歧义类）两层都正确拒绝→重问兜底——故保留两层（引擎非超集），与 D-029 拒绝的"盲目 flip-retry"的本质区别（合法性判定+内容零改写）记入 D-044/D-049 |
| **W7-F2** | **截断纪律**（finishReason=length 分道：修复优先→"更简洁"重问；部分值永不静默验收——instructor IncompleteOutput 不重试哲学 + openai-partial-json NUM 排除洞见） | instructor v2 retry.py（MIT，实读）+ openai-partial-json-parser（MIT） | **中高** | **GO** | 现状：截断输出与普通 invalid_output 同队列同参重赌（3 次重问浪费在大概率再截断上） |
| **W7-F3** | **DashScope 提交路由 max_tokens 剥离** | 百炼官方文档（2026-08-18 版全文精读） | **中** | **GO** | 官方逐字：结构化输出+max_tokens → "可能导致 JSON 字符串在输出过程中被截断"。我们默认 maxTokens=8192 恒发——提交路由的官方确认截断根因 |
| W7-F4 | zod v4 z.toJSONSchema 替代手写投影 | zod 3.25.76（MIT，同包） | 低 | **KEEP 现状** | v3 schema 无法喂 v4（`reading 'def'` 实测）；输出需再变换（$ref/allOf/propertyNames 超出端点子集）；手写投影 live 验证 41/41。反转触发=全仓 zod/v4 迁移 |
| W7-F5 | 部分值解析器（partial-json 家族 B 精简 TS 重写） | partial-json 0.1.7 / openai-partial-json-parser（均 MIT） | 中（未来） | **DEFER→B** | 接受路径有静默丢尾风险（截断数组过 schema=伪造完整）——红线不碰；价值在流式 UI 渐进呈现与诊断，触发=流式面立项 |
| W7-F6 | SSE 流式渐进校验面 | 同上 + instructor M3/M7 | 中（未来） | **DEFER→B** | 触发=产品立项流式呈现或长输出延迟痛点实测 |
| W7-F7 | re-ask 消息形状按通道分化（role:"tool" 应答） | instructor M2 | 低 | **DEFER→B** | 现形状 live 证实有效（0d1706e ~99% 恢复）；改动需 live A/B（D-036 阻断中） |
| W7-F8 | token_budget 跨重试预算 | instructor retry.py | 低 | **DEFER→B** | 我们重问率低，痛点未实证 |
| W7-F9 | Mode×Provider 声明式能力矩阵 | instructor M1/M5 + provider-strict-diff §5 | 中 | **DEFER→B**（F3 为其最小前哨） | 触发=第二家 provider 需差异传输（B-QWEN key 到位即触发） |
| — | 四家约束解码库深钻 | outlines/xgrammar(Apache-2.0)/lmfe/guidance(MIT) | 低 | **learn-only→B** | 我们无本地解码；反转触发见 constrained-decoding-libs.md §1 |

## 2. 执行计划（W7-F1 → F2 → F3，串行落地）

1. **F1**：`src/providers/json-repair.ts`（新，~600 行，ISC attribution）；`extractJsonText` 改为 direct-parse → engine → null 三步；`repairUnescapedQuotes` 被**取代删除**（引擎 R19-R25 超集，删被取代实现=宪法纪律）；测试：38 规则逐条用例 + live 损坏语料（strict-fc-corrupted-args.json argsFull 真实 24k 样本）+ 负路径（合法文档零改写、无望输入 null 不抛）+ mutation 抽查。
2. **F2**：`runOpenAICompatStructuredCall` invalid_output 分道——`finishReason==='length'` 的失败用截断专用纠正指令（"output was TRUNCATED at the token limit; produce the COMPLETE JSON more concisely"）；llm-tolerance/providers 测试扩展。**红线**：不引入部分值验收。
3. **F3**：dashscope.ts 请求体剥 max_tokens（官方警告合规）+ providers 测试。
4. **基准**：损坏语料修复率 before/after（同语料同口径，主 Agent 复算）；语料=规则表变体×live 样本（确定性，无 LLM）。
5. **live e2e**：D-036 维持（wave 开启探针 402 已存档）→ 如实 BLOCKED + 债务记录（恢复后按 D-026 模板补验）。
6. 北极星：structured-output-failure 行更新——live 分母不可得，如实记 deterministic 修复率证据 + 402 阻断说明；strict-FC e2e ≤2s 无回退（修复层为纯函数，无传输路径变化，由测试+代码路径论证）。

## 3. 横切发现（不进融合但入档）

- 失败分类学全表（wave7-reports/failure-taxonomy.md）：FAR-Lab 已实证 8 类 vs 生态常见未观察 ~10 类 vs 理论——D1 类型静默转换为语义红线不做。
- DashScope json_schema 严格模式存在（Qwen3.7/3.8-Max 窄面）+ type-数组可选字段形状（≠DeepSeek anyOf）——B-QWEN live 探测时的升级路径。
- instructor"codeblock 取最后一个完整 JSON"防注入决策——我们 strict-FC 下无此暴露面（content 通道才相关），记档。
