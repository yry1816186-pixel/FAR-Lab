/**
 * 统一 AntiTheaterLintInput 构造器（hero_a / c_astro / seed_cherry pipeline 共享·DRY）。
 *
 * 反剧场红线：declaredSeeds 与 runRegistrySeeds 均 REQUIRED——caller 显式声明预注册种子集
 * 与实际报告的 run 种子集，无隐藏默认。干净 pipeline 传 [seed]/[seed]（无差异）；
 * 对抗 pipeline 传 [0,1,2,3,4]/[0,1,2]（declared ⊄ ran = cherry-pick fixture）。
 * findings 永远由 runAntiTheaterLint(detectors) 真实产出，caller 不手填（见 detect_seed_cherry）。
 */

import type { FecContractV2 } from '../fec/fec_contract.ts';
import type { VerdictKernelOutput } from '../falsifiability/index.ts';
import type { AntiTheaterLintInput } from '../anti_theater/types.ts';
import { hashCanonicalJson } from '../evidence_log/hasher.ts';
/** Arguments for building a unified AntiTheaterLintInput from pipeline
 * constants (shared by hero_a, c_astro, seed_cherry pipelines). */
export interface AntiTheaterPipelineInputArgs {
  readonly fec: FecContractV2;
  readonly preliminaryVerdict: VerdictKernelOutput;
  readonly artifactHash: string;
  readonly metricKey: string;
  readonly metricValue: number;
  readonly frozenAt: string;
  readonly primarySeed: number;
  readonly envelopeId: string;
  readonly humanSummary: string;
  readonly datasetId: string;
  readonly runIdPrefix: string;
  readonly declaredSeeds: readonly number[];
  readonly runRegistrySeeds: readonly number[];
}
/** Construct a unified AntiTheaterLintInput from pipeline-specific constants.
 * Enforces anti-theater red lines: declaredSeeds and runRegistrySeeds are REQUIRED.
 * @param args Pipeline constants and metadata.
 * @returns A fully-populated AntiTheaterLintInput. */
export function buildAntiTheaterPipelineInput(args: AntiTheaterPipelineInputArgs): AntiTheaterLintInput {
  const artifactRef = `sha256:${args.artifactHash}`;
  const baseRunId = `${args.runIdPrefix}${args.primarySeed}`;
  const primaryEvidenceId = args.fec.requiredEvidence[0]?.evidenceId;
  const thresholdHash = hashCanonicalJson({
    threshold: args.fec.threshold,
    direction: args.fec.direction,
    thresholdSemantics: args.fec.threshold.thresholdSemantics,
  });
  const primaryMetricHash = hashCanonicalJson({ metric: args.fec.metric });
  const seedPolicyHash = hashCanonicalJson({ seedPolicy: args.fec.seedPolicy });
  return {
    fec: args.fec,
    bindings: [
      {
        kind: 'dataset',
        datasetId: args.datasetId,
        contentHash: args.artifactHash,
        schemaHash: args.artifactHash,
        statsFingerprint: '',
      },
    ],
    executionTrace: {
      measurements: [
        {
          ...(primaryEvidenceId !== undefined ? { requirementId: primaryEvidenceId } : {}),
          role: 'primary',
          rawArtifactHashes: [artifactRef],
          runId: baseRunId,
          splitName: 'hidden',
          metricKey: args.metricKey,
          metricValue: args.metricValue,
        },
      ],
      runs: args.runRegistrySeeds.map((runSeed, index) => ({
        runId: `${baseRunId}-${index}`,
        endedAt: args.frozenAt,
        isInterim: false,
        earlyStopped: false,
        seed: runSeed,
      })),
    },
    verdict: args.preliminaryVerdict,
    envelopeDraft: {
      envelopeId: args.envelopeId,
      humanSummary: args.humanSummary,
      nullResults: [],
    },
    preregistrationRecord: {
      thresholdHash,
      primaryMetricHash,
      alpha: args.fec.statisticalPlan.alpha,
      seedPolicyHash,
      hypothesisSealedAt: args.frozenAt,
      toleranceFrozen: true,
      declaredSeeds: args.declaredSeeds,
    },
    runRegistry: {
      runs: args.runRegistrySeeds.map((runSeed, index) => ({ runId: `${baseRunId}-${index}`, seed: runSeed })),
      declaredNullResults: [],
    },
  };
}
