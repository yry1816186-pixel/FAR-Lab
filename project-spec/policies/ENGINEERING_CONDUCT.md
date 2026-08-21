# ENGINEERING_CONDUCT.md — 工程行为细则

> 读取时机：重大架构 / 大型重构 / Agent 行为退化 / 独立 Reviewer 任务。Kernel 在根 AGENTS.md，本文件只展开细则，不重复 Kernel 文本。

## 1. 真话与断言

- 断言等级必须匹配证据：`IMPLEMENTED`（代码存在且接入）→ `INTEGRATED`（真实调用方联通）→ `TESTED`（针对性测试通过）→ `LIVE_VERIFIED`（真实运行/工作流验证）→ `BENCHMARKED`（实测数字）→ `SCIENTIFICALLY_VALIDATED`（科研维度独立核验）。
- 汇报先结论后证据；数字给实跑值，不给印象值；失败给报错原文。
- 无证据的"应该可以/基本完成/差不多"一律按 UNVERIFIED 处理，不冒充事实。
- 被推翻的结论记录推翻原因；不做无声修正。

## 2. 完成与竖切

- 竖切定义：Requirement → Design → Implementation → Integration → Real Caller → State → Failure → Recovery → Observability → Test → Real Verification，全部落地才算一个模块完成。
- 结束任务前检查（Major Phase 自检，日常小改只查相关项）：
  - TRUTH：有没有声称超过证据的结果？
  - COMPLETION：核心路径是否真实贯通？
  - INTEGRATION：有没有存在但没人调用的代码？
  - FAKE：有没有 Mock/Fixture/Demo 静默进入生产路径？
  - PRIORITY：是否在优化低价值问题？
  - LOOP：是否在重复 Test/Audit/Patch 循环？
  - FAILURE/UX/SECURITY/SCIENCE/MAINTENANCE：对应领域是否真实。
  - NEXT：是否仍存在重要、明确、当前可执行的工作？NEXT=YES 不得因"做了很多"而结束。
- 禁止"遗留尾巴然后总结"；留尾巴 = 未完成，必须写进 `.control/BLOCKERS.json` 或转为明确的 nextAction。

## 3. 优先级与反循环

- 优先级序：Blocking → Critical → Core Workflow → Integration → Unknown → Reliability → Polish。
- 三个死亡循环，出现即停：
  - Test Loop：run → green → run again（无新证据即停止）；
  - Audit Loop：audit → report → audit again（无新发现即施工）；
  - Patch Loop：patch → edge case → patch（出现即检查抽象/契约/所有权）。
- 判断标准：同类行为连续重复且未产生新的 evidence / root cause / meaningful state change。
- 局部优化陷阱：任何 parser/component/edge case/test 消耗大量轮次而核心闭环未通 → 立即止损。

## 4. 架构纪律

- 最小充分复杂度：真实需求 → 简单方案不足 → 新复杂度收益明确，三步缺一不可。
- 禁止：循环依赖、万能 Service、过度 Interface、框架泄漏进 Domain、多重真相、未明确所有权、过早分布式、过早抽象。
- 持续 patch/workaround/fallback/特例/兼容层堆积 = 抽象或契约错误信号，优先重构根因而非继续打补丁。
- 架构决策用 `architecture-convergence` Skill 收敛并记入 `.control/DECISIONS.jsonl`（含 reversalTrigger）。

## 5. 依赖纪律

- 新依赖须回答：哪个失败模式？最小正确机制？维护/上下文/权限/供应链成本？如何验证收益？何时移除？
- 生产依赖锁定版本；重大依赖引入前做 OSS due diligence（License、维护状态、安全记录）。
- 外部代码/Skill/插件/MCP/Hook 未检查不可信；集成须明确状态/数据所有权、生命周期、错误重试、安全、来源、兼容、移除路径。
- 删除冗余依赖与"备用"依赖；不优化依赖数量本身（Harness Economy）。

## 6. 抽象质量

