import { z } from "zod";

/**
 * Action the PolicyEngine emits after evaluating signals against rules.
 * Each instance/platform configures which signals lead to which action.
 *
 * The inertial philosophy: an `action` is a *recommendation* until a human approves.
 * The auto-* actions still emit an audit row even when not human-reviewed.
 */
export const PolicyActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("auto-allow"),
    reason: z.string(),
  }),
  z.object({
    kind: z.literal("auto-remove"),
    reason: z.string(),
    /** When true, action is held and emits "queue.quick" instead. Used during
     * policy onboarding / dry-run. */
    suppress: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("queue.quick"),
    reason: z.string(),
  }),
  z.object({
    kind: z.literal("queue.deep"),
    reason: z.string(),
  }),
  z.object({
    kind: z.literal("escalate.mandatory"),
    /** Why this hit mandatory escalation (e.g. "minor-adjacent"). */
    reason: z.string(),
    /** Number of reviewers required to reach consensus. Default 3 for 2-of-3. */
    reviewersRequired: z.number().int().min(2).max(5).default(3),
  }),
]);
export type PolicyAction = z.infer<typeof PolicyActionSchema>;

/**
 * A single policy rule. Each rule has:
 *   - a condition (compiled from YAML expression to a JS predicate)
 *   - an action emitted when the condition matches
 *   - a stable id for audit-log reference
 *
 * Rules are evaluated in declaration order. First match wins.
 * If no rule matches, the default action is `auto-allow`.
 */
export const PolicyRuleSchema = z.object({
  id: z.string(),
  /** The original YAML `if:` expression, kept for auditability. */
  expression: z.string(),
  action: PolicyActionSchema,
  /** Optional human-readable explanation for the dashboard. */
  description: z.string().optional(),
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

/**
 * Per-instance policy bundle. Loaded from YAML, versioned in Postgres.
 * Edits create a new version row; the active version is referenced by ID.
 */
export const PolicySchema = z.object({
  /** Stable instance identifier (matches InstanceContext.id). */
  instance: z.string(),
  /** Monotonic version. Incremented on every saved edit. */
  version: z.number().int().positive(),
  /** Optional preset this policy was forked from ("strict" | "standard" | "permissive"). */
  basedOn: z.string().optional(),
  rules: z.array(PolicyRuleSchema),
  /** Default action when no rule matches. Defaults to auto-allow. */
  default: PolicyActionSchema.default({
    kind: "auto-allow",
    reason: "no rule matched",
  }),
  createdAt: z.string().datetime(),
  /** Author of this policy version (operator handle). */
  createdBy: z.string().optional(),
});
export type Policy = z.infer<typeof PolicySchema>;
