# Changelog

All notable changes to FAR-Lab are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased] — 1.2.0（比赛前终极升级）

### Added — 跨平台三系统（P0-1）
- 三平台 CI 矩阵 `.github/workflows/cross-platform.yml`（Windows/macOS/Linux 全量 tests）
- 跨平台路径工具 `src/paths.ts`：PATH_SEP / toPosixPath / toNativePath / safeJoin（拒 `..` 与绝对路径 fail-closed）/ isSubPath / crossPlatformTmpDir / crossPlatformHomeDir
- `far doctor` 新增 `checkCrossPlatform()` 5 项运行时自检

### Added — 计算卡适配（P0-2）
- 硬件探测层 `src/hardware/detect.ts`（GPU/NPU/CUDA/Metal/WASM，尽力而为）
- OpenAI 兼容统一 LLM 适配器（baseURL 驱动，5 presets：DeepSeek/Zhipu/Ollama/Anthropic/Azure）
- `far hardware` 命令：运行时硬件与可用加速路径

### Added — 灵活动态 agent 调度（P0-3）
- Agent 事件总线 + `/api/v1/events/stream` SSE 端点（run/stage/iteration/held/resumed 全事件）
- 可插拔 stage 注册表 `src/agent_loop/stage_registry.ts`（StageDescriptor.executor 扩展带）
- 并行扩展阶段：order>6 阶段在 verdict 后 `Promise.all` 并发执行，错误包装 `ExtensionStageError`（`EXTENSION_STAGE_FAILED` 码）
- 人工接管 `src/agent_loop/controller.ts`：hold/resume/isHeld/waitIfHeld + stage_held/stage_resumed 检查点

### Added — 接口与功能适配（P0-4）
- 弹性网关 `src/llm_gateway/resilient_gateway.ts`：maxAttempts + fallbackOrder + retryableErrorNames + onFallback（fail-closed 守卫）
- 速率限制 `src/llm_gateway/rate_limiter.ts`：信号量 FIFO + minIntervalMs 节流

### Added — 前端与图形化 CLI 动态显示（P0-5）
- CLI 渲染层 `src/cli/render.ts`（spinner/进度条/表格/ANSI，NO_COLOR 规范）
- 表驱动 CLI 框架 `src/cli/registry.ts`（26 命令声明式注册 + runCli 分发器；run 返回 undefined 不 exit 保 api 长驻命令）
- `far stream --events` 实时阶段事件流
- 前端 SSE 实时联动：`useAgentEventStream` hook + `/events` 实时事件流页 + AppShell 导航 + i18n zh/en

### 验证
- typecheck 0 / lint 0 / tests **2401（2395p/0f/6s）** / frontend **226 tests** / demo 14/14 GV / doc↔CLI 一致性 PASS / 卫生门禁 PASS
- 修复：real-paper 裸 import bug（`runRealPaperFromArgs` + isMainModule 守卫）、EventsPage VerdictBadge prop 名、前端 act 纪律、App 导航断言

## [1.0.0] — initial open-source release

FAR-Lab is a **claim-level verification layer for AI-for-Science claims**: it constrains
LLM-generated hypotheses inside a deterministic, falsifiable, tamper-detectable,
independently-recomputable boundary. The verdict is produced by a deterministic R0–R9 kernel —
**never** by an LLM.

### Added — CLI (`far`)

- `far init <domain>` — scaffold a DomainPack (claim + FEC templates) for a new domain.
- `far fec compile` / `far fec freeze` — compile a Falsifiability Evidence Contract and freeze its
  tamver hash (`fecHash`). A claim without a compilable FEC can never reach `CONFIRMED`.
- `far verify [--bundle|--envelope] [--mode] [--explain] [--lint-input]` — third-party independent
  recomputation of a proof bundle / envelope, including recomputation of the 22 anti-theater detectors.
- `far verify-golden [--all|--case] [--backend node|python|browser]` — recompute the verdict golden
  vectors across three language axes; same input → same verdict in TS, Python, and the browser.
- `far export far-proof` / `far export receipt` — export a self-verifiable `.far-proof` bundle or a
  Trust Receipt projection.
- `far api` — REST API server (Fastify; 16 paths under `/api/v1`, JWT-ready, OpenAPI at
  `/documentation/json`).
- `far doctor` / `far version` / `far status` / `far demo [tess-offline]` — diagnostics, status, and a
  fully-offline one-shot demo. `far ask` / `far stream` / `far repl` / `far replay` / `far court` /
  `far arena` / `far bench` / `far fsm` round out the 19-command surface.

