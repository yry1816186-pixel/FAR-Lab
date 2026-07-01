# CHANGELOG — FAR-Chain V1 推进

> 格式：Keep a Changelog · 权威 SSOT = 源码 + 本 CHANGELOG 实测记录；`FINAL_PACKAGE/` 为竞赛 PDF 提交层（git-ignored·git clone 不可见）。本文件记录 V1 推进里程碑，不作为运行时科学制品。

## [V1-push] — 2026-06-30

### feat(benchmark): Science-125 套件 + 套件级 Merkle 聚合 + GET /api/v1/benchmark（spec 41 §1 + 09 §4）
- **套件根聚合**：`src/benchmark/aggregator.ts` —— `runBenchmark(SeedRunner[])` 串行跑每个 seed 的 6-stage loop + FEC 编排 → `computeChainMerkleRoot` 算单链根 → 按 problemId 升序确定性叶序 → `suiteIntegrityRoot = computeMerkleRoot(entries.map(e => e.integrityRoot))`（所有 problem 单链根再 Merkle 折叠一次）。`BenchmarkReportDto` 全字段（schemaVersion/generatedAt/problemCount/entries/suiteIntegrityRoot/totalLeaves/verdictDistribution/domainDistribution/gitCommitSha/honestyNotes）。
- **CI golden 锚**：`benchmark/benchmark_report.json`（git-tracked）—— `tests/benchmark/aggregator.test.ts` 断言 `suiteIntegrityRoot === git-tracked 报告根`（防回归）+ `=== computeMerkleRoot(entries.integrityRoot)`（聚合正确性）+ 跨两次运行字节相同（确定性）。
- 端点：`GET /api/v1/benchmark` → 200 + 完整报告（含缓存：两次请求相同 suiteIntegrityRoot）；503 SERVICE_UNAVAILABLE（报告未生成）。
- 测试：`tests/benchmark/*.test.ts`（12 项：报告合法性 + 叶序确定性 + 套件根跨运行字节相同 + golden 锚 + 聚合正确性 + totalLeaves 求和 + verdictDistribution 全 5 键 + verdict 多样性 + domainDistribution + honestyNotes + gitCommitSha）。

### feat(seed): Science-125 seed 3→6 扩展（生物/化学/地学多领域 · 全 5 verdict · spec 41 §1）
- **6 seed 全 verdict 设计**（FEC 真实裁决非全过·反剧场）：A4 行星轨道衰减（天文学/INCONCLUSIVE）/ A16 脉冲星P0（天文学/CONFIRMED）/ B7 蛋白质折叠（生物/REFUTED·CASP15 TM-score）/ C3 催化剂活性（化学/DEGRADED_SCOPE·SAC scope slip）/ E2 碳通量（生态气候/CONFIRMED）/ G5 地震前兆（地学/UNTESTED·空 evidences）。
- 每个 seed：完整 6-stage agent loop + FEC 编排 + SourceCard + GraphSubtree + chainVerify + paper。全程 offline_replay（fresh-clone 无 key 可跑）。
- 诚实设计：G5 evidences 空数组 → decideVerdict 第一分支 UNTESTED（地震前兆领域无可复现 metric 证据·诚实标 UNTESTED 而非伪造 CONFIRMED·反剧场红线）；B7/C3 经 F2 优先级路由真实降级。
- 测试：`tests/demo_seeds/*.test.ts` 6 seed 各 1 项 + "六个 seed 全部可独立运行互不污染" 1 项（7 项）。

