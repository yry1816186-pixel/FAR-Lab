---
paths:
  - "**/*.md"
  - "docs/**"
  - "agent/**"
  - ".claude/**"
  - ".pi/**"
  - "**/*.{yaml,yml,json,toml}"
---
# Documentation and configuration rules

- Separate current facts, target design, historical context, hypotheses, decisions, unknowns, and blocked external work.
- Do not duplicate authoritative schemas, enums, commands, or version facts; link to the source of truth.
- Every normative requirement needs a consumer and an acceptance oracle.
- Remove stale or conflicting instructions rather than adding another override.
- Configuration examples must be valid, safe by default, and explicit about platform/version assumptions.
- Never place credentials or private data in examples, logs, templates, or agent memory.
- Long procedures belong in workflows/skills; always-on context files stay concise.
