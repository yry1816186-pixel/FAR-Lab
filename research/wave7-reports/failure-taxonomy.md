# LLM 结构化输出失败模式分类学 — Wave-7 横切报告 A（主 Agent 撰写：本地 live 语料 + 已读源码规则清单交叉；子 Agent 限速失败后收归主线）

> 证据等级标注：**[FAR-LAB-LIVE]** = 本仓 live 实证；**[UPSTREAM]** = 上游源码/官方文档实证（file:line 见对应报告）；**[ECO-COMMON]** = 生态常见但 FAR-Lab 未观察到（不进默认修复链的依据）。

## A. 截断类
| 类 | 证据 | 现状 | 建议 |
|---|---|---|---|
| A1 max_tokens/finish_reason=length 中途截断 | [FAR-LAB-LIVE] 我们 maxTokens=8192 硬预算下的设计风险；[UPSTREAM] jsonrepair R10/R15/R20 内建截断补全 | 直接入纠正性重问（重问同样可能再截断） | jsonrepair 引擎补全 + 部分值前哨（streaming 报告 §3） |
| A2 流中断/连接断 | [FAR-LAB-LIVE] 传输层 timeout 分类已有 | 传输重试覆盖 | 保持 |
| A3 截断数字=错误值 | [UPSTREAM] openai-partial-json-parser :197 默认排除 NUM | 无面 | 部分值解析器继承 NUM 排除纪律 |

## B. 词法类（FAR-Lab 最高频实证带）
| 类 | 证据 | 现状 | 建议 |
|---|---|---|---|
| B1 markdown 围栏 | [UPSTREAM] jsonrepair R1；[FAR-LAB-LIVE] extractJsonText 第二步即为此设计（spike 实证 provider 行为） | fence-strip 在位 | 并入引擎 R1 |
| B2 前后缀解释文字 | [ECO-COMMON] instructor MD_JSON 模式场景；FAR-Lab JSON_ONLY_SUFFIX 系统指令 + strict-FC 下未观察到 | — | 引擎非引号串路径天然兼容（文字被引号化为串值，zod 裁决） |
| B3 单引号 | [UPSTREAM] jsonrepair R17 | 无 | 引擎 R17 |
| B4 尾逗号 | [UPSTREAM] jsonrepair R7/R14 | 无 | 引擎 |
| B5 注释 | [UPSTREAM] jsonrepair R37 | [ECO-COMMON] | 引擎顺带覆盖 |
| B6 **未转义内引号** | **[FAR-LAB-LIVE]** `spikes/output/strict-fc-corrupted-args.json`（errPos 4854，`...damage could"expected...`）；D-030 记录 ~20% @ ≥20k chars；3/5 rediscovery-v2 runs 死于此（D-035） | repairUnescapedQuotes（闭引号后必跟 `,}]:` 或 EOF 规则） | 引擎 R19-R21（超集：括号平衡 + 下一引号 + 数字跟随三项校验） |
| B7 原始控制字符 | [FAR-LAB-LIVE] 056e931 修复的同类 | repairUnescapedQuotes 覆盖 | 引擎 R25 |
| B8 特殊 unicode 空白 | [UPSTREAM] jsonrepair R38 | [ECO-COMMON] | 引擎顺带 |
| B9 HTML 实体 | [UPSTREAM] jsonrepair R19/R27 | [ECO-COMMON] | 引擎顺带 |
| B10 Python 常量 True/False/None/undefined | [UPSTREAM] jsonrepair R33 | [ECO-COMMON]（我们多模型路由下 GLM/Qwen 理论可能） | 引擎 |
| B11 前导零数字/`2.`/`2e` 截断 | [UPSTREAM] jsonrepair R29-R31（前导零输出为字符串保内容） | 无 | 引擎；zod number 拒→重问（诚实） |
| B12 NaN/Infinity | [UPSTREAM] jsonrepair 不特判（→字符串"NaN"）；partial-json 家族作为原子解析为 JS 特殊值 | 无 | 引擎语义（字符串）+ zod 裁决 |

## C. 结构类（容忍链已接住的带）
| 类 | 证据 | 现状 |
|---|---|---|
| C1 单键信封包裹 | [FAR-LAB-LIVE] run_z8xetk84 P2 事故（`{"falsification-spec":...}`） | 容忍链 L3（llm-tolerance.test.ts 钉死） |
| C2 null vs 缺省 | [FAR-LAB-LIVE] | 容忍链 L2 |
| C3 enum 变体漂移 | [FAR-LAB-LIVE] | 容忍链 L4（路径感知） |
| C4 缺逗号/缺冒号/缺值 | [UPSTREAM] jsonrepair R6/R8/R9/R13 | 引擎 |
| C5 NDJSON 多值 | [UPSTREAM] jsonrepair R2 | [ECO-COMMON]；引擎 R2 会包数组（zod 若期望单对象则拒→重问，安全） |
| C6 JSONP/函数包裹 | [UPSTREAM] jsonrepair R35 | [ECO-COMMON] 引擎顺带 |
| C7 多余/缺失字段、字段名漂移 | [FAR-LAB-LIVE] describeShape 契约注入从根缓解；strict-FC 服务端 additionalProperties:false 硬保证 | 传输+提示层；zod 裁决 |

## D. 类型类
| 类 | 证据 | 现状 |
|---|---|---|
| D1 字符串化数字 `"5"` | [ECO-COMMON] | zod 拒→重问（**不做静默强制转换**——类型语义须模型确认） |
| D2 enum 大小写/连字符 | [FAR-LAB-LIVE] | 容忍链 L4 |
| D3 日期格式 | [ECO-COMMON]（无 date schema） | — |

## E. 语义类（合法 JSON 但违反 schema）
| 类 | 证据 | 现状 |
|---|---|---|
| E1 min-length/regex/refinement 违反 | [FAR-LAB-LIVE] strict-FC 传输不管语义约束（设计如此，D-026） | zod 语义权威 + 纠正性重问（错误回传） |
| E2 幻觉键值 | [FAR-LAB-LIVE] decisionRuleProvenance=mixed 事件（D-029b） | schema 演进 + 枚举放宽；zod 拒 |

## F. 传输类（strict-FC 端点）
| 类 | 证据 | 现状 |
|---|---|---|
| F1 bare-`{}` 子 schema 400 | [FAR-LAB-LIVE] strict-fc-shape-probe.json（D-029 P2-1） | 投影 v2 UNPROJECTABLE + assertStrictFcValid |
| F2 无 properties 对象 / 无 items 数组 400 | [FAR-LAB-LIVE] 同上 | 同上 |
| F3 工具参数损坏（B6 类在 tool args 载体上） | [FAR-LAB-LIVE] D-029/D-030 | repairUnescapedQuotes → 本 Wave 引擎 |

## 补强优先级（按 FAR-Lab 实证频次 × 修复确定性）
1. **B6+B7（内引号/控制字符）**——live 最高频损坏类，引擎 R19-R21 为现有规则严格超集。【本 Wave 主融合】
2. **A1 截断补全**——引擎 R10/R15/R20 + 部分值前哨。【本 Wave】
3. B1/B3/B4/B5/B8/B10/B11/B12 词法族——引擎一次性带入（边际成本≈0）。【本 Wave 顺带】
4. C4 缺逗号/冒号——引擎。【本 Wave 顺带】
5. C1-C3——容忍链已有（不动，测试钉死防回归）。
6. D1 类型强制转换——**不做**（语义红线）。
7. F 类——传输投影已有（不动）。

## 来源
- `spikes/output/strict-fc-corrupted-args.json`、`strict-fc-shape-probe.json`、`strict-fc-null-probe.json`（live 语料）
- `evidence/W-EV2/strict-fc-live-verification.md`（D-030，41/41）；D-029/D-029b/D-034/D-035 决策记录
- jsonrepair 规则清单（research/wave7-reports/jsonrepair.md §1）
- openai-partial-json-parser :197（NUM 排除纪律）
- instructor MD_JSON / outlines 生态场景（存在性证据：instructor 官方文档面，未深钻——instructor 子 Agent 仍在外场）
