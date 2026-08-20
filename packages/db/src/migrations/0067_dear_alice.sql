CREATE TABLE "outcome_goals" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"program_id" text,
	"grant_id" text,
	"name" text NOT NULL,
	"statement" text NOT NULL,
	"target_population" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outcome_indicators" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"outcome_id" text NOT NULL,
	"impact_metric_id" text,
	"name" text NOT NULL,
	"indicator_type" text DEFAULT 'outcome' NOT NULL,
	"direction" text DEFAULT 'increase' NOT NULL,
	"target_value" numeric,
	"baseline_value" numeric,
	"unit" text,
	"source" text,
	"funder_defined" boolean DEFAULT false NOT NULL,
	"reporting_cadence" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "outcome_goals" ADD CONSTRAINT "outcome_goals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_goals" ADD CONSTRAINT "outcome_goals_program_id_programs_id_fk" FOREIGN KEY ("program_id") REFERENCES "public"."programs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_goals" ADD CONSTRAINT "outcome_goals_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_indicators" ADD CONSTRAINT "outcome_indicators_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_indicators" ADD CONSTRAINT "outcome_indicators_outcome_id_outcome_goals_id_fk" FOREIGN KEY ("outcome_id") REFERENCES "public"."outcome_goals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcome_indicators" ADD CONSTRAINT "outcome_indicators_impact_metric_id_grant_impact_metrics_id_fk" FOREIGN KEY ("impact_metric_id") REFERENCES "public"."grant_impact_metrics"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "outcome_goals_org_status_idx" ON "outcome_goals" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "outcome_goals_org_program_idx" ON "outcome_goals" USING btree ("org_id","program_id");--> statement-breakpoint
CREATE INDEX "outcome_goals_org_grant_idx" ON "outcome_goals" USING btree ("org_id","grant_id");--> statement-breakpoint
CREATE INDEX "outcome_indicators_org_outcome_idx" ON "outcome_indicators" USING btree ("org_id","outcome_id");--> statement-breakpoint
CREATE INDEX "outcome_indicators_org_metric_idx" ON "outcome_indicators" USING btree ("org_id","impact_metric_id");