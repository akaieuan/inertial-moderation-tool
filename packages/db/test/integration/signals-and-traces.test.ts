import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { saveContentEvent } from "../../src/repositories/content-events.js";
import {
  getStructuredSignal,
  saveStructuredSignal,
} from "../../src/repositories/structured-signals.js";
import {
  listAgentTracesForEvent,
  saveAgentTrace,
} from "../../src/repositories/agent-traces.js";
import { createTestHarness, type TestHarness } from "../harness.js";
import { makeAgentTrace, makeContentEvent, makeStructuredSignal } from "../fixtures.js";

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

describe("structured signals + agent traces", () => {
  it("persists and reads a StructuredSignal verbatim", async () => {
    const event = makeContentEvent();
    await saveContentEvent(harness.db, event);
    const signal = makeStructuredSignal(event.id);

    await saveStructuredSignal(harness.db, signal, event.instance.id);
    const fetched = await getStructuredSignal(harness.db, event.id);
    expect(fetched).toEqual(signal);
  });

  it("saveStructuredSignal upserts on conflict", async () => {
    const event = makeContentEvent();
    await saveContentEvent(harness.db, event);
    const signal = makeStructuredSignal(event.id);
    await saveStructuredSignal(harness.db, signal, event.instance.id);

    const updated = makeStructuredSignal(event.id, {
      latencyMs: 999,
      agentsRun: ["text-agent", "context-agent"],
    });
    await saveStructuredSignal(harness.db, updated, event.instance.id);

    const fetched = await getStructuredSignal(harness.db, event.id);
    expect(fetched?.latencyMs).toBe(999);
    expect(fetched?.agentsRun).toEqual(["text-agent", "context-agent"]);
  });

  it("stores multiple traces per event and returns them in start order", async () => {
    const event = makeContentEvent();
    await saveContentEvent(harness.db, event);

    const t0 = makeAgentTrace(event.id, {
      agent: "text-agent",
      startedAt: "2026-04-25T12:00:00.000Z",
      endedAt: "2026-04-25T12:00:01.000Z",
    });
    const t1 = makeAgentTrace(event.id, {
      agent: "context-agent",
      startedAt: "2026-04-25T12:00:02.000Z",
      endedAt: "2026-04-25T12:00:03.000Z",
    });
    await saveAgentTrace(harness.db, t1); // insert reversed
    await saveAgentTrace(harness.db, t0);

    const traces = await listAgentTracesForEvent(harness.db, event.id);
    expect(traces.map((t) => t.agent)).toEqual(["text-agent", "context-agent"]);
  });

  it("preserves usage tokens + cost when present", async () => {
    const event = makeContentEvent();
    await saveContentEvent(harness.db, event);
    const trace = makeAgentTrace(event.id, {
      usage: { inputTokens: 1234, outputTokens: 56, costUsd: 0.0123 },
    });
    await saveAgentTrace(harness.db, trace);

    const [fetched] = await listAgentTracesForEvent(harness.db, event.id);
    expect(fetched?.usage).toEqual({
      inputTokens: 1234,
      outputTokens: 56,
      costUsd: 0.0123,
    });
  });

  it("omits the usage block when no fields are set", async () => {
    const event = makeContentEvent();
    await saveContentEvent(harness.db, event);
    const trace = makeAgentTrace(event.id);
    await saveAgentTrace(harness.db, trace);

    const [fetched] = await listAgentTracesForEvent(harness.db, event.id);
    expect(fetched?.usage).toBeUndefined();
  });
});