### feat(integrity): IntegrityPage 4 大组件 + 浏览器侧 Merkle 重算库（spec 09 §4 + 04）
- **浏览器侧 Web Crypto 重算**：`frontend/src/lib/merkle.ts` —— `computeMerkleRoot(leafHashes)`（crypto.subtle.digest SHA-256）+ `buildMerkleTree`（duplicate-last-on-odd）+ `combineHashes` + `verifyInclusionProof` + `flipLastHexChar` + `ZERO_MERKLE_ROOT`。镜像后端 `src/evidence_log/merkle_root.ts` 算法（跨语言字节相等契约）。
- **4 组件**：① WholeChainRecompute（浏览器从 golden leaves 重算全链根·对比报告根）；② ProofVerification（inclusion proof 独立验证）；③ Tamper Theatre（翻转叶哈希末位→浏览器重算根不变→立即不匹配·演示 tamper-evidence）；④ Repro Receipt（gitCommitSha + envHash fresh-clone 锁）。
- 端点接线：`GET /api/v1/integrity/{root,proof/:seq,receipt}`。
- 测试：`frontend/src/__tests__/IntegrityPage.test.tsx`（含跨语言字节相等契约 + Tamper Theatre）。

### feat(leaderboard): LeaderboardPage + SuiteVerifier 浏览器侧套件根独立验证（spec 41 §1 + 09 §4）
- **LeaderboardPage**：Hero 套件根（suiteIntegrityRoot + problemCount + totalLeaves + domainCount）+ 裁决分布（5 verdict 行 + 占比条）+ 领域覆盖 + 问题表（每 entry 单链根短 hash + verdict badge）+ 诚实墙。
- **SuiteVerifier（惊艳核心）**：浏览器用 Web Crypto 从 `entries[].integrityRoot` 重算 `suiteIntegrityRoot`，对比报告声称的根。**用户无需信任服务端**——这是 leaderboard 区别于普通展示榜的"可验证"灵魂。Tamper Theatre：翻转报告根末位 hex（保持 64-hex 合法）→ 浏览器重算根不变 → 立即不匹配。
- 端到端契约铁证：前端 `computeMerkleRoot(entries) === 后端 aggregator suiteIntegrityRoot`（同算法·同输入·跨语言字节相等）。
- 测试：`frontend/src/__tests__/LeaderboardPage.test.tsx`（10 项：Hero/裁决分布/领域/问题表/诚实墙/SuiteVerifier 验证通过/篡改不匹配/恢复/错误状态）；mock 用真实 computeMerkleRoot 算匹配根（beforeAll async）= 端到端契约铁证。

### 验证档（全量绿 · `pnpm run ci-all` + frontend 双构建 实测 2026-06-30）
- Backend ci-all STEP1–11：zero-tolerance ✓ / typecheck ✓ / test 主 ring **662** / test:agent_loop **67** / test:ci **44** / test:py **110** / eval-ring-audit ✓ / verify_chain_smoke ✓ / Z16 Core 覆盖率 **92.80% line / 79.56% branch**（≥85%/≥75%）/ competition_qwen_smoke ○ SKIP / snapshot_liveness_smoke ○ SKIP → ✅ CI-ALL: PASS（core gate 全绿）
- Frontend：typecheck ✓ / lint ✓ / test **155**（含 IntegrityPage + LeaderboardPage + SuiteVerifier）/ build ✓（2214 modules）
- 测试总量：backend 662+67+44+110=**883** + frontend **155** = **1038 tests / 0 fail**

---

## [V1-push] — 2026-06-29

### fix(science_harness): AT-01 mapChecksToVerdict SKIP≠PASS 语义修复（9 维审计独立验证 · spec 11 §3 F2 优先级）
- **AT-01（SKIP 静默升 CONFIRMED · 反 theater）**：`src/science_harness/tess_harness.ts` mapChecksToVerdict 原 hasFail/hasWarn/hasPass 均不读 SKIP outcome → `[PASS, SKIP]` 经 hasPass 存在性判定静默升 CONFIRMED（未全覆盖却声称已证实 = theater）。修复：① `types.ts` VerdictRoute 增 `partial_skip` 子路径；② tess_harness 加 `hasSkip` 谓词 + `allPass` 全量判定（`every` PASS，替代存在性 hasPass）；③ F2 优先级新增 P4 `partial_skip`（含 PASS 但有 SKIP 未测项 → INCONCLUSIVE），P5 `all_pass` 收紧为全 PASS 无 WARN/FAIL/SKIP；④ `ROUTE_TO_VERDICT.partial_skip = 'INCONCLUSIVE'`。
- 测试：`tests/science_harness/science_harness.test.ts` 新增 2 项回归守护（`[PASS, SKIP] → INCONCLUSIVE` + `[PASS, PASS, SKIP] → INCONCLUSIVE`）+ 重编号原 P4→P5/P6，全套 28 项绿（原 26 + 2 新增 partial_skip）。tsc EXIT=0 / eslint EXIT=0。
- 语义：SKIP≠PASS，含未测项即未全覆盖，禁升 CONFIRMED（spec 11 §3 all_pass = 全 PASS 严格判定）。

