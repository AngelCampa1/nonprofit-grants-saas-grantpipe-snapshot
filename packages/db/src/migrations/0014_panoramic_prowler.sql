CREATE TABLE "lead_magnet_downloads" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"magnet_slug" text NOT NULL,
	"downloaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_nurture_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"lead_id" text NOT NULL,
	"step" integer NOT NULL,
	"send_after" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"source_page" text,
	"first_magnet_slug" text,
	"utm" jsonb,
	"consent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "lead_magnet_downloads" ADD CONSTRAINT "lead_magnet_downloads_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_nurture_schedule" ADD CONSTRAINT "lead_nurture_schedule_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lead_magnet_downloads_lead_magnet_unique" ON "lead_magnet_downloads" USING btree ("lead_id","magnet_slug");--> statement-breakpoint
CREATE UNIQUE INDEX "lead_nurture_schedule_lead_step_unique" ON "lead_nurture_schedule" USING btree ("lead_id","step");--> statement-breakpoint
CREATE INDEX "lead_nurture_schedule_send_after_lead_idx" ON "lead_nurture_schedule" USING btree ("send_after","lead_id");