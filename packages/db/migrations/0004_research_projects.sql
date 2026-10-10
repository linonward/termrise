CREATE TABLE "research_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"seeds" text[] NOT NULL,
	"data_budget_micros" bigint NOT NULL,
	"ai_budget_micros" bigint NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "research_projects_status_valid" CHECK ("research_projects"."status" in ('draft', 'collecting', 'expanding', 'enriching', 'clustering', 'auditing', 'evaluating', 'completed', 'partial', 'failed', 'cancelled', 'budget_exhausted')),
	CONSTRAINT "research_projects_name_length" CHECK (char_length("research_projects"."name") between 1 and 100),
	CONSTRAINT "research_projects_seeds_count" CHECK (cardinality("research_projects"."seeds") between 1 and 50),
	CONSTRAINT "research_projects_budgets_non_negative" CHECK ("research_projects"."data_budget_micros" >= 0 and "research_projects"."ai_budget_micros" >= 0)
);
--> statement-breakpoint
ALTER TABLE "research_projects" ADD CONSTRAINT "research_projects_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "research_projects_user_created_idx" ON "research_projects" USING btree ("user_id","created_at");