### fix(ci): ci-07 migration gate 诚实声明（forward-only up [0001-0008] + up 幂等 + V2 R-MIG 边界 · spec 23 §1 STEP5 vs spec 32 §33）
- **ci-07（spec 矛盾诚实标注·非新代码）**：spec 23 §1 STEP5 要求 migration up/down/up 幂等，spec 32 §33 裁定"V1 不交付可运行迁移机（R-MIG 占位红·R2 后置·不假装能跑通）"——两处矛盾。V1 实际覆盖（已由现有测试落 `test_ts` 全量跑，非假绿）：forward migrate up [0001-0008]（`db_migrator.test.ts` runMigrations applies [1..8]）+ up 幂等（up→up 不变 'skips already applied versions'）+ contiguous version gap 拦截 + append-only trigger 拦截（`append_verify.test.ts` DROP TRIGGER + UPDATE 篡改 → verifyChainHead 检测）。`.github/workflows/ci.yml` STEP 5 补 migration gate 落点注释（声明 forward-only 覆盖 + migrate down/up-down-up 完整幂等 = V2 R-MIG）。test:schema 19/19 绿。
- 诚实边界：CI 不声称"迁移机可跑通 down 幂等"；down/幂等回放闸门按 `32 §1.1(d)` 裁决归 V2+（待 R2 真绿后激活）。

### fix(schema/docs): #18 schema_migration forward-only 声明 + verdict_nodes no_delete 决策 + 文档同步（9 维审计独立验证）
- **forward-only 设计声明**（消除"T11 要求 up+down 但只实现 up"文档矛盾）：`schema/migrations/README.md` §4 加决策日志——实际 runner（`src/db/migrator.ts:runMigrations`·仅单向 up·grep 核实零 down 实现）是**有意的 forward-only 设计选择**，非遗漏。理由：① 0001 五核心表已落 append-only trigger（T2·`02:114`），down 会破坏 hash 链违反 T11 第三分句；② 与 `32 §1.1(d)`/`32:250` 一致（V1 规范层无 down 脚本契约）；③ T11"可逆"为语义指引，受保护不变性是 append-only，forward-only 已满足。
- **verdict_nodes 不加 no_delete（INTENTIONAL_NO_CHANGE）**：verdict_nodes 是「有状态裁决节点」（`01 §2.7` append-mostly），非纯 append-only 证据表；spec T2 append-only 铁律（`02:114`）明确只覆盖 4 表（call_records/evidence_log/repro_runs/schema_meta），verdict_nodes 不在内。现有 FK ON DELETE RESTRICT（evidence_id / parent_verdict_id 自引用 / evidence_edges 双向 / repro_runs.verdict_id）+ immutable_fields 白名单 + no_terminal_rollback 已充分覆盖"被引用节点禁删"，同时允许孤立节点删除用于图重建/GC。加 no_delete 会过度防御（违反 append-mostly 设计 · 阻碍合法图重建 · 与 T2 SSOT 范围不符）。结论：当前"无 no_delete"是有意设计，非缺失。
- **文档同步**：README §1/§2 标题"7 个文件"→"8 个文件" + §2 加 `0008_anti_theater_fail_coverage` 映射行（AT-02 anti-theater trigger 覆盖 FAIL · `23 §5.1` + `02 F1`）+ 裁决结论 0001-0007→0001-0008；`DELIVERY_REPORT.md` §2 M3 加 claimType 覆盖 1/3 路标（仅 existence 跑通）+ §5 诚实边界增第 6 条 evo-02（T-W2-06 三 claimType 实际达成 1/3 · hero-A/hero-B not_implemented · 不声称"三 claimType 交付"）。

