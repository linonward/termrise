CREATE TABLE "new_domains" (
	"domain" text PRIMARY KEY NOT NULL,
	"listed_on" date NOT NULL,
	"label" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"title" text,
	"has_pricing" boolean,
	"phrase" text,
	"probed_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "new_domains_status_valid" CHECK ("new_domains"."status" in ('pending', 'live', 'parked', 'unresolved'))
);
--> statement-breakpoint
CREATE INDEX "new_domains_listed_idx" ON "new_domains" USING btree ("listed_on");