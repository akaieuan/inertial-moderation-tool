import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getContentEvent,
  listContentEventsByAuthor,
  listContentEventsByInstance,
  saveContentEvent,
} from "../../src/repositories/content-events.js";
import { createTestHarness, type TestHarness } from "../harness.js";
import { makeContentEvent } from "../fixtures.js";

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

describe("content events repository", () => {
  it("round-trips a ContentEvent without losing fidelity", async () => {
    const event = makeContentEvent({
      modalities: ["text", "image"],
      media: [
        {
          id: "00000000-0000-4000-8000-000000000000",
          modality: "image",
          url: "https://internal/asset/1",
          perceptualHash: "abcdef0123456789",
          mimeType: "image/jpeg",
          bytes: 12_345,
          width: 1920,
          height: 1080,
        },
      ],
      hasContentWarning: true,
      contentWarningText: "spoiler",
      author: {
        id: "user-42",
        handle: "alice",
        displayName: "Alice",
        accountAgeDays: 365,
        priorActionCount: 2,
      },
      report: {
        reporterId: "reporter-7",
        reportedAt: new Date().toISOString(),
        reason: "spam",
      },
      raw: { mastodonStatusId: "12345" },
    });

    await saveContentEvent(harness.db, event);
    const fetched = await getContentEvent(harness.db, event.id);
    expect(fetched).toEqual(event);
  });

  it("returns null for unknown ids", async () => {
    expect(
      await getContentEvent(harness.db, "11111111-1111-4111-8111-111111111111"),
    ).toBeNull();
  });

  it("upserts on conflict so re-ingest is idempotent", async () => {
    const event = makeContentEvent({ text: "first" });
    await saveContentEvent(harness.db, event);
    await saveContentEvent(harness.db, { ...event, text: "second" });

    const fetched = await getContentEvent(harness.db, event.id);
    expect(fetched?.text).toBe("second");
  });

  it("lists events by instance, newest first", async () => {
    const a = makeContentEvent({ postedAt: "2026-01-01T00:00:00.000Z" });
    const b = makeContentEvent({ postedAt: "2026-02-01T00:00:00.000Z" });
    const c = makeContentEvent({ postedAt: "2026-03-01T00:00:00.000Z" });
    await saveContentEvent(harness.db, a);
    await saveContentEvent(harness.db, b);
    await saveContentEvent(harness.db, c);

    const events = await listContentEventsByInstance(harness.db, "smoke.local");
    expect(events.map((e) => e.id)).toEqual([c.id, b.id, a.id]);
  });

  it("filters by author when listing", async () => {
    const alice = makeContentEvent({
      author: { id: "alice", handle: "alice", priorActionCount: 0 },
    });
    const bob = makeContentEvent({
      author: { id: "bob", handle: "bob", priorActionCount: 0 },
    });
    await saveContentEvent(harness.db, alice);
    await saveContentEvent(harness.db, bob);

    const aliceEvents = await listContentEventsByAuthor(
      harness.db,
      "smoke.local",
      "alice",
    );
    expect(aliceEvents).toHaveLength(1);
    expect(aliceEvents[0]?.author.id).toBe("alice");
  });
});
