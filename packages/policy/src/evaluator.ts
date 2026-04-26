import type { PolicyAction, StructuredSignal } from "@inertial/schemas";
import type {
  Condition,
  EscalationRule,
  PolicyDoc,
  Rule,
  SkillsBlock,
} from "./dsl.js";

import type { SkillMeta, SkillRegistry } from "@inertial/core";

export interface EvaluationResult {
  action: PolicyAction;
  /** Rule id that fired, or undefined if the default action was used. */
  matchedRuleId?: string;
}

/**
 * Evaluate a per-instance policy against a StructuredSignal.
 *
 * Rules are evaluated in declaration order; first match wins. If no rule
 * matches, `policy.default` is returned (with `matchedRuleId` undefined so
 * the caller can record that fact in the audit log).
 */
export function evaluatePolicy(
  policy: PolicyDoc,
  signal: StructuredSignal,
): EvaluationResult {
  for (const rule of policy.rules) {
    if (matches(rule.if, signal)) {
      return { action: rule.action, matchedRuleId: rule.id };
    }
  }
  return { action: policy.default };
}

/** Escalation rules to fire (skill names → run) given a partial signal. */
export function selectEscalations(
  policy: PolicyDoc,
  signal: StructuredSignal,
): Array<{ rule: EscalationRule; skills: readonly string[] }> {
  const out: Array<{ rule: EscalationRule; skills: readonly string[] }> = [];
  for (const rule of policy.escalation) {
    if (matches(rule.when, signal)) {
      out.push({ rule, skills: rule.run });
    }
  }
  return out;
}

/**
 * Apply per-instance skill governance to a registry, blocking any skill
 * that fails the policy. Mutates the registry in place. Idempotent.
 */
export function applySkillsPolicy(
  registry: SkillRegistry,
  policy: SkillsBlock,
): void {
  const allow = policy.allow ? new Set(policy.allow) : null;
  for (const meta of registry.list()) {
    const blockedByName = policy.block.includes(meta.name);
    const blockedByExec = policy.blockExecutionModel.includes(meta.executionModel);
    const blockedByLeak = policy.blockDataLeavingMachine && meta.dataLeavesMachine;
    const blockedByAllowList = allow !== null && !allow.has(meta.name);
    if (blockedByName || blockedByExec || blockedByLeak || blockedByAllowList) {
      registry.block(meta.name);
    }
  }
}

/** Whether a meta would be allowed under the policy (without mutating). */
export function isSkillAllowed(meta: SkillMeta, policy: SkillsBlock): boolean {
  if (policy.block.includes(meta.name)) return false;
  if (policy.blockExecutionModel.includes(meta.executionModel)) return false;
  if (policy.blockDataLeavingMachine && meta.dataLeavesMachine) return false;
  if (policy.allow && !policy.allow.includes(meta.name)) return false;
  return true;
}

function matches(cond: Condition, signal: StructuredSignal): boolean {
  if ("all" in cond) {
    return cond.all.every((c) => matches(c, signal));
  }
  if ("any" in cond) {
    return cond.any.some((c) => matches(c, signal));
  }
  if ("channel" in cond) {
    const channel = signal.channels[cond.channel];
    if (!channel) return false;
    const fieldValue = (cond.field ?? "probability") === "probability"
      ? channel.probability
      : channel.confidence;
    return compare(fieldValue, cond.op, cond.value);
  }
  // entity leaf
  if ("entity" in cond) {
    const present = signal.entities.some((e) => e.type === cond.entity);
    return cond.present === false ? !present : present;
  }
  return false;
}

function compare(
  lhs: number,
  op: "gt" | "lt" | "gte" | "lte" | "eq",
  rhs: number,
): boolean {
  switch (op) {
    case "gt":
      return lhs > rhs;
    case "lt":
      return lhs < rhs;
    case "gte":
      return lhs >= rhs;
    case "lte":
      return lhs <= rhs;
    case "eq":
      return lhs === rhs;
  }
}

/**
 * Convert the YAML-shaped PolicyDoc into the database-shaped `Policy` row
 * (per @inertial/schemas). The DSL's structured `if` tree gets serialized as a
 * JSON string so the existing `Policy.rules[].expression` field can hold it
 * for audit purposes.
 */
export function policyDocToRow(doc: PolicyDoc): {
  instance: string;
  version: number;
  basedOn: string | undefined;
  rules: Array<{
    id: string;
    expression: string;
    action: PolicyAction;
    description: string | undefined;
  }>;
  default: PolicyAction;
  createdAt: string;
  createdBy: string | undefined;
} {
  return {
    instance: doc.instance,
    version: doc.version,
    basedOn: doc.basedOn,
    rules: doc.rules.map((r: Rule) => ({
      id: r.id,
      expression: JSON.stringify(r.if),
      action: r.action,
      description: r.description,
    })),
    default: doc.default,
    createdAt: doc.createdAt ?? new Date().toISOString(),
    createdBy: doc.createdBy,
  };
}
