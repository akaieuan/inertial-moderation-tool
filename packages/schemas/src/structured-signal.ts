import { z } from "zod";

/**
 * Calibrated probability in [0, 1].
 * Agents are required to output calibrated values — measured against gold sets
 * by the eval harness (Brier score, ECE).
 *
 * If an agent is uncertain or didn't run, it MUST omit the channel rather than
 * emit a low probability. Absence is meaningful.
 */
export const ProbabilitySchema = z.number().min(0).max(1);
export type Probability = z.infer<typeof ProbabilitySchema>;

/**
 * Pointer to the slice of evidence that supports a signal.
 * These let the dashboard render contextual evidence without re-running the
 * agent — a frame timestamp, a token span, an audio segment.
 *
 * Discriminated by `kind` so the renderer can dispatch type-specifically.
 */
export const EvidencePointerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("text-span"),
    /** byte offsets into ContentEvent.text */
    start: z.number().int().nonnegative(),
    end: z.number().int().nonnegative(),
    excerpt: z.string(),
  }),
  z.object({
    kind: z.literal("image-region"),
    mediaAssetId: z.string().uuid(),
    /** Normalized bounding box in [0, 1] coordinate space. */
    bbox: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      w: z.number().min(0).max(1),
      h: z.number().min(0).max(1),
    }),
    label: z.string().optional(),
  }),
  z.object({
    kind: z.literal("video-segment"),
    mediaAssetId: z.string().uuid(),
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative(),
    /** Optional keyframe URL for thumbnail rendering. */
    keyframeUrl: z.string().url().optional(),
    label: z.string().optional(),
  }),
  z.object({
    kind: z.literal("audio-segment"),
    mediaAssetId: z.string().uuid(),
    startSec: z.number().nonnegative(),
    endSec: z.number().nonnegative(),
    /** Optional transcript excerpt covering this segment. */
    transcript: z.string().optional(),
  }),
  z.object({
    kind: z.literal("similarity-cluster"),
    /** Top neighbours from the same instance, ranked by similarity desc. */
    neighbors: z.array(
      z.object({
        contentEventId: z.string().uuid(),
        /** Cosine similarity in [-1, 1]. 1.0 = identical direction. */
        similarity: z.number().min(-1).max(1),
      }),
    ),
    /** Aggregate score — typically the top neighbour's similarity. In [0, 1]. */
    score: z.number().min(0).max(1),
  }),
  z.object({
    kind: z.literal("author-history"),
    /** Stable Author.id whose history this evidence summarizes. */
    authorId: z.string(),
    /** Most-recent first ContentEvent IDs from this author on the same instance. */
    recentEventIds: z.array(z.string().uuid()),
    /** Cumulative count of moderation actions on this author's prior content. */
    priorActionCount: z.number().int().nonnegative(),
  }),
]);
export type EvidencePointer = z.infer<typeof EvidencePointerSchema>;

/**
 * Single labeled signal channel emitted by an agent.
 * The `channel` is a stable string identifier (e.g. "nsfw", "hate-speech").
 * Channels are registered per-agent and documented in @inertial/core.
 */
export const SignalChannelSchema = z.object({
  channel: z.string(),
  probability: ProbabilitySchema,
  /**
   * Which agent produced this. Used by the eval harness to attribute
   * calibration per-agent and by the policy engine for source filtering.
   */
  emittedBy: z.string(),
  /**
   * Self-reported confidence — distinct from probability. Probability is
   * the agent's best estimate; confidence is how sure the agent is *of that
   * estimate*. Low confidence on high probability should escalate to deep review.
   */
  confidence: ProbabilitySchema,
  /** Pointers to supporting evidence. May be empty (e.g. for whole-document signals). */
  evidence: z.array(EvidencePointerSchema).default([]),
  /** Free-form agent-side notes. Not used for policy. Surfaced in MiniTrace. */
  notes: z.string().optional(),
});
export type SignalChannel = z.infer<typeof SignalChannelSchema>;

/**
 * Structured entity extracted from content. Used for PII redaction,
 * minor-presence detection, weapons, etc. Distinct from a probability signal.
 */
export const ExtractedEntitySchema = z.object({
  /** Entity type — e.g. "PERSON", "PHONE", "EMAIL", "WEAPON", "DRUG". */
  type: z.string(),
  /** Surface form. For PII this gets redacted before storage. */
  value: z.string(),
  /** Should this be redacted from any reviewer-facing display? */
  redact: z.boolean().default(false),
  evidence: z.array(EvidencePointerSchema).default([]),
});
export type ExtractedEntity = z.infer<typeof ExtractedEntitySchema>;

/**
 * The aggregated signal output for a single ContentEvent.
 * This is what the PolicyEngine consumes. **No verdict.** Each instance applies
 * its own rules over these typed signals.
 *
 * The aggregator merges per-agent outputs into this shape. Channel collisions
 * (two agents emitting the same channel) are resolved by max-confidence.
 */
export const StructuredSignalSchema = z.object({
  contentEventId: z.string().uuid(),
  /** All signal channels keyed by channel name for fast lookup in policy rules. */
  channels: z.record(z.string(), SignalChannelSchema),
  entities: z.array(ExtractedEntitySchema).default([]),
  /** Which agents ran successfully. Missing agents = missing modality coverage. */
  agentsRun: z.array(z.string()),
  /** Agents that were dispatched but errored. Affects policy fallback. */
  agentsFailed: z.array(
    z.object({
      agent: z.string(),
      error: z.string(),
    }),
  ),
  /** Total wall-clock time across all agents (for SLA tracking). */
  latencyMs: z.number().int().nonnegative(),
  generatedAt: z.string().datetime(),
});
export type StructuredSignal = z.infer<typeof StructuredSignalSchema>;
