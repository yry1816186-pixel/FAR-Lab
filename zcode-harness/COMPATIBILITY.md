# ZCode Compatibility Baseline

**Rechecked:** 2026-08-21 against current official ZCode docs. Revalidate after ZCode upgrades; observed installed behavior outranks this file.

## Verified design assumptions

1. ZCode reads the user-global `~/.zcode/AGENTS.md` and current Workspace-root `AGENTS.md`; it does not recursively merge child AGENTS files or auto-load arbitrary policy files.
2. Goal mode stores a long-horizon session objective/control loop, verifies the objective after every round, automatically starts another round while the goal is unmet, and preserves Goal state across pause/session reopen. It stops advancing when verification passes, the user pauses/clears it, or its usage budget is reached.
3. Current Goal docs explicitly state **Plan Mode conflicts with Goal** because Plan is non-executing planning while Goal auto-continues execution. Finish/exit Plan Mode before setting `/goal`. For long goal-driven work, current docs recommend **Full Access or Auto Edit** to reduce interruptions; Confirm Before Changes is also valid when the user wants approvals.
4. A plugin can package commands, skills, agents, hooks and MCP. Preferred manifest is `.zcode-plugin/plugin.json`; standard paths include `commands/`, `skills/<name>/SKILL.md`, `agents/`, `hooks/hooks.json` and optional `.mcp.json`.
5. Local marketplaces are supported. This workspace uses `zcode-harness/marketplace.json` with plugin source under `zcode-harness/plugins/`.
6. Hooks can run from:
   - user config `~/.zcode/cli/config.json` with `hooks.enabled: true`;
   - workspace config `<workspace>/.zcode/config.json` with `hooks.enabled: true`;
   - enabled plugin `hooks/hooks.json` (auto-discovered).
   Execution order is user -> workspace -> plugin; user/workspace hook configs are concatenated, not “project ignored”.
7. Hook configuration is snapshotted when a session starts. After editing/toggling hooks/plugins, verify in a **new session**.
8. Current Hook protocol used by this bundle:
   - input is one JSON line on stdin;
   - valid JSON stdout begins with `{`;
   - `PreToolUse` uses `hookSpecificOutput.permissionDecision` (`allow`/`ask`/`deny`), reason and optional full `updatedInput`;
   - `SessionStart`/`PostToolUseFailure` can inject `additionalContext` via `hookSpecificOutput`;
   - Stop continuation is bounded (current docs: at most 3 consecutive continuations). This Harness intentionally has no Stop hook.
9. ZCode currently documents built-in `general-purpose` (broad tools) and `Explore` (read-only research) subagents, plus foreground parallel and Agent-selected background execution. Plugins may ship `agents/*.md`; Settings-created custom subagents are currently user-level/Beta. Use documented foreground/background execution when it materially improves throughput, but do not assume undocumented nested delegation or exact concurrency limits without runtime verification.
10. Workspace MCP, when needed, uses current ZCode configuration/schema; plugin MCP may be bundled through the plugin mechanism. This bundle adds no MCP by default because no demonstrated gap currently requires one.
11. Skills/commands/agents are not “verified loaded” merely because their files validate offline. Actual plugin discovery/enabling/triggering must be confirmed in the user's ZCode runtime and fresh session.
12. ZCode Project Memory is optional, off by default, machine-local and main-conversation-only; current docs note extra token/model work and no in-app browse/clear. This workspace therefore keeps critical truth in versioned files/`.control/`, never Memory.
13. ZCode ships a built-in `zcode-configuration-guide` Skill plus configuration diagnostics. When installed behavior differs from this bundle, prefer current built-in/official diagnostics and observed runtime over adding speculative compatibility files.
14. ZCode built-in browser automation can verify rendered user flows. Prefer it for Web/HCI verification before adding overlapping browser tooling.

## Official docs used

- `https://zcode.z.ai/en/docs/agents`
- `https://zcode.z.ai/en/docs/goal`
- `https://zcode.z.ai/en/docs/plugin`
- `https://zcode.z.ai/en/docs/skill`
- `https://zcode.z.ai/en/docs/commands`
- `https://zcode.z.ai/en/docs/subagents`
- `https://zcode.z.ai/en/docs/hooks`
- `https://zcode.z.ai/en/docs/mcp-services`

If installed behavior differs: record the exact version/observation in `.control/DECISIONS.jsonl`, adapt the Harness, and avoid preserving stale compatibility folklore.
