CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."audit_kind" AS ENUM('event-ingested', 'signal-generated', 'policy-evaluated', 'queue-routed', 'review-started', 'decision-recorded', 'consensus-reached', 'action-dispatched', 'policy-updated', 'reviewer-overridden');--> statement-breakpoint
CREATE TYPE "public"."audit_ref_type" AS ENUM('content-event', 'signal', 'review-item', 'policy');--> statement-breakpoint
CREATE TYPE "public"."embedding_kind" AS ENUM('text', 'image', 'video', 'audio', 'multimodal');--> statement-breakpoint
CREATE TYPE "public"."modality" AS ENUM('text', 'image', 'video', 'audio', 'link');--> statement-breakpoint
CREATE TYPE "public"."queue_kind" AS ENUM('quick', 'deep', 'escalation');--> statement-breakpoint
CREATE TYPE "public"."review_state" AS ENUM('pending', 'in-review', 'decided', 'consensus-needed', 'escalated', 'stale');--> statement-breakpoint
CREATE TYPE "public"."review_verdict" AS ENUM('approve', 'remove', 'warn', 'limit', 'escalate', 'skip');--> statement-breakpoint
CREATE TYPE "public"."source" AS ENUM('mastodon', 'bluesky', 'lemmy', 'discord', 'slack', 'webhook', 'test');--> statement-breakpoint
CREATE TABLE "agent_traces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_event_id" uuid NOT NULL,
	"agent" text NOT NULL,
	"model" text NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"usage_input_tokens" integer,
	"usage_output_tokens" integer,
	"usage_cost_usd" numeric(12, 6)
);
--> statement-breakpoint
CREATE TABLE "audit_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" text NOT NULL,
	"sequence" bigint NOT NULL,
	"prev_hash" text,
	"hash" text NOT NULL,
	"kind" "audit_kind" NOT NULL,
	"ref_type" "audit_ref_type" NOT NULL,
	"ref_id" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_id" text,
	"timestamp" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"source" "source" NOT NULL,
	"instance_id" text NOT NULL,
	"instance_name" text,
	"instance_source" "source" NOT NULL,
	"modalities" "modality"[] NOT NULL,
	"text" text,
	"links" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"media" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"has_content_warning" boolean DEFAULT false NOT NULL,
	"content_warning_text" text,
	"author_id" text NOT NULL,
	"author_handle" text NOT NULL,
	"author_display_name" text,
	"author_account_age_days" integer,
	"author_prior_action_count" integer DEFAULT 0 NOT NULL,
	"report" jsonb,
	"posted_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone NOT NULL,
	"raw" jsonb
);
--> statement-breakpoint
CREATE TABLE "event_embeddings" (
	"content_event_id" uuid NOT NULL,
	"kind" "embedding_kind" NOT NULL,
	"instance_id" text NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" text NOT NULL,
	"version" integer NOT NULL,
	"based_on" text,
	"rules" jsonb NOT NULL,
	"default_action" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE TABLE "review_decisions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"review_item_id" uuid NOT NULL,
	"reviewer_id" text NOT NULL,
	"verdict" "review_verdict" NOT NULL,
	"rationale" text,
	"signal_feedback" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ai_quality_scale" integer,
	"decided_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"content_event_id" uuid NOT NULL,
	"instance_id" text NOT NULL,
	"queue" "queue_kind" NOT NULL,
	"recommended_action" jsonb NOT NULL,
	"matched_rule_id" text,
	"state" "review_state" NOT NULL,
	"final_verdict" "review_verdict",
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"stale_after" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "structured_signals" (
	"content_event_id" uuid PRIMARY KEY NOT NULL,
	"instance_id" text NOT NULL,
	"channels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"entities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"agents_run" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"agents_failed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"latency_ms" integer NOT NULL,
	"generated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_traces" ADD CONSTRAINT "agent_traces_content_event_id_content_events_id_fk" FOREIGN KEY ("content_event_id") REFERENCES "public"."content_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_embeddings" ADD CONSTRAINT "event_embeddings_content_event_id_content_events_id_fk" FOREIGN KEY ("content_event_id") REFERENCES "public"."content_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_review_item_id_review_items_id_fk" FOREIGN KEY ("review_item_id") REFERENCES "public"."review_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_content_event_id_content_events_id_fk" FOREIGN KEY ("content_event_id") REFERENCES "public"."content_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structured_signals" ADD CONSTRAINT "structured_signals_content_event_id_content_events_id_fk" FOREIGN KEY ("content_event_id") REFERENCES "public"."content_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_traces_event" ON "agent_traces" USING btree ("content_event_id");--> statement-breakpoint
CREATE INDEX "idx_traces_agent" ON "agent_traces" USING btree ("agent");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_audit_instance_sequence" ON "audit_entries" USING btree ("instance_id","sequence");--> statement-breakpoint
CREATE INDEX "idx_audit_ref" ON "audit_entries" USING btree ("ref_type","ref_id");--> statement-breakpoint
CREATE INDEX "idx_audit_kind" ON "audit_entries" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_events_instance" ON "content_events" USING btree ("instance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_events_source_sourceid" ON "content_events" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "idx_events_author" ON "content_events" USING btree ("instance_id","author_id");--> statement-breakpoint
CREATE INDEX "idx_events_posted_at" ON "content_events" USING btree ("posted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_embeddings_event_kind" ON "event_embeddings" USING btree ("content_event_id","kind");--> statement-breakpoint
CREATE INDEX "idx_embeddings_instance" ON "event_embeddings" USING btree ("instance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_policies_instance_version" ON "policies" USING btree ("instance_id","version");--> statement-breakpoint
CREATE INDEX "idx_decisions_review" ON "review_decisions" USING btree ("review_item_id");--> statement-breakpoint
CREATE INDEX "idx_decisions_reviewer" ON "review_decisions" USING btree ("reviewer_id");--> statement-breakpoint
CREATE INDEX "idx_reviews_instance_state" ON "review_items" USING btree ("instance_id","state");--> statement-breakpoint
CREATE INDEX "idx_reviews_queue_pending" ON "review_items" USING btree ("queue","state");--> statement-breakpoint
CREATE INDEX "idx_reviews_event" ON "review_items" USING btree ("content_event_id");--> statement-breakpoint
CREATE INDEX "idx_signals_instance" ON "structured_signals" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "idx_signals_generated_at" ON "structured_signals" USING btree ("generated_at");--> statement-breakpoint
CREATE INDEX "idx_signals_channels_gin" ON "structured_signals" USING gin ("channels");--> statement-breakpoint
CREATE INDEX "idx_signals_entities_gin" ON "structured_signals" USING gin ("entities");--> statement-breakpoint
CREATE INDEX "idx_embeddings_hnsw_cosine" ON "event_embeddings" USING hnsw ("embedding" vector_cosine_ops);