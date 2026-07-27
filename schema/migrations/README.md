# Schema Migrations — SSOT 编号映射说明

> **性质**：运行时迁移目录的术语口径说明（非科学 artifact）。解决 spec SSOT 编号占位与实际 contiguous 落地的偏差可见化。
>
> **F-5-10-001 修复（R5·2026-07-25）**：本文件曾长期声称"11 个文件"并把 0012-0021 标为"待实现"，与实际 21 个已落地 `.sql` 严重失真（评委10 F-5-10-001 / 评委06 F-5-06-007）。本次已对齐实盘。

## §1. 为什么是 21 个文件，而非 spec 的 25 个编号

spec（`FINAL_PACKAGE/21_IMPLEMENTATION_ROADMAP.md` §4 · PDF 提交层·git-ignored·git clone 不可见）锁定的 0001-0025 是 **timeline 占位编号 SSOT**（"编号 ↔ 实体 ↔ Wave"三元映射），**不是"必须有 25 个独立物理 .sql 文件"的硬性要求**。证据：

- `21:143` §4 标题自述为"迁移时间线（编号锁定 · 哪个 wave）"；
- `21:245` §10 明确区分"编号锁定"与"内容待实现"。

实际仓库采用 **contiguous renumber**（从 1 连续无间断到 21），由运行时类型系统强制：

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

若机械保留 spec 的 0017/0018/0025 原号而中间留空，migrator 会直接 throw。因此实际迁移**主动选择 contiguous 编号**，并在每个文件头注释记录 SSOT↔contiguous 映射（见 §2）。

> **防漂移提醒**：`ls schema/migrations/*.sql | wc -l` 须恒等于 §2 表行数（当前 21）。再次漂移即为文档成为平行事实源（F-5-10-001 复发）。

## §2. 实际 21 个迁移 ↔ spec SSOT 映射

