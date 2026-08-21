---
name: integration-fusion
description: Use when materially integrating/replacing an external library, service, model, tool, protocol or subsystem. Enforce one ownership model, failure/provenance boundaries and real-path proof.
when_to_use: Any material external integration, subsystem replacement, source extraction, migration, or adapter boundary.
metadata:
  version: "1.0.0"
---

# Integration Fusion

Before implementation define a Fusion Contract:

- source/version/license;
- exact capability and adoption mode;
- why this wins over strongest alternatives and BUILD;
- integration boundary/API/protocol;
- owner of state/data/persistence;
- owner of execution/lifecycle/retries/errors/cancellation/recovery;
- permission/security/trust boundary;
- provenance/observability;
- schema/version compatibility and upgrade policy;
- migration of callers/data/state;
- old path made obsolete;
- proof required for successful fusion.

Implementation is incomplete if two permanent subsystems claim the same authoritative responsibility without an intentional synchronization model.

Verify the real production path, failure path, timeout/cancellation/retry behavior and upgrade assumptions. After replacement is proven and migration is complete, remove obsolete duplicate paths when their continued existence creates ambiguity or fake capability.
