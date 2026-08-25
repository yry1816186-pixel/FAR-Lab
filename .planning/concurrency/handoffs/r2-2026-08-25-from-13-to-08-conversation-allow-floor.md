# Handoff: conversation-agent blanket allow should key on riskClass (F-5) — 13 → 08

- **From:** lane 13 (reliability-security) · **To:** lane 08 (agent-kernel)
- **Urgency:** hardening (latent, not currently exploitable — today's registry is
  read tools + propose_action only)
- **Status:** RESOLVED on lane 13 (user-authorized cross-lane fix, 2026-08-25):
  `conversationAllowRules(tools)` exported from `conversation-agent.ts` keys the
  allow expansion on `riskClass === 'read'`; everything else falls to the
  fail-closed default. Regression: `tests/conversations.test.ts` R2-13 F-5 case
  (execute-class + undeclared tools denied on the real engine); fix-verification
  `spikes/security-redteam.mjs` fix-F5 PASS. **Lane 08: verify at fusion** — your
  branch also modifies this file (prompt/turn-area hunks, non-overlapping with
  the PermissionEngine construction; expected to auto-merge — Integrator decides).
- **Evidence:** `spikes/security-redteam.mjs` (fix-verification edition, 4/4);
  `evidence/reliability/security-audit-2026-08-25.md` §F-5.

## Requested change

`src/server/conversation-agent.ts:335-338` builds the kernel PermissionEngine as:

```ts
const permissions = new PermissionEngine({
  rules: tools.names().map((name) => ({ tool: name, effect: 'allow' as const })),
  defaultEffect: 'deny',
});
```

Every registered tool name becomes an unconditional allow. Safe today only
because the conversation registry happens to contain read-class tools plus
`propose_action` (the human-approval mechanism itself). The construction cannot
see risk classes, so ANY future registration of an execute/edit-class tool into
the conversation kernel (a plausible step on the resident-agent roadmap, where
the conversation becomes the single main entry point) silently becomes an
unconditional allow in default mode — proof F5 drives the real engine with
exactly this rules shape plus one `mcp_shell_exec` entry: `decide() = allow,
asked = false`.

## Proposed patch

Key the allow expansion on the registry's own risk class (fall back to deny —
fail-closed — rather than allow):

```ts
const permissions = new PermissionEngine({
  rules: tools.names()
    .filter((name) => ['read', undefined].includes(tools.get(name)?.riskClass) || name === 'propose_action')
    .map((name) => ({ tool: name, effect: 'allow' as const })),
  defaultEffect: 'deny',
});
```

(or equivalently: explicit allow list of the five read tools + propose_action,
plus a test asserting that registering an execute-class tool into the
conversation registry does NOT produce an allow rule). Please also pin a
regression test: engine construction with a hypothetical execute tool yields
`deny` unless an explicit rule/ask covers it.

## Interaction notes

- Independent of the F-1 import floor (lane 09); together they close the
  CP-C3 carve-outs recorded in `evidence/reliability/security-audit-2026-08-25.md`.
- The single-choke-point structure (loop.ts:405 as the only decide() site) is
  correct and should be preserved — this handoff only changes rule CONSTRUCTION.
