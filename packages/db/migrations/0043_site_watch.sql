CREATE TABLE "watch_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"published_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"baseline" boolean DEFAULT false NOT NULL,
	"phrase" text,
	"sent_at" timestamp with time zone,
	CONSTRAINT "watch_pages_source_url" UNIQUE("source_id","url")
);
--> statement-breakpoint
CREATE TABLE "watch_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prefix" text NOT NULL,
	"method" text,
	"read_from" text[] DEFAULT '{}'::text[] NOT NULL,
	"baseline_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"last_error" text,
	"pages_known" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watch_sources_prefix_unique" UNIQUE("prefix"),
	CONSTRAINT "watch_sources_method_valid" CHECK ("watch_sources"."method" is null or "watch_sources"."method" in ('feed', 'sitemap', 'links'))
);
--> statement-breakpoint
ALTER TABLE "watch_pages" ADD CONSTRAINT "watch_pages_source_id_watch_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."watch_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watch_pages_first_seen_idx" ON "watch_pages" USING btree ("first_seen_at");