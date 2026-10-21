CREATE TABLE "opportunity_keyword_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opportunity_id" uuid NOT NULL,
	"keyword_id" uuid NOT NULL,
	"off_topic" boolean NOT NULL,
	"reviewer_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opportunity_keyword_reviews_unique" UNIQUE("opportunity_id","keyword_id")
);
--> statement-breakpoint
ALTER TABLE "opportunity_keyword_reviews" ADD CONSTRAINT "opportunity_keyword_reviews_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_keyword_reviews" ADD CONSTRAINT "opportunity_keyword_reviews_keyword_id_keywords_id_fk" FOREIGN KEY ("keyword_id") REFERENCES "public"."keywords"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_keyword_reviews" ADD CONSTRAINT "opportunity_keyword_reviews_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;