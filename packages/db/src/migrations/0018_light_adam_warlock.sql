ALTER TABLE "organizations" ADD COLUMN "accounting_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_chart_of_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "chart_of_accounts"("id") ON DELETE set null ON UPDATE no action;