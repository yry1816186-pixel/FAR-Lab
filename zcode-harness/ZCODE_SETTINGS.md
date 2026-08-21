# Recommended ZCode Runtime Profile — FAR-Lab

**As-of:** 2026-08-21. Installed account/client behavior wins after upgrades.

## Formal long-horizon build profile

| Surface | Recommendation | Rationale |
| --- | --- | --- |
| Agent | ZCode Agent | native Goal/workspace/tool integration |
| Builder model | GLM-5.3 if available to this user, otherwise user-selected strongest appropriate current model | matches user's chosen builder; do not silently switch |
| Thought Level | deepest/highest for architecture/science/critical debugging; lower only for mechanical low-risk work | concentrate reasoning where it matters |
| Execution mode | **Full Access** in this trusted project when the goal/boundary is clear; **Auto Edit** if command confirmations are desired | current Goal docs recommend these for long goals |
| Plan Mode | use only before Goal when a high-risk/broad approach needs planning/approval; **switch to another execution mode before setting `/goal`** | current Goal docs explicitly reject setting a Goal while Plan Mode is active |
| Goal | enable only when the user explicitly starts the formal long-horizon build | prevents accidental product construction during workspace preparation/audit |

## Workspace instructions

- Keep one authoritative root `AGENTS.md`; do not create nested AGENTS expecting automatic merge.
- Keep FAR-Lab-specific rules out of user-global AGENTS unless the user intentionally wants cross-project behavior.
- After compact/resume: re-read root AGENTS, `.control/EXECUTION_STATE.json`, relevant acceptance/blockers, then only needed specs/policies.

## Plugin

Add/refresh local marketplace: `zcode-harness/` and enable `farlab-control-plane`.

After enable/disable/update, open a **fresh session**, then verify:
- commands visible;
- skills discoverable/triggerable;
- plugin agents visible;
- SessionStart context injection fires;
- destructive Bash guard asks/denies only its intended patterns;
- tool-failure discipline hook fires.

Do not claim runtime verification from Node script tests alone.

## Skills and agents

The bundled set is intentionally small/specialized. Do not add generic coding/debug/testing/planning Skills that merely restate model capabilities. Current ZCode supports foreground parallel subagents and Agent-selected background execution; use them aggressively only when work is independent, mergeable and non-conflicting. Prefer built-in Explore for read-only discovery and general-purpose for isolated executable work; the main Agent retains architecture/integration authority. Do not assume undocumented nested delegation or fixed concurrency limits.

## Hooks

The bundle keeps shared hooks inside the plugin for portable versioned behavior. Current ZCode also supports workspace hooks through `.zcode/config.json` when `hooks.enabled:true`; do not duplicate the same hook across user/workspace/plugin layers without a specific reason.

No Stop hook by default: Goal already manages continuation and Stop continuation is bounded. Add one only for a demonstrated failure class with a finite, non-looping condition.

## MCP

Default: none. Inspect native tools first; add only a gap-filling MCP with source/version/permissions/credentials/trust/failure/fallback reviewed. Never commit credentials.

## Project Memory

Default for this workspace: **off unless a measured session-level benefit justifies enabling it**. Root AGENTS + canonical specs + `.control/` already provide reviewable durable truth. Current ZCode Memory costs extra model work, is machine-local, cannot currently be browsed/cleared from the app, and is not read/written by subagents; therefore it must never own critical decisions/state. If enabled experimentally, treat recalled memories as hints and reconcile them against repository/runtime truth.

## Browser/UI verification

For Web/HCI work, prefer ZCode's built-in browser automation to exercise the actual rendered workflow, responsive/error/empty/loading states and accessibility-relevant behavior. Keep it enabled when available; do not add a separate browser MCP/plugin unless a concrete capability gap is demonstrated.

## Harness economy

`AGENTS` = always-on invariants; `project-spec/policies` = domain-on-demand; Skills = repeated complex methodology; hooks/scripts = deterministic enforcement; `.control` = dynamic truth; `ACCEPTANCE.md` = completion contract. Prune when real sessions show context bloat, false triggers, redundant checks or excessive conservatism.
