CREATE TABLE "document_extractions" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "organizations"("id"),
  "document_id" text NOT NULL REFERENCES "documents"("id"),
  "created_grant_id" text REFERENCES "grants"("id"),
  "status" text DEFAULT 'pending' NOT NULL,
  "provider" text DEFAULT 'openrouter' NOT NULL,
  "model_id" text NOT NULL,
  "provider_request_id" text,
  "prompt_version" text NOT NULL,
  "raw_normalized_json" jsonb,
  "token_usage_json" jsonb,
  "estimated_cost_cents" bigint,
  "failure_message" text,
  "created_by" text NOT NULL REFERENCES "user"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

CREATE TABLE "document_extraction_fields" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "organizations"("id"),
  "extraction_id" text NOT NULL REFERENCES "document_extractions"("id"),
  "field_key" text NOT NULL,
  "section" text NOT NULL,
  "destination_entity_type" text NOT NULL,
  "destination_field" text NOT NULL,
  "value_json" jsonb NOT NULL,
  "normalized_value_json" jsonb,
  "confidence" integer NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "required" boolean DEFAULT false NOT NULL,
  "created_record_type" text,
  "created_record_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "document_extraction_sources" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "organizations"("id"),
  "extraction_id" text NOT NULL REFERENCES "document_extractions"("id"),
  "field_id" text REFERENCES "document_extraction_fields"("id"),
  "page_number" integer,
  "snippet" text NOT NULL,
  "bounding_box_json" jsonb,
  "source_offset_start" integer,
  "source_offset_end" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "document_extraction_actions" (
  "id" text PRIMARY KEY NOT NULL,
  "org_id" text NOT NULL REFERENCES "organizations"("id"),
  "extraction_id" text NOT NULL REFERENCES "document_extractions"("id"),
  "field_id" text REFERENCES "document_extraction_fields"("id"),
  "action" text NOT NULL,
  "previous_value_json" jsonb,
  "next_value_json" jsonb,
  "mapped_entity_type" text,
  "mapped_entity_id" text,
  "created_record_type" text,
  "created_record_id" text,
  "note" text,
  "actor_id" text NOT NULL REFERENCES "user"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "document_extractions_org_document_status_idx"
  ON "document_extractions" ("org_id", "document_id", "status");
CREATE INDEX "document_extractions_org_created_grant_idx"
  ON "document_extractions" ("org_id", "created_grant_id");
CREATE INDEX "document_extraction_fields_org_extraction_section_idx"
  ON "document_extraction_fields" ("org_id", "extraction_id", "section");
CREATE INDEX "document_extraction_sources_org_extraction_field_idx"
  ON "document_extraction_sources" ("org_id", "extraction_id", "field_id");
CREATE INDEX "document_extraction_actions_org_extraction_created_idx"
  ON "document_extraction_actions" ("org_id", "extraction_id", "created_at");