### fix(fec/falsifiability): §2-M2 接线 FEC contract 预登记回路 + §3-R9-2 R9-2-4 注释 grep 修复（9 维对抗终检 workflow skeptic 推翻）
- **§2-M2（PARTIAL→VERIFIED·死代码消除）**：`src/falsifiability/contracts.ts` 的 `registerContract`/`getContractsByClaim` 原为死代码（全仓零调用零测试未导出·9 维 workflow skeptic 推翻 §2-M2 假绿）。修复：① `src/falsifiability/index.ts` barrel 导出 contracts 全套；② `src/fec/orchestrator.ts` `fecAppendClaim` 接线可选 `contractInput`（F8 反 p-hacking·makeVerdict 前 registerContract·事务内原子回滚）+ `FecAppendClaimResult` 加 `contract` 字段；③ `tests/falsifiability/contracts.test.ts` 新建 5 项（F8 preregistrationHash 64hex + F7 empty guard + getContractsByClaim 分组 + append-only R1 UPDATE/DELETE trigger + hash 区分不可变字段）；④ `tests/fec/fec_orchestrator.test.ts` 加 contract 接线集成测试（result.contract 非 null + falsifiability_contracts 行数=1）；⑤ `src/far_proof/demo_chain.ts` 真实预登记（contractInput 从 DEMO_FALSIFICATION_SPEC 派生·contract 独立表不进 canonical_hash 白名单/不进 .far-proof 9+1 分量·proofHash 字节重算不变·demo_chain_replay 10/10）。主 ring 540→546 tests，tsc/eslint EXIT=0。
- **§3-R9-2 R9-2-4（注释 grep 红→绿）**：`src/falsifiability/auditor.ts:154` 注释含 'AUDITOR_ENABLED' 字面量，触发 build-integrity.yml R9-2-4 `grep -rPn "^\s*//.*AUDITOR_ENABLED" src/` → CI exit 1（skeptic 推翻 §3-R9-2）。修复：改注释用语义指代（审计器/编译时常量）移除字面量，R9-2-4 grep 在 src/ 零命中。**诚实边界**：§3-R9-2 整体仍 NEEDS_CI_RUN——build-integrity.yml 从未在 GitHub Actions 运行（分支未推 main/无 PR），R9-2-4 子项 code 已修但 15 子项闭环远程验证需人类推 main + 开 PR，非 code agent 可单方面关闭。

### fix(evidence_log): R2-01/R2-02 golden_vectors 数值边界反假绿修复（spec 23 §2.3/§80 · 09 §3 · HANDOFF §3.3）
- **R2-01 紧急**：`src/evidence_log/golden_vectors.ts` 新增 `NUMERIC_GREEN_VECTORS`（7 项真数值：`0.1+0.2`/`1e21`/`42`/`2**53+1`/`1.0`/unicode/isoTs）+ `NUMERIC_KNOWN_DIVERGENCE`（1 项真实序列化格式差异：N2b 指数零填充 TS `1e-7` vs Py `1e-07`）；镜像 Python `repro/far_chain_repro/golden_vectors.py`。
- **R2-02 紧急**：重写 `golden_vectors/generate_golden_vectors.ts`——旧版用 `canonicalHashVerified`（T3 白名单仅 4 个 string 字段）把数值字符串化塞进 `cred.reproHash`（`'1.0_float_test'.padEnd` 等），字符串恒 byte-equal，数值漂移防御失效；本版 N1-N3 走 `hashCanonicalJson` 用真数值，N4 用真 NaN 验证 `assertNoNonFiniteNumber` 抛错 → `REJECTED_AS_EXPECTED`（消除 `SHOULD_HAVE_REJECTED` 占位）。
- **day-0 cross-lang PoC 真值发现（证据驱动，反幻觉）**：N1(1.0)/N3(2^53+1) 经 stdin-harness 归 GREEN——JS 值规约在序列化 stdin 前完成，Python 经 json.loads 拿到已规约值，两边 byte-equal（声称 RED = 伪造，已修正）。唯一真实跨语言序列化格式差异 = N2b 指数零填充，锁定为 V3 RFC 8785 JCS 迁移回归基线。`canonicalHash` 信任根（cred 全 string）byte-equal 不受影响。
- 测试：`tests/evidence_log/cross_lang_consistency.test.ts` 新增 2 项（GREEN 7 项 spawnSync 对拍 byte-equal + RED 1 项 notEqual 锁定），全套 18 项绿。
- E4 状态：`待实测`（N4 占位）→ `已实证`（N4 REJECTED + N1-N3 真数值）；`scripts/day1_verify.mjs` E4 检查函数升级 `goldenE4State()`；同步 `DELIVERY_REPORT.md`（3/6 已实证）、`docs/DAY1_VERIFICATION.md` E4。

