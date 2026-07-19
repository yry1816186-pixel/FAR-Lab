# Schema Migrations — SSOT 编号映射说明

> **性质**：运行时迁移目录的术语口径说明（非科学 artifact）。解决 spec SSOT 编号 0001-0025 与实际 contiguous 落地 0001-0011 的偏差可见化。

## §1. 为什么是 11 个文件，而非 spec 的 25 个编号

spec（`FINAL_PACKAGE/21_IMPLEMENTATION_ROADMAP.md` §4 · PDF 提交层·git-ignored·git clone 不可见）锁定的 0001-0025 是 **timeline 占位编号 SSOT**（实际 contiguous 0001-0008 映射见本文件 §2 内联表，运行时以 `src/db/migrator.ts` 为准）（"编号 ↔ 实体 ↔ Wave"三元映射），**不是"必须有 25 个独立物理 .sql 文件"的硬性要求**。证据：

- `21:143` §4 标题自述为"迁移时间线（编号锁定 · 哪个 wave）"；
- `21:245` §10 明确区分"编号锁定"与"内容待实现"。

实际仓库采用 **contiguous renumber**（从 1 连续无间断），由运行时类型系统强制：

```ts
// src/db/migrator.ts:112-122
function assertContiguousVersions(migrations: readonly MigrationFile[]): void {
  let expected = 1;
  for (const migration of migrations) {
    if (migration.version !== expected) {
      throw new Error(`db.migrator: migration versions must be contiguous, expected ${expected} but found ${migration.version}`);
    }
    expected += 1;
  }
}
```

若机械保留 spec 的 0017/0018/0025 原号而中间留空（0008-0016 空），migrator 会直接 throw。因此实际迁移**主动选择 contiguous 编号**，并在每个文件头注释记录 SSOT↔contiguous 映射（见 §2）。

## §2. 实际 11 个迁移 ↔ spec SSOT 映射

| 实际文件 | version | spec SSOT 号 | 覆盖实体 | Authority |
|---|---|---|---|---|
| `0001_initial.sql` | 1 | 0001-0011（合并）| 五核心表（call_records/evidence_log/verdict_nodes/evidence_edges/repro_runs）+ append-only trigger + 0006-0011 扩展列内联（purpose_tag 9 值 CHECK / dashscope_request_id 等）| `02 §3` DDL SSOT |
| `0002_add_dialogue_tables.sql` | 2 | **spec 39（SSOT 外）**| 研究对话层 4 表（research_sessions/dialogue_turns/intent_hypotheses/dialogue_clarification_questions）· 不进 hash 链| `39 §1` + `02 §3.6-3.8` |
| `0003_math_verification.sql` | 3 | **spec 38（SSOT 外）**| math_claims + math_verifications（Epic N）| `spec 38 §1-§4.5` |
| `0004_proof_envelopes.sql` | 4 | **0017**| proof_envelopes（conclusion 5 枚举 + proofHash 链 + anti-theater trigger）| `09 §1-§4` + round8 B1 |
| `0005_falsifiability_contracts.sql` | 5 | **0018**| falsifiability_contracts（FEC V1-must）· 文件头 `0005:5` 注明映射 | `11` + `21 §1` + `22 §2 T-W1-07` |
| `0006_falsification_audit_events.sql` | 6 | **0025**| falsification_audit_events（FalsificationSufficiencyAuditor 元审计）· 文件头 `0006:5` 注明映射 | `HANDOFF §3.5` + round5 §1.5 + round8 B3 |
| `0007_add_degraded_from.sql` | 7 | **24 §5 衍生（SSOT 外）**| call_records ADD COLUMN degraded_from（FallbackChain 降级来源审计列）| `05 §8.2/§9` + `24 §5` |
| `0008_anti_theater_fail_coverage.sql` | 8 | **AT-02 审计裁决（SSOT 外）**| DROP+重建 `trg_proof_envelopes_anti_theater` 扩展覆盖 FAIL（F1 机器化·WARN 或 FAIL check → conclusion ≠ CONFIRMED·防御纵深）| `23 §5.1` + `02 F1` + AT-02（2026-06-29）|
| `0009_fec_contracts_v2.sql` | 9 | **03 §1.2（SSOT 实体扩展·W2-A）**| fec_contracts_v2（FEC V2 完整冻结契约·16 字段 canonical JSON + fec_hash=computeFecHash 互验 + append-only trigger·与 V1 falsifiability_contracts 共存）| `03 §1.2-§1.3` + `10 W2-A` |
| `0010_proof_envelopes_v2.sql` | 10 | **04 §2.1（SSOT 实体扩展·task #9）**| proof_envelopes_v2（ProofEnvelope V2 完整证据嵌入·16 字段 canonical JSON + proof_hash=computeProofHashV2 self-excluding + fec_hash/ledger_root CHECK len=64 + sealed_by='deterministic_sealer' + append-only trigger + anti-theater trigger·与 V1 proof_envelopes 共存）| `04 §2.1/§2.4` + `APPENDIX_C §2` + task #9（Ask 已确认）|
| `0011_anti_theater_trigger_v2.sql` | 11 | **task #10 W3.4（SSOT 实体扩展·D10 forward-only）**| DROP+重建 `trg_proof_envelopes_v2_anti_theater` 匹配新 antiTheaterReport 形状（WHEN 从 `overallStatus WARN/FAIL` → `hasFail=true 或 canSealConfirmed=false`·F1 物理兜底恢复·D1 类型统一后 0010 旧 overallStatus trigger 永不命中·不修改 0010 append-only 纪律）| `APPENDIX_E_ANTI_THEATER.md §1` + `APPENDIX_A_TYPES.md §7:1055-1191` + `04 §2.4 RULE-PE-007` + task #10（D10）|

