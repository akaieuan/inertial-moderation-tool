import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import {
  appendAuditEntry,
  listAuditEntries,
  verifyAuditChain,
} from "../../src/repositories/audit.js";
import { auditEntries } from "../../src/schema.js";
import { createTestHarness, type TestHarness } from "../harness.js";

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

describe("audit chain", () => {
  it("genesis entry has prevHash=null, sequence=0", async () => {
    const entry = await appendAuditEntry(harness.db, {
      instanceId: "inst.a",
      kind: "event-ingested",
      ref: { type: "content-event", id: "ce-1" },
      payload: { foo: 1 },
      actorId: null,
    });
    expect(entry.sequence).toBe(0);
    expect(entry.prevHash).toBeNull();
    expect(entry.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("links subsequent entries (prevHash = previous hash)", async () => {
    const a = await appendAuditEntry(harness.db, {
      instanceId: "inst.a",
      kind: "event-ingested",
      ref: { type: "content-event", id: "ce-1" },
      payload: { n: 1 },
      actorId: null,
    });
    const b = await appendAuditEntry(harness.db, {
      instanceId: "inst.a",
      kind: "signal-generated",
      ref: { type: "signal", id: "ce-1" },
      payload: { n: 2 },
      actorId: null,
    });
    expect(b.sequence).toBe(1);
    expect(b.prevHash).toBe(a.hash);
  });

  it("verifyAuditChain returns valid for an untampered chain", async () => {
    for (let i = 0; i < 5; i++) {
      await appendAuditEntry(harness.db, {
        instanceId: "inst.a",
        kind: "event-ingested",
        ref: { type: "content-event", id: `ce-${i}` },
        payload: { i },
        actorId: null,
      });
    }
    const v = await verifyAuditChain(harness.db, "inst.a");
    expect(v.valid).toBe(true);
    expect(v.inspected).toBe(5);
  });

  it("verifyAuditChain detects payload tampering", async () => {
    await appendAuditEntry(harness.db, {
      instanceId: "inst.a",
      kind: "event-ingested",
      ref: { type: "content-event", id: "ce-1" },
      payload: { value: "original" },
      actorId: null,
    });

    // Tamper directly with the row, leaving the hash unchanged.
    await harness.db.execute(
      sql`UPDATE ${auditEntries} SET payload = ${'{"value":"tampered"}'}::jsonb WHERE instance_id = ${"inst.a"}`,
    );

    const v = await verifyAuditChain(harness.db, "inst.a");
    expect(v.valid).toBe(false);
    expect(v.brokenAt).toBe(0);
    expect(v.reason).toMatch(/hash mismatch/);
  });

  it("verifyAuditChain detects sequence gaps", async () => {
    await appendAuditEntry(harness.db, {
      instanceId: "inst.a",
      kind: "event-ingested",
      ref: { type: "content-event", id: "ce-0" },
      payload: { i: 0 },
      actorId: null,
    });
    await appendAuditEntry(harness.db, {
      instanceId: "inst.a",
      kind: "event-ingested",
      ref: { type: "content-event", id: "ce-1" },
      payload: { i: 1 },
      actorId: null,
    });
    // Delete the middle row to create a gap.
    await harness.db.execute(
      sql`DELETE FROM ${auditEntries} WHERE instance_id = ${"inst.a"} AND sequence = ${0}`,
    );

    const v = await verifyAuditChain(harness.db, "inst.a");
    expect(v.valid).toBe(false);
    expect(v.reason).toMatch(/sequence gap/);
  });

  it("appends interleave correctly across instances (independent chains)", async () => {
    const a0 = await appendAuditEntry(harness.db, {
      instanceId: "inst.a",
      kind: "event-ingested",
      ref: { type: "content-event", id: "a-1" },
      payload: { n: 1 },
      actorId: null,
    });
    const b0 = await appendAuditEntry(harness.db, {
      instanceId: "inst.b",
      kind: "event-ingested",
      ref: { type: "content-event", id: "b-1" },
      payload: { n: 1 },
      actorId: null,
    });
    const a1 = await appendAuditEntry(harness.db, {
      instanceId: "inst.a",
      kind: "event-ingested",
      ref: { type: "content-event", id: "a-2" },
      payload: { n: 2 },
      actorId: null,
    });

    expect(a0.sequence).toBe(0);
    expect(b0.sequence).toBe(0);
    expect(a1.sequence).toBe(1);
    expect(a1.prevHash).toBe(a0.hash);

    expect((await verifyAuditChain(harness.db, "inst.a")).valid).toBe(true);
    expect((await verifyAuditChain(harness.db, "inst.b")).valid).toBe(true);
  });

  it("listAuditEntries respects fromSequence + kind filters", async () => {
    for (let i = 0; i < 4; i++) {
      await appendAuditEntry(harness.db, {
        instanceId: "inst.a",
        kind: i % 2 === 0 ? "event-ingested" : "signal-generated",
        ref: { type: "content-event", id: `ce-${i}` },
        payload: { i },
        actorId: null,
      });
    }
    const fromSeq2 = await listAuditEntries(harness.db, "inst.a", {
      fromSequence: 2,
    });
    expect(fromSeq2.map((e) => e.sequence)).toEqual([2, 3]);

    const onlySignals = await listAuditEntries(harness.db, "inst.a", {
      kind: "signal-generated",
    });
    expect(onlySignals.map((e) => e.sequence)).toEqual([1, 3]);
  });
});
