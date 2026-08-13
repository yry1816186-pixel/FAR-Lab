---
paths:
  - "**/migrations/**"
  - "**/schema/**"
  - "**/schemas/**"
  - "**/*.sql"
  - "**/*database*"
  - "**/*storage*"
---
# Data, schema, and migration rules

- Identify the authoritative schema and generated/tested projections before editing.
- Preserve atomicity, crash consistency, idempotency, concurrency/locking behavior, and audit requirements.
- A migration needs preconditions, backup/restore assumptions, compatibility window, dry run, observability, rollback or forward-fix strategy, and failure recovery.
- Test empty, typical, large, corrupt, duplicate, partially migrated, old-version, and interrupted states.
- Do not allow the database, exporter, UI, or agent state to become a second source of scientific truth.
- Resolve immutable-audit versus privacy deletion requirements explicitly rather than hiding the conflict.
