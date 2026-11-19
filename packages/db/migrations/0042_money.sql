CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"paid_on" date NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"category" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"domain" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_positive" CHECK ("expenses"."amount_minor" > 0),
	CONSTRAINT "expenses_currency_valid" CHECK ("expenses"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "expenses_category_valid" CHECK ("expenses"."category" in ('domain', 'hosting', 'data', 'ai', 'tool', 'other'))
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"domain" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone,
	"registrar" text,
	"checked_at" timestamp with time zone NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_paid_on_idx" ON "expenses" USING btree ("paid_on");