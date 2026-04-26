import { describe, expect, it } from "vitest";
import {
  SkillRegistry,
  type Skill,
  type SignalOutput,
  type TextClassificationInput,
} from "../src/index.js";

function makeSkill(
  name: string,
  overrides: Partial<Skill<TextClassificationInput, SignalOutput>["meta"]> = {},
): Skill<TextClassificationInput, SignalOutput> {
  return {
    meta: {
      name,
      version: "0.1.0",
      provider: "test",
      executionModel: "in-process",
      dataLeavesMachine: false,
      ...overrides,
    },
    async run() {
      return { channels: [] };
    },
  };
}

describe("SkillRegistry", () => {
  it("registers and retrieves a skill", () => {
    const reg = new SkillRegistry().register(makeSkill("test-skill"));
    expect(reg.has("test-skill")).toBe(true);
    expect(reg.get("test-skill")?.meta.name).toBe("test-skill");
  });

  it("throws on duplicate registration", () => {
    const reg = new SkillRegistry().register(makeSkill("test-skill"));
    expect(() => reg.register(makeSkill("test-skill"))).toThrow(/already registered/);
  });

  it("require() throws with a clear reason when missing", () => {
    const reg = new SkillRegistry();
    expect(() => reg.require("missing")).toThrow(/not registered/);
  });

  it("blocked skills return undefined from get() and throw from require()", () => {
    const reg = new SkillRegistry()
      .register(makeSkill("a"))
      .register(makeSkill("b"));
    reg.block("a");
    expect(reg.get("a")).toBeUndefined();
    expect(() => reg.require("a")).toThrow(/blocked by policy/);
    expect(reg.has("a")).toBe(false);
    expect(reg.has("b")).toBe(true);
  });

  it("unblock() restores access", () => {
    const reg = new SkillRegistry().register(makeSkill("a"));
    reg.block("a");
    reg.unblock("a");
    expect(reg.has("a")).toBe(true);
  });

  it("list() omits blocked skills", () => {
    const reg = new SkillRegistry()
      .register(makeSkill("a"))
      .register(makeSkill("b"));
    reg.block("a");
    expect(reg.list().map((m) => m.name)).toEqual(["b"]);
  });

  it("warmupAll calls warmup() on every active skill exactly once", async () => {
    let warmupsA = 0;
    let warmupsB = 0;
    const reg = new SkillRegistry()
      .register({
        ...makeSkill("a"),
        warmup: async () => {
          warmupsA += 1;
        },
      })
      .register({
        ...makeSkill("b"),
        warmup: async () => {
          warmupsB += 1;
        },
      });
    await reg.warmupAll();
    expect(warmupsA).toBe(1);
    expect(warmupsB).toBe(1);
  });

  it("warmupAll skips blocked skills", async () => {
    let warmups = 0;
    const reg = new SkillRegistry().register({
      ...makeSkill("a"),
      warmup: async () => {
        warmups += 1;
      },
    });
    reg.block("a");
    await reg.warmupAll();
    expect(warmups).toBe(0);
  });
});
