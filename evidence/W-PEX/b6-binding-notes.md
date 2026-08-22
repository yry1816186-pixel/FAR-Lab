# B6 绑定增密证据笔记（2026-08-22，PLAN-reuse-adoption §R4）

## 1. 问题与基线

B1 全程审判（`evidence/W-PEX/b1-baseline.md`）实测绑定稀疏：真实 run 中 11 个假设仅有 1+1 条显式
critique 绑定（supporting/counter 各 1），ACH 证据矩阵（`web/src/components/detail/CompareView.tsx`
AchEvidence：绑定 >1 个对比假设 = shared，恰好 1 个 = discriminating）几乎全部由
derivation.inputClaimIds 撑起。EMR-ACH 对比性约束（contrastivity）指出：**绑定到零个假设的证据判别力
为零**——稀疏绑定直接掏空 ACH 矩阵的判别层。

## 2. 代码改动（全部在 src/pipeline/stages/falsify.ts，schema/事件/编排器零改动）

1. **门面扩展（gate widening）**：批判链接候选的主题门（D-018 词汇重叠规则）从
   `statement + mechanism` 扩到 `statement + mechanism + predictions`。阈值不变
   （containment ≥ 0.25 或共享内容词 ≥ 4）。提取为可导出纯函数 `gateCritiqueLinks`
   （语句+机制+预测拼接后走同一 `contentTokens`/`topicalOverlap`）。
2. **consideredClaimIds（"评估过但无实质关系" ≠ "未评估"）**：`FalsifyOut` zod schema 增加
   `consideredClaimIds: z.array(z.string()).default([])`（仅传输层遥测，不持久化）；system prompt
   增加显式指令——无实质关系的 claim 不得链接、改列入 consideredClaimIds。落库前按 run 已知
   claim id 确定性过滤幻觉 id，且排除最终已链接的 id。
3. **密度可观测 + 零绑定告警**：每个代表假设在 audit 后输出 `ctx.log` 密度行
   `critique bindings: hyp=<id> support=<n> counter=<n> considered-nolink=<n> of <available>`；
   当最终 support=0 且 counter=0 且 run 内存在 ≥3 条 verified claim 时，push 显式 warning
   （进入 stage summary）。

## 3. 实测度量（测试固件密度行，TestStubProvider 全脚本化，executionMode=test）

| 固件场景 | 密度行（ctx.log 原文） | 门/审计结果 |
|---|---|---|
| h1：2 条仅与 predictions 共享词汇（与 statement/mechanism 零重叠）+1 条完全无关 | `critique bindings: hyp=<id> support=1 counter=1 considered-nolink=2 of 5` | 两条 prediction-链接穿过门+审计成为 weakens/supports relation；无关 claim 被门丢弃并产生可见 warning |
| h2：完整 spec 但诚实零链接，5 条 verified claim 在库 | `critique bindings: hyp=<id> support=0 counter=0 considered-nolink=5 of 5` | 零绑定 warning 触发：`0 supporting and 0 counter critique links while 5 verified claim(s) exist … zero evidence binding` |
| h3：零链接但仅 2 条 verified claim（低于阈值） | `critique bindings: hyp=<id> support=0 counter=0 considered-nolink=2 of 2` | 零绑定 warning 正确不触发 |

纯门函数（`gateCritiqueLinks`）数值：prediction-词汇 claim P1 对扩展门面共享 8 个内容词、
P2 共享 4 个 → 保留；对旧门面（statement+mechanism）共享 0 → 丢弃——证明是**门面扩展**放行而非
阈值放松；完全无关 claim 在新旧两个门面下共享均为 0 → 一律丢弃（科学真值底线）。

## 4. EMR-ACH 对比性对齐（方法论引用，不搬码）

- 出处：`.planning/PLAN-reuse-adoption.md` §2 选型表"ACH 方法论"行（EMR-ACH 思想引入，
  MIT Python 论文实现；任务引用 ApartsinProjects/EMR-ACH）与 §R4（B6 绑定增密基准）。
  无可移植 JS 代码（Burton GPL、open-synthesis AGPL 归档）——方法论验证+引用，不搬码。
- 对齐点：EMR-ACH 对比性约束——绑定到零假设的证据判别力为零。本批次把该约束落成三件确定性机制：
  门面扩展让 prediction-相关证据可入绑定（提高每假设覆盖）、consideredClaimIds 显式区分
  "评估过无关系/未评估"（零判别力证据显式化）、零绑定 warning（假设侧对称信号）。
- ACH 语义一致性：落库仍走既有 supportingClaimIds/counterClaimIds → AchEvidence 的
  shared（>1 假设绑定）/discriminating（恰好 1）计算不变；本批次不造新绑定通道，无伪造链接路径
  （独立 link-verification 审计保留，门只放宽了候选面）。

## 5. 验证证据（命令 + 结果）

- `npx tsc -p tsconfig.json --noEmit` → exit 0（tests 目录不在 tsconfig include 内，属仓库既有配置）。
- `npx vitest run tests/falsify-binding.test.ts tests/pipeline-evidence.test.ts tests/pipeline-export.test.ts
  tests/pipeline-hypotheses.test.ts tests/pipeline-retrieve.test.ts tests/pipeline-revision.test.ts`
  → **6 files / 119 tests 全绿**（新增 tests/falsify-binding.test.ts 7 tests；pipeline-hypotheses
  32 tests 覆盖 falsify 全部回归，既有固件不含 consideredClaimIds 字段，经 `.default([])` 兼容通过）。

## 6. 遗留（PENDING_LIVE）

- **真实 run A/B 绑定密度对比：PENDING_LIVE**（推迟至下一次真实 run）。目标指标：每假设
  support+counter 绑定数、considered-nolink 占比、ACH 矩阵 discriminating 行占比，与 B1 基线
  （11 假设 / 1+1 显式绑定）对照。密度行已进入 `ctx.log`，真实 run 日志可直接取数。
- EMR-ACH 判别性方差权重进 rank 参考 + 零判别力证据入库标注：本批次未做（R4 must_haves 其余项）。
- 科学评审（scientific-reviewer agent）：未做，另行批次。
