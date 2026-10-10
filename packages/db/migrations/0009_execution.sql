CREATE TABLE "execution_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"metric" text NOT NULL,
	"count" integer NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"source" text NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "execution_events_metric_valid" CHECK ("execution_events"."metric" in ('visitors', 'activations')),
	CONSTRAINT "execution_events_source_valid" CHECK ("execution_events"."source" in ('manual', 'imported', 'payment_verified')),
	CONSTRAINT "execution_events_ranges" CHECK ("execution_events"."count" >= 0 and "execution_events"."period_end" >= "execution_events"."period_start")
);
--> statement-breakpoint
CREATE TABLE "execution_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"opportunity_id" uuid,
	"name" text NOT NULL,
	"repo_url" text,
	"domain" text,
	"launched_on" date,
	"status" text DEFAULT 'not_started' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "execution_projects_opportunity_unique" UNIQUE("opportunity_id"),
	CONSTRAINT "execution_projects_status_valid" CHECK ("execution_projects"."status" in ('not_started', 'validating', 'building', 'launched', 'measuring', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "revenue_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"currency" text NOT NULL,
	"orders" integer NOT NULL,
	"gross_minor" integer NOT NULL,
	"refund_minor" integer DEFAULT 0 NOT NULL,
	"fees_minor" integer,
	"source" text NOT NULL,
	"evidence" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "revenue_events_source_valid" CHECK ("revenue_events"."source" in ('manual', 'imported', 'payment_verified')),
	CONSTRAINT "revenue_events_ranges" CHECK ("revenue_events"."orders" >= 0 and "revenue_events"."gross_minor" >= 0 and "revenue_events"."refund_minor" >= 0 and ("revenue_events"."fees_minor" is null or "revenue_events"."fees_minor" >= 0) and "revenue_events"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "execution_events" ADD CONSTRAINT "execution_events_project_id_execution_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."execution_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_projects" ADD CONSTRAINT "execution_projects_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_projects" ADD CONSTRAINT "execution_projects_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revenue_events" ADD CONSTRAINT "revenue_events_project_id_execution_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."execution_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "execution_events_project_idx" ON "execution_events" USING btree ("project_id","period_start");--> statement-breakpoint
CREATE INDEX "execution_projects_user_idx" ON "execution_projects" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "revenue_events_project_idx" ON "revenue_events" USING btree ("project_id","occurred_on");