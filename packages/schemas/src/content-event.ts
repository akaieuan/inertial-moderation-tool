import { z } from "zod";

/**
 * Modalities supported by the Runciter (orchestrator).
 * Determines which inertials (sub-agents) get dispatched for a given event.
 */
export const ModalitySchema = z.enum([
  "text",
  "image",
  "video",
  "audio",
  "link",
]);
export type Modality = z.infer<typeof ModalitySchema>;

/**
 * Source platform for the content event. Connectors emit one of these.
 */
export const SourceSchema = z.enum([
  "mastodon",
  "bluesky",
  "lemmy",
  "discord",
  "slack",
  "webhook",
  "test",
]);
export type Source = z.infer<typeof SourceSchema>;

/**
 * A single piece of media attached to a content event.
 * Media is downloaded by the gateway, perceptually hashed, and stored before
 * the event hits the Runciter. URLs here are internal pointers (S3 / blob)
 * not the original platform URL.
 */
export const MediaAssetSchema = z.object({
  id: z.string().uuid(),
  modality: z.enum(["image", "video", "audio"]),
  /** Internal storage URL (S3, R2, local). Never the original platform URL. */
  url: z.string().url(),
  /** Perceptual hash (pHash for images, video fingerprint for video). */
  perceptualHash: z.string().nullable(),
  mimeType: z.string(),
  bytes: z.number().int().nonnegative(),
  /** Width/height for image/video. Null for audio. */
  width: z.number().int().positive().nullable().optional(),
  height: z.number().int().positive().nullable().optional(),
  /** Duration in seconds for video/audio. */
  durationSec: z.number().nonnegative().nullable().optional(),
});
export type MediaAsset = z.infer<typeof MediaAssetSchema>;

/**
 * Author information attached to the event.
 * Connectors normalize platform-specific user shapes into this.
 */
export const AuthorSchema = z.object({
  id: z.string(),
  handle: z.string(),
  displayName: z.string().nullable().optional(),
  /** Per-source account age in days, used by ContextAgent. */
  accountAgeDays: z.number().int().nonnegative().nullable().optional(),
  /** Prior moderation actions against this author on this instance. */
  priorActionCount: z.number().int().nonnegative().default(0),
});
export type Author = z.infer<typeof AuthorSchema>;

/**
 * Source-specific instance metadata.
 * For federated platforms this is the instance domain.
 * For centralized platforms this is the tenant/workspace ID.
 */
export const InstanceContextSchema = z.object({
  /** Instance domain or tenant ID. Used to resolve the policy YAML. */
  id: z.string(),
  /** Display name for the dashboard. */
  name: z.string().optional(),
  source: SourceSchema,
});
export type InstanceContext = z.infer<typeof InstanceContextSchema>;

/**
 * The normalized content event. Every connector emits this shape.
 * This is what the Runciter receives.
 */
export const ContentEventSchema = z.object({
  /** Stable UUID assigned by the gateway. */
  id: z.string().uuid(),
  /** Source-platform native ID (e.g. Mastodon status ID). For traceability + dedup. */
  sourceId: z.string(),
  /** Which connector emitted this. */
  source: SourceSchema,
  instance: InstanceContextSchema,
  /** The set of modalities present. Drives Runciter dispatch. */
  modalities: z.array(ModalitySchema).min(1),
  text: z.string().nullable(),
  /** Includes link previews fetched by the gateway. */
  links: z.array(z.string().url()).default([]),
  media: z.array(MediaAssetSchema).default([]),
  /** Whether the platform indicates this is behind a content warning. */
  hasContentWarning: z.boolean().default(false),
  /** The CW text if present (e.g. "nsfw", "spoiler"). */
  contentWarningText: z.string().nullable().optional(),
  author: AuthorSchema,
  /**
   * Reporting context. If null, this event was ingested via firehose / proactive
   * scan. If present, a user reported it and the report metadata travels with it.
   */
  report: z
    .object({
      reporterId: z.string(),
      reportedAt: z.string().datetime(),
      reason: z.string().nullable(),
    })
    .nullable()
    .optional(),
  /** When the content was originally posted on the source platform. */
  postedAt: z.string().datetime(),
  /** When the gateway received this event. */
  ingestedAt: z.string().datetime(),
  /** Free-form connector-specific metadata. Not relied on downstream. */
  raw: z.record(z.string(), z.unknown()).optional(),
});
export type ContentEvent = z.infer<typeof ContentEventSchema>;
