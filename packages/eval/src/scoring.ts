/**
 * Scoring math for moderation calibration.
 *
 * Three metrics, all per (skill, channel) pair:
 *  - Brier score: mean squared error between predicted probability and the
 *    label. Captures both calibration and discrimination. Lower = better.
 *  - Expected Calibration Error (ECE): the system says "70% likely" — does
 *    it match the actual rate when it says that? Bins probabilities, computes
 *    weighted gap between predicted and actual rate per bin. Lower = better.
 *  - Agreement: simple binary thresholded match — predicted >= 0.5 vs.
 *    actual >= 0.5. Crude but useful when channels are mostly bimodal.
 *
 * All functions are pure — no DB, no IO. The calibration aggregator
 * (calibration.ts) groups raw predictions into per-(skill, channel) buckets
 * before calling these.
 */

export interface ScoringSample {
  /** Skill's emitted probability for this channel on this event. 0 if absent
   *  (i.e. skill ran but didn't emit the channel — absence is meaningful). */
  predicted: number;
  /** Gold-label probability for the same channel on the same event. 0 if the
   *  gold says the channel should NOT fire. */
  actual: number;
}

/** Mean squared error between predicted + actual. Range [0, 1]. Lower = better.
 *  Throws on empty input — there's no meaningful "average" of zero samples. */
export function brierScore(samples: readonly ScoringSample[]): number {
  if (samples.length === 0) {
    throw new Error("brierScore: cannot score empty sample set");
  }
  let sumSq = 0;
  for (const s of samples) {
    const diff = s.predicted - s.actual;
    sumSq += diff * diff;
  }
  return sumSq / samples.length;
}

/** Expected Calibration Error.
 *
 *  Algorithm (textbook):
 *   1. Bin samples by `predicted` into equal-width buckets [0, 1/B), [1/B, 2/B), ...
 *   2. For each non-empty bin: compute mean predicted (the "confidence") and
 *      mean actual (the "accuracy"); take their absolute difference, weight
 *      by bin size / total samples.
 *   3. Sum across bins.
 *
 *  Range [0, 1]. Lower = better. 0 = perfectly calibrated.
 *
 *  `bins` defaults to 10 — standard convention. Returns 0 when samples is
 *  empty (no calibration error if no predictions). */
export function expectedCalibrationError(
  samples: readonly ScoringSample[],
  bins = 10,
): number {
  if (samples.length === 0) return 0;
  if (bins < 1) throw new Error("expectedCalibrationError: bins must be >= 1");

  // Bin index for a probability in [0, 1]. Special-case p=1 to land in the last bin.
  const binIndex = (p: number): number => {
    const i = Math.floor(p * bins);
    return i >= bins ? bins - 1 : i < 0 ? 0 : i;
  };

  const sumPred: number[] = Array(bins).fill(0);
  const sumActual: number[] = Array(bins).fill(0);
  const counts: number[] = Array(bins).fill(0);

  for (const s of samples) {
    const i = binIndex(s.predicted);
    // Bang-asserts are honest here: i is bounded to [0, bins) by binIndex above
    // and we just initialised the arrays with `bins` zeros.
    sumPred[i] = sumPred[i]! + s.predicted;
    sumActual[i] = sumActual[i]! + s.actual;
    counts[i] = counts[i]! + 1;
  }

  let ece = 0;
  const total = samples.length;
  for (let i = 0; i < bins; i += 1) {
    const n = counts[i]!;
    if (n === 0) continue;
    const meanPred = sumPred[i]! / n;
    const meanActual = sumActual[i]! / n;
    ece += (n / total) * Math.abs(meanPred - meanActual);
  }
  return ece;
}

/** Binary thresholded agreement. Returns the fraction of samples where
 *  (predicted >= threshold) === (actual >= threshold). Range [0, 1]. Higher
 *  = better. Default threshold 0.5; common policy gates are 0.5 or 0.7. */
export function agreement(
  samples: readonly ScoringSample[],
  threshold = 0.5,
): number {
  if (samples.length === 0) return 1; // vacuous truth — no disagreements possible
  let matches = 0;
  for (const s of samples) {
    const predFired = s.predicted >= threshold;
    const actualFired = s.actual >= threshold;
    if (predFired === actualFired) matches += 1;
  }
  return matches / samples.length;
}

/** Mean of `predicted` values across samples. Used for the calibration row's
 *  diagnostic columns ("the skill predicts X on average; gold says Y"). */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/**
 * Precision / recall / F1 for a single tag across many gold events.
 *
 * Tag scoring is binary, not probabilistic — for each event:
 *  - true positive: gold expected the tag AND prediction emitted it
 *  - false positive: prediction emitted the tag without gold expecting it
 *  - false negative: gold expected the tag but prediction didn't emit it
 *
 * The resulting object is the wire shape the dashboard renders directly.
 * NaN is replaced with 0 to keep downstream serialization clean (a tag with
 * no positives shouldn't break the JSON).
 */
export interface TagSample {
  expected: boolean;
  predicted: boolean;
}

export interface TagPRF {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number;
  recall: number;
  f1: number;
  samples: number;
}

export function tagPrecisionRecall(samples: readonly TagSample[]): TagPRF {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (const s of samples) {
    if (s.expected && s.predicted) tp += 1;
    else if (!s.expected && s.predicted) fp += 1;
    else if (s.expected && !s.predicted) fn += 1;
  }
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    truePositives: tp,
    falsePositives: fp,
    falseNegatives: fn,
    precision,
    recall,
    f1,
    samples: tp + fp + fn,
  };
}
