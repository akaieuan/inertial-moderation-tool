import { describe, expect, it } from "vitest";
import type { StructuredSignal } from "@inertial/schemas";
import { SkillRegistry, type Skill } from "@inertial/core";
import {
  applySkillsPolicy,
  isSkillAllowed,
  parsePolicy,
  selectEscalations,
  type SkillsBlock,
} from "../src/index.js";

function signal(channels: Record<string, { p: number; c?: number }>): StructuredSignal {
  return {
    contentEventId: "00000000-0000-4000-8000-000000000000",
    channels: Object.fromEntries(
      Object.entries(channels).map(([k, v]) => [
        k,
        {
          channel: k,
          probability: v.p,
          confidence: v.c ?? 0.7,
          emittedBy: "test",
          evidence: [],
        },
      ]),
    ),
    entities: [],
    agentsRun: ["test-agent"],
    agentsFailed: [],
    latencyMs: 1,
    generatedAt: new Date().toISOString(),
  };
}

const POLICY_YAML = `
instance: t
version: 1
escalation:
  - id: escalate-low-toxic-confidence
    when:
      all:
        - { channel: toxic, op: gt, value: 0.4 }
        - { channel: toxic, op: lt, value: 0.7, field: confidence }
    run: [text-classify-toxicity@anthropic]
  - id: escalate-uncertain-threat
    when:
      any:
        - { channel: threat, op: lt, value: 0.5 }
        - { channel: severe_toxic, op: gt, value: 0.6 }
    run: [text-classify-toxicity@anthropic]
rules:
  - id: pass-through
    if: { channel: nothing, op: gt, value: 0.99 }
    action: { kind: auto-allow, reason: never }
default: { kind: auto-allow, reason: ok }
`;

describe("selectEscalations", () => {
  const policy = parsePolicy(POLICY_YAML);

  it("fires when an `all` condition matches every leaf", () => {
    const out = selectEscalations(policy, signal({ toxic: { p: 0.5, c: 0.4 } }));
    expect(out.map((e) => e.rule.id)).toContain("escalate-low-toxic-confidence");
  });

  it("fires when any leaf in an `any` condition matches", () => {
    const out = selectEscalations(policy, signal({ severe_toxic: { p: 0.7 } }));
    expect(out.map((e) => e.rule.id)).toContain("escalate-uncertain-threat");
  });

  it("does not fire when no condition matches", () => {
    const out = selectEscalations(policy, signal({ toxic: { p: 0.9, c: 0.95 } }));
    expect(out).toHaveLength(0);
  });

  it("returns the right skill list per fired rule", () => {
    const out = selectEscalations(policy, signal({ severe_toxic: { p: 0.7 } }));
    expect(out[0]?.skills).toEqual(["text-classify-toxicity@anthropic"]);
  });
});

function makeSkill(
  name: string,
  meta: Partial<Skill<unknown, unknown>["meta"]> = {},
): Skill<unknown, unknown> {
  return {
    meta: {
      name,
      version: "0.1.0",
      provider: "test",
      executionModel: "in-process",
      dataLeavesMachine: false,
      ...meta,
    },
    async run() {
      return {} as unknown;
    },
  };
}

describe("applySkillsPolicy", () => {
  it("blocks named skills", () => {
    const reg = new SkillRegistry()
      .register(makeSkill("a"))
      .register(makeSkill("b"));
    applySkillsPolicy(reg, {
      block: ["a"],
      blockExecutionModel: [],
      blockDataLeavingMachine: false,
    });
    expect(reg.has("a")).toBe(false);
    expect(reg.has("b")).toBe(true);
  });

  it("blocks by execution model", () => {
    const reg = new SkillRegistry()
      .register(makeSkill("local", { executionModel: "in-process" }))
      .register(
        makeSkill("cloud", {
          executionModel: "remote-api",
          dataLeavesMachine: true,
        }),
      );
    applySkillsPolicy(reg, {
      block: [],
      blockExecutionModel: ["remote-api"],
      blockDataLeavingMachine: false,
    });
    expect(reg.has("local")).toBe(true);
    expect(reg.has("cloud")).toBe(false);
  });

  it("blocks anything that leaks data when blockDataLeavingMachine=true", () => {
    const reg = new SkillRegistry()
      .register(makeSkill("local", { dataLeavesMachine: false }))
      .register(makeSkill("cloud", { dataLeavesMachine: true }));
    applySkillsPolicy(reg, {
      block: [],
      blockExecutionModel: [],
      blockDataLeavingMachine: true,
    });
    expect(reg.has("local")).toBe(true);
    expect(reg.has("cloud")).toBe(false);
  });

  it("with an allow-list, blocks anything not on it", () => {
    const reg = new SkillRegistry()
      .register(makeSkill("a"))
      .register(makeSkill("b"))
      .register(makeSkill("c"));
    applySkillsPolicy(reg, {
      allow: ["b"],
      block: [],
      blockExecutionModel: [],
      blockDataLeavingMachine: false,
    });
    expect(reg.has("a")).toBe(false);
    expect(reg.has("b")).toBe(true);
    expect(reg.has("c")).toBe(false);
  });
});

describe("isSkillAllowed (pure)", () => {
  it("returns false when blocked by name, exec model, or leak", () => {
    const meta = makeSkill("cloud", {
      executionModel: "remote-api",
      dataLeavesMachine: true,
    }).meta;
    const policy: SkillsBlock = {
      block: [],
      blockExecutionModel: ["remote-api"],
      blockDataLeavingMachine: false,
    };
    expect(isSkillAllowed(meta, policy)).toBe(false);
  });
});
