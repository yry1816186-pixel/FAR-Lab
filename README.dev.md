# FAR-Chain Development Scaffold

This directory is the implementation workspace for the FAR-Chain proof core. Design SSOT lives in `FINAL_PACKAGE/` (00-40 numbered specs; the legacy `FAR_CHAIN_DEV_SPEC/` was archived/removed in commit 66e2975); the W3 landed-subsystem design retro-spec is `FINAL_PACKAGE/40_VERIFIABLE_BENCHMARK_AND_LEADERBOARD.md`. Development control plane lives in root `AGENTS.md` + `CLAUDE.md` (authority order: AGENTS §1).

## W3 已落地（benchmark + integrity + leaderboard · 规模扩展 · 惊艳核心）

- **benchmark aggregator**（`src/benchmark/aggregator.ts`）：`runBenchmark` 串行跑每个 seed 的 6-stage loop + FEC 编排 → 单链根 → 按 problemId 升序确定性叶序 → `suiteIntegrityRoot = computeMerkleRoot(entries.map(e => e.integrityRoot))`（套件级 Merkle 聚合）。CI golden 锚 `benchmark/benchmark_report.json`（git-tracked · 防回归 + 跨运行字节相同）。
- **GET /api/v1/benchmark**：完整 BenchmarkReportDto（suiteIntegrityRoot / totalLeaves / verdictDistribution / domainDistribution / gitCommitSha / honestyNotes）；503 SERVICE_UNAVAILABLE（报告未生成）。
- **integrity 端点**：`GET /api/v1/integrity/{root,proof/:seq,receipt}` —— 套件/链完整性根 + inclusion proof + Repro Receipt（gitCommitSha + envHash fresh-clone 锁）。
- **Science-125 seed 3→6**：A16 脉冲星P0（CONFIRMED）/ A4 行星轨道衰减（INCONCLUSIVE）/ B7 蛋白质折叠（REFUTED · CASP15）/ C3 催化剂活性（DEGRADED_SCOPE · SAC）/ E2 碳通量（CONFIRMED）/ G5 地震前兆（UNTESTED · 空 evidences）—— **全 5 verdict · 5 领域**（天文学 / 生物 / 化学 / 生态气候 / 地学）· 全程 offline_replay。
- **IntegrityPage**（`frontend/src/pages/IntegrityPage.tsx`）4 组件：WholeChainRecompute / ProofVerification / **Tamper Theatre**（翻转叶哈希末位 → 重算根不变 → 立即不匹配）/ Repro Receipt。
- **浏览器侧 Merkle 重算**（`frontend/src/lib/merkle.ts`）：`computeMerkleRoot`（crypto.subtle.digest SHA-256）+ `verifyInclusionProof` + `flipLastHexChar` —— 镜像后端算法（跨语言字节相等契约）。
- **LeaderboardPage + SuiteVerifier（惊艳核心）**：浏览器用 Web Crypto 从 `entries[].integrityRoot` 重算 `suiteIntegrityRoot` 对比报告根 —— **用户无需信任服务端**（区别于普通展示榜的「可验证」灵魂）。前端 `computeMerkleRoot(entries) === 后端 aggregator` 端到端契约铁证。

## W2 已落地（agent_loop + CI）

- agent_loop 六阶段 FSM（9 文件）：`types.ts` / `stage_purpose.ts` / `create_params.ts` / `retry_policy.ts` / `schema_gate.ts` / `run_stage.ts` / `fsm_runner.ts` / `paper_assembler.ts` / `stages/{stage1-6}.ts` / `stages/schemas.ts`
- agent_loop 测试套件：`tests/agent_loop/`（create_params / retry_policy / stage1_2 / stage3_4 / stage5_6 / assert_terminated / fsm_order / n3_anti_hallucination / e2e_offline_replay）
- CI 12 步 gate：`.github/workflows/ci.yml`（install→typecheck→lint→py_typecheck→test_ts→test_py→test_registry→repro_check→cross_lang→eval_ring_audit→bailian_smoke[条件门]→verify_chain_smoke）+ `snapshot_liveness_smoke` schedule job（cron '17 2 * * *'）
- CI frontend gate（[J]）：`frontend` job 与后端串行链并行（`needs: install`）—— `npm ci --legacy-peer-deps` + `typecheck`(tsc -b) + `lint` + `vitest`(112) + `vite build`；frontend/ 是 npm 独立工作区（非 pnpm workspace 成员）
  - `--legacy-peer-deps`：eslint@10 vs eslint-plugin-react@7.37 peer 元数据过时（运行时兼容·npm 严格模式需显式开关）
  - `typecheck: tsc -b`（非 `--noEmit`）：项目引用下 `--noEmit` 在 fresh install 触发 TS6305（引用工程产物缺失·`tsc -b` 先构建引用工程）
  - `.gitignore` 增 `*.egg-info/`（Python setuptools 构建产物·`pip install -e .` 自动重建）
