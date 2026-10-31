CREATE TABLE "pool_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"keyword_id" uuid NOT NULL,
	"round_id" uuid,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rules" text NOT NULL,
	"reviewer_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pool_checks_kind_valid" CHECK ("pool_checks"."kind" in ('screen', 'deep', 'review', 'import')),
	CONSTRAINT "pool_checks_status_valid" CHECK ("pool_checks"."status" in ('new', 'queued', 'candidate', 'unsure', 'watch', 'failed', 'excluded', 'selected', 'dropped'))
);
--> statement-breakpoint
CREATE TABLE "pool_keywords" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phrase" text NOT NULL,
	"sources" text[] DEFAULT '{}'::text[] NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"search_volume" integer,
	"keyword_difficulty" integer,
	"cpc_micros" bigint,
	"variants" text[] DEFAULT '{}'::text[] NOT NULL,
	"variant_count" integer,
	"strong_competitors" integer,
	"inner_pages" integer,
	"trend" jsonb,
	"monetization" text,
	"compliance" text,
	"ai_angle" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone,
	"next_check_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pool_keywords_phrase_unique" UNIQUE("phrase"),
	CONSTRAINT "pool_keywords_status_valid" CHECK ("pool_keywords"."status" in ('new', 'queued', 'candidate', 'unsure', 'watch', 'failed', 'excluded', 'selected', 'dropped'))
);
--> statement-breakpoint
CREATE TABLE "pool_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"source" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"requested_by" text,
	"error_code" text,
	"report" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"claimed_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "pool_rounds_kind_valid" CHECK ("pool_rounds"."kind" in ('daily', 'manual')),
	CONSTRAINT "pool_rounds_status_valid" CHECK ("pool_rounds"."status" in ('queued', 'running', 'completed', 'partial', 'failed', 'budget_exhausted'))
);
--> statement-breakpoint
ALTER TABLE "api_usage" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "api_usage" ADD COLUMN "pool_round_id" uuid;--> statement-breakpoint
ALTER TABLE "pool_checks" ADD CONSTRAINT "pool_checks_keyword_id_pool_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."pool_keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_checks" ADD CONSTRAINT "pool_checks_round_id_pool_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."pool_rounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_checks" ADD CONSTRAINT "pool_checks_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pool_rounds" ADD CONSTRAINT "pool_rounds_requested_by_user_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pool_checks_keyword_idx" ON "pool_checks" USING btree ("keyword_id","created_at");--> statement-breakpoint
CREATE INDEX "pool_keywords_status_idx" ON "pool_keywords" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pool_keywords_next_check_idx" ON "pool_keywords" USING btree ("next_check_at");--> statement-breakpoint
CREATE INDEX "pool_rounds_created_idx" ON "pool_rounds" USING btree ("created_at");--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_pool_round_id_pool_rounds_id_fk" FOREIGN KEY ("pool_round_id") REFERENCES "public"."pool_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_usage_pool_idx" ON "api_usage" USING btree ("pool_round_id","created_at");--> statement-breakpoint
ALTER TABLE "api_usage" ADD CONSTRAINT "api_usage_one_owner" CHECK (("api_usage"."project_id" is null) <> ("api_usage"."pool_round_id" is null));