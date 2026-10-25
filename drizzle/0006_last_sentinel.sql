ALTER TYPE "public"."stock_movement_reason" ADD VALUE 'order_edit' BEFORE 'cancellation';--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "low_stock_threshold" integer DEFAULT 5 NOT NULL;