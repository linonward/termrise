CREATE TABLE "new_word_roots" (
	"word_id" uuid NOT NULL,
	"root" text NOT NULL,
	"growth" integer,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "new_word_roots_word_id_root_pk" PRIMARY KEY("word_id","root")
);
--> statement-breakpoint
CREATE TABLE "new_words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phrase" text NOT NULL,
	"category" text,
	"about" text,
	"user_wants" text,
	"plan" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"curve" jsonb,
	"burst_day" date,
	"peak_day" date,
	"is_new" text,
	"from_zero" text,
	"rising" text,
	"pre_burst_share" real,
	"ratio" real,
	"ratio_day" date,
	"search_volume" integer,
	"keyword_difficulty" integer,
	"cpc_micros" bigint,
	"dedicated_pages" integer,
	"serp" jsonb,
	"new_sites" jsonb,
	"verdict" text,
	"build_as" text,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rules" text,
	"checked_at" timestamp with time zone,
	"next_check_at" timestamp with time zone,
	"checks" integer DEFAULT 0 NOT NULL,
	"hidden_at" timestamp with time zone,
	CONSTRAINT "new_words_phrase_unique" UNIQUE("phrase"),
	CONSTRAINT "new_words_verdict_valid" CHECK ("new_words"."verdict" is null or "new_words"."verdict" in ('worth', 'try', 'skip'))
);
--> statement-breakpoint
ALTER TABLE "pool_rounds" DROP CONSTRAINT "pool_rounds_kind_valid";--> statement-breakpoint
ALTER TABLE "new_word_roots" ADD CONSTRAINT "new_word_roots_word_id_new_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."new_words"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "new_words_seen_idx" ON "new_words" USING btree ("first_seen_at");--> statement-breakpoint
CREATE INDEX "new_words_next_check_idx" ON "new_words" USING btree ("next_check_at");--> statement-breakpoint
ALTER TABLE "pool_rounds" ADD CONSTRAINT "pool_rounds_kind_valid" CHECK ("pool_rounds"."kind" in ('daily', 'manual', 'new_words'));