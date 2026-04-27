import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SkillRegistration } from "@inertial/schemas";
import {
  getById,
  getByInstanceCatalog,
  listByInstance,
  remove,
  save,
  setEnabled,
  update,
} from "../../src/repositories/skill-registrations.js";
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

function makeReg(overrides: Partial<SkillRegistration> = {}): SkillRegistration {
  return {
    id: randomUUID(),
    instanceId: "smoke.local",
    catalogId: "voyage-text-embedding",
    displayName: "Voyage embeddings",
    providerConfig: { apiKey: "pa-test-key" },
    enabled: true,
    createdAt: new Date().toISOString(),
    createdBy: "ieuan@local",
    ...overrides,
  };
}

describe("skill_registrations repository", () => {
  it("saves and retrieves a registration round-trip", async () => {
    const reg = makeReg();
    await save(harness.db, reg);
    const fetched = await getById(harness.db, reg.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.catalogId).toBe(reg.catalogId);
    expect(fetched?.providerConfig).toEqual(reg.providerConfig);
    expect(fetched?.enabled).toBe(true);
  });

  it("upserts on (instance, catalog) collision rather than throwing", async () => {
    const a = makeReg({ displayName: "Original" });
    const b = makeReg({
      id: a.id,
      displayName: "Updated",
      providerConfig: { apiKey: "pa-rotated" },
      enabled: false,
    });
    await save(harness.db, a);
    await save(harness.db, b);
    const fetched = await getByInstanceCatalog(
      harness.db,
      "smoke.local",
      "voyage-text-embedding",
    );
    expect(fetched?.displayName).toBe("Updated");
    expect(fetched?.providerConfig).toEqual({ apiKey: "pa-rotated" });
    expect(fetched?.enabled).toBe(false);
  });

  it("listByInstance returns rows for the matching instance only", async () => {
    await save(harness.db, makeReg({ instanceId: "instance-a" }));
    await save(
      harness.db,
      makeReg({
        instanceId: "instance-b",
        catalogId: "anthropic-text-toxicity",
      }),
    );
    const a = await listByInstance(harness.db, "instance-a");
    const b = await listByInstance(harness.db, "instance-b");
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
    expect(a[0]?.catalogId).toBe("voyage-text-embedding");
    expect(b[0]?.catalogId).toBe("anthropic-text-toxicity");
  });

  it("setEnabled toggles the flag and returns the updated row", async () => {
    const reg = makeReg();
    await save(harness.db, reg);
    const after = await setEnabled(harness.db, reg.id, false);
    expect(after?.enabled).toBe(false);
    const back = await setEnabled(harness.db, reg.id, true);
    expect(back?.enabled).toBe(true);
  });

  it("setEnabled returns null for unknown id", async () => {
    const result = await setEnabled(harness.db, randomUUID(), false);
    expect(result).toBeNull();
  });

  it("update can patch displayName + providerConfig together", async () => {
    const reg = makeReg();
    await save(harness.db, reg);
    const after = await update(harness.db, reg.id, {
      displayName: "Renamed",
      providerConfig: { apiKey: "pa-new", model: "voyage-3-lite" },
    });
    expect(after?.displayName).toBe("Renamed");
    expect(after?.providerConfig).toEqual({
      apiKey: "pa-new",
      model: "voyage-3-lite",
    });
  });

  it("remove returns true when a row was deleted, false otherwise", async () => {
    const reg = makeReg();
    await save(harness.db, reg);
    expect(await remove(harness.db, reg.id)).toBe(true);
    expect(await remove(harness.db, reg.id)).toBe(false);
    expect(await getById(harness.db, reg.id)).toBeNull();
  });
});
