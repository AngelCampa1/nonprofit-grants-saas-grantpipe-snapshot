CREATE TABLE "trial_email_schedule" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"email_kind" text NOT NULL,
	"send_after" timestamp with time zone NOT NULL,
	"sent_at" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trial_email_schedule" ADD CONSTRAINT "trial_email_schedule_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "trial_email_schedule" ADD CONSTRAINT "trial_email_schedule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "trial_email_schedule_org_user_kind_unique" ON "trial_email_schedule" USING btree ("org_id","user_id","email_kind");
--> statement-breakpoint
CREATE INDEX "trial_email_schedule_due_idx" ON "trial_email_schedule" USING btree ("send_after");
