ALTER TABLE "donations" ADD COLUMN "goods_services_value_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "donations" ADD COLUMN "goods_services_description" text;