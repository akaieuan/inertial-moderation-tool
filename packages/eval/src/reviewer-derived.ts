import { randomUUID } from "node:crypto";
import type {
  ContentEvent,
  ExpectedChannel,
  ExpectedTag,
  GoldEvent,
  ReviewDecision,
  StructuredSignal,
} from "@inertial/schemas";

/**
 * Convert a reviewer's commit decision into a gold-set entry.
 *
 * The translation rules:
 *  - For each `signalFeedback` entry the reviewer gave:
 *      - `correctedProbability` set    → use that as the expected probability
 *      - `agreed === true`             → use the channel's emitted probability
 *      - `agreed === false` (no fix)   → expected probability = 0
 *        (channel shouldn't have fired at all)
 *  - Channels emitted by the signal but with no feedback entry are SKIPPED —
 *    we don't assume agreement from silence; the reviewer might just not have
 *    looked at that channel.
 *
 * Returns null when the decision has no signalFeedback (no info to extract).
 *
 * The gold event is idempotent on (contentEventId, source) so re-saving an
 * updated decision overwrites any prior reviewer-derived label for the same
 * event — see `gold_events` repo's upsert.
 */
export function convertDecisionToGoldEvent(opts: {
  decision: ReviewDecision;
  contentEvent: ContentEvent;
  signal: StructuredSignal | null;
  /** Confidence to stamp on each derived expectation. Reviewers in this
   *  pipeline are trusted by default — `high`. Multi-reviewer consensus
   *  could downgrade or upgrade in a follow-up phase. */
  confidence?: ExpectedChannel["confidence"];
}): GoldEvent | null {
  const { decision, contentEvent, signal } = opts;
  // Accept either signal feedback OR reviewer tags as enough info to make
  // a gold event — both ARE labels.
  const hasFeedback = (decision.signalFeedback ?? []).length > 0;
  const hasTags = (decision.reviewerTags ?? []).length > 0;
  if (!hasFeedback && !hasTags) {
    return null;
  }

  const confidence: ExpectedChannel["confidence"] = opts.confidence ?? "high";
  const channels = signal?.channels ?? {};
  const expected: Record<string, ExpectedChannel> = {};

  for (const fb of decision.signalFeedback ?? []) {
    let expectedProbability: number;
    if (typeof fb.correctedProbability === "number") {
      expectedProbability = clamp01(fb.correctedProbability);
    } else if (fb.agreed) {
      const emitted = channels[fb.channel];
      if (!emitted) {
        // Reviewer agreed with a channel that the signal doesn't have.
        // Treat as "should fire" but at unknown probability — default 1.0
        // is the reviewer's strongest possible affirmation.
        expectedProbability = 1.0;
      } else {
        expectedProbability = emitted.probability;
      }
    } else {
      // Disagreed without a correction — channel should NOT have fired.
      expectedProbability = 0;
    }
    expected[fb.channel] = { probability: expectedProbability, confidence };
  }

  // Reviewer tags lift directly into expectedTags on the gold event — they
  // ARE the labels. Confidence inherits from the same `confidence` parameter.
  const expectedTags: ExpectedTag[] = (decision.reviewerTags ?? []).map((t) => ({
    tagId: t.tagId,
    scope: t.scope,
    confidence,
  }));

  // No information at all (no signal feedback AND no tags) → no gold event.
  if (Object.keys(expected).length === 0 && expectedTags.length === 0) return null;

  return {
    id: randomUUID(),
    contentEventId: contentEvent.id,
    instanceId: contentEvent.instance.id,
    expectedChannels: expected,
    expectedTags,
    source: "reviewer-derived",
    authorId: decision.reviewerId,
    notes: decision.rationale,
    createdAt: decision.decidedAt,
  };
}

function clamp01(n: number): number {
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}
