CREATE TABLE "user_guide_progress" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"user_id" text NOT NULL,
	"guide_key" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"last_step" text,
	"completed_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_guide_progress" ADD CONSTRAINT "user_guide_progress_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_guide_progress" ADD CONSTRAINT "user_guide_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_guide_progress_org_user_guide_unique" ON "user_guide_progress" USING btree ("org_id","user_id","guide_key");--> statement-breakpoint
CREATE INDEX "user_guide_progress_org_user_idx" ON "user_guide_progress" USING btree ("org_id","user_id");