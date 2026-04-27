CREATE TABLE "skill_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"instance_id" text NOT NULL,
	"catalog_id" text NOT NULL,
	"display_name" text NOT NULL,
	"provider_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text
);
--> statement-breakpoint
CREATE INDEX "idx_skill_regs_instance" ON "skill_registrations" USING btree ("instance_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_skill_regs_instance_catalog" ON "skill_registrations" USING btree ("instance_id","catalog_id");