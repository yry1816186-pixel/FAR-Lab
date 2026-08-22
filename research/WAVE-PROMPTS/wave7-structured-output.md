# Wave-7 最高执行指令 · 结构化输出与模型面基础设施源码远征

> 使用方式：整份作为 /goal 交给新窗口。共同基线见 `research/WAVE-PROMPTS/_COMMON-BASELINE.md`（粘贴时一并带上）。

## 〇、接续点

**开启 Wave-7：高并发子 Agent 深读"LLM 结构化输出/约束解码/JSON 容错"基础设施源码——FAR-Lab 模型面的鲁棒性上游。当前栈：DeepSeek strict-FC beta（默认传输）+ zod 语义校验 + 四层容忍链（null-strip/信封解包/路径感知 enum 归一化）+ 纠错重试。本 Wave 找更强的开源容错/校验/流式解析机制，源码级（EXTRACT 算法，非引依赖）融合。先读注册表防重复（jsonrepair 曾因 zod-only 被拒——本 Wave 以"抽算法不引包"路径重访；LiteLLM 拒绝维持）。**

## 一、对象清单（起点；核实许可，主动扩充）

| 系统 | 线索 | 重点 |
|---|---|---|
| jxnl/instructor | 核实（MIT?） | patch/重试/部分提取策略、多 provider 适配层、校验错误回传给模型的形状 |
| dottxt-ai/outlines | Apache-2.0 核实 | 约束生成原理：regex/JSON schema 编译——学习其 schema→约束思想（我们是 API 侧，取其分类法与失败模式库） |
| guidance-ai/guidance | 核实 | 模板 interleaved 生成、确定性段与生成段混合 |
| mlc-ai/xgrammar | 核实 | grammar 压缩与跨 token 约束——schema 支持子集的分类学参考 |
| noamgat/lm-format-enforcer | 核实 | token 白名单构造、与采样参数的交互 |
| jsonrepair（remcohaszing 等） | ISC | **EXTRACT 修复算法状态机**（重写为 TS 零依赖，替代/增强现有 extractJsonText 容错） |
| 流式部分 JSON 解析器（partial-json/incremental 解析的开源实现，TS/JS 生态优先） | 核实 | **流式工具调用/结构化结果的早停与渐进校验**——FAR-Lab 尚无流式解析面 |
| zod v4 `z.toJSONSchema` 内部实现 | 已装依赖 | 替代自写 zodToStrictJsonSchema 投影的可行性（同仓依赖不算新增运行时依赖） |
| 同类主动扩充 | 各家 provider SDK 的 strict FC 实现差异、partial-json、json-stream 等 | 同维度解剖 |

## 二、本 Wave 特有警戒
- **zod-only 不变量是硬门**：Python 库只学算法；JS/TS 库零依赖可 vendor 的才考虑整包（记 DECISIONS 论证）；一切以 EXTRACT-算法重写为默认路径。
- strict-FC 已是默认传输——新机制必须与其互补（如流式渐进校验、修复状态机），不得回退到 prompt-only。
- 模型面是生产主路径：每个改动带 llm-tolerance 测试扩展 + 至少一次 live e2e 验证（沿用 D-026 验证模板）。

## 三、维度侧重（维度体系 v2 编号）
重点组：**C2/C4（schema 纪律与结果回传形状）**、**I3/I4/I5（推理控制、结构化输出、流式）**、**G3（错误恢复分类学）**；每仓普查+算法深钻（子 Agent 产出伪代码级算法描述）。

## 四、开场序列
| 步 | 动作 | DoD |
|---|---|---|
| 1 | 基线恢复序；status→IN_PROGRESS，phase=wave7-structured-output | 控制面一致 |
| 2 | 并发分发调研（每库一个 + 横切：失败模式分类学/流式解析 两线） | 算法级机制清单 |
| 3 | shortlist → `research/WAVE7-SCOUT.md`（每项标注 EXTRACT/VENDOR 路径与 zod-only 合规性） | 排序+合规审查 |
| 4 | 融合计划 + DECISIONS | 理由落盘 |
| 5 | 执行融合：容忍链/流式/投影改造 + 测试 + live e2e + 对抗审计 | 证据落 evidence/W7/ |
| 6 | 收口（基线 DoD 全项） | 三处一致，提交成功 |

## 五、本 Wave 量化野心（北极星映射）
- 直接负责：structured-output-failure（当前 ~1.1% 事件级 → 0.5%/0.1% 每调用级）；流式渐进解析若落地：首字节可校验延迟 <=1.5s。
- 融合准入线：容错层故障注入测试通过率 100%（每层注入其针对的坏形状）；零性能回退（strict-FC e2e <=2s 保持）。
- mutation 抽查：对每个新容错分支注入缺陷验证测试变红。
