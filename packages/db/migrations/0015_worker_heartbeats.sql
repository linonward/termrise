CREATE TABLE "worker_heartbeats" (
	"worker_id" text PRIMARY KEY NOT NULL,
	"keyword_provider" text NOT NULL,
	"analyst_provider" text NOT NULL,
	"analyst_model" text,
	"radar_enabled" boolean NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
