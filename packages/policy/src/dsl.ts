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
import { PolicyActionSchema } from "@inertial/schemas";

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

/** Per-instance skill governance. Empty allow-list = "everything registered". */
export const SkillsBlockSchema = z.object({
  allow: z.array(z.string()).optional(),
  block: z.array(z.string()).default([]),
  /** Hard gate — block any skill whose `dataLeavesMachine` matches. */
  blockExecutionModel: z
    .array(z.enum(["in-process", "local-server", "remote-api"]))
    .default([]),
  /** Hard gate — block any skill that would send data off the machine. */
  blockDataLeavingMachine: z.boolean().default(false),
});
export type SkillsBlock = z.infer<typeof SkillsBlockSchema>;

/**
 * Escalation: after the base agent run, evaluate `when` against the partial
 * signal; if it matches, run additional skills and merge their channels back
 * in. The killer feature is "local triages, cloud catches the gaps."
 */
export const EscalationRuleSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
  when: ConditionSchema,
  /** Skill names to run (in parallel) when `when` matches. */
  run: z.array(z.string()).min(1),
});
export type EscalationRule = z.infer<typeof EscalationRuleSchema>;

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
  /** Per-instance skill governance. Optional — defaults to "all registered allowed". */
  skills: SkillsBlockSchema.default({ block: [], blockExecutionModel: [], blockDataLeavingMachine: false }),
  /** Escalation rules — run extra skills when intermediate signal matches a condition. */
  escalation: z.array(EscalationRuleSchema).default([]),
  /**
   * Skills that run silently on every event — their predictions never affect
   * the production signal or routing. Used to gather paired (agent, human)
   * data for continuous calibration: when a reviewer commits a verdict on the
   * underlying ContentEvent, that verdict + the shadow prediction become a
   * gold-set entry, graded by the actual operator.
   *
   * Skills referenced here must be registered AND not blocked by the
   * `skills:` block. If a shadow skill isn't available at run time, the
   * runciter logs a warning and skips it without failing the event.
   */
  shadow: z.array(z.string()).default([]),
  /** ISO timestamp; defaults to load time if absent in the YAML. */
  createdAt: z.string().datetime().optional(),
  createdBy: z.string().optional(),
});
export type PolicyDoc = z.infer<typeof PolicyDocSchema>;
