CREATE TABLE "radar_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"url" text,
	"title" text NOT NULL,
	"normalized_term" text NOT NULL,
	"posted_at" timestamp with time zone,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"score" integer,
	"comments" integer,
	CONSTRAINT "radar_items_provider_external_unique" UNIQUE("provider","external_id"),
	CONSTRAINT "radar_items_provider_valid" CHECK ("radar_items"."provider" in ('hacker_news'))
);
--> statement-breakpoint
CREATE TABLE "radar_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"list" text NOT NULL,
	"rank" integer NOT NULL,
	"score" integer,
	"comments" integer,
	CONSTRAINT "radar_observations_list_valid" CHECK ("radar_observations"."list" in ('top', 'show')),
	CONSTRAINT "radar_observations_rank_positive" CHECK ("radar_observations"."rank" >= 1)
);
--> statement-breakpoint
ALTER TABLE "radar_observations" ADD CONSTRAINT "radar_observations_item_id_radar_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."radar_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "radar_items_last_seen_idx" ON "radar_items" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "radar_items_term_idx" ON "radar_items" USING btree ("normalized_term");--> statement-breakpoint
CREATE INDEX "radar_observations_item_time_idx" ON "radar_observations" USING btree ("item_id","observed_at");