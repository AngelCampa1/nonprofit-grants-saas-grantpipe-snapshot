CREATE TABLE "accounting_oauth_states" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"actor_id" text,
	"provider" text NOT NULL,
	"nonce_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounting_oauth_states" ADD CONSTRAINT "accounting_oauth_states_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "accounting_oauth_states" ADD CONSTRAINT "accounting_oauth_states_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounting_oauth_states_nonce_hash_idx" ON "accounting_oauth_states" USING btree ("nonce_hash");--> statement-breakpoint
CREATE INDEX "accounting_oauth_states_org_provider_idx" ON "accounting_oauth_states" USING btree ("org_id","provider");--> statement-breakpoint
CREATE INDEX "accounting_oauth_states_expires_idx" ON "accounting_oauth_states" USING btree ("expires_at");