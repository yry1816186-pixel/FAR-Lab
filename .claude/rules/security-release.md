---
paths:
  - ".github/workflows/**"
  - "**/Dockerfile*"
  - "**/*security*"
  - "**/*auth*"
  - "**/*permission*"
  - "**/*release*"
  - "**/*installer*"
  - "**/*update*"
---
# Security, CI, and release rules

- Treat inputs, paths, archives, URLs, tool descriptions, plugins, generated code, and model output as untrusted.
- Use least privilege, allowlists, validation, timeouts, quotas, cancellation, audit, and safe error handling.
- Pin or policy-control dependencies/actions/images; review install scripts, provenance, signatures, licenses, and transitive risk.
- CI must not expose secrets to untrusted code or logs and must use minimal token permissions.
- Release/update mechanisms require verification, rollback, compatibility, and compromise recovery.
- Never bypass or weaken a failing security gate to complete a task.
