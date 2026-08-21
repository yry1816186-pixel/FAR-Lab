---
description: Validate the FAR-Lab ZCode Harness/control plane and its compatibility with the current workspace, then separate offline file checks from actual ZCode runtime registration proof.
skills: verification-audit,mission-orchestration
---

Inspect the actual workspace Harness before running anything. If project-native doctor/test scripts exist, run them and fix real failures rather than assuming historical command names.

Check at minimum:

- root `AGENTS.md` and canonical project-spec are discoverable and non-conflicting;
- `.control` JSON is parseable and its schema/status vocabulary is internally coherent;
- plugin/Skill/Command/Subagent/Hook definitions are structurally valid;
- no duplicate instruction source creates contradictory ownership;
- mission completion semantics distinguish Acceptance Floor from Frontier Gate when required;
- Stop guard cannot hijack bounded conversations unless an explicit mission is active or a premature completion claim is made;
- workspace Harness and plugin do not permanently own the same state or gate with incompatible semantics.

Then distinguish offline validation from runtime proof. In the installed ZCode client, verify the plugin is enabled, its Skills/Commands/Subagents/Hooks are visible, and test in a **new session** because hook configuration is snapshotted at session start. Do not claim runtime verification if only files/Node scripts passed.
