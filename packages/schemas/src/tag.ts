import { z } from "zod";

/**
 * Tag layer — structured annotations a reviewer adds during the review.
 *
 * Distinct from `signalFeedback` (which corrects probabilities the system
 * already emitted): tags are *new structured assertions* the reviewer makes
 * about the event, scoped to a specific modality / asset / segment / span.
 *
 * Example: a reviewer reviewing a video can tag the visual track as benign
 * AND the audio segment 0:12-0:24 as harassment, all in one decision. That
 * mixed-validity nuance has no representation in `signalFeedback` (which is
 * channel-level, not modality-level).
 *
 * Tags reference a stable `tagId` from `TAG_CATALOG` (in `@inertial/core`).
 * The catalog defines what each tag means + which modalities it applies to;
 * this schema is just the wire shape for assigning them.
 */

/**
 * Where on the event a tag applies. When all fields are undefined, the tag
 * applies to the whole event.
 */
export const TagScopeSchema = z.object({
  modality: z.enum(["text", "image", "video", "audio", "link"]).optional(),
  /** FK to ContentEvent.media[].id when the scope is one specific asset. */
  mediaAssetId: z.string().uuid().optional(),
  /** For video / audio: the time segment within the asset that the tag refers to. */
  segment: z
    .object({
      startSec: z.number().nonnegative(),
      endSec: z.number().nonnegative(),
    })
    .optional(),
  /** For text: character offsets into ContentEvent.text. */
  span: z
    .object({
      start: z.number().int().nonnegative(),
      end: z.number().int().nonnegative(),
    })
    .optional(),
});
export type TagScope = z.infer<typeof TagScopeSchema>;

/**
 * One tag a reviewer applied to a decision. Multiple per decision is normal —
 * a multimodal post can have several tags spanning different scopes.
 */
export const ReviewerTagSchema = z.object({
  /** Stable identifier from TAG_CATALOG (e.g. "audio.harassment"). */
  tagId: z.string(),
  /** When omitted, the tag applies to the whole event. */
  scope: TagScopeSchema.optional(),
  /** Free-form reviewer note — additional context the catalog tag can't capture. */
  note: z.string().optional(),
});
export type ReviewerTag = z.infer<typeof ReviewerTagSchema>;

/**
 * Per-tag expectation in a gold event. Pairs with `ExpectedChannel` —
 * channels measure probability calibration; tags measure category
 * agreement (binary: did the run produce a tag with the same id + overlapping scope?).
 */
export const ExpectedTagSchema = z.object({
  tagId: z.string(),
  scope: TagScopeSchema.optional(),
  /** Labeler confidence. Same scale as ExpectedChannel.confidence. */
  confidence: z.enum(["high", "medium", "low"]).default("high"),
});
export type ExpectedTag = z.infer<typeof ExpectedTagSchema>;
