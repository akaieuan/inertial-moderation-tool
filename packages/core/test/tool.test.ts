import { describe, expect, it } from "vitest";
import {
  SkillRegistry,
  ToolRegistry,
  TraceCollector,
  makeSkillContext,
  type Tool,
} from "../src/index.js";

function makeAuthorTool(): Tool<{ authorId: string }, { count: number }> {
  return {
    meta: {
      name: "test-author-history",
      version: "0.1.0",
      kind: "db",
      description: "test",
      mutates: false,
    },
    async run(input) {
      return { count: input.authorId.length };
    },
  };
}

describe("ToolRegistry", () => {
  it("registers and retrieves a tool", () => {
    const reg = new ToolRegistry().register(makeAuthorTool());
    expect(reg.has("test-author-history")).toBe(true);
    expect(reg.get("test-author-history")?.meta.name).toBe("test-author-history");
  });

  it("throws on duplicate registration", () => {
    const reg = new ToolRegistry().register(makeAuthorTool());
    expect(() => reg.register(makeAuthorTool())).toThrow(/already registered/);
  });

  it("require() throws when missing", () => {
    const reg = new ToolRegistry();
    expect(() => reg.require("missing")).toThrow(/not registered/);
  });
});

describe("SkillContext.callTool — auto-tracing", () => {
  it("records tool-call + tool-result steps on success", async () => {
    const trace = new TraceCollector();
    const ctx = makeSkillContext({
      trace,
      tools: new ToolRegistry().register(makeAuthorTool()),
      skills: new SkillRegistry(),
      signal: new AbortController().signal,
      runId: "run-1",
      instanceId: "tenant.a",
    });

    const result = await ctx.callTool<{ authorId: string }, { count: number }>(
      "test-author-history",
      { authorId: "alice" },
    );
    expect(result.count).toBe(5);

    const finalized = trace.finalize({
      agent: "test",
      contentEventId: "00000000-0000-4000-8000-000000000000",
      model: "test",
      startedAt: new Date().toISOString(),
    });

    const kinds = finalized.steps.map((s) => s.kind);
    expect(kinds).toContain("tool-call");
    expect(kinds).toContain("tool-result");
  });

  it("records an error step + re-throws on tool failure", async () => {
    const trace = new TraceCollector();
    const failingTool: Tool<unknown, unknown> = {
      meta: {
        name: "failing-tool",
        version: "0.1.0",
        kind: "db",
        description: "intentional failure",
        mutates: false,
      },
      async run() {
        throw new Error("boom");
      },
    };
    const ctx = makeSkillContext({
      trace,
      tools: new ToolRegistry().register(failingTool),
      skills: new SkillRegistry(),
      signal: new AbortController().signal,
      runId: "run-1",
      instanceId: "tenant.a",
    });

    await expect(ctx.callTool("failing-tool", {})).rejects.toThrow("boom");

    const finalized = trace.finalize({
      agent: "test",
      contentEventId: "00000000-0000-4000-8000-000000000000",
      model: "test",
      startedAt: new Date().toISOString(),
    });
    const kinds = finalized.steps.map((s) => s.kind);
    expect(kinds).toContain("tool-call");
    expect(kinds).toContain("error");
  });

  it("throws if the tool isn't registered", async () => {
    const trace = new TraceCollector();
    const ctx = makeSkillContext({
      trace,
      tools: new ToolRegistry(),
      skills: new SkillRegistry(),
      signal: new AbortController().signal,
      runId: "run-1",
      instanceId: "tenant.a",
    });
    await expect(ctx.callTool("missing", {})).rejects.toThrow(/not registered/);
  });
});
