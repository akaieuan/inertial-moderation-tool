import { describe, expect, it } from "vitest";
import type { GoldEvent, StructuredSignal } from "@inertial/schemas";
import { aggregateRunCalibrations, type RunPrediction } from "../src/calibration.js";
import { tagPrecisionRecall } from "../src/scoring.js";

const ISO = "2026-04-26T10:00:00.000Z";
const INSTANCE = "default";

function gold(opts: {
  id: string;
  expectedChannels?: GoldEvent["expectedChannels"];
}): GoldEvent {
  return {
    id: `00000000-0000-4000-8000-${opts.id.padStart(12, "0")}`,
    contentEventId: `00000000-0000-4ea1-8aaa-${opts.id.padStart(12, "0")}`,
    instanceId: INSTANCE,
    expectedChannels: opts.expectedChannels ?? {},
    expectedTags: [],
    source: "hand-labeled",
    authorId: "ieuan@local",
    createdAt: ISO,
  };
}

function signal(
  contentEventId: string,
  emissions: Record<string, { skill: string; probability: number }>,
): StructuredSignal {
  const channels: StructuredSignal["channels"] = {};
  for (const [name, em] of Object.entries(emissions)) {
    channels[name] = {
      channel: name,
      probability: em.probability,
      emittedBy: em.skill,
      confidence: 0.9,
      evidence: [],
    };
  }
  return {
    contentEventId,
    channels,
    entities: [],
    agentsRun: ["test-agent"],
    agentsFailed: [],
    latencyMs: 1,
    generatedAt: ISO,
  };
}

describe("aggregateRunCalibrations", () => {
  it("produces one row per (skill, channel) pair", () => {
    const g1 = gold({
      id: "1",
      expectedChannels: {
        toxic: { probability: 0.9, confidence: "high" },
      },
    });
    const g2 = gold({
      id: "2",
      expectedChannels: {
        toxic: { probability: 0.0, confidence: "high" },
        spam: { probability: 0.8, confidence: "high" },
      },
    });
    const predictions: RunPrediction[] = [
      {
        goldEvent: g1,
        signal: signal(g1.contentEventId, {
          toxic: { skill: "tox-skill", probability: 0.85 },
        }),
      },
      {
        goldEvent: g2,
        signal: signal(g2.contentEventId, {
          toxic: { skill: "tox-skill", probability: 0.05 },
          spam: { skill: "spam-skill", probability: 0.75 },
        }),
      },
    ];
    const cals = aggregateRunCalibrations(predictions);
    // Should produce exactly 3 rows: tox-skill x toxic, tox-skill x spam (no — different skill),
    // spam-skill x spam. Actually:
    //   tox-skill x toxic (seen on g1, g2)
    //   spam-skill x spam (seen on g2 only; g1 had no spam emission either)
    expect(cals).toHaveLength(2);
    const toxRow = cals.find(
      (c) => c.skillName === "tox-skill" && c.channelName === "toxic",
    );
    expect(toxRow?.samples).toBe(2);
    expect(toxRow?.brierScore).toBeLessThan(0.05); // very close predictions
    const spamRow = cals.find(
      (c) => c.skillName === "spam-skill" && c.channelName === "spam",
    );
    // spam-skill emitted on g2 only — but the bucket includes ALL gold events
    // we've seen (predicted=0 when absence). So samples = 2 (one event where
    // skill emitted, one where it didn't).
    expect(spamRow?.samples).toBe(2);
  });

  it("treats absence as predicted=0 and gold-absence as actual=0", () => {
    const g = gold({
      id: "3",
      expectedChannels: {}, // no channels expected
    });
    const predictions: RunPrediction[] = [
      {
        goldEvent: g,
        // No channels emitted — perfect agreement with empty gold.
        signal: signal(g.contentEventId, {}),
      },
    ];
    const cals = aggregateRunCalibrations(predictions);
    // No channels seen anywhere → no rows.
    expect(cals).toHaveLength(0);
  });

  it("flags miss-when-skill-knows-the-channel (under-prediction → high Brier)", () => {
    // Skill must have emitted `toxic` SOMEWHERE in the run for the (skill,
    // toxic) bucket to exist. Once it does, missed events on the same channel
    // contribute predicted=0 vs actual=1 to that bucket.
    //
    // (Limitation: skills that never emit a channel in the whole run are
    //  invisible to scoring on it — no manifest of "channels this skill
    //  could emit" exists today. Documented as a follow-on.)
    const g1 = gold({
      id: "5a",
      expectedChannels: { toxic: { probability: 0.9, confidence: "high" } },
    });
    const g2 = gold({
      id: "5b",
      expectedChannels: { toxic: { probability: 1.0, confidence: "high" } },
    });
    const predictions: RunPrediction[] = [
      {
        goldEvent: g1,
        // Skill emits weakly here — establishes the (tox-skill, toxic) bucket.
        signal: signal(g1.contentEventId, {
          toxic: { skill: "tox-skill", probability: 0.2 },
        }),
      },
      {
        goldEvent: g2,
        // Skill emits NOTHING — counted as predicted=0 against actual=1.
        signal: signal(g2.contentEventId, {}),
      },
    ];
    const cals = aggregateRunCalibrations(predictions);
    const toxRow = cals.find(
      (c) => c.skillName === "tox-skill" && c.channelName === "toxic",
    );
    expect(toxRow).toBeDefined();
    expect(toxRow?.samples).toBe(2);
    // Sample 1: (predicted 0.2 - actual 0.9)^2 = 0.49
    // Sample 2: (predicted 0   - actual 1.0)^2 = 1.0
    // Mean = 0.745
    expect(toxRow?.brierScore).toBeCloseTo(0.745, 3);
    // Predicted >= 0.5 fired never; actual >= 0.5 fired both → agreement 0
    expect(toxRow?.agreement).toBe(0);
  });
});

describe("tagPrecisionRecall", () => {
  it("perfect predictions: precision=recall=f1=1", () => {
    const r = tagPrecisionRecall([
      { expected: true, predicted: true },
      { expected: true, predicted: true },
      { expected: false, predicted: false },
    ]);
    expect(r.precision).toBe(1);
    expect(r.recall).toBe(1);
    expect(r.f1).toBe(1);
    // FP+FN = 0 → samples = TP only
    expect(r.samples).toBe(2);
  });

  it("model over-flags: precision drops, recall stays", () => {
    const r = tagPrecisionRecall([
      { expected: true, predicted: true },
      { expected: false, predicted: true }, // false positive
      { expected: false, predicted: true }, // false positive
    ]);
    expect(r.truePositives).toBe(1);
    expect(r.falsePositives).toBe(2);
    expect(r.precision).toBeCloseTo(1 / 3, 6);
    expect(r.recall).toBe(1);
    expect(r.f1).toBeCloseTo(0.5, 6);
  });

  it("model under-flags: recall drops, precision stays", () => {
    const r = tagPrecisionRecall([
      { expected: true, predicted: false }, // false negative
      { expected: true, predicted: false }, // false negative
      { expected: true, predicted: true },
    ]);
    expect(r.precision).toBe(1);
    expect(r.recall).toBeCloseTo(1 / 3, 6);
    expect(r.f1).toBeCloseTo(0.5, 6);
  });

  it("returns 0 across the board on zero positives (no NaN leaks)", () => {
    const r = tagPrecisionRecall([
      { expected: false, predicted: false },
      { expected: false, predicted: false },
    ]);
    expect(r.precision).toBe(0);
    expect(r.recall).toBe(0);
    expect(r.f1).toBe(0);
    expect(r.samples).toBe(0);
  });
});
