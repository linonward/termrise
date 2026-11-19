CREATE TABLE "ops_heartbeats" (
	"source" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"reason" text NOT NULL,
	"synced_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_daily_metrics" (
	"domain" text NOT NULL,
	"day" date NOT NULL,
	"source" text NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "site_daily_metrics_domain_day_source_pk" PRIMARY KEY("domain","day","source"),
	CONSTRAINT "site_daily_metrics_source_valid" CHECK ("site_daily_metrics"."source" in ('pvuv', 'gsc', 'admin'))
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"domain" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"template" text,
	"repo" text,
	"pvuv_site_id" text,
	"checks24h" integer DEFAULT 0 NOT NULL,
	"up24h" integer DEFAULT 0 NOT NULL,
	"avg_ms24h" integer,
	"last_check_at" timestamp with time zone,
	"last_status" integer,
	"last_ok" boolean,
	"alert_state" text,
	"alert_since" timestamp with time zone,
	"synced_at" timestamp with time zone NOT NULL,
	"removed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "site_daily_metrics" ADD CONSTRAINT "site_daily_metrics_domain_sites_domain_fk" FOREIGN KEY ("domain") REFERENCES "public"."sites"("domain") ON DELETE cascade ON UPDATE no action;