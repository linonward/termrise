CREATE TABLE "opportunity_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reason" text NOT NULL,
	"decider_id" text NOT NULL,
	"evaluation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_decisions_decision_valid" CHECK ("opportunity_decisions"."decision" in ('needs_validation', 'go', 'no_go'))
);
--> statement-breakpoint
CREATE TABLE "validation_experiments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"hypothesis" text NOT NULL,
	"channel" text NOT NULL,
	"metric" text NOT NULL,
	"budget_micros" integer NOT NULL,
	"duration_days" integer NOT NULL,
	"success_threshold" text NOT NULL,
	"stop_condition" text NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"result_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "validation_experiments_kind_valid" CHECK ("validation_experiments"."kind" in ('review_analysis', 'free_tool', 'landing_smoke_test', 'sample_paid_upgrade', 'paid_pilot')),
	CONSTRAINT "validation_experiments_status_valid" CHECK ("validation_experiments"."status" in ('planned', 'running', 'passed', 'failed', 'stopped')),
	CONSTRAINT "validation_experiments_ranges" CHECK ("validation_experiments"."budget_micros" >= 0 and "validation_experiments"."duration_days" between 1 and 365)
);
--> statement-breakpoint
ALTER TABLE "opportunity_decisions" ADD CONSTRAINT "opportunity_decisions_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_decisions" ADD CONSTRAINT "opportunity_decisions_decider_id_user_id_fk" FOREIGN KEY ("decider_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_decisions" ADD CONSTRAINT "opportunity_decisions_evaluation_id_opportunity_evaluations_id_fk" FOREIGN KEY ("evaluation_id") REFERENCES "public"."opportunity_evaluations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_experiments" ADD CONSTRAINT "validation_experiments_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "opportunity_decisions_opportunity_idx" ON "opportunity_decisions" USING btree ("opportunity_id","created_at");--> statement-breakpoint
CREATE INDEX "validation_experiments_opportunity_idx" ON "validation_experiments" USING btree ("opportunity_id","created_at");