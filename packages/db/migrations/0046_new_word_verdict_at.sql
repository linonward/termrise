ALTER TABLE "new_words" ADD COLUMN "verdict_at" timestamp with time zone;--> statement-breakpoint
-- Existing verdicts: their last measurement is the best known day (S89).
UPDATE "new_words" SET "verdict_at" = "checked_at" WHERE "verdict" IS NOT NULL;
