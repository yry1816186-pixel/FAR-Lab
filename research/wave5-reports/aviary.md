# Wave-5 Report — Future-House/aviary (agent framework under paper-qa/Robin)

License: Apache-2.0 (verified). Source: `.cache/repos/aviary` (112 files; core `src/aviary/`
+ per-domain env packages under `packages/`). Report by main agent (subagent rate-limited);
refs read-verified.

## What aviary is

A **gymnasium for language-agent RL environments**: `Environment` = stateful place where
agents use tools (`src/aviary/env.py:98-121` — `tools: list[Tool]`, `state`, abstract
`step(action) -> (Messages obs, reward, done, truncated)`); `Frame` = snapshot of state+info
with deepcopy control (`env.py:44-95`); prebuilt env packages (gsm8k, hotpotqa, labbench,
lfrqa, notebook, paper-qa hosted as env). Sister library LDP defines agents as Language
Decision Processes for RL training.

## Verdict: mostly 不适用 for FAR-Lab Direction-A — record and move on

- **RL env/training loop** (reward signals, LDP): FAR-Lab is not training agents — the
  whole gymnasium/RL frame does not apply. Soul boundary also pushes back: FAR-Lab's
  scientific loop is not an RL environment.
- **Environment/step abstraction** as a Direction-B adapter interface: the *shape*
  (state + tools + step + done) is the same shape Robin's `MultiTrajectoryRunner` implements
  more concretely (see robin.md §2); Robin's version is closer to FAR-Lab's needs
  (upload artifact → run → download artifact → status records) than aviary's RL-flavored one.
  **不适用当下**；若未来 Direction-B 仿真适配器需要统一抽象，优先参照 robin.md #4。
- **ToolRequestMessage/ToolResponseMessage** message protocol (`src/aviary/tools`):
  FAR-Lab already has strict-FC transport with zod schemas + receipts — 已有更强.
- **dataset_server** (serving datasets to envs): 不适用.

## Sub-mechanisms recorded (low priority)

| dim | mechanism | file:line | verdict |
|---|---|---|---|
| D1 | `Frame` state snapshot with explicit deepcopy control (mutable vs immutable state discipline) | src/aviary/env.py:44-95 | 记档 — FAR-Lab store objects are immutable-by-practice; no port |
| D1 | `maybe_wait_for(future, timeout)` — uniform optional-timeout await helper | env.py:60-64 | 已有等价（orchestrator stage timeouts） |
| F | per-domain env packaging (one pip package per environment family) | packages/* | 不适用（无插件生态需求，最小架构） |

## Rejection notes

- Adopting aviary as a runtime framework: violates zod-only invariant (pydantic+Python),
  wrong paradigm (RL), and would add complexity FAR-Lab's linear stage machine does not need.
- The value of the Future-House family for Wave-5 was concentrated in paper-qa (citation
  anchoring) and robin (loop interfaces) — both extracted separately.

**Bottom line**: nothing ported; documented to prevent re-expedition.
