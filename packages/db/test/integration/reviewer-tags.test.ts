import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { saveContentEvent } from "../../src/repositories/content-events.js";
import {
  appendReviewDecision,
  saveReviewItem,
} from "../../src/repositories/review.js";
import * as reviewerTagsRepo from "../../src/repositories/reviewer-tags.js";
import { createTestHarness, type TestHarness } from "../harness.js";
import {
  makeContentEvent,
  makeReviewDecision,
  makeReviewItem,
} from "../fixtures.js";

let harness: TestHarness;

beforeAll(async () => {
  harness = await createTestHarness();
});
beforeEach(async () => {
  await harness.truncateAll();
});
afterAll(async () => {
  await harness.close();
});

async function setupDecision(): Promise<{
  contentEventId: string;
  reviewDecisionId: string;
  instanceId: string;
}> {
  const ev = makeContentEvent();
  await saveContentEvent(harness.db, ev);
  const item = makeReviewItem(ev.id);
  await saveReviewItem(harness.db, item);
  const decision = makeReviewDecision(item.id);
  await appendReviewDecision(harness.db, decision);
  return {
    contentEventId: ev.id,
    reviewDecisionId: decision.id,
    instanceId: ev.instance.id,
  };
}

describe("reviewer_tags repository", () => {
  it("saves a tag and lists it back via listForEvent", async () => {
    const ctx = await setupDecision();
    await reviewerTagsRepo.save(harness.db, {
      ...ctx,
      reviewerId: "ieuan@local",
      tag: {
        tagId: "text.tone-violation",
        scope: { modality: "text" },
        note: "directed at the OP",
      },
    });
    const list = await reviewerTagsRepo.listForEvent(
      harness.db,
      ctx.contentEventId,
    );
    expect(list).toHaveLength(1);
    expect(list[0]?.tagId).toBe("text.tone-violation");
    expect(list[0]?.scope?.modality).toBe("text");
    expect(list[0]?.note).toBe("directed at the OP");
  });

  it("supports multiple tags per decision", async () => {
    const ctx = await setupDecision();
    await reviewerTagsRepo.saveMany(harness.db, [
      {
        ...ctx,
        reviewerId: "ieuan@local",
        tag: { tagId: "video.visual-benign", scope: { modality: "video" } },
      },
      {
        ...ctx,
        reviewerId: "ieuan@local",
        tag: {
          tagId: "audio.harassment",
          scope: { modality: "audio", segment: { startSec: 12, endSec: 24 } },
        },
      },
    ]);
    const list = await reviewerTagsRepo.listForDecision(
      harness.db,
      ctx.reviewDecisionId,
    );
    expect(list).toHaveLength(2);
    const audio = list.find((t) => t.tagId === "audio.harassment");
    expect(audio?.scope?.segment?.startSec).toBe(12);
    expect(audio?.scope?.segment?.endSec).toBe(24);
  });

  it("frequenciesByInstance aggregates correctly", async () => {
    const ctxA = await setupDecision();
    const ctxB = await setupDecision();
    await reviewerTagsRepo.saveMany(harness.db, [
      { ...ctxA, reviewerId: "u", tag: { tagId: "text.tone-violation" } },
      { ...ctxA, reviewerId: "u", tag: { tagId: "text.coded-language" } },
      { ...ctxB, reviewerId: "u", tag: { tagId: "text.tone-violation" } },
    ]);
    const freq = await reviewerTagsRepo.frequenciesByInstance(
      harness.db,
      ctxA.instanceId,
    );
    const map = Object.fromEntries(freq.map((f) => [f.tagId, f.count]));
    expect(map["text.tone-violation"]).toBe(2);
    expect(map["text.coded-language"]).toBe(1);
  });

  it("countByInstance returns total tag count", async () => {
    const ctx = await setupDecision();
    await reviewerTagsRepo.save(harness.db, {
      ...ctx,
      reviewerId: "u",
      tag: { tagId: "text.tone-violation" },
    });
    const count = await reviewerTagsRepo.countByInstance(
      harness.db,
      ctx.instanceId,
    );
    expect(count).toBe(1);
  });

  it("cascades on review_decision delete", async () => {
    const ctx = await setupDecision();
    await reviewerTagsRepo.save(harness.db, {
      ...ctx,
      reviewerId: "u",
      tag: { tagId: "text.tone-violation" },
    });

    await harness.db.execute(
      // @ts-expect-error — pglite tagged-template SQL
      `DELETE FROM review_decisions WHERE id = '${ctx.reviewDecisionId}'`,
    );

    const after = await reviewerTagsRepo.listForEvent(
      harness.db,
      ctx.contentEventId,
    );
    expect(after).toHaveLength(0);
  });
});
