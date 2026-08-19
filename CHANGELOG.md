# Changelog

All notable changes to FAR-Lab are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Changed — RFC 8785 JCS canonicalization (V3 complete)
- 信任内核全部哈希路径统一到 RFC 8785 JSON Canonicalization Scheme：vendored `canonicalize@4.0.0`（`src/vendor/`，与 npm tarball 逐字节一致，Apache-2.0 随源分发）；迁移 7 处 `fast-json-stable-stringify` 使用点（evidence_log hasher/lifecycle、agent_loop 收据、proof_envelope v1/v2、research 桥、llm_gateway tape）。差分实测：纯 JSON 域输出与旧序列化器逐字节一致（哈希中性迁移，旧 `.far-proof` 包继续可验证）
- Python 轴：核心依赖新增 `rfc8785`；修复错误导入名（`serialize`→`dumps`，原先被 except ImportError 静默吞掉导致永远走非规范 fallback）；int→float ES6 域规约（RFC 8785 §3.2.2.3），不可精确表示的整数 fail-closed；fallback 降级改为响亮告警
- 跨语言收敛向量：`NUMERIC_KNOWN_DIVERGENCE`（1e-7 vs 1e-07 已知分歧）翻转为 `NUMERIC_JCS_CONVERGENCE`（4 个指数边界向量 TS↔Python byte-equal）；clean-room 独立验证器样本补 1e-7
- 独立浏览器验证页 `frontend/public/verify.html` 补齐 lone-surrogate fail-closed（四轴统一契约）
- `fast-json-stable-stringify` 从 dependencies 移除（borrow_registry 决策翻案已登记）

### Added — 浏览器侧 contentHash 独立重算
- EvidencePage 新增 `CanonicalHashVerifier` 面板：粘贴 JSON + 期望 64-hex → 浏览器 RFC 8785 规范化 + Web Crypto SHA-256 比对（外部审计方验证 ProofEnvelope contentHash 无需信任服务端；与 Merkle 包含证明构成双重独立验证）；自检锚 `GOLDEN_JCS_SELF_TEST`（1e-7 边界样本，后端真实计算哈希）
- Workbench 失败即主状态：provider 失败时结果区呈现原因 + `far doctor`/离线下一步指引（loop error 为主 alert，非脚注）
- 导航重组：产品链主导航 + System 折叠子菜单（工程/评审入口；可见性≠权限）

### Fixed
- `scripts/baseline_cache.mjs` 对未跟踪目录（porcelain 目录形态）readFileSync 抛 EISDIR 崩溃——展开为包含文件后再哈希
- API provider 失败两态契约：loop 内失败 → 200 + `loopState.error` 如实（无裁决/无信封零伪造）；逃逸路径全局 error_handler → 503 `LLM_PROVIDER_FAILED`（可行动指引 + 模型中立）
- `hypothesize` 路由转发 `modelSnapshot`（G3 环境锚）——生产 REPRO_BRIDGE_NOT_CONFIGURED 裸 500 的根因修复

### Added — 跨平台支持
- 三平台 CI 矩阵 `.github/workflows/cross-platform.yml`（Windows/macOS/Linux 全量 tests）
- 跨平台路径工具 `src/paths.ts`：PATH_SEP / toPosixPath / toNativePath / safeJoin（拒 `..` 与绝对路径 fail-closed）/ isSubPath / crossPlatformTmpDir / crossPlatformHomeDir
- `far doctor` 新增 `checkCrossPlatform()` 5 项运行时自检

### Added — 硬件探测与 LLM 适配
- 硬件探测层 `src/hardware/detect.ts`（GPU/NPU/CUDA/Metal/WASM，尽力而为）
- OpenAI 兼容统一 LLM 适配器（baseURL 驱动，5 presets：DeepSeek/Zhipu/Ollama/Anthropic/Azure）
- `far hardware` 命令：运行时硬件与可用加速路径

### Added — agent 调度与事件流
- Agent 事件总线 + `/api/v1/events/stream` SSE 端点（run/stage/iteration/held/resumed 全事件）
- 可插拔 stage 注册表 `src/agent_loop/stage_registry.ts`（StageDescriptor.executor 扩展带）
- 并行扩展阶段：order>6 阶段在 verdict 后 `Promise.all` 并发执行，错误包装 `ExtensionStageError`（`EXTENSION_STAGE_FAILED` 码）
- 人工接管 `src/agent_loop/controller.ts`：hold/resume/isHeld/waitIfHeld + stage_held/stage_resumed 检查点

### Added — 网关韧性与速率限制
- 弹性网关 `src/llm_gateway/resilient_gateway.ts`：maxAttempts + fallbackOrder + retryableErrorNames + onFallback（fail-closed 守卫）
- 速率限制 `src/llm_gateway/rate_limiter.ts`：信号量 FIFO + minIntervalMs 节流

### Added — CLI 渲染层与前端实时联动
- CLI 渲染层 `src/cli/render.ts`（spinner/进度条/表格/ANSI，NO_COLOR 规范）
- 表驱动 CLI 框架 `src/cli/registry.ts`（26 命令声明式注册 + runCli 分发器；run 返回 undefined 不 exit 保 api 长驻命令）
- `far stream --events` 实时阶段事件流
- 前端 SSE 实时联动：`useAgentEventStream` hook + `/events` 实时事件流页 + AppShell 导航 + i18n zh/en

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
-  — offline demo walkthrough with a tested tamper-detection guide.
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

## [1.1.0] — 2026-08-05

### Fixed

- **Windows CI test failure**: `demo_chain_replay.test.ts:415` verify.sh MSYS path issue.
  Root cause: git-bash `sh` reports MSYS-style paths (`/c/tmp/...`) but Windows Node.js
  needs native paths (`C:\tmp\...`). Fix: `cygpath -w` conversion in verify.sh + defensive
  `normalizeBundleDir()` in the Node heredoc. (`src/far_proof/offline_package.ts`)
- **5 high-severity CVEs**: brace-expansion (DoS), find-my-way (HTTP2 DDoS), fast-uri
  (host confusion). Fixed via `pnpm.overrides` — all were DoS-class transitive deps,
  none touched the trust kernel. `pnpm audit` now reports zero vulnerabilities.

### Added

- **Judge Quick-Start guide** (): 5-minute verification path
  for competition judges — 60-second demo, 2-minute tamper hero, 5-minute kernel deep dive.
- **Real-world science integrity cases** (): maps famous
  reproducibility failures (Bem 2011, OSC 2015, LK-99, Theranos) to FAR-Lab's 22
  anti-theater detectors.
- **API reference** (): all 16 REST endpoints documented with
  request/response shapes and error format.
- **Repository navigation guide** (`DOCS_INDEX.md`): organizes 25 root-level documents
  into clear reading paths for different audiences.

### Added — supply-chain hardening

- `.npmrc` save-exact=true; `package.json` dependencies + `pnpm.overrides` exact-pinned.
- `scripts/check-supply-chain.mjs` gate (exact pins + lockfile specifier consistency) wired into
  `ci.yml` blocking_gates; new weekly `.github/workflows/security-audit.yml`
  (`pnpm audit --prod` + audit signatures).

### Added — statistical trap taxonomy

- `src/anti_theater/trap_taxonomy.ts`: 21-entry taxonomy (category/name/what/cures/realCase) for
  every anti-theater attack kind + `summarizeTraps` aggregation.
- Report layer: optional Statistical Trap Audit section rendering triggered trap categories
  (zero regression when absent).

### Added — evidence FTS5 search

- `src/evidence_log/search.ts`: `ensureFtsIndex` / `reindexEvidenceFts` / `searchEvidence` /
  `escapeFtsQuery`. Search auxiliary layer — never enters the hash chain.

### Added — evidence quality grading

- `src/evidence_quality/`: `gradeEvidenceTier` (RCT→1 … expert/unspecified→4) + Cochrane RoB 7-domain
  assessment + `gradeEvidenceQuality`. Transparency layer only: `VerdictKernelOutput` gains optional
  `evidenceQualityTier` / `evidenceQualityNote`; verdict logic and `proofHash` unchanged
  (zero regression).

### Added — evidence context compaction

- `src/agent_loop/compaction.ts`: deterministic artifact compression (stage3/4 verdict-critical
  payloads preserved verbatim; narrative fields clipped with hash anchors).
- `runAgentLoop` optional `compactArtifacts` flag (default off → byte-identical).

### Added — CLI state revert

- `state_machine` gains 3 revert edges (STATISTICS→EVIDENCE_GATHERED, VERDICT→STATISTICS,
  PROOF_SEALED→VERDICT); seal is a commit point — no revert after it (fail-closed).

### Added — scheduled re-verification

- `far schedule add|list|remove|run`: JSON-persisted re-verification jobs with due-date logic and
  auditable exec runs (`schedules.json` under `$FAR_HOME` or `~/.far`).

### Added — runtime JSONL session recording

- `src/trace/session_recorder.ts`: `SessionRecorder` / `replaySession` / `serializeEvent`.
- `runAgentLoop` optional `sessionPath`: records `run_started` / `stage_completed` ×N / `run_completed`.

### Added — math backend fallback chains

- `MathVerifier` fallback chains (default: SMT→CAS, Lean4→Dafny; overridable, `null` disables):
  unavailable / throwing / honestly-degraded primary backend falls back to alternatives with
  `fallback_from:<kind>` annotation. The primary conclusion is never overridden.
