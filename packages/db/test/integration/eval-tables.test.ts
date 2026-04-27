import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { GoldEvent } from "@inertial/schemas";
import { saveContentEvent } from "../../src/repositories/content-events.js";
import * as goldEventsRepo from "../../src/repositories/gold-events.js";
import * as evalRunsRepo from "../../src/repositories/eval-runs.js";
import * as skillCalibrationsRepo from "../../src/repositories/skill-calibrations.js";
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

function makeGold(event: { id: string; instance: { id: string } }, overrides: Partial<GoldEvent> = {}): GoldEvent {
  return {
    id: randomUUID(),
    contentEventId: event.id,
    instanceId: event.instance.id,
    expectedChannels: {
      toxic: { probability: 0.9, confidence: "high" },
    },
    expectedTags: [],
    source: "hand-labeled",
    authorId: "ieuan@local",
    notes: "test gold",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("gold_events repository", () => {
  it("upserts on (contentEventId, source) — re-saving replaces", async () => {
    const ev = makeContentEvent();
    await saveContentEvent(harness.db, ev);

    const g1 = makeGold(ev, { notes: "first" });
    await goldEventsRepo.save(harness.db, g1);
    const g2 = { ...g1, notes: "updated" };
    await goldEventsRepo.save(harness.db, g2);

    const list = await goldEventsRepo.listByInstance(harness.db, ev.instance.id);
    expect(list).toHaveLength(1);
    expect(list[0]?.notes).toBe("updated");
  });

  it("listByInstance filters by channel via JSONB containment", async () => {
    const ev1 = makeContentEvent();
    const ev2 = makeContentEvent();
    await saveContentEvent(harness.db, ev1);
    await saveContentEvent(harness.db, ev2);
    await goldEventsRepo.save(
      harness.db,
      makeGold(ev1, {
        expectedChannels: { toxic: { probability: 0.9, confidence: "high" } },
      }),
    );
    await goldEventsRepo.save(
      harness.db,
      makeGold(ev2, {
        expectedChannels: {
          "spam-link-presence": { probability: 0.8, confidence: "high" },
        },
      }),
    );

    const toxic = await goldEventsRepo.listByInstance(harness.db, ev1.instance.id, {
      channel: "toxic",
    });
    expect(toxic).toHaveLength(1);
    expect(toxic[0]?.contentEventId).toBe(ev1.id);

    const spam = await goldEventsRepo.listByInstance(harness.db, ev1.instance.id, {
      channel: "spam-link-presence",
    });
    expect(spam).toHaveLength(1);
    expect(spam[0]?.contentEventId).toBe(ev2.id);
  });

  it("countByInstance returns the right count", async () => {
    const ev = makeContentEvent();
    await saveContentEvent(harness.db, ev);
    await goldEventsRepo.save(harness.db, makeGold(ev));
    const count = await goldEventsRepo.countByInstance(harness.db, ev.instance.id);
    expect(count).toBe(1);
  });
});

describe("eval_runs + skill_calibrations lifecycle", () => {
  it("start → complete persists calibrations and updates the row", async () => {
    const run = await evalRunsRepo.start(harness.db, {
      instanceId: "test-instance",
      goldSetVersion: "v1",
      goldSetSize: 10,
      triggeredBy: "test",
    });
    expect(run.status).toBe("running");
    expect(run.skillCalibrations).toEqual([]);

    const completed = await evalRunsRepo.complete(harness.db, run.id, {
      meanLatencyMs: 42,
      calibrations: [
        {
          skillName: "tox-skill",
          channelName: "toxic",
          brierScore: 0.05,
          ece: 0.02,
          agreement: 0.95,
          samples: 10,
          meanPredicted: 0.4,
          meanActual: 0.42,
        },
      ],
    });
    expect(completed?.status).toBe("completed");
    expect(completed?.meanLatencyMs).toBe(42);

    // Read back via getById to confirm calibrations are joined.
    const fetched = await evalRunsRepo.getById(harness.db, run.id);
    expect(fetched?.status).toBe("completed");
    expect(fetched?.skillCalibrations).toHaveLength(1);
    expect(fetched?.skillCalibrations[0]?.skillName).toBe("tox-skill");
    expect(fetched?.skillCalibrations[0]?.brierScore).toBeCloseTo(0.05, 4);
  });

  it("getLatestCompleted skips running rows in favour of completed ones", async () => {
    // Create one completed older + one running newer.
    const older = await evalRunsRepo.start(harness.db, {
      instanceId: "test-instance",
      goldSetVersion: "v1",
      goldSetSize: 5,
    });
    await evalRunsRepo.complete(harness.db, older.id, {
      meanLatencyMs: 10,
      calibrations: [],
    });
    await new Promise((r) => setTimeout(r, 10));
    await evalRunsRepo.start(harness.db, {
      instanceId: "test-instance",
      goldSetVersion: "v1",
      goldSetSize: 5,
    });

    const latest = await evalRunsRepo.getLatestCompleted(
      harness.db,
      "test-instance",
    );
    expect(latest?.id).toBe(older.id);
  });

  it("calibrations cascade-delete with the run", async () => {
    const run = await evalRunsRepo.start(harness.db, {
      instanceId: "test-instance",
      goldSetVersion: "v1",
      goldSetSize: 5,
    });
    await skillCalibrationsRepo.saveMany(harness.db, run.id, [
      {
        skillName: "s",
        channelName: "c",
        brierScore: 0,
        ece: 0,
        agreement: 1,
        samples: 1,
        meanPredicted: 0,
        meanActual: 0,
      },
    ]);
    const before = await skillCalibrationsRepo.listForRun(harness.db, run.id);
    expect(before).toHaveLength(1);

    // Delete via raw SQL since the repo doesn't expose a delete helper.
    await harness.db.execute(
      // @ts-expect-error — pglite tagged-template SQL.
      `DELETE FROM eval_runs WHERE id = '${run.id}'`,
    );
    const after = await skillCalibrationsRepo.listForRun(harness.db, run.id);
    expect(after).toHaveLength(0);
  });
});
