# W7 审计 followup 记录（P1/P2 修复 + P3 清扫，2026-08-22）

对应 `adversarial-audit.md`（verdict REJECT 1P1+2P2+8P3）修复清单逐条：

| 审计项 | 处置 | 证据 |
|---|---|---|
| P1 skipMarkdownCodeBlock 前置空白 | **已修**（对齐上游 :161 `parseWhitespace(true)`）+ 语料补 3 例围栏前空白（space/tab/newline；oracle 74→83 的另 6 例为实体/URL 类，与本 P1 无关）→ oracle 83 例逐字节等价复验 | src/providers/json-repair.ts `skipMarkdownCodeBlock`；spikes/json-repair-corpus.mjs |
| P2-1 决策台账失真 | **已修**：D-044b 修订条目（legacy 第 3 层保留 + fuzz 引擎非超集证据）；WAVE7-SCOUT F1 行已改"保留" | .control/DECISIONS.jsonl D-044b |
| P2-2 finishReason 缺省未披露 | **已修**：http.ts 截断门注释补披露段 + providers.test.ts 补 undefined 态用例（无 finish_reason → 全链走通验收，行为锁定） | src/providers/http.ts；tests/providers.test.ts |
| P3-1 throw 断言强度 | **超越修复**：上游 src/index.test.ts（923 行）经 GitHub API 取回，仅改导入后全套入仓 `tests/json-repair-upstream.test.ts`——**78/78 绿（约 400 断言，含上游错误消息/位置断言）**，等价性强于 position 比对 | tests/json-repair-upstream.test.ts（生成脚本 spikes/make-upstream-test.mjs） |
| P3-2 头声明操作集枚举 | **已修**：json-repair.ts 头部声明改准确（引号包裹/裸 token 归一/undefined→null/Python 常量/截断数字/HTML 实体均列出，且指明被上游套钉死） | json-repair.ts 文件头 |
| P3-3 EOF 错误消息字符 | **已修**：throw 站点经 `charAtOrUndefined`（上游 `text[i]` 越界=undefined 语义） | json-repair.ts |
| P3-4 上游测试提取承诺 | **已履行**（见 P3-1）；jsonrepair.md §4 已更新为实况 | research/wave7-reports/jsonrepair.md |
| P3-5 死变量 | **已删**（benchmark.mjs newChainNoRepair） | spikes/json-repair-benchmark.mjs |
| P3-6 bench 重生命令 | **已记**（benchmark.mjs 头部注释含精确 tsc 命令） | 同上 |
| P3-7 北极星行 | **核实为审计误读**：审计在 FRONTIER_STATUS 找该行，实际账本 eval/north-star.json structured-output-failure 行 W7 更新在案（已提交 c21e5bf）；顺手把 detail 中陈旧数字 9/68→68/68 校正为终值 12/75→75/75 | eval/north-star.json |
| P3-8 断言窄化注释 | **已补**（两处 `as` 前注依据） | tests/json-repair.test.ts |

修复后复验（命令级）：`npx vitest run tests/json-repair.test.ts tests/json-repair-upstream.test.ts tests/providers.test.ts tests/llm-tolerance.test.ts` = **245/245**；`npm run typecheck` exit 0；`node spikes/mutation-check.mjs` = 3/3 CAUGHT。

## 独立复审（fresh agent，2026-08-22）

复审员与首轮审计、主 Agent 修复均为不同会话。拒绝导向，只验修复声明；全部关键项命令级实跑。

**verdict: ACCEPT**（首轮 1 P1 + 2 P2 全部实证修复；另记 3 条非阻断残留观察，见文末，均不构成回退理由）。

### 逐项核验结果

**1. P1（skipMarkdownCodeBlock）— PASS，实测逐字节一致**
- 代码在位：`src/providers/json-repair.ts:283-284` `skipMarkdownCodeBlock` 首行为 `parseWhitespace(true); // upstream: fences may carry leading whitespace (upstream regular :171)`，与上游 `.cache/repos/jsonrepair/lib/cjs/regular/jsonrepair.js` 的 `skipMarkdownCodeBlock` 逐行对齐。
- 首轮两个分叉输入 node 实测（node v24.14.0，上游 cjs `require` 加载 vs 移植版 `--experimental-strip-types`，比对 `{kind,out}` / `{name,message,position}` 全字段 JSON.stringify）：
  - `' ```json\n{"a":1}\n```'` → 上游 `" \n{\"a\":1}\n"`，本地 `" \n{\"a\":1}\n"`，逐字节相等（首轮本地 THROW）。
  - `'\t```\n{"a":1}\n```'` → 上游 `"\t\n{\"a\":1}\n"`，本地 `"\t\n{\"a\":1}\n"`，逐字节相等（首轮本地 NDJSON 语义改写）。