- 抽象必须自证价值：多实现、稳定边界、可替换性、测试隔离或明显复杂度下降至少有一项真实需求；仅凭“未来也许会用”不足以抽象。
- 命名表达意图；消灭无语义 magic constant；注释只解释非显然的“为什么”、不变量和危险边界，禁止给显然代码堆注释。
- 巨型文件、重复逻辑、死代码、过期兼容层 = 维护债，随见随清或列入明确 backlog。

## 7. 状态所有权

- 每个关键状态明确：Source of Truth / Owner / Derived / Cache / Projection。
- 禁止 DB + JSON + 前端 state + workflow state + agent memory 同时拥有互相冲突的权威状态。
- 模型 Memory 和 Context 不是项目数据库；关键执行状态必须落 `.control/` 或正式持久层。
- Schema/状态迁移走确定性机制（schema 校验、migration），不用 LLM 保证一致性。

## 8. 确定性 vs LLM

- 以下一律优先确定性代码：validation、schema、authorization、transaction、retry policy、parsing、state transition、格式转换、数值计算。
- LLM 只用于语义推理；任何 LLM 输出进入系统前必须有确定性校验边界。
- 禁止用 LLM 输出直接驱动权限/支付/不可逆操作而不经过确定性门禁。

## 9. 多代理编排

- 并行条件：Independent / Clear Ownership / Mergeable / No Write Conflict / Real Benefit，缺一不并行。
- 委托契约：objective、why、scope、read/write ownership、actions、evidence、deliverable。
- 子代理输出 = 候选证据，主代理负责集成与最终裁决；验收子代理工作看真实产物不看总结。

## 10. 技术研究

- 研究深度：Docs → Source → Issues → Releases → Benchmarks → Security → License → Real Spike。
- Decision Saturation 后停止；无限制研究 = 拖延。
- 每次重大选型产出 ADOPT/ADAPT/FORK/VENDOR/EXTRACT/BUILD/REPLACE/DELETE/DEFER/REJECT + 证据 + 剩余不确定性。

## 11. Context 管理

- 预算序：AGENTS（常驻）→ Policy（按域读取）→ Skill（重复方法论）→ Hook/Script（确定性）→ `.control/`（动态）→ Acceptance（完成真相）。
- 同一规则只允许一个权威位置；发现重复立即删除冗余副本。
- 长任务在重大阶段、compact/中断风险或关键决策变化时持久化 `.control/`；不按固定时间制造状态日志，不依赖对话历史恢复。

## 12. 文档纪律

- 文档永远落后于现实即删改；"文档先行于实现"只允许用于临时设计稿且须标注。
- 不为文档而文档；每个 Markdown 要有读者与用途，否则删除。
- 文档语言跟随仓库惯例；与代码/脚本事实冲突时以代码/脚本为准。

## 13. 仓库卫生与 Git

- Secret/凭证/.env 永不得进入仓库；`.gitignore` 覆盖所有本地凭据文件。
- 不提交生成物（dist/build/coverage/缓存/日志）与超大二进制（无理由 >5MB）。
- 禁止无授权破坏性操作：force-push、历史重写、`clean -fd`、大范围删除。
- 提交信息说明"为什么"；提交内容最小化；不把无关改动混入。
- 未做 git init 前，预提交检查用 `zcode-harness/scripts/secret-scan.mjs` + `path-hygiene.mjs` 人工执行。

## 14. 可维护性

- 新增代码的默认质量标准：能被下一位工程师无口头背景读懂；删除比新增容易时倾向删除。
- 持续简化：能删什么？能合并什么？什么无真实调用者？什么抽象无收益？
- 每个 Wave 结束做一次简化 pass（删除也是进展）。

## 15. Guardrail 自身演化

- 新失败模式呈现重复/系统性后：先判断是否属于既有原则；确有长期价值再进入 Policy，可确定判断的升级为脚本/Hook，复杂且高频的方法才考虑 Skill。
- 在重大阶段或出现上下文膨胀/误触发/保守化证据时做 Harness Pruning；不设日历式仪式。
- 最强 Harness 不是限制最多，而是用最少的长期约束稳定改变最重要的错误行为。
