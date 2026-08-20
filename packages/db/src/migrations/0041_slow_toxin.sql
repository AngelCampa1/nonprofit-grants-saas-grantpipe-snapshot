CREATE TABLE "subawards" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"subrecipient_id" text NOT NULL,
	"grant_id" text NOT NULL,
	"title" text NOT NULL,
	"subaward_number" text,
	"amount_cents" bigint NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"end_date" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"scope_summary" text,
	"risk_rating" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subrecipient_corrective_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"finding_id" text NOT NULL,
	"title" text NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"owner_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution_notes" text,
	"completed_at" timestamp with time zone,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subrecipient_findings" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"subaward_id" text NOT NULL,
	"monitoring_task_id" text,
	"title" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"description" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subrecipient_monitoring_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"subaward_id" text NOT NULL,
	"monitoring_task_id" text,
	"log_type" text NOT NULL,
	"title" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"summary" text NOT NULL,
	"document_id" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subrecipient_monitoring_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"subaward_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" timestamp with time zone NOT NULL,
	"owner_id" text,
	"status" text DEFAULT 'open' NOT NULL,
	"evidence_document_id" text,
	"completed_at" timestamp with time zone,
	"completed_by" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subrecipient_risk_assessments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"subaward_id" text NOT NULL,
	"checklist" jsonb NOT NULL,
	"suggested_risk_rating" text NOT NULL,
	"final_risk_rating" text NOT NULL,
	"override_reason" text,
	"assessed_by" text NOT NULL,
	"assessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subrecipients" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"uei" text,
	"primary_contact_id" text,
	"status" text DEFAULT 'active' NOT NULL,
	"owner_id" text,
	"notes" text,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "subawards" ADD CONSTRAINT "subawards_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subawards" ADD CONSTRAINT "subawards_subrecipient_id_subrecipients_id_fk" FOREIGN KEY ("subrecipient_id") REFERENCES "public"."subrecipients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subawards" ADD CONSTRAINT "subawards_grant_id_grants_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."grants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subawards" ADD CONSTRAINT "subawards_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_corrective_actions" ADD CONSTRAINT "subrecipient_corrective_actions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_corrective_actions" ADD CONSTRAINT "subrecipient_corrective_actions_finding_id_subrecipient_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."subrecipient_findings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_corrective_actions" ADD CONSTRAINT "subrecipient_corrective_actions_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_corrective_actions" ADD CONSTRAINT "subrecipient_corrective_actions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_findings" ADD CONSTRAINT "subrecipient_findings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_findings" ADD CONSTRAINT "subrecipient_findings_subaward_id_subawards_id_fk" FOREIGN KEY ("subaward_id") REFERENCES "public"."subawards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_findings" ADD CONSTRAINT "subrecipient_findings_monitoring_task_id_subrecipient_monitoring_tasks_id_fk" FOREIGN KEY ("monitoring_task_id") REFERENCES "public"."subrecipient_monitoring_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_findings" ADD CONSTRAINT "subrecipient_findings_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_monitoring_logs" ADD CONSTRAINT "subrecipient_monitoring_logs_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_monitoring_logs" ADD CONSTRAINT "subrecipient_monitoring_logs_subaward_id_subawards_id_fk" FOREIGN KEY ("subaward_id") REFERENCES "public"."subawards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_monitoring_logs" ADD CONSTRAINT "subrecipient_monitoring_logs_monitoring_task_id_subrecipient_monitoring_tasks_id_fk" FOREIGN KEY ("monitoring_task_id") REFERENCES "public"."subrecipient_monitoring_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_monitoring_logs" ADD CONSTRAINT "subrecipient_monitoring_logs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_monitoring_logs" ADD CONSTRAINT "subrecipient_monitoring_logs_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_monitoring_tasks" ADD CONSTRAINT "subrecipient_monitoring_tasks_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_monitoring_tasks" ADD CONSTRAINT "subrecipient_monitoring_tasks_subaward_id_subawards_id_fk" FOREIGN KEY ("subaward_id") REFERENCES "public"."subawards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_monitoring_tasks" ADD CONSTRAINT "subrecipient_monitoring_tasks_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_monitoring_tasks" ADD CONSTRAINT "subrecipient_monitoring_tasks_evidence_document_id_documents_id_fk" FOREIGN KEY ("evidence_document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_monitoring_tasks" ADD CONSTRAINT "subrecipient_monitoring_tasks_completed_by_user_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_monitoring_tasks" ADD CONSTRAINT "subrecipient_monitoring_tasks_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_risk_assessments" ADD CONSTRAINT "subrecipient_risk_assessments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_risk_assessments" ADD CONSTRAINT "subrecipient_risk_assessments_subaward_id_subawards_id_fk" FOREIGN KEY ("subaward_id") REFERENCES "public"."subawards"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipient_risk_assessments" ADD CONSTRAINT "subrecipient_risk_assessments_assessed_by_user_id_fk" FOREIGN KEY ("assessed_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipients" ADD CONSTRAINT "subrecipients_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipients" ADD CONSTRAINT "subrecipients_primary_contact_id_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipients" ADD CONSTRAINT "subrecipients_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subrecipients" ADD CONSTRAINT "subrecipients_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "subawards_org_grant_idx" ON "subawards" USING btree ("org_id","grant_id");--> statement-breakpoint
CREATE INDEX "subawards_org_subrecipient_idx" ON "subawards" USING btree ("org_id","subrecipient_id");--> statement-breakpoint
CREATE INDEX "subawards_org_risk_idx" ON "subawards" USING btree ("org_id","risk_rating");--> statement-breakpoint
CREATE INDEX "subrecipient_actions_org_finding_idx" ON "subrecipient_corrective_actions" USING btree ("org_id","finding_id");--> statement-breakpoint
CREATE INDEX "subrecipient_actions_org_due_date_idx" ON "subrecipient_corrective_actions" USING btree ("org_id","due_date");--> statement-breakpoint
CREATE INDEX "subrecipient_findings_org_subaward_status_idx" ON "subrecipient_findings" USING btree ("org_id","subaward_id","status");--> statement-breakpoint
CREATE INDEX "subrecipient_logs_org_subaward_idx" ON "subrecipient_monitoring_logs" USING btree ("org_id","subaward_id");--> statement-breakpoint
CREATE INDEX "subrecipient_tasks_org_subaward_status_idx" ON "subrecipient_monitoring_tasks" USING btree ("org_id","subaward_id","status");--> statement-breakpoint
CREATE INDEX "subrecipient_tasks_org_due_date_idx" ON "subrecipient_monitoring_tasks" USING btree ("org_id","due_date");--> statement-breakpoint
CREATE INDEX "subrecipient_risk_org_subaward_idx" ON "subrecipient_risk_assessments" USING btree ("org_id","subaward_id");--> statement-breakpoint
CREATE INDEX "subrecipients_org_status_idx" ON "subrecipients" USING btree ("org_id","status");
