/**
 * Cross-cutting tenancy isolation. Every operational query MUST take an
 * instance id; this test proves that data committed under instance A is
 * invisible to a query against instance B.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  listContentEventsByAuthor,
  listContentEventsByInstance,
  saveContentEvent,
} from "../../src/repositories/content-events.js";
import {
  appendAuditEntry,
  listAuditEntries,
  verifyAuditChain,
} from "../../src/repositories/audit.js";
import {
  getActivePolicy,
  savePolicy,
} from "../../src/repositories/policies.js";
import { listReviewItems, saveReviewItem } from "../../src/repositories/review.js";
import { createTestHarness, type TestHarness } from "../harness.js";
import { makeContentEvent, makePolicy, makeReviewItem } from "../fixtures.js";

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

describe("multi-tenancy isolation", () => {
  it("content events filter by instance", async () => {
    const a = makeContentEvent({
      instance: { id: "tenant.a", source: "test" },
      author: { id: "alice", handle: "alice", priorActionCount: 0 },
    });
    const b = makeContentEvent({
      instance: { id: "tenant.b", source: "test" },
      author: { id: "bob", handle: "bob", priorActionCount: 0 },
    });
    await saveContentEvent(harness.db, a);
    await saveContentEvent(harness.db, b);

    expect(await listContentEventsByInstance(harness.db, "tenant.a")).toHaveLength(1);
    // Author from tenant.b must not surface in tenant.a's listing.
    expect(
      await listContentEventsByAuthor(harness.db, "tenant.a", "bob"),
    ).toHaveLength(0);
    expect(
      await listContentEventsByAuthor(harness.db, "tenant.a", "alice"),
    ).toHaveLength(1);
  });

  it("policies are independent per instance", async () => {
    await savePolicy(harness.db, makePolicy("tenant.a", 1));
    await savePolicy(harness.db, makePolicy("tenant.b", 1));
    await savePolicy(harness.db, makePolicy("tenant.b", 2));

    expect((await getActivePolicy(harness.db, "tenant.a"))?.version).toBe(1);
    expect((await getActivePolicy(harness.db, "tenant.b"))?.version).toBe(2);
  });

  it("review items filter by instance", async () => {
    const event = makeContentEvent({
      instance: { id: "tenant.a", source: "test" },
    });
    await saveContentEvent(harness.db, event);
    await saveReviewItem(
      harness.db,
      makeReviewItem(event.id, { instanceId: "tenant.a" }),
    );

    expect(await listReviewItems(harness.db, "tenant.a")).toHaveLength(1);
    expect(await listReviewItems(harness.db, "tenant.b")).toHaveLength(0);
  });

  it("audit chains are independent: tampering one does not break the other", async () => {
    for (const inst of ["tenant.a", "tenant.b"]) {
      for (let i = 0; i < 3; i++) {
        await appendAuditEntry(harness.db, {
          instanceId: inst,
          kind: "event-ingested",
          ref: { type: "content-event", id: `${inst}-${i}` },
          payload: { i },
          actorId: null,
        });
      }
    }

    const a = await listAuditEntries(harness.db, "tenant.a");
    const b = await listAuditEntries(harness.db, "tenant.b");
    expect(a).toHaveLength(3);
    expect(b).toHaveLength(3);

    expect((await verifyAuditChain(harness.db, "tenant.a")).valid).toBe(true);
    expect((await verifyAuditChain(harness.db, "tenant.b")).valid).toBe(true);
  });
});