- 复审加测 7 例围栏前空白变体（newline 前导 / 多空格 / 尾随文本 / 无闭合 / `\t`+大写 JSON / CRLF / 双围栏）：全部与上游逐字节相等，修复无新分叉。
- **加测（超出任务要求）**：全部 83 条 oracle 输入对上游跑全量差分——81 条输出逐字节相等；2 条 throw 条目 base message 与 position 相等（唯一差异为 message 格式后缀/error name，见残留观察 A）。

**2. 上游套真实性 — PASS，强于抽查**
- `diff .cache/repos/jsonrepair-upstream-test.ts tests/json-repair-upstream.test.ts`（CRLF 归一后）显示**全部差异**仅为：(a) 新增 8 行溯源头注释；(b) 3 行上游导入 → 1 行重定向导入（`repairJson as jsonRepairRegular, JsonRepairError as JSONRepairError from '../src/providers/json-repair.js'`）；(c) implementations 数组删 streaming 项并改名 `farlab-EXTRACT-port`；(d) 删除上游两个流式专属段落（`jsonrepair streaming` describe + `createStreamingRepairWrapper`，依赖未移植的 `jsonrepairCore`）。**测试体零改动**——比抽查 3 处更强的全文级证明。
- 自跑：`npx vitest run tests/json-repair-upstream.test.ts` → **78/78 passed，exit 0**。

**3. P2-2（finishReason 缺省披露 + undefined 态用例）— PASS**
- `src/providers/http.ts:761-772` 截断门注释已含缺省披露原文：*"Providers that do NOT report finish_reason (undefined) fall through to the full repair chain: an actually-truncated doc could then be engine-completed and accepted — a disclosed residual risk (our registered providers all report finish_reason; D-030 live evidence 41/41)"*。注释引用的 D-030 实存于 `.control/DECISIONS.jsonl:32`（41/41 finishReason 记录属实）。
- `tests/providers.test.ts:414-431` undefined 态用例在位：`finish_reason: undefined`（经 JSON.stringify 后字段整体缺席，真实模拟"provider 未上报"），输入为截断形状 `'{"hypothesis": "unflagged structural omission'`，断言 `res.ok === true`、单次调用、引擎补全内容被验收——缺省行为已锁定。单独点名跑：`npx vitest run tests/providers.test.ts -t "ABSENT finish_reason"` → **1 passed（62 skipped），exit 0**。

**4. P3 清扫抽查 — PASS**
- P3-2 头声明：`json-repair.ts:8-20` 操作集已完整枚举（结构符插入/删除、quote-wrap 裸 token、就地转义、undefined→null、Python True/False/None、截断数字、HTML 实体），并声明双 oracle（83 条 corpus + 上游套 78/78）。与实测行为相符。
- P3-3：`charAtOrUndefined` 实存（`json-repair.ts:23-25`），用于全部 3 个 `Unexpected character` throw 站点（:213、:456、:515）。加测 3 例 EOF 输入（`{"a"`、`{"a": "b`、`[1, 2`）：错误 name/message/position 与上游**逐字节相等**。
- P3-5：`rg -n "newChainNoRepair" spikes/ src/ tests/` 零匹配，死变量已删。
- P3-6：`spikes/json-repair-benchmark.mjs:8-11` 头注释含精确重生命令（`npx tsc src/providers/http.ts --outDir .cache/bench --module nodenext --moduleResolution nodenext --target es2022 --strict --skipLibCheck`）。
- P3-8：`tests/json-repair.test.ts:81,103` 两处 `as {…}` 前均有 `// cast justified: …` 依据注释。
- 范围外防注水抽查（对照表其余声明）：D-044b 实存（`.control/DECISIONS.jsonl:53`，如实记录 P1/P2-1/P2-2）；WAVE7-SCOUT F1 行已改"legacy 引擎扫描**保留**为第 3 层"+ 执行修正注记；P3-7 的"审计误读"声明**属实**——`eval/north-star.json:81` structured-output-failure 行在案，W7 更新 12/75→75/75（2026-08-22）与 `evidence/W7/repair-benchmark.json`（broken n=75 after=75, valid 6/6, fuzz 192/192）自洽；oracle 计数 83 = 81 输出 + 2 throw，与 corpus 83 例 1:1。

