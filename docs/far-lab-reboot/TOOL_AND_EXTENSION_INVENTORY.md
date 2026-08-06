---
status: reviewed
owner_role: security-and-agent-governance-lead
last_verified: 2026-08-05
scope: target built-in/external tool, skill, plugin, protocol, trust, permission, and lifecycle inventory
authoritative_for: [tool and extension row inventory]
evidence_level: mixed
related_decisions: [DEC-004, DEC-007]
related_requirements: [REQ-ARCH-002, REQ-ARCH-011]
supersedes: []
superseded_by: null
---

# Tool and extension inventory

Status: target trust inventory. `REQUIRED`, `CONDITIONAL`, and `NOT_APPLICABLE` are v0 scope decisions.

| ID | Kind / source / version | Schema and side effects | Permission / data / network | Isolation / trust | Validation | Update / rollback / owner | Scope |
|---|---|---|---|---|---|---|---|
| TE-001 | Built-in structured repository reader / pinned release | paths/ranges → bytes/symbols; read only | selected roots; no network | OS read boundary; files untrusted | path, symlink, size, encoding, secret tests | core release; rollback whole candidate / Platform | REQUIRED |
| TE-002 | Archive/package inspector / pinned | package → inventory/quarantine; temp extraction | selected input; no network | isolated temp; reject traversal/symlink/bomb | malicious archive corpus | core release / Security | REQUIRED |
| TE-003 | Evidence normalizer / profile version | source metadata → canonical entity/edge; no external write | field/data-class policy | pure transformation where possible | property/differential/schema | immutable profile / Data | REQUIRED |
| TE-004 | Scientific runner / image digest | declared command → outputs/logs; arbitrary compute | exact input mount; network deny default | VM/container/namespace with enforced budgets | escape/resource/replay/science tests | signed image + SBOM; rollback digest / Science+security | REQUIRED |
| TE-005 | Shell adapter / no free-form persisted string | argv/cwd/env manifest → bounded process | explicit executable/args; secrets via handles; network separate | worker sandbox; never `shell:true` for stored task | metacharacter/path/env/injection | allowlist/policy version / Security | CONDITIONAL |
| TE-006 | Citation/reference resolver / exact provider snapshot | identifier → metadata/snapshot | explicit egress domains; no raw dataset upload | proxy and response quarantine | poisoning/SSRF/citation drift | provider version/cache provenance / Science | CONDITIONAL |
| TE-007 | Model provider adapter / model+API revision | prompt/tool stream → suggestions; may transfer data | explicit data route, budget, DPA; deny by default for sensitive | outside trust root; outputs untrusted | provider contract, redaction, outage, tool poisoning | pinned config; no silent fallback / Agent | CONDITIONAL |
| TE-008 | Receipt compiler / policy+schema version | draft → canonical receipt candidate | local data; no network required | deterministic service | golden/property/mutation | immutable versions / Trust | REQUIRED |
| TE-009 | Independent verifier / separate implementation+version | package/profile → per-property report; read only | network off except explicit anchor | clean-room environment and separate dependency graph | tamper/downgrade/differential | archived binary/source / Independent trust | REQUIRED |
| TE-010 | Signature/attestation adapter / scheme profile | digest + identity → signature/bundle; external identity effect | signer authorization; optional transparency log | hardware/workload identity; key separation | wrong identity/audience/time/log/offline | root rotation/revocation plan / Release+trust | REQUIRED before external Alpha |
| TE-011 | Object/event store adapter / schema version | durable CRUD/append | tenant/run capability; no public endpoint | encryption, constraints, transaction/outbox | isolation/idempotency/restore | migration/rollback plan / Data+platform | REQUIRED |
| TE-012 | Notification adapter / provider version | event → redacted message; external send | consent, recipient allowlist | queue + dedupe; content minimized | misdelivery/retry/template/accessibility | disable switch / Service | CONDITIONAL |
| TE-013 | Agent Skill / project-signed package | `SKILL.md` + optional assets/scripts | metadata discovery only until explicit invocation; scripts inherit tool policy | never an enforcement/evidence boundary | schema, provenance, license, behavior/security review | content digest, version, revoke/rollback / Agent gov | DEFERRED |
| TE-014 | MCP client/server / current stable spec pinned if adopted | external tools/resources | separate OAuth audience/scope/capability | host sandbox required; protocol is not safety | conformance + confused-deputy/poisoning | version/deprecation gateway / Architecture | NOT_APPLICABLE v0 |
| TE-015 | ACP client/agent | schema version pinned if adopted | editor/session/files/terminal | client enforces permissions; protocol not sandbox | conformance + permission UX | compatibility matrix / Architecture | NOT_APPLICABLE v0 |
| TE-016 | A2A client/server | protocol version pinned if adopted | remote agent/task/artifact | federated identity, authz, webhook security | TCK + cross-org threat tests | version negotiation / Architecture | NOT_APPLICABLE v0 |
| TE-017 | Hooks/plugins | no generic runtime in v0 | lifecycle code can mutate/egress | deny unless installed/admin-reviewed and sandboxed | supply-chain/adversarial lifecycle tests | signed catalog and kill switch / Security | NOT_APPLICABLE v0 |

Every executable extension requires origin, exact digest, signer/maintainer, license, transitive dependencies/SBOM, data classes, network destinations, capabilities, human review, tests, supported versions, deprecation, kill switch, and affected-receipt query. Popularity or marketplace presence is not trust evidence.
