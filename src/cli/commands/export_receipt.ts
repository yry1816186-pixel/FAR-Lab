// src/cli/commands/export_receipt.ts
// Trust Receipt is a DOC projection of ProofEnvelope/.far-proof, not a new fact source.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { verifyFarProofBundle } from '../../far_proof/bundle_verifier.ts';
import type { FalsificationSpec } from '../../falsifiability/types.ts';
import type { ProofEnvelopeV2 } from '../../proof_envelope/v2/types.ts';
import type { Verdict } from '../../schema/enums.ts';
import {
  collectVerifyDump,
  parseProofEnvelopeV2,
  verifyEnvelopeV2,
  type VerifyDump,
  type VerifyStatus,
} from './verify.ts';

/** Type alias: receipt format. */
export type ReceiptFormat = 'json' | 'markdown';
/** Type alias: receipt source kind. */
export type ReceiptSourceKind = 'proofEnvelopeV2' | 'farProofBundleV1';
/** Type alias: receipt tamper status. */
export type ReceiptTamperStatus = 'clean' | 'tampered' | 'unknown';

/** Interface defining trust receipt summary. */
export interface TrustReceiptSummary {
  readonly claimSummary: string;
  readonly verdict: Verdict;
  readonly evidenceScope: string;
  readonly proofHash: string;
  readonly verifierCommand: string;
  readonly tamperStatus: ReceiptTamperStatus;
  readonly limitations: readonly string[];
  readonly requiredNextAction?: string;
}

/** Interface defining trust receipt. */
export interface TrustReceipt {
  readonly schemaVersion: 'far.trust_receipt.v1';
  readonly generatedAt: string;
  readonly source: {
    readonly kind: ReceiptSourceKind;
    readonly path: string;
    readonly envelopeId: string;
    readonly sourceSchema: string;
  };
  readonly summary: TrustReceiptSummary;
  readonly verification: {
    readonly status: VerifyStatus;
    readonly warnings: readonly string[];
    readonly verifiedLevels: readonly string[];
  };
}

/** Input parameters for operations involving export receipt options. */
export interface ExportReceiptOptions {
  readonly bundlePath?: string;
  readonly envelopePath?: string;
  readonly format: ReceiptFormat;
  readonly outputPath?: string;
  readonly generatedAt?: string;
}

interface BundleEnvelopeProjection {
  readonly envelopeId: string;
  readonly claimId: string;
  readonly conclusion: Verdict;
  readonly proofHash: string;
  readonly falsificationSpec: FalsificationSpec;
  readonly knownFailures: readonly string[];
}

/**
 * run export receipt.
 */
export function runExportReceipt(options: ExportReceiptOptions): number {
  const sourceCount = Number(options.bundlePath !== undefined) + Number(options.envelopePath !== undefined);
  if (sourceCount !== 1) {
    process.stderr.write('far export receipt: provide exactly one of --envelope or --bundle\n');
    return 2;
  }

  const loaded =
    options.envelopePath !== undefined
      ? buildReceiptFromEnvelopeFile(options.envelopePath, options.generatedAt)
      : buildReceiptFromBundle(options.bundlePath ?? '', options.generatedAt);

  if (!loaded.ok) {
    process.stderr.write(`far export receipt: ${loaded.exitKind} — ${loaded.error}\n`);
    return loaded.exitCode;
  }

  const output = options.format === 'json'
    ? `${JSON.stringify(loaded.receipt, null, 2)}\n`
    : renderReceiptMarkdown(loaded.receipt);

  if (options.outputPath !== undefined) {
    writeFileSync(options.outputPath, output, 'utf8');
  } else {
    process.stdout.write(output);
  }
  return 0;
}

/**
 * build trust receipt from envelope.
 */
