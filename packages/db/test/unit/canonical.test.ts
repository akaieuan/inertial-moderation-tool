import { describe, expect, it } from "vitest";
import { canonicalJSON } from "../../src/canonical.js";

describe("canonicalJSON", () => {
  it("sorts object keys lexicographically", () => {
    expect(canonicalJSON({ b: 1, a: 2, c: 3 })).toBe('{"a":2,"b":1,"c":3}');
  });

  it("preserves array order", () => {
    expect(canonicalJSON([3, 1, 2])).toBe("[3,1,2]");
  });

  it("recurses into nested objects", () => {
    const a = canonicalJSON({ z: { b: 1, a: 2 }, a: 3 });
    const b = canonicalJSON({ a: 3, z: { a: 2, b: 1 } });
    expect(a).toBe(b);
    expect(a).toBe('{"a":3,"z":{"a":2,"b":1}}');
  });

  it("drops undefined values but preserves null", () => {
    expect(canonicalJSON({ a: undefined, b: null, c: 1 })).toBe('{"b":null,"c":1}');
  });

  it("is a pure function (same input -> same output)", () => {
    const obj = { foo: "bar", baz: [1, 2, { qux: true }] };
    expect(canonicalJSON(obj)).toBe(canonicalJSON(obj));
  });
});
