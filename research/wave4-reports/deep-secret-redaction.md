# Wave-4 Deep Dive: Secret Redaction / Output Scrubbing — Cross-Repo Analysis + FAR-Lab Port Design

Date: 2026-08-22. Status: research-only; all claims carry file:line evidence from the cloned repos (read-only, never executed) and the live FAR-Lab tree.

**TL;DR**
- codex: 4 regex patterns, single fixed placeholder `[REDACTED_SECRET]`, applied at memory-write and client-facing command projection boundaries.
- hermes-agent: 56 vendor prefix patterns + ~12 structural pattern families (env/JSON/YAML config, auth headers, JWT, PEM, DB connstrings, URL userinfo, Telegram, form bodies, query params, phone numbers), two replacement semantics (debuggable head/tail mask for logs; non-reusable sentinel for file-read egress), applied at logging-formatter, terminal-output, error-text and transcript boundaries, with extensive false-positive carve-outs.
- aider: exact-literal replacement of the two configured keys (`...` + last 4 chars) applied only to the echoed command line and verbose settings dump. No regex, no tests.
- FAR-Lab phase-1 claim is **partially outdated**: `src/providers/http.ts:116-124` already contains a W4-F3 `redactSecrets` port (codex's 4 patterns) applied at `fail()` (http.ts:655) **after** raw-message classification (http.ts:491). The remaining true gaps: (a) pattern set is only codex's 4; (b) the orchestrator persists stage-error text that never passed through the provider redactor (sources/ `SourceAdapterError`, non-provider stage failures); (c) CLI/API render paths re-emit persisted error text.

---

## 1. openai/codex (Apache-2.0, Rust) — minimal best-effort sanitizer

### 1.1 Pattern set (verbatim, 4 patterns)

File: `.cache/repos/codex/codex-rs/secrets/src/sanitizer.rs`

| # | Pattern (verbatim) | Line | Target |
|---|---|---|---|
| 1 | `sk-[A-Za-z0-9]{20,}` | :4 | OpenAI-style keys |
| 2 | `\bAKIA[0-9A-Z]{16}\b` | :5-6 | AWS Access Key ID |
| 3 | `(?i:\bBearer)[ \t]+[A-Za-z0-9._~+/-]{16,}=*` | :7-8 | Bearer tokens (any scheme payload) |
| 4 | `(?i)\b(api[_-]?key\|token\|secret\|password)\b(\s*[:=]\s*)(["']?)[^\s"']{8,}` | :9-11 | KEY=value / "key": value assignments |

### 1.2 Replacement semantics

- `redact_secrets(input: String) -> String` (sanitizer.rs:15-22): sequential `replace_all`, fixed placeholder `[REDACTED_SECRET]`.
- Bearer keeps the scheme word: `"Bearer [REDACTED_SECRET]"` (:16).
- Assignment keeps key + separator + opening quote: replacement `"$1$2$3[REDACTED_SECRET]"` (:19) — key names stay debuggable, only the value dies.
- No length preservation, no head/tail preservation, **no re-scan of replaced output** (single sequential pass over the original; Rust `replace_all` does not rescan inserted text). Ordering matters and is explicit: Bearer first (so `Bearer sk-...` is consumed whole), then sk-, then AKIA, then assignment (:16-19).

### 1.3 Where applied (call sites)

- `codex-rs/app-server-protocol/src/protocol/item_builders.rs:58` — `command: redact_secrets(shlex_join(command))` in `CommandExecutionPresentation::from_raw` (client-facing command projection); also :152, :169, :173-178 for command/query presentations.
- `codex-rs/memories/write/src/phase1.rs:320-322` — `output.raw_memory = redact_secrets(...)`, `rollout_summary`, `rollout_slug` — **LLM-produced memory text before persistence**; :427 `Ok(redact_secrets(serialized))` — serialized rollout items fed into the memory pipeline.
- Companion type `codex-rs/utils/redacted-string/src/lib.rs:11-49` — `RedactedString` newtype whose `Debug` impl writes `<redacted>` (:45-49); used for config fields that must never print (bearer tokens, query params, headers: `model-provider-info/src/lib.rs:111,120,123,173`).

### 1.4 Deliberate non-redactions (false-positive avoidance)

Test `avoids_bearer_false_positives` (sanitizer.rs:72-86) pins the carve-outs verbatim: `"Bearer of good news"` (prose), `"Bearer abcdefghijklmno"` (15 chars < 16 floor), `"NotABearer ..."`, `"Bearerabcdefghijklmnop"` (no space), `"Bearer\n..."` (newline not in `[ \t]+`), non-ASCII Kelvin-sign suffix. No generic hex/base64 patterns → git SHAs and hash blobs untouched by construction.

### 1.5 Tests

- `codex-rs/secrets/src/sanitizer.rs:36-86` — 2 test fns: `redacts_supported_bearer_tokens` (7 cases incl. mixed sk-/AKIA under Bearer, case-insensitive `bEaReR` + tab separator), `avoids_bearer_false_positives` (7 negative cases).
- `item_builders_tests.rs` exercises redaction through command presentation (file listed in initial grep; the authoritative unit tests are in sanitizer.rs).

---

## 2. hermes-agent (MIT, Python) — defense-in-depth redaction engine

File: `.cache/repos/hermes-agent/agent/redact.py` (1428 lines). This is the richest of the three: one module owns every pattern, and ~15 other surfaces import it.

### 2.1 Vendor prefix patterns (verbatim, 56 entries in `_PREFIX_PATTERNS`, redact.py:80-140)

Compiled into one alternation with boundary guards: `(?<![A-Za-z0-9_-])(...)(?![A-Za-z0-9_-])` (:485-487).

```
sk-[A-Za-z0-9_-]{10,}                # OpenAI / OpenRouter / Anthropic (sk-ant-*)          :81
ghp_[A-Za-z0-9]{10,}                 # GitHub PAT classic                                   :82
github_pat_[A-Za-z0-9_]{10,}         # GitHub PAT fine-grained                              :83
gho_[A-Za-z0-9]{10,}                 # GitHub OAuth access                                  :84
ghu_[A-Za-z0-9]{10,}                 # GitHub user-to-server                                :85
ghs_[A-Za-z0-9]{10,}                 # GitHub server-to-server                              :86
ghr_[A-Za-z0-9]{10,}                 # GitHub refresh                                       :87
xapp-\d+-[A-Za-z0-9-]{10,}           # Slack app-level                                      :88
xox[baprs]-[A-Za-z0-9-]{10,}         # Slack bot/app/user                                   :89
AIza[A-Za-z0-9_-]{30,}               # Google API key                                       :90
pplx-[A-Za-z0-9]{10,}                # Perplexity                                           :91
fal_[A-Za-z0-9_-]{10,}               # Fal.ai                                               :92
fc-[A-Za-z0-9]{10,}                  # Firecrawl                                            :93
bb_live_[A-Za-z0-9_-]{10,}           # BrowserBase                                          :94
gAAAA[A-Za-z0-9_=-]{20,}             # Codex encrypted tokens                               :95
AKIA[A-Z0-9]{16}                     # AWS Access Key ID                                    :96
sk_live_[A-Za-z0-9]{10,}             # Stripe live                                          :97
sk_test_[A-Za-z0-9]{10,}             # Stripe test                                          :98
rk_live_[A-Za-z0-9]{10,}             # Stripe restricted                                    :99
SG\.[A-Za-z0-9_-]{10,}               # SendGrid                                             :100
hf_[A-Za-z0-9]{10,}                  # HuggingFace                                          :101
r8_[A-Za-z0-9]{10,}                  # Replicate                                            :102
npm_[A-Za-z0-9]{10,}                 # npm                                                  :103
pypi-[A-Za-z0-9_-]{10,}              # PyPI                                                 :104
dop_v1_[A-Za-z0-9]{10,}              # DigitalOcean PAT                                     :105
doo_v1_[A-Za-z0-9]{10,}              # DigitalOcean OAuth                                   :106
am_[A-Za-z0-9_-]{10,}                # AgentMail                                            :107
sk_[A-Za-z0-9_]{10,}                 # ElevenLabs (underscore)                              :108
tvly-[A-Za-z0-9]{10,}                # Tavily                                               :109
exa_[A-Za-z0-9]{10,}                 # Exa                                                  :110
gsk_[A-Za-z0-9]{10,}                 # Groq                                                 :111
syt_[A-Za-z0-9]{10,}                 # Matrix                                               :112
retaindb_[A-Za-z0-9]{10,}            # RetainDB                                             :113
hsk-[A-Za-z0-9]{10,}                 # Hindsight                                            :114
mem0_[A-Za-z0-9]{10,}                # Mem0                                                 :115
brv_[A-Za-z0-9]{10,}                 # ByteRover                                           :116
xai-[A-Za-z0-9]{30,}                 # xAI (Grok)                                           :117
ntn_[A-Za-z0-9]{10,}                 # Notion integration                                   :118
fw-[A-Za-z0-9]{30,}                  # Fireworks                                            :119
fw_[A-Za-z0-9]{30,}                  # Fireworks                                            :120
fpk_[A-Za-z0-9]{30,}                 # Fireworks project                                    :121
glpat-[A-Za-z0-9_\-]{10,}            # GitLab PAT                                           :125
gloas-[A-Za-z0-9_\-]{10,}            # GitLab OAuth app secret                              :126
gldt-[A-Za-z0-9_\-]{10,}             # GitLab deploy token                                  :127
glrt-[A-Za-z0-9_.\-]{10,}            # GitLab runner auth (routable=dotted)                 :128
glrtr-[A-Za-z0-9_.\-]{10,}           # GitLab runner registration                           :129
glcbt-[A-Za-z0-9_\-]{10,}            # GitLab CI/CD job token                               :130
glptt-[A-Za-z0-9_\-]{10,}            # GitLab pipeline trigger                              :131
glft-[A-Za-z0-9_\-]{10,}             # GitLab feed token                                    :132
glimt-[A-Za-z0-9_\-]{10,}            # GitLab incoming mail                                 :133
glagent-[A-Za-z0-9_\-]{10,}          # GitLab agent (KAS)                                   :134
glsoat-[A-Za-z0-9_\-]{10,}           # GitLab service-account                               :135
glffct-[A-Za-z0-9_\-]{10,}           # GitLab feature-flags client                          :136
glwt-[A-Za-z0-9_\-]{10,}             # GitLab workspace                                     :137
GR1348941[A-Za-z0-9_\-]{10,}         # GitLab legacy runner reg                            :138
pk-lf-[A-Za-z0-9\-]{8,}              # Langfuse public key                                  :139
```

### 2.2 Structural pattern families (beyond prefixes)

| Family | Regex anchor (file:line) | Notes |
|---|---|---|
| Sensitive query params | `_SENSITIVE_QUERY_PARAMS` frozenset, :29-46 (access_token, refresh_token, id_token, token, api_key, apikey, client_secret, password, auth, jwt, session, secret, key, code, signature, x-amz-signature) | exact-match key names, not substring |
| Sensitive body keys | `_SENSITIVE_BODY_KEYS` :51-66 | `token_count`/`session_id` must NOT match |
| ENV assignment (UPPERCASE) | `_ENV_ASSIGN_RE` :155-157, keyword class :152 | embedded match OK for all-caps keys |
| ENV assignment (lowercase) | `_ENV_ASSIGN_LOWER_RE` :161-164 | only `_`-boundary names; bare `password=` in prose skipped |
| Dotted config keys | `_CFG_DOTTED_RE` :203-208 (namespaced keys only) | `spring.datasource.password=...` |
| Line-anchored config keys | `_CFG_ANCHORED_RE` :210-213 | bare `password=` only at line start / after `export` |
| YAML colon config | `_YAML_ASSIGN_RE` :226-229 | key-anchored, unquoted single-token values |
| Word-boundary key validator | `_KEY_KEYWORD_RE` :256-260 + `_key_has_secret_keyword` :293-316 + `_is_word_start/_is_word_end` :263-290 | rejects `Secretary:`, `tokenizer:`, `authored=`, `KEYBOARD=`, `PASSAGE=` |
| JSON fields | `_JSON_FIELD_RE` :319-323 | `"apiKey": "value"` etc. |
| Authorization headers (any scheme) | `_AUTH_HEADER_RE` :337-340 | Basic/Token/Digest too; excludes quotes from credential |
| API-key headers | `_SECRET_HEADER_RE` :349-352, names :346-348 (x-api-key, x-goog-api-key, api-key, apikey, x-api-token, x-auth-token, x-access-token) | |
| Telegram bot tokens | `_TELEGRAM_RE` :356-358 | `bot<digits>:<30+ token>` |
| PEM private key blocks | `_PRIVATE_KEY_RE` :361-363 | replaced with `[REDACTED PRIVATE KEY]` |
| DB connection strings | `_DB_CONNSTR_RE` :373-376 | postgres/mysql/mongodb/redis/amqp `://user:PASS@`; whitespace-forbidding to avoid line-span (issue #33801) |
| Bare-token URL userinfo | `_URL_BARE_TOKEN_RE` :393-398 | `scheme://TOKEN@host` (colon-less), 8+ chars |
| JWT | `_JWT_RE` :402-405 | `eyJ` + 1-3 part base64url |
| E.164 phone | `_SIGNAL_PHONE_RE` :409 | partial masking |
| Form-urlencoded body | `_FORM_BODY_RE` :465-467 + `_redact_form_body` :731-744 | only clean `k=v&k=v` |
| Control-char split tokens | `_mask_control_split_tokens` :490-539 | catches `sk-abc\x1bdef…` smuggling (issue #77484) |

### 2.3 Replacement semantics — TWO distinct modes

1. **Debuggable mask** `_mask_token` → `mask_secret(value, head=6, tail=4, floor=18)` (redact.py:551-609): tokens ≥18 chars become `sk-pro…7890` (prefix 6 + `...` + suffix 4). Shorter tokens fully `***`. Used for logs/terminal output (:835, :843).
2. **Non-reusable sentinel** `_mask_token_nonreusable` (:747-771): `«redacted:ghp_…»` — keeps ONLY the vendor prefix label, zero secret bytes. Rationale (issue #35519): a head/tail mask looks like a real-but-truncated key; an agent that reads it from a config and writes it back corrupts the credential → 401. Used when redacting file-read content returned to the agent (:835).
3. ENV/JSON/YAML assignments keep the key name, mask only the value (:862, :897, :916). Auth headers keep header name + scheme (:924). DB connstrings keep `user:` and `@` (:960-963). Private keys → fixed `[REDACTED PRIVATE KEY]` (:946).

Kill-switch and secure default: `HERMES_REDACT_SECRETS` snapshot at import (:68-77, default ON); `force=True` bypasses the opt-out at safety boundaries (:774-787).

### 2.4 Where applied

- **All log files**: `RedactingFormatter` (redact.py:1419-1428) wraps every `logging.Formatter.format` — installed on every RotatingFileHandler in `hermes_logging.py:316-396` (5 handler sites) and the listener (:581).
- **Terminal/process output**: `redact_terminal_output` (:1103-1130) — single policy for foreground terminal results AND background process poll/log/wait; command-aware `code_file` selection via `is_env_dump_command` (:1077-1100) and `_command_reads_env_file` (:1036-1074) so `env`/`printenv`/`cat .env` output gets the ENV pass.
- **Gateway error text**: `gateway/run.py:660-699` (force=True for command rendering), :17747-17748 (output), :19902-19903 (stderr), :25896-26031 (process output).
- **Context compaction** (LLM-bound summaries): `agent/context_compressor.py:1246-1252` `_redact_compaction_text` with `force=True`, applied at :4035, :4068, :4111, :4143, :4282, :4411-4419, :4529-4531.
- **Agent state dumps**: `agent/agent_runtime_helpers.py:1947-1953` — payloads redacted before `atomic_json_write` and printing.
- **CLI echoed output / slash commands / cron scheduler stdout/stderr / venv scans**: `cli.py:17442-17449` (opt-out warning), `gateway/slash_commands.py`, `cron/scheduler.py`, `hermes_cli/_scan_venv_blockers.py`.
- **Plugin registry** (additive-only): `register_redaction_patterns` (:1306-1390) with static validation — no top-level alternation (preserves literal-prefix pre-screen), no nested unbounded quantifiers (ReDoS guard, :1193-1249), ≥2 leading literal chars. Plugins can only over-redact, never weaken (:1265-1282).

Performance discipline: literal-prefix pre-screen `_has_known_prefix_substring` (:1252-1262) derived automatically from the pattern list; per-pattern substring gates (`"=" in text`, `"://" in text`, `"eyJ" in text` — :810-817) — 13-pattern scan drops ~5.6µs→~1.8µs per record.

### 2.5 Deliberate non-redactions (carve-outs)

- **Web-URL query params + `user:pass@` userinfo pass through by default** (:979-991): OAuth callbacks, magic links, pre-signed URLs must survive agent workflows; opt-in via `redact_url_credentials=True` (:993-994) or `redact_cdp_url` (:697-719). The one userinfo case always redacted is colon-less `scheme://TOKEN@host` (:393-398).
- **Source code context** (`code_file=True`, :794-797): ENV-assignment / JSON-field / YAML passes skipped — `MAX_TOKENS=100`, `"apiKey": "test"` fixtures, `postgresql://{user}` f-string templates preserved (:948-961); prefix/auth-header/private-key/JWT/DB passes still run.
- **Programmatic env lookups**: values matching `os.getenv(...)`, `process.env.X`, `$ENV{X}` are code, not secrets (:191-197, :851-856, :895).
- **Prose embedding keywords**: `Secretary: J.Smith`, `tokenizer: cl100k_base`, `author=Smith` pass via the word-boundary validator (:231-316).
- **Short tokens**: prefix patterns need ≥10 body chars (vs codex 20); Bearer needs ≥16; sub-18-char values fully masked rather than partially.
- **No generic hex/base64 patterns** — git SHAs and content hashes untouched by construction.

### 2.6 Tests

- `tests/agent/test_redact.py` — 1053 lines, 40+ test fns: GitLab families (:23), word-boundary+length negatives (:53), Slack (:62), Fireworks (:71) + short-word negatives (:83), env assignment positives/negatives (:91-139), control-char split tokens (:161-197), `os.getenv` carve-out (:213), JSON (:243-249), auth-header quote preservation (:266), x-api-key in curl (:286), Telegram (:299), formatter (:326), JWT 2-part (:406), phone passthrough (:427).
- Boundary suites: `tests/gateway/test_telegram_error_redaction.py`, `tests/tools/test_terminal_error_redaction.py`, `tests/tools/test_terminal_tool_exception_redaction.py`, `tests/agent/test_compaction_redaction_boundaries.py`, `tests/monitoring/test_export_redaction.py`, `tests/test_redaction_registry.py`, `tests/gateway/test_pii_redaction.py`, plus approval-prompt/TUI/ACP/kanban/browser redaction tests (15 files total under `tests/`).

---

## 3. aider (Apache-2.0, Python) — exact-literal scrub

### 3.1 Mechanism

File: `.cache/repos/aider/aider/format_settings.py:1-9`:

```python
def scrub_sensitive_info(args, text):
    # Replace sensitive information with last 4 characters
    if text and args.openai_api_key:
        last_4 = args.openai_api_key[-4:]
        text = text.replace(args.openai_api_key, f"...{last_4}")
    if text and args.anthropic_api_key:
        last_4 = args.anthropic_api_key[-4:]
        text = text.replace(args.anthropic_api_key, f"...{last_4}")
    return text
```

Semantics: **exact-string replacement of the two configured key literals** with `...{last4}` (length-destroying, debuggability-preserving suffix). No regex, no other vendors, no Bearer/JWT/env patterns. Zero false positives by construction (only the real configured key can match); zero coverage of any other secret shape.

### 3.2 Where applied

- `aider/main.py:749-751` — the echoed command line before `io.tool_output(cmd_line, log_only=True)` (protects the chat-log file from `--openai-api-key sk-...` argv).
- `aider/format_settings.py:13` — `parser.format_values()` in verbose settings dump; `:24` — every non-empty arg value rendered in the same dump (so a key passed via any arg slot is scrubbed in the dump).

### 3.3 Adjacent (not general redaction)

- `aider/analytics.py:195-203` `_redact_model_name` — unknown `vendor/model` names become `vendor/REDACTED` in telemetry (privacy of model choice, not credentials).
- `aider/io.py:754-764` `log_llm_history` — logs role/content conversation text only (no headers/keys).

### 3.4 Tests

None. `rg scrub tests/` → no matches. The scrub has no test coverage in the repo.

---

## 4. FAR-Lab verified truth (phase-1 claim audit)

### 4.1 http.ts error paths — response body DOES enter Error/result text, but is already redacted at one boundary

`src/providers/http.ts` (read in full):

- `classifyHttpStatus` (:474-509): embeds envelope message truncated to 300 chars — `truncate(rawMsg, 300)` :478 — or, when the envelope is absent, the **raw body** truncated to 200: `(empty body) ${truncate(bodyText, 200)}` :478. Prefix: `provider: HTTP status [ code]: msg` :479.
- `parseSuccessBody` (:527-581): HTTP-200 malformed-body failure embeds `truncate(bodyText, 200)` :561.
- `classifyTransportError` (:511-525): embeds fetch error `name: message` — no body.
- invalid_output failures embed `truncate(lastRawContent, 200)` — **raw model output head** (:742, :754) — a real leak path if the model echoes a pasted key.
- **All** failures exit through `fail()` (:651-672), which applies `redactSecrets(failure.message)` at :655 before the message enters `StructuredCallResult.error`.

**Existing W4-F3 redactor** (http.ts:108-124): codex's exact 4 patterns ported to JS (Bearer :117, sk- :118, AKIA :119, assignment :120), documented as applied "at the persistence chokepoint (fail)" with "Classification stays on the RAW message" (:108-114). Existing tests: `tests/providers.test.ts:439` (e2e: error message contains `[REDACTED_SECRET]`) and `:817-828` (unit: sk-/AKIA/Bearer/api_key/password redacted; prose and `sk-short` pass through).

So the phase-1 statement "error messages contain response body truncated 300 chars into sqlite/logs — theoretical leak surface" is accurate about the body embedding but **misses the existing fail()-boundary redaction**. The residual leak surfaces are the ones that bypass `fail()`: sources/ errors, non-provider stage failures, and the narrow 4-pattern coverage.

### 4.2 Complete sink map (every place error text persists or leaves the process)

Data dir: `.far-run/` (default, `src/server/main.ts:7`); sqlite via `node:sqlite` (`src/persistence/db.ts:63`).

| # | Sink | Table/file + column | Written at | Content |
|---|---|---|---|---|
| 1 | sqlite `runs` | `runs.doc` (JSON) — `db.ts:31-38` | orchestrator.ts:159-166 `setStage({state:'failed', error: msg})` :161 + `r.lastError = msg` :163 → `store.updateRun` (store.ts:62 area) | stage error text + run lastError. Schema: `stages[].error` domain/run.ts:27, `lastError` domain/run.ts:61 |
| 2 | sqlite `events` | `events.payload` — `db.ts:40-46` | orchestrator.ts:167-169 `stage_failed`/`run_cancelled` `detail: { error: msg }` | same msg, second copy |
| 3 | sqlite `objects` (receipts) | `objects.json` — `db.ts:48-54` | orchestrator.ts:61-69 `recordReceipt` → `store.putObject('receipt', ...)` | **model_call receipts contain NO error text** — provider/modelId/usage/latency/hashes only (llm.ts:67-84, redactionNote "hashes only"); source_retrieval failure receipts contain httpStatus/count/hashes, no message (retrieve.ts:347-358). STRONG. |
| 4 | stdout progress log | process.stdout | orchestrator.ts:72 `ctx.log` — retrieve.ts:370 logs full `SourceAdapterError.message` (includes query + fetch error text); rank.ts:540 judge failure; hypotheses.ts:590 novelty-search failure | NOT covered by http.ts redactor (sources/ path) |
| 5 | CLI stdout | terminal | cli/main.ts:68 `lastError`, :71 per-stage `s.error` | renders persisted text (sink 1) |
| 6 | CLI stderr | terminal | cli/main.ts:292 `far: fatal: ${e.stack ?? e.message}` | unredacted stack of any top-level throw |
| 7 | Web API JSON | HTTP responses | api.ts:245 GET /runs/:id returns full run doc (stages[].error + lastError); `internal(message)` :114-115 → `sendError` :189-190 `{error:{code,message,retryable}}`; execution-failure stderr log api.ts:163-167 | renders persisted text (sink 1) + any handler throw |
| 8 | Export bundle | `.far-run/exports/` (cli/main.ts:213) | export.ts builds bundle from domain objects (question/sources/claims/hypotheses/scorecards/plans — export.ts:539-548) | **no stage-error/lastError content found in bundle** (verified: no references) |
| 9 | Latent carrier | — | `SourceAdapterError.bodyPreview` (sources/error.ts:26,35,47) — 300-char failing-body preview set at openalex.ts:156,165,205,215,223; crossref.ts:91,98,127,168,177; arxiv.ts:143,150 | NOT included in `.message` (constructor sources/error.ts:38-43) and no persistence sink consumes `.bodyPreview` today — but one `console.log(e.bodyPreview)` anywhere would leak; guard in design |

### 4.3 Control-flow matching on error message text (complete list)

| Site | Matches | Raw or redacted | Ordering verdict |
|---|---|---|---|
| `src/providers/http.ts:491` `QUOTA_MESSAGE_RE.test(rawMsg)` (`/insufficient\s+(?:balance\|quota)\|余额不足\|no resource package/i` :56) | quota classification inside 429 branch of `classifyHttpStatus` | **RAW** envelope message (:477) — redaction happens later at fail() :655 | SAFE, ordering already explicit |
| `src/providers/http.ts:760` retry-kind decision | uses `f.kind` enum + `f.retryable` flag, not text | n/a | SAFE |
| `src/app/orchestrator.ts:158` `/^cancelled/i.test(msg)` | cancel detection on caught stage error | post-provider-redaction text | SAFE — placeholders never start with "cancelled"; sources/ messages unredacted today but a secret-bearing message cannot begin with "cancelled" unless the fetch error itself does (no plausible collision) |
| `src/sources/openalex.ts:132` `/insufficient budget\|resets at/i.test(first.bodyText)` | raw HTTP bodyText, not an error message | RAW | unrelated to redaction |
| `src/cli/main.ts:291` `e.message === '__exit__'` | sentinel equality at top-level catch | pre-any-redaction | boundary redaction must be render-time only, never mutate the Error object |
| `src/pipeline/llm.ts:87` | throws `model call failed (${err.kind}) ...: ${err.message}` — no text matching downstream | message is already redacted (came from fail()) | SAFE |

No other `.test(`/`.match(`/`.includes(` on error-message text exists in `src/` (grepped; remaining matches are URL/XML parsing in sources/fulltext.ts, sources/arxiv.ts, sources/crossref.ts — input parsing, not error text).

---

## 5. PORT DESIGN DRAFT for FAR-Lab

### 5.1 Placement decision (with trade-off)

Mission asks: redact at the ERROR-PERSISTENCE boundary, NOT inside the provider. Verified reality: a provider-boundary redaction already exists (http.ts fail(), post-classification) and is tested. Recommendation — **two-layer, single pattern owner**:

- **Layer 1 (keep, already shipped)**: `fail()` redaction in http.ts:655. It sits AFTER classification (quota regex on raw, :491) and BEFORE the message leaves the provider — protecting every in-memory consumer. Removing it (pure mission reading) would expose `test-stub` consumers and any future direct `StructuredCallResult` reader for zero benefit; control flow inside http.ts never re-reads the message after fail().
- **Layer 2 (new)**: render/persist-time redaction at the orchestrator catch, API error envelope, and CLI fatal handler. This closes the real gaps: sources/ `SourceAdapterError` text (sink 4), non-provider stage failures, top-level stack traces (sink 6), API 500 messages (sink 7).
- **Single owner**: move the pattern table from http.ts into a new `src/shared/redact.ts`; http.ts imports it (no duplicated constants).

### 5.2 New module: `src/shared/redact.ts` (zod-only runtime, no deps, TS strict)

```ts
export type SecretFamily =
  | 'bearer' | 'openai' | 'aws' | 'github' | 'slack' | 'google' | 'gitlab'
  | 'stripe' | 'anthropic' | 'groq' | 'hf' | 'npm' | 'pypi' | 'notion' | 'xai'
  | 'fireworks' | 'gAAAA' | 'jwt' | 'private-key' | 'db-password'
  | 'url-userinfo' | 'auth-header' | 'apikey-header' | 'assignment';

// [RegExp, SecretFamily][] — sequential, single pass over the ORIGINAL text.
// JS String.replace(/…/g, …) never rescans inserted replacement text;
// the pass is run exactly once (no fixpoint iteration) => recursion guard.
export const redactSecrets = (text: string): string => { /* reduce over rules */ };

// Convenience for unknown caught values: never mutates the Error; returns redacted string.
export const redactErrorText = (e: unknown): string =>
  redactSecrets(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
```

### 5.3 Pattern set (union of the three repos, deduped, FP-tuned for research text)

Ordered rules (order preserves codex semantics — Bearer first so `Bearer sk-…` is consumed whole):

1. `/\bBearer[ \t]+[A-Za-z0-9._~+/=-]{16,}/gi` → `Bearer [REDACTED:bearer]` (codex sanitizer.rs:7-8; JS form http.ts:117)
2. `/\bsk-(?:ant|proj)-[A-Za-z0-9_-]{16,}/g` and `/\bsk-[A-Za-z0-9]{20,}/g` → `[REDACTED:openai]` (codex :4 + hermes :81 split: hermes' broad `sk-[A-Za-z0-9_-]{10,}` would false-positive on research prose like `sk-learn-classifier`; FAR-Lab keeps codex's 20-char floor for the generic form and adds the distinctive `sk-ant-`/`sk-proj-` prefixes at 16)
3. `/\bAKIA[0-9A-Z]{16}\b/g` → `[REDACTED:aws]` (codex :5-6)
4. GitHub: `/\b(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{10,}\b/g` and `/\bgithub_pat_[A-Za-z0-9_]{10,}\b/g` → `[REDACTED:github]` (hermes :82-87, :83)
5. Slack: `/\bxox[baprs]-[A-Za-z0-9-]{10,}/g`, `/\bxapp-\d+-[A-Za-z0-9-]{10,}/g` → `[REDACTED:slack]` (hermes :88-89)
6. Google: `/\bAIza[A-Za-z0-9_-]{30,}\b/g` → `[REDACTED:google]` (hermes :90)
7. GitLab: `/\b(?:glpat|gloas|gldt|glrt|glrtr|glcbt|glptt|glft|glimt|glagent|glsoat|glffct|glwt)-[A-Za-z0-9_.\-]{10,}\b/g` and `/\bGR1348941[A-Za-z0-9_\-]{10,}\b/g` → `[REDACTED:gitlab]` (hermes :125-138)
8. Stripe: `/\b(?:sk_live_|sk_test_|rk_live_)[A-Za-z0-9]{10,}\b/g` → `[REDACTED:stripe]` (hermes :97-99)
9. Groq/HF/npm/PyPI/Notion/xAI/Fireworks/Replicate/SendGrid (hermes :100-121, high-relevance subset): `/\bgsk_[A-Za-z0-9]{10,}\b/g`, `/\bhf_[A-Za-z0-9]{10,}\b/g`, `/\bnpm_[A-Za-z0-9]{10,}\b/g`, `/\bpypi-[A-Za-z0-9_-]{10,}\b/g`, `/\bntn_[A-Za-z0-9]{10,}\b/g`, `/\bxai-[A-Za-z0-9]{30,}\b/g`, `/\b(?:fw-|fw_|fpk_)[A-Za-z0-9]{30,}\b/g`, `/\br8_[A-Za-z0-9]{10,}\b/g`, `/\bSG\.[A-Za-z0-9_-]{10,}\b/g` → `[REDACTED:<family>]`
10. Codex-encrypted: `/\bgAAAA[A-Za-z0-9_=-]{20,}\b/g` → `[REDACTED:gAAAA]` (hermes :95)
11. JWT: `/\beyJ[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_=-]{4,}){0,2}\b/g` → `[REDACTED:jwt]` (hermes :402-405; gate on `'eyJ' in text`)
12. PEM blocks: `/-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?-----END[A-Z ]*PRIVATE KEY-----/g` → `[REDACTED:private-key]` (hermes :361-363; gate on `'BEGIN' in text && '-----' in text`)
13. DB connstrings: `/\b((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^:\s]+:)([^@\s]+)(@)/gi` → `$1[REDACTED:db-password]$3` (hermes :373-376; whitespace-forbidding guards)
14. Authorization/API-key headers: `/\b((?:proxy-)?authorization:\s*)([a-z][\w.+-]*\s+)?([^\s"']+)/gi` → `$1$2[REDACTED:auth-header]` and `/\b(x-api-key|x-goog-api-key|api-key|apikey|x-api-token|x-auth-token|x-access-token)(\s*:\s*)\S+/gi` → `$1$2[REDACTED:apikey-header]` (hermes :337-340, :346-352)
15. URL bare-token userinfo: `/((?:https?|wss?|git|ssh|ftp|ftps|sftp):\/\/)([^\s:@/]{8,})(@[^\s]+)/gi` → `$1[REDACTED:url-userinfo]$3` (hermes :393-398 — colon-less form only; `user:pass@` and query params deliberately pass through, hermes carve-out :979-991)
16. Assignment (LAST, after placeholders exist): `/\b(api[_-]?key|token|secret|password)\b(\s*[:=]\s*)(["']?)[^\s"']{8,}/gi` → `$1$2$3[REDACTED:assignment]` (codex :9-11) — keep codex's NARROW keyword set (no bare `key`/`auth`, no lowercase-prose forms) so `MAX_TOKENS=8192`, `token_count: 5`, and hermes' documented prose FPs cannot match; word boundaries exclude `MAX_TOKENS` (the `_` is a word char, no `\b` before `TOKENS`).

Placeholder format: `[REDACTED:<family>]` — type-tagged (mission requirement), non-reusable (hermes #35519 lesson: never emit anything resembling a valid truncated key), and chosen so no rule's keyword+separator can re-match a placeholder (tags contain no `api-key`/`token`/`secret`/`password` followed by `:`/`=`; single pass makes this moot anyway).

Carve-outs adopted verbatim from hermes (document in module docstring): web-URL query-string values NOT redacted by default (magic-link/OAuth workflows); generic hex (git SHAs, sha256) and base64 blobs NOT matched (every rule is prefix-anchored or keyword+separator-anchored); prose like "Bearer of good news" passes (16-char floor + `[ \t]+`).

Perf (hermes precedent, redact.py:810-817): gate each rule family on a cheap substring pre-check (`'Bearer'`, `'sk-'`, `'AKIA'`, `'eyJ'`, `'BEGIN'`, `'://'`, `' authorization'`/`':"'` …) — error paths are short; this keeps the common case near-free.

### 5.4 Exact FAR-Lab call sites to modify

| Site | Change |
|---|---|
| NEW `src/shared/redact.ts` | pattern table + `redactSecrets` + `redactErrorText` (sole owner) |
| `src/providers/http.ts:116-124` | delete local `SECRET_PATTERNS`/`redactSecrets`, import from `../shared/redact.js`; keep the `fail()` application at :655 (classification at :474-509 already precedes it — leave untouched) |
| `src/app/orchestrator.ts:156` | `const msg = redactErrorText(e)` before the three persist writes (:161 stage error, :163 lastError, :167-169 event detail). This covers sources/ and all non-provider stage failures (sinks 1, 2, 4) |
| `src/server/api.ts:114-115` | `internal(message)` → `internal(redactSecrets(message))` (or redact inside `sendError` once, :189-190) + :166 stderr write (sink 7) |
| `src/cli/main.ts:292` | `far: fatal: ${redactErrorText(e)}` — note `e.stack` also embeds the message: redact the stack string too (`redactSecrets(String(e.stack ?? e.message))`); do NOT touch the `__exit__` equality check at :291 (checked before rendering) |
| Sinks 5 & 7 (CLI status :68/:71, GET /runs/:id :245) | no change — they render text already redacted at sink-1 write time (layer 2 above); double-redaction is idempotent by construction (placeholders contain no secret material) |
| `src/sources/error.ts` | optional hardening: redact `bodyPreview` in the constructor (:38-43) — no sink consumes it today, but one future `console.log(e)` leaks it |

Explicit ordering contract (must be stated in code comments and tests): **classification on RAW message (http.ts:491) → provider-boundary redaction (http.ts:655) → orchestrator catch redaction (orchestrator.ts:156) → persistence/render**. The only text-matching control flows (quota regex, `/^cancelled/`) run strictly before any redaction.

### 5.5 What this design does NOT do (deliberate)

- No redaction of LLM-bound prompts (FAR-Lab userPayload is research data; the fence at http.ts:178-185 is the injection defense; hermes redacts compaction text because it becomes persistent memory — FAR-Lab persists hashes only, llm.ts:67-84).
- No phone-number/PII redaction (hermes-specific surface; out of FAR-Lab threat model).
- No plugin registry (single-writer workspace; revisit only if providers become extensible).
- No opt-out env var (hermes needs one for redactor development; FAR-Lab has no such workflow — kill-switches are leak surfaces).

---

## 6. Test plan (deterministic, sink-by-sink)

New file `tests/redact.test.ts` (unit) + additions to `tests/providers.test.ts`, `tests/orchestrator-attempt.test.ts`, `tests/api.test.ts`:

**Unit — pattern matrix (planted real-shaped fakes, one per family):**
`sk-proj-AbCdEf1234567890GhIjKl` (openai), `sk-ant-api03-xyz...`, `ghp_16C7e42F294c981765e4321g` (github), `github_pat_11A...`, `xoxb-123456789-abcdef`, `AKIAIOSFODNN7EXAMPLE` (aws), `AIzaSyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q` (google), `glpat-Ab1Cd2Ef3Gh4Ij5Kl6Mn7` (gitlab), `sk_live_abc123def456ghi789` (stripe), `gsk_abc...` (groq), `hf_abc...`, `npm_abc...`, `pypi-AgEIcHlwaS5vcmc...`, `ntn_abc...`, `xai-` + 30 chars, `fw_` + 30, `SG.aBcDeFgHiJkLmNoP.123` (sendgrid), `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.abc...` (jwt), `-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----`, `postgresql://far:Sup3rS3cret@db.example.com/prod` (db-password), `https://ghp_16C7e42F294c981765e4321g@github.com/o/r` (url-userinfo), `Authorization: Bearer eyJ...`, `x-api-key: opaque-1234567890abcdef`, `OPENAI_API_KEY=sk-proj-...`, `"api_key": "..."` (assignment).
Assert: each produces its exact `[REDACTED:<family>]` placeholder; full-text contains zero bytes of the planted secret.

**Unit — false-positive matrix (must pass through UNCHANGED):**
- 40-char git SHA `9a03e8b6d7c5f2a1...` and 64-char sha256 hex (content hashes are FAR-Lab's provenance currency — receipt hashes must never be mangled);
- base64 content blobs ≥100 chars without known prefixes;
- prose: `Bearer of good news`, `the Bearer token concept`, `token_count: 5`, `MAX_TOKENS=8192`, `Secretary: J. Smith`, `tokenizer: cl100k_base`, `sk-short`, `AKIA` alone;
- research URLs with query strings `https://openalex.org/works?filter=...&per-page=10` (no credential-named params);
- `os.getenv('OPENAI_API_KEY')` as an assignment value (code snippet, hermes :191-197).

**Sink-flow tests (leak-before / zero-leak-after):**
1. Provider path (extend `tests/providers.test.ts`, pattern of the existing :439 test): fetch fake returns 401 with body `{"error":{"message":"bad key sk-proj-PLANTED"}}` → assert `res.error.message` matches `/\[REDACTED:openai\]/` and `!includes('PLANTED')`; also 200-malformed body with planted key; also invalid_output whose `lastRawContent` head contains a planted `ghp_` key.
2. Orchestrator path: stub a stage handler that throws `SourceAdapterError` (sources/error.ts) with a planted secret in `message` (+ bodyPreview) → run against a temp-dir sqlite → assert `runs.doc` stages[].error, `lastError`, and the `stage_failed` event payload in `events` all contain the placeholder and none contain the planted bytes (direct `node:sqlite` SELECT on the temp db).
3. API path: force a handler throw with planted secret → assert 500 envelope `{error:{message}}` redacted (api.test.ts harness).
4. CLI path: run status render over a run doc whose lastError contains a planted key → captured stdout contains no planted bytes.
5. Classification-order regression: 429 body `{"error":{"code":1113,"message":"insufficient balance"}}` still classifies `quota_exceeded` (quota regex hit on RAW message — proves redaction did not break control flow), and a 429 whose message contains a planted key AND quota wording classifies correctly AND redacts.

**Placeholder-collision test:** a message already containing `[REDACTED:openai]` is stable under a second `redactSecrets()` pass (idempotence; no rule matches any placeholder).

---

## 7. Risk register (top 3)

1. **Assignment-pattern false positives in research text** (`token:`/`secret:` in YAML-ish model output or citations). Mitigation: codex's narrow keyword set + word boundaries + 8-char value floor + the FP matrix test; if incidents appear, demote to config-file contexts only (hermes `_CFG_*` precedent, redact.py:166-213).
2. **Behavior-change surface from placeholder rename**: existing assertions expect the exact string `[REDACTED_SECRET]` (tests/providers.test.ts:439, 817-822). Switching to `[REDACTED:<family>]` is a deliberate, strengthening change — update those 5 assertions in the same commit; anything external grepping logs for `[REDACTED_SECRET]` (none found in repo) would need the new prefix.
3. **Sources/ bodyPreview latent leak**: 300-char provider bodies ride on `SourceAdapterError` objects (sources/error.ts:47) with no consumer today — one future `console.log(e)` or JSON.stringify of the error leaks it. Redact in the constructor now (cheap) or add a lint/test tripwire; leaving it silent is the worst option.

Licenses: codex Apache-2.0, hermes-agent MIT, aider Apache-2.0 — pattern-level reimplementation in TypeScript with attribution comments is license-compatible.
