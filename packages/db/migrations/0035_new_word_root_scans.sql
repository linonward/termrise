CREATE TABLE "new_word_root_scans" (
	"root" text PRIMARY KEY NOT NULL,
	"scanned_at" timestamp with time zone NOT NULL,
	"rising" integer DEFAULT 0 NOT NULL
);