### fix(llm_gateway/science_harness): evo-01 deepseek-fallback 3-tier 对齐 + evo-03 三 claimType 诚实清单（9 维审计 · 24 §5 / 22 T-W2-06）
- **evo-01（live 红线冲突·24 §5）**：`fallback_config.ts` 的 `COMPETITION_FALLBACK_CHAIN` 4→3 元素（删 deepseek-fallback last_resort）。spec 24 §5 已于 2026-06 删 deepseek 第4档（02 §C2·fallback 不越 Qwen 家族·31 §10.2），代码落后 SSOT 仍可切 deepseek 失 D3。对齐：3 元素 Qwen-only（qwen3.7-max→qwen3-235b-a22b→qwen-plus），新增 `NO_QWEN_FAMILY_AVAILABLE_REASON`（三档全失败→caller 消费 chainExhausted→verdict=UNTESTED+此 reason）。引擎 invalidatesD3 通用机制保留（防御性）。同步回写 CHANGELOG/DAY1/DELIVERY/spec 21/HANDOFF。`fallback_chain.test.ts` 第 5 节 4→3 + 新增 no-deepseek/exhaust-reason 断言（28/28 绿）。
- **evo-03（DO_NOT_CLAIM hazard·22 T-W2-06）**：spec 承诺三 claimType（existence/quantitative/causal），V1 实际只交付 C-ASTRO-0001 existence。新增 `src/science_harness/claim_fixtures.ts`：`V1_CLAIM_FIXTURE_ROADMAP`（1 delivered + 2 not_implemented 带原因）+ `countDeliveredV1ClaimFixtures()`。机器可验证诚实清单——测试断言 V1 只交付 existence，防「声称 3 交付 1」（33 FP3-ENG-GPU-005）。hero-B 依赖 T-W2-07 L7-L3 ConfoundingGate（F6·V1 未实现）。21 §8 V1 裁剪保单链。`claim_fixtures.test.ts` 3/3 绿。

### fix(frontend): demo-03 DemoModePage 诚实标注八幕引导偏离（9 维审计 · 16 §2 / 22 T-W5-05）
- **demo-03（spec↔code 偏离）**：`frontend/src/pages/DemoModePage.tsx` 的 DEMO_SCENES 8 幕是「FAR 功能导览子集」（概念介绍 + 可信点 + 诚实标注 + 关联页面），非 spec 16 §2 八幕可信链现场演示（claim→SciIR→falsification→sandbox→reproHash→verdict→ProofEnvelope→.far-proof 数据流转 + 幕6 INCONCLUSIVE + 降级加演）。原注释 `(spec 16)` + 页头「8 幕引导」过度声称。修复（优先诚实标注避免大改前端风险）：注释 + 页头副标题（8 幕引导→8 幕功能导览）+ 新增 `demo-v1-scope-note` 诚实声明（V1 功能导览子集·完整八幕见 T-W5-05 路线图项）。spec 22 T-W5-05 状态行同步标注。`DemoModePage.test.tsx` 新增 scope-note 断言。

