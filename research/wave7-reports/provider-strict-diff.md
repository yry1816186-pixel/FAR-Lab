# Provider 结构化输出差异 — Wave-7 横切报告 B（主 Agent 撰写；DashScope=官方文档全文精读，DeepSeek=仓内 live 证据，其余未取=如实标注）

## 1. DashScope/百炼（提交路由 B-QWEN——最高优先级，官方文档 2026-08-18 版全文精读）

来源：help.aliyun.com/zh/model-studio/qwen-structured-output（WebReader 全文，逐字引用在案）

| 项 | 内容 |
|---|---|
| 双模式 | `json_object`（宽模型面：Qwen 全系+Kimi/GLM/DeepSeek/Stepfun）与 `json_schema`（**严格模式**：`{"type":"json_schema","json_schema":{name, strict:true, schema}}`，OpenAI 同形状） |
| json_schema 支持模型 | **仅 Qwen3.7-Plus / Qwen3.7-Max / Qwen3.8-Max 系列**（窄面） |
| 支持子集 | 类型：string/number/integer/boolean/object/array/**enum**；required（可选字段可不列入）；additionalProperties:true/false；**可选字段官方推荐 `type:["string","null"]`+required**（type 数组，非 anyOf——与 DeepSeek anyOf 子集不同！） |
| **max_tokens 禁用警告** | 官方原文：开启结构化输出时"请勿设置 max_tokens……设置后可能导致 JSON 字符串在输出过程中被截断，产生无效 JSON"。**我们 http.ts 默认 maxTokens=8192——DashScope 路由须去掉**（截断类失败模式的官方确认根因） |
| json_object 提示词要求 | messages 必须含 "json" 字样否则 400（我们 JSON_ONLY_SUFFIX 恒满足） |
| 思考模式 | 思考态下 response_format 可能失效（不报错但非严格 JSON）；官方两步修复法：思考模型出内容 → 便宜 json 模型修复格式 |
| 有效性校验建议 | 官方建议 json_object 输出过 jsonschema/Ajv 校验 + 失败重试/改写——与我们 zod 语义权威 + 纠正性重问架构同构（独立印证） |

## 2. DeepSeek（仓内 live 证据，D-026/D-029/D-030）

- strict-FC beta（`beta` base URL + tools strict:true）：子集=object/string/number/integer/boolean/array/enum/**anyOf**（anyOf-null 实证可用）；**bare-{} 子 schema 400 / 无 properties 对象 400 / 无 items 数组 400**（live 探测）；无 min/maxLength（live e2e：min-length 约束不执行，zod 兜底）。json_object：宽支持。
- 41/41 tool_calls 零失败全管道 live 验证（run_prrxcee6）。

## 3. OpenAI（既有知识定位=未重取文档，标 UNVERIFIED-本轮；D-026 时代官方 docs 曾核）

response_format json_schema strict（首调编译、全 required+additionalProperties:false、unsupported keywords 白名单、refusal 语义）——形状与 DashScope json_schema 同族。**本轮未重取官方页**，不作新断言依据。

## 4. 其他（Anthropic/Gemini/Mistral/vLLM）

未取材（限速收敛）——记 UNVERIFIED，不入决策。反转触发：多协议接入立项。

## 5. FAR-Lab 模型无关网关差距与建议（feed 融合计划）

1. **传输协商缺失**：http.ts 硬编码两态（tools-strict / json_object），DashScope 的 json_schema response_format 形状（+type-数组可选字段 +max_tokens 禁用）没有承载位。建议：provider 配置面增 `structuredTransport` 能力声明（learn from instructor M1 声明式矩阵思想，代码量小），DashScope 先落 json_object（现行为）+ 记 json_schema 升级路径（B-QWEN key 到位后 live 探测再启用，沿用 D-026 模板）。
2. **maxTokens 官方冲突**：DashScope 路由须不设 max_tokens（官方截断警告）——并入 provider 能力声明（`omitMaxTokens: true`）。这同时是截断失败模式（A1）的一家官方根因确认。
3. 提交路由合规链就绪度：DASHSCOPE key 到位 → live 探测 json_schema 模式（Qwen3.8-Max）→ 若可用，提交传输=服务端 schema 强制（与 DeepSeek strict-FC 同级保证）。

## 6. 来源

- help.aliyun.com/zh/model-studio/qwen-structured-output（全文 WebReader，2026-08-22；含 json_schema 精确形状/子集/模型面/max_tokens 警告/两步修复法）
- evidence/W-EV2/strict-fc-live-verification.md、spikes/output/strict-fc-*.json（DeepSeek live 证据）
- research/wave7-reports/instructor.md M1（Mode×Provider 声明式矩阵思想）
