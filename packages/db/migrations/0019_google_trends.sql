ALTER TABLE "radar_items" DROP CONSTRAINT "radar_items_provider_valid";--> statement-breakpoint
ALTER TABLE "radar_observations" DROP CONSTRAINT "radar_observations_list_valid";--> statement-breakpoint
ALTER TABLE "worker_heartbeats" ADD COLUMN "radar_sources" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "radar_items" ADD CONSTRAINT "radar_items_provider_valid" CHECK ("radar_items"."provider" in ('hacker_news', 'google_trends'));--> statement-breakpoint
ALTER TABLE "radar_observations" ADD CONSTRAINT "radar_observations_list_valid" CHECK ("radar_observations"."list" in ('top', 'show', 'trending'));