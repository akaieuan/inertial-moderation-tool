import { z } from "zod";
import { PolicyActionSchema } from "./policy.js";
import { ReviewerTagSchema } from "./tag.js";

/**
 * Queue type a review item is routed into.
 * - quick: clear signal, single reviewer, <30s target
 * - deep: ambiguous signal, single reviewer, full evidence trace
 * - escalation: minor-adjacent / legal-risk / disagreement, 2-of-N consensus
 */
export const QueueKindSchema = z.enum(["quick", "deep", "escalation"]);
export type QueueKind = z.infer<typeof QueueKindSchema>;

/**
 * State of a review item as it moves through the pipeline.
 */
export const ReviewStateSchema = z.enum([
  "pending",
  "in-review",
  "decided",
  "consensus-needed",
  "escalated",
  "stale",
]);
export type ReviewState = z.infer<typeof ReviewStateSchema>;

/**
 * The reviewer's verdict on a queue item.
 * Distinct from PolicyAction — reviewers can override the recommended action.
 */
export const ReviewVerdictSchema = z.enum([
  "approve",
  "remove",
  "warn",
  "limit",
  "escalate",
  "skip",
]);
export type ReviewVerdict = z.infer<typeof ReviewVerdictSchema>;

/**
 * Single human decision on a review item.
 * Recorded immutably in the audit log; aggregated by the consensus engine for
 * escalation queues.
 */
export const ReviewDecisionSchema = z.object({
  id: z.string().uuid(),
  reviewItemId: z.string().uuid(),
  reviewerId: z.string(),
  verdict: ReviewVerdictSchema,
  /** Free-form reasoning. Required for `remove`, `escalate`, and overrides. */
  rationale: z.string().optional(),
  /**
   * Reviewer's labeling of which signal channels they agreed/disagreed with.
   * Becomes training signal for calibration improvement.
   */
  signalFeedback: z
    .array(
      z.object({
        channel: z.string(),
        agreed: z.boolean(),
        correctedProbability: z.number().min(0).max(1).optional(),
      }),
    )
    .default([]),
  /**
   * Structured tags the reviewer applied during the review. Distinct from
   * `signalFeedback` — tags are new modality-scoped assertions (e.g. "the
   * audio at 0:12-0:24 is harassment") rather than corrections to existing
   * channel probabilities. Sourced from TAG_CATALOG in @inertial/core.
   */
  reviewerTags: z.array(ReviewerTagSchema).default([]),
  /**
   * AiGenerationScale value (HITL-KIT primitive) — what fraction of the
   * agent's output the reviewer felt was correct. 0 = wrong, 4 = fully correct.
   */
  aiQualityScale: z.number().int().min(0).max(4).optional(),
  decidedAt: z.string().datetime(),
  /** Wall-clock time the reviewer spent on this item. */
  durationMs: z.number().int().nonnegative(),
});
export type ReviewDecision = z.infer<typeof ReviewDecisionSchema>;

/**
 * A queued item awaiting review. Created by the PolicyEngine when it routes
 * a StructuredSignal into a queue. Carries enough denormalized data that the
 * dashboard can render without additional joins for the BatchQueue case.
 */
export const ReviewItemSchema = z.object({
  id: z.string().uuid(),
  contentEventId: z.string().uuid(),
  instanceId: z.string(),
  queue: QueueKindSchema,
  /** The action the policy recommended. Reviewer may override. */
  recommendedAction: PolicyActionSchema,
  /** Which rule fired (PolicyRule.id). For audit traceability. */
  matchedRuleId: z.string().optional(),
  state: ReviewStateSchema,
  /** Decisions accrued so far. Length > 1 only for escalation queue. */
  decisions: z.array(ReviewDecisionSchema).default([]),
  /** Set when state becomes `decided` and the consensus engine has resolved. */
  finalVerdict: ReviewVerdictSchema.nullable().default(null),
  createdAt: z.string().datetime(),
  /** Last modified — drives dashboard sort order and stale detection. */
  updatedAt: z.string().datetime(),
  /** Items older than this without resolution flip to `stale`. */
  staleAfter: z.string().datetime().optional(),
});
export type ReviewItem = z.infer<typeof ReviewItemSchema>;
