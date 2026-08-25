# Competition Model-Route Verification (re-verified 2026-08-24)

Mission: re-verify CURRENT official XH-202619 requirements for the model-calling route.
Method: live web fetch of the two official pages + four help.aliyun.com/zh/model-studio
pages (models / qwen-structured-output / text-generation / billing). Old ACCEPTANCE
claims were NOT trusted; every load-bearing claim below carries its source.

## A. Official competition requirements (VERIFIED)

Sources:
- Aliyun official topic page: https://university.aliyun.com/action/tzbjbgs2026 (page meta last-modified 2026-06-25; fetched 2026-08-24)
- NADC (National Astronomical Data Center) topic announcement: https://nadc.china-vo.org/article/20260624094452 (published 2026-06-25)

### A1. Model & calling route (verbatim, Aliyun page)

> "参赛作品必须使用到阿里云 AI 大模型及产品能力，通过本页面'创作工具'快速进入。"
> "基座模型须基于千问(Qwen)系列模型，开发平台需通过阿里云百炼平台调用，或者采用比赛官网推荐的 QoderWork/Qoder/秒悟等工具调用系列模型，并提供调用凭证或截图。"

Hard requirements for FAR-Lab:
1. **Base model MUST be Qwen-series.**
2. **Calling route MUST be Alibaba Cloud Bailian** (or officially recommended tools: current list on the page = QoderWork / Qoder / 阿里云百炼 / 万镜一刻 / 秒悟 Meoo).
3. **Proof = 调用凭证或截图 (call credential or screenshot)** — FAR-Lab satisfies this with persisted model-call receipts (provider/model/time/usage) + exportable evidence; screenshots remain a submission-time artifact.
4. Fine-tuning around downstream tasks is explicitly allowed; agent orchestration / skills / harness engineering explicitly allowed as build styles.

### A2. Page-count discrepancy — RESOLVED

Both official pages now state **技术方案文档 PDF ≤ 20 页** (verified verbatim 2026-08-24 on
both). The older "Aliyun page says ≤30" note in project-spec/COMPETITION.md is stale —
prepare to 20 pages. (Sibling sessions should sync COMPETITION.md; model-plane lane does
not edit that file.)

### A3. Timeline (Aliyun page)

- Registration 2026-05-30..06-30 (closed)
- **Submission deadline: before 2026-09-05**
- Preliminary review before 2026-09-20; coaching 2026-10; finals 2026-11.

### A4. Submission materials (NADC page)

≤20-page PDF (8 required content sections), optional interactive frontend + testable API
+ ≤10min demo video, packaged upload with network-drive link + extraction code + upload
timestamp screenshot, stamped registration form.

## B. Bailian / DashScope platform facts (for the capability registry)

Source pages (fetched 2026-08-24; models page self-declared updated 2026-08-21):
- https://help.aliyun.com/zh/model-studio/models
- https://help.aliyun.com/zh/model-studio/qwen-structured-output
- https://help.aliyun.com/zh/model-studio/text-generation
- https://help.aliyun.com/zh/model-studio/billing-for-model-studio

### B1. Endpoints (MAJOR change)

Current documented OpenAI-compatible base URLs (new MaaS form):
- Mainland/Beijing: `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
- Singapore: `https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`
- US Virginia: `https://dashscope-us.aliyuncs.com/compatible-mode/v1`
- Anthropic-compatible: `.../apps/anthropic`; DashScope native: `.../api/v1`

The legacy global endpoint `https://dashscope.aliyuncs.com/compatible-mode/v1` (current
code default) no longer appears in current docs — whether it still serves is
**UNVERIFIED**. Engineering conclusion: keep the env override
(`FARLAB_DASHSCOPE_BASE_URL`) as the single switch; at credential time the workspace
endpoint from the Bailian console is set there. Registry `interfaceNotes` records this.

### B2. Current text models (snapshot of what the catalog admits)

