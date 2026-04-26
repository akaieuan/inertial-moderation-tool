/**
 * Shadow agreement helper — pairs silent skill predictions with reviewer
 * decisions and reports per-skill calibration stats. This is the read-side
 * of the puppet-runs pillar.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentTrace, ContentEvent, ReviewItem } from "@inertial/schemas";
import { saveContentEvent } from "../../src/repositories/content-events.js";
import { saveAgentTrace } from "../../src/repositories/agent-traces.js";
import {
  appendReviewDecision,
  saveReviewItem,
  updateReviewItemState,
} from "../../src/repositories/review.js";
import { getSkillAgreement } from "../../src/repositories/shadow.js";
import { createTestHarness, type TestHarness } from "../harness.js";
import {
  makeAgentTrace,
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

interface CasePart {
  /** Did the shadow skill emit a high-probability decision? */
  shadowFlagged: boolean;
  /** Reviewer's verdict — "approve"/"skip" = not flagged, anything else = flagged. */
  verdict: ReviewItem["finalVerdict"];
}

async function seedCase(
  instance: string,
  skillName: string,
  parts: readonly CasePart[],
): Promise<void> {
  for (const part of parts) {
    const event = makeContentEvent({ instance: { id: instance, source: "test" } });
    await saveContentEvent(harness.db, event);

    const item: ReviewItem = {
      ...makeReviewItem(event.id, { instanceId: instance }),
      state: "decided",
      finalVerdict: part.verdict,
    };
    await saveReviewItem(harness.db, item);
    await updateReviewItemState(harness.db, item.id, "decided", part.verdict);
    await appendReviewDecision(
      harness.db,
      makeReviewDecision(item.id, { verdict: part.verdict ?? "approve" }),
    );

    // Build a shadow trace with one decision step at probability above or
    // below the 0.5 flag threshold.
    const trace: AgentTrace = makeAgentTrace(event.id, {
      agent: `shadow:${skillName}`,
      model: skillName,
      steps: [
        {
          kind: "decision",
          channel: "toxic",
          probability: part.shadowFlagged ? 0.8 : 0.2,
          rationale: "test",
          timestamp: new Date().toISOString(),
        },
      ],
    });
    await saveAgentTrace(harness.db, trace);
  }
}

describe("getSkillAgreement", () => {
  it("returns empty when no decided reviews exist", async () => {
    const out = await getSkillAgreement(harness.db, "tenant.a");
    expect(out).toEqual([]);
  });

  it("counts pairs and computes agreement per skill", async () => {
    // 4 cases: 2 agreed, 1 missed, 1 over-flagged.
    await seedCase("tenant.a", "claude-shadow", [
      { shadowFlagged: true, verdict: "remove" }, // agreed (both flagged)
      { shadowFlagged: false, verdict: "approve" }, // agreed (both clean)
      { shadowFlagged: false, verdict: "remove" }, // shadow missed
      { shadowFlagged: true, verdict: "approve" }, // shadow over-flagged
    ]);

    const out = await getSkillAgreement(harness.db, "tenant.a");
    expect(out).toHaveLength(1);
    const row = out[0]!;
    expect(row.skillName).toBe("claude-shadow");
    expect(row.pairs).toBe(4);
    expect(row.agreed).toBe(2);
    expect(row.agreement).toBeCloseTo(0.5, 6);
    expect(row.shadowMissed).toBe(1);
    expect(row.shadowOverflagged).toBe(1);
  });

  it("treats `skip` like `approve` (neither counts as human-flagged)", async () => {
    await seedCase("tenant.a", "claude-shadow", [
      { shadowFlagged: false, verdict: "skip" }, // both not-flagged → agreed
      { shadowFlagged: true, verdict: "skip" }, // shadow over-flagged
    ]);
    const out = await getSkillAgreement(harness.db, "tenant.a");
    expect(out[0]?.agreed).toBe(1);
    expect(out[0]?.shadowOverflagged).toBe(1);
  });

  it("groups stats per skill when multiple shadow skills are active", async () => {
    await seedCase("tenant.a", "claude-shadow", [
      { shadowFlagged: true, verdict: "remove" },
    ]);
    await seedCase("tenant.a", "openai-shadow", [
      { shadowFlagged: false, verdict: "remove" },
      { shadowFlagged: false, verdict: "remove" },
    ]);

    const out = await getSkillAgreement(harness.db, "tenant.a");
    const byName = Object.fromEntries(out.map((r) => [r.skillName, r]));
    expect(byName["claude-shadow"]?.pairs).toBe(1);
    expect(byName["claude-shadow"]?.agreement).toBe(1);
    expect(byName["openai-shadow"]?.pairs).toBe(2);
    expect(byName["openai-shadow"]?.agreement).toBe(0);
  });

  it("isolates per-instance — events from other tenants do not contaminate", async () => {
    await seedCase("tenant.a", "claude-shadow", [
      { shadowFlagged: true, verdict: "remove" },
    ]);
    await seedCase("tenant.b", "claude-shadow", [
      { shadowFlagged: false, verdict: "remove" }, // would lower agreement if leaked
    ]);

    const a = await getSkillAgreement(harness.db, "tenant.a");
    expect(a[0]?.pairs).toBe(1);
    expect(a[0]?.agreement).toBe(1);

    const b = await getSkillAgreement(harness.db, "tenant.b");
    expect(b[0]?.pairs).toBe(1);
    expect(b[0]?.agreement).toBe(0);
  });

  it("ignores production traces (no `shadow:` prefix)", async () => {
    const event = makeContentEvent({ instance: { id: "tenant.a", source: "test" } });
    await saveContentEvent(harness.db, event);
    const item: ReviewItem = {
      ...makeReviewItem(event.id, { instanceId: "tenant.a" }),
      state: "decided",
      finalVerdict: "remove",
    };
    await saveReviewItem(harness.db, item);
    await updateReviewItemState(harness.db, item.id, "decided", "remove");
    await appendReviewDecision(
      harness.db,
      makeReviewDecision(item.id, { verdict: "remove" }),
    );

    // A regular production trace — should NOT count as shadow.
    await saveAgentTrace(
      harness.db,
      makeAgentTrace(event.id, {
        agent: "text-agent",
        steps: [
          {
            kind: "decision",
            channel: "toxic",
            probability: 0.95,
            rationale: "production",
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    );

    const out = await getSkillAgreement(harness.db, "tenant.a");
    expect(out).toEqual([]);
  });
});
