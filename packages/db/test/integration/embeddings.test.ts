import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { saveContentEvent } from "../../src/repositories/content-events.js";
import {
  findSimilarEvents,
  saveEmbedding,
} from "../../src/repositories/embeddings.js";
import { createTestHarness, type TestHarness } from "../harness.js";
import { makeContentEvent } from "../fixtures.js";

const DIM = 1536;

function unitVector(seedAxis: number, jitter = 0): number[] {
  const v = new Array<number>(DIM).fill(0);
  v[seedAxis] = 1;
  if (jitter !== 0 && seedAxis + 1 < DIM) {
    v[seedAxis] = Math.sqrt(1 - jitter * jitter);
    v[seedAxis + 1] = jitter;
  }
  return v;
}

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

describe("event embeddings + cosine similarity", () => {
  it("persists and retrieves the closest neighbor first", async () => {
    const a = makeContentEvent();
    const b = makeContentEvent();
    const c = makeContentEvent();
    await saveContentEvent(harness.db, a);
    await saveContentEvent(harness.db, b);
    await saveContentEvent(harness.db, c);

    // a and the query are identical; b is rotated slightly; c is orthogonal.
    await saveEmbedding(harness.db, {
      contentEventId: a.id,
      instanceId: "smoke.local",
      kind: "text",
      model: "test-embed-v0",
      embedding: unitVector(0),
    });
    await saveEmbedding(harness.db, {
      contentEventId: b.id,
      instanceId: "smoke.local",
      kind: "text",
      model: "test-embed-v0",
      embedding: unitVector(0, 0.2),
    });
    await saveEmbedding(harness.db, {
      contentEventId: c.id,
      instanceId: "smoke.local",
      kind: "text",
      model: "test-embed-v0",
      embedding: unitVector(100),
    });

    const hits = await findSimilarEvents(harness.db, {
      instanceId: "smoke.local",
      kind: "text",
      embedding: unitVector(0),
      limit: 5,
      minSimilarity: 0.5,
    });

    expect(hits[0]?.contentEventId).toBe(a.id);
    expect(hits[0]?.similarity).toBeCloseTo(1, 5);
    expect(hits.map((h) => h.contentEventId)).toContain(b.id);
    expect(hits.map((h) => h.contentEventId)).not.toContain(c.id);
  });

  it("upserts on (event, kind)", async () => {
    const event = makeContentEvent();
    await saveContentEvent(harness.db, event);

    await saveEmbedding(harness.db, {
      contentEventId: event.id,
      instanceId: "smoke.local",
      kind: "text",
      model: "v0",
      embedding: unitVector(0),
    });
    await saveEmbedding(harness.db, {
      contentEventId: event.id,
      instanceId: "smoke.local",
      kind: "text",
      model: "v1",
      embedding: unitVector(50),
    });

    const hits = await findSimilarEvents(harness.db, {
      instanceId: "smoke.local",
      kind: "text",
      embedding: unitVector(50),
      limit: 5,
      minSimilarity: 0.5,
    });
    expect(hits[0]?.contentEventId).toBe(event.id);
  });
});
