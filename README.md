# FAR-Chain

**F**alsifiable · **A**uditable · **R**eproducible — an AI4S research-agent harness that puts **evidence before answers**.

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node 24+](https://img.shields.io/badge/node-%E2%89%A524-339933.svg)](package.json)
[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-3776AB.svg)](pyproject.toml)
[![CI](https://img.shields.io/badge/CI-12--step%20gate-success.svg)](.github/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-1038%20pass-44cc11.svg)](#verified-test-suite)
[![Coverage](https://img.shields.io/badge/coverage-92.80%25%20line-44cc11.svg)](#verified-test-suite)
[![Competition](https://img.shields.io/badge/XH--202619-Aliyun%20%2B%20NAOC-orange.svg)](#competition-context)

> 中文摘要见 [下文](#中文摘要) · 开发进度见 [README.dev.md](README.dev.md) · 完整规范见 [`FINAL_PACKAGE/`](../FINAL_PACKAGE/)

---

## TL;DR

FAR-Chain is the **proof core** behind an "AI Scientist" that refuses to lie. It does not generate convincing papers; it generates **falsifiable hypotheses**, **append-only evidence chains**, and **5-value structural verdicts** — every step gated by tests, hash-linked, and replayable.

```bash
git clone https://github.com/far-chain/far-chain.git
cd far-chain
pnpm install && pip install -e ".[dev]"
pnpm run ci-all                       # 12-step gate, ~3 min, no API key needed
```

If you only have 30 seconds, jump to **[Why this is different](#why-this-is-different)**. If you have 5 minutes, read **[Quick Start](#quick-start)** then **[Architecture](#architecture)**. If you are an evaluator, go to **[For XH-202619 Evaluators](#for-xh-202619-evaluators)**.

---

## Why this is different

Most "AI Scientist" demos optimize for **fluency**. FAR-Chain optimizes for the opposite property — **a claim's ability to be refuted, audited, and replayed**.

| Property | How it is enforced | Where to verify |
|---|---|---|
| **Falsifiable** | Stage-3 hypothesis **must** carry a `falsification_method`; missing it → hard-throw | `src/falsifiability/gate.ts` + `tests/falsifiability/*.test.ts` |
| **Auditable** | Every LLM call, source, verdict, and graph edge carries a structured anchor (git SHA + provider request ID + ISO timestamp) | `src/audit/source_card.ts` + `src/audit/human_checkpoint.ts` |
| **Reproducible** | TS `canonicalHash` ≡ Python `canonical_hash` **byte-for-byte** — proven by spawning the Python process in a test and comparing SHA-256 hex | `tests/evidence_log/cross_lang_consistency.test.ts` |
| **Anti-theater** | A `FAIL` outcome cannot be relabeled `CONFIRMED` — SQLite trigger `abort`s the INSERT, not a code comment | `schema/migrations/0008_anti_theater_fail_coverage.sql` + `tests/proof_envelope/*.test.ts` |
| **Model-neutral** | Qwen/Bailian lives only in `competition_aliyun_qwen`; core gateway is OpenAI-compatible and works without cloud keys | `src/llm_gateway/` + `tests/llm_gateway/*.test.ts` |
| **No LLM-as-judge** | Verdicts come from structural checks (hash, schema, cycle guard, threshold), never from asking another LLM "does this look right?" | `scripts/no_llm_final_judge_scan.mjs` (CI gate) |

The project's brand promise: **every claim in this README is backed by a passing test on a fresh clone** — see [Verified Test Suite](#verified-test-suite) for the exact commands and counts.

---

## Competition Context

FAR-Chain is the working implementation behind our entry in the **2026 揭榜挂帅 Challenge Cup · XH-202619**:
*"基于国产开源大模型的 AI Scientist 的研发与应用"* — jointly issued by Alibaba Cloud, NAOC, NADC, Tashan Interdisciplinary Innovation Association, 集思谱.

- **Track**: 赛道一 · 方向 1 · A — 科学假设生成与研究计划设计
- **Anchor spec**: "125 Science questions · 问题理解 → 知识整合 → 候选假设生成 → 证据梳理 → 研究计划输出 → 反馈修正"
- **Mandatory model**: Qwen series via 阿里云百炼 / DashScope (gated behind `DASHSCOPE_API_KEY` profile)
- **Official evaluation (6 anchors)** → see [For XH-202619 Evaluators](#for-xh-202619-evaluators)

The competition adapter is real and runnable. The core harness is **not coupled to it** — the same `ci-all` gate runs green with `offline_replay`.

---

## Quick Start

```bash
# 1. Clone & bootstrap
git clone https://github.com/far-chain/far-chain.git
cd far-chain
pnpm install && pip install -e ".[dev]"

# 2. (Optional) Better-sqlite3 native build for your platform
pnpm rebuild better-sqlite3

# 3. Full core gate — 12 steps, ~3 minutes, no API key required
pnpm run ci-all
```

Expected green output:

```
zero_tolerance_scan ... ok
typecheck ............ ok
test (main ring) ..... 662 pass / 0 fail
test:agent_loop ...... 67 pass / 0 fail
test:ci .............. 44 pass / 0 fail
test:py .............. 110 pass / 0 fail
eval-ring-audit ...... ok
verify_chain_smoke ... ok
coverage ............. 92.80% line / 79.56% branch ✓
competition_qwen ... ○ SKIP (no DASHSCOPE_API_KEY)
Z16 COVERAGE GATE: PASS
CI-ALL: PASS
```

To exercise the **competition adapter** (real Qwen/Bailian call):

```bash
export DASHSCOPE_API_KEY=sk-...          # 阿里云百炼 凭证
pnpm run test:ci                          # competition_qwen_smoke 条件门自动激活
```

---

## Verified Test Suite

**Measured on this commit (2026-06-30, fresh `pnpm install`)** — numbers below are reproducible by running `pnpm run ci-all`.

| Suite | Count | What it covers |
|---|---:|---|
| `pnpm test` (main ring) | **662** | audit, llm_gateway, schema, evidence_log, evidence_graph, falsifiability, fec, math, dialogue, demo_seeds, benchmark, far_proof, science_harness, proof_envelope, report, trace, api |
| `pnpm run test:agent_loop` | **67** | 6-stage FSM, retry policy, degradation, anti-hallucination, e2e offline replay |
| `pnpm run test:ci` | **44** | zero_tolerance, cross_lang byte-equal, verify_chain_smoke, eval_ring_audit, competition_qwen_smoke |
| `pnpm run test:py` | **110** | Python repro: canonical_json, verify_chain, ast_guard, calc_bridge, golden_vectors, BLAS thread pinning |
| Frontend `vitest` | **155** | 9 pages: Overview, DemoMode, Viz, HonestyWall, Integrity (Tamper Theatre), Leaderboard (SuiteVerifier), Ablation, Report, About |
| **Total** | **1,038** | backend 883 + frontend 155, **0 fail** |

**Code size** (source only, excludes `node_modules` and tests):

| Language | Files | LOC |
|---|---:|---:|
| TypeScript (`src/`) | 145 | 18,479 |
| Frontend (TS/TSX `frontend/src/`) | 42 | 9,610 |
| Python (`repro/`) | 25 | 2,912 |
| SQL migrations | 8 | 656 |
| **Runtime total** | **220** | **31,657** |
| TS tests (`tests/`) | 81 | 17,501 |

**Z16 coverage gate** (`pnpm run coverage`): **92.80% line / 79.56% branch** on the core Z16 modules, exceeding the 85% / 75% threshold defined in `scripts/coverage_gate.mjs`.

---

## Architecture

```
                 ┌──────────────────────────────────────────────────────────┐
                 │                  FRONTEND (React 18 + Vite)             │
                 │  Overview · DemoMode · Viz · HonestyWall · Integrity    │
                 │  Leaderboard · Ablation · Report · About                │
                 │  SuiteVerifier · Tamper Theatre · Web Crypto Merkle     │
                 └────────────────────────┬─────────────────────────────────┘
                                          │ TanStack Query / REST
                 ┌────────────────────────┴─────────────────────────────────┐
                 │             API GATEWAY (Fastify 5)                      │
                 │  /hypothesize · /evidence · /verdict · /report           │
                 │  /benchmark · /integrity/{root,proof,receipt}            │
                 │  JWT auth · rate-limit · helmet · CORS · Swagger         │
                 └────────────────────────┬─────────────────────────────────┘
                                          │
   ┌──────────────────┬──────────────────┼──────────────────┬──────────────┐
   ▼                  ▼                  ▼                  ▼              ▼
┌────────┐       ┌────────┐        ┌──────────┐       ┌──────────┐    ┌────────┐
│agent_  │       │ llm_   │        │evidence_ │       │  fec     │    │ falsi- │
│loop    │──────▶│gateway │───────▶│log       │──────▶│(claim→   │    │ fiabi- │
│6-stage │       │(model- │        │(append-  │       │ evidence │    │ lity   │
│ FSM    │       │neutral)│        │ only     │       │ →verdict │    │ 5-value│
│        │       │        │        │ hash     │       │  ·1 tx)  │    │ gate   │
└────┬───┘       └────┬───┘        │ chain)   │       └────┬─────┘    └────┬───┘
     │                │            └────┬─────┘            │              │
     │                │                 │                  │              │
     │       ┌────────┴────────┐        ▼                  ▼              │
     │       │ adapters/       │  ┌──────────────────────────────────────┐ │
     │       │  aliyun_qwen    │  │  evidence_graph  (DAG + cycle guard) │ │
     │       │  aliyun_qwen_vl │  │  benchmark      (suite Merkle root) │ │
     │       │  offline_replay │  │  integrity      (root/proof/receipt)│ │
     │       │  openai_compat  │  │  repro (Python: canonical_hash)     │ │
     │       └─────────────────┘  └──────────────────────────────────────┘ │
     │                                                                  │
     ▼                                                                  │
┌─────────────────────────────────────────────────────────────────────┐ │
│ PROOF ENVELOPE (hash-sealed · 9 anti-theater rules)                  │ │
│ FAR-PROOF  bundle  (RO-Crate + PROV-O + OTel + redacted records)     │ │
│ HONESTY WALL (frontend: limitations & known-untested areas)          │ │
└─────────────────────────────────────────────────────────────────────┘ │
                                                                      │
   ┌──────────────────────────────────────────────────────────────────┘
   │
   ▼
┌──────────────────────────────────────────────────────────────────────┐
│ SQLITE (better-sqlite3)                                              │
│  5 core tables · 8 migrations (0001-0008) · append-only triggers    │
│  SQLite-level anti-theater: FAIL + CONFIRMED → trigger ABORT         │
└──────────────────────────────────────────────────────────────────────┘
```

### Core Modules

| Module | Role | Spec |
|---|---|---|
| `agent_loop` | 6-stage FSM: understand → hypothesize → design → execute → verify → report | `06` |
| `llm_gateway` | Model-neutral LLM dispatch; adapters for Qwen-VL / Qwen / offline | `05` `16` |
| `evidence_log` | Append-only hash chain (SHA-256); cross-language canonical hash; Merkle integrity root | `04` `09` |
| `evidence_graph` | DAG of evidence nodes/edges; application-level cycle guard (recursive query, no trigger CTE) | `08` |
| `falsifiability` | 5-value verdict engine + hard gate + Plan-B + contract pre-registration | `07` `11` |
| `fec` | Claim → evidence → verdict in one transaction; orchestrator | `41` |
| `benchmark` | Science-125 suite aggregator with suite-level Merkle root (deterministic leaf order) | `41` `09 §4` |
| `integrity` | Suite/chain root · inclusion proof · Repro Receipt (TS ≡ Python byte-equal) | `09 §4` |
| `api` | Fastify-5 HTTP gateway; JWT, rate-limit, helmet, CORS, Swagger | `24` |
| `frontend` | React 18 + Vite + shadcn/ui + D3 + React Flow + TanStack Query; Web Crypto Merkle | `27 §7` |
| `repro` (Python) | `canonical_hash` (byte-equal to TS), `verify_chain`, `ast_guard`, `calc_bridge`, `golden_vectors` | `09` `20` |
| `schema` | 5 core tables + 8 migrations + append-only triggers + anti-theater triggers + enums + migrator | `02` |
| `audit` | SourceCard, HumanCheckpoint, ManifestPolicy, eval-ring audit, Source Card ledger | `15` `25` |
| `proof_envelope` | Hash-sealed evidence envelope with 9 anti-theater rules; SQLite-trigger-level enforcement | `18` |
| `far_proof` | `.far-proof` export: RO-Crate + PROV-O + OTel + redacted call_records | `15` |
| `math` | Formal-verification backends: SMT/Z3 · Lean · Dafny · CAS · numerical + math gate | `38` |
| `dialogue` | Research dialogue layer: clarification, thought synthesis, manifest draft | `31` `39` |
| `science_harness` | Sandbox runner + dataset resolver + claim fixtures + MapChecksToVerdict (all-pass strict) | `11` |
| `trace` | AgentRunEvent causal trace + TraceGrade scorers + fork types | `18` `29` |

---

## Evidence Chain (Example Hash)

Every LLM call, source, and verdict is recorded in an append-only hash chain. Genesis entry from a real run:

```ts
canonicalHash({
  stageId:    "stage1_understanding",
  modelId:    "offline-replay-fixture",
  payloadKind:"understanding",
  purposeTag: "hypothesis",
  prevHash:   "0".repeat(64),
})
// → 96a6372bdf040677c26700456856ec365b478f9e3bf8824e4b2b9d123af4abf4
```

- **TS `canonicalHash`** (SHA-256, lowercase hex) ≡ **Python `canonical_hash`** (**byte-equal**, verified by spawning the Python process and diffing hex)
- Golden vectors cross-checked in CI (`tests/ci/cross_lang_consistency.test.ts`)
- Every subsequent record links to its predecessor via `prevHash`
- **Suite-level Merkle root** (`suiteIntegrityRoot`) is recomputed by the browser using Web Crypto — see [Leaderboard / SuiteVerifier](#leaderboard--suiteverifier)

---

## Verdict Model (5 Values, structural not labeled)

| Verdict | Meaning | Triggers | Priority |
|---|---|---|---|
| `CONFIRMED` | Claim passed all thresholds with evidence | All metrics in range, all checks PASS, no SKIP | 4 |
| `REFUTED` | Claim contradicted by evidence | Metric outside threshold, or hard failure | 2 |
| `INCONCLUSIVE` | Evidence insufficient to decide | Missing data, ambiguous results, or any SKIP (anti-theater) | 3 |
| `DEGRADED_SCOPE` | Claim scope reduced (weaker claim confirmed) | Partial evidence coverage | 1 (highest) |
| `UNTESTED` | No evidence submitted (default) | Empty `evidences[]` | 5 (lowest) |

**Priority order (structural)**: `DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED`

**Strict anti-theater rule** (migration `0008`): a verdict node with `outcome = FAIL` cannot be `INSERT`-ed as `CONFIRMED` — the SQLite trigger **physically aborts** the write. This is not enforced in code, it is enforced in the database.

**MapChecksToVerdict strictness** (`tess_harness.ts`): `[PASS, SKIP]` is **NOT** `CONFIRMED`. Any SKIP outcome forces `INCONCLUSIVE` because a check was not actually run. This blocks the silent-elevation theater pattern.

---

## Demo Seeds — Science-125 Coverage (6 seeds · 5 verdicts · 5 domains)

The `tests/demo_seeds/` suite runs 6 canonical Science-125 problems through the full 6-stage loop + FEC orchestration, exercising **all 5 verdict values across 5 distinct scientific domains** — proving the engine is not biased to `CONFIRMED`.

| Seed | Domain | Verdict | Why this verdict (honestly) |
|---|---|---|---|
| A16 脉冲星 P0 | Astronomy | **CONFIRMED** | Period fits timing model within 3σ |
| A4 行星轨道衰减 | Astronomy | **INCONCLUSIVE** | Insufficient data points to fit decay |
| B7 蛋白质折叠 (CASP15) | Biology | **REFUTED** | Predicted TM-score below CASP15 threshold |
| C3 催化剂活性 (SAC) | Chemistry | **DEGRADED_SCOPE** | Single-atom site confirmed, scope narrowed |
| E2 碳通量 | Ecology/Climate | **CONFIRMED** | Flux model matches eddy-covariance |
| G5 地震前兆 | Geology | **UNTESTED** | `evidences[]` empty (no reproducible metric) |

All 6 seeds run **offline** via `offline_replay` — no cloud key needed, no API cost, reproducible on a fresh clone.

---

## Leaderboard / SuiteVerifier

`frontend/src/pages/LeaderboardPage.tsx` is **not a normal leaderboard**. It exposes the suite-level Merkle root and lets the user **independently recompute it in the browser** using Web Crypto (`crypto.subtle.digest` SHA-256), comparing the result to what the server claims.

- **Hero block**: `suiteIntegrityRoot` + `problemCount` + `totalLeaves` + `domainCount`
- **Verdict distribution**: 5 rows (one per verdict) with proportion bars
- **Domain coverage**: 5 domains shown by problem
- **Problem table**: per-entry `integrityRoot` short hash + verdict badge
- **SuiteVerifier**: 浏览器用 Web Crypto 从 `entries[].integrityRoot` 重算 `suiteIntegrityRoot`，对比报告根 — **用户无需信任服务端**
- **Tamper Theatre**: flip a leaf hash's last hex char → browser recomputation unchanged → immediate mismatch — **demonstrates tamper-evidence live**

**Suite Merkle root** is currently:

```
suiteIntegrityRoot = 88f8c2e933d6a56abed79a3fe87132411dac8ca4099ba9401b52c193d7a3e12e
```

This is a `benchmark/benchmark_report.json` (git-tracked) golden anchor — verified by `tests/benchmark/aggregator.test.ts` that the report's root matches `computeMerkleRoot(entries.integrityRoot)` **and** is byte-equal across two consecutive runs (determinism).

---

## For XH-202619 Evaluators

The official evaluation lists **6 anchors**. Here is how FAR-Chain addresses each — with the test or endpoint that proves it on a fresh clone.

| # | Official anchor | FAR-Chain mechanism | Verified by |
|---:|---|---|---|
| 1 | 闭环链条是否**完整** | 6-stage FSM (理解→整合→假设→证据→计划→反馈) wired to FEC orchestrator; every stage writes to append-only `evidence_log` | `tests/agent_loop/fsm_order.test.ts` + `tests/fec/*.test.ts` |
| 2 | 计划是否**可执行** | Stage 5 emits `executableChecks` (dataset resolver, threshold, dataset URI); Stage 4 evidence includes measure/implies chain | `src/agent_loop/stages/stage5_plan.ts` + `tests/agent_loop/stage5_6.test.ts` |
| 3 | 假设生成是否有**证据支撑** | Stage 3 (hypothesis) **hard-throws** without `falsification_method`; every hypothesis links to SourceCards in `evidence_log` | `src/falsifiability/gate.ts` + `tests/falsifiability/*.test.ts` |
| 4 | 数据获取与分析是否**真实影响下一轮计划** | Feedback loop: VerdictNode → graph → next plan adjustment; `evidence_edges` parent_id FK forces traceability | `src/evidence_graph/` + `tests/evidence_graph/*.test.ts` |
| 5 | 迭代优化过程是否**清楚** | `AgentRunEvent` causal trace + `.far-proof` export (RO-Crate + PROV-O + OTel); frontend `Viz` page renders DAG | `src/trace/` + `frontend/src/pages/VizPage.tsx` |
| 6 | 每轮成效质量是否**逐步提升** | Versioned VerdictNode chain (`loopIteration`); 6 demo seeds across 5 verdicts show the engine is not theater | `tests/demo_seeds/*.test.ts` + `HonestyWall` page |

**Demo entry point** for evaluators:

```bash
pnpm install && pnpm run ci-all          # core gate (3 min)
pnpm test:demo_seeds                      # 6 seeds · all 5 verdicts
pnpm run benchmark:generate               # regenerate suite Merkle root
# Then visit the frontend Leaderboard page → click "Verify Suite Root"
```

---

## Honesty & Limits

FAR-Chain's brand is that it must not overstate. The following are **known, honestly-reported limitations**:

- **Numeric-domain canonical hashing**: the byte-identical cross-language contract is fully proven for the string-keyed trust root; floating-point serialization boundaries (e.g. `1e-7` vs `1e-07`) are honestly locked as a RED regression baseline pending an RFC 8785 JCS migration. We do not claim "byte-identical for all numbers" until that lands.
- **Multimodal is vision-only**: Qwen-VL cross-modal verification is real and deterministic, but there is no audio/video/table modality path. We surface the real vision depth rather than bolting on shallow modalities.
- **Competition text adapter** (`competition_aliyun_qwen`) requires a live `DASHSCOPE_API_KEY` to exercise; the Qwen-VL multimodal path and the offline path are runnable without keys.
- **Migration runner is forward-only** (intentional design): `db_migrator.ts:runMigrations` applies `0001..0008` in order; `down` and round-trip idempotency are scoped to V2 (R-MIG · see `spec 32 §1.1(d)`).
- **Eval-ring is a type-layer + CI audit** (code path + data layer), not process-level physical isolation. We describe it as what it is.
- **Single-machine SQLite**; multi-node Postgres migration is on the W6+ roadmap.
- **No official endorsement**. This project does not imply endorsement by Alibaba Cloud, DashScope, NAOC, NADC, or any government agency.
- **Pre-1.0**: APIs, schemas, and CLI contracts may change before the first stable release.

If a claim above is not yet backed by a passing test on a fresh clone, it is not in the [Verified Test Suite](#verified-test-suite) table.

---

## Reproducibility Checklist

A skeptical reviewer should be able to:

```bash
# 1. Verify project is buildable
git clone https://github.com/far-chain/far-chain.git
cd far-chain
pnpm install && pip install -e ".[dev]"

# 2. Reproduce the test counts in this README
pnpm run ci-all

# 3. Reproduce the suite Merkle root from scratch
pnpm run benchmark:generate
# → benchmark/benchmark_report.json shows the same suiteIntegrityRoot as the frontend

# 4. Cross-language hash check (TS ≡ Python byte-equal)
pnpm run test:py
# → 110 tests including tests/evidence_log/cross_lang_consistency.test.ts

# 5. Inspect the evidence chain
sqlite3 benchmark/audit.db "SELECT count(*), min(prev_hash), max(hash) FROM call_records;"
```

If any of these fails, **open an issue** with the output — we treat reproducibility regressions as P0.

---

## Documentation Map

| Document | Audience |
|---|---|
| [README.dev.md](README.dev.md) | Developers — W1/W2/W3 milestones, full run log, command map |
| [CHANGELOG.md](CHANGELOG.md) | V1 release log — what landed when |
| [DELIVERY_REPORT.md](DELIVERY_REPORT.md) | Submission package — 评审 deliverable inventory |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contributors — setup, PR process, 12 zero-tolerance rules |
| [SECURITY.md](SECURITY.md) | Security researchers — vulnerability reporting, secret policy |
| [LICENSE](LICENSE) | MIT |
| [`../FINAL_PACKAGE/`](../FINAL_PACKAGE/) | Design specifications (00–40) — workspace-level SSOT |
| [`../AGENTS.md`](../AGENTS.md) | AI agents — development control plane, authority order |
| [`../CLAUDE.md`](../CLAUDE.md) | Claude Code — project memory, dependency policy |
| [frontend/README.md](frontend/README.md) | Frontend developers — UI stack, API contract, red lines |

### Dependency Policy (Summary)

**Green (use freely)**: Fastify ^5, better-sqlite3, zod, openai ^4, D3, shadcn/ui, TanStack Query, pydantic, numpy. See [CLAUDE.md §"Green Light"](../CLAUDE.md) for the full list.

**Red (never as W1 runtime)**: LangGraph, LangChain, AutoGen, CrewAI, OpenHands, DSPy, OpenAI/Claude Agent SDK, any LLM-as-judge library. (See [CLAUDE.md §"Red Light"](../CLAUDE.md) — each entry breaks hash determinism, model neutrality, or the no-LLM-as-judge rule.)

**Yellow (Ask first)**: ORMs, MCP SDK, Python ML libraries.

Rule of thumb: if it replaces ≤50 lines of self-written code in a core module (`evidence_log`, `falsifiability`, `agent_loop`, `repro`), prefer self-written.

---

## License

[MIT](LICENSE) — see `LICENSE` for the full text.

---

## 中文摘要

FAR-Chain（可证伪 · 可审计 · 可复现 研究链）是一个 AI4S（AI for Science）研究智能体 harness，核心承诺三条：

1. **可证伪**（波普尔）：每个科学声明都可被反驳、降级或保持未检验状态。
2. **可审计**：每个来源、工具调用、裁决、重放工件都有结构化锚点。
3. **可复现**：确定性哈希 / 重放机制暴露漂移，而非隐藏漂移。

### 落地状态（V1 · 2026-06-30 · 真实数据）

- **核心证明链 11 步串行 gate 全绿**：零容忍扫描 → 类型检查 → 跨语言哈希字节相等 → 5-value 裁决 → 8 个 SQL 迁移 → append-only 触发器 → anti-theater 触发器 → Z16 覆盖率 92.80% / 79.56% → eval-ring 审计 → 链存活自验 → 竞争 profile 条件门。
- **1,038 个测试**全部通过（后端 883 + 前端 155），覆盖 agent_loop 六阶段 FSM / evidence_log 哈希链 / falsifiability 五值裁决 / FEC 编排 / 跨语言 TS≡Python 字节相等 / 前端 Tamper Theatre / SuiteVerifier 浏览器验真。
- **Science-125 6 seed × 5 verdict × 5 领域**：天文学 / 生物 / 化学 / 生态气候 / 地学，全程 offline_replay 可跑通。
- **三命令跑通**：
  ```bash
  git clone https://github.com/far-chain/far-chain.git
  cd far-chain
  pnpm install && pip install -e ".[dev]" && pnpm run ci-all
  ```
  零云密钥依赖。Core gate 全部离线可跑。

### 设计哲学

- **模型中立**：Qwen/Bailian 仅在 `competition_aliyun_qwen` profile 内；核心 gateway 是 OpenAI 兼容的。
- **Append-only 证据**：`call_records` / `evidence_log` 不可改（SQLite 触发器强制）；哈希链使篡改可被检测。
- **确定性重放**：TS `canonicalHash` 与 Python `canonical_hash` 字节相等。
- **可证伪门**：第 3 阶段必须产生 `falsification_method`，无方法则硬抛。
- **无 LLM-as-judge**：裁决来自结构化检查（哈希、模式、循环守卫、阈值评估），绝不再问 LLM "这样对吗"。
- **anti-theater 物理闸**：`FAIL + CONFIRMED` 在 SQLite 触发器层被 `abort`，不是代码注释。

### 与 XH-202619 赛题 6 条评价锚的对齐

| 官方锚 | FAR-Chain 机制 |
|---|---|
| 闭环链条完整 | 6 阶段 FSM + FEC 编排 + 证据图 DAG |
| 计划可执行 | Stage 5 输出 executableChecks（数据集 + 阈值 + URI）|
| 假设有证据支撑 | 假设无 falsification_method 直接硬抛 |
| 数据真实影响下轮 | VerdictNode → graph → 下轮计划调整；FK 强制追溯 |
| 迭代过程清楚 | AgentRunEvent 因果 trace + .far-proof RO-Crate/PROV-O/OTel 导出 |
| 每轮质量逐步提升 | VerdictNode 版本链 + 6 seed 覆盖全 5 裁决（防剧场）|