| 实际文件 | version | 覆盖实体 | Authority |
|---|---|---|---|
| `0001_initial.sql` | 1 | 0001-0011（合并）五核心表（call_records/evidence_log/verdict_nodes/evidence_edges/repro_runs）+ append-only trigger + 0006-0011 扩展列内联（purpose_tag 9 值 CHECK / dashscope_request_id 等）| `02 §3` DDL SSOT |
| `0002_add_dialogue_tables.sql` | 2 | **spec 39（SSOT 外）** 研究对话层 4 表（research_sessions/dialogue_turns/intent_hypotheses/dialogue_clarification_questions）· 不进 hash 链| `39 §1` + `02 §3.6-3.8` |
| `0003_math_verification.sql` | 3 | **spec 38（SSOT 外）** math_claims + math_verifications（Epic N）| `spec 38 §1-§4.5` |
| `0004_proof_envelopes.sql` | 4 | **0017** proof_envelopes（conclusion 5 枚举 + proofHash 链 + anti-theater trigger）| `09 §1-§4` + round8 B1 |
| `0005_falsifiability_contracts.sql` | 5 | **0018** falsifiability_contracts（FEC V1-must）| `11` + `21 §1` + `22 §2 T-W1-07` |
| `0006_falsification_audit_events.sql` | 6 | **0025** falsification_audit_events（FalsificationSufficiencyAuditor 元审计）| `HANDOFF §3.5` + round5 §1.5 + round8 B3 |
| `0007_add_degraded_from.sql` | 7 | **24 §5 衍生（SSOT 外）** call_records ADD COLUMN degraded_from（FallbackChain 降级来源审计列）| `05 §8.2/§9` + `24 §5` |
| `0008_anti_theater_fail_coverage.sql` | 8 | **AT-02 审计裁决（SSOT 外）** DROP+重建 trg_proof_envelopes_anti_theater 扩展覆盖 FAIL | `23 §5.1` + `02 F1` + AT-02 |
| `0009_fec_contracts_v2.sql` | 9 | **03 §1.2（W2-A）** fec_contracts_v2（FEC V2 完整冻结契约·16 字段 + fec_hash + append-only trigger）| `03 §1.2-§1.3` + `10 W2-A` |
| `0010_proof_envelopes_v2.sql` | 10 | **04 §2.1（task #9）** proof_envelopes_v2（ProofEnvelope V2·16 字段 + proof_hash self-excluding + anti-theater trigger）| `04 §2.1/§2.4` + `APPENDIX_C §2` + task #9 |
| `0011_anti_theater_trigger_v2.sql` | 11 | **task #10 W3.4（D10）** DROP+重建 trg_proof_envelopes_v2_anti_theater 匹配新 antiTheaterReport 形状 | `APPENDIX_E §1` + `APPENDIX_A §7` + `04 §2.4 RULE-PE-007` + task #10 |
| `0012_verdict_trace_persist.sql` | 12 | **04 §3.1/§3.4 + P0-2-EXT** verdict_nodes 持久化裁决内核输出（verdict_trace_json + verdict_trace_hash·reasonCodes/ruleTrace/decisiveRuleId/evidenceSufficiency 进 current_hash 白名单）| `04_PROOF_ENVELOPE_AND_VERIFIER §3.1/§3.4` + CLAUDE.md §4 P0-2-EXT |
| `0013_verdict_enum_guard.sql` | 13 | **FUSION-OS-11** verdict/conclusion enum 纵深防御 trigger（与 0001 列级 CHECK 正交的第二层物理兜底·防 future DROP+重建漏 CHECK）| `FUSION_OPEN_SCIENCE_DESIGN §4 OS-11`（含 :287 erratum 勘误） |
| `0014_verdict_supersede.sql` | 14 | **FUSION-OS-12** verdict_nodes.superseded_by 自指 FK + WHERE superseded_by IS NULL 查当前裁决（重评写新行设指针）| `FUSION_OPEN_SCIENCE_DESIGN §4 OS-12` + DEPTH_LEDGER §C OS-12 |
| `0015_far_blob_store.sql` | 15 | **FUSION-OS-9** 内容寻址 blob CAS 表（hash PK·evidence/FEC Plan/kernel trace 按 hash 去重·append-only trigger）| `FUSION_OPEN_SCIENCE_DESIGN §4 OS-9` + DEPTH_LEDGER §C OS-9 |
| `0016_evidence_derivable.sql` | 16 | **FUSION-OS-10** evidence_log derivable 标记 + evidence_payload_hash（可重算验证·闭合 canonicalHash 不含 evidence_payload 的缺口）| `FUSION_OPEN_SCIENCE_DESIGN §4 OS-10` + DEPTH_LEDGER §C OS-10 |
| `0017_evidence_provenance_class.sql` | 17 | **FUSION-OS-6** evidence_log provenance_class（system_derived/llm_generated/human 三值）+ system_claim_hash（LLM 产出 provenance 强制 null + 系统 hash 重算·来源不可自填红线）| `FUSION_OPEN_SCIENCE_DESIGN §4 OS-6` + DEPTH_LEDGER §C OS-6 + CLAUDE.md §5 |
| `0018_evidence_provenance_trigger.sql` | 18 | **FUSION-OS-6（trigger 层）** evidence_log provenance 跨列不变式 DB BEFORE INSERT trigger（闭合 0017 仅列级 CHECK 的缺口·应用层 throw 与 DB trigger 正交）| `FUSION_OPEN_SCIENCE_DESIGN §4 OS-6` |
| `0019_ruleset_uri.sql` | 19 | **IC-01 + ADR-007** proof_envelopes.ruleset_uri（内核规则集版本 URI·非破坏性 ADD COLUMN·NULL=legacy V1 信封按 farlab.dev/ruleset/v1 派发）| `IC-01.contract.yaml` + ADR-007 |
| `0020_call_record_payload_hashes.sql` | 20 | **IC-07 + RT-04 + ADR-003** call_records.request_payload_hash（F-01 修复·payload 内容哈希覆盖·闭合 verifyChainHead 只含 8 元数据列的缺口）| `IC-07.contract.yaml` + RT-04 + ADR-003 |
| `0021_lifecycle_events.sql` | 21 | **IC-05 + PT-8 + ADR-004/012/021** lifecycle_events（撤回/纠正/supersession 墓碑化派生记录·状态机 active→contested→终态·事件级 prev_hash/current_hash 链）| `state-machines/retraction_lifecycle.yaml` + `IC-05.contract.yaml` |

## §3. spec SSOT 中仍未落地的实体（对应未实现运行时）

