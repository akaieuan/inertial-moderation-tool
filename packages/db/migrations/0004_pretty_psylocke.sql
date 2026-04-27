CREATE TABLE "reviewer_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_event_id" uuid NOT NULL,
	"review_decision_id" uuid NOT NULL,
	"instance_id" text NOT NULL,
	"tag_id" text NOT NULL,
	"scope" jsonb,
	"note" text,
	"reviewer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reviewer_tags" ADD CONSTRAINT "reviewer_tags_content_event_id_content_events_id_fk" FOREIGN KEY ("content_event_id") REFERENCES "public"."content_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviewer_tags" ADD CONSTRAINT "reviewer_tags_review_decision_id_review_decisions_id_fk" FOREIGN KEY ("review_decision_id") REFERENCES "public"."review_decisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_reviewer_tags_event" ON "reviewer_tags" USING btree ("content_event_id");--> statement-breakpoint
CREATE INDEX "idx_reviewer_tags_instance_tag" ON "reviewer_tags" USING btree ("instance_id","tag_id");--> statement-breakpoint
CREATE INDEX "idx_reviewer_tags_decision" ON "reviewer_tags" USING btree ("review_decision_id");