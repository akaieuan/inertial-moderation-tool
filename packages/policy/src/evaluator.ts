import type { PolicyAction, StructuredSignal } from "@aur/schemas";
import type { Condition, PolicyDoc, Rule } from "./dsl.js";

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
 * (per @aur/schemas). The DSL's structured `if` tree gets serialized as a
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
