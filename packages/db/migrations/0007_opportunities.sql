CREATE TABLE "opportunities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"cluster" text NOT NULL,
	"status" text DEFAULT 'unreviewed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunities_project_cluster_unique" UNIQUE("project_id","cluster"),
	CONSTRAINT "opportunities_status_valid" CHECK ("opportunities"."status" in ('unreviewed', 'needs_validation', 'go', 'no_go'))
);
--> statement-breakpoint
CREATE TABLE "opportunity_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"scoring_version" text NOT NULL,
	"score" integer NOT NULL,
	"dimensions" jsonb NOT NULL,
	"confidence" integer NOT NULL,
	"needs_review" boolean NOT NULL,
	"rank" integer NOT NULL,
	"analysis" jsonb,
	"analysis_error" text,
	"analyst_provider" text NOT NULL,
	"analyst_prompt_version" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_evaluations_ranges" CHECK ("opportunity_evaluations"."score" between 0 and 100 and "opportunity_evaluations"."confidence" between 0 and 100 and "opportunity_evaluations"."rank" >= 1)
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_project_id_research_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."research_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_evaluations" ADD CONSTRAINT "opportunity_evaluations_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_evaluations" ADD CONSTRAINT "opportunity_evaluations_run_id_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunity_evaluations_opportunity_idx" ON "opportunity_evaluations" USING btree ("opportunity_id","created_at");