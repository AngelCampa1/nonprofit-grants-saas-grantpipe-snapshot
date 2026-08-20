CREATE TABLE "entities" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"parent_entity_id" text,
	"name" text NOT NULL,
	"kind" text DEFAULT 'root' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"fiscal_sponsor_model" text DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "entities_org_id_id_unique" UNIQUE("org_id","id"),
	CONSTRAINT "entities_kind_chk" CHECK ("entities"."kind" IN ('root', 'legal_entity', 'sponsored_project', 'agency_client', 'consolidation_group')),
	CONSTRAINT "entities_status_chk" CHECK ("entities"."status" IN ('active', 'archived')),
	CONSTRAINT "entities_fiscal_sponsor_model_chk" CHECK ("entities"."fiscal_sponsor_model" IN ('none', 'model_a', 'model_c'))
);
--> statement-breakpoint
CREATE TABLE "entity_members" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"entity_id" text NOT NULL,
	"org_member_id" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"permissions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "entity_members_role_chk" CHECK ("entity_members"."role" IN ('admin', 'editor', 'viewer', 'auditor'))
);
--> statement-breakpoint
ALTER TABLE "invite_links" ADD COLUMN "entity_id" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "default_entity_id" text;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_parent_entity_id_entities_id_fk" FOREIGN KEY ("parent_entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_parent_same_org_fk" FOREIGN KEY ("org_id","parent_entity_id") REFERENCES "public"."entities"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_members" ADD CONSTRAINT "org_members_org_id_id_unique" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "entity_members" ADD CONSTRAINT "entity_members_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_members" ADD CONSTRAINT "entity_members_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_members" ADD CONSTRAINT "entity_members_org_member_id_org_members_id_fk" FOREIGN KEY ("org_member_id") REFERENCES "public"."org_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_members" ADD CONSTRAINT "entity_members_org_entity_fk" FOREIGN KEY ("org_id","entity_id") REFERENCES "public"."entities"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_members" ADD CONSTRAINT "entity_members_org_member_same_org_fk" FOREIGN KEY ("org_id","org_member_id") REFERENCES "public"."org_members"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entities_org_status_idx" ON "entities" USING btree ("org_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_org_name_active_idx" ON "entities" USING btree ("org_id","name") WHERE "entities"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "entity_members_org_idx" ON "entity_members" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "entity_members_entity_idx" ON "entity_members" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "entity_members_org_member_idx" ON "entity_members" USING btree ("org_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entity_members_entity_org_member_active_idx" ON "entity_members" USING btree ("entity_id","org_member_id") WHERE "entity_members"."deleted_at" IS NULL;--> statement-breakpoint
INSERT INTO "entities" (
	"id",
	"org_id",
	"name",
	"kind",
	"status",
	"fiscal_sponsor_model",
	"created_at",
	"updated_at"
)
SELECT
	'default_entity_' || "organizations"."id",
	"organizations"."id",
	"organizations"."name",
	'root',
	'active',
	'none',
	now(),
	now()
FROM "organizations"
WHERE "organizations"."deleted_at" IS NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
UPDATE "organizations"
SET "default_entity_id" = 'default_entity_' || "organizations"."id"
WHERE "organizations"."deleted_at" IS NULL
	AND "organizations"."default_entity_id" IS NULL;--> statement-breakpoint
INSERT INTO "entity_members" (
	"id",
	"org_id",
	"entity_id",
	"org_member_id",
	"role",
	"permissions",
	"created_at",
	"updated_at"
)
SELECT
	'default_entity_member_' || "org_members"."id",
	"org_members"."org_id",
	"organizations"."default_entity_id",
	"org_members"."id",
	CASE
		WHEN "org_members"."role" IN ('admin', 'editor', 'viewer', 'auditor') THEN "org_members"."role"
		ELSE 'viewer'
	END,
	"org_members"."permissions",
	now(),
	now()
FROM "org_members"
JOIN "organizations" ON "organizations"."id" = "org_members"."org_id"
WHERE "org_members"."deleted_at" IS NULL
	AND "organizations"."deleted_at" IS NULL
	AND "organizations"."default_entity_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_entity_id_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_links" ADD CONSTRAINT "invite_links_org_entity_fk" FOREIGN KEY ("org_id","entity_id") REFERENCES "public"."entities"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_default_entity_id_entities_id_fk" FOREIGN KEY ("default_entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_id_default_entity_id_unique" UNIQUE("id","default_entity_id");--> statement-breakpoint
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_default_entity_same_org_fk" FOREIGN KEY ("id","default_entity_id") REFERENCES "public"."entities"("org_id","id") ON DELETE no action ON UPDATE no action;
