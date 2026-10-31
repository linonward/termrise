CREATE TABLE "launch_sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"source_url" text NOT NULL,
	"site" text NOT NULL,
	"url" text NOT NULL,
	"post_title" text NOT NULL,
	"maker_words" text,
	"score" integer,
	"comments" integer,
	"posted_at" timestamp with time zone,
	"registered_on" date,
	"page_title" text,
	"category" text,
	"motive" text,
	"stated" boolean,
	"about" text,
	"audience" text,
	"why" text,
	"core_keyword" text,
	"keyword_note" text,
	"monetization" text,
	"analyzed_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hidden_at" timestamp with time zone,
	CONSTRAINT "launch_sites_source_unique" UNIQUE("source","source_id"),
	CONSTRAINT "launch_sites_motive_valid" CHECK ("launch_sites"."motive" is null or "launch_sites"."motive" in ('keyword', 'own_pain', 'others_need', 'hobby', 'business', 'unstated'))
);
--> statement-breakpoint
ALTER TABLE "pool_rounds" DROP CONSTRAINT "pool_rounds_kind_valid";--> statement-breakpoint
CREATE INDEX "launch_sites_posted_idx" ON "launch_sites" USING btree ("posted_at");--> statement-breakpoint
CREATE INDEX "launch_sites_site_idx" ON "launch_sites" USING btree ("site");--> statement-breakpoint
ALTER TABLE "pool_rounds" ADD CONSTRAINT "pool_rounds_kind_valid" CHECK ("pool_rounds"."kind" in ('daily', 'manual', 'new_words', 'launch_sites'));