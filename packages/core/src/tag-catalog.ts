/**
 * Tag catalog — the index of structured annotations a reviewer can apply
 * during a review.
 *
 * Tags differ from skill catalog entries in their *source*: skills are code
 * the runciter dispatches; tags are vocabulary the human chooses from. Both
 * are central registries — the dashboard reads from them, the audit log
 * references them, and they evolve through PRs (not user input).
 *
 * Naming: `<modality>.<category>` — modality is one of the supported
 * `Modality` values plus `cross-modal`; category is short kebab-case.
 *
 * `applicableModalities` controls which modalities the dashboard offers a
 * given tag for — selecting "audio.harassment" only shows up when the event
 * has an audio asset attached.
 */

export type TagModality =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "link"
  | "cross-modal";

export type TagSeverity = "info" | "warn" | "danger" | "neutral";

export interface TagCatalogEntry {
  /** Stable identifier — FK from `ReviewerTag.tagId`. Never change once shipped. */
  tagId: string;
  /** Dashboard-facing label. Free to evolve. */
  displayName: string;
  /** One-line explanation surfaced as tooltip + in the Add-tag picker. */
  description: string;
  /** Modalities where this tag makes sense. The dashboard hides it otherwise. */
  applicableModalities: readonly TagModality[];
  /** Visual tone in the dashboard chip. */
  severity: TagSeverity;
  /** Optional grouping for the picker — e.g. "Toxicity", "Spam", "Context". */
  group: string;
  /** When true, the tag may be applied with a time-segment scope (video/audio). */
  supportsSegmentScope: boolean;
  /** When true, the tag may be applied with a text-span scope. */
  supportsSpanScope: boolean;
}

/**
 * Initial v1 tag catalog. Coverage:
 *  - Text: tone violations, PII, coded speech, satire-flag
 *  - Image: violence, minor presence, context-misleading, benign
 *  - Video: visual benign vs. violation, audio-track violation, temporal pattern
 *  - Audio: harassment, coded speech, benign
 *  - Cross-modal: text-image mismatch, satire-flag (whole-event), context-required
 *
 * Add new entries here when shipping new annotation vocabulary; the
 * `tagId` is the stable contract — `displayName` and `description` may evolve.
 */
export const TAG_CATALOG: readonly TagCatalogEntry[] = [
  // --- Text ---
  {
    tagId: "text.tone-violation",
    displayName: "Toxic tone",
    description: "Hostile, demeaning, or harassing tone that the local classifier missed or under-scored.",
    applicableModalities: ["text"],
    severity: "warn",
    group: "Toxicity",
    supportsSegmentScope: false,
    supportsSpanScope: true,
  },
  {
    tagId: "text.pii-present",
    displayName: "PII exposed",
    description: "Personally identifiable information in the text that should be redacted before action.",
    applicableModalities: ["text"],
    severity: "danger",
    group: "Privacy",
    supportsSegmentScope: false,
    supportsSpanScope: true,
  },
  {
    tagId: "text.coded-language",
    displayName: "Coded / dog-whistle",
    description: "Language that signals harm via in-group terminology — usually invisible to local classifiers.",
    applicableModalities: ["text"],
    severity: "warn",
    group: "Toxicity",
    supportsSegmentScope: false,
    supportsSpanScope: true,
  },
  {
    tagId: "text.context-misleading",
    displayName: "Misleading framing",
    description: "Text frames an external link / claim in a way that's misleading without further context.",
    applicableModalities: ["text"],
    severity: "warn",
    group: "Context",
    supportsSegmentScope: false,
    supportsSpanScope: true,
  },

  // --- Image ---
  {
    tagId: "image.benign",
    displayName: "Benign image",
    description: "The image itself contains nothing actionable — useful when paired with toxic text to isolate where the violation lives.",
    applicableModalities: ["image"],
    severity: "neutral",
    group: "Validation",
    supportsSegmentScope: false,
    supportsSpanScope: false,
  },
  {
    tagId: "image.violence",
    displayName: "Visual violence",
    description: "Depicted gore, weapons in use, or physical violence.",
    applicableModalities: ["image"],
    severity: "danger",
    group: "Violence",
    supportsSegmentScope: false,
    supportsSpanScope: false,
  },
  {
    tagId: "image.minor-present",
    displayName: "Minor present",
    description: "Identifiable presence of a minor — escalation to dedicated review queue.",
    applicableModalities: ["image"],
    severity: "danger",
    group: "Safety",
    supportsSegmentScope: false,
    supportsSpanScope: false,
  },
  {
    tagId: "image.context-misleading",
    displayName: "Misleading image",
    description: "Image is being used to misrepresent a person, event, or claim.",
    applicableModalities: ["image"],
    severity: "warn",
    group: "Context",
    supportsSegmentScope: false,
    supportsSpanScope: false,
  },

  // --- Video ---
  {
    tagId: "video.visual-benign",
    displayName: "Video visual: benign",
    description: "The visual track of the video has no violation — the issue (if any) lives in audio or framing.",
    applicableModalities: ["video"],
    severity: "neutral",
    group: "Validation",
    supportsSegmentScope: true,
    supportsSpanScope: false,
  },
  {
    tagId: "video.visual-violation",
    displayName: "Video visual: violation",
    description: "Visual content depicts violence, NSFW, or another visual violation.",
    applicableModalities: ["video"],
    severity: "danger",
    group: "Violence",
    supportsSegmentScope: true,
    supportsSpanScope: false,
  },
  {
    tagId: "video.audio-violation",
    displayName: "Video audio: violation",
    description: "Audio track contains harassment, slurs, or another audio violation — visual may be fine.",
    applicableModalities: ["video"],
    severity: "danger",
    group: "Audio",
    supportsSegmentScope: true,
    supportsSpanScope: false,
  },
  {
    tagId: "video.temporal-pattern",
    displayName: "Temporal pattern",
    description: "Violation only emerges over time (escalation, repetition, edited cuts).",
    applicableModalities: ["video"],
    severity: "warn",
    group: "Context",
    supportsSegmentScope: true,
    supportsSpanScope: false,
  },

  // --- Audio (standalone, not part of a video) ---
  {
    tagId: "audio.harassment",
    displayName: "Audio harassment",
    description: "Spoken harassment, slurs, or threats targeting a specific person or group.",
    applicableModalities: ["audio", "video"],
    severity: "danger",
    group: "Audio",
    supportsSegmentScope: true,
    supportsSpanScope: false,
  },
  {
    tagId: "audio.coded-speech",
    displayName: "Coded audio speech",
    description: "Spoken in-group / dog-whistle terminology that wouldn't transcribe as overtly harmful.",
    applicableModalities: ["audio", "video"],
    severity: "warn",
    group: "Audio",
    supportsSegmentScope: true,
    supportsSpanScope: false,
  },
  {
    tagId: "audio.benign",
    displayName: "Audio benign",
    description: "Audio track contains nothing actionable.",
    applicableModalities: ["audio", "video"],
    severity: "neutral",
    group: "Validation",
    supportsSegmentScope: true,
    supportsSpanScope: false,
  },

  // --- Cross-modal (apply to whole event) ---
  {
    tagId: "cross-modal.text-image-mismatch",
    displayName: "Text/image mismatch",
    description: "The text describes one thing; the image shows another. Often a misinformation pattern.",
    applicableModalities: ["cross-modal"],
    severity: "warn",
    group: "Context",
    supportsSegmentScope: false,
    supportsSpanScope: false,
  },
  {
    tagId: "cross-modal.satire-flag",
    displayName: "Satire / parody",
    description: "Apparent violation is satire — should not be removed but may warrant a label.",
    applicableModalities: ["cross-modal"],
    severity: "info",
    group: "Context",
    supportsSegmentScope: false,
    supportsSpanScope: false,
  },
  {
    tagId: "cross-modal.context-required",
    displayName: "Needs context",
    description: "Decision can't be made without more context (linked thread, account history).",
    applicableModalities: ["cross-modal"],
    severity: "info",
    group: "Context",
    supportsSegmentScope: false,
    supportsSpanScope: false,
  },
];

/** Lookup helper. Returns undefined for unknown IDs. */
export function findTagEntry(tagId: string): TagCatalogEntry | undefined {
  return TAG_CATALOG.find((e) => e.tagId === tagId);
}

/** Filter the catalog by modality — the dashboard's "Add tag" picker uses
 *  this to surface only relevant tags for the asset under review. */
export function tagsForModality(modality: TagModality): TagCatalogEntry[] {
  return TAG_CATALOG.filter((e) => e.applicableModalities.includes(modality));
}
