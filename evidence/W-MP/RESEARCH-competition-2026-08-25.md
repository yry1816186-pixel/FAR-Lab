# Competition Model-Route Verification (re-verified 2026-08-25)

R2 lane 11 daily re-check. Method: live web fetch of the two official competition
pages + the Bailian qwen-structured-output page. Yesterday's record
(`RESEARCH-competition-2026-08-24.md`) was NOT trusted as-is; every load-bearing
claim below carries today's source. Fetches performed by the lane agent via
WebFetch on 2026-08-25.

## A. Official competition requirements (VERIFIED 2026-08-25)

Sources (fetched 2026-08-25):
- Aliyun official topic page: https://university.aliyun.com/action/tzbjbgs2026
- NADC announcement: https://nadc.china-vo.org/article/20260624094452 (published 2026-06-25)

### A1. Model & calling route — UNCHANGED (verbatim, Aliyun page)

> "参赛作品必须使用到阿里云 AI 大模型及产品能力"
> "基座模型须基于千问（Qwen）系列模型，开发平台需通过阿里云百炼平台调用，或者采用比赛官网推荐的 Qoder/QoderWork/QwenWork/秒悟等工具调用系列模型，并提供调用凭证或截图。"

Sanctioned 创作工具 list on the page: 千问办公（QwenWork）、Qoder、阿里云百炼、
万镜一刻、秒悟 Meoo. No language permits non-Qwen base models or third-party providers.

Engineering impact (implemented this lane, 2026-08-25):
- `src/app/provider-resolver.ts` competition route gate (meta `competition_route_mode`,
  default OFF): when ON, every resolved route (primary + declared failovers) must be
  Qwen-family (`isQwenFamily`) on a `*.aliyuncs.com` Bailian endpoint
  (`isBailianEndpoint`); violations AND no-config resolutions return a fail-closed
  `competition-route-gate` provider (sealing the env-chain zai leak).
- Receipt backbone (provider/model/time/usage per model_call) remains the
  调用凭证 export path.

### A2. Page-count discrepancy — REOPENED (30 vs 20, conflicting official pages)

Today the two official pages DISAGREE:
- Aliyun page: "技术方案文档（PDF≤30页）"
- NADC page: "技术方案文档（PDF≤20 页）"

Yesterday's record claimed both said ≤20 ("RESOLVED") — today's Aliyun fetch says 30.
Either the page changed within a day or the 08-24 extraction missed the 30. Current
truth: CONFLICTING official sources.

Decision: prepare to the STRICTER bound **≤20 pages** (satisfies both; a 20-page doc
is never rejected by a 30-page rule). Discrepancy escalated via handoff to lane 15
(governance/competition evidence owns project-spec/COMPETITION.md). Do not relitigate
per-lane: the submission doc is lane 15's surface.

### A3. Timeline — UNCHANGED

Registration 2026-05-30..06-30 (closed); **submission deadline 2026-09-05**;
preliminary review before 2026-09-20; coaching 2026-10; finals擂台赛 2026-11.

## B. Bailian platform facts (structured-output page, fetched 2026-08-25)

Source: https://help.aliyun.com/zh/model-studio/qwen-structured-output
(no rendered 更新时间 value).

### B1. Strict json_schema families — UNCHANGED

JSON Schema mode supported by: Qwen3.7-Plus 系列 / Qwen3.7-Max 系列 / Qwen3.8-Max
系列 only ("仅支持部分模型"). Registry `structuredOutput: 'json_schema_strict'`
assignments (qwen3.7-plus, qwen3.7-max, qwen3.8-max) remain correct; everything
else stays json_object.

### B2. max_tokens discipline — UNCHANGED

> "开启结构化输出时，请勿设置 max_tokens" — truncation mid-stream produces invalid JSON.

Plane already strips max_tokens on structured routes (dashscope.ts).

### B3. NEW official facts recorded into the registry (2026-08-25)

1. Thinking + json_object is NOT reliable: on "非思考模式" models, json_object with
   thinking enabled "结构化输出可能失效". Official FAQ remediation: parse the thinking
   model's raw output; if json.loads fails, re-ask a cheap json-mode model
   (e.g. qwen-flash, enable_thinking: False) to repair. FAR-Lab's bounded corrective
   re-ask chain (http.ts) is our equivalent; recorded as
   `THINKING_JSON_OBJECT_MAY_FAIL` on qwen3.7-flash and qwen-plus (the json_object
   + reasoning entries).
2. json_object prompts MUST contain the word "JSON" (else API error). Our
   `JSON_ONLY_SUFFIX` satisfies this by construction on every call.
3. Thinking mode requires streaming (`stream=True` in all thinking examples) —
   already recorded (`THINKING_NEEDS_STREAMING`); the structured plane stays
   intentionally non-streaming (design decision, unchanged).
4. Endpoints confirmed current: MaaS workspace form
   `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
   (+ ap-southeast-1). Legacy global endpoint still absent from docs.
   `isBailianEndpoint` accepts any `*.aliyuncs.com` (covers both forms + intl).

### B4. Bailian-hosted third-party models (informational)

The platform also serves kimi-k3/k2-thinking, glm-5.1/4.5, stepfun, and
deepseek-v4-pro/flash. NONE are registered for routing: competition mode is
Qwen-only (A1), and the project-wide DeepSeek ban (user directive 2026-08-22,
permanent) holds regardless of hosting platform.

## C. Unchanged conclusions carried from 2026-08-24

- `B-QWEN-LIVE-ROUTE` stays OPEN (no DASHSCOPE_API_KEY; no-live-API directive
  2026-08-23). All live claims remain BLOCKED-live; nothing here was verified by
  spending a real key.
- Registry pricing/context facts (sourced 2026-08-24 from the models/billing pages)
  were not re-fetched line-by-line today; the models catalog page still lists the
  same qwen text trio (qwen3.8-max / qwen3.7-plus / qwen3.7-flash) plus
  qwen3.7-text-embedding / qwen3-rerank already in the registry.
