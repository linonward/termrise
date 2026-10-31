ALTER TABLE "new_words" ADD COLUMN "origin_type" text;--> statement-breakpoint
ALTER TABLE "new_words" ADD COLUMN "origin_summary" text;--> statement-breakpoint
ALTER TABLE "new_words" ADD COLUMN "origin_capture" text;--> statement-breakpoint
ALTER TABLE "new_words" ADD COLUMN "origin_evidence" jsonb;--> statement-breakpoint
ALTER TABLE "new_words" ADD COLUMN "origin_checked_at" timestamp with time zone;