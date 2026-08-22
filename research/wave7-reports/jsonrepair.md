# jsonrepair 3.15.0 — Wave-7 源码远征报告（主 Agent 亲读；子 Agent 因账户级限速失败后收归主线）

## 0. 元信息

- **对象**：`jsonrepair` npm 3.15.0（= josdejong/jsonrepair 最新；tarball 实读，本地 `.cache/repos/jsonrepair/`）
- **License**：**ISC**，Copyright (c) 2020-2026 by Jos de Jong（`LICENSE.md` 全文亲读；package.json `"license": "ISC"` 一致）。ISC 为宽松许可，EXTRACT 算法重写 + 保留 attribution 合规。
- **体量**：`lib/cjs/regular/jsonrepair.js` 786 行（非流式，递归下降）；`streaming/core.js` 869 行（同规则流式栈机版）+ `streaming/stack.js` 50 + `utils/stringUtils.js` 280。**移植选型：regular 版**（无缓冲机制，最简忠实）。
- **架构**：递归下降 + `output` 字符串重写模型。修复 = 通过 `insertBeforeLastWhitespace` / `stripLastOccurrence` / `removeAtIndex` / `insertAt` 编辑输出流，再由调用方 `JSON.parse` 复核。**无独立 cut 选项**——截断补全（缺 `}`/`]`/闭引号）内建于主算法（v3 变化）。

## 1. 完整修复规则清单（regular 版逐条，file:line = `.cache/repos/jsonrepair/lib/cjs/regular/jsonrepair.js`）

### 1.1 根级（jsonrepair() 主体 :46-82）
| # | 规则 | 位置 | 触发→动作 |
|---|---|---|---|
| R1 | markdown 围栏剥离（开：```` ``` ````/`[``` `/`{``` `+语言标签；闭：```` ``` ````/```` ```] ````/```` ```} ````） | :50,:55,:143 | `parseMarkdownCodeBlock` 跳过围栏与语言说明符 |
| R2 | NDJSON→数组 | :60-67,:328 | 根值结束后遇新值起点且输出尾为 `,`/`\n` → 补逗号 + 输出包 `[\n...\n]` |
| R3 | 根级尾逗号删除 | :68-70 | 值后仅剩 `,` → `stripLastOccurrence(',')` |
| R4 | 冗余闭括号删除 | :74-77 | 根结束后残留 `}`/`]` → 跳过 |

### 1.2 对象（parseObject :209-277）
| # | 规则 | 触发→动作 |
|---|---|---|
| R5 | 前导逗号跳过 | `{,"a":1}` → 跳过 `{` 后的 `,` |
| R6 | 成员间缺逗号 | 上一成员结束后直接是键起点 → `insertBeforeLastWhitespace(',')` |
| R7 | 尾逗号删除 | 键解析失败且当前是 `}`/`{`/`]`/`[`/EOF → 剥最后 `,` |
| R8 | 缺冒号 | 键后直接是值起点或截断 → `insertBeforeLastWhitespace(':')` |
| R9 | 缺值 | 冒号后无值 → 补 `null` |
| R10 | 缺 `}` | 输入耗尽 → `insertBeforeLastWhitespace('}')`（截断补全） |
| R11 | 省略号 `...` 跳过（含可选逗号） | :192-204 |

### 1.3 数组（parseArray :282-322）
| # | 规则 | 触发→动作 |
|---|---|---|
| R12 | 前导逗号跳过 | `[,1,2]` |
| R13 | 元素间缺逗号 | `insertBeforeLastWhitespace(',')` |
| R14 | 尾逗号删除 | |
| R15 | 缺 `]` | `insertBeforeLastWhitespace(']')`（截断补全） |
| R16 | 省略号跳过 | |