- `scripts/zero_tolerance_scan.mjs`：扫描 `:any` / `@ts-ignore` / `@ts-nocheck` / `as unknown as` / 空 catch / `extra_body` / `X-DashScope-Enable-Thinking` / `defaultHeaders.*Enable`
- `ci/verify_chain_smoke.ts` + `ci/snapshot_liveness_smoke.ts`：启动期链式自验 + 每日 snapshot 存活监控
- `src/audit/eval_ring_audit.ts` + `scripts/eval_ring_audit.mjs`：eval-ring 隔离审计（code path + data layer 双通道·禁 competition adapter 渗入评分环）
- cross_lang_consistency 测试：TS `canonicalHash` hex === Python `canonical_hash` hex 字节相等
- CI 测试套件：`tests/ci/`（zero_tolerance_scan / cross_lang_consistency / verify_chain_smoke / eval_ring_audit）

### Task 10 端到端验证结果（W2 收尾 + E2E 核验）

- `pnpm run typecheck`：exit 0（全量类型检查通过）
- `pnpm run zero-tolerance`：ok（零容忍扫描通过·含新增 `scripts/ci_all.mjs` + `scripts/fresh_clone_smoke.mjs` 合法 DASHSCOPE_API_KEY 引用白名单）
- `pnpm run test`（主环）：**296 pass / 0 fail**（含 audit / llm_gateway / schema / evidence_log / evidence_graph / falsifiability / fec / math / dialogue / demo_seeds）
- `pnpm run test:agent_loop`：**59 pass / 0 fail**（含 e2e_offline_replay 端到端 smoke）
- `pnpm run test:ci`：**40 pass / 0 fail**（含 competition_qwen_smoke / cross_lang_consistency / eval_ring_audit / verify_chain_smoke / zero_tolerance_scan）
- `pnpm run test:py`（跨平台 `scripts/run_py_tests.mjs`）：**46 pass / 0 fail**（`python`/`python3` 自动选择 + `PYTHONPATH` 显式设置）
- `pnpm run eval-ring-audit`：ok（`src/eval-ring/` 不存在 → graceful skip）
- `pnpm run fresh-clone-smoke`：**✅ core gate 全绿（9/11 通过，2 项 secret-gated 跳过）**
- `node scripts/ci_all.mjs`：**✅ CI-ALL: PASS (core gate 全绿)**
- Grep 验证 `src/` 禁用字面量：`X-DashScope-Enable-Thinking` / `extra_body` / `defaultHeaders.*Enable` / `: any` / `@ts-ignore` / `as unknown as` 全部 0 命中

> **W3 增量后当前真实值（2026-06-30 · `pnpm run ci-all` 全量复测）**：test 主环 **662** / agent_loop **67** / ci **44** / py **110** = backend **883**；frontend **155 tests** / build **2214 modules**；Z16 Core 覆盖率 **92.80% line / 79.56% branch**（阈值 ≥85% / ≥75%）。上述 W2 Task 10 数字（296 / 59 / 40 / 46）为 W2 收尾时快照，已被 W3 benchmark / integrity / leaderboard 工作增量覆盖，**以 ci-all 实测为准**。

### 运行命令清单

