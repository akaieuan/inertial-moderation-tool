import { z } from "zod";
import { ProbabilitySchema } from "./structured-signal.js";
import { PolicyActionSchema } from "./policy.js";
import { ExpectedTagSchema } from "./tag.js";

/**
 * Eval harness schemas — the verification substrate.
 *
 * Calibration is per (skill, channel) pair, not per agent. Agents compose
 * skills; the unit of measurement is what each skill emitted, not the agent
 * that called it. So "text-classify-toxicity@local emitting `toxic`" is one
 * row; the same skill emitting `insult` is a separate row with its own
 * Brier / ECE / agreement scores.
 *
 * Gold events have two sources:
 *   - hand-labeled: operator wrote a JSONL entry under config/evals/
 *   - reviewer-derived: auto-promoted from a ReviewDecision.signalFeedback.
 *     Every reviewer who commits a verdict implicitly creates a gold label.
 */

/** Per-channel expectation — what the skill should emit for one channel. */
export const ExpectedChannelSchema = z.object({
  /** [0, 1] — what the labeler thinks the skill should output. */
  probability: ProbabilitySchema,
  /** How sure the labeler is of that expected probability. Used to weight
   *  scoring (low-confidence labels contribute less to aggregates). */
  confidence: z.enum(["high", "medium", "low"]).default("high"),
});
export type ExpectedChannel = z.infer<typeof ExpectedChannelSchema>;

export const GoldEventSourceSchema = z.enum(["hand-labeled", "reviewer-derived"]);
export type GoldEventSource = z.infer<typeof GoldEventSourceSchema>;

export const GoldEventSchema = z.object({
  id: z.string().uuid(),
  /** FK to the ContentEvent this label is about. */
  contentEventId: z.string().uuid(),
  instanceId: z.string(),
  /** Channel name → expected outcome. Absence means "expected to NOT fire". */
  expectedChannels: z.record(z.string(), ExpectedChannelSchema),
  /** Optional — what routing action the policy should produce.
   *  When set, the eval also scores the policy router, not just the skills. */
  expectedAction: PolicyActionSchema.optional(),
  /** Tag-level expectations. The eval scorer checks for tag-id agreement
   *  with overlapping scope (binary: matched or not). Empty = no tag-level
   *  expectations on this event. */
  expectedTags: z.array(ExpectedTagSchema).default([]),
  source: GoldEventSourceSchema,
  /** Operator handle (hand-labeled) or reviewerId (reviewer-derived). */
  authorId: z.string(),
  notes: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type GoldEvent = z.infer<typeof GoldEventSchema>;

export const SkillCalibrationSchema = z.object({
  skillName: z.string(),
  channelName: z.string(),
  /** Mean (predicted - actual)^2. Lower = better. Range [0, 1]. */
  brierScore: z.number().min(0).max(1),
  /** Expected calibration error: bin probabilities in [0, 1], compute
   *  weighted |bin_avg_predicted - bin_avg_actual| sum. Lower = better. */
  ece: z.number().min(0).max(1),
  /** Fraction of samples where (predicted >= 0.5) matches (actual >= 0.5).
   *  Higher = better. Crude but useful when probabilities are mostly bimodal. */
  agreement: z.number().min(0).max(1),
  /** Number of (gold event, channel) pairs that contributed. Statistical
   *  trustworthiness scales with this — display warnings when n < 10. */
  samples: z.number().int().nonnegative(),
  meanPredicted: z.number().min(0).max(1),
  meanActual: z.number().min(0).max(1),
});
export type SkillCalibration = z.infer<typeof SkillCalibrationSchema>;

/**
 * Per-tag agreement aggregated across one eval run.
 *
 * Tag scoring is binary, not probabilistic — for each gold event with an
 * expected tag, the run either produced a matching reviewer-tag (true positive)
 * or not (false negative). For each non-expected tag the run produced, that's
 * a false positive. Standard precision / recall / F1 follows.
 *
 * Reviewer tags come from past decisions on the same content event when the
 * eval runs against historical events; otherwise they're empty (skills don't
 * yet emit tags directly — that's a follow-on once we have a tag-emitting
 * skill kind).
 */
export const TagAgreementSchema = z.object({
  tagId: z.string(),
  /** True positives: expected ∧ predicted. */
  truePositives: z.number().int().nonnegative(),
  /** False positives: predicted ∧ ¬expected. */
  falsePositives: z.number().int().nonnegative(),
  /** False negatives: expected ∧ ¬predicted. */
  falseNegatives: z.number().int().nonnegative(),
  /** TP / (TP + FP). 0..1. NaN replaced with 0 when no positives. */
  precision: z.number().min(0).max(1),
  /** TP / (TP + FN). 0..1. */
  recall: z.number().min(0).max(1),
  /** Harmonic mean of precision + recall. 0..1. */
  f1: z.number().min(0).max(1),
  /** Total events contributing (TP + FP + FN). */
  samples: z.number().int().nonnegative(),
});
export type TagAgreement = z.infer<typeof TagAgreementSchema>;

export const EvalRunStatusSchema = z.enum(["running", "completed", "failed"]);
export type EvalRunStatus = z.infer<typeof EvalRunStatusSchema>;

export const EvalRunSchema = z.object({
  id: z.string().uuid(),
  instanceId: z.string(),
  /** Free-form version label — e.g. "gold-set-v1" or "reviewer-derived-2026-04".
   *  Bump when channel set or policy changes so old runs stay comparable
   *  against their snapshot. */
  goldSetVersion: z.string(),
  goldSetSize: z.number().int().nonnegative(),
  status: EvalRunStatusSchema,
  /** Per-event mean wall-clock latency. Filled when status = completed. */
  meanLatencyMs: z.number().int().nonnegative().nullable(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  /** Aggregated per (skill, channel) results. Empty when status != completed. */
  skillCalibrations: z.array(SkillCalibrationSchema).default([]),
  /** Operator handle, "ci", or null for system-triggered runs. */
  triggeredBy: z.string().nullable(),
});
export type EvalRun = z.infer<typeof EvalRunSchema>;
