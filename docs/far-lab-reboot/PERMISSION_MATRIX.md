---
status: reviewed
owner_role: security-and-governance-lead
last_verified: 2026-08-05
scope: target role, agent, service, object, action, condition, audit, and break-glass policy
authoritative_for: [permission row inventory]
evidence_level: D
related_decisions: [DEC-003, DEC-004, DEC-009, DEC-012, DEC-013]
related_requirements: [REQ-SEC-002, REQ-PROD-005, REQ-PRIV-002, REQ-TRUST-004, REQ-TRUST-005, REQ-OPS-003, REQ-OPS-004]
supersedes: []
superseded_by: null
---

# Permission matrix

Decision vocabulary: `ALLOW`, `ASK`, `DENY`, `TWO_PERSON`. Policy evaluation and OS enforcement are separate; an `ALLOW` never widens the sandbox or data classification boundary.

| ID | Actor | Object / action | Condition | Decision | Scope | Audit / break-glass | Required test |
|---|---|---|---|---|---|---|---|
| PM-001 | Anonymous verifier | Public receipt read/verify | disclosure profile public; no sensitive component | ALLOW | named receipt/components | access aggregate; no break-glass | enumeration/redaction |
| PM-002 | Anonymous | Draft/private receipt read | none | DENY | all | denial event rate-limited | IDOR |
| PM-003 | Author | Own draft create/read/update/delete | authenticated/local principal and ownership | ALLOW | project/tenant | mutations audited in shared mode | ownership/tenant |
| PM-004 | Author | Compile | exact policy, disclosure, resource budget accepted | ASK first/new capability | one draft/run | capability grant recorded | consent/idempotency |
| PM-005 | Author | Mutate sealed receipt | any | DENY | receipt bytes | no break-glass; use supersede | immutability |
| PM-006 | Author | Supersede own receipt | reason + corrected draft + expected version | ALLOW | lineage | immutable event/notify | concurrent successor |
| PM-007 | Author | Withdraw governed/public receipt | identity and policy criteria | TWO_PERSON | receipt/declared scope | emergency hide is time-boxed break-glass followed by review | two-person/expiry |
| PM-008 | Invited reviewer | Read disclosed evidence | active invitation and purpose | ALLOW | receipt/case, field-level | all sensitive access logged | invite revoke/redaction |
| PM-009 | Reviewer | Add challenge/evidence statement | no disqualifying conflict | ALLOW | case | attributed append event | role/state |
| PM-010 | Reviewer | Change machine outcome/receipt | any | DENY | all | human review is separate layer | privilege escalation |
| PM-011 | Adjudicator | Resolve/escalate case | independent assignment; rationale required | ALLOW | case | COI and decision audit | separation of duties |
| PM-012 | Independent verifier process | Read package and execute verifier | read-only inputs; no secrets/network by default | ALLOW | isolated workspace | execution manifest | path/egress |
| PM-013 | Worker service | Read inputs/write attempt outputs | valid scoped lease and tenant/run capability | ALLOW | one attempt namespace | service identity, lease, all object operations | confused deputy/cross-run |
| PM-014 | Worker | Host filesystem/network | outside explicit manifest allowlist | DENY | OS boundary | denial telemetry | escape/exfiltration |
| PM-015 | Evidence assistant | Repository/data read | user-selected paths/data class/model route | ASK then ALLOW | session capability | every grant/use visible | prompt injection/secret |
| PM-016 | Evidence assistant | Write draft/evidence suggestion | user-selected draft workspace | ASK | draft only | diff/event; undo | scope/path |
| PM-017 | Evidence assistant | Publish, verdict, withdraw, delete, grant permission | any | DENY | all | no bypass | indirect tool chain |
| PM-018 | Subagent | Tools/data | explicit delegated subset; never greater than parent | ASK/ALLOW subset | task workspace/budget | parent/child trace | privilege inheritance |
| PM-019 | Policy maintainer | Draft policy/profile | named owner | ALLOW | registry draft | signed review proposal | schema/ownership |
| PM-020 | Policy publishers | Activate/withdraw version | independent science + governance approval | TWO_PERSON | one immutable version | signed decision; no content mutation | key/separation/replay |
| PM-021 | Institution admin | Role/invitation/retention config | tenant admin, policy bounds | ALLOW or TWO_PERSON for sensitive | tenant | admin audit | horizontal/vertical auth |
| PM-022 | Support | View operational metadata | ticket + least privilege | ASK/JIT | time-boxed tenant/run metadata | session recording; no raw data by default | expiry/impersonation |
| PM-023 | Security responder | Break-glass sensitive access | declared incident and second approver | TWO_PERSON | time-boxed case | tamper-evident audit + post-review | forced expiry/notification |
| PM-024 | Privacy officer | Export/delete/hold decision | verified request/legal basis | TWO_PERSON for hold/exception | subject/project | rights-case audit | identity/replica/legal hold |
| PM-025 | Release maintainer | Sign/publish candidate | all gates, hardware/workload identity, independent verifier | TWO_PERSON | exact manifest digest | transparency/attestation | wrong digest/key compromise |
| PM-026 | API client | Retry mutation | matching idempotency key, actor, body digest | ALLOW same result | endpoint/resource | conflict on mismatch | replay/race |
| PM-027 | MCP/ACP/A2A peer | Any | v0 | DENY / NOT_APPLICABLE | none | capability unavailable | absence/unknown route |
| PM-028 | Author/data owner | Create disclosure receipt/export | exact source root, disclosure policy, preview and recipient/audience | ASK | named receipt/components/metadata | new root, omission/recipient event; no source mutation | omission/substitution/linkability |
| PM-029 | Reviewer | Open protected commitment/access restricted component | invitation/purpose plus owner/privacy authorization | ASK or TWO_PERSON by class | one value/component/case/time | opening never enters public log; access expiry | unauthorized opening/nonce reuse |
| PM-030 | Trust/archive maintainers | Issue crypto/time renewal | old root/evidence verified; approved new suite; threshold policy | TWO_PERSON | exact root/suite transition | append renewal, public limitation and affected set | wrong root/downgrade/compromise-before-renewal |
| PM-031 | Archive operator | Restore/verify preservation package | approved isolated target and custody purpose | TWO_PERSON for sensitive | named archive/copy | access/fixity/gap report; no automatic current authority | missing dependency/deleted payload/old trust root |
| PM-032 | Local owner/privacy role | Uninstall purge receipts/trust/config/audit | exact dry-run manifest, retention/hold check, second explicit confirmation | ASK; TWO_PERSON for governed data | enumerated local paths only | deletion/residual backup/external-copy report | broad path/symlink/race/hold |
| PM-033 | User/support/SRE | Export diagnostic or enable telemetry | allowlisted preview, purpose/channel, redaction, retention and explicit consent in O/L | ASK | one diagnostic/task or bounded period | schema/drop/redaction/audience audit; no evidence authority | secret/PII/high-cardinality/channel expiry |
| PM-034 | Review participant | Import offline review exchange | package integrity/compatibility, exact subject/version, dedupe key and packaged event's ordinary role permission all pass | ASK then ALLOW mapped event | one review case/event | package digest, actor-identity strength, mapped action and duplicate/no-op audit | tamper/replay/wrong case/stale version/role escalation/hidden payload |

Local single-user mode does not authenticate institutional identity. It must label author assertions as self-asserted and cannot unlock governed public withdrawal, adjudication, or institutional badges.
