# Provider: Qwen / DashScope / Bailian

> **`NEEDS_API_KEY`** — all real inference on this page is **billable** and never runs by default.
> The offline demo and the core gates do **not** need it.

## When you need it

FAR-Lab's core is the **deterministic verdict kernel** (R0–R9); **the LLM does not participate in the
verdict**. The LLM (Qwen) is only called in these scenarios:

- `far ask "<q>" --profile competition_aliyun_qwen` — one-shot 6-stage FSM; the LLM generates hypothesis/evidence
- `far stream "<q>" --profile ...` — same, but streaming
- `far court "<claim>" --models ...` — cross-model court (multiple LLMs)
- `far arena "<hypothesis>" --refuters ...` — adversarial arena
- CI `competition_qwen_smoke` (conditional gate, graceful skip without a key)

The default profile is `offline_replay` (zero keys · fixture replay); it **calls no real API**.

## Configuration

```bash
# 1. Get a key: Alibaba Cloud Bailian / DashScope console (https://bailian.console.aliyun.com)
# 2. Write it to a local .env (never commit it; .gitignore already excludes it)
cp .env.example .env
# edit .env: DASHSCOPE_API_KEY=sk-xxxxxxxx
# 3. Load it (per your shell)
export DASHSCOPE_API_KEY=sk-xxxxxxxx      # or source .env (if you use a dotenv tool)
```

`far doctor` checks whether `DASHSCOPE_API_KEY` is **set and non-empty** (presence only — it **never
reads the value**). If unset, it only WARNs, never FAILs.

## Running

```bash
far ask "Does adapter A beat baseline on TESS-ASTRO?" --profile competition_aliyun_qwen
```

The verdict is still produced by the R0–R9 kernel (red line: the LLM is not the adjudicator). The LLM
only produces claim/evidence candidates; the kernel decides.

## Smoke test

```bash
far doctor --live-qwen-smoke     # explicit flag only — calls the real API (reuses ci/competition_qwen_smoke.ts)
```

`--live-qwen-smoke` is an **explicit flag** (default `far doctor` uses zero network). It really calls
the Bailian endpoint to verify connectivity (4 models + thinking/json_schema mutual-exclusion tested).
Without a key it FAILs with guidance. Status: `NEEDS_API_VALIDATION` (real billable call; archiving
screenshots is `NEEDS_HUMAN_OPERATION`).

## Red lines

- ❌ **Never** call a real API by default in CI / install scripts (only via conditional gates / explicit flags).
- ❌ **Never** automatically read or upload user keys. `.env` is local only; `far doctor` only checks presence.
- ❌ **Never** present the offline demo as a live demo.
- ✅ The `request_id` / cost / screenshots produced by a real call are sensitive (see [SECURITY.md](../../SECURITY.md));
  `evidence/dashscope_calls/` is gitignored.

## Related

- Adapter implementation: `src/llm_gateway/adapters/aliyun_qwen/`
- CI smoke: `ci/competition_qwen_smoke.ts`
- Config template: `.env.example`