## §3. spec SSOT 中**未落地**的编号（对应未实现运行时）

下列 spec 号的内容**尚未实现**，对应 W2-W6+ / V2 / V3 路线图中的未落地运行时。**不为凑编号造空壳迁移**（空壳 = 假绿，违反 `02 §7.2` 假绿精神与反 theater 原则）。

| spec 号 | 实体 | 目标 Wave | 状态 |
|---|---|---|---|
| 0012 | probe_atlas 三表 | W1/V2 | 待实现 |
| 0013/0014 | UQ（sensitivity_envelopes 等）| W4 | 待实现 |
| 0015 | far_bench_metrics | V2 | 待实现 |
| 0016 | sciir_objects | W2 | 待实现 |
| 0019 | trace_events（旧语义 uq_grades 已弃用，号复用给 trace_events）| V2 | 待实现 |
| 0020 | verdict_protocols | W2 | 待实现 |
| 0021/0022/0024 | replay_forks / ledger_events+merkle_roots / adversarial_rounds | W6+ | 待实现 |
| 0023 | （预留空号）| — | — |

> 注：`30_FINAL_CHECKLIST.md §1` 的"0019 弃用"措辞应理解为"**0019 旧语义（uq_grades）弃用，编号复用给 trace_events**"，非"0019 号空置"。

## §4. 裁决依据（决策日志）

- **优先级链**（`02_CONSTRAINTS_AND_RED_LINES.md §8`）：迁移编号不在 L0 铁律 / L1 宪法12条 / L2 T1-T12 信任根(R2) / L2 F1-F12 反 theater / L2 Z1-Z16 零容忍 / L3 DO_NOT_CLOCUS 任何硬约束层。最相关的 T10/T11（`02:122-123`）约束的是迁移**语义属性**（可逆 up+down、append-only），非编号数量。
- **spec 自身矛盾**（CROSS-CUT-003，登记于 `33_UPGRADE_DIAGNOSTIC_REGISTER.md:176`）：`25:188`（0001-0024）vs `30:24`（0001-0025）vs `21:245`（0001-0024 锁定）三处不一致，spec 在 0024/0025 上不自洽。
- **Ask 层归属**（`32_UPGRADE_MASTER_PLAN.md:412` Ask#6）：编号收敛属规范方拍板事项（02 §7.5 改 Schema），dev agent 不单方机械收敛。
- **诚实护城河原则**（`02 §0` / `24 §0` / `06 §7`）：采纳 contiguous + 诚实映射（选项 A），拒绝机械扩 25 空壳文件（选项 B = theater）。
- **forward-only 设计声明**（与 T10/T11/§33 一致性·消除文档矛盾·审计 #18）：实际 runner（`src/db/migrator.ts:runMigrations`·仅单向 `up`·`db.exec(sql)` + `INSERT schema_meta`·grep 核实零 down/rollback 实现）是**有意的 forward-only 设计选择**，非遗漏。理由：① 0001 五核心表已落 append-only trigger（T2·`02:114`·禁 UPDATE/DELETE trigger ABORT），任何 down（回滚已落库 append-only 行）都破坏 hash 链，直接违反 T11 第三分句"禁破坏 append-only"——down 在语义上无意义。② 与 spec 裁决一致：`32_UPGRADE_MASTER_PLAN.md` §1.1(d)（L33）明文"V1 不交付可运行迁移机·不假装能跑通"，`32:250` 明文"因 down 脚本不可逆，无 down 脚本规范"——V1 规范层无 down 脚本契约。③ T11（`02:123`）"必须可逆（up+down）"为迁移语义指引，受保护核心不变性是 append-only（与 T2 同源），forward-only + append-only trigger 已满足该不变性，不存在"声称可逆却只交付 up"的 theater。down/幂等回放闸门（R-MIG 系列）按 `32 §1.1(d)` 裁决归 V2+（CI YAML 骨架·占位红·待 R2 真绿后激活），V1 不声称可独立交付。
- **verdict_nodes 不加 no_delete（INTENTIONAL_NO_CHANGE·审计 #18）**：verdict_nodes 是「有状态裁决节点」（`01_PROJECT_FACTS.md §2.7` append-mostly·仅 verdict/metric_value/updated_at 可变），非纯 append-only 证据表。spec T2 append-only 铁律（`02:114`）明确只覆盖 4 表（call_records/evidence_log/repro_runs/schema_meta），verdict_nodes 不在内。现有 FK ON DELETE RESTRICT（evidence_id / parent_verdict_id 自引用 / evidence_edges 双向 / repro_runs.verdict_id）+ immutable_fields 白名单 trigger + no_terminal_rollback 已充分覆盖"被引用节点禁删"核心安全意图，同时允许孤立节点删除用于图重建 / 分支裁剪 / GC。加 no_delete（绝对禁删）会过度防御：违反 `01 §2.7` append-mostly 设计、阻碍合法图重建、与 T2 SSOT 范围不符。结论：当前"无 no_delete"是有意设计，非缺失。若日后确有"全图不可变"需求，应先走 Ask 层修订 T2 / `01 §2.7` 把 verdict_nodes 重归类为 append-only，再据此加 trigger。

**裁决结论**：保留 contiguous 0001-0011 + 诚实映射（本文件即映射 SSOT）。偏差定级 **P2 术语一致性**，非 P0/P1，不阻塞交付。
