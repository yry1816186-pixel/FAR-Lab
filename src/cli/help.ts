/**
 * CLI help text (single source of truth, exported so tests can cross-check it
 * against the completion command tree — the 2026-08-24 drift audit found
 * `far memory`/`far backup` shipped without a HELP line and completion missed
 * four real commands; a coherence test now guards both directions).
 */
export const HELP = `far — FAR-Lab research workbench (XH-202619 Track 1 Direction 1A)

Usage:
  far research start <question text> [--domain <d>] [--goal <type>] [--route zai|dashscope|deepseek|universal] [--json]
      Create a research run from a real scientific question and execute the full pipeline.
      --goal: explanatory|predictive|interventional|methodological|exploratory (default explanatory)
  far research status <run-id> [--json] [--watch]  Show run status/stages/progress (no invented percentages)
                                                  --watch: TTY live view, repaints every 2s until a final
                                                  state; Ctrl-C exits (non-TTY: single snapshot)
  far research inspect <run-id> --evidence|--hypotheses|--plan|--sources [--json]
  far research cancel <run-id>                   Request cancellation (checked between stage operations)
  far research resume <run-id> [--stop-after <stage>] [--json]
                                                  Resume a partial/failed run from its persisted checkpoint
  far research export <run-id> --format report|bundle|package [--out <dir>]
                                                  Export report / reproducibility bundle / full package (paper+bib+figures+tables+MANIFEST+RO-Crate; --formats docx,jats,html) to --out (default .far-run/exports)
  far research feedback <run-id> --source <kind> --content <text> [--target-kind <kind> --target-id <id>] [--json]
                                                  Record feedback on a run (source: human_expert|new_literature|new_dataset|
                                                  tool_result|simulation|experiment|reviewer|verification_failure|
                                                  reproduction_failure); consumed causally by the revise stage
  far research lineage <run-id> [--json]         Trajectory graph: revision family, hypotheses, evidence, causal revisions
  far research supervise <run-id> [--json]       Live supervisor analysis: stall/repeat-failure/cycle signals with action hints
  far research counter-search <run-id> --query "<text>"
                                                  Execute ONE researcher-directed counter-evidence search
                                                  against the live sources; grows the corpus (append-only
                                                  snapshot versioning; receipts + events; unverified sources)
  far research fork <run-id> [--reason <text>] [--json]
                                                  Branch a settled run (alternative direction; question referenced, never copied)
  far runs [--json]                              List runs
  far new                                        Interactive wizard (TTY only): prompts for question /
                                                  domain / goal type, then runs the exact same pipeline
                                                  as research start (non-interactive: far research start)
  far serve [--port N] [--host H] [--data-dir D] [--automations off]
                                                  Start the local API server (headless/SSH entry;
                                                  same engine as the web workbench; PORT/HOST env
                                                  also honored; loopback by default)
  far experiment run|enqueue <spec.json> [--priority N] [--allow-local-datasets]
  far campaign run <campaign-spec.json> [--allow-local-datasets]
                                                  RU-8 campaign driver: DAG readiness, stop rules, alpha ledger
                                                  Execute / queue an ExperimentSpec through the
                                                  durable scheduler (real datasets+models+stats)
  far experiment simulate <simspec.json>          Execute a SimulationSpec (CRN/simulator) directly:
                                                  simulate -> mechanical stats -> verdict -> feedback
  far experiment worker [--max-jobs N] [--max-running N]
                                                  Drain queued experiments as a worker
  far experiment status [--job <id>] | cancel <job-id> | logs <experiment-run-id>
                                                  Job/experiment truth: queue state, cooperative
                                                  cancel, content-addressed training logs
  far experiment dead-list | requeue <job-id>     Dead-letter queue for poison jobs: list and
                                                  (bounded) requeue after a crash loop
  far experiment approve <specId> --by <name>     Approve a draft experiment spec (preregistration
  far experiment rerun <specId>                   gate); rerun re-executes an approved spec
  far protocol show <run-id> [--json]             Read the frozen protocol + its human-attested ledger
                                                  (paradigm, planHash, steps, QC, ethics gate)
  far protocol record <run-id> --kind <k> --actor <name>
                                                  Append ONE human-attested record (k: approval|
                                                  step_started|step_completed|measurement|deviation|
                                                  block|unblock|abort; completion auto-publishes
                                                  the outcome as experiment feedback)
  far agent refine <run-id> [--turns N] [--top-k N] [--max-concurrent N] [--json]
                                                  Iterative evidence-gap refinement on a
                                                  completed run: parallel pro/contra literature
                                                  sub-agents + tool-using refinement loop;
                                                  sessions/reports/events fully audited;
                                                  --resume <ags-id> reattaches to a live session
  far probe [provider] [--live] [--json]         Model-route health: config check by default
                                                  (key presence, never values); --live makes one
                                                  minimal real chat call per route (costs ~1 token)
  far probe net [--json]                         Network plane: HTTP(S) proxy / custom CA status +
                                                  real loopback self-test (local TLS + CONNECT proxy;
                                                  no external network contact)
  far mcp list [--json]                          List MCP server integrations (label, enabled, risk, lastTest)
  far mcp add <label> --command <cmd>|--url <u>  Stage an MCP server (DISABLED; review then enable) —
                                                  [--args a,b] [--env K=V,…] [--risk read|edit|execute|destructive]
  far mcp enable|disable <id|label>              Flip an MCP integration after review
  far mcp probe <id|label>                       REAL connectivity check: initialize + tools/list round
                                                  trip; result persisted as the integration's lastTest
  far plugin install <dir>                       Import a reviewed local plugin (far-plugin.json) —
                                                  expands to skills/commands/hooks/MCP, all DISABLED
  far plugin list [--json]                       List plugin-imported integrations
  far probe-custom [mcfg-id] [--live] [--json]   Same health surface for user-defined model configs
                                                  (Settings / mcfg_* routes); --live = one real call
  far data info [--json]                         Data footprint: runs, db size, artifacts, exports
  far data obs [--json]                          Reliability observability: process/storage state,
                                                  per-run recovery phases, workspace error profile
  far ingest <file.(md|tex|csv|…|xlsx|svg)>      Deterministic artifact understanding (SDM or dataset
                                                  profile; PDFs are web-client pdfjs only)
  far inspect <runId> [seq] [--json]             Time-travel projection of a run AS OF an event seq
  far memory <query> [--kind <k>] [--json]       Search the re-audit memory queue (kind:
                                                  episodic|semantic|experiment_outcome|profile)
  far backup [<dest.db>]                         Consistent DB snapshot via VACUUM INTO (never
                                                  overwrites; restore drill: docs/backup-restore.md)
  far verify <bundle-id> [--json]                Independently verify a reproducibility bundle
                                                  (exit 0=verified, 1=failed/degraded)
  far completion <bash|zsh|pwsh>                 Print a static shell completion script (real command
                                                  tree) — pipe into your profile, e.g.
                                                  far completion bash >> ~/.bashrc
  far gc [--apply] [--json]                      Sweep content-addressed artifact blobs nothing
                                                  references anymore (default: dry-run report;
                                                  --apply deletes. Reference truth = objects/runs)

Exit codes: 0 ok, 1 runtime failure, 2 usage error, 3 stale dist (run npm run build),
130 interrupted (Ctrl-C). Diagnostics on stderr.`;
