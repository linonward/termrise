CREATE TABLE "seed_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"status" text NOT NULL,
	"source_seeds" text[] NOT NULL,
	"phrases" text[],
	"error_code" text,
	"provider" text,
	"model" text,
	"prompt_version" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "seed_suggestions_project_request_unique" UNIQUE("project_id","request_id"),
	CONSTRAINT "seed_suggestions_status_valid" CHECK ("seed_suggestions"."status" in ('pending', 'running', 'completed', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "seed_suggestions" ADD CONSTRAINT "seed_suggestions_project_id_research_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."research_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "seed_suggestions_project_idx" ON "seed_suggestions" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "seed_suggestions_status_idx" ON "seed_suggestions" USING btree ("status");