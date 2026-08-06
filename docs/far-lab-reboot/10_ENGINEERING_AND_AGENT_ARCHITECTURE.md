---
status: reviewed
owner_role: principal-architecture-council
last_verified: 2026-08-05
scope: canonical architecture decisions and mapping to component, interface, agent, tool, and extension specifications
authoritative_for:
  - target system shape
  - dependency and trust boundaries
  - deployment profiles
  - agent and protocol inclusion decisions
evidence_level: mixed
related_decisions: [DEC-003, DEC-004, DEC-005, DEC-007, DEC-008]
related_requirements: [REQ-ARCH-001, REQ-ARCH-002, REQ-ARCH-011, REQ-SEC-001]
supersedes: []
superseded_by: null
---

# 10 — Engineering and agent architecture

## 1. Architecture verdict

Use a **local-first modular monolith with a separate OS-isolated execution worker and an independently implemented offline verifier**. CLI, API and Web project the same application/domain state machines. The optional agent is an untrusted evidence-assembly adapter outside the deterministic decision and receipt trust roots. Hosted multitenancy, distributed microservices and broad agent protocols are deferred.

This is the decision-level architecture. `06_TARGET_ARCHITECTURE.md` owns detailed component/state/event/agent contracts; `05_CLI_API_CONTRACT.md` owns CLI/API wire behavior; `AGENT_RUNTIME_MATRIX.md`, `PERMISSION_MATRIX.md` and `TOOL_AND_EXTENSION_INVENTORY.md` own line-item policy.

## 2. Component and dependency view

```text
Static viewer       CLI adapter       Local Web
       \               |               /
        \------ versioned API/application ------/
                   |           |
          domain state/policy  task coordinator
                   |           |
     canonical receipt/evidence|event stores
                   |           |
        deterministic kernel   isolated worker
                   |           |
             exporter       execution attestation
                   |
       independently implemented offline verifier

Optional agent → candidate material/tool proposals → human acceptance
               (never direct verdict/seal/distribute/delete authority)
```

Dependency direction: presentation/adapters → application ports → domain/policy → canonical primitives. Storage, provider, worker, signing, network and protocol clients implement outbound ports. The kernel imports no Web/API/CLI, model, database, network or agent code. The verifier is built from the published receipt contract and vectors, not simply the producer's core library.

## 3. Deployment profiles and gates

| Profile | Shape | Data/network | Authority | Status/gate |
|---|---|---|---|---|
| L Local | One owner, loopback only, local store, separate unprivileged worker | Offline default; explicit resolver destinations | Filesystem owner + local trust store | Initial target; still requires isolation and clean candidate |
| O Offline verifier | Read-only package/static viewer/independent CLI | No network; no author DB/service | Explicit offline trust store/policy cache | Initial target; core independence test |
| I Institution-private | Authenticated service, scoped users/projects, worker pool | Private deployment with governed egress | Tenant/resource authorization, separation of duties | Disabled until G5 and explicit ADR |
| H Hosted multi-tenant | Managed control/data plane and tenant workers | Cross-organization data/processors | Full tenancy/legal/SRE/on-call | Not approved; separate product decision after pilots |

Fail closed if the selected isolation or loopback/identity profile cannot be enforced. Docker image presence or subprocess timeout is not proof of isolation.

## 4. Domain and application boundaries

| Boundary | Owns | Invariant |
|---|---|---|
| Receipt domain | drafts, immutable seal, assurance vector, lineage, lifecycle | Published bytes never mutate; every successor/withdrawal is linked |
| Policy/science domain | profiles, FEC, checks, applicability, refusal, detector cards | Exact version/digest/input/plan/deviation binding; no LLM override |
| Evidence/provenance domain | materials, typed edges, transformations, attestations | Every derived result resolves to immutable inputs or explicit gap |
| Review/governance domain | requests, challenges, human review, appeal, conflict | Human statement distinct from machine state; due-process permissions |
| Task application | task/attempt/idempotency/events/cancel/retry | Terminal attempts immutable; incomplete work never reports success |
| Verification application | inspect, verify, replay, trust policy | Inspect is non-executing; replay separately approved/isolated |
| Rights/operations | export, retention, deletion, hold, backup/restore | Exact authority/scope and honest residual-copy status |

All commands/endpoints call these application operations. Adapters cannot query global “latest” records, assemble verdicts or bypass permission checks.

## 5. Storage, concurrency and events

- Canonical IDs (`projectId`, `claimId`, `runId`, `taskId`, `attemptId`, `receiptId`, `reviewId`, `actorId`) are schema constraints and authorization scopes, not optional labels.
- Transactional relational storage holds mutable workflow metadata/state; content-addressed object storage holds immutable bytes; append-only audit records control-plane decisions. Local implementation may use one embedded database and filesystem while preserving logical boundaries.
- Atomic seal uses temporary content, fsync/commit as applicable and re-verification before one receipt becomes `SEALED`; export/distribution appends a separate event. Partial output is never a receipt or current distribution.
- Optimistic expected-version/ETag and idempotency keys govern mutation; retry makes a new attempt but not a duplicate receipt/event.
- Domain events, security audit and telemetry are separate schemas/stores/retention classes. Logs/metrics do not become receipt evidence, and audit avoids raw sensitive payloads.

