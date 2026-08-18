// src/api/internal/court_service.ts
// Cross-model reliability court shared by API integrations.
//
// A court session is valid only when every requested model resolves to an
// explicitly configured live execution target and the selected targets declare
// distinct independence keys. Re-running one gateway under different labels is
// not cross-model evidence and is rejected before execution.

import { ulid } from 'ulid';

import { openFarDb } from '../../db/open.ts';
import { executeAskRun } from './ask_runner.ts';
import type { LlmGateway } from '../../llm_gateway/gateway.ts';
import type { ProviderProfile } from '../../llm_gateway/types.ts';

export interface CourtModelTarget {
  readonly id: string;
  readonly gateway: LlmGateway;
  readonly providerProfile: ProviderProfile;
  readonly modelSnapshot: string;
  readonly allowedModelIds: readonly string[];
  readonly independenceKey: string;
  readonly providerLabel?: string;
}

export interface CourtSessionOptions {
  readonly targets: readonly CourtModelTarget[];
}

export interface ModelVerdict {
  readonly model: string;
  readonly verdict: string | null;
  readonly decisiveRuleId: string | null;
  readonly chainHead: string | null;
  readonly error: string | null;
  readonly observedModelIds: readonly string[];
  readonly independenceKey: string;
}

export interface ReliabilityCertificate {
  readonly certificateId: string;
  readonly claim: string;
  readonly modelCount: number;
  readonly verdicts: readonly ModelVerdict[];
  readonly distinctVerdicts: readonly string[];
  readonly agreement: 'unanimous' | 'majority' | 'split' | 'inconclusive';
  readonly honestNote: string;
  readonly datasetSource: 'real';
}

export type CourtConfigurationErrorCode =
  | 'COURT_TARGETS_NOT_CONFIGURED'
  | 'COURT_TARGET_NOT_FOUND'
  | 'COURT_TARGETS_NOT_INDEPENDENT'
  | 'COURT_TARGET_INVALID';

export class CourtConfigurationError extends Error {
  readonly code: CourtConfigurationErrorCode;
  readonly detail: Readonly<Record<string, unknown>>;

  constructor(
    code: CourtConfigurationErrorCode,
    message: string,
    detail: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'CourtConfigurationError';
    this.code = code;
    this.detail = detail;
  }
}

export function computeAgreement(
  verdicts: readonly (string | null)[],
): ReliabilityCertificate['agreement'] {
  if (verdicts.length === 0 || verdicts.some((verdict) => verdict === null)) {
    return 'inconclusive';
  }
  const distinct = new Set(verdicts);
  if (distinct.size <= 1) return 'unanimous';
  if (distinct.size === 2) return 'majority';
  return 'split';
}

function validateTarget(target: CourtModelTarget): void {
  const profile = String(target.providerProfile).trim();
  if (
    target.id.trim().length === 0 ||
    target.modelSnapshot.trim().length === 0 ||
    target.independenceKey.trim().length === 0 ||
    profile.length === 0 ||
    profile === 'offline_replay' ||
    target.allowedModelIds.length === 0 ||
    target.allowedModelIds.some((modelId) => modelId.trim().length === 0)
  ) {
    throw new CourtConfigurationError(
      'COURT_TARGET_INVALID',
      `court target '${target.id || '<empty>'}' is incomplete or not live`,
      { targetId: target.id, providerProfile: profile },
    );
  }
}

function resolveTargets(
  requestedModels: readonly string[],
  options: CourtSessionOptions,
): readonly CourtModelTarget[] {
  if (requestedModels.length < 2) {
    throw new CourtConfigurationError(
      'COURT_TARGETS_NOT_CONFIGURED',
      'cross-model court requires at least two requested model targets',
      { requestedModels },
    );
  }
  if (new Set(requestedModels).size !== requestedModels.length) {
    throw new CourtConfigurationError(
      'COURT_TARGET_INVALID',
      'cross-model court model ids must be unique',
      { requestedModels },
    );
  }

  const byId = new Map<string, CourtModelTarget>();
  for (const target of options.targets) {
    validateTarget(target);
    if (byId.has(target.id)) {
      throw new CourtConfigurationError(
        'COURT_TARGET_INVALID',
        `duplicate court target id '${target.id}'`,
        { targetId: target.id },
      );
    }
    byId.set(target.id, target);
  }

  const missing = requestedModels.filter((model) => !byId.has(model));
  if (missing.length > 0) {
    throw new CourtConfigurationError(
      'COURT_TARGET_NOT_FOUND',
      `requested court targets are not configured: ${missing.join(', ')}`,
      { requestedModels, availableModels: [...byId.keys()], missing },
    );
  }

  const resolved: CourtModelTarget[] = [];
  for (const model of requestedModels) {
    const target = byId.get(model);
    if (target === undefined) {
      throw new CourtConfigurationError(
        'COURT_TARGET_NOT_FOUND',
        `court target '${model}' was not resolved`,
        { requestedModels },
      );
    }
    resolved.push(target);
  }

  const independenceKeys = resolved.map((target) => target.independenceKey);
  if (new Set(independenceKeys).size !== independenceKeys.length) {
    throw new CourtConfigurationError(
      'COURT_TARGETS_NOT_INDEPENDENT',
      'requested court targets share an independence key; relabelling one execution path is not cross-model evidence',
      { requestedModels, independenceKeys },
    );
  }
  return resolved;
}