### 1.4 字符串状态机（parseString :367-556，最深件；两阶段）
开门：双引号（正）、单引号/智能引号（`'` `‘` `’` `` ` `` `´`，同类开同类闭 :388）、HTML 实体（`&quot;` `&#x22;`，stringUtils.js:183-231）。
| # | 规则 | 触发→动作 |
|---|---|---|
| R17 | 单引号/智能引号→双引号 | 同类闭引号匹配，输出统一 `"` |
| R18 | 整串转义前缀 `\"...\"` | 首字符 `\`+引号 → 剥首个 `\` 进入 skipEscapeChars 模式（模式内逐个跳过转义符 :549-552） |
| R19 | **未转义内引号** | 闭引号候选后非分隔符 → 在该输出位置插 `\`（:464-469）；三项校验：`isInsideUnclosedBracket`（stringUtils.js:269-280 括号平衡计数）、`nextQuoteIsEndQuote`（越过此引号看下一引号后是否分隔符 :752-760）、闭引号后跟数字（`"a"5`） :433-436 |
| R20 | **缺闭引号（两阶段）** | 一阶段假设有合法闭引号；EOF/失败时二阶段 `stopAtDelimiter` 重扫——停在第一个分隔符处补 `"`（:395-418,:470-486）；尾随分隔符触发（`["hello,` 之类 :398-406） |
| R21 | 逗号在引号前 | `{"a":"b,c,"d":...}` → 闭引号应在逗号前 → 以 `stopAtIndex` 三阶段重扫（:447-453） |
| R22 | 截断 `\u` 修复 | EOF 处不完整 `\u26` → 丢弃该转义（:514-517） |
| R23 | 无效转义符 | `\x` → 剥反斜杠保字符（:525-528） |
| R24 | `\<newline>` | → `\n`（:521-524） |
| R25 | 控制字符 | → `\n`/`\r`/`\t`/`\b`/`\f` 转义（:537-540） |
| R26 | 拼接字符串 | `"a" + "b"` → `"ab"`（parseConcatenatedString :561-582） |
| R27 | HTML 实体内容解码 | 串内 `&amp;` 等 → 解码为内容字符（:487-498） |
| R28 | URL 防误判 | `https://` 的 `//` 不当注释；URL 字符集继续吞（:475-480,:711-715，regexUrlStart/regexUrlChar） |

### 1.5 数字（parseNumber :587-653）
| # | 规则 | 触发→动作 |
|---|---|---|
| R29 | 前导零 | `00123` → **输出为字符串** `"00123"`（保内容不造数 :599-602,:649） |
| R30 | 缺前导零 | `.5`→`0.5`；`-.5`→`-0.5`（:607-611） |
| R31 | 截断数字 | `2.`→`2.0`；`2e`→`2e0`；`-`（EOF）→`-0`（:594-597,:614-617,:634-637） |
| R32 | 非数字结尾回退 | 数字后不是分隔符/空白/EOF → `i=start` 退还给非引号串解析（:645-648，如 `1.2.3` → 字符串） |

### 1.6 关键词/非引号串/注释
| # | 规则 | 位置 |
|---|---|---|
| R33 | Python 常量 `True`/`False`/`None` → `true`/`false`/`null`；`undefined`→`null` | :659-671,:725 |
| R34 | 非引号键/值 → `JSON.stringify` 引号化 | :678-732 |
| R35 | JSONP `callback({...});` / MongoDB `NumberLong("2")` 解包 | :682-705 |
| R36 | 正则字面量 `/.../` → 字符串 | :733-744 |
| R37 | 块/行注释剥离 | :122-142 |
| R38 | 特殊 unicode 空白（nbsp/零宽等 8 类）→ 空格 | :101-120 + stringUtils.js:38-46 |

**关键语义**：`NaN`/`Infinity` 不特判——走非引号串路径变成**字符串** `"NaN"`（内容保真，不做 null 猜测）。FAR-Lab 侧由 zod 裁决。

## 2. 状态机骨架（TS 重写蓝图）

```
repairJson(text): string | throws RepairError
  i=0; output=''
  parseMarkdownCodeBlock(开)
  if !parseValue() throw UnexpectedEnd
  parseMarkdownCodeBlock(闭)
  ... 根级 R2-R4 ...
  if i<len throw UnexpectedCharacter
  return output

parseValue() = parseObject() || parseArray() || parseString() || parseNumber()
            || parseKeywords() || parseUnquotedString(false) || parseRegex()
parseObject(): '{' → 循环{成员= parseString()||parseUnquotedString(isKey); 缺冒号/缺值修复} → '}' 或补 '}'（R10）
parseString(stopAtDelimiter=false, stopAtIndex=-1):
  开门判定（R17/R18/实体）→ 两/三阶段循环：
    EOF → 尾分隔符? 二阶段重扫 : 补 '"'（R20）
    闭引号候选 → [stopAtDelimiter || EOF || 分隔符且非未闭括号内 || 下一引号判定 || 数字跟随] ? 收串(+拼接 R26)
                : 前字符是 ','? stopAtIndex 重扫（R21）: 前字符是分隔符? stopAtDelimiter 重扫（R20）
                : 否 → 插 '\\' 继续（R19）
    '\' 转义族（R22-R24）、控制字符（R25）、实体（R27）、URL（R28）
parseNumber(): 符号/前导零/整数/小数/指数 各段修复；atEndOfNumber 校验（R29-R32）
```

## 3. FAR-Lab 移植判定

- **EXTRACT（GO，核心融合）**：regular 版全量状态机重写为 `src/providers/json-repair.ts`（纯函数、零依赖、ISC attribution 注释）。替代 extractJsonText 现三步中的 fence-strip + repairUnescapedQuotes 两步（引擎内含 R1 围栏与超集内引号规则 R19-R21）；保留 `JSON.parse` 直通第一步（合法文档零改写不变量）与失败→纠正性重问兜底。
- **与 D-029「拒绝结构翻转重试」的关系（须在 DECISIONS 记录）**：jsonrepair 的内引号修复与缺闭引号补全同属"结构判定"类，但其判定是**我们已接受的闭引号合法性规则的严格超集**（括号平衡+下一引号+数字三项附加校验降低误判），且内容字符零改写（只加 `\`、`"`、`}`、`,`、`:` 等结构符或引号化）——与被拒的"盲目 flip-retry"（可移动串边界、语义失真）不同级。以 live 损坏语料测试钉死行为。
- **语义风险红线**：R29 前导零输出为字符串（zod number 会拒→重问，诚实）；NaN→"NaN"（同上）。不添加 null 猜测。
- **不移植**：流式版（buffer 机制）——FAR-Lab 修复层处理完整文本；流式渐进校验是另一融合线。

## 4. 测试语料来源

upstream 测试不在 npm tarball 内——**已履行（审计 P3-4 后续）**：src/index.test.ts 经 GitHub API 取回（.cache/repos/jsonrepair-upstream-test.ts，923 行），仅改导入指向移植版后全套入仓为 tests/json-repair-upstream.test.ts——**78/78 绿（约 400 断言，含错误消息断言）= 等价性最强证明**；本地基线：`spikes/output/strict-fc-corrupted-args.json`（live 损坏 tool args，errPos=4854 内引号类）+ 本报告规则表逐条最小用例（每规则 1-2 个 before/after）。

## 5. 来源清单

- `.cache/repos/jsonrepair/lib/cjs/regular/jsonrepair.js`（786 行全读）
- `.cache/repos/jsonrepair/lib/cjs/streaming/core.js`（869 行全读——同规则流式版，用于交叉验证规则清单）
- `.cache/repos/jsonrepair/lib/cjs/streaming/stack.js`、`lib/cjs/utils/stringUtils.js`（全读）
- `.cache/repos/jsonrepair/LICENSE.md`（ISC 全文）、`package.json`
