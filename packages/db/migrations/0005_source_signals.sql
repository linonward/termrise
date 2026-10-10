CREATE TABLE "source_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text,
	"raw_title" text NOT NULL,
	"normalized_term" text NOT NULL,
	"observed_at" timestamp with time zone,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "source_signals_project_provider_external_unique" UNIQUE("project_id","provider","external_id"),
	CONSTRAINT "source_signals_provider_valid" CHECK ("source_signals"."provider" in ('csv'))
);
--> statement-breakpoint
ALTER TABLE "source_signals" ADD CONSTRAINT "source_signals_project_id_research_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."research_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "source_signals_project_term_idx" ON "source_signals" USING btree ("project_id","normalized_term");