import { Hono, type Context } from "hono";
import type { AppEnv } from "../../types";
import { getIntegrations } from "../../lib/integrations";
import { badRequest } from "../../lib/app-error";
import { captureBackgroundException } from "../../lib/sentry";
import { requirePermission } from "../../middleware/require-role";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { contacts, funders, funds, grants, sampleDataRecords } from "@grantpipe/db";
import { eq, isNull, notInArray, and, sql } from "drizzle-orm";
import {
  seedSampleData,
  clearSampleData,
  getSampleDataStatus,
  SampleDataConflictError,
} from "./service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countBucket(count: number): string {
  if (count <= 0) return "0";
  if (count <= 25) return "1_25";
  if (count <= 100) return "26_100";
  return "100_plus";
}

async function captureSampleDataEvent(
  c: Context<AppEnv>,
  params: { eventName: string; operation: string; payload: Record<string, unknown> },
): Promise<void> {
  try {
    await getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics.capture({
      orgId: c.get("orgId")!,
      eventName: params.eventName,
      payload: {
        surface: "api",
        ...params.payload,
      },
    });
  } catch (error) {
    captureBackgroundException(error, "sample-data", {
      telemetry: "analytics_capture",
      operation: params.operation,
    });
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const sampleDataRoutes = new Hono<AppEnv>()
  // ------------------------------------------------------------------
  // GET /status — any authenticated role can read (session + org middleware
  // applied at mount; no feature-area gate so auditor/viewer both reach it)
  // ------------------------------------------------------------------
  .get("/status", async (c) => {
    const orgId = c.get("orgId")!;
    const db = c.get("db");

    try {
      const result = await getSampleDataStatus({
        countLedger: async () => {
          const rows = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(sampleDataRecords)
            .where(eq(sampleDataRecords.orgId, orgId));
          return rows[0]?.count ?? 0;
        },
      });
      return c.json(result, 200);
    } catch (error) {
      captureBackgroundException(error, "sample-data", {
        operation: "status",
      });
      return c.json({ error: "Internal server error" }, 500);
    }
  })

  // ------------------------------------------------------------------
  // POST / — seed sample data (editor+ can create records)
  // ------------------------------------------------------------------
  .post("/", requirePermission("donors", "edit"), async (c) => {
    const orgId = c.get("orgId")!;
    const entityId = c.get("entityId");
    if (!entityId) throw badRequest("Active entity is required to seed sample data.");
    const db = c.get("db");

    try {
      const result = await seedSampleData(db, {
        orgId,
        entityId,
        alreadySeeded: async () => {
          const rows = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(sampleDataRecords)
            .where(eq(sampleDataRecords.orgId, orgId));
          return (rows[0]?.count ?? 0) > 0;
        },
        hasRealData: async () => {
          // Check core business tables for any non-sample rows (i.e. not in the ledger).
          // A row is "real" when it belongs to the org AND its id is NOT tracked
          // in sampleDataRecords. We use a subquery for each table.
          // Soft-delete is respected: only check rows where deletedAt is null.
          // funds is included alongside contacts/grants/funders because a brand-new
          // org could create a fund first; seeding over real funds must be refused.
          const sampleIds = db
            .select({ entityId: sampleDataRecords.entityId })
            .from(sampleDataRecords)
            .where(eq(sampleDataRecords.orgId, orgId));

          const [contactCheck, grantCheck, funderCheck, fundCheck] = await Promise.all([
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(contacts)
              .where(
                and(
                  eq(contacts.orgId, orgId),
                  isNull(contacts.deletedAt),
                  notInArray(contacts.id, sampleIds),
                ),
              ),
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(grants)
              .where(
                and(
                  eq(grants.orgId, orgId),
                  isNull(grants.deletedAt),
                  notInArray(grants.id, sampleIds),
                ),
              ),
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(funders)
              .where(
                and(
                  eq(funders.orgId, orgId),
                  isNull(funders.deletedAt),
                  notInArray(funders.id, sampleIds),
                ),
              ),
            db
              .select({ count: sql<number>`count(*)::int` })
              .from(funds)
              .where(
                and(
                  eq(funds.orgId, orgId),
                  isNull(funds.deletedAt),
                  notInArray(funds.id, sampleIds),
                ),
              ),
          ]);

          return (
            (contactCheck[0]?.count ?? 0) > 0 ||
            (grantCheck[0]?.count ?? 0) > 0 ||
            (funderCheck[0]?.count ?? 0) > 0 ||
            (fundCheck[0]?.count ?? 0) > 0
          );
        },
        // Serialize concurrent seeds for this org with a transaction-scoped
        // advisory lock (auto-released at COMMIT/ROLLBACK), then re-read the
        // ledger inside the same transaction. This makes the double-click seed
        // race impossible: the second request blocks on the lock, then sees the
        // first request's ledger rows and aborts.
        lockOrg: async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${orgId}))`);
        },
        recheckSeeded: async (tx) => {
          const rows = await tx
            .select({ count: sql<number>`count(*)::int` })
            .from(sampleDataRecords)
            .where(eq(sampleDataRecords.orgId, orgId));
          return (rows[0]?.count ?? 0) > 0;
        },
      });

      await captureSampleDataEvent(c, {
        eventName: ANALYTICS_EVENTS.sampleDataSeeded,
        operation: "seed",
        payload: {
          record_count_bucket: countBucket(result.recordCount),
        },
      });

      return c.json(result, 200);
    } catch (error) {
      if (error instanceof SampleDataConflictError) {
        return c.json({ error: error.message }, 409);
      }
      captureBackgroundException(error, "sample-data", {
        operation: "seed",
      });
      return c.json({ error: "Internal server error" }, 500);
    }
  })

  // ------------------------------------------------------------------
  // DELETE / — clear sample data (editor+ can delete records)
  //
  // Sample records are intentionally hard-deleted (not soft-deleted) and are
  // deliberately NOT written to activity_log. They are clearly-labeled,
  // org-private demo rows with a dedicated ledger (sampleDataRecords) that
  // records exactly what was created and removed. The audit trail's purpose is
  // tracking real nonprofit data changes; tagging synthetic seed churn into it
  // would add noise without compliance value. The clear is also one-click and
  // reversible (re-seed), so there is no destructive-action trail to preserve.
  // ------------------------------------------------------------------
  .delete("/", requirePermission("donors", "edit"), async (c) => {
    const orgId = c.get("orgId")!;
    const db = c.get("db");

    try {
      const result = await clearSampleData(db, {
        orgId,
        ledgerByTable: async () => {
          const rows = await db
            .select({
              entityTable: sampleDataRecords.entityTable,
              entityId: sampleDataRecords.entityId,
            })
            .from(sampleDataRecords)
            .where(eq(sampleDataRecords.orgId, orgId));

          const grouped: Record<string, string[]> = {};
          for (const row of rows) {
            const existing = grouped[row.entityTable];
            if (existing) {
              existing.push(row.entityId);
            } else {
              grouped[row.entityTable] = [row.entityId];
            }
          }
          return grouped;
        },
      });

      await captureSampleDataEvent(c, {
        eventName: ANALYTICS_EVENTS.sampleDataCleared,
        operation: "clear",
        payload: {
          record_count_bucket: countBucket(result.recordCount),
        },
      });

      return c.json(result, 200);
    } catch (error) {
      captureBackgroundException(error, "sample-data", {
        operation: "clear",
      });
      return c.json({ error: "Internal server error" }, 500);
    }
  });
