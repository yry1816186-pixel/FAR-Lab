# 流式部分 JSON 解析器生态 — Wave-7 源码远征报告（主 Agent 亲读；子 Agent 限速失败后收归主线）

## 0. 调研对象与 license（全部 tarball 亲读）

| 库 | 版本 | License | 体量 | 实读 |
|---|---|---|---|---|
| `partial-json`（npm，JS 系 iw4p 同设计） | 0.1.7 | MIT | 220 行 | ✅ |
| `openai-partial-json-parser`（**OpenAI vendored 版**提取） | 1.1.1 | MIT | 202 行 | ✅ |
| `untruncate-json` | 0.0.1 | MIT | 214 行 | ✅ |
| `partial-json-parser`（JonathanWilbur，OpenAI vendored 的上游血亲） | 1.2.2 | ISC | 288 行 | ✅ |
| `best-effort-json-parser` | 1.5.1 | BSD-2-Clause | 549 行 TS | 结构性浏览（无超出已知机制） |
| promplate/partial-json-parser-js、vectorjson、jsonchunk、@cacheplane/partial-json | — | — | — | npm registry 存在性核验；未深读（同族设计，边际价值低于实读四家） |

## 1. 三个算法家族（伪代码级）

### 家族 A：tokenize→strip→unstrip→regenerate（partial-json-parser :2-272）
截断字符串/数字 token 整个**丢弃**（进行中=尚无值）；括号栈推导缺失闭符追加；重组文本再 `JSON.parse`。**缺陷实证**：`{"a":` → 剥分隔符 → `{"a"}` 非法（键无值场景抛错）。

### 家族 B：递归下降 + Allow 位掩码 + 部分原子前缀补全（partial-json / openai-partial-json-parser，本设计是 LLM 流式事实标准）
```
parseJSON(text, allow=Allow.ALL):
  parseAny: '"'→parseStr; '{'→parseObj; '['→parseArr;
    原子前缀补全: "tru"→true, "nul"→null, "Inf"..→Infinity, "NaN"→NaN
      —— 仅当 (剩余长度<词长 && 词.startsWith(已收前缀) && Allow.X & allow)
  parseStr: 扫到闭引号（转义跟踪）; EOF→加 '"' 再 JSON.parse; 尾部不完整转义→剥到 lastIndexOf('\\')
  parseObj/Arr: 内层 parse 失败时 catch → 返回已收部分（Allow.OBJ/ARR 门控）
  parseNum: 扫到 ,]} 或 EOF; 失败→剥尾部 'e' 段
partialParse = parseJSON(_, Allow.ALL ^ Allow.NUM)   // OpenAI vendored 默认
```
**关键洞见（OpenAI vendored :197）**：默认排除 NUM——**截断数字是"错误值"而非"不完整值"**（"12" 本是 "123" 的前缀，静默给出 12 = 语义失真）。FAR-Lab 流式渐进校验必须继承此纪律。
- NaN/Infinity/-Infinity 作为原子支持（生成 JS 值而非 JSON 值——注意序列化回写问题）。
- 返回**值**而非修复文本（与 jsonrepair 互补：jsonrepair 产文本，家族 B 产值）。

### 家族 C：字符级栈机 + respawn 截断补全（untruncate-json :1-214）
状态栈 {topLevel,string,stringEscaped,stringUnicode,number*,true/false/null,arrayNeeds*,objectNeeds*}；逐字符推进；**respawn 机制**——遇"可能截断点"（逗号后、转义开始）记录回退点，EOF 时回滚到最后安全点再按栈补全（`"` / `0` / 补全 true/false/null 词 / `]` / `}`）。只处理**合法前缀截断**（无损坏修复）——是家族 B 的"文本侧"极简等价物，212 行零依赖。

## 2. SSE tool_calls 增量协议（OpenAI 兼容流式，FAR-Lab strict-FC 流式化所需）

delta 形状：`choices[0].delta.tool_calls[i] = { index, id?, function: { arguments: "<分片>" } }`——**同一 tool call 的 arguments 分片按 index 追加拼接**；首个分片带 id/function.name；finish_reason 在最后 chunk。FAR-Lab 落地面（若做流式）：SSE 行解析（`data: ` 前缀、`[DONE]` 哨兵、注释行忽略）→ 按 index 聚合 tool_calls → arguments 缓冲区增量喂家族 B 解析器 → 渐进 zod 校验。

## 3. FAR-Lab 融合方案草案与判定

**评估结论：渐进校验算法 EXTRACT 可行且低风险；但完整流式面 = 新传输面（SSE 解析器 + provider 差异 + 中断语义），价值/成本比在本 Wave 不成立**：
1. FAR-Lab 单次结构化调用 1.8s e2e 中网络传输占小头；「首字节可校验 ≤1.5s」的收益主体在 UI 进度呈现——而 CLI/Web 目前无渐进渲染面（product 侧另立项）。
2. **但是**：家族 B 的"部分值 + Allow 掩码"对**非流式**截断输出（finish_reason=length 的 max_tokens 截断——我们 maxTokens=8192 硬预算下的真实失败类）有即时价值：截断文档现在直接进纠正性重问（贵）；部分解析 + Allow.ALL^NUM 可先判"已完整子树是否已过 schema"再决定重问/降级。低成本高价值。
3. jsonrepair-EXTRACT 引擎（R20 缺闭引号/R10/R15 缺闭括号）已覆盖"截断补全为文本"路线；家族 B 提供"截断部分值"路线。二者互补：先 repair-to-text（保内容），repair 失败且确属截断（finishReason=length）才 partial-value。

**分层建议**：
- 本 Wave 落地：jsonrepair EXTRACT（主修复）+ 部分值解析器（家族 B 精简 TS 重写 ~150 行，含 Allow 掩码与 NUM 排除纪律）作为 finishReason=length 截断类的确定性前哨（在纠正性重问**之前**）。
- 记注册表 B：完整 SSE 流式面（渐进校验 + 首字节延迟指标 + UI 渐进渲染）——触发=产品立项流式呈现或长输出的 rank/plan 阶段延迟痛点实测。

## 4. 来源清单

- `.cache/repos/partial-json/dist/index.js`（220 行全读）+ `dist/options.js`
- `.cache/repos/openai-partial-json-parser/dist/index.js`（202 行全读，OpenAI vendored 提取版）
- `.cache/repos/untruncate-json/dist/esm/index.js`（214 行全读）
- `.cache/repos/partial-json-parser/partial-json-parser.js`（288 行全读）
- `.cache/repos/best-effort-json-parser/src/parse.ts`（结构性浏览：stripComments 字符串态机 + parse，机制被前四家覆盖）
- npm search `partial-json`（registry.npmjs.org/-/v1/search）存在性核验 2026-08-22
