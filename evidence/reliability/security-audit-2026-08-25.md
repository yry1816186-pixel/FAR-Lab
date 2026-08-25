# Lane 13 Security Audit — 2026-08-25

Independent red-team sweep of the baseline tree (47cc373 + ported residue b234c9e)
against the lane mandate's threat list. Method: read the production code paths,
then **reproduce every finding through real code** (`spikes/security-redteam.mjs`,
exit 0, 4/4 REPRODUCED → `security-redteam.json`). Findings are handed off to their
owning lanes; nothing in another lane's files was modified.

## Threat-model control map (mandate item → verified control → file:line)

| Threat (lane mandate) | Control found & verified | Status |
|---|---|---|
| Prompt/indirect injection from papers/web/data | Kernel transcript marks external content `untrusted:true` (loop.ts:32 system discipline + loop.ts:491); RU-3 T3 embed detector denies effectful args embedding untrusted slices (loop.ts:411, `argsEmbedUntrusted` loop.ts:524); exfil canary + secret tripwires at BOTH boundaries (exfil-guard.ts, wired loop.ts:379/396 + llm.ts:116); per-request untrusted-data fence at the transport layer (SECURITY.md) | VERIFIED (with F-1 carve-out below) |
| Malicious tool/MCP/plugin | Plugin import: local-dir only, no network fetch, staged DISABLED, `reviewed:true` honesty gate (import.ts:121-136); entry containment (host-main.ts loadPluginEntry); subprocess host w/ 30s/2s timeouts, documented NOT-a-sandbox trust model; permission engine strictest-wins fail-closed (permissions.ts:85-127); explore mode denies non-read | **GAP F-1** (riskClass self-declaration) + F-5 |
| Generated-code/shell injection | TS static gate E-ESCAPE (dunder/import-surface) + Python AST mirror, fail-closed BEFORE any spawn (exploration-runner.ts:53-61, exploratory-codeact.ts:104+); regression tests in tree | VERIFIED |
| Path traversal | Static file serving: per-segment `..`/sep/NUL/`:` rejection + containment (api.ts:198-208); artifact refs strict sha256 regex before any path join (artifacts.ts:26-28); plugin entry containment (host-main.ts) | VERIFIED |
| SSRF / exfiltration | Exfil tripwires (secrets/canary/2MB ceiling) fail-closed at model plane + tool boundary (see above); loopback-only default bind (main.ts:23); DNS-rebinding + Origin + JSON-content CSRF guards (api.ts:2038-2048); 1MB body cap (api.ts:114,315) | VERIFIED (F-3 for non-loopback override) |
| Secrets | env-pattern collection ≥16 chars (exfil-guard.ts:32-46); redaction at persistence chokepoint; apiKey masked in every CLI/API projection (`maskApiKey`); secret-scan gate; SECURITY.md key discipline | VERIFIED |
| Auth/session | None by design: single-user local product, loopback bind + Host/Origin guards are the boundary | VERIFIED as documented posture (F-3 hardening) |
| Dependency/plugin supply chain | Zero runtime deps core (DEPENDENCY_POLICY.md); lockfile-pinned; plugin = reviewed local dir; tracked harness secret-scan | VERIFIED |
| Malicious artifacts (ingest parsers) | Parsers (docx/pptx/epub zip+XML substrate) are lane-05 residue NOT yet in this baseline | **F-2 handoff** (caps to prove at fusion) |
| Resource exhaustion | 8-channel governance map w/ live enforcement (resource-governance.md); token/money/time/disk/memory/CPU/network/GPU budgets; 1MB API body cap; tool timeouts | VERIFIED |
| Agent permission audit (independent) | Single tool-dispatch choke point: loop.ts:405 is the ONLY `permissions.decide` site; refine + conversation-agent both inject their engine into the loop; no direct tool-call HTTP route (rg verified) | VERIFIED structurally (CP-C3) — F-1/F-5 are the two carve-outs |

## Findings (reproducible, handed off)

### F-1 — MCP/plugin riskClass is attacker-declarable and load-bearing (→ lane 09; medium)
`manifest.ts:56` accepts any riskClass for an MCP server (default 'execute' only on
omission); `import.ts:103` passes it through; `mcp-manager.ts:161` registers tools
with it; from there the class decides (a) explore-mode auto-allow vs deny
(refine.ts:299 admission trusts the DECLARED class), (b) whether the RU-3 T3
untrusted-embed guard applies at all (loop.ts:411 exempts 'read'). Proofs
F1a/F1b/F1c: a plugin declaring `read` gets auto-allowed effectful calls with no
ask and no embed guard. Compensating control today: human review at import+enable.
Fix: execute-floor plugin-declared server riskClass at import expansion (or drop
the field from manifests). Handoff: `r2-2026-08-25-from-13-to-09-mcp-riskclass-floor.md`.

### F-5 — conversation-agent blanket allow ignores risk classes (→ lane 08; hardening)
`conversation-agent.ts:336` maps EVERY registered tool name to an unconditional
allow rule. Today's registry is read tools + propose_action (safe by
construction), but one future registration of an execute-class tool becomes a
silent unconditional allow (proof F5). Fix: key the allow expansion on
`registry.get(name).riskClass === 'read'` (or propose_action), so anything else
falls to defaultEffect deny. Handoff: `r2-2026-08-25-from-13-to-08-conversation-allow-floor.md`.

### F-3 — non-loopback bind is silent (→ lane 12; low)
`main.ts:23` honors `HOST`; `HOST=0.0.0.0` binds an unauthenticated API on all
interfaces with no warning. Fix: refuse non-loopback HOST unless
`FARLAB_ALLOW_REMOTE=1` is set, and log the exposure. Handoff:
`r2-2026-08-25-from-13-to-12-host-bind-guard.md`.

### F-2 — ingest parser resource caps must be proven at fusion (→ lane 05; note)
The zip/XML substrate (docx/pptx/epub/svg) is lane-05 residue not in this
baseline. At fusion, prove: entry-count + decompressed-size caps (zip bomb),
entry-name containment on extraction, XML entity/expansion limits. Handoff note:
`r2-2026-08-25-from-13-to-05-ingest-resource-caps.md`.

## In-lane fixes landed this audit

- `src/app/observability.ts` classifyError: unwraps one guarded `.cause` hop
  (real undici DNS failures classify `network_error`, not the provider fallback)
  and maps `SourceAdapterError(kind='network')` (retrieval transport outages) to
  `network_error`. Locked by 2 new tests in `tests/reliability-observability.test.ts`
  (15/15 green).
- `spikes/reliability-faults.mjs` case 10 `dns-resolution-failure`: closes the
  residue handoff's honest boundary #1 offline — EAI_AGAIN through the REAL http
  core in the real undici cause shape (transport: fail-visible `provider_error`,
  0 blind retries per W1 discipline, clean recovery), taxonomy: direct errno +
  cause-carried errno + source-adapter shape all `network_error`/retryable.
  10/10 cases PASS (see `faults.json`).

## Verified-good (no action)

DNS-rebinding/Origin/CSRF-content guards; static traversal guard; artifact ref
strictness; plugin entry containment + disabled staging + reviewed gate; exfil
tripwires wired at both boundaries; E-ESCAPE fail-closed-before-spawn; permission
engine strictest-wins/fail-closed/exact-context grants; refine MCP admission
flooring (given truthful declarations); single permission choke point; API body
cap; subprocess timeouts.

## Honest boundaries

- No live-network fault was injected (workspace no-live rule); DNS failure was
  proven at the transport seam with the exact error shape a real resolver
  failure produces. Real-socket behavior remains BLOCKED-live.
- Remote-executor faults (SSH reset/container death) remain gated on the Docker
  target (user-gated, unchanged from the residue handoff).
- The audit read lanes' code on THIS baseline; residues fusing later (ingest,
  model-plane) get their red-team pass at fusion (F-2 records the ingest one).
