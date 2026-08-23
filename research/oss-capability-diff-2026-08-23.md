# OSS / World-Best Capability Diff — 2026-08-23 (whole-system gap-hunt round 2)

Produced by a delegated research pass (license/activity verified via GitHub API 2026-08-23;
FAR-Lab current state verified by direct source reads). Supersedes nothing in
research/oss-reuse-scout-2026-08-23.md — that doc's docling/playwright queue stands; this
diff adds the increments below.

## Per-domain verdicts (only decision-changing findings)

| # | Domain | Best implementation | FAR-Lab verdict | Action |
|---|--------|--------------------|-----------------|--------|
| 1 | AI research agent | Sakana AI-Scientist v2 (Nature 2026; NOASSERTION license, dormant) | 够用 — tree search = data-dredging risk vs our preregistered confirmatory discipline; selection pressure already sits at the hypothesis layer (Robin tournament) | **skip** (design-study only; license blocks reuse anyway) |
| 2 | Literature screening | ASReview LAB (Apache-2.0, active; active-learning screening with WSS@95 stop rules) | **没想到** — we retrieve+rerank but have no "researcher includes/excludes → pool reranks → stop criterion + recall-risk disclosure" loop | **adopt pattern** (rewrite EXTRACT as deterministic TS; no dep) |
| 2b | Cross-source dedup | ASySD (CAMARADES, R) | partial — retrieve.ts dedups exact DOI/arXiv only; fuzzy title/author/year union leaks duplicates | **build small** (normalized-key blocking, ~half day) |
| 3 | Local knowledge base | 54yyyu/zotero-mcp (MIT, active) | 落后一档 — our zotero.ts bridge has metadata/tags/related but NO annotation extraction, NO attachment full-text ingest | **wrap own bridge** (same 127.0.0.1:23119 surface; attachments feed the queued docling-mcp path) |
| 4 | Model gateway | LiteLLM (spend logs, budget fallback, cost routing) | 够用,缺两小块 — cooldown+ledger exist; missing per-model price catalog adoption + USD ceiling | **integrate two patterns**; keep LiteLLM itself REJECTED (Python dep, silent-fallback conflict) |
| 5 | Experiment tracking | Aim (Apache-2.0) | 够用 — Python server violates zero-dep invariant; sklearn scale doesn't need it | **skip** |
| 6 | Statistical rigor | statsmodels (BSD-3) | 够用 within two-sample domain (BP5 power/MDE + BH/Wilson/bootstrap/e-value verified in domain code) | **integrate small** in sidecar when spec needs ANOVA/chi-square/regression power |
| 7 | Desktop packaging | Tauri v2 official (updater forced-signing; sentry-tauri minidump) | 壳领先/发布件没想到 — Job Object + PDEATHSIG lifecycle discipline stronger than community practice; BUT bundle.active:false, CSP null, no updater, no crash reporting | **integrate three**: signed updater, local-first crash reports (no Sentry SaaS default), tighten CSP |
| 8 | Agent approval/sandbox | Claude Code permission modes + OpenHands Docker runtime | 够用(引擎级) — permissions.ts four modes ≙ full Claude Code set, strictest-wins, bypass-immune, TTL grants | **skip engine**; execution sandbox = in-flight D-084 gateway |

## Top-5 immediate actions (decision-value order)

1. **ASReview active-learning screening loop** (biggest product differentiator; same philosophy as our anti-fabrication/uncertainty discipline).
2. **Zotero annotation + attachment full-text ingest** (activates the researcher's largest existing corpus; attaches to the already-queued docling integration).
3. **Release triad**: signed updater + local-first crash reporting + CSP tightening (prerequisite for a distributable demo installer).
4. **models.dev per-model price adoption flow + USD budget ceiling** (closes the "receipt ledger → readable cost → hard stop" last mile; preserves no-invented-prices: user confirms the catalog).
5. **Cross-source fuzzy dedup** (~half day; prevents double-counted evidence).

## Evidence honesty notes
- AI-Scientist-v2 benefit figures are paper self-reports (not independently reproduced).
- models.dev live api.json cost fields UNVERIFIED this session (sandbox network blocked the live fetch); local snapshot research/reference/models-dev-catalog.json verified as 193 providers, 0 per-model pricing.
- Agent Laboratory license unchecked (moot — skipped).
- Domains 1/5/8 "够用" verdicts rest on direct source reads + existing EVIDENCE_INDEX records.

Sources: ASReview docs + asreview-insights (WSS@95) + ASySD + zotero-mcp + LiteLLM cost tracking + Aim + Claude Code permissions + OpenHands #13150 + sentry-tauri + Tauri sidecar docs + Sakana AI Scientist Nature + Agent Laboratory + FutureHouse Robin.
