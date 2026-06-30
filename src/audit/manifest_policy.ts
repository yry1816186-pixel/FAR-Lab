export const ROLE_NAMES = [
  'research_scout',
  'spec_architect',
  'builder',
  'verifier_redteam',
  'security_gate',
  'domain_scientist_proxy',
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export type ManifestDecision = 'allow' | 'ask' | 'deny';

export interface RolePolicy {
  readonly purpose: string;
  readonly allow: readonly string[];
  readonly ask: readonly string[];
  readonly deny: readonly string[];
  readonly requiredOutput: readonly string[];
}

export interface AgentExecutionManifest {
  readonly version: 1;
  readonly scope: 'development_only';
  readonly defaultPolicy: {
    readonly writeAction: 'ask';
    readonly networkAction: 'ask';
    readonly destructiveAction: 'deny';
    readonly secretRead: 'deny';
  };
  readonly dialogueMode: 'disabled' | 'enabled';
  readonly roles: Readonly<Record<RoleName, RolePolicy>>;
}

export const AGENT_EXECUTION_MANIFEST: AgentExecutionManifest = {
  version: 1,
  scope: 'development_only',
  defaultPolicy: {
    writeAction: 'ask',
    networkAction: 'ask',
    destructiveAction: 'deny',
    secretRead: 'deny',
  },
  dialogueMode: 'disabled',
  roles: {
    research_scout: {
      purpose: 'Gather external facts into SourceCard form; no production code writes.',
      allow: ['read_docs', 'web_search', 'read_repo'],
      ask: ['download_pdf', 'add_verified_fact'],
      deny: ['edit_src', 'edit_schema', 'edit_ci', 'read_secret', 'run_bailian_paid_call'],
      requiredOutput: ['SourceCard[]', 'gap_notes'],
    },
    spec_architect: {
      purpose: 'Align specifications and interface signatures with the SSOT.',
      allow: ['edit_spec_md', 'read_repo', 'grep_repo'],
      ask: ['change_schema_contract', 'change_ci_gate', 'add_dependency'],
      deny: ['edit_src_without_scaffold', 'read_secret', 'deploy'],
      requiredOutput: ['ssot_delta', 'grep_closure'],
    },
    builder: {
      purpose: 'Implement already-locked contracts in src, repro, schema, and tests.',
      allow: ['edit_src', 'edit_tests', 'run_unit_tests', 'run_typecheck'],
      ask: ['edit_schema', 'edit_ci', 'add_dependency', 'paid_api_call'],
      deny: ['weaken_test', 'use_any_escape', 'delete_unknown_file', 'read_secret'],
      requiredOutput: ['diff_summary', 'verification_commands'],
    },
    verifier_redteam: {
      purpose: 'Review for regressions, hallucinations, missing tests, and boundary leaks.',
      allow: ['read_repo', 'run_tests', 'grep_repo', 'review_diff'],
      ask: ['small_doc_fix', 'small_test_fix'],
      deny: ['large_refactor', 'schema_change', 'ci_change', 'secret_read'],
      requiredOutput: ['findings', 'residual_risk'],
    },
    security_gate: {
      purpose: 'Audit secrets, network exits, permissions, and dangerous operations.',
      allow: ['grep_repo', 'scan_env_names', 'review_workflows'],
      ask: ['rotate_secret_instruction', 'change_permission_policy'],
      deny: ['print_secret', 'persist_token', 'deploy'],
      requiredOutput: ['security_report'],
    },
    domain_scientist_proxy: {
      purpose: 'Challenge scientific claims, evidence coverage, and falsifiability.',
      allow: ['read_source_cards', 'read_stage_artifacts', 'write_review_note'],
      ask: ['add_domain_source'],
      deny: ['declare_confirmed_without_evidence', 'change_numeric_result'],
      requiredOutput: ['domain_objections', 'required_evidence'],
    },
  },
};

export function isRoleName(value: string): value is RoleName {
  return (ROLE_NAMES as readonly string[]).includes(value);
}

export function getRolePolicy(role: RoleName): RolePolicy {
  return AGENT_EXECUTION_MANIFEST.roles[role];
}

export function decideRoleAction(role: RoleName, action: string): ManifestDecision {
  const policy = getRolePolicy(role);
  if (policy.deny.includes(action)) {
    return 'deny';
  }
  if (policy.ask.includes(action)) {
    return 'ask';
  }
  if (policy.allow.includes(action)) {
    return 'allow';
  }
  return 'ask';
}

export function explainRoleAction(role: RoleName, action: string): string {
  const decision = decideRoleAction(role, action);
  return `${role}:${action}:${decision}`;
}
