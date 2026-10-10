CREATE TABLE "api_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"run_id" uuid,
	"kind" text NOT NULL,
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"reserved_micros" bigint NOT NULL,
	"cost_micros" bigint,
	"status" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "api_usage_kind_valid" CHECK ("api_usage"."kind" in ('data', 'ai')),
	CONSTRAINT "api_usage_status_valid" CHECK ("api_usage"."status" in ('reserved', 'settled', 'failed')),
	CONSTRAINT "api_usage_amounts" CHECK ("api_usage"."reserved_micros" >= 0 and ("api_usage"."cost_micros" is null or "api_usage"."cost_micros" >= 0))
);
--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_project_id_research_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."research_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_run_id_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_usage_project_idx" ON "api_usage" USING btree ("project_id","kind");