## 6. Isolated worker

The execution worker receives a manifest of immutable read-only inputs, approved executable/workflow digest, environment image/root digest, seed/parameters, output paths and enforced CPU/memory/process/time/filesystem/network budget. It has no service/database credentials and cannot seal/distribute a receipt or choose a scientific result. Outputs return by a narrow content-addressed channel with an execution attestation.

Required controls: unprivileged identity; fresh workspace; no host mounts except declared read-only inputs/output exchange; archive/path/symlink defenses; deny egress by OS boundary; process count and resource limits; timeout/kill process group; deterministic environment/time/randomness policy where possible; secret-free environment; image/dependency pinning; cleanup verification. If unavailable, only an explicitly named `trusted-local-code` mode may run and its assurance is degraded.

## 7. CLI, API and Web architecture

- CLI is the initial reference projection and supports stable JSONL, exit codes, signals, dry-run, stdin/stdout hygiene and offline behavior.
- HTTP v2 uses resource nouns and `202` durable tasks for long work; event stream has sequence/cursor/reconnect, with polling fallback. Authentication and object authorization are separate.
- Web consumes public application/API contracts; it does not import storage/kernel internals or simulate task progress. Static viewer contains no active external content.
- Consumer-driven golden scenarios assert state/reason/scope parity across all enabled surfaces.

## 8. Optional agent runtime

Agent modes are `OFF` (default), `READ_ONLY_ASSEMBLY`, `PROPOSE_TOOL_ACTION`, `APPROVED_LOCAL_ACTION`, and future `EVALUATION_ONLY`; none can emit authoritative scientific verdicts.

Each session pins model/provider, system/policy version, permitted workspace, data class, tools, network destinations, token/turn/time/cost budget and termination. Context records source/trust/version and visibly reports omission/compaction; stale/conflicting context is surfaced. Session history and memory are diagnostic untrusted data, not receipt evidence. Memory is off by default for sensitive material.

Tool calls use schema-validated arguments and one deterministic deny-over-ask-over-allow policy for file/process/network/data/seal/distribution actions. Events include proposal, policy decision, human decision, start/result, truncation, retry and terminal reason. Low-level SDK/tool paths cannot bypass policy. Subagents and multiagent work are not in v0; if later allowed, each has independent scope/budget and outputs are reviewed before merge.

## 9. Tools, skills, plugins and protocols

Initial trusted catalog is deliberately small: read-only file inventory/hash, safe structured parsers, canonicalizer, deterministic policy/check evaluator, package exporter and independent verifier. Isolated scientific execution is high-risk and separately approved. Shell-string scheduler, arbitrary network/browser, automatic dependency install and host execution are prohibited.

Every external tool/skill/plugin records source/digest/version/signature, license/SBOM, schema, side effects, path/network/data scope, isolation, tests, revocation and affected receipts. Tool/skill output retains untrusted provenance and never becomes a kernel rule without governed promotion.

Protocol decision:

- MCP (tool/context), ACP (editor–agent), A2A (remote agents/tasks): `NOT_APPLICABLE` to v0;
- Agent Skills: `DEFERRED` packaging option outside trust root;
- file receipt + CLI JSONL + HTTP API: initial interoperability.

Reopen only when at least three pilot users share a blocking use case, the exact version/capability mapping is fixed, identity/permission/provenance semantics remain lossless, security/conformance tests exist and removal is possible.

## 10. Compatibility and evolution

Use independent semantic versions for receipt/profile/policy/canonicalization/verifier/API/CLI-event/task-event schemas. Unknown critical receipt fields/major versions fail closed. Additive API fields remain ignorable only when declared noncritical. V1 is read-only degraded legacy; migration creates linked V2, never fabricated assurance.

Evolution triggers, not speculative components:

| Trigger | Candidate change | Required evidence |
|---|---|---|
| Embedded DB/worker misses 10× pilot SLO or isolation | Separate service/queue/storage | Load/fault evidence + ADR + migration/rollback |
| ≥3 pilots blocked by editor/tool/federation interop | ACP/MCP/A2A adapter | Protocol threat model, conformance, permission/identity mapping |
| Agent crossover study passes | Enable optional assembly mode | No increase in critical omission/unsafe action; audit and kill switch |
| Institution pilots approved | Profile I identity/tenancy/admin | Authz/isolation/privacy/SRE/legal/ownership gates |
| New scientific profile proposed | New policy/method package | Demand, experts, data, preregistration, independent validity/correction study |

## 11. Architecture acceptance and limits

Accept only after dependency/static checks, cross-surface golden scenarios, run/tenant concurrency isolation, task crash/idempotency tests, hostile worker escape/egress/resource tests, receipt tamper/downgrade vectors, independent offline verifier, migration/restore drill and agent-off complete workflow all pass on one immutable candidate.

The architecture cannot prove input truth, source completeness, signer honesty, policy validity, absence of undiscovered vulnerabilities, scientific causality or user demand. It is designed to keep those limitations observable and prevent weaker evidence from silently becoming a stronger claim.
