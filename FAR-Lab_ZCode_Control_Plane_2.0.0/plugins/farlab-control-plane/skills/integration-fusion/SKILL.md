---
name: integration-fusion
description: Use when materially integrating, replacing or migrating an external library, service, model, tool, protocol, scientific package, plugin/MCP/Skill, workflow engine or subsystem. Enforce one coherent ownership model, explicit trust/failure/provenance boundaries, migration of real callers and real-path proof.
when_to_use: Any consequential external adoption, subsystem replacement, source extraction, fork/vendor decision, protocol bridge, migration or adapter boundary.
metadata:
  version: "2.0.0"
---

# Integration Fusion

Before implementation define a compact Fusion Contract:

- source/version/commit/license;
- exact reused capability and adoption mode;
- decisive reason it wins over strongest alternatives and internal BUILD;
- integration boundary/API/protocol;
- ownership of state/data/persistence;
- execution/lifecycle/retry/error/cancel/recovery ownership;
- permission/security/trust boundary;
- provenance/observability ownership;
- schema/protocol/version compatibility and upgrade policy;
- migration of callers/data/state;
- old path made obsolete;
- proof required for successful fusion.

Integration is incomplete when two permanent subsystems claim the same authoritative responsibility without an intentional synchronization model.

Verify production path, failure path, timeout/cancellation/retry, upgrade assumptions and provenance. After replacement is proven and callers/state are migrated, remove obsolete duplicate paths whose continued existence creates ambiguity, drift or fake capability.
