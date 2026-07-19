import { FalsifiabilityGateError } from './errors.ts';
import type {
  FalsificationSpec,
  ThresholdSpec,
} from './types.ts';

export interface FalsifiabilityGateInput {
  readonly hypothesis: string;
  readonly falsificationSpec: FalsificationSpec;
  readonly thresholdSpec?: ThresholdSpec;
}

export function falsifiabilityGate(input: FalsifiabilityGateInput): FalsificationSpec {
  const { prediction, metric, falsificationThreshold, thresholdSemantics } = input.falsificationSpec;

  if (input.hypothesis.trim().length === 0) {
    throw new FalsifiabilityGateError('falsifiabilityGate: hypothesis is empty');
  }
  if (prediction.trim().length === 0) {
    throw new FalsifiabilityGateError('falsifiabilityGate: prediction is empty');
  }
  if (metric.trim().length === 0) {
    throw new FalsifiabilityGateError(`falsifiabilityGate: metric is empty for prediction "${prediction}"`);
  }
  if (!Number.isFinite(falsificationThreshold)) {
    throw new FalsifiabilityGateError(
      `falsifiabilityGate: falsificationThreshold is not finite for prediction "${prediction}"`,
    );
  }
  if (thresholdSemantics === 'range') {
    assertRangeThreshold(input.thresholdSpec, prediction);
  }

  return input.falsificationSpec;
}

function assertRangeThreshold(spec: ThresholdSpec | undefined, prediction: string): void {
  if (spec === undefined) {
    throw new FalsifiabilityGateError(
      `falsifiabilityGate: range semantics requires thresholdSpec for prediction "${prediction}"`,
    );
  }
  if (spec.semantics !== 'range') {
    throw new FalsifiabilityGateError(
      `falsifiabilityGate: range semantics requires thresholdSpec.semantics=range for prediction "${prediction}"`,
    );
  }
  if (spec.lower === undefined || spec.upper === undefined) {
    throw new FalsifiabilityGateError(
      `falsifiabilityGate: range semantics requires lower and upper for prediction "${prediction}"`,
    );
  }
  if (!Number.isFinite(spec.lower) || !Number.isFinite(spec.upper)) {
    throw new FalsifiabilityGateError(
      `falsifiabilityGate: range lower and upper must be finite for prediction "${prediction}"`,
    );
  }
  if (spec.lower > spec.upper) {
    throw new FalsifiabilityGateError(
      `falsifiabilityGate: range lower ${spec.lower} is greater than upper ${spec.upper}`,
    );
  }
}
