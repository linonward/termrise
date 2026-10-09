CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_session_id" text,
	"provider_order_id" text,
	"plan_id" text NOT NULL,
	"amount_usd" integer NOT NULL,
	"credits" integer NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_provider_order_unique" UNIQUE("provider","provider_order_id"),
	CONSTRAINT "subscriptions_status_valid" CHECK ("subscriptions"."status" in ('PENDING', 'ACTIVE', 'CANCELING', 'PAST_DUE', 'CANCELED', 'FAILED'))
);
--> statement-breakpoint
ALTER TABLE "credit_transactions" DROP CONSTRAINT "credit_transactions_type_valid";--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD COLUMN "subscription_id" uuid;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subscriptions_user_id_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_type_valid" CHECK ("credit_transactions"."type" in ('SIGNUP_BONUS', 'PURCHASE', 'PURCHASE_REVERSAL', 'TASK_DEBIT', 'TASK_REFUND', 'ADMIN_ADJUSTMENT', 'SUBSCRIPTION_GRANT'));