/**
 * Drizzle schema. Every table mirrors a `@aur/schemas` Zod contract.
 *
 * Conventions:
 *  - camelCase in TypeScript, snake_case in Postgres (Drizzle handles both).
 *  - `instance_id` is denormalized + indexed on every multi-tenant table —
 *    every operational query filters by it.
 *  - Variable-shape data (channels record, trace steps, policy rules,
 *    audit payloads) lands in JSONB with $type<> for compile-time safety.
 *  - Foreign keys cascade on delete *only* when the child row has no value
 *    without the parent (signals, traces, decisions). Audit entries do NOT
 *    cascade — they outlive the rows they reference.
 */
import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import type {
  Author,
  ExtractedEntity,
  PolicyAction,
  PolicyRule,
  SignalChannel,
  TraceStep,
} from "@aur/schemas";

// ---------------------------------------------------------------------------
// Enums — kept in sync with @aur/schemas. Adding a value here requires also
// updating the corresponding Zod enum.
// ---------------------------------------------------------------------------

export const sourceEnum = pgEnum("source", [
  "mastodon",
  "bluesky",
  "lemmy",
  "discord",
  "slack",
  "webhook",
  "test",
]);

export const modalityEnum = pgEnum("modality", [
  "text",
  "image",
  "video",
  "audio",
  "link",
]);

export const queueKindEnum = pgEnum("queue_kind", ["quick", "deep", "escalation"]);

export const reviewStateEnum = pgEnum("review_state", [
  "pending",
  "in-review",
  "decided",
  "consensus-needed",
  "escalated",
  "stale",
]);

export const reviewVerdictEnum = pgEnum("review_verdict", [
  "approve",
  "remove",
  "warn",
  "limit",
  "escalate",
  "skip",
]);

export const auditKindEnum = pgEnum("audit_kind", [
  "event-ingested",
  "signal-generated",
  "policy-evaluated",
  "queue-routed",
  "review-started",
  "decision-recorded",
  "consensus-reached",
  "action-dispatched",
  "policy-updated",
  "reviewer-overridden",
]);

export const auditRefTypeEnum = pgEnum("audit_ref_type", [
  "content-event",
  "signal",
  "review-item",
  "policy",
]);

