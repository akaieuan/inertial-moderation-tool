import { describe, expect, it } from "vitest";
import { chainHash } from "../../src/hash.js";

describe("chainHash", () => {
  const ts = "2026-04-25T12:00:00.000Z";

  it("is deterministic", () => {
    const a = chainHash({ prevHash: null, payload: { x: 1 }, timestamp: ts });
    const b = chainHash({ prevHash: null, payload: { x: 1 }, timestamp: ts });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different prevHashes", () => {
    const a = chainHash({ prevHash: null, payload: { x: 1 }, timestamp: ts });
    const b = chainHash({ prevHash: "deadbeef", payload: { x: 1 }, timestamp: ts });
    expect(a).not.toBe(b);
  });

  it("produces different hashes for different payloads", () => {
    const a = chainHash({ prevHash: null, payload: { x: 1 }, timestamp: ts });
    const b = chainHash({ prevHash: null, payload: { x: 2 }, timestamp: ts });
    expect(a).not.toBe(b);
  });

  it("is invariant under key reordering (canonicalization)", () => {
    const a = chainHash({ prevHash: null, payload: { x: 1, y: 2 }, timestamp: ts });
    const b = chainHash({ prevHash: null, payload: { y: 2, x: 1 }, timestamp: ts });
    expect(a).toBe(b);
  });

  it("produces different hashes for different timestamps", () => {
    const a = chainHash({ prevHash: null, payload: { x: 1 }, timestamp: ts });
    const b = chainHash({
      prevHash: null,
      payload: { x: 1 },
      timestamp: "2026-04-25T12:00:00.001Z",
    });
    expect(a).not.toBe(b);
  });
});