function observedExecutionIdentity(
  artifacts: Awaited<ReturnType<typeof executeAskRun>>['loopState']['artifacts'],
): {
  readonly modelIds: readonly string[];
  readonly providerProfiles: readonly string[];
} {
  return {
    modelIds: [...new Set(artifacts.map((artifact) => artifact.callResult.credential.modelId))].sort(),
    providerProfiles: [
      ...new Set(artifacts.map((artifact) => String(artifact.callResult.credential.providerProfile))),
    ].sort(),
  };
}

export async function runCourtSession(
  claim: string,
  models: readonly string[],
  gitCommitSha: string,
  options: CourtSessionOptions,
): Promise<ReliabilityCertificate> {
  if (claim.trim().length === 0) {
    throw new CourtConfigurationError('COURT_TARGET_INVALID', 'court claim must be non-empty');
  }
  const targets = resolveTargets(models, options);
  const verdicts: ModelVerdict[] = [];

  for (const target of targets) {
    const db = openFarDb(':memory:');
    try {
      const result = await executeAskRun(
        db,
        claim,
        'quick',
        gitCommitSha,
        undefined,
        undefined,
        target.gateway,
        undefined,
        undefined,
        target.modelSnapshot,
        target.providerProfile,
      );
      const identity = observedExecutionIdentity(result.loopState.artifacts);
      const unexpectedModels = identity.modelIds.filter(
        (modelId) => !target.allowedModelIds.includes(modelId),
      );
      const unexpectedProfiles = identity.providerProfiles.filter(
        (profile) => profile !== String(target.providerProfile),
      );
      const identityError =
        identity.modelIds.length === 0
          ? 'no model execution identity was recorded'
          : unexpectedModels.length > 0 || unexpectedProfiles.length > 0
            ? `execution identity mismatch: models=[${unexpectedModels.join(', ')}], profiles=[${unexpectedProfiles.join(', ')}]`
            : null;
      const node = result.loopState.verdictNode;
      const loopError = result.loopState.error === null ? null : result.loopState.error.message;
      const error = identityError ?? loopError;
      verdicts.push({
        model: target.id,
        verdict: error === null && node !== null ? node.verdict : null,
        decisiveRuleId: error === null && node !== null ? node.verdictTrace.decisiveRuleId : null,
        chainHead: error === null ? result.reproHash : null,
        error,
        observedModelIds: identity.modelIds,
        independenceKey: target.independenceKey,
      });
    } catch (error: unknown) {
      verdicts.push({
        model: target.id,
        verdict: null,
        decisiveRuleId: null,
        chainHead: null,
        error: error instanceof Error ? error.message : String(error),
        observedModelIds: [],
        independenceKey: target.independenceKey,
      });
    } finally {
      db.close();
    }
  }

  const verdictList = verdicts.map((verdict) => verdict.verdict);
  const agreement = computeAgreement(verdictList);
  return {
    certificateId: ulid(),
    claim,
    modelCount: targets.length,
    verdicts,
    distinctVerdicts: [...new Set(verdictList.map((verdict) => verdict ?? '<null>'))],
    agreement,
    datasetSource: 'real',
    honestNote:
      agreement === 'inconclusive'
        ? 'Cross-model agreement is INCONCLUSIVE because at least one configured target failed execution, identity verification, or kernel adjudication. Missing results are not agreement.'
        : 'Each result came from a separately configured live target with a distinct independence key and an observed model identity inside its declared allowlist. Agreement is still not proof that the scientific claim is true.',
  };
}
