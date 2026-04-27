import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { saveContentEvent } from "../../src/repositories/content-events.js";
import { saveEmbedding } from "../../src/repositories/embeddings.js";
import { makeFindSimilarEventsTool } from "../../src/tools/find-similar.js";
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

describe("db.events.find-similar tool", () => {
  it("returns top-K neighbours ordered by similarity", async () => {
    const a = makeContentEvent();
    const b = makeContentEvent();
    const c = makeContentEvent();
    await saveContentEvent(harness.db, a);
    await saveContentEvent(harness.db, b);
    await saveContentEvent(harness.db, c);

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
      embedding: unitVector(0, 0.05), // very close to a
    });
    await saveEmbedding(harness.db, {
      contentEventId: c.id,
      instanceId: "smoke.local",
      kind: "text",
      model: "test-embed-v0",
      embedding: unitVector(100), // orthogonal — won't clear minSimilarity
    });

    const tool = makeFindSimilarEventsTool(harness.db);
    const result = await tool.run(
      {
        embedding: unitVector(0),
        kind: "text",
        limit: 5,
        minSimilarity: 0.7,
      },
      { instanceId: "smoke.local", signal: new AbortController().signal },
    );

    // a (identical) ranks first, b (jittered) ranks second; c excluded by floor.
    expect(result.count).toBe(2);
    expect(result.neighbors[0]?.contentEventId).toBe(a.id);
    expect(result.neighbors[1]?.contentEventId).toBe(b.id);
    expect(result.neighbors[0]?.similarity).toBeGreaterThan(
      result.neighbors[1]!.similarity,
    );
  });

  it("excludeContentEventId filters the source event from neighbours", async () => {
    const a = makeContentEvent();
    const b = makeContentEvent();
    await saveContentEvent(harness.db, a);
    await saveContentEvent(harness.db, b);
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
      embedding: unitVector(0, 0.05),
    });

    const tool = makeFindSimilarEventsTool(harness.db);
    const result = await tool.run(
      {
        embedding: unitVector(0),
        kind: "text",
        limit: 5,
        minSimilarity: 0.7,
        excludeContentEventId: a.id,
      },
      { instanceId: "smoke.local", signal: new AbortController().signal },
    );

    expect(result.neighbors.map((n) => n.contentEventId)).toEqual([b.id]);
  });

  it("respects per-instance scoping", async () => {
    const a = makeContentEvent({
      instance: { id: "instance-a", source: "test" },
    });
    const b = makeContentEvent({
      instance: { id: "instance-b", source: "test" },
    });
    await saveContentEvent(harness.db, a);
    await saveContentEvent(harness.db, b);
    await saveEmbedding(harness.db, {
      contentEventId: a.id,
      instanceId: "instance-a",
      kind: "text",
      model: "test-embed-v0",
      embedding: unitVector(0),
    });
    await saveEmbedding(harness.db, {
      contentEventId: b.id,
      instanceId: "instance-b",
      kind: "text",
      model: "test-embed-v0",
      embedding: unitVector(0),
    });

    const tool = makeFindSimilarEventsTool(harness.db);
    const result = await tool.run(
      {
        embedding: unitVector(0),
        kind: "text",
        limit: 5,
        minSimilarity: 0.7,
      },
      { instanceId: "instance-a", signal: new AbortController().signal },
    );

    // Only `a` should come back even though `b` has an identical vector.
    expect(result.neighbors).toHaveLength(1);
    expect(result.neighbors[0]?.contentEventId).toBe(a.id);
  });
});
