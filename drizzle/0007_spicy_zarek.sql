CREATE TABLE "api_request_metrics" (
	"bucket_start" timestamp with time zone NOT NULL,
	"method" text NOT NULL,
	"route" text NOT NULL,
	"request_count" integer DEFAULT 0 NOT NULL,
	"client_error_count" integer DEFAULT 0 NOT NULL,
	"server_error_count" integer DEFAULT 0 NOT NULL,
	"slow_request_count" integer DEFAULT 0 NOT NULL,
	"latency_le_50" integer DEFAULT 0 NOT NULL,
	"latency_le_100" integer DEFAULT 0 NOT NULL,
	"latency_le_250" integer DEFAULT 0 NOT NULL,
	"latency_le_500" integer DEFAULT 0 NOT NULL,
	"latency_le_1000" integer DEFAULT 0 NOT NULL,
	"latency_le_2000" integer DEFAULT 0 NOT NULL,
	"latency_le_5000" integer DEFAULT 0 NOT NULL,
	"latency_gt_5000" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_api_request_metrics_bucket_route_method" ON "api_request_metrics" USING btree ("bucket_start","route","method");--> statement-breakpoint
CREATE INDEX "idx_api_request_metrics_bucket_start" ON "api_request_metrics" USING btree ("bucket_start");