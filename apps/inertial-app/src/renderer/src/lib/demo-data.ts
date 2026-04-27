import type {
  AgentTrace,
  AuditEntry,
  ContentEvent,
  ReviewItem,
  StructuredSignal,
} from "@inertial/schemas";
import type {
  EventDetail,
  SkillsResponse,
  SkillAgreement,
  AuditChainVerification,
} from "./api.js";

/**
 * Curated demo data for the dashboard. Used when demo mode is on so the UI
 * renders rich, realistic moderation cases without runciter running.
 *
 * Every case is a real (`ContentEvent`, `StructuredSignal`, `AgentTrace[]`,
 * `ReviewItem`) bundle covering one signal class. Avatars are deterministic
 * `https://i.pravatar.cc/...` urls; images are tagged Unsplash/picsum.
 */

const INSTANCE_ID = "smoke.local";
const NOW = Date.UTC(2026, 3, 26, 19, 30, 0);

function isoMinusMinutes(min: number): string {
  return new Date(NOW - min * 60_000).toISOString();
}

function cyrb53(seed: string, salt = 0): { h1: number; h2: number } {
  let h1 = 0xdeadbeef ^ salt;
  let h2 = 0x41c6ce57 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return { h1: h1 >>> 0, h2: h2 >>> 0 };
}

function uuid(seed: string): string {
  // Deterministic UUID-shaped string with ~106 bits of entropy. Two cyrb53
  // passes with different salts give 4 × 32-bit values; pack them into the
  // 8-4-4-4-12 hex layout so collisions across the demo set are negligible.
  const { h1: a, h2: b } = cyrb53(seed, 0);
  const { h1: c, h2: d } = cyrb53(seed, 1);
  const hex = (n: number) => n.toString(16).padStart(8, "0");
  return `${hex(a)}-${hex(b).slice(0, 4)}-${hex(b).slice(4)}-${hex(c).slice(0, 4)}-${hex(c).slice(4)}${hex(d)}`;
}

function avatarFor(handle: string): string {
  let h = 5;
  for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) | 0;
  const seed = (Math.abs(h) % 70) + 1;
  return `https://i.pravatar.cc/96?img=${seed}`;
}

interface DemoCase {
  event: ContentEvent;
  signal: StructuredSignal | null;
  traces: AgentTrace[];
  item: ReviewItem;
}

const CASES: DemoCase[] = [
  // 1 — clear toxic insult, quick queue
  buildCase({
    seed: "case-toxic-insult",
    minutesAgo: 2,
    handle: "marcus_dev",
    displayName: "Marcus Lee",
    text: "you're so stupid I genuinely can't believe anyone takes you seriously online",
    queue: "quick",
    reason: "toxicity > 0.7",
    channels: [
      { channel: "toxic", probability: 0.98, by: "text-classify-toxicity@local" },
      { channel: "insult", probability: 0.93, by: "text-classify-toxicity@local" },
      { channel: "obscene", probability: 0.66, by: "text-classify-toxicity@local" },
    ],
  }),

  // 2 — URL spam, quick queue
  buildCase({
    seed: "case-url-spam",
    minutesAgo: 7,
    handle: "deals_4_u",
    displayName: "DEALS FOR YOU",
    text: "🔥 50% OFF EVERYTHING — limited time only — click http://bit.ly/sketchy http://bit.ly/sketchy2 http://bit.ly/sketchy3",
    queue: "quick",
    reason: "spam-link-presence > 0.6",
    channels: [
      { channel: "spam-link-presence", probability: 0.91, by: "text-detect-spam-link" },
      { channel: "promotional", probability: 0.82, by: "text-classify-toxicity@local" },
    ],
  }),

  // 3 — severe threat, deep queue, escalated to cloud
  buildCase({
    seed: "case-severe-threat",
    minutesAgo: 12,
    handle: "anon_throwaway",
    text: "if I see you at the meet up I will fucking end you, you have no idea what's coming",
    queue: "deep",
    reason: "severe-toxicity / threat / identity-hate above threshold",
    channels: [
      { channel: "threat", probability: 0.95, by: "text-classify-toxicity@anthropic" },
      { channel: "severe-toxicity", probability: 0.92, by: "text-classify-toxicity@anthropic" },
      { channel: "toxic", probability: 0.88, by: "text-classify-toxicity@local" },
    ],
    cloudEscalated: true,
  }),

  // 4 — NSFW image, deep queue, vision agent
  buildCase({
    seed: "case-nsfw-image",
    minutesAgo: 18,
    handle: "art_alt_account",
    displayName: "Alt Account",
    text: "new piece — opinions welcome 🎨",
    media: [
      {
        kind: "image",
        url: "https://images.unsplash.com/photo-1547036967-23d11aacaee0?w=800",
        width: 800,
        height: 600,
      },
    ],
    queue: "deep",
    reason: "nsfw above threshold (vision)",
    channels: [
      { channel: "nsfw", probability: 0.91, by: "image-classify@anthropic" },
      { channel: "suggestive", probability: 0.77, by: "image-classify@anthropic" },
    ],
    visionRationale:
      "Image shows partial nudity in artistic context. Could be allowed under some policies, escalated to deep review for human judgement.",
  }),

  // 5 — identity hate
  buildCase({
    seed: "case-identity-hate",
    minutesAgo: 24,
    handle: "real_truth_4u",
    text: "the [redacted slur] community is destroying this country and we need to do something about it before it's too late",
    queue: "deep",
    reason: "identity-hate above threshold",
    channels: [
      { channel: "identity-hate", probability: 0.94, by: "text-classify-toxicity@anthropic" },
      { channel: "severe-toxicity", probability: 0.79, by: "text-classify-toxicity@anthropic" },
    ],
    cloudEscalated: true,
  }),

  // 6 — self-harm imagery, escalation queue
  buildCase({
    seed: "case-self-harm",
    minutesAgo: 31,
    handle: "lonely_ghost",
    displayName: "ghost",
    text: "i don't think i want to be here anymore",
    queue: "escalation",
    reason: "self-harm signal — mandatory escalation",
    channels: [
      { channel: "self-harm", probability: 0.86, by: "text-classify-toxicity@anthropic" },
      { channel: "crisis-language", probability: 0.81, by: "context-agent" },
    ],
    cloudEscalated: true,
    escalation: { reviewersRequired: 3 },
  }),

  // 7 — brigading suspicion, escalation
  buildCase({
    seed: "case-brigading",
    minutesAgo: 41,
    handle: "newaccount_2026",
    text: "everyone go report @target_user, they don't deserve to be on this platform — spread the word",
    queue: "escalation",
    reason: "brigading pattern — similarity-cluster + new-account heuristic",
    channels: [
      { channel: "brigading", probability: 0.88, by: "context-agent" },
      { channel: "harassment-coordination", probability: 0.74, by: "context-agent" },
    ],
    similarityCluster: 12,
    escalation: { reviewersRequired: 2 },
  }),

  // 8 — NSFW image only (clean text)
  buildCase({
    seed: "case-image-only-nsfw",
    minutesAgo: 49,
    handle: "vacation_pics",
    displayName: "Beach Vibes",
    text: null,
    media: [
      {
        kind: "image",
        url: "https://images.unsplash.com/photo-1505228395891-9a51e7e86bf6?w=800",
        width: 800,
        height: 533,
      },
    ],
    queue: "deep",
    reason: "image-classify nsfw above threshold",
    channels: [
      { channel: "nsfw", probability: 0.84, by: "image-classify@anthropic" },
    ],
  }),

  // 9 — borderline toxicity (shadow run agreed)
  buildCase({
    seed: "case-borderline",
    minutesAgo: 58,
    handle: "frustrated_user",
    text: "this is honestly the dumbest take I've heard all week, what is wrong with people",
    queue: "quick",
    reason: "toxicity > 0.6 (borderline — shadow agrees)",
    channels: [
      { channel: "toxic", probability: 0.62, by: "text-classify-toxicity@local" },
      { channel: "insult", probability: 0.55, by: "text-classify-toxicity@local" },
    ],
  }),

  // 10 — false positive: spam-link regex, but text is benign
  buildCase({
    seed: "case-fp-spam",
    minutesAgo: 67,
    handle: "research_bot",
    displayName: "Research Bot",
    text: "Here's the source for that climate paper — http://nature.com/articles/s41586-024 worth a read",
    queue: "quick",
    reason: "spam-link-presence > 0.6 (likely false positive)",
    channels: [
      { channel: "spam-link-presence", probability: 0.62, by: "text-detect-spam-link" },
    ],
  }),

  // 11 — multi-modal: toxic text + clean image
  buildCase({
    seed: "case-multimodal-text",
    minutesAgo: 78,
    handle: "outraged_poster",
    text: "what an absolute moron, i can't believe people defend this clown",
    media: [
      {
        kind: "image",
        url: "https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800",
        width: 800,
        height: 600,
      },
    ],
    queue: "quick",
    reason: "toxicity > 0.7 (text rule fired, image clean)",
    channels: [
      { channel: "toxic", probability: 0.86, by: "text-classify-toxicity@local" },
      { channel: "insult", probability: 0.81, by: "text-classify-toxicity@local" },
      { channel: "nsfw", probability: 0.04, by: "image-classify@anthropic" },
    ],
  }),

  // 12 — already approved (decided)
  buildCase({
    seed: "case-decided-approve",
    minutesAgo: 95,
    handle: "kind_neighbor",
    displayName: "Sam Wells",
    text: "loving the community vibes here lately, big thanks to the mods <3",
    queue: "quick",
    reason: "auto-allowed (kept for context)",
    channels: [
      { channel: "toxic", probability: 0.04, by: "text-classify-toxicity@local" },
    ],
    state: "decided",
    finalVerdict: "approve",
  }),

  // 13 — already removed
  buildCase({
    seed: "case-decided-remove",
    minutesAgo: 110,
    handle: "throwaway_42",
    text: "[removed: severe harassment, multi-channel violations]",
    queue: "deep",
    reason: "multi-channel toxicity above threshold",
    channels: [
      { channel: "toxic", probability: 0.97, by: "text-classify-toxicity@anthropic" },
      { channel: "harassment", probability: 0.92, by: "text-classify-toxicity@anthropic" },
      { channel: "identity-hate", probability: 0.71, by: "text-classify-toxicity@anthropic" },
    ],
    state: "decided",
    finalVerdict: "remove",
  }),

  // 14 — minor-presence in image (escalation)
  buildCase({
    seed: "case-minor-present",
    minutesAgo: 134,
    handle: "school_event_pics",
    displayName: "School PTA",
    text: "great turnout at the spring fundraiser today!",
    media: [
      {
        kind: "image",
        url: "https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800",
        width: 800,
        height: 533,
      },
    ],
    queue: "escalation",
    reason: "image_minor_present above threshold — mandatory escalation",
    channels: [
      { channel: "image_minor_present", probability: 0.78, by: "image-classify@anthropic" },
    ],
    escalation: { reviewersRequired: 3 },
  }),

  // 15 — link-only post (link preview spam)
  buildCase({
    seed: "case-link-spam",
    minutesAgo: 158,
    handle: "viral_aggregator",
    text: "must read",
    links: ["https://content-farm.example/article/35924"],
    queue: "quick",
    reason: "spam-link-presence > 0.7",
    channels: [
      { channel: "spam-link-presence", probability: 0.79, by: "text-detect-spam-link" },
      { channel: "low-quality", probability: 0.68, by: "text-classify-toxicity@local" },
    ],
  }),
];

interface BuildCaseOpts {
  seed: string;
  minutesAgo: number;
  handle: string;
  displayName?: string;
  text: string | null;
  links?: string[];
  media?: Array<{
    kind: "image" | "video" | "audio";
    url: string;
    width?: number;
    height?: number;
    durationSec?: number;
  }>;
  queue: "quick" | "deep" | "escalation";
  reason: string;
  channels: Array<{ channel: string; probability: number; by: string }>;
  cloudEscalated?: boolean;
  visionRationale?: string;
  similarityCluster?: number;
  state?: "pending" | "decided";
  finalVerdict?: "approve" | "remove" | "escalate";
  escalation?: { reviewersRequired: number };
}

function buildCase(opts: BuildCaseOpts): DemoCase {
  const eventId = uuid(`${opts.seed}-event`);
  const itemId = uuid(`${opts.seed}-item`);
  const postedAt = isoMinusMinutes(opts.minutesAgo);
  const ingestedAt = isoMinusMinutes(opts.minutesAgo - 0.05);

  const modalities: ContentEvent["modalities"] = [];
  if (opts.text) modalities.push("text");
  if (opts.media?.some((m) => m.kind === "image")) modalities.push("image");
  if (opts.media?.some((m) => m.kind === "video")) modalities.push("video");
  if (opts.media?.some((m) => m.kind === "audio")) modalities.push("audio");
  if (opts.links?.length) modalities.push("link");
  if (modalities.length === 0) modalities.push("text");

  const event: ContentEvent = {
    id: eventId,
    sourceId: `mastodon:${opts.seed}`,
    source: "mastodon",
    instance: { id: INSTANCE_ID, name: "smoke.local", source: "mastodon" },
    modalities,
    text: opts.text,
    links: opts.links ?? [],
    media: (opts.media ?? []).map((m, i) => ({
      id: uuid(`${opts.seed}-media-${i}`),
      modality: m.kind,
      url: m.url,
      perceptualHash: `phash:${opts.seed.slice(0, 8)}`,
      mimeType: m.kind === "image" ? "image/jpeg" : m.kind === "video" ? "video/mp4" : "audio/mpeg",
      bytes: 128_000,
      width: m.width ?? null,
      height: m.height ?? null,
      durationSec: m.durationSec ?? null,
    })),
    hasContentWarning: false,
    contentWarningText: null,
    author: {
      id: `user:${opts.handle}`,
      handle: opts.handle,
      displayName: opts.displayName ?? null,
      accountAgeDays: hash(opts.handle) % 1200,
      priorActionCount: opts.queue === "escalation" ? 2 : opts.queue === "deep" ? 1 : 0,
    },
    report: null,
    postedAt,
    ingestedAt,
  };

  const channels = Object.fromEntries(
    opts.channels.map((c) => [
      c.channel,
      {
        channel: c.channel,
        probability: c.probability,
        emittedBy: c.by,
        confidence: Math.min(0.95, c.probability + 0.05),
        evidence:
          c.channel === "brigading" && opts.similarityCluster
            ? [
                {
                  kind: "similarity-cluster" as const,
                  relatedEventIds: Array.from({ length: opts.similarityCluster }, (_, i) =>
                    uuid(`${opts.seed}-related-${i}`),
                  ),
                  score: 0.84,
                },
              ]
            : opts.text && c.channel === "toxic"
              ? [
                  {
                    kind: "text-span" as const,
                    start: 0,
                    end: Math.min(opts.text.length, 60),
                    excerpt: opts.text.slice(0, 60),
                  },
                ]
              : [],
        notes: opts.visionRationale && c.channel === "nsfw" ? opts.visionRationale : undefined,
      },
    ]),
  );

  const signal: StructuredSignal = {
    contentEventId: eventId,
    channels,
    entities: [],
    agentsRun: [
      ...new Set(opts.channels.map((c) => c.by.split("@")[0]!).filter(Boolean)),
    ],
    agentsFailed: [],
    latencyMs: 220 + (hash(opts.seed) % 380),
    generatedAt: ingestedAt,
  };

  const traces: AgentTrace[] = opts.channels.map((c) => ({
    agent: c.by,
    contentEventId: eventId,
    model:
      c.by.includes("anthropic")
        ? "claude-sonnet-4-6"
        : c.by.includes("local")
          ? "transformers.js/distilbert"
          : c.by.includes("regex")
            ? "regex"
            : c.by,
    steps: [
      {
        kind: "thought" as const,
        content: `Inspecting event ${eventId.slice(0, 8)} for ${c.channel} signal.`,
        timestamp: ingestedAt,
      },
      {
        kind: "tool-call" as const,
        tool: c.by.includes("regex") ? "regex.match" : "classifier.score",
        args: { input: opts.text?.slice(0, 80) ?? "(media-only)" },
        timestamp: ingestedAt,
      },
      {
        kind: "tool-result" as const,
        tool: c.by.includes("regex") ? "regex.match" : "classifier.score",
        result: { probability: c.probability },
        durationMs: 80 + (hash(c.by) % 220),
        timestamp: ingestedAt,
      },
      {
        kind: "decision" as const,
        channel: c.channel,
        probability: c.probability,
        rationale:
          opts.visionRationale && c.channel === "nsfw"
            ? opts.visionRationale
            : `${c.channel}=${c.probability.toFixed(2)} (${c.by})`,
        timestamp: ingestedAt,
      },
    ],
    startedAt: ingestedAt,
    endedAt: ingestedAt,
    usage: c.by.includes("anthropic")
      ? { inputTokens: 380, outputTokens: 120, costUsd: 0.0042 }
      : undefined,
  }));

  const recommendedAction =
    opts.queue === "quick"
      ? { kind: "queue.quick" as const, reason: opts.reason }
      : opts.queue === "deep"
        ? { kind: "queue.deep" as const, reason: opts.reason }
        : {
            kind: "escalate.mandatory" as const,
            reason: opts.reason,
            reviewersRequired: opts.escalation?.reviewersRequired ?? 3,
          };

  const item: ReviewItem = {
    id: itemId,
    contentEventId: eventId,
    instanceId: INSTANCE_ID,
    queue: opts.queue,
    recommendedAction,
    matchedRuleId: `rule:${opts.seed}`,
    state: opts.state ?? "pending",
    decisions: [],
    finalVerdict: opts.finalVerdict ?? null,
    createdAt: ingestedAt,
    updatedAt: ingestedAt,
  };

  return { event, signal, traces, item };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function getDemoQueue(): ReviewItem[] {
  return CASES.map((c) => c.item);
}

export function getDemoEventDetail(eventId: string): EventDetail | null {
  const c = CASES.find((c) => c.event.id === eventId);
  if (!c) return null;
  return { event: c.event, signal: c.signal, traces: c.traces };
}

export function getDemoAvatar(handle: string): string {
  return avatarFor(handle);
}

export function getDemoSkills(): SkillsResponse {
  return {
    skills: [
      {
        name: "text-detect-spam-link",
        version: "1.0.0",
        provider: "regex",
        executionModel: "in-process",
        dataLeavesMachine: false,
        costEstimateUsd: 0,
        description: "URL pattern + count heuristic for outbound link spam.",
      },
      {
        name: "text-classify-toxicity@local",
        version: "1.2.0",
        provider: "transformers.js",
        executionModel: "in-process",
        dataLeavesMachine: false,
        costEstimateUsd: 0,
        description: "DistilBERT toxicity classifier — local, free, ~120ms.",
      },
      {
        name: "text-classify-toxicity@anthropic",
        version: "1.0.0",
        provider: "anthropic",
        executionModel: "remote-api",
        dataLeavesMachine: true,
        costEstimateUsd: 0.003,
        description: "Claude Sonnet for ambiguous text — escalation only.",
      },
      {
        name: "image-classify@anthropic",
        version: "1.0.0",
        provider: "anthropic",
        executionModel: "remote-api",
        dataLeavesMachine: true,
        costEstimateUsd: 0.012,
        description: "Claude Vision for nsfw / minor-presence / weapons.",
      },
    ],
    tools: [
      {
        name: "db.lookupAuthorHistory",
        version: "1.0.0",
        kind: "db",
        description: "Fetch prior moderation actions for an author.",
        mutates: false,
      },
      {
        name: "db.findSimilarEvents",
        version: "1.0.0",
        kind: "db",
        description: "pgvector similarity search across recent events.",
        mutates: false,
      },
      {
        name: "http.fetchLinkPreview",
        version: "1.0.0",
        kind: "http",
        description: "Fetch OpenGraph metadata for outbound URLs.",
        mutates: false,
      },
    ],
    shadow: ["text-classify-toxicity@anthropic"],
  };
}

export function getDemoAudit(): AuditEntry[] {
  const entries: AuditEntry[] = [];
  let seq = 0;
  let prev: string | null = null;
  for (const c of CASES) {
    for (const kind of ["event-ingested", "signal-generated", "queue-routed"] as const) {
      const id = uuid(`audit-${c.event.id}-${kind}`);
      const hashStr = uuid(`hash-${seq}-${kind}`);
      entries.push({
        id,
        sequence: seq,
        prevHash: prev,
        hash: hashStr,
        instanceId: INSTANCE_ID,
        kind,
        ref: {
          type: kind === "queue-routed" ? "review-item" : "content-event",
          id: kind === "queue-routed" ? c.item.id : c.event.id,
        },
        payload:
          kind === "signal-generated"
            ? {
                channels: Object.keys(c.signal?.channels ?? {}),
                mode: "production",
                dataLeavesMachine: c.event.author.priorActionCount > 0,
              }
            : kind === "queue-routed"
              ? { queue: c.item.queue }
              : {},
        actorId: null,
        timestamp: c.event.ingestedAt,
      });
      prev = hashStr;
      seq += 1;
    }
    if (c.item.state === "decided" && c.item.finalVerdict) {
      const id = uuid(`audit-${c.item.id}-decision`);
      const hashStr = uuid(`hash-${seq}-decision`);
      entries.push({
        id,
        sequence: seq,
        prevHash: prev,
        hash: hashStr,
        instanceId: INSTANCE_ID,
        kind: "decision-recorded",
        ref: { type: "review-item", id: c.item.id },
        payload: { verdict: c.item.finalVerdict },
        actorId: "ieuan@local",
        timestamp: c.event.ingestedAt,
      });
      prev = hashStr;
      seq += 1;
    }
  }
  return entries;
}

export function getDemoChainVerification(): AuditChainVerification {
  return { valid: true, inspected: getDemoAudit().length };
}

export function getDemoShadowAgreement(): SkillAgreement[] {
  return [
    {
      skillName: "text-classify-toxicity@anthropic",
      pairs: 18,
      agreed: 16,
      agreement: 16 / 18,
      shadowMissed: 1,
      shadowOverflagged: 1,
    },
  ];
}
