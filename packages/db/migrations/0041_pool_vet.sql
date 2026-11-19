ALTER TABLE "pool_checks" DROP CONSTRAINT "pool_checks_kind_valid";--> statement-breakpoint
ALTER TABLE "pool_keywords" ADD COLUMN "review_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "pool_keywords_review_at_idx" ON "pool_keywords" USING btree ("review_at");--> statement-breakpoint
ALTER TABLE "pool_checks" ADD CONSTRAINT "pool_checks_kind_valid" CHECK ("pool_checks"."kind" in ('screen', 'deep', 'review', 'import', 'vet'));