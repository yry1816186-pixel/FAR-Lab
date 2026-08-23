import { createHash } from 'node:crypto';

/**
 * Exploratory CodeAct static gate (AVO fusion G4 — the D-086-5 boundary).
 *
 * AVO/NOOA elevate the agent to write and run code as its primary action
 * surface (NOOA CodeAct strategy, arXiv:2607.20709). FAR-Lab's confirmatory
 * layer keeps the OPPOSITE invariant on purpose (D-086-5): preregistered
 * experiment specs are reviewed templates; the orchestrator may only pass
 * JSON parameters, never code, and verdicts derive mechanically.
 *
 * The resolution (research/avo-nooa/02-farlab-gap-analysis.md, G4): BOTH.
 * - Exploratory layer (this file): the agent writes analysis Python that runs
 *   inside the sidecar sandbox. Outputs may become CANDIDATE claims/specs —
 *   always through deterministic gates downstream, never by self-declaration.
 * - Confirmatory layer: unchanged. This gate is the TS-side tripwire that runs
 *   BEFORE execution so confirmatory-boundary escapes fail fast with
 *   agent-readable violations (line numbers included), mirroring NOOA's
 *   UnifiedCodeValidator error-code style while enforcing OUR boundary.
 *
 * Defense-in-depth note (same honesty as NOOA's validator): a static checker
 * is guardrails, not a jail. The real containment for exploration code is the
 * sidecar process sandbox (experiment-runtime family env) plus the permission
 * engine; this gate exists to make policy violations cheap to catch and loud,
 * not to claim adversarial containment.
 */

export interface ExplorationViolation {
  /** Stable machine-readable code (agent-readable feedback contract). */
  code:
    | 'E-PURPOSE'      // missing/empty purpose statement
    | 'E-RUNTIME'      // unbounded or non-positive runtime bound
    | 'E-CONFIRMATORY' // touches the confirmatory boundary (spec/verdict fabrication)
    | 'E-NETWORK'      // network surface
    | 'E-SUBPROCESS'   // process spawn / os.system surface
    | 'E-CREDENTIALS'; // env/secret probing
  line?: number;
  message: string;
}

export interface ExplorationVerdict {
  allowed: boolean;
  violations: ExplorationViolation[];
  /** sha256 of the exact source — lands in receipts when this code executes. */
  codeHash: string;
}

export interface AnalyzeExplorationInput {
  code: string;
  /** Why this exploration advances the current scientific state (audit trail). */
  purpose: string;
  /** Hard wall-clock bound the sidecar will enforce; must be positive. */
  maxRuntimeMs: number;
}

const NETWORK_MARKERS = [
  /\bimport\s+socket\b/, /\bfrom\s+socket\b/,
  /\bimport\s+urllib\b/, /\bfrom\s+urllib\b/,
  /\bimport\s+http\b/, /\bfrom\s+http\s+import\b/,
  /\bimport\s+requests\b/, /\bfrom\s+requests\b/,
  /\bimport\s+ftplib\b/, /\bimport\s+smtplib\b/, /\bimport\s+telnetlib\b/,
  /\brequests\.(get|post|put|delete|head)\s*\(/,
  /\burllib\.request\.urlopen\s*\(/,
];

const SUBPROCESS_MARKERS = [
  /\bimport\s+subprocess\b/, /\bfrom\s+subprocess\b/,
  /\bsubprocess\.(run|Popen|call|check_output|check_call)\s*\(/,
  /\bos\.(system|popen|exec[lv]|spawn)\w*\s*\(/,
  /\bcommands?\.(getoutput|getstatusoutput)\s*\(/,
];

const CONFIRMATORY_MARKERS = [
  // verdict/spec fabrication or mutation of the confirmatory registries
  /experiment_spec\s*\[[^\]]*\]\s*=/,
  /\bspec\.[A-Za-z_]+\s*=[^=]/,
  /\bfar_registry\.(save|write|update)_spec\s*\(/,
  /\bverdict\s*=\s*['"](supports|falsifies|inconclusive)['"]/,
  /open\s*\(\s*['"][^'"]*(experiment[-_]spec|verdict)[^'"]*['"]\s*,\s*['"][wa]/,
  /json\.dump\s*\([^)]*['"](experiment[-_]spec|verdict)[^'"]*['"]/,
];

const CREDENTIAL_MARKERS = [
  /\bos\.environ\b/, /\bgetenv\s*\(/,
  /\bimport\s+keyring\b/, /\bimport\s+secrets\b/,
  /\bapi[_-]?key\b/i, /\bpassword\b/i, /\btoken\b\s*=/i,
];

const firstMatch = (code: string, patterns: RegExp[]): { line: number; matched: RegExp } | null => {
  const lines = code.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const p of patterns) {
      if (p.test(lines[i]!)) return { line: i + 1, matched: p };
    }
  }
  return null;
};

/**
 * Static policy check over exploratory analysis code. Pure function; no I/O.
 * Execution itself happens in the pinned sidecar env under the permission
 * engine — see src/experiment/python.ts for the transport.
 */
export const analyzeExplorationCode = (input: AnalyzeExplorationInput): ExplorationVerdict => {
  const violations: ExplorationViolation[] = [];

  if (!input.purpose || input.purpose.trim().length < 3) {
    violations.push({
      code: 'E-PURPOSE',
      message: 'exploration requires a stated purpose tying it to the current scientific state',
    });
  }

  if (!Number.isFinite(input.maxRuntimeMs) || input.maxRuntimeMs <= 0) {
    violations.push({
      code: 'E-RUNTIME',
      message: `maxRuntimeMs must be a positive finite bound, got ${String(input.maxRuntimeMs)}`,
    });
  }

  const net = firstMatch(input.code, NETWORK_MARKERS);
  if (net) {
    violations.push({ code: 'E-NETWORK', line: net.line, message: 'network access is outside the exploration sandbox' });
  }

  const sub = firstMatch(input.code, SUBPROCESS_MARKERS);
  if (sub) {
    violations.push({ code: 'E-SUBPROCESS', line: sub.line, message: 'process spawning is not available to exploration code' });
  }

  const conf = firstMatch(input.code, CONFIRMATORY_MARKERS);
  if (conf) {
    violations.push({
      code: 'E-CONFIRMATORY', line: conf.line,
      message: 'exploration code cannot write specs or declare verdicts — draft a spec through the review gate instead',
    });
  }

  const cred = firstMatch(input.code, CREDENTIAL_MARKERS);
  if (cred) {
    violations.push({ code: 'E-CREDENTIALS', line: cred.line, message: 'credential/env probing is forbidden in exploration code' });
  }

  return {
    allowed: violations.length === 0,
    violations,
    codeHash: createHash('sha256').update(input.code).digest('hex'),
  };
};
