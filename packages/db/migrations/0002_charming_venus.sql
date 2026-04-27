CREATE TYPE "public"."eval_run_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."gold_event_source" AS ENUM('hand-labeled', 'reviewer-derived');--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" text NOT NULL,
	"gold_set_version" text NOT NULL,
	"gold_set_size" integer NOT NULL,
	"status" "eval_run_status" NOT NULL,
	"mean_latency_ms" integer,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"triggered_by" text
);
--> statement-breakpoint
CREATE TABLE "gold_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_event_id" uuid NOT NULL,
	"instance_id" text NOT NULL,
	"expected_channels" jsonb NOT NULL,
	"expected_action" jsonb,
	"source" "gold_event_source" NOT NULL,
	"author_id" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_calibrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eval_run_id" uuid NOT NULL,
	"skill_name" text NOT NULL,
	"channel_name" text NOT NULL,
	"brier_score" numeric(6, 4) NOT NULL,
	"ece" numeric(6, 4) NOT NULL,
	"agreement" numeric(5, 4) NOT NULL,
	"samples" integer NOT NULL,
	"mean_predicted" numeric(5, 4) NOT NULL,
	"mean_actual" numeric(5, 4) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gold_events" ADD CONSTRAINT "gold_events_content_event_id_content_events_id_fk" FOREIGN KEY ("content_event_id") REFERENCES "public"."content_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_calibrations" ADD CONSTRAINT "skill_calibrations_eval_run_id_eval_runs_id_fk" FOREIGN KEY ("eval_run_id") REFERENCES "public"."eval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_eval_runs_instance" ON "eval_runs" USING btree ("instance_id");--> statement-breakpoint
CREATE INDEX "idx_eval_runs_started" ON "eval_runs" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_gold_events_instance" ON "gold_events" USING btree ("instance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_gold_events_event_source" ON "gold_events" USING btree ("content_event_id","source");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_skill_cal_run_skill_channel" ON "skill_calibrations" USING btree ("eval_run_id","skill_name","channel_name");