export function buildTrustReceiptFromEnvelope(
  envelope: ProofEnvelopeV2,
  sourcePath: string,
  generatedAt: string,
): { readonly ok: true; readonly receipt: TrustReceipt } | { readonly ok: false; readonly error: string } {
  const envelopeResult = verifyEnvelopeV2(envelope);
  const dump = collectVerifyDump(envelopeResult, undefined, undefined);
  if (dump.status === 'FAIL') {
    return { ok: false, error: dump.errors.join(' | ') || 'envelope verification failed' };
  }

  const limitations = [
    ...baseLimitations(),
    ...(envelope.verdictTrace.verdict === 'CONFIRMED'
      ? ['CONFIRMED means bounded support under the frozen FEC and stated evidence scope; it is not scientific acceptance.']
      : []),
    ...(envelope.verdictTrace.scopeReport.isDegraded
      ? [`Evidence scope is degraded: ${envelope.verdictTrace.scopeReport.scopeSlipText ?? 'scopeReport.isDegraded=true'}.`]
      : []),
  ];

  return {
    ok: true,
    receipt: {
      schemaVersion: 'far.trust_receipt.v1',
      generatedAt,
      source: {
        kind: 'proofEnvelopeV2',
        path: sourcePath,
        envelopeId: envelope.envelopeId,
        sourceSchema: envelope.schemaVersion,
      },
      summary: {
        claimSummary: envelope.claim.naturalLanguage,
        verdict: envelope.verdictTrace.verdict,
        evidenceScope: envelope.claim.scope,
        proofHash: envelope.proofHash,
        verifierCommand: `far verify --envelope ${shellQuote(sourcePath)} --json`,
        tamperStatus: envelopeResult.tamperStatus === 'clean' ? 'clean' : 'tampered',
        limitations,
        requiredNextAction: requiredNextAction(envelope.verdictTrace.verdict),
      },
      verification: {
        status: dump.status,
        warnings: dump.warnings,
        verifiedLevels: dump.verifiedLevels,
      },
    },
  };
}

/**
 * build trust receipt from bundle.
 */
export function buildTrustReceiptFromBundle(
  bundlePath: string,
  generatedAt: string,
): { readonly ok: true; readonly receipt: TrustReceipt } | { readonly ok: false; readonly error: string } {
  const bundleResult = verifyFarProofBundle(bundlePath, 'full');
  const dump: VerifyDump = collectVerifyDump(undefined, undefined, undefined, undefined, bundleResult);
  if (dump.status === 'FAIL') {
    return { ok: false, error: dump.errors.join(' | ') || 'bundle verification failed' };
  }

  const parsed = loadLatestBundleEnvelope(bundlePath);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }
  const envelope = parsed.envelope;
  const limitations = [
    ...baseLimitations(),
    'This receipt is projected from a V1 minimal .far-proof bundle, not a validator-compliant RO-Crate/PROV-O certification.',
    'V1 proof_envelopes.jsonl does not embed the full natural-language claim; claimSummary uses claimId plus falsificationSpec.prediction.',
    ...envelope.knownFailures,
  ];

  return {
    ok: true,
    receipt: {
      schemaVersion: 'far.trust_receipt.v1',
      generatedAt,
      source: {
        kind: 'farProofBundleV1',
        path: bundlePath,
        envelopeId: envelope.envelopeId,
        sourceSchema: 'far.proof_envelope.v1.minimal',
      },
      summary: {
        claimSummary: `${envelope.claimId}: ${envelope.falsificationSpec.prediction}`,
        verdict: envelope.conclusion,
        evidenceScope: `metric=${envelope.falsificationSpec.metric}; threshold=${envelope.falsificationSpec.thresholdSemantics} ${envelope.falsificationSpec.falsificationThreshold}`,
        proofHash: envelope.proofHash,
        verifierCommand: `far verify --bundle ${shellQuote(bundlePath)} --mode full --json`,
        tamperStatus: bundleResult.ok ? 'clean' : 'tampered',
        limitations,
        requiredNextAction: requiredNextAction(envelope.conclusion),
      },
      verification: {
        status: dump.status,
        warnings: dump.warnings,
        verifiedLevels: dump.verifiedLevels,
      },
    },
  };
}

/**
 * render receipt markdown.
 */
