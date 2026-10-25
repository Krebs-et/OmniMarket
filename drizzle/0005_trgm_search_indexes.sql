CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_customer_name_trgm_idx" ON "orders" USING gin ("customer_name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_order_number_trgm_idx" ON "orders" USING gin ("order_number" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_name_trgm_idx" ON "products" USING gin ("name" gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_sku_trgm_idx" ON "products" USING gin ("sku" gin_trgm_ops);