下列 spec 时间线占位实体**截至 0021 仍未独立落地**（0012-0021 的 contiguous 编号落地的是 verdict_trace/supersede/CAS/derivable/provenance 等不同实体，见 §2）。**不为凑编号造空壳迁移**（空壳 = 假绿，违反 `02 §7.2` 与反 theater 原则）。

| spec 占位实体 | 目标 Wave | 状态 |
|---|---|---|
| probe_atlas 三表（原 spec 0012 占位）| W1/V2 | 待实现 |
| sensitivity_envelopes / UQ 灵敏度（原 spec 0013/0014 占位）| W4 | 待实现 |
| far_bench_metrics（原 spec 0015 占位）| V2 | 待实现 |
| sciir_objects（原 spec 0016 占位）| W2 | 待实现 |
| trace_events（原 spec 0019 占位·旧 uq_grades 语义弃用号复用）| V2 | 待实现 |
| verdict_protocols（原 spec 0020 占位）| W2 | 待实现 |
| replay_forks / ledger_events+merkle_roots / adversarial_rounds（原 spec 0021/0022/0024 占位）| W6+ | 待实现 |

> 注：`30_FINAL_CHECKLIST.md §1` 的"0019 弃用"措辞应理解为"**0019 旧语义（uq_grades）弃用，编号在 spec 时间线中预留给 trace_events**"（实际 contiguous 0019 落地的是 ruleset_uri，非 trace_events）。

## §4. 裁决依据（决策日志）

- **优先级链**（`02_CONSTRAINTS_AND_RED_LINES.md §8`）：迁移编号不在 L0 铁律 / L1 宪法12条 / L2 T1-T12 信任根 / L2 F1-F12 反 theater / L2 Z1-Z16 零容忍 / L3 DO_NOT_CLOCUS 任何硬约束层。最相关的 T10/T11（`02:122-123`）约束的是迁移**语义属性**（可逆 up+down、append-only），非编号数量。
- **spec 自身矛盾**（CROSS-CUT-003，登记于 `33_UPGRADE_DIAGNOSTIC_REGISTER.md:176`）：`25:188`（0001-0024）vs `30:24`（0001-0025）vs `21:245`（0001-0024 锁定）三处不一致。
- **Ask 层归属**（`32_UPGRADE_MASTER_PLAN.md:412` Ask#6）：编号收敛属规范方拍板事项（02 §7.5 改 Schema），dev agent 不单方机械收敛。
- **诚实护城河原则**（`02 §0` / `24 §0` / `06 §7`）：采纳 contiguous + 诚实映射（选项 A），拒绝机械扩 25 空壳文件（选项 B = theater）。
- **forward-only 设计声明**（与 T10/T11/§33 一致性）：实际 runner（`src/db/migrator.ts:runMigrations`·仅单向 `up`·grep 核实零 down/rollback）是**有意的 forward-only 设计选择**，非遗漏。理由：① 0001 五核心表已落 append-only trigger（T2·禁 UPDATE/DELETE），任何 down 都破坏 hash 链违反 T11；② `32 §1.1(d)`（L33）明文"V1 不交付可运行迁移机·不假装能跑通"，`32:250` 明文"无 down 脚本规范"；③ T11"必须可逆（up+down）"为迁移语义指引，受保护核心不变性是 append-only，forward-only + append-only trigger 已满足。
- **verdict_nodes 不加 no_delete（INTENTIONAL_NO_CHANGE·审计 #18）**：verdict_nodes 是"有状态裁决节点"（`01 §2.7` append-mostly），非纯 append-only 证据表。spec T2 append-only 铁律（`02:114`）只覆盖 4 表（call_records/evidence_log/repro_runs/schema_meta），verdict_nodes 不在内。现有 FK ON DELETE RESTRICT + immutable_fields 白名单 trigger + no_terminal_rollback 已充分覆盖"被引用节点禁删"，同时允许孤立节点删除用于图重建/GC。加 no_delete 会过度防御。

**裁决结论**：保留 contiguous 0001-0021 + 诚实映射（本文件即映射 SSOT）。偏差定级 **P2 术语一致性**，非 P0/P1，不阻塞交付。（F-5-10-001：原"11 个文件"过时叙事已于 R5 对齐为 21。）
