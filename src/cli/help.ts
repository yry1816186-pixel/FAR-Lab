/**
 * CLI help text (single source of truth, exported so tests can cross-check it
 * against the completion command tree — the 2026-08-24 drift audit found
 * `far memory`/`far backup` shipped without a HELP line and completion missed
 * four real commands; a coherence test now guards both directions).
 */
export const HELP = `far — FAR-Lab research workbench (XH-202619 Track 1 Direction 1A)

Usage:
  far research start <question text> [--domain <d>] [--goal <type>] [--json]
      Create a research run from a real scientific question and execute the full pipeline.
      --goal: explanatory|predictive|interventional|methodological|exploratory (default explanatory)
  far research status <run-id> [--json] [--watch]  Show run status/stages/progress (no invented percentages)
                                                  --watch: TTY live view, repaints every 2s until a final
                                                  state; Ctrl-C exits (non-TTY: single snapshot)
  far research inspect <run-id> --evidence|--hypotheses|--plan|--sources [--json]
  far research cancel <run-id>                   Request cancellation (checked between stage operations)
  far research resume <run-id> [--stop-after <stage>] [--json]
                                                  Resume a partial/failed run from its persisted checkpoint
  far research export <run-id> --format report|bundle [--out <dir>] [--json]
                                                  Export human report / reproducibility bundle to --out (default .far-run/exports)
  far research feedback <run-id> --source <kind> --content <text> [--target-kind <kind> --target-id <id>] [--json]
                                                  Record feedback on a run (source: human_expert|new_literature|new_dataset|
                                                  tool_result|simulation|experiment|reviewer|verification_failure|
                                                  reproduction_failure); consumed causally by the revise stage
  far research lineage <run-id> [--json]         Trajectory graph: revision family, hypotheses, evidence, causal revisions
  far research supervise <run-id> [--json]       Live supervisor analysis: stall/repeat-failure/cycle signals with action hints
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
                                                  Execute / queue an ExperimentSpec through the
                                                  durable scheduler (real datasets+models+stats)
  far experiment worker [--max-jobs N] [--max-running N]
                                                  Drain queued experiments as a worker
  far experiment status [--job <id>] | cancel <job-id> | logs <experiment-run-id>
                                                  Job/experiment truth: queue state, cooperative
                                                  cancel, content-addressed training logs
  far agent refine <run-id> [--turns N] [--top-k N] [--max-concurrent N] [--json]
                                                  Iterative evidence-gap refinement on a
                                                  completed run: parallel pro/contra literature
                                                  sub-agents + tool-using refinement loop;
                                                  sessions/reports/events fully audited
  far probe [provider] [--live] [--json]         Model-route health: config check by default
                                                  (key presence, never values); --live makes one
                                                  minimal real chat call per route (costs ~1 token)
  far probe-custom [mcfg-id] [--live] [--json]   Same health surface for user-defined model configs
                                                  (Settings / mcfg_* routes); --live = one real call
  far data info [--json]                         Data footprint: runs, db size, artifacts, exports
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