**5. 四文件套复跑 — PASS**
- `npx vitest run tests/json-repair.test.ts tests/json-repair-upstream.test.ts tests/providers.test.ts tests/llm-tolerance.test.ts` → **Test Files 4 passed (4)，Tests 245 passed (245)，exit 0**。与对照表声明完全一致。

### 复审实跑命令与关键输出（摘要）

| 验证 | 命令 | 结果 |
|---|---|---|
| P1 分叉输入 | node v24.14.0 `--experimental-strip-types`，require 上游 cjs vs import 移植版，全字段 JSON.stringify 比对 | 两例 byte-for-byte equal，`ALL BYTE-EQUAL: true`，exit 0 |
| P1 修复面差分 | 同上，7 例空白变体 | `ALL EQUAL: true`，exit 0 |
| oracle 全量差分（加测） | 同上，83 条输入 | 81 输出逐字节相等；2 throw：base message+position 相等（仅格式后缀/name 差异，见观察 A） |
| 上游套真实性 | `diff`（CRLF 归一） | 仅头注释/导入/streaming 段删除，测试体零改动 |
| 上游套 | `npx vitest run tests/json-repair-upstream.test.ts` | 78/78 passed，exit 0 |
| undefined 用例 | `npx vitest run tests/providers.test.ts -t "ABSENT finish_reason"` | 1 passed (62 skipped)，exit 0 |
| 四文件套 | `npx vitest run tests/{json-repair,json-repair-upstream,providers,llm-tolerance}.test.ts` | 245/245 passed，exit 0 |

### 残留观察（非阻断，记台账待后续，不影响本轮 ACCEPT）

- **A（P3 级，先在而非修复引入）**：throw 面可观测 API 与上游有两处格式差异——上游 `JSONRepairError` 构造器把 position 拼进 message（`Colon expected at position 16`）且不设 name（`err.name==='Error'`）；移植版 `json-repair.ts:28-34` message 不含 ` at position N` 后缀、`name='JsonRepairError'`。经 git 核对 HEAD 与工作区构造器一致（首轮审计时已如此，非本次修复引入）。实测 2 条 throw 条目 + 3 例 EOF 输入：base message 与 position 全部与上游相等，差异仅在格式后缀与 name。产品影响为零（唯一生产调用 `http.ts:432` 捕获后层间 fall-through，message 不外泄）。连带澄清：followup P3-1 行"含上游错误消息/位置断言……等价性强于 position 比对"对 throw 面略有过誉——vitest `toThrow(errorInstance)` 只比 message，且重定向套件两侧期望实例均由移植版构造器构造（无后缀），故这些断言钉住 base message 但钉不住 position/后缀；该套件的真实强度在约 400 条输出断言。可选收口：oracle 测试对 throw 条目按 `e.message + ' at position ' + e.position` 重建上游格式串断言，或构造器对齐上游。
- **B（琐碎）**：`tests/json-repair.test.ts:27` describe 标题写 "80-entry corpus"，实际断言 `oracle.length` toBe 83——陈旧标题文字。
- **C（计数口径）**：followup 表"语料补 3 例 → oracle 83 例"中 74→83 的增长含再生成时收录的 6 条此前未入 oracle 的既有语料（现 corpus 83 与 oracle 83 已 1:1 且被逐字节钉死，经复审全量上游差分后该口径问题无保真影响）。

**结论**：首轮 REJECT 的全部阻断项（P1 移植分叉、P2-1 台账失真、P2-2 披露缺失）及 P3 清扫均有真实修复且经本复审独立实跑证实；修复声明无注水。verdict 转为 **ACCEPT**，残留 A/B/C 建议记入后续 Wave 待办。

## 主 Agent 收口（复审 ACCEPT 后，2026-08-22）

复审 ACCEPT 携 3 条非阻断观察，全部闭环：
- **A**：JsonRepairError 构造器对齐上游（消息含 ` at position N` 后缀、去自定义 name，json-repair.ts 对照上游 utils/JSONRepairError.js 逐行同构）；oracle throw 断言升级为**全消息等价**（toThrowError(entry.error)，钉死 message+position）——复审指出的"vitest toThrow(instance) 只比 message 且本套自指"缺口由此闭合。
- **B**：describe 标题与文件头注释 80→83 陈旧文字已改。
- **C**：本表 P1 行口径补全（74→83 增长构成）。
复验：四文件套 245/245、typecheck exit 0（错误消息对齐后上游套依旧 78/78——其断言两侧现均含后缀）。