### Added — deterministic kernel & verdict

- **Five-value verdict** (fixed enumeration, no sixth value): `CONFIRMED` / `REFUTED` / `INCONCLUSIVE`
  / `DEGRADED_SCOPE` / `UNTESTED`, priority `DEGRADED_SCOPE > REFUTED > INCONCLUSIVE > CONFIRMED > UNTESTED`.
- **R0–R9 kernel rules** plus extended rules: `R_DERIVATION_FORM_MISMATCH`,
  `R_IDENTIFIER_FABRICATION`, `R_EXECUTION_FINGERPRINT_MISMATCH`, `R_CAUSAL_CONFOUNDING_*`,
  `ANTI_THEATER_FAIL`.
- **Real statistics** (`src/statistics/`): z-tests, Cohen's d, Welch's t, Bonferroni / Holm / BH-FDR
  multiple-correction — no hardcoded p-values or effect sizes.

### Added — anti-theater & integrity

- **22 anti-theater detectors** that block a seal when a "green" result is built on theater
  (cherry-picked seeds, post-hoc thresholds, scope laundering, metric swap, LLM judge-override, …).
- **Content-addressed evidence ledger**: append-only SHA-256 hash chain with cross-language
  (TS / Python / browser) byte-identical hashes; tampering breaks the chain and is detected.
- **Proof bundles (`.far-proof`)**: self-verifiable offline bundles (claim graph + redacted chain +
  `proofHash`) that a third party recomputes without trusting the exporter.
- Sandbox hardening: process-group kill on timeout, pre-execution working-dir preflight, secret
  stripping, execution-fingerprint (wall/cpu/peak-rss) detection.

### Added — developer & user experience

- `npm install -g FAR-Lab` works end-to-end (esbuild-bundled `dist/far.js`); the no-build source
  workflow (`node src/cli/far.ts`) is preserved.
- Bilingual README (`README.md` en + `README.zh-CN.md` zh) and a full English `docs/` hierarchy:
  quickstart, installation, CLI reference, API reference, concept guides (claim / evidence / verdict
  / FEC / anti-theater / determinism / evidence-ledger / far-proof), providers, demos.
- `scripts/install.sh` + `scripts/install.ps1` — user-space installer (zero key, zero big-data).
- `Dockerfile` + `docker-compose.yml` — default offline demo / API, no key required.
- `docs/demos/tess-offline.md` — offline demo walkthrough with a tested tamper-detection guide.
  > The `examples/` tree (tess-offline bundle, fec, statistical-claim) is documented but not
  > yet part of the shipped repository; it is a roadmap item. The tested demo path is
  > `node src/cli/far.ts demo tess-offline` + `far export far-proof` (see README §Offline demo).

### Changed

- The V2 `decideFiveValueVerdict` kernel replaces the shallow V1 `makeVerdict` in all production
  callers.
- The three science-harness pipelines (`hero_a` / `hero_b` / `c_astro`) drive the V2 kernel through
  real `src/statistics` math instead of hardcoded metrics.

### Known limits (honest)

- Real-provider inference (Qwen / DashScope) and real online datasets (TESS / MAST) are
  **credential / network gated** and never run by default; the offline experience needs zero keys.
- String-key hashing is fully proven; float serialization is migrating to RFC 8785 JCS (V3 roadmap).
- OS-level sandbox isolation (cgroups / netns / seccomp) is a V2 roadmap item; current sandboxing is
  user-space hardening.
- `NEEDS_RELEASE_PUBLICATION`: the package is build-ready and `npm install -g` works from a tarball,
  but is not yet published to the npm registry; the GitHub Release is pending.

## [1.1.0] — 2026-08-05 · Ecosystem-borrowed upgrade + hero demo + security fixes

### Fixed

- **Windows CI test failure**: `demo_chain_replay.test.ts:415` verify.sh MSYS path issue.
  Root cause: git-bash `sh` reports MSYS-style paths (`/c/tmp/...`) but Windows Node.js
  needs native paths (`C:\tmp\...`). Fix: `cygpath -w` conversion in verify.sh + defensive
  `normalizeBundleDir()` in the Node heredoc. (`src/far_proof/offline_package.ts`)
- **5 high-severity CVEs**: brace-expansion (DoS), find-my-way (HTTP2 DDoS), fast-uri
  (host confusion). Fixed via `pnpm.overrides` — all were DoS-class transitive deps,
  none touched the trust kernel. `pnpm audit` now reports zero vulnerabilities.

### Added

