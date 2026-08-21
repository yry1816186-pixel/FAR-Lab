# TESTING_EVALUATION.md — 测试与评估细则

> 读取时机：写测试、设计评估方案、建基准、验收验证。Kernel 在根 AGENTS.md；本文件定义测试策略与禁止清单。

## 1. 风险驱动，不是数量驱动

- 每个重要测试回答：**它防止什么真实 Failure？** 答不出 = 不写。
- 覆盖率的唯一合法用途：发现未测风险区域，不是目标。
- 测试预算按风险分配：核心闭环 > 集成契约 > 失败路径 > 边界 > 边缘细节。

## 2. 证据强度阶梯

`source inspection → build/typecheck → focused test → subsystem run → integration run → production path → realistic workflow → measured benchmark → adversarial failure test → scientific validation → independent audit`

- 断言等级不得超过实际到达的阶梯。
- 单元/契约/集成测试可真实证明各自范围；只有真实生产路径运行才能升级为 production-path / live verification，不能用低层测试冒充更高证据。

## 3. 测试金字塔与分层

- 单元（确定性、快）→ 契约（接口不变量）→ 集成（真实组件联通）→ E2E（用户工作流）。
- 契约测试保证接口稳定性；错误语义、超时、重试、幂等必须测。
- E2E 覆盖主用户旅程 + 最危险失败路径，不追求全界面。

## 4. 高级测试方法（按风险选用）

- Property-based：对解析/校验/序列化/状态机等有明确不变量处使用。
- Metamorphic：无 oracle 场景（LLM 输出、科学计算）用变换不变式验证。
- Fuzz：解析器、导入导出、配置读取。
- 并发/竞态：共享状态、取消传播、幂等。
- Recovery：crash 后 checkpoint/resume、部分失败、重复执行。
- 性能/基准：有预算的地方实测；基准记录环境、版本、方法，可复现。

## 5. Mock / Fixture 政策

- Mock 用途：验证边界（隔离外部依赖测试自己的逻辑）。**禁止**：mock 掉需要证明的真实能力（Provider/DB/API/序列化/模型）。
- Fixture / 合成数据：显式标记（文件名/元数据注明 synthetic）、与生产路径隔离、永不静默回退。
- 关键主路径最终必须经过真实组件运行验证（至少一次 LIVE_VERIFIED）。

## 6. 禁止清单（Test Gaming 变体）

- 为 coverage 制造浅测试；仅检查“有值/不崩”通常不足以证明行为，除非这正是明确风险/契约。
- 重复跑相同绿测试制造"通过"记录。
- 修改测试（弱化阈值、吞异常、删断言）掩盖系统错误。
- Skip 失败测试制造绿色；失败必须修复或如实标 BLOCKED/FAILED。
- test-only production bypass：生产代码开后门让测试变绿。
- Weak baseline / vanity benchmark：对比基准弱于自身或不可复现。
- Meaningless snapshot：无语义断言的快照。

## 7. 变更驱动的验证规模

- Change → Relevant Risk → Minimum Necessary Validation。
- 小改动跑相关测试 + typecheck；大改动才跑集成与完整验收。
- 无变化时禁止重复完整验收（浪费且制造表演）。

## 8. 测试自身质量

- 测试可读性 = 生产代码标准；失败的测试必须能定位到根因。
- 断言具体：断言行为与结果，不断言实现细节。
- 测试隔离：不依赖执行顺序、共享可变状态、真实时钟（必要时注入）。

## 9. 评估与基准（Evaluation）

- 评估方案先定义：指标、baseline、数据、环境、误差、停止条件。
- LLM/科研评估：记录模型/版本/参数、样本数与重复运行；随机种子、温度、置信区间等仅在支持且方法上适用时报告，不能虚构可控性或统计意义。
- 禁止事后只挑有利结果；比较前先固定主要指标/数据/判定方法，任何中途修改都保留原因并如实披露。

## 10. 科学评估

- 科研正确性评估见 `SCIENTIFIC_TRUTH.md`；测试绿 ≠ 科研结论成立。
- 每次验收 PASS 必须绑定证据路径（命令 + 退出码 + 关键输出）。

## 11. 验收联动

- 施工版验收状态写入 `.control/ACCEPTANCE_STATUS.json`，状态词汇：not_started / implemented / integrated / tested / live_verified / blocked / failed。
- 完成声明前跑 `completion-gate.mjs`；未达目标状态不得改标为完成。
