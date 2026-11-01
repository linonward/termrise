ALTER TABLE "new_words" ADD COLUMN "base_priority" integer;--> statement-breakpoint
ALTER TABLE "new_words" ADD COLUMN "tails" jsonb;--> statement-breakpoint
ALTER TABLE "new_words" ADD COLUMN "direction" text;--> statement-breakpoint
ALTER TABLE "new_words" ADD COLUMN "copyright_risk" boolean;--> statement-breakpoint
-- Words found before S76: their one source is their base.
UPDATE "new_words" SET "base_priority" = "priority" WHERE "priority" IS NOT NULL;