export const embeddingKindEnum = pgEnum("embedding_kind", [
  "text",
  "image",
  "video",
  "audio",
  "multimodal",
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const contentEvents = pgTable(
  "content_events",
  {
    id: uuid("id").primaryKey(),
    sourceId: text("source_id").notNull(),
    source: sourceEnum("source").notNull(),

    // Denormalized InstanceContext.
    instanceId: text("instance_id").notNull(),
    instanceName: text("instance_name"),
    instanceSource: sourceEnum("instance_source").notNull(),

    modalities: modalityEnum("modalities").array().notNull(),
    text: text("text"),

    // ContentEvent.links / .media / .raw — variable-length, kept as JSONB.
    links: jsonb("links").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    media: jsonb("media")
      .$type<ContentEventMedia[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    hasContentWarning: boolean("has_content_warning").notNull().default(false),
    contentWarningText: text("content_warning_text"),

    // Denormalized Author — handle/id are queried directly by IdentityAgent.
    authorId: text("author_id").notNull(),
    authorHandle: text("author_handle").notNull(),
    authorDisplayName: text("author_display_name"),
    authorAccountAgeDays: integer("author_account_age_days"),
    authorPriorActionCount: integer("author_prior_action_count")
      .notNull()
      .default(0),

    report: jsonb("report").$type<ContentEventReport | null>(),

    postedAt: timestamp("posted_at", { withTimezone: true, mode: "string" }).notNull(),
    ingestedAt: timestamp("ingested_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),

    raw: jsonb("raw").$type<Record<string, unknown> | null>(),
  },
  (t) => [
    index("idx_events_instance").on(t.instanceId),
    uniqueIndex("uq_events_source_sourceid").on(t.source, t.sourceId),
    index("idx_events_author").on(t.instanceId, t.authorId),
    index("idx_events_posted_at").on(t.postedAt),
  ],
);

/** Denormalized Author payload — kept here as a type alias for clarity. */
export interface ContentEventReport {
  reporterId: string;
  reportedAt: string;
  reason: string | null;
}

/** MediaAsset shape stored inside ContentEvent.media JSONB. */
export interface ContentEventMedia {
  id: string;
  modality: "image" | "video" | "audio";
  url: string;
  perceptualHash: string | null;
  mimeType: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
}

export const structuredSignals = pgTable(
  "structured_signals",
  {
    contentEventId: uuid("content_event_id")
      .primaryKey()
      .references(() => contentEvents.id, { onDelete: "cascade" }),
    instanceId: text("instance_id").notNull(),

    /** Record<string, SignalChannel> — keyed by channel name. GIN-indexed. */
    channels: jsonb("channels")
      .$type<Record<string, SignalChannel>>()
      .notNull()
      .default(sql`'{}'::jsonb`),

    entities: jsonb("entities")
      .$type<ExtractedEntity[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    agentsRun: text("agents_run").array().notNull().default(sql`ARRAY[]::text[]`),
    agentsFailed: jsonb("agents_failed")
      .$type<Array<{ agent: string; error: string }>>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    latencyMs: integer("latency_ms").notNull(),
    generatedAt: timestamp("generated_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (t) => [
    index("idx_signals_instance").on(t.instanceId),
    index("idx_signals_generated_at").on(t.generatedAt),
    // GIN index lets policy rules query channels/entities efficiently.
    index("idx_signals_channels_gin").using("gin", t.channels),
    index("idx_signals_entities_gin").using("gin", t.entities),
  ],
);

export const agentTraces = pgTable(
  "agent_traces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    contentEventId: uuid("content_event_id")
      .notNull()
      .references(() => contentEvents.id, { onDelete: "cascade" }),
    agent: text("agent").notNull(),
    model: text("model").notNull(),

    steps: jsonb("steps")
      .$type<TraceStep[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),

    startedAt: timestamp("started_at", { withTimezone: true, mode: "string" }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true, mode: "string" }).notNull(),

    usageInputTokens: integer("usage_input_tokens"),
    usageOutputTokens: integer("usage_output_tokens"),
    /** Cost in USD; numeric to preserve precision. */
    usageCostUsd: numeric("usage_cost_usd", { precision: 12, scale: 6 }),
  },
  (t) => [
    index("idx_traces_event").on(t.contentEventId),
    index("idx_traces_agent").on(t.agent),
  ],
);

export const reviewItems = pgTable(
  "review_items",
  {
    id: uuid("id").primaryKey(),
    contentEventId: uuid("content_event_id")
      .notNull()
      .references(() => contentEvents.id, { onDelete: "cascade" }),
    instanceId: text("instance_id").notNull(),

    queue: queueKindEnum("queue").notNull(),
    recommendedAction: jsonb("recommended_action").$type<PolicyAction>().notNull(),
    matchedRuleId: text("matched_rule_id"),

    state: reviewStateEnum("state").notNull(),
    finalVerdict: reviewVerdictEnum("final_verdict"),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).notNull(),
    staleAfter: timestamp("stale_after", { withTimezone: true, mode: "string" }),
  },
  (t) => [
    index("idx_reviews_instance_state").on(t.instanceId, t.state),
    index("idx_reviews_queue_pending").on(t.queue, t.state),
    index("idx_reviews_event").on(t.contentEventId),
  ],
);

export const reviewDecisions = pgTable(
  "review_decisions",
  {
    id: uuid("id").primaryKey(),
    reviewItemId: uuid("review_item_id")
      .notNull()
      .references(() => reviewItems.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id").notNull(),

    verdict: reviewVerdictEnum("verdict").notNull(),
    rationale: text("rationale"),

    signalFeedback: jsonb("signal_feedback")
      .$type<
        Array<{ channel: string; agreed: boolean; correctedProbability?: number }>
      >()
      .notNull()
      .default(sql`'[]'::jsonb`),

    aiQualityScale: integer("ai_quality_scale"),

    decidedAt: timestamp("decided_at", { withTimezone: true, mode: "string" }).notNull(),
    durationMs: integer("duration_ms").notNull(),
  },
  (t) => [
    index("idx_decisions_review").on(t.reviewItemId),
    index("idx_decisions_reviewer").on(t.reviewerId),
  ],
);

export const policies = pgTable(
  "policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instanceId: text("instance_id").notNull(),
    version: integer("version").notNull(),

    basedOn: text("based_on"),
    rules: jsonb("rules").$type<PolicyRule[]>().notNull(),
    defaultAction: jsonb("default_action").$type<PolicyAction>().notNull(),

    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).notNull(),
    createdBy: text("created_by"),
  },
  (t) => [
    // (instance, version) is the natural key.
    uniqueIndex("uq_policies_instance_version").on(t.instanceId, t.version),
  ],
);

/**
 * Append-only, hash-chained audit log. Per-instance chain integrity is
 * preserved by the composite (instance_id, sequence) uniqueness and the
 * `prev_hash` -> `hash` linkage. See repositories/audit.ts for the
 * advisory-lock-protected append helper.
 */
export const auditEntries = pgTable(
  "audit_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instanceId: text("instance_id").notNull(),
    /** Per-instance monotonic sequence. Genesis = 0. */
    sequence: bigint("sequence", { mode: "number" }).notNull(),

    /** Null for genesis entry per instance. */
    prevHash: text("prev_hash"),
    /** SHA-256 hex over (prevHash || canonicalize(payload) || timestamp). */
    hash: text("hash").notNull(),

    kind: auditKindEnum("kind").notNull(),
    refType: auditRefTypeEnum("ref_type").notNull(),
    refId: text("ref_id").notNull(),

    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    actorId: text("actor_id"),

    timestamp: timestamp("timestamp", { withTimezone: true, mode: "string" }).notNull(),
  },
  (t) => [
    uniqueIndex("uq_audit_instance_sequence").on(t.instanceId, t.sequence),
    index("idx_audit_ref").on(t.refType, t.refId),
    index("idx_audit_kind").on(t.kind),
  ],
);

/**
 * Vector index for ContextAgent similarity-cluster evidence. One row per
 * (event, kind) pair. 1536 is the OpenAI text-embedding-3-small dimension —
 * change here + in the migration if you swap models.
 */
export const eventEmbeddings = pgTable(
  "event_embeddings",
  {
    contentEventId: uuid("content_event_id")
      .notNull()
      .references(() => contentEvents.id, { onDelete: "cascade" }),
    kind: embeddingKindEnum("kind").notNull(),
    instanceId: text("instance_id").notNull(),
    model: text("model").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("uq_embeddings_event_kind").on(t.contentEventId, t.kind),
    index("idx_embeddings_instance").on(t.instanceId),
    // HNSW index for cosine similarity. Created in the migration manually
    // since drizzle-kit doesn't yet emit `USING hnsw`.
  ],
);