## [V1-push] — 2026-06-28

### feat(M3): Executable Science Harness（spec 12 / spec 11 §3）— 类型层契约落地
- 新增 `src/science_harness/`：`types.ts`（SandboxResourceSpec + SR-1..SR-7 契约）、`sandbox_runner.ts`（确定性 hash 计算 + C19 上限强制 + seed=42/networkBlocked/singleThreaded 不变量）、`dataset_resolver.ts`（3 值数据集决策树：resolved/degraded/untested · 白名单 host · contentHash 完整性）、`tess_harness.ts`（C-ASTRO-0001 M1-M4 检验 + verdict_mapping F2 优先级 5 路径）。
- **诚实边界（F4）**：V1 仅类型层约束；正确措辞 "resource-bounded & network-restricted venv execution"；实际 venv 子进程隔离推迟 V2+。
- 测试：`tests/science_harness/science_harness.test.ts`（26 项：C-ASTRO hero demo M1-M3 PASS+M4 WARN→INCONCLUSIVE、dataset 3 值决策树、sandbox 确定性 hash、F2 优先级全路径）。

### feat(CI): F4 诚实边界禁词扫描（spec 12 · 02 §4）
- `scripts/zero_tolerance_scan.mjs` 新增 F4 专项扫描：src/ 中禁 `strong isolation` / `tamper-proof` / `physically isolated`（过度声称）。
- `tests/ci/zero_tolerance_scan.test.ts` 新增 F4 负向元测试（注入 overclaim 字面量 → 扫描器须捕获 `f4_overclaim_strong_isolation`），证明门禁非空门。

### feat(llm_gateway): FallbackChain 降级链（spec 05 §8.2/§9 · spec 24 §5）— 引擎+分类器+错误层级
- 新增 `src/llm_gateway/fallback_chain/`：`errors.ts`（ProviderError → BailianHttpError/Timeout/Network；RateLimitError extends 429 · F-05-18）、`error_classifier.ts`（触发矩阵：5xx+429+timeout+network→fallback；4xx+config+unknown→fatal · F-05-17）、`fallback_chain.ts`（caller 注入·模型无关·离线可全测·F11 绝不静默换）、`types.ts`。
- 新增 `src/llm_gateway/adapters/aliyun_qwen/fallback_config.ts`：`COMPETITION_FALLBACK_CHAIN`（3 元素 Qwen-only 链 qwen3.7-max→qwen3-235b-a22b→qwen-plus · evo-01 对齐 24 §5 2026-06 删 deepseek·三档全失败→verdict=UNTESTED+reason=no_qwen_family_available）。
- 测试：`tests/llm_gateway/fallback_chain.test.ts`（24 项：触发矩阵全状态、链路遍历/降级/耗尽/致命终止、D3 红线、F11 留痕、链配置）。
- **诚实边界**：引擎+分类器+错误层级全绿可测；`call_records.degraded_from` **已落地**（migration `0007_add_degraded_from` + `repository.appendRecord` 16 列写入 + 5 项落库测试 `degraded_from.test.ts` + 3 项 FallbackChain→call_records 桥接测试 `fallback_degraded_from_bridge.test.ts`）；纯审计列·不进 canonical_hash 白名单（4 键 stageId/cred/payloadKind/prevHash）·不破坏哈希确定性。

