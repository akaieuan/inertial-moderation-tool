import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  getActivePolicy,
  getPolicyVersion,
  listPolicyVersions,
  savePolicy,
} from "../../src/repositories/policies.js";
import { createTestHarness, type TestHarness } from "../harness.js";
import { makePolicy } from "../fixtures.js";

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

describe("policies repository", () => {
  it("getActivePolicy returns the highest version per instance", async () => {
    await savePolicy(harness.db, makePolicy("instance.a", 1));
    await savePolicy(harness.db, makePolicy("instance.a", 2));
    await savePolicy(harness.db, makePolicy("instance.a", 3));

    const active = await getActivePolicy(harness.db, "instance.a");
    expect(active?.version).toBe(3);
  });

  it("(instance, version) is uniquely keyed — duplicate save throws", async () => {
    await savePolicy(harness.db, makePolicy("instance.a", 1));
    await expect(
      savePolicy(harness.db, makePolicy("instance.a", 1)),
    ).rejects.toThrow();
  });

  it("getPolicyVersion fetches a specific historical version", async () => {
    await savePolicy(harness.db, makePolicy("instance.a", 1));
    await savePolicy(harness.db, makePolicy("instance.a", 2));

    const v1 = await getPolicyVersion(harness.db, "instance.a", 1);
    expect(v1?.version).toBe(1);
  });

  it("listPolicyVersions returns newest first", async () => {
    await savePolicy(harness.db, makePolicy("instance.a", 1));
    await savePolicy(harness.db, makePolicy("instance.a", 5));
    await savePolicy(harness.db, makePolicy("instance.a", 3));

    const versions = await listPolicyVersions(harness.db, "instance.a");
    expect(versions.map((p) => p.version)).toEqual([5, 3, 1]);
  });
});