| model id | snapshot/alias | structured output | price (CNY/Mtok in/out) | notes |
|---|---|---|---|---|
| qwen3.8-max | — | **json_schema strict** + json_object | 12 / 36 (~1M ctx tier) | **multimodal interface REQUIRED** (text path → "url error") |
| qwen3.7-plus | =qwen3.7-plus-2026-05-26 | **json_schema strict** + json_object | ≤256K: 2/8; 256K–1M: 6/24 | native multimodal |
| qwen3.7-flash | =qwen3.7-flash-2026-07-15 | json_object | ≤32K 0.2/0.8; ≤256K 0.6/2.4; ≤1M 1.2/4.8 | cheap/fast tier |
| qwen-plus (alias) | =qwen-plus-2025-12-01 | json_object | ≤128K 0.8/2; higher tiers up to 4.8/64 | still routable legacy alias |
| qwen3.7-max (family, incl. dated snapshots) | several dated | **json_schema strict** + json_object | see billing page | **text interface only** |
| qwen3.8-2.4t-a95b / qwen3.6-max-preview | — | json_object | see billing page | **text interface only** |
| qwen3.8-27b | — | json_object | see billing page | **multimodal interface REQUIRED** |
| qwen3-coder | — | json_object | see billing page | coding |
| qwen-long / qwen-turbo | — | json_object | see billing page | long-context / cheap |

Free tier: Beijing region, 1M tokens per new model, 90 days from enablement. Batch API
half price; context-cache hit ≈10% of input price (not stackable with batch).

### B3. Structured output support tiers (official qwen-structured-output page)

- `response_format {type:'json_object'}`: broad support (qwen3.8-max, qwen3.7-plus/flash/max,
  qwen-plus/turbo, qwen3-coder, qwen-long, qwen3-vl series, qwen3.5-omni-plus, plus
  non-Qwen models on the platform). Prompt must contain the word "JSON".
- `response_format {type:'json_schema', json_schema:{...,strict:true}}`: **ONLY
  qwen3.7-plus family, qwen3.7-max family, qwen3.8-max family** (as of 2026-08-24).
  No "JSON" keyword requirement; strict:true recommended.
- Thinking mode + structured output: usually more accurate, but thinking mode REQUIRES
  streaming — FAR-Lab's structured plane is non-streaming, so thinking+structured on
  this route is a recorded known-limitation, not an attempted feature.
- With structured output DO NOT set max_tokens (truncation risk → invalid JSON).
  (Already implemented: dashscope.ts strips maxTokens.)

### B4. Other modalities

- Vision: qwen3.8-max / qwen3.7-plus native multimodal; Qwen3-VL-Plus/Flash series.
- Omni (audio+vision+realtime): qwen3.5-omni-plus.
- TTS/ASR: qwen-audio-3.0-tts-plus / qwen-audio-3.0-asr-flash-*.
- Embeddings: text-embedding-v4, qwen3.7-text-embedding (+ multimodal tongyi-embedding-vision-plus).
- Rerank: **qwen3-rerank** (gte-rerank is now "historical versions" only — any old
  reference must be updated).
- Tool calling: general support across the text-generation family.

### B5. UNVERIFIED (honest open items)

1. Per-direction "作品提交要求" subpage (the final authority on credential format) — link exists, page not fetchable this pass.
2. Whether the legacy global dashscope.aliyuncs.com endpoint still serves.
3. Exact embedding/rerank unit prices (billing page truncated).
4. qwen3.8-max exact context ceiling (only ≤1M inferable from billing tiers).
5. Per-model QPM/TPM rate-limit numbers (not fetched; registry leaves them unset rather than guessing).

## C. FAR-Lab compliance conclusions

1. **Canonical competition route = dashscope provider + Qwen-family model.** The model
   plane implements a `competition` routing policy that admits ONLY qwen-family models
   on bailian routes; every other route is rejected with a visible reason.
2. Non-Qwen routes (zai/GLM etc.) remain legal as DEVELOPMENT routes but must never sit
   in the competition path; benchmark comparisons are honest about this.
3. Credential blocker **B-QWEN-LIVE-ROUTE** stays: no Bailian key in the workspace, so
   live verification of the official route is BLOCKED-live. Code + offline verification
   paths are complete; zero fake success.
4. Receipts already persist provider/model/modelVersion(=server-echoed id)/time/usage —
   the exportable 凭证 backbone. The plane adds params + routing provenance so each
   receipt is a self-contained compliance record.
5. DeepSeek is BANNED project-wide (user directive 2026-08-22) — doubly non-compliant
   here (non-Qwen base).

## D. Cross-check against current code (drift found)

- `DASHSCOPE_DEFAULT_MODEL = 'qwen-plus'`: still routable per current docs (alias) —
  acceptable as legacy default; registry records the current flagship tiers.
- dashscope.ts strips `jsonSchema` unconditionally: pre-registry behavior assumed NO
  json_schema support; now registry-driven — qwen3.7-plus/3.7-max/3.8-max get real
  `response_format json_schema strict` transport.
- eval/-side references to `gte-rerank` (if any) should migrate to `qwen3-rerank`.