### feat(day-1): day-1 实测脚手架 + NEEDS_* 标注（02 §7.4/§10）
- 新增 `docs/DAY1_VERIFICATION.md`：E1-E6 + NEEDS_* 状态词 + `[已实证·来源·日期]`/`[须day-1核验·方法]` 口径 + Ask 层 CI 接线建议项。
- 新增 `scripts/day1_verify.mjs`：状态报告器（检查证据产物·诚实区分 1/6 已实证 vs 5/6 须 day-1·绝不假绿）。
- 新增 `scripts/generate_cost_snapshot.mjs`：E6 成本快照生成器（SECURITY.md §88-99 格式·定价字段永远 `__redacted__`·无真实数据绝不写假文件）。
- NEEDS_* 代码注释标签落点：`ci/snapshot_liveness_smoke.ts`（E1·NEEDS_REAL_ENV）、`ci/competition_qwen_smoke.ts`（E6·NEEDS_HUMAN_OPERATION）、`src/llm_gateway/adapters/aliyun_qwen/extract_request_id.ts`（E2·NEEDS_REAL_TEST）、`golden_vectors/generate_golden_vectors.ts`（E4·N4 占位待裁决）。
- `package.json` 加 `day1:verify` / `day1:cost-snapshot` 便利脚本。

### fix(ci): CI 假绿逃生口修复（eval_ring_audit）
- 修复 `scripts/eval_ring_audit.mjs` 的 skip≠pass 假绿逃生口（任务 1）。

### fix(frontend): Honesty Wall stub 数据替换
- `OverviewPage` 删除 `RECENT_HYPOTHESES_STUB`，改用 `useVerdictList` + 诚实 loading/error/empty 状态（任务 2）。
- `DemoModePage` 场景 7/8 credibilityPoints 引用真实脚本（replay_demo_chain / recompute_proof_hashes / verify_chain_smoke）。

### fix(far-chain): 对抗式审计问题修复批（T1-T6）+ backend lockfile 复现性修复
- T1 chore(toolchain)：接入 eslint 零容忍门禁（`eslint.config.js` · Z1/Z2/Z3 + `argsIgnorePattern '^_'`）；`package.json`/`pnpm-lock.yaml` 加 `@eslint/js`+`eslint`+`typescript-eslint`；清 `evidence_integration.ts` 死变量 `_base64`。`pnpm run lint` EXIT=0。
  - 附带 reproducibility 修复：`pnpm install` 重生成 lockfile —— 提交版含 **1011 包条目（5619 行）**，实际仅需 **516（2659 行）**（-495 残留·与 committed package.json 不一致）；prune 后 `pnpm install --frozen-lockfile`（CI strict）+ 全量 ci-all 复现通过。
- T2 fix(api)：JWT fail-closed（`jwtSecret≠null` 时缺/畸形/空/无效 token → 401；移除硬编码弱 secret 兜底）；`server.ts` 条件注册 jwt 插件（offline 模式不注册）。新增 `tests/api/jwt_auth.test.ts`（6 例）。
- T3 fix(ci)：build-integrity R9-2-11 假绿逃生口（`dist/` 缺失原 `::warning::`→改 `::error:: + exit 1`）。
- T4 fix(agent_loop)：`create_params` 模型中立重构（删 5 个模型 ID 常量 + R1 模型守卫下沉 adapter；保留 R1 互斥锁）。R9-2-14 核心 11 目录零 qwen/dashscope/bailian 实质字面量（GNU grep PCRE 复现 CLEAN）。
- T6 ci：`PNPM_VERSION '9'→'10.29.3'` 对齐 `packageManager` SSOT；`ci.yml` concurrency 加 `event_name` 隔离 schedule；前端测试数注释 112→123。

### fix(frontend): @testing-library/dom 缺失依赖（CI 不可复现修复）
- 根因：`@testing-library/dom`（`@testing-library/react@16.3.2` 的非可选 peer·`pure.js` 运行时 `require('@testing-library/dom')`）仅作为 peer 要求出现在 `package-lock.json`，**无锁定包条目** → CI 的 `npm ci --legacy-peer-deps` 严格按 lockfile 安装、永不装该 peer → 前端 test（`Cannot find module '@testing-library/dom'`·9 文件全崩）+ build（TS2305/TS7006/TS18046 级联）全红。即「123 tests passed」此前仅靠本地 `npm install` 的 peer 自动安装偶得，**经提交 lockfile + CI 命令不可复现**。
- 修复：`frontend/package.json` devDependencies 显式加 `@testing-library/dom@^10.0.0`（满足 react@16 peer `^10.0.0`）+ `npm install --legacy-peer-deps` 重生成 lockfile（锁定 `@testing-library/dom@10.4.1`·`node_modules/@testing-library/dom` 条目就位）。
- 验证：`npm run test`（9 文件·123 passed）+ `npm run build`（tsc -b 零错·vite 2210 modules）+ `npm run lint`（零告警）全 EXIT=0；123 tests 现经提交 lockfile + CI 命令可复现。

