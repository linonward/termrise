CREATE TABLE "platform_crawls" (
	"collection" text NOT NULL,
	"platform" text NOT NULL,
	"pages" integer NOT NULL,
	"next_page" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_crawls_collection_platform_pk" PRIMARY KEY("collection","platform")
);
--> statement-breakpoint
CREATE TABLE "platform_site_months" (
	"site_id" uuid NOT NULL,
	"month" text NOT NULL,
	"etv" real NOT NULL,
	"measured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_site_months_site_id_month_pk" PRIMARY KEY("site_id","month")
);
--> statement-breakpoint
CREATE TABLE "platform_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"host" text NOT NULL,
	"platform" text NOT NULL,
	"first_crawl" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"etv" real,
	"checked_at" timestamp with time zone,
	"top_keyword" text,
	"top_keyword_volume" integer,
	"top_keyword_rank" integer,
	"keyword_checked_at" timestamp with time zone,
	"page_title" text,
	"title_checked_at" timestamp with time zone,
	"hidden_at" timestamp with time zone,
	CONSTRAINT "platform_sites_host_unique" UNIQUE("host")
);
--> statement-breakpoint
ALTER TABLE "pool_rounds" DROP CONSTRAINT "pool_rounds_kind_valid";--> statement-breakpoint
ALTER TABLE "platform_site_months" ADD CONSTRAINT "platform_site_months_site_id_platform_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."platform_sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "platform_sites_etv_idx" ON "platform_sites" USING btree ("etv");--> statement-breakpoint
CREATE INDEX "platform_sites_checked_idx" ON "platform_sites" USING btree ("checked_at");--> statement-breakpoint
ALTER TABLE "pool_rounds" ADD CONSTRAINT "pool_rounds_kind_valid" CHECK ("pool_rounds"."kind" in ('daily', 'manual', 'new_words', 'launch_sites', 'platform_sites'));