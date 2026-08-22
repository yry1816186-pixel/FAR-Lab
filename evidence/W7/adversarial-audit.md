# W7 融合对抗审计报告（adversarial audit）

- 审计对象：W7-F1（json-repair.ts EXTRACT 移植 + extractJsonText 四层）、W7-F2（截断纪律）、W7-F3（dashscope max_tokens 剥离）及全部测试/证据/文档（未提交，`git diff HEAD`）。
- 审计方法：拒绝导向独立复核。上游对照 `.cache/repos/jsonrepair/lib/cjs/{regular/jsonrepair.js,utils/stringUtils.js}`（本地已解包，ISC）。**本审计全部关键声明均实跑复验**：148 例测试复跑、mutation-check 复跑、基准数字独立复算（审计者自实现 before 链）、上游 vs 移植版分叉实测（node v24.14.0）、百炼官方文档在线复核。
- 结论：**REJECT**（1 P1 + 2 P2；8 P3）。修复面小，见文末修复清单；修复后建议快速复审转 ACCEPT。

---

## 逐项审计结论

### 1. 移植忠实性 — P1（一处实质分叉）+ 其余抽查等价

抽查 12 处关键逻辑对照上游：

| # | 逻辑点 | 移植版 | 上游 | 结论 |
|---|---|---|---|---|
| 1 | parseString 两/三阶段重扫（stopAtDelimiter / stopAtIndex） | json-repair.ts:444-529 | jsonrepair.js:367-469 | 等价 |
| 2 | R19 三启发式（括号平衡 isInsideUnclosedBracket / nextQuoteIsEndQuote / 数字跟随） | json-repair.ts:126-133,497-502,757-763 | jsonrepair.js:433-436 + stringUtils.js:269-280,752-760 | 等价 |
| 3 | parseNumber 回退（!atEndOfNumber → i=start 退还）与前导零→字符串 | json-repair.ts:654-678 | jsonrepair.js:623-650 | 等价 |
| 4 | parseObject 修复分支（前导逗号/缺逗号/尾逗号/缺冒号/缺值补 null/补 `}`） | json-repair.ts:321-380 | jsonrepair.js:209-277 | 等价（上游 :221-231 `processedComma` 死赋值已删，语义不变） |
| 5 | parseArray 修复分支 | json-repair.ts:382-418 | jsonrepair.js:282-322 | 等价 |
| 6 | NDJSON 包裹 | json-repair.ts:420-438 | jsonrepair.js:328-352 | 等价 |
| 7 | parseWhitespaceAndSkipComments do-while → while 重构 | json-repair.ts:218-227 | jsonrepair.js:89-100 | 等价（序列 ws·comment·(ws·comment)* 逐态比对） |
| 8 | HTML 实体（matchHtmlEntity / 双单引号实体开门 / 串内解码） | json-repair.ts:135-168,444-551 | stringUtils.js:183-245 + jsonrepair.js:379-498 | 等价（maxHtmlEntityLength=12 一致；htmlEntityWindow 以 at===i 调用，窗口 [i,i+12) 与上游 slice 一致） |
| 9 | parseUnquotedString / JSONP / MongoDB / URL 防误判 | json-repair.ts:699-737 | jsonrepair.js:678-715 | 等价（上游 :732 缺 return false 为隐式 undefined，truthy 判断等价） |
| 10 | parseKeywords / Python 常量 | json-repair.ts:683-697 | jsonrepair.js:659-671 | 等价 |
| 11 | parseConcatenatedString / parseRegex / 控制字符 / 转义族 | json-repair.ts:602-620,739-749,553-577 | jsonrepair.js:561-582,733-744,499-529 | 等价 |
| 12 | **skipMarkdownCodeBlock 前置空白跳过** | json-repair.ts:277-286（**无** parseWhitespace） | jsonrepair.js:160-161（`parseWhitespace(true);` 在 for 循环前） | **不等价 → P1** |

#### P1-1：skipMarkdownCodeBlock 缺失 `parseWhitespace(true)` — 等价声明被实测证伪

- 上游 `.cache/repos/jsonrepair/lib/cjs/regular/jsonrepair.js:160-161`：
  ```js
  function skipMarkdownCodeBlock(blocks) {
    parseWhitespace(true);   // 移植版缺失：先跳过围栏前的空白（且空白计入 output）
  ```
- 移植版 `src/providers/json-repair.ts:277-286` 直接进 for 循环匹配围栏。
- **实测复现**（本审计，node v24.14.0，上游 cjs vs `--experimental-strip-types` 加载移植版）：

  | 输入 | 上游输出 | 移植版输出 |
  |---|---|---|
  | `' ```json\n{"a":1}\n```'` | `" \n{\"a\":1}\n"`（正确剥栏） | **THROW** `Unexpected character "\"`"` @3 |
  | `'\t```\n{"a":1}\n```'` | `"\t\n{\"a\":1}\n"` | **`[\n\t"\"\"\n,\n{\"a\":1},\n"\"\"\n]"`** — 反引号被当字符串内容、整文档被 NDJSON 数组包裹：可 parse 但语义改写（非 fail-visible） |

- 危害面评估（如实）：
  - 产品链路 `extractJsonText` 第 2 层 fence-strip（src/providers/http.ts:393-395）正则 `^\s*```(?:json)?\s*` 容忍前导空白，stripped 候选通常先行成功；raw 候选仅在 stripped 也失败时进引擎。**现行 provider 调用路径暴露面低。**
  - 但 `repairJson` 是独立导出 API；文件头（json-repair.ts:17-18）、测试头（tests/json-repair.test.ts:5-7）、D-044 三处均声明逐字节 oracle 等价，该声明对"围栏前空白"输入类**不成立**，且其中一类输入会产生语义改写而非 throw——与移植版自己声明的 fail-visible 哲学相悖。
- 语料盲区根因：`spikes/json-repair-corpus.mjs:17-21` 四条 fence 用例（fence-basic/fence-no-lang/fence-array/fence-object）全部从位置 0 开始，无一含前导空白。

#### oracle 74 例等价真实性 — PASS

- `spikes/output/json-repair-oracle.json` 实存 74 条；测试（tests/json-repair.test.ts:27-42）对每条**逐字节 `toBe`** 断言，throw 条目断言 `toThrow(JsonRepairError)`。抽验 7 条含 2 个 throw 条目：
  - `fence-basic` → `"\n{\"a\":1}\n"`（围栏内换行保留，与上游 parseWhitespace 计入 output 的行为一致）
  - `missing-nested-close` → `{"a":{"b":[1,2, {\"c\":3}]}}`；`compound-truncation` → 截断补全正确
  - `inner-quote-live-shape` → 内引号就地转义，内容逐字符保留
  - `missing-end-quote-comma-tail`（R21 stopAtIndex 三阶段）→ `{"a":"b,c","d":"e"}`
  - throw：`inner-quote-digit-after`（Colon expected @16）、`truncated-unicode`（Invalid unicode character）
- 结论：等价断言真实且非装饰性；但覆盖存在 P1 所述盲区（围栏前空白），且 throw 条目断言强度弱于声明（见 P3-1）。

### 2. 内容保真红线 — PASS（一个 P3 声明精度问题）

逐一排查改写路径：
- 字符串内：内容字符原样保留；内引号仅就地插 `\`（json-repair.ts:529,581）；控制字符转义（:548,584）；实体解码（:542-551）。特殊 unicode 空白仅在**结构位置**归一为普通空格（parseWhitespace :236-238），字符串内 `isValidStringCharacter` 放行原字符。
- 无任何"挪动字符串边界"的盲 flip 路径；无法修复时 throw（live 24k 样本双拒测试 tests/json-repair.test.ts:85-94 钉死）。
- 截断补全（R10 :375 / R15 :413 / R20 :477,538）在 allowRepair:true 且 finishReason 非 length 时的验收风险：**存在且构成 P2-2（披露缺失）**，行为本身由 tests/providers.test.ts:405-413（stop 态引擎补全验收）显式锁定——行为是有意的，问题是未上报 finish_reason 的 provider 这一残余风险面未在注释/DECISIONS 画出。
- P3-2：json-repair.ts:8-13 头部声明"only structural characters are inserted, removed, or quote-wrapped"操作集枚举不完整（见 P3 清单）。

### 3. 截断门完整性 — P2-2（默认未披露）+ 机制本身 PASS

- length + direct/fence parse 恰好成功 → 验收：tests/providers.test.ts:388-395（finishReason receipt='length' 仍 ok，1 次调用）。✓
- length + 引擎可修复 → 不修复，走 `appendTruncationCorrection` 专用重问：src/providers/http.ts:767,770 + tests:375-386（断言第二次请求含 TRUNCATED/COMPLETE JSON）。✓
- 重问预算不扩（同一 MAX_INVALID_OUTPUT_RETRIES）、耗尽后 invalid_output fail-visible 且 message 标注截断：http.ts:790-812 + tests:415-425（4 次调用、'truncated at token limit'）。✓
- **finishReason 缺失（undefined）→ 走全链（引擎补全可验收）**：
  - 机制：http.ts:624-629（finish_reason 非字符串 → receipt 不带 finishReason）→ :767 `truncationConfirmed === 'length'` 为 false → allowRepair:true。
  - 该默认**合理**（无法判定时不硬猜截断），但**未披露**：http.ts:386-395 注释与 D-044 均只描述 length 门；"未上报 finish_reason 的 provider 截断输出可被引擎补全验收"这一 fabrication 残余面没有画出。测试只覆盖 length/stop 两态，无 undefined 态用例。→ P2-2。

### 4. 测试判别力 — PASS

- mutation-check 复跑（本审计）：`[CAUGHT] M1 / M2 / M3`，exit 0。脚本逻辑真实：备份→变异→跑对应测试断红→恢复，且带 anchor-not-found 保护（SKIP-MISMATCH 记失败，spikes/mutation-check.mjs:49-52）——不是装饰性检查。
- 无 `expect(x).toBeDefined()` 类装饰断言；oracle 逐字节、live 类逐字符内容断言（tests/json-repair.test.ts:45-51,77-83,98-104）、provider 测试断言 calls.length/receipt/请求体。
- 测试复跑：tests/json-repair.test.ts 86 + tests/providers.test.ts 62 = **148/148 绿**（2026-08-22 11:29，本审计）。
- 弱点归入 P3-1（throw 条目断言强度）。

### 5. 基准诚实性 — PASS（数字独立复算全部吻合）

- BEFORE 链核验：spikes/json-repair-benchmark.mjs:16-47 内嵌 oldChain 与 `git show 3186e1c:src/providers/http.ts`（repairUnescapedQuotes :367-406 + extractJsonText :416-448）**逐分支等价**，含控制字符转义分支（\n/\r/\t/\uXXXX）。转写差异（`raw[i]!`→`charAt`）无语义差。
- AFTER 链：benchmark.mjs:12 引 `.cache/bench/providers/http.js`；该编译产物含 allowRepair/repairJson/truncationConfirmed（与当前源码同步），时间戳 11:23:09 晚于源码最后修改（http.ts 11:21:41 / json-repair.ts 11:10:15）。✓
- **独立复算**（审计者脱离 benchmark.mjs 自行实现 before 链）：broken n=68，before=9，after=68；valid 4/4——与 evidence/W7/repair-benchmark.{md,json} 完全一致。（审计者首版漏控制字符分支得 7，补上该分支后 9——正好对应语料 R25 两条控制字符损坏类，数字自洽。）
- fuzz：benchmark 内嵌 LCG（seed=20260822）确定性；http.ts:421-426 声明的 "796/796" 由 fuzz.mjs（legacy 400/400, distorted 0, threw 0）+ fuzz2.mjs（legacy 396/396）复跑直接证实，796=400+396。
- live 24k 样本 before/after 双 false（均拒）与测试 tests/json-repair.test.ts:85-94 一致。
- latency 数字（0.93→1.39ms）如实记录性能略增，未粉饰。✓

### 6. 文档与决策一致性 — P2-1（决策台账失真）

- **D-044（.control/DECISIONS.jsonl:47）写 "replacing extractJsonText fence-strip+repairUnescapedQuotes (superseded implementation deleted)"；WAVE7-SCOUT.md:28 写 "repairUnescapedQuotes 被取代删除（引擎 R19-R25 超集）"。实况：legacy 保留为第 3 层（src/providers/http.ts:415-489）。**
- 保留的技术理由成立且被本审计复证：fuzz2 复跑 engine threw=2（相邻引号形状 `clon"al … c""lonal`），legacy 396/396——**引擎确实不是 R19-R25 超集**，蓝图假设错误，执行中修正为四层是正确工程决定。
- 但该偏离**只记录在代码注释**（http.ts:427-433，引用 fuzz 证据），DECISIONS 无任何后续条目（本次 diff 新增 3 条 D-046/047/048 全属 W6）；"locked" 决策记录与仓库实况直接矛盾，违反台账真实性。→ P2-1。
- 次要：SCOUT §2 步骤 6（"北极星：structured-output-failure 行更新"）未落地——.control/FRONTIER_STATUS.json 无任何 structured 相关行，本次 diff 仅更新 W6 行（P3-7）；jsonrepair.md:111 "从 GitHub tests/test.js 提取（收口前补）"未执行，语料实为自建规则表用例（P3-4）。

### 7. 安全 — PASS

- 上游包执行面全量 grep：仅 spikes/json-repair-{corpus,fuzz,fuzz2}.mjs 通过 createRequire 引 `.cache/repos/jsonrepair`（确定性数据对比，oracle/fuzz），src/ 与 tests/ **零引用**；benchmark.mjs:12 引用的是自仓编译产物（.cache/bench），非上游。无高权限/网络执行。
- attribution 到位：json-repair.ts:1-6（项目 URL、3.15.0、ISC License、Copyright (c) 2020-2026 Jos de Jong、EXTRACT 声明、D-044/蓝图指针）；wave7-reports/jsonrepair.md §0 有 LICENSE.md 全文亲读记录。
- W7-F3 官方依据独立复核：help.aliyun.com/zh/model-studio/qwen-structured-output 在线确认原文"开启结构化输出时，请勿设置 max_tokens。设置后可能导致JSON字符串在输出过程中被截断，产生无效 JSON"——dashscope.ts:64-66 注释引用属实。
- W7-F3 对照面：deepseek 侧保留 max_tokens 的断言真实存在（tests/providers.test.ts:289 `expect(body.max_tokens).toBe(800)`）。

### 8. 类型纪律 — PASS

- `npm run typecheck` exit 0（本审计复跑）。
- json-repair.ts：无 any、无双重断言、无 @ts-ignore、无吞错；`CONTROL_CHARACTERS[char] ?? char`（:548,584）为编译器满足的兜底，isControlCharacter 已保证 key 存在，无运行时掩盖。
- http.ts：`JSON.parse(raw) as unknown`（any→unknown 收窄出口，类型面合规）；4 处空 catch 均为带注释的有意分层 fall-through（错误由最终 `return null` 显式传递给重问兜底），非吞错。
- P3-8：测试文件两处 `as {…}` 窄断言无依据注释（tests/json-repair.test.ts:81,103），运行时断言兜底，轻微。

---

## 缺陷清单

### P0
无。

### P1
1. **移植忠实性分叉：skipMarkdownCodeBlock 缺上游 `parseWhitespace(true)`**（json-repair.ts:277-286 vs 上游 jsonrepair.js:160-161）。围栏前空白输入类：上游正确剥栏，移植版一例 throw、一例产出 NDJSON 数组语义改写（实测见 §1）。三处"逐字节等价"声明（json-repair.ts:17-18 / tests/json-repair.test.ts:5-7 / D-044）对该输入类不成立；语料未覆盖（corpus.mjs:17-21 全部围栏贴位置 0）。现行产品路径被 extractJsonText 第 2 层 fence-strip 缓冲，暴露面低，但独立导出 API 行为已分叉。

### P2
1. **决策台账失真**：D-044 与 WAVE7-SCOUT 声称 repairUnescapedQuotes "superseded implementation deleted"，实况保留为第 3 层（http.ts:415-489）；引擎非超集的证据（fuzz2 engine threw=2）只在代码注释，DECISIONS 无修订条目。修复：补一条 D-044 修订决策（或新 D 条目）说明四层合成与保留理由，WAVE7-SCOUT 加执行偏离注记。
2. **finishReason 缺失默认未披露**：undefined → allowRepair:true → 引擎截断补全可验收（http.ts:624-629,767）；该残余 fabrication 风险面未在代码注释/D-044 画出，测试无 undefined 态用例。修复：http.ts 注释补一段披露 + providers.test.ts 加 1 例（无 finish_reason 字段 → 引擎补全路径走通并验收）。

### P3
1. throw 条目等价断言强度弱于声明：只 `toThrow(JsonRepairError)`，未断言 position/message 与 oracle 对齐（tests/json-repair.test.ts:33-39 vs 头注释 :5-7 "byte-for-byte including the two throw cases"）。建议补 `expect(() => …).toThrowError(expect.objectContaining({ position: entry.position }))` 类断言（oracle 需先记录 position）。
2. json-repair.ts:8-13 内容保真声明操作集枚举不完整：undefined→null（:730）、True/False/None 归一（:686）、截断数字补零（:631,647,666）、HTML 实体解码（:542-551）超出"仅结构符插入/删除/引号包裹"字面集（行为被 oracle 钉死，仅声明文字过强）。
3. 错误消息越界差异：json-repair.ts:449 用 `text.charAt(i)`（越界→`""`），上游 jsonrepair.js:376 用 `text[i]`（越界→`undefined`）；位置等价，消息不等价（影响面：诊断文本）。
4. jsonrepair.md:111 "upstream tests/test.js 提取（收口前补）"未执行，corpus 为自建规则表用例（corpus.mjs:14-15 自述）——报告承诺与实况不符。
5. spikes/json-repair-benchmark.mjs:13 `newChainNoRepair` 定义未使用（死代码）。
6. `.cache/bench/providers/*.js` 无生成脚本/命令记录（当前同步已验证，复现需猜编译方式）。
7. SCOUT §2 步骤 6"北极星 structured-output-failure 行更新"未落地（FRONTIER_STATUS 无该行，亦无未落地说明）。
8. tests/json-repair.test.ts:81,103 `as {…}` 窄断言缺依据注释（运行时断言兜底）。

---

## 复验命令与退出码（本审计实跑）

| 验证 | 命令 | 结果 |
|---|---|---|
| 测试套 | `npx vitest run tests/json-repair.test.ts tests/providers.test.ts` | 148/148 passed |
| 突变检查 | `node spikes/mutation-check.mjs` | 3/3 CAUGHT，exit 0 |
| 类型 | `npm run typecheck` | exit 0 |
| 基准复算 | 审计者独立实现 before 链（temp 脚本，未入仓） | broken 68: before 9 / after 68；valid 4/4 — 与证据一致 |
| fuzz 复跑 | `node spikes/json-repair-fuzz{,2}.mjs` | 400/400 + 396/396（legacy），engine threw=2（fuzz2） |
| 移植分叉 | node v24.14.0，上游 cjs vs `--experimental-strip-types` | 两个围栏前空白输入行为分叉（§1 表） |
| 官方文档 | help.aliyun.com/zh/model-studio/qwen-structured-output | "请勿设置 max_tokens"警告原文确认 |

## 结论与修复清单

**verdict: REJECT** —— P1 使"逐字节 oracle 等价"核心声明存在实测反例，且其中一例为语义改写而非 fail-visible；P2 两项为台账失真与风险面未披露。工程质量整体高：148 测试可复跑全绿、突变检查真实、基准每个数字可独立复算、上游隔离执行干净、attribution 完整。

修复清单（按序，均为小改）：
1. json-repair.ts skipMarkdownCodeBlock 补 `parseWhitespace(true);`（对齐上游 jsonrepair.js:161）。
2. corpus.mjs 增围栏前空白用例 ≥2（空格/制表符），重跑生成 oracle，测试随之锁定。
3. DECISIONS 补 D-044 修订条目：legacy 第 3 层保留 + 引擎非超集的 fuzz 证据；WAVE7-SCOUT 加执行偏离注记。
4. http.ts 注释补 finishReason 缺失默认披露；providers.test.ts 补 undefined 态 1 例。
5. （可选）P3-1 throw 断言补 position 比对；P3-5 删死变量；P3-7 北极星行补落地或记明未落地原因。

修复 1-4 后可复审；预计一次复审即可转 ACCEPT。