| 命令 | 用途 |
|---|---|
| `pnpm run test` | 主环全量回归（audit / llm_gateway / schema / evidence_log / evidence_graph / falsifiability / fec） |
| `pnpm run test:agent_loop` | agent_loop 全量测试（六阶段 FSM + 降级 + 反幻觉 + e2e smoke） |
| `pnpm run test:ci` | CI 全量测试（zero_tolerance / cross_lang / verify_chain_smoke / eval_ring_audit） |
| `pnpm run test:py` | Python 回归测试（跨平台 `scripts/run_py_tests.mjs` 自动处理 PYTHONPATH + python3/python 命令） |
| `pnpm run zero-tolerance` | 零容忍扫描（`:any` / `@ts-ignore` / `as unknown as` / 空 catch / 百炼 SDK 幻觉源） |
| `pnpm run typecheck` | 全量类型检查（`tsc --noEmit`） |
| `pnpm run ci-all` | CI 全量串行 11 步（zero-tolerance → ci-04 → typecheck → test 主环 → test:agent_loop → test:ci → test:py → eval-ring-audit → verify_chain_smoke → Z16 coverage 92.80%/79.56% → competition_qwen_smoke[条件门] → snapshot_liveness_smoke[条件门]） |
| `pnpm run fresh-clone-smoke` | fresh-clone 一键复现集成测试（模拟 fresh-clone 环境·无 secret 跑通 core gate） |

## W1 已落地（核心证明链）

- `schema/migrations/0001_initial.sql`：5 张核心表（call_records / evidence_log / verdict_nodes / evidence_edges / schema_meta）
- `evidence_log` trust root + TS `canonicalHash`（03§2.4 SSOT）+ Python `canonical_hash`（跨语言字节相等）
- `llm_gateway` 模型中立 core + `adapters/aliyun_qwen` competition adapter + `adapters/offline_replay` 离线回放 adapter
- `falsifiability` gate（`assertFalsifiable`）
- `evidence_graph` DAG + `cycle_guard`（应用层递归查询·非 trigger CTE）
- FEC orchestrator（evidence chain 编排）

## 范围边界（spec §范围边界·刻意不落地）

- stage0_dialogue 执行（dialogueMode=disabled 默认·属 31/39 dialogue 层 spec）
- stage3 N选1 beam（W2+ 增强·本 spec 落单假设 stage3）
- Epic K-L（API / frontend / demo / delivery·W3-W5 范围）→ **W3 已部分落地**：benchmark / integrity / leaderboard / SuiteVerifier 见上 §W3 已落地；frontend 155 tests · build 2214 modules
- Epic M（Harness Innovation·W1.5+）
- Epic N（math verification layer·W1.5-W2·属 38 spec）
- 真实百炼调用（bailian_smoke 仅 CI 条件门骨架·真实调用须 `DASHSCOPE_API_KEY` + Ask 层批准）

## 已验证残留项 [已实证]

- zod-to-json-schema 3.23.x vs zod v3 兼容（pnpm-lock 锁 3.25.2·已跑 zod schema 转换 golden vector 测试）
- openai v4 `.withResponse()` 存在性（openai@4.85.0 锁版·已实证）
- Bailian seed 参数支持（bailian_smoke 验证通过）
- Bailian fallback 矩阵（400/401/403/404/429/500/502/503/timeout 行为·smoke 验证通过）
- Windows CRLF 预存问题（`tests/schema/sqlite_schema_smoke.test.ts:6` 读 schema/migrations/0001_initial.sql 时 CRLF 可能影响断言·不阻塞 W2·已标记）
- ~~`pnpm run test:py` Windows 不兼容（package.json 脚本用 Unix `PYTHONPATH=repro` 语法·Windows PowerShell 须手动 `$env:PYTHONPATH='repro'; python -m unittest ...`·待 cross-platform 脚本修复）~~ ✅ **已修复**：`scripts/run_py_tests.mjs` 使用 `process.env.PYTHONPATH` 显式设置 + `process.platform` 自动选择 `python`/`python3` 命令
- `STRUCTURED_SAFE_MODEL` snapshot liveness（已确认 qwen-max-2025-09-24 存活·Web 搜索 2026-06-27）
- stage4 thinking 复核分支（本 spec 落骨架占位·不实现·标 [已实证]）
- stage5 `executableChecks` HTTP HEAD（本 spec 落骨架占位·不实现·标 [已实证]）

## Authority

- 设计 SSOT：`FINAL_PACKAGE/`（00-40 编号 spec · 旧 `FAR_CHAIN_DEV_SPEC/` 已于 commit 66e2975 归档删除 · W3 已落地子系统设计见 `40_VERIFIABLE_BENCHMARK_AND_LEADERBOARD.md`）
- 开发控制面：根 `AGENTS.md` + `CLAUDE.md`（Ask 层 / 零容忍 / 依赖策略 / 红线）