### feat(M4/M6): .far-proof 真实导出 + Demo 叙事桥接
- `src/far_proof/exporter.ts` + `demo_chain.ts`：.far-proof 7+1 分量端到端可重放导出（修 prov.ttl 插值 bug + 加 writeCodeManifest）。
- `scripts/replay_demo_chain.ts` + `recompute_proof_hashes.ts`：CLI 可重放 + proofHash 字节级重算（`import.meta.url` 守卫防 import 时触发 main）。
- 测试：`tests/far_proof/demo_chain_replay.test.ts`（8 项：ASK-9 密封降级、8 文件、recompute 字节相等、prov.ttl 无残留、README 锁 gitCommitSha、脱敏、ro-crate 锚点、verifyChainHead）。

### chore: 配置与安全
- `.gitignore` 加 `evidence/dashscope_calls/*.{png,jpg,jpeg,webp}`（防百炼控制台截图入库）。
- `scripts/zero_tolerance_scan.mjs` skippedFiles 加 day1 脚本/doc（合法引用 env 变量名·经审计合规）。
- `ci/snapshot_liveness_smoke.ts` 移除预存未用 `join` 导入。
- `package.json` test glob 加 `tests/science_harness/*.test.ts` + `test:science_harness` 脚本。

### DEFERRED（spec 24 §8 P2 可砍 · V1 延后）
- **UQ-Witness**：spec 24 §8 标 P2 可砍（"T-W4-03 可后补"）；spec SSOT 迁移号为 0013/0014（0007 已被 degraded_from 占用·禁复用）。V2+ 补。

### 验证档（全量绿 · `pnpm run ci-all` 实测 2026-06-28）
- STEP1 zero-tolerance（含 F4 扫描）：✓ PASS
- STEP2 typecheck（tsc --noEmit）：✓ PASS
- STEP3 test（主 ring）：✓ PASS（527 tests）
- STEP4 test:agent_loop：✓ PASS（56 tests）
- STEP5 test:ci：✓ PASS（42 tests · 含 F4 负向元测试）
- STEP6 test:py（Python）：✓ PASS（110 tests）
- STEP7 eval-ring-audit：✓ PASS
- STEP8 verify_chain_smoke：✓ PASS（VERIFY_CHAIN_SMOKE: OK）
- STEP9 Z16 Core 覆盖率门禁（Node 24 原生 coverage · ≥85% line / ≥75% branch）：✓ PASS（92.19% line / 77.22% branch）
- STEP10 competition_qwen_smoke：○ SKIP（DASHSCOPE_API_KEY 未配置·诚实 skip ≠ 通过）
- STEP11 snapshot_liveness_smoke：○ SKIP（同上·day-1 实测项）
- 结论：✅ CI-ALL: PASS（core gate 全绿）；`pnpm run lint` EXIT 0
- Frontend 双构建（R9-2-8/9/10 等价）：`npm run build` BUILD_EXIT=0（2210 modules → dist）/ `lint` LINT_EXIT=0 / `test` 9 files·123 passed EXIT=0
- R9-2 编译时常量/反剧场 grep 子项（R9-2-1 零 process.env / R9-2-2 AUDITOR_ENABLED=true as const / R9-2-13 anti_theater trigger）：✓ 逐项核实
- 测试总量：backend 735（527 主ring + 56 agent_loop + 42 ci + 110 py）+ frontend 123 = **858 tests / 0 fail**
- 交付报告：`DELIVERY_REPORT.md`（证据驱动 · 诚实边界 · day-1 4/6 须现场核验 · §7.5 Ask 层记档）
