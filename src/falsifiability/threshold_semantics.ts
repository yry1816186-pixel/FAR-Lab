import type { ThresholdSpec } from './types.ts';

export interface ThresholdEvaluation {
  readonly supportsClaim: boolean;
  readonly refutesClaim: boolean;
}

export function evaluateThreshold(metricValue: number, spec: ThresholdSpec): ThresholdEvaluation {
  if (!Number.isFinite(metricValue)) {
    throw new Error(`evaluateThreshold: metricValue must be finite, received ${metricValue}`);
  }

  let supportsClaim: boolean;
  switch (spec.semantics) {
    case 'gt':
      if (spec.value === undefined || !Number.isFinite(spec.value)) {
        throw new Error('evaluateThreshold: gt semantics requires finite value');
      }
      supportsClaim = metricValue >= spec.value;
      break;
    case 'lt':
      if (spec.value === undefined || !Number.isFinite(spec.value)) {
        throw new Error('evaluateThreshold: lt semantics requires finite value');
      }
      supportsClaim = metricValue <= spec.value;
      break;
    case 'range':
      if (
        spec.lower === undefined ||
        spec.upper === undefined ||
        !Number.isFinite(spec.lower) ||
        !Number.isFinite(spec.upper)
      ) {
        throw new Error('evaluateThreshold: range semantics requires finite lower and upper');
      }
      if (spec.lower > spec.upper) {
        throw new Error('evaluateThreshold: range lower must be less than or equal to upper');
      }
      supportsClaim = metricValue >= spec.lower && metricValue <= spec.upper;
      break;
    default:
      throw new Error('evaluateThreshold: unreachable threshold semantics');
  }

  return {
    supportsClaim,
    refutesClaim: !supportsClaim,
  };
}
