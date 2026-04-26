import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { saveContentEvent } from "../../src/repositories/content-events.js";
import {
  appendReviewDecision,
  getReviewItem,
  listReviewItems,
  saveReviewItem,
  updateReviewItemState,
} from "../../src/repositories/review.js";
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

describe("review queue", () => {
  it("persists a ReviewItem with no decisions, then reads it back", async () => {
    const event = makeContentEvent();
    await saveContentEvent(harness.db, event);
    const item = makeReviewItem(event.id);

    await saveReviewItem(harness.db, item);
    const fetched = await getReviewItem(harness.db, item.id);
    expect(fetched).toEqual(item);
  });

  it("filters by queue and state when listing", async () => {
    const event = makeContentEvent();
    await saveContentEvent(harness.db, event);
    const quick = makeReviewItem(event.id, { queue: "quick", state: "pending" });
    const deep = makeReviewItem(event.id, { queue: "deep", state: "pending" });
    const decided = makeReviewItem(event.id, {
      queue: "quick",
      state: "decided",
    });
    await saveReviewItem(harness.db, quick);
    await saveReviewItem(harness.db, deep);
    await saveReviewItem(harness.db, decided);

    const pendingQuick = await listReviewItems(harness.db, "smoke.local", {
      queue: "quick",
      state: "pending",
    });
    expect(pendingQuick.map((r) => r.id)).toEqual([quick.id]);
  });

  it("appends a decision and includes it on read", async () => {
    const event = makeContentEvent();
    await saveContentEvent(harness.db, event);
    const item = makeReviewItem(event.id);
    await saveReviewItem(harness.db, item);

    const decision = makeReviewDecision(item.id, { verdict: "remove" });
    await appendReviewDecision(harness.db, decision);

    const fetched = await getReviewItem(harness.db, item.id);
    expect(fetched?.decisions).toHaveLength(1);
    expect(fetched?.decisions[0]?.verdict).toBe("remove");
  });

  it("updates state and finalVerdict atomically", async () => {
    const event = makeContentEvent();
    await saveContentEvent(harness.db, event);
    const item = makeReviewItem(event.id);
    await saveReviewItem(harness.db, item);

    await updateReviewItemState(harness.db, item.id, "decided", "approve");
    const fetched = await getReviewItem(harness.db, item.id);
    expect(fetched?.state).toBe("decided");
    expect(fetched?.finalVerdict).toBe("approve");
  });
});
