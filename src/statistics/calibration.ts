/**
 * calibration —— 概率预测校准评分。
 *
 * 借鉴 Brier score 与 Expected Calibration Error（ECE）的确定性实现：
 *   - brierScore(p, o) = 1/n Σ(pᵢ − oᵢ)²（0=完美·1=完全反向）
 *   - expectedCalibrationError：均匀分箱的加权 |箱内频率 − 箱内均值预测|（[0,1]）
 *   - calibrationQuality：brier + ece + 样本量守卫——**n < MIN_CALIBRATION_SAMPLE 时返回 null
 *     （校准弃权 abstention·N5-E7 语义：样本不足宁可无评级，不给低置信评级）**
 *
 * 纯函数·确定性·无外部依赖。与 verdict 无关（不进 R0-R9·不进 proofHash）——用于
 * 模型校准可观测（用户可感知「这个 LLM 的输出校准程度」）。
 * 诚实边界：校准评分描述「预测概率与频率的吻合度」——不证明「预测正确」（正确性由
 * verdict + 证据链负责）。分箱 ECE 对样本分布敏感（10 箱均匀·样本稀时箱空跳过）。
 */

/** 校准评分所需最小样本量（低于此 → 弃权 null）。 */
export const MIN_CALIBRATION_SAMPLE = 20;

/** 校准评分结果（null = 弃权）。 */
export interface CalibrationQuality {
  readonly brier: number;
  readonly ece: number;
  readonly n: number;
}

/** 断言输入合法性（长度一致 + 概率域）。 */
function assertValidInputs(
  predictions: readonly number[],
  outcomes: readonly boolean[],
): void {
  if (predictions.length !== outcomes.length) {
    throw new Error('calibration: predictions and outcomes must have the same length');
  }
  for (const p of predictions) {
    if (!Number.isFinite(p) || p < 0 || p > 1) {
      throw new Error(`calibration: prediction ${p} out of [0,1] probability domain`);
    }
  }
}

/**
 * Brier score：1/n Σ(pᵢ − oᵢ)²。
 */
export function brierScore(
  predictions: readonly number[],
  outcomes: readonly boolean[],
): number {
  assertValidInputs(predictions, outcomes);
  if (predictions.length === 0) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < predictions.length; i += 1) {
    const o = outcomes[i] === true ? 1 : 0;
    const d = predictions[i]! - o;
    sum += d * d;
  }
  return sum / predictions.length;
}

/**
 * Expected Calibration Error：把预测按均匀分箱（[0, 1/bins] 每箱），
 * 每箱计算 |箱内频率 − 箱内均值预测|，按箱内样本占比加权求和。
 * 空箱跳过（不贡献）。返回 [0,1]。
 *
 * @param bins 分箱数（默认 10·均匀）
 */
export function expectedCalibrationError(
  predictions: readonly number[],
  outcomes: readonly boolean[],
  bins = 10,
): number {
  assertValidInputs(predictions, outcomes);
  if (predictions.length === 0 || bins < 1) {
    return 0;
  }
  const binCount = Array.from({ length: bins }, () => 0);
  const binPredSum = Array.from({ length: bins }, () => 0);
  const binTrueCount = Array.from({ length: bins }, () => 0);

  for (let i = 0; i < predictions.length; i += 1) {
    const p = predictions[i]!;
    const idx = Math.min(bins - 1, Math.floor(p * bins)); // p=1.0 → 最后一箱（不越界）
    binCount[idx]! += 1;
    binPredSum[idx]! += p;
    if (outcomes[i] === true) {
      binTrueCount[idx]! += 1;
    }
  }

  let weighted = 0;
  let total = 0;
  for (let b = 0; b < bins; b += 1) {
    const n = binCount[b]!;
    if (n === 0) {
      continue; // 空箱跳过（均匀分箱在样本稀时天然有空箱）
    }
    const freq = binTrueCount[b]! / n;
    const meanPred = binPredSum[b]! / n;
    weighted += n * Math.abs(freq - meanPred);
    total += n;
  }
  return total === 0 ? 0 : weighted / total;
}

/**
 * 校准综合评级：brier + ece + n。
 * **样本量守卫（校准弃权）**：n < MIN_CALIBRATION_SAMPLE → null（N5-E7：
 * 样本不足不产出评级——避免小样本的 ECE 抖动被误读为真实校准信号）。
 */
export function calibrationQuality(
  predictions: readonly number[],
  outcomes: readonly boolean[],
): CalibrationQuality | null {
  assertValidInputs(predictions, outcomes);
  if (predictions.length < MIN_CALIBRATION_SAMPLE) {
    return null; // 校准弃权（abstention）
  }
  return {
    brier: brierScore(predictions, outcomes),
    ece: expectedCalibrationError(predictions, outcomes),
    n: predictions.length,
  };
}
