CREATE TABLE "keyword_metric_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"search_volume" integer,
	"cpc_micros" bigint,
	"ads_competition" integer,
	"keyword_difficulty" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "keyword_metric_snapshots_ranges" CHECK (("keyword_metric_snapshots"."search_volume" is null or "keyword_metric_snapshots"."search_volume" >= 0)
        and ("keyword_metric_snapshots"."cpc_micros" is null or "keyword_metric_snapshots"."cpc_micros" >= 0)
        and ("keyword_metric_snapshots"."ads_competition" is null or "keyword_metric_snapshots"."ads_competition" between 0 and 100)
        and ("keyword_metric_snapshots"."keyword_difficulty" is null or "keyword_metric_snapshots"."keyword_difficulty" between 0 and 100))
);
--> statement-breakpoint
CREATE TABLE "keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"phrase" text NOT NULL,
	"source" text NOT NULL,
	"seed" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "keywords_project_phrase_unique" UNIQUE("project_id","phrase"),
	CONSTRAINT "keywords_source_valid" CHECK ("keywords"."source" in ('seed', 'expansion'))
);
--> statement-breakpoint
CREATE TABLE "research_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"request_id" uuid NOT NULL,
	"status" text NOT NULL,
	"stage" text NOT NULL,
	"error_code" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "research_runs_project_request_unique" UNIQUE("project_id","request_id"),
	CONSTRAINT "research_runs_status_valid" CHECK ("research_runs"."status" in ('running', 'completed', 'partial', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "serp_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"url" text NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	CONSTRAINT "serp_results_snapshot_rank_unique" UNIQUE("snapshot_id","rank"),
	CONSTRAINT "serp_results_rank_positive" CHECK ("serp_results"."rank" >= 1)
);
--> statement-breakpoint
CREATE TABLE "serp_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"device" text NOT NULL,
	"location_code" integer NOT NULL,
	"language_code" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "keyword_metric_snapshots" ADD CONSTRAINT "keyword_metric_snapshots_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_project_id_research_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."research_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keywords" ADD CONSTRAINT "keywords_run_id_research_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."research_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_project_id_research_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."research_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_results" ADD CONSTRAINT "serp_results_snapshot_id_serp_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."serp_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_snapshots" ADD CONSTRAINT "serp_snapshots_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "keyword_metric_snapshots_keyword_idx" ON "keyword_metric_snapshots" USING btree ("keyword_id","fetched_at");--> statement-breakpoint
CREATE INDEX "research_runs_project_idx" ON "research_runs" USING btree ("project_id","started_at");--> statement-breakpoint
CREATE INDEX "serp_snapshots_keyword_idx" ON "serp_snapshots" USING btree ("keyword_id","fetched_at");