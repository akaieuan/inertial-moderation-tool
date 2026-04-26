/**
 * Per-instance policy DSL — structured (AST), not a free-form expression
 * language. Reasons:
 *   - Safe: no string evaluation, no code path through `Function`/`eval`.
 *   - Auditable: every rule's exact condition is preserved as JSON in the
 *     audit log (alongside the rule id).
 *   - Easy to extend: new ops mean new schema discriminants, not a new parser.
 *
 * Conditions form a tree:
 *   - leaf:    { channel: <name>, op: <gt|lt|gte|lte|eq>, value: number }
 *   - leaf:    { entity: <type>, present: true }
 *   - all:     { all: [Cond, Cond, ...] }
 *   - any:     { any: [Cond, Cond, ...] }
 *
 * The evaluator is a small recursive function over StructuredSignal. See
 * evaluator.ts.
 */
import { z } from "zod";
import { PolicyActionSchema } from "@aur/schemas";

const NumericOp = z.enum(["gt", "lt", "gte", "lte", "eq"]);

const ChannelLeaf: z.ZodType<ChannelLeaf> = z.object({
  channel: z.string(),
  /** Comparison operator. */
  op: NumericOp,
  /** Right-hand side. We compare against either probability or confidence. */
  value: z.number(),
  /** Which field of the channel to compare. Defaults to probability. */
  field: z.enum(["probability", "confidence"]).default("probability"),
});

const EntityLeaf: z.ZodType<EntityLeaf> = z.object({
  entity: z.string(),
  /** True = at least one ExtractedEntity of this type was found. */
  present: z.boolean().default(true),
});

// Discriminated union via Zod's lazy + union for recursion.
type ConditionInput =
  | ChannelLeaf
  | EntityLeaf
  | { all: ConditionInput[] }
  | { any: ConditionInput[] };

interface ChannelLeaf {
  channel: string;
  op: "gt" | "lt" | "gte" | "lte" | "eq";
  value: number;
  field?: "probability" | "confidence";
}

interface EntityLeaf {
  entity: string;
  present?: boolean;
}

export const ConditionSchema: z.ZodType<ConditionInput> = z.lazy(() =>
  z.union([
    ChannelLeaf,
    EntityLeaf,
    z.object({ all: z.array(ConditionSchema) }),
    z.object({ any: z.array(ConditionSchema) }),
  ]),
);
export type Condition = ConditionInput;

export const RuleSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
  /** The condition expression — tree of leaves, all-of, any-of. */
  if: ConditionSchema,
  /** PolicyAction emitted when the condition matches. */
  action: PolicyActionSchema,
});
export type Rule = z.infer<typeof RuleSchema>;

export const PolicyDocSchema = z.object({
  /** Stable instance identifier. Matches InstanceContext.id at runtime. */
  instance: z.string(),
  /** Monotonic version. Bumped on every saved edit. */
  version: z.number().int().positive(),
  /** Optional preset this policy was forked from. */
  basedOn: z.string().optional(),
  /** Rules evaluated in order; first match wins. */
  rules: z.array(RuleSchema),
  /** Action when no rule matches. */
  default: PolicyActionSchema.default({
    kind: "auto-allow",
    reason: "no rule matched",
  }),
  /** ISO timestamp; defaults to load time if absent in the YAML. */
  createdAt: z.string().datetime().optional(),
  createdBy: z.string().optional(),
});
export type PolicyDoc = z.infer<typeof PolicyDocSchema>;
