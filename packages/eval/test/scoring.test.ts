import { describe, expect, it } from "vitest";
import {
  agreement,
  brierScore,
  expectedCalibrationError,
  mean,
  type ScoringSample,
} from "../src/scoring.js";

describe("brierScore", () => {
  it("returns 0 for perfect predictions", () => {
    const samples: ScoringSample[] = [
      { predicted: 1, actual: 1 },
      { predicted: 0, actual: 0 },
      { predicted: 0.7, actual: 0.7 },
    ];
    expect(brierScore(samples)).toBeCloseTo(0, 6);
  });

  it("returns 1 for worst-case predictions", () => {
    const samples: ScoringSample[] = [
      { predicted: 1, actual: 0 },
      { predicted: 0, actual: 1 },
    ];
    expect(brierScore(samples)).toBe(1);
  });

  it("returns 0.25 for chance (predicted 0.5, actual 1)", () => {
    const samples: ScoringSample[] = [
      { predicted: 0.5, actual: 1 },
      { predicted: 0.5, actual: 1 },
    ];
    expect(brierScore(samples)).toBeCloseTo(0.25, 6);
  });

  it("throws on empty input", () => {
    expect(() => brierScore([])).toThrow(/empty/);
  });
});

describe("expectedCalibrationError", () => {
  it("returns 0 for samples that perfectly match in every bin", () => {
    // All samples at predicted=0.7 with actual=0.7 → bin mean predicted=0.7,
    // bin mean actual=0.7 → diff 0.
    const samples: ScoringSample[] = [
      { predicted: 0.7, actual: 0.7 },
      { predicted: 0.7, actual: 0.7 },
      { predicted: 0.7, actual: 0.7 },
    ];
    expect(expectedCalibrationError(samples)).toBeCloseTo(0, 6);
  });

  it("captures pure miscalibration: model says 0.9 but actual 0.5", () => {
    // 4 samples in the [0.9, 1.0] bin: predicted mean 0.9, actual mean 0.5.
    // Bin weight = 4/4 = 1. ECE = 1 * |0.9 - 0.5| = 0.4.
    const samples: ScoringSample[] = [
      { predicted: 0.9, actual: 1 },
      { predicted: 0.9, actual: 0 },
      { predicted: 0.9, actual: 1 },
      { predicted: 0.9, actual: 0 },
    ];
    expect(expectedCalibrationError(samples, 10)).toBeCloseTo(0.4, 6);
  });

  it("places p=1.0 in the last bin (off-by-one safety)", () => {
    // p=1.0 with actual=1.0 should NOT count as miscalibrated. If we
    // accidentally treated bin index 10 as a separate empty bin we'd
    // miscalculate or crash.
    const samples: ScoringSample[] = [{ predicted: 1.0, actual: 1.0 }];
    expect(expectedCalibrationError(samples)).toBeCloseTo(0, 6);
  });

  it("returns 0 on empty input (vacuous)", () => {
    expect(expectedCalibrationError([])).toBe(0);
  });

  it("respects custom bin count", () => {
    // 2 samples in different sides of the midpoint with mismatching actuals.
    // 10 bins: split apart, each contributes to its own bin.
    // 1 bin: averaged together; predicted mean (0.4+0.6)/2=0.5 vs actual mean (1+0)/2=0.5 → ECE 0.
    const samples: ScoringSample[] = [
      { predicted: 0.4, actual: 1 },
      { predicted: 0.6, actual: 0 },
    ];
    expect(expectedCalibrationError(samples, 1)).toBeCloseTo(0, 6);
    // With 10 bins these split — bin 4: pred 0.4, actual 1, diff 0.6, weight 0.5;
    //                            bin 6: pred 0.6, actual 0, diff 0.6, weight 0.5.
    // Total ECE = 0.5 * 0.6 + 0.5 * 0.6 = 0.6
    expect(expectedCalibrationError(samples, 10)).toBeCloseTo(0.6, 6);
  });

  it("throws on bins < 1", () => {
    expect(() => expectedCalibrationError([{ predicted: 0.5, actual: 0.5 }], 0)).toThrow();
  });
});

describe("agreement", () => {
  it("returns 1 when every prediction agrees", () => {
    const samples: ScoringSample[] = [
      { predicted: 0.9, actual: 1 },
      { predicted: 0.1, actual: 0 },
    ];
    expect(agreement(samples)).toBe(1);
  });

  it("returns 0 when every prediction disagrees", () => {
    const samples: ScoringSample[] = [
      { predicted: 0.9, actual: 0 },
      { predicted: 0.1, actual: 1 },
    ];
    expect(agreement(samples)).toBe(0);
  });

  it("returns 1 vacuously on empty input", () => {
    expect(agreement([])).toBe(1);
  });

  it("uses >= threshold (predicted exactly 0.5 fires)", () => {
    // predicted exactly 0.5, actual 1 → both fire → match
    expect(agreement([{ predicted: 0.5, actual: 1 }], 0.5)).toBe(1);
    // predicted exactly 0.5, actual 0 → predicted fires, actual doesn't → no match
    expect(agreement([{ predicted: 0.5, actual: 0 }], 0.5)).toBe(0);
  });

  it("respects custom threshold", () => {
    const samples: ScoringSample[] = [
      { predicted: 0.6, actual: 1 },
      { predicted: 0.6, actual: 0 },
    ];
    // Threshold 0.5: both predicted fire; actuals differ → 1/2 = 0.5
    expect(agreement(samples, 0.5)).toBe(0.5);
    // Threshold 0.7: neither predicted fires; actual 1 fires (1>=0.7), actual 0 doesn't.
    // So sample 1: predicted no-fire, actual fire → mismatch.
    //    sample 2: predicted no-fire, actual no-fire → match.
    expect(agreement(samples, 0.7)).toBe(0.5);
  });
});

describe("mean", () => {
  it("averages a non-empty list", () => {
    expect(mean([0.1, 0.2, 0.3])).toBeCloseTo(0.2, 6);
  });
  it("returns 0 on empty list", () => {
    expect(mean([])).toBe(0);
  });
});