export function renderReceiptMarkdown(receipt: TrustReceipt): string {
  const lines = [
    '# FAR-Lab Trust Receipt',
    '',
    `- Schema: \`${receipt.schemaVersion}\``,
    `- Generated: ${receipt.generatedAt}`,
    `- Source: ${receipt.source.kind} (${receipt.source.path})`,
    `- Envelope: \`${receipt.source.envelopeId}\``,
    '',
    '## Summary',
    '',
    `- Claim: ${receipt.summary.claimSummary}`,
    `- Verdict: \`${receipt.summary.verdict}\``,
    `- Evidence scope: ${receipt.summary.evidenceScope}`,
    `- proofHash: \`${receipt.summary.proofHash}\``,
    `- Tamper status: \`${receipt.summary.tamperStatus}\``,
    `- Verify: \`${receipt.summary.verifierCommand}\``,
    '',
    '## Limitations',
    '',
    ...receipt.summary.limitations.map((limitation) => `- ${limitation}`),
    '',
    '## Required Next Action',
    '',
    receipt.summary.requiredNextAction ?? 'Run the verifier command and review limitations before reuse.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function buildReceiptFromEnvelopeFile(
  envelopePath: string,
  generatedAt = new Date().toISOString(),
):
  | { readonly ok: true; readonly receipt: TrustReceipt }
  | { readonly ok: false; readonly exitKind: string; readonly exitCode: number; readonly error: string } {
  const loaded = loadEnvelopeFile(envelopePath);
  if (!loaded.ok) {
    return { ok: false, exitKind: 'failed to load envelope', exitCode: 1, error: loaded.error };
  }
  const receipt = buildTrustReceiptFromEnvelope(loaded.envelope, envelopePath, generatedAt);
  if (!receipt.ok) {
    return { ok: false, exitKind: 'envelope verification failed', exitCode: 7, error: receipt.error };
  }
  return receipt;
}

function buildReceiptFromBundle(
  bundlePath: string,
  generatedAt = new Date().toISOString(),
):
  | { readonly ok: true; readonly receipt: TrustReceipt }
  | { readonly ok: false; readonly exitKind: string; readonly exitCode: number; readonly error: string } {
  if (!existsSync(bundlePath)) {
    return { ok: false, exitKind: 'bundle not found', exitCode: 1, error: bundlePath };
  }
  const receipt = buildTrustReceiptFromBundle(bundlePath, generatedAt);
  if (!receipt.ok) {
    return { ok: false, exitKind: 'bundle verification failed', exitCode: 7, error: receipt.error };
  }
  return receipt;
}

function loadEnvelopeFile(
  path: string,
): { readonly ok: true; readonly envelope: ProofEnvelopeV2 } | { readonly ok: false; readonly error: string } {
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return parseProofEnvelopeV2(raw);
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

function loadLatestBundleEnvelope(
  bundlePath: string,
): { readonly ok: true; readonly envelope: BundleEnvelopeProjection } | { readonly ok: false; readonly error: string } {
  const jsonlPath = join(bundlePath, 'proof_envelopes.jsonl');
  try {
    const lines = readFileSync(jsonlPath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const latest = lines.at(-1);
    if (latest === undefined) {
      return { ok: false, error: 'proof_envelopes.jsonl contains no envelope rows' };
    }
    const row = parseBundleEnvelopeRow(JSON.parse(latest) as unknown);
    if (!row.ok) {
      return row;
    }
    return { ok: true, envelope: row.envelope };
  } catch (error) {
    return { ok: false, error: `failed to load proof_envelopes.jsonl: ${errorMessage(error)}` };
  }
}

function parseBundleEnvelopeRow(
  raw: unknown,
): { readonly ok: true; readonly envelope: BundleEnvelopeProjection } | { readonly ok: false; readonly error: string } {
  if (!isPlainObject(raw)) {
    return { ok: false, error: 'bundle envelope row must be an object' };
  }
  const required = [
    'envelope_id',
    'claim_id',
    'conclusion',
    'proof_hash',
    'falsification_spec',
    'known_failures',
  ] as const;
  for (const key of required) {
    if (typeof raw[key] !== 'string') {
      return { ok: false, error: `bundle envelope row field ${key} must be string` };
    }
  }
  const envelopeId = raw.envelope_id;
  const claimId = raw.claim_id;
  const conclusion = raw.conclusion;
  const proofHash = raw.proof_hash;
  const falsificationSpecRaw = raw.falsification_spec;
  const knownFailuresRaw = raw.known_failures;
  if (
    typeof envelopeId !== 'string' ||
    typeof claimId !== 'string' ||
    typeof conclusion !== 'string' ||
    typeof proofHash !== 'string' ||
    typeof falsificationSpecRaw !== 'string' ||
    typeof knownFailuresRaw !== 'string'
  ) {
    return { ok: false, error: 'bundle envelope row failed string narrowing' };
  }

  const falsificationSpec = parseFalsificationSpec(falsificationSpecRaw);
  if (!falsificationSpec.ok) {
    return { ok: false, error: falsificationSpec.error };
  }
  const knownFailures = parseStringArray(knownFailuresRaw, 'known_failures');
  if (!knownFailures.ok) {
    return { ok: false, error: knownFailures.error };
  }
  if (!isVerdict(conclusion)) {
    return { ok: false, error: `unsupported conclusion: ${conclusion}` };
  }
  return {
    ok: true,
    envelope: {
      envelopeId,
      claimId,
      conclusion,
      proofHash,
      falsificationSpec: falsificationSpec.value,
      knownFailures: knownFailures.value,
    },
  };
}

function parseFalsificationSpec(
  raw: string,
): { readonly ok: true; readonly value: FalsificationSpec } | { readonly ok: false; readonly error: string } {
  const parsed = JSON.parse(raw) as unknown;
  if (!isPlainObject(parsed)) {
    return { ok: false, error: 'falsification_spec must decode to object' };
  }
  if (
    typeof parsed.prediction !== 'string' ||
    typeof parsed.metric !== 'string' ||
    typeof parsed.falsificationThreshold !== 'number' ||
    (parsed.thresholdSemantics !== 'gt' && parsed.thresholdSemantics !== 'lt' && parsed.thresholdSemantics !== 'range')
  ) {
    return { ok: false, error: 'falsification_spec has invalid shape' };
  }
  return {
    ok: true,
    value: {
      prediction: parsed.prediction,
      metric: parsed.metric,
      falsificationThreshold: parsed.falsificationThreshold,
      thresholdSemantics: parsed.thresholdSemantics,
    },
  };
}

function parseStringArray(
  raw: string,
  label: string,
): { readonly ok: true; readonly value: readonly string[] } | { readonly ok: false; readonly error: string } {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    return { ok: false, error: `${label} must decode to string[]` };
  }
  return { ok: true, value: parsed };
}

function baseLimitations(): readonly string[] {
  return [
    'This Trust Receipt is a DOC projection; it is not a new fact source and is not included in proofHash.',
    'It does not certify universal scientific truth and does not replace peer review.',
    'It certifies only tamper-evident, independently recomputable support for the stated evidence scope.',
  ];
}

function requiredNextAction(verdict: Verdict): string {
  switch (verdict) {
    case 'CONFIRMED':
      return 'Obtain human or peer-review endorsement before treating the claim as accepted science.';
    case 'REFUTED':
      return 'Inspect the falsifying evidence and update or retract the claim before rerun.';
    case 'INCONCLUSIVE':
      return 'Add decisive evidence or refine the FEC before making a stronger claim.';
    case 'DEGRADED_SCOPE':
      return 'Resolve scope degradation or narrow the claim to the verified evidence scope.';
    case 'UNTESTED':
      return 'Run the required measurements before assigning support or refutation.';
  }
}

function isVerdict(value: string): value is Verdict {
  return value === 'CONFIRMED' ||
    value === 'REFUTED' ||
    value === 'INCONCLUSIVE' ||
    value === 'DEGRADED_SCOPE' ||
    value === 'UNTESTED';
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
