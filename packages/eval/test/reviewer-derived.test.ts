import { describe, expect, it } from "vitest";
import type {
  ContentEvent,
  ReviewDecision,
  StructuredSignal,
} from "@inertial/schemas";
import { convertDecisionToGoldEvent } from "../src/reviewer-derived.js";

const ISO = "2026-04-26T11:00:00.000Z";

function event(): ContentEvent {
  return {
    id: "00000000-0000-4ea1-8aaa-000000000001",
    sourceId: "src-1",
    source: "test",
    instance: { id: "default", source: "test" },
    modalities: ["text"],
    text: "hello",
    links: [],
    media: [],
    hasContentWarning: false,
    author: { id: "u-1", handle: "alice", priorActionCount: 0 },
    postedAt: ISO,
    ingestedAt: ISO,
  };
}

function signal(channels: Record<string, number>): StructuredSignal {
  return {
    contentEventId: event().id,
    channels: Object.fromEntries(
      Object.entries(channels).map(([name, p]) => [
        name,
        {
          channel: name,
          probability: p,
          emittedBy: "test-skill",
          confidence: 0.9,
          evidence: [],
        },
      ]),
    ),
    entities: [],
    agentsRun: [],
    agentsFailed: [],
    latencyMs: 1,
    generatedAt: ISO,
  };
}

function decision(opts: Partial<ReviewDecision> = {}): ReviewDecision {
  return {
    id: "00000000-0000-4dcb-8aaa-000000000001",
    reviewItemId: "00000000-0000-4ea1-8bbb-000000000001",
    reviewerId: "ieuan@local",
    verdict: "remove",
    rationale: "violation",
    signalFeedback: [],
    reviewerTags: [],
    aiQualityScale: 3,
    decidedAt: ISO,
    durationMs: 4_800,
    ...opts,
  };
}

describe("convertDecisionToGoldEvent", () => {
  it("returns null when decision has no feedback AND no tags", () => {
    const result = convertDecisionToGoldEvent({
      decision: decision({ signalFeedback: [], reviewerTags: [] }),
      contentEvent: event(),
      signal: null,
    });
    expect(result).toBeNull();
  });

  it("uses signal probability when reviewer agreed", () => {
    const result = convertDecisionToGoldEvent({
      decision: decision({
        signalFeedback: [{ channel: "toxic", agreed: true }],
      }),
      contentEvent: event(),
      signal: signal({ toxic: 0.92 }),
    });
    expect(result).not.toBeNull();
    expect(result!.expectedChannels.toxic).toEqual({
      probability: 0.92,
      confidence: "high",
    });
  });

  it("uses correctedProbability when present, ignoring agreed", () => {
    const result = convertDecisionToGoldEvent({
      decision: decision({
        signalFeedback: [
          { channel: "toxic", agreed: true, correctedProbability: 0.5 },
        ],
      }),
      contentEvent: event(),
      signal: signal({ toxic: 0.92 }),
    });
    expect(result!.expectedChannels.toxic.probability).toBe(0.5);
  });

  it("emits expected probability 0 when reviewer disagreed without correction", () => {
    const result = convertDecisionToGoldEvent({
      decision: decision({
        signalFeedback: [{ channel: "toxic", agreed: false }],
      }),
      contentEvent: event(),
      signal: signal({ toxic: 0.92 }),
    });
    expect(result!.expectedChannels.toxic.probability).toBe(0);
  });

  it("lifts reviewerTags into expectedTags", () => {
    const result = convertDecisionToGoldEvent({
      decision: decision({
        reviewerTags: [
          { tagId: "text.tone-violation", scope: { modality: "text" } },
          { tagId: "cross-modal.satire-flag" },
        ],
      }),
      contentEvent: event(),
      signal: null,
    });
    expect(result).not.toBeNull();
    expect(result!.expectedTags).toHaveLength(2);
    expect(result!.expectedTags[0]).toMatchObject({
      tagId: "text.tone-violation",
      scope: { modality: "text" },
      confidence: "high",
    });
  });

  it("works with tags only (no signal feedback)", () => {
    const result = convertDecisionToGoldEvent({
      decision: decision({
        signalFeedback: [],
        reviewerTags: [{ tagId: "image.benign" }],
      }),
      contentEvent: event(),
      signal: null,
    });
    expect(result).not.toBeNull();
    expect(result!.expectedTags).toHaveLength(1);
    expect(Object.keys(result!.expectedChannels)).toHaveLength(0);
  });
});
