ALTER TABLE "notifications" ADD COLUMN "active_entity_id" text;--> statement-breakpoint
WITH notification_entities AS (
  SELECT n."id" AS notification_id, e."entity_id" AS active_entity_id
  FROM "notifications" n
  JOIN "expenses" e
    ON n."entity_type" = 'expense'
   AND n."entity_id" = e."id"
   AND n."org_id" = e."org_id"
  WHERE n."type" = 'accounting_anomaly'
  UNION ALL
  SELECT n."id", g."entity_id"
  FROM "notifications" n
  JOIN "grant_payment_requests" r
    ON n."entity_type" = 'payment_request'
   AND n."entity_id" = r."id"
   AND n."org_id" = r."org_id"
  JOIN "grants" g
    ON g."id" = r."grant_id"
   AND g."org_id" = r."org_id"
  WHERE n."type" = 'accounting_anomaly'
  UNION ALL
  SELECT n."id", COALESCE(df."entity_id", dg."entity_id", o."default_entity_id")
  FROM "notifications" n
  JOIN "donations" d
    ON n."entity_type" = 'donation'
   AND n."entity_id" = d."id"
   AND n."org_id" = d."org_id"
  JOIN "organizations" o ON o."id" = d."org_id"
  LEFT JOIN "funds" df ON df."id" = d."fund_id" AND df."org_id" = d."org_id"
  LEFT JOIN "grants" dg ON dg."id" = d."grant_id" AND dg."org_id" = d."org_id"
  WHERE n."type" = 'accounting_anomaly'
  UNION ALL
  SELECT n."id", COALESCE(
    tf."entity_id",
    tg."entity_id",
    rdf."entity_id",
    rdg."entity_id",
    o."default_entity_id"
  )
  FROM "notifications" n
  JOIN "restriction_releases" rr
    ON n."entity_type" = 'restriction_release'
   AND n."entity_id" = rr."id"
   AND n."org_id" = rr."org_id"
  JOIN "restriction_terms" rt
    ON rt."id" = rr."restriction_term_id"
   AND rt."org_id" = rr."org_id"
  JOIN "organizations" o ON o."id" = rt."org_id"
  LEFT JOIN "funds" tf ON tf."id" = rt."fund_id" AND tf."org_id" = rt."org_id"
  LEFT JOIN "grants" tg ON tg."id" = rt."grant_id" AND tg."org_id" = rt."org_id"
  LEFT JOIN "donations" rd ON rd."id" = rt."donation_id" AND rd."org_id" = rt."org_id"
  LEFT JOIN "funds" rdf ON rdf."id" = rd."fund_id" AND rdf."org_id" = rd."org_id"
  LEFT JOIN "grants" rdg ON rdg."id" = rd."grant_id" AND rdg."org_id" = rd."org_id"
  WHERE n."type" = 'accounting_anomaly'
)
UPDATE "notifications" n
SET "active_entity_id" = scoped.active_entity_id
FROM notification_entities scoped
WHERE n."id" = scoped.notification_id
  AND scoped.active_entity_id IS NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_active_entity_id_entities_id_fk" FOREIGN KEY ("active_entity_id") REFERENCES "public"."entities"("id") ON DELETE no action ON UPDATE no action;
