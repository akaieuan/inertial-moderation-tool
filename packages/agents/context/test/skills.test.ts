import { describe, expect, it, vi } from "vitest";
import {
  SkillRegistry,
  ToolRegistry,
  TraceCollector,
  makeSkillContext,
} from "@inertial/core";
import {
  textContextAuthorSkill,
  textContextSimilarSkill,
  type ContextSkillInput,
} from "../src/index.js";

function makeCtxWithToolStub(stub: (name: string, input: unknown) => Promise<unknown>) {
  const trace = new TraceCollector();
  const skills = new SkillRegistry();
  const tools = new ToolRegistry();
  const ctx = makeSkillContext({
    trace,
    tools,
    skills,
    signal: new AbortController().signal,
    runId: "run-1",
    instanceId: "smoke.local",
  });
  // Replace callTool with the stub. The original wraps Tool registry lookups;
  // for these tests we want full control over the synthetic tool outputs.
  (ctx as { callTool: (name: string, input: unknown) => Promise<unknown> }).callTool = stub;
  return { ctx, trace };
}

const baseInput: ContextSkillInput = {
  contentEventId: "00000000-0000-0000-0000-000000000001",
  authorId: "author-1",
  instanceId: "smoke.local",
};

describe("textContextAuthorSkill", () => {
  it("emits no channel when author has zero prior events (absence is meaningful)", async () => {
    const { ctx } = makeCtxWithToolStub(async () => ({
      events: [],
      count: 0,
      totalPriorActions: 0,
    }));
    const result = await textContextAuthorSkill.run(baseInput, ctx);
    expect(result.channels).toEqual([]);
  });

  it("scales probability by totalPriorActions / 5", async () => {
    const { ctx } = makeCtxWithToolStub(async () => ({
      events: [{ id: "e1" }, { id: "e2" }, { id: "e3" }],
      count: 3,
      totalPriorActions: 2,
    }));
    const result = await textContextAuthorSkill.run(baseInput, ctx);
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]?.channel).toBe("context.author-prior-actions");
    expect(result.channels[0]?.probability).toBeCloseTo(0.4, 5);
  });

  it("clamps probability at 1.0 for heavy-reputation authors", async () => {
    const { ctx } = makeCtxWithToolStub(async () => ({
      events: [{ id: "e1" }],
      count: 1,
      totalPriorActions: 50,
    }));
    const result = await textContextAuthorSkill.run(baseInput, ctx);
    expect(result.channels[0]?.probability).toBe(1.0);
  });

  it("attaches author-history evidence with up to 5 recent event ids", async () => {
    const events = Array.from({ length: 10 }, (_, i) => ({ id: `e${i}` }));
    const { ctx } = makeCtxWithToolStub(async () => ({
      events,
      count: 10,
      totalPriorActions: 4,
    }));
    const result = await textContextAuthorSkill.run(baseInput, ctx);
    const ev = result.channels[0]?.evidence[0];
    if (!ev || ev.kind !== "author-history") {
      throw new Error("expected author-history evidence");
    }
    expect(ev.recentEventIds).toEqual(["e0", "e1", "e2", "e3", "e4"]);
    expect(ev.priorActionCount).toBe(4);
    expect(ev.authorId).toBe(baseInput.authorId);
  });
});

describe("textContextSimilarSkill", () => {
  it("returns no channels when no embedding exists for this event", async () => {
    const stub = vi.fn(async (name: string) => {
      if (name === "db.embeddings.get") return { embedding: null, model: null };
      throw new Error(`unexpected tool: ${name}`);
    });
    const { ctx } = makeCtxWithToolStub(stub);
    const result = await textContextSimilarSkill.run(baseInput, ctx);
    expect(result.channels).toEqual([]);
    expect(stub).toHaveBeenCalledTimes(1); // never asked for similar events
  });

  it("returns no channels when find-similar returns zero neighbours", async () => {
    const { ctx } = makeCtxWithToolStub(async (name) => {
      if (name === "db.embeddings.get") return { embedding: [0.1, 0.2], model: "v" };
      if (name === "db.events.find-similar") return { neighbors: [], count: 0 };
      throw new Error(`unexpected tool: ${name}`);
    });
    const result = await textContextSimilarSkill.run(baseInput, ctx);
    expect(result.channels).toEqual([]);
  });

  it("emits a channel with top-similarity probability + similarity-cluster evidence", async () => {
    const { ctx } = makeCtxWithToolStub(async (name, input) => {
      if (name === "db.embeddings.get") return { embedding: [0.1, 0.2], model: "v" };
      if (name === "db.events.find-similar") {
        // Sanity: skill must ask to exclude its own event id.
        const i = input as { excludeContentEventId?: string };
        expect(i.excludeContentEventId).toBe(baseInput.contentEventId);
        return {
          neighbors: [
            { contentEventId: "neighbour-a", similarity: 0.91 },
            { contentEventId: "neighbour-b", similarity: 0.84 },
          ],
          count: 2,
        };
      }
      throw new Error(`unexpected tool: ${name}`);
    });
    const result = await textContextSimilarSkill.run(baseInput, ctx);
    expect(result.channels).toHaveLength(1);
    expect(result.channels[0]?.channel).toBe("context.similar-events-recent");
    expect(result.channels[0]?.probability).toBeCloseTo(0.91, 5);
    const ev = result.channels[0]?.evidence[0];
    if (!ev || ev.kind !== "similarity-cluster") {
      throw new Error("expected similarity-cluster evidence");
    }
    expect(ev.neighbors).toHaveLength(2);
    expect(ev.neighbors[0]?.contentEventId).toBe("neighbour-a");
    expect(ev.neighbors[0]?.similarity).toBeCloseTo(0.91, 5);
  });
});