- **Hero Demo page** (`/hero` route): 60-second interactive tamper-detection experience
  for competition judges. Browser-side SHA-256 hash chain, one-click tamper interaction,
  visual hash diff. (`frontend/src/pages/HeroDemoPage.tsx`)
- **Judge Quick-Start guide** (`docs/JUDGE_QUICKSTART.md`): 5-minute verification path
  for competition judges — 60-second demo, 2-minute tamper hero, 5-minute kernel deep dive.
- **Real-world science integrity cases** (`docs/REAL_WORLD_CASES.md`): maps famous
  reproducibility failures (Bem 2011, OSC 2015, LK-99, Theranos) to FAR-Lab's 22
  anti-theater detectors.
- **API reference** (`docs/API_REFERENCE.md`): all 16 REST endpoints documented with
  request/response shapes and error format.
- **Repository navigation guide** (`DOCS_INDEX.md`): organizes 25 root-level documents
  into clear reading paths for different audiences.

### Changed

- Phase 1 Foundation Hardening: EXIT GATE PASSED (6/6 criteria).
- Phase 2 Architecture Excellence: Fitness Functions 17/17 PASS, ADRs 24/24.

### Ecosystem-borrowed upgrade (9 batches) — details

Learned from 5 world-class open-source projects (opencode / pi / zeroclaw / hermes-agent /
scientific-agent-skills) and implemented 9 borrowing batches. All gates green: typecheck 0 /
lint 0 / 1581 tests (1574 pass, 0 fail) / far demo exit 0.

### Added — supply-chain hardening (borrowed from pi)
- .npmrc save-exact=true; package.json dependencies + pnpm.overrides exact-pinned.
- scripts/check-supply-chain.mjs gate (exact pins + lockfile specifier consistency) wired into
  ci.yml blocking_gates; new weekly .github/workflows/security-audit.yml (pnpm audit --prod +
  audit signatures).

### Added — statistical trap taxonomy (borrowed from scientific-agent-skills)
- src/anti_theater/trap_taxonomy.ts: 21-entry taxonomy (category/name/what/cures/realCase) for
  every anti-theater attack kind + summarizeTraps aggregation.
- Report layer: optional Statistical Trap Audit section rendering triggered trap categories
  (zero regression when absent).

### Added — evidence FTS5 search (borrowed from hermes-agent)
- src/evidence_log/search.ts: nsureFtsIndex / 
eindexEvidenceFts / searchEvidence /
  scapeFtsQuery. Search auxiliary layer — never enters the hash chain.

### Added — evidence quality grading (borrowed from scientific-agent-skills GRADE/Cochrane RoB)
- src/evidence_quality/: gradeEvidenceTier (RCT→1 … expert/unspecified→4) + Cochrane RoB 7-domain
  assessment + gradeEvidenceQuality. Transparency layer only: VerdictKernelOutput gains optional
  videnceQualityTier/videnceQualityNote; verdict logic and proofHash unchanged (zero regression).

### Added — evidence context compaction (borrowed from opencode session compact)
- src/agent_loop/compaction.ts: deterministic artifact compression (stage3/4 verdict-critical
  payloads preserved verbatim; narrative fields clipped with hash anchors).
- 
unAgentLoop optional compactArtifacts flag (default off → byte-identical).

### Added — CLI state revert (borrowed from opencode revert/unrevert)
- state_machine gains 3 revert edges (STATISTICS→EVIDENCE_GATHERED, VERDICT→STATISTICS,
  PROOF_SEALED→VERDICT); seal is a commit point — no revert after it (fail-closed).

### Added — scheduled re-verification (borrowed from hermes-agent cron)
- ar schedule add|list|remove|run: JSON-persisted re-verification jobs with due-date logic and
  auditable exec runs (schedules.json under $FAR_HOME or ~/.far).

### Added — runtime JSONL session recording (borrowed from pi JSONL session format)
- src/trace/session_recorder.ts: SessionRecorder / 
eplaySession / serializeEvent.
- 
unAgentLoop optional sessionPath: records run_started / stage_completed ×N / run_completed.

### Added — math backend fallback chains (borrowed from zeroclaw provider fallback)
- MathVerifier fallback chains (default: SMT→CAS, Lean4→Dafny; overridable, 
ull disables):
  unavailable/throwing/honestly-degraded primary backend falls back to alternatives with
  allback_from:<kind> annotation. Primary conclusion is never overridden.

### Verified
- Baseline 1517 tests → 1581 (57 new tests across all batches); zero regressions.
- All borrowed features are optional flags / optional fields / transparency layers — no
  verdict-kernel or proofHash behavior change without explicit opt-in.
