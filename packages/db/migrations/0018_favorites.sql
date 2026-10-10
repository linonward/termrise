CREATE TABLE "radar_favorites" (
	"user_id" text NOT NULL,
	"item_id" uuid NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "radar_favorites_user_id_item_id_pk" PRIMARY KEY("user_id","item_id")
);
--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "starred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "radar_favorites" ADD CONSTRAINT "radar_favorites_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radar_favorites" ADD CONSTRAINT "radar_favorites_item_id_radar_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."radar_items"("id") ON DELETE cascade ON UPDATE no action;