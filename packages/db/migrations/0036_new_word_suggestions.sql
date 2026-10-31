CREATE TABLE "new_word_suggestions" (
	"root" text NOT NULL,
	"phrase" text NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "new_word_suggestions_root_phrase_pk" PRIMARY KEY("root","phrase")
);
