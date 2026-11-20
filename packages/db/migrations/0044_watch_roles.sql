ALTER TABLE "watch_sources" ADD COLUMN "role" text DEFAULT 'signal' NOT NULL;--> statement-breakpoint
CREATE INDEX "watch_pages_phrase_idx" ON "watch_pages" USING btree ("phrase");--> statement-breakpoint
ALTER TABLE "watch_sources" ADD CONSTRAINT "watch_sources_role_valid" CHECK ("watch_sources"."role" in ('signal', 'confirm'));