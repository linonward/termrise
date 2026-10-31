ALTER TABLE "execution_projects" ADD COLUMN "pool_keyword_id" uuid;--> statement-breakpoint
ALTER TABLE "execution_projects" ADD COLUMN "new_word_id" uuid;--> statement-breakpoint
ALTER TABLE "new_words" ADD COLUMN "selected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "execution_projects" ADD CONSTRAINT "execution_projects_pool_keyword_id_pool_keywords_id_fk" FOREIGN KEY ("pool_keyword_id") REFERENCES "public"."pool_keywords"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_projects" ADD CONSTRAINT "execution_projects_new_word_id_new_words_id_fk" FOREIGN KEY ("new_word_id") REFERENCES "public"."new_words"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_projects" ADD CONSTRAINT "execution_projects_pool_keyword_unique" UNIQUE("pool_keyword_id");--> statement-breakpoint
ALTER TABLE "execution_projects" ADD CONSTRAINT "execution_projects_new_word_unique" UNIQUE("new_word_id");