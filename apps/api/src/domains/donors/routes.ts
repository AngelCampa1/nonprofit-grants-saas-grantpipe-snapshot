// apps/api/src/domains/donors/routes.ts
import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ANALYTICS_EVENTS,
  createContactSchema,
  updateContactSchema,
  updatePipelineStageSchema,
  contactListSchema,
  contactExportSchema,
  createDonationSchema,
  updateDonationSchema,
  createTagSchema,
  updateTagSchema,
  addTagsSchema,
  createCommunicationSchema,
  donorMailMergeSendSchema,
  createSegmentSchema,
  updateSegmentSchema,
  paginationSchema,
  classifyRestrictionRequestSchema,
} from "@grantpipe/shared";
import { contacts, organizations, type Database } from "@grantpipe/db";
import { and, count, eq, isNull } from "drizzle-orm";
import type { AppEnv } from "../../types";
import { captureApiAnalyticsSafely } from "../../lib/analytics";
import { captureBackgroundException } from "../../lib/sentry";
import { getIntegrations } from "../../lib/integrations";
import { requireAllPermissions, requirePermission } from "../../middleware/require-role";
import {
  listContacts,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  updatePipelineStage,
  exportContactsCsv,
} from "./contact.service";
import { listDonations, createDonation, updateDonation, deleteDonation } from "./donation.service";
import { resolveAndClassifyRestriction } from "./classification.service";
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
  addContactTags,
  removeContactTag,
} from "./tag.service";
import { listCommunications, createCommunication } from "./communication.service";
import { sendDonorMailMerge } from "./mail-merge.service";
import { listSegments, createSegment, updateSegment, deleteSegment } from "./segment.service";
import { getDonorStats, getRetentionStats } from "./stats.service";
import { getAtRiskDonors } from "./lapse.service";
import { hasAutomationEmails, lapseRiskQuerySchema } from "@grantpipe/shared";
import { getContextEffectivePlanTier } from "../../lib/effective-plan-tier";

// ---------------------------------------------------------------------------
// Helper: get org fiscal year start month
// ---------------------------------------------------------------------------

async function getOrgFiscalMonth(db: Database, orgId: string): Promise<number> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
    columns: { fiscalYearStartMonth: true },
  });
  return org?.fiscalYearStartMonth ?? 1;
}

function analyticsForContext(c: Context<AppEnv>) {
  return getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics;
}

function captureDonorEvent(
  c: Context<AppEnv>,
  eventName: string,
  payload: Record<string, unknown>,
): void {
  const orgId = c.get("orgId");
  const user = c.get("user");

  if (!orgId || !user) {
    return;
  }

  captureApiAnalyticsSafely(
    analyticsForContext(c).capture({
      orgId,
      eventName,
      payload: {
        actorId: user.id,
        ...payload,
      },
    }),
    { c, eventName },
  );
}

function changedFields(data: Record<string, unknown>): string[] {
  return Object.keys(data);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export const donorRoutes = new Hono<AppEnv>()
  // -------------------------------------------------------------------------
  // Stats & Pipeline (must be before /:contactId to avoid route conflicts)
  // -------------------------------------------------------------------------
  .get("/stats", requirePermission("donors", "view"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const entityId = c.get("entityId")!;
    const fiscalYearStartMonth = await getOrgFiscalMonth(db, orgId);
    const stats = await getDonorStats(db, { orgId, entityId, fiscalYearStartMonth });
    return c.json(stats);
  })
  .get("/stats/retention", requirePermission("donors", "view"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const entityId = c.get("entityId")!;
    const fiscalYearStartMonth = await getOrgFiscalMonth(db, orgId);
    const retention = await getRetentionStats(db, {
      orgId,
      entityId,
      fiscalYearStartMonth,
      count: 5,
    });
    return c.json(retention);
  })
  // Reserve the retired donor pipeline path so it cannot fall through as a contact id.
  .get("/pipeline", requirePermission("donors", "view"), (c) => c.notFound())
  // -------------------------------------------------------------------------
  // Donor Lapse Early-Warning (must be before /:contactId)
  // -------------------------------------------------------------------------
  .get(
    "/lapse-risk",
    requirePermission("donors", "view"),
    zValidator("query", lapseRiskQuerySchema),
    async (c) => {
      const planTier = getContextEffectivePlanTier(c);
      if (!hasAutomationEmails(planTier)) {
        return c.json({ error: "insufficient_plan", required: "growth", current: planTier }, 402);
      }

      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const entityId = c.get("entityId")!;
      const { bands: bandsRaw, limit } = c.req.valid("query");

      const alertBandsConst = ["lapsing", "at_risk", "lapsed"] as const;
      type AlertBand = (typeof alertBandsConst)[number];
      let parsedBands: AlertBand[] | undefined;
      if (bandsRaw) {
        const bandTokens = bandsRaw
          .split(",")
          .map((b) => b.trim())
          .filter(Boolean);
        for (const token of bandTokens) {
          // "none" is a valid DonorLapseRiskBand but meaningless as a filter
          // (it is never stored on an at-risk donor). Reject it explicitly.
          if (!(alertBandsConst as readonly string[]).includes(token)) {
            return c.json({ error: "invalid_band", value: token }, 400);
          }
        }
        parsedBands = bandTokens as AlertBand[];
      }

      const now = new Date();
      const result = await getAtRiskDonors(db, {
        orgId,
        entityId,
        now,
        bands: parsedBands,
        limit,
      });

      return c.json({ asOf: now.toISOString(), donors: result.donors, totals: result.totals });
    },
  )
  // -------------------------------------------------------------------------
  // Restriction Auto-Classifier (must be before /:contactId)
  // -------------------------------------------------------------------------
  .post(
    "/classify-restriction",
    requirePermission("donors", "view"),
    zValidator("json", classifyRestrictionRequestSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const data = c.req.valid("json");
      const result = await resolveAndClassifyRestriction(db, { orgId, ...data });
      captureDonorEvent(c, ANALYTICS_EVENTS.restrictionClassificationSuggested, {
        classification: result.netAssetClass,
        source: result.signals[0]?.source,
      });
      return c.json(result);
    },
  )
  // -------------------------------------------------------------------------
  // Tags (must be before /:contactId)
  // -------------------------------------------------------------------------
  .get("/tags", requirePermission("donors", "view"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const result = await listTags(db, orgId);
    return c.json(result);
  })
  .post(
    "/tags",
    requirePermission("donors", "edit"),
    zValidator("json", createTagSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const actorId = c.get("user")!.id;
      const data = c.req.valid("json");
      const tag = await createTag(db, { orgId, actorId, ...data });
      return c.json(tag, 201);
    },
  )
  .patch(
    "/tags/:tagId",
    requirePermission("donors", "edit"),
    zValidator("json", updateTagSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const actorId = c.get("user")!.id;
      const tagId = c.req.param("tagId");
      const data = c.req.valid("json");
      const tag = await updateTag(db, { orgId, actorId, tagId, data });
      return c.json(tag);
    },
  )
  .delete("/tags/:tagId", requirePermission("donors", "manage"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const actorId = c.get("user")!.id;
    const tagId = c.req.param("tagId");
    await deleteTag(db, { orgId, actorId, tagId });
    return c.body(null, 204);
  })

  // -------------------------------------------------------------------------
  // Segments (must be before /:contactId)
  // -------------------------------------------------------------------------
  .get("/segments", requirePermission("donors", "view"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const result = await listSegments(db, orgId);
    return c.json(result);
  })
  .post(
    "/segments",
    requirePermission("donors", "edit"),
    zValidator("json", createSegmentSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const userId = c.get("user")!.id;
      const data = c.req.valid("json");
      const segment = await createSegment(db, {
        orgId,
        actorId: userId,
        createdBy: userId,
        ...data,
      });
      return c.json(segment, 201);
    },
  )
  .patch(
    "/segments/:segmentId",
    requirePermission("donors", "edit"),
    zValidator("json", updateSegmentSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const actorId = c.get("user")!.id;
      const segmentId = c.req.param("segmentId");
      const data = c.req.valid("json");
      const segment = await updateSegment(db, { orgId, actorId, segmentId, data });
      return c.json(segment);
    },
  )
  .delete("/segments/:segmentId", requirePermission("donors", "manage"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const actorId = c.get("user")!.id;
    const segmentId = c.req.param("segmentId");
    await deleteSegment(db, { orgId, actorId, segmentId });
    return c.body(null, 204);
  })

  // -------------------------------------------------------------------------
  // Contacts
  // -------------------------------------------------------------------------
  .get(
    "/export",
    requireAllPermissions([
      ["donors", "view"],
      ["reports", "view"],
    ]),
    zValidator("query", contactExportSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const params = c.req.valid("query");
      const csv = await exportContactsCsv(db, { orgId, ...params });
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="contacts.csv"',
          "X-Robots-Tag": "noindex, nofollow, noarchive",
          "Cache-Control": "private, no-store",
        },
      });
    },
  )
  .post(
    "/mail-merge/send",
    requirePermission("donors", "edit"),
    zValidator("json", donorMailMergeSendSchema),
    async (c) => {
      const planTier = getContextEffectivePlanTier(c);
      if (!hasAutomationEmails(planTier)) {
        return c.json({ error: "insufficient_plan", required: "growth", current: planTier }, 402);
      }

      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const userId = c.get("user")!.id;
      const data = c.req.valid("json");
      const resendApiKey = c.env?.RESEND_API_KEY;
      if (!resendApiKey) {
        return c.json({ error: "email_delivery_not_configured" }, 503);
      }

      const result = await sendDonorMailMerge(db, {
        orgId,
        actorId: userId,
        resendApiKey,
        ...data,
      });

      captureDonorEvent(c, ANALYTICS_EVENTS.communicationLogged, {
        entity_type: "communication",
        communication_type: "email",
        recipient_count: result.sent,
        skipped_count: result.skipped,
        failed_count: result.failed,
      });

      return c.json(result);
    },
  )
  .get(
    "/",
    requirePermission("donors", "view"),
    zValidator("query", contactListSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const params = c.req.valid("query");
      const result = await listContacts(db, { orgId, ...params });
      return c.json(result);
    },
  )
  .post(
    "/",
    requirePermission("donors", "edit"),
    zValidator("json", createContactSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const actorId = c.get("user")!.id;
      const data = c.req.valid("json");
      const contact = await createContact(db, { orgId, actorId, ...data });
      captureDonorEvent(c, ANALYTICS_EVENTS.contactCreated, {
        entity_type: "contact",
        contact_type: data.type,
      });
      const isFirstContact = await db
        .select({ value: count() })
        .from(contacts)
        .where(and(eq(contacts.orgId, orgId), isNull(contacts.deletedAt)))
        .then((rows) => rows[0]?.value === 1)
        .catch((error: unknown) => {
          captureBackgroundException(error, "donors", {
            step: "first_contact_count",
          });
          return false;
        });
      if (isFirstContact) {
        captureApiAnalyticsSafely(
          analyticsForContext(c).capture({
            orgId,
            eventName: ANALYTICS_EVENTS.firstContactCreated,
            payload: { actorId },
          }),
          { c, eventName: ANALYTICS_EVENTS.firstContactCreated },
        );
      }
      return c.json(contact, 201);
    },
  )
  .get("/:contactId", requirePermission("donors", "view"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const contactId = c.req.param("contactId");
    const fiscalYearStartMonth = await getOrgFiscalMonth(db, orgId);
    const result = await getContact(db, { orgId, contactId, fiscalYearStartMonth });
    return c.json(result);
  })
  .patch(
    "/:contactId",
    requirePermission("donors", "edit"),
    zValidator("json", updateContactSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const actorId = c.get("user")!.id;
      const contactId = c.req.param("contactId");
      const data = c.req.valid("json");
      const contact = await updateContact(db, { orgId, actorId, contactId, data });
      captureDonorEvent(c, ANALYTICS_EVENTS.contactUpdated, {
        entity_type: "contact",
        changed_fields: changedFields(data),
      });
      return c.json(contact);
    },
  )
  .delete("/:contactId", requirePermission("donors", "manage"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const actorId = c.get("user")!.id;
    const contactId = c.req.param("contactId");
    await deleteContact(db, { orgId, actorId, contactId });
    captureDonorEvent(c, ANALYTICS_EVENTS.contactDeleted, {
      entity_type: "contact",
    });
    return c.body(null, 204);
  })
  .patch(
    "/:contactId/stage",
    requirePermission("donors", "edit"),
    zValidator("json", updatePipelineStageSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const actorId = c.get("user")!.id;
      const contactId = c.req.param("contactId");
      const { stage } = c.req.valid("json");
      const contact = await updatePipelineStage(db, { orgId, actorId, contactId, stage });
      captureDonorEvent(c, ANALYTICS_EVENTS.donorStageChanged, {
        entity_type: "contact",
        stage,
      });
      return c.json(contact);
    },
  )

  // -------------------------------------------------------------------------
  // Donations (nested under contact)
  // -------------------------------------------------------------------------
  .get(
    "/:contactId/donations",
    requirePermission("donors", "view"),
    zValidator("query", paginationSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const contactId = c.req.param("contactId");
      const { page, pageSize } = c.req.valid("query");
      const result = await listDonations(db, { orgId, contactId, page, pageSize });
      return c.json(result);
    },
  )
  .post(
    "/:contactId/donations",
    requirePermission("donors", "edit"),
    zValidator("json", createDonationSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const actorId = c.get("user")!.id;
      const contactId = c.req.param("contactId");
      const data = c.req.valid("json");
      const donation = await createDonation(db, { orgId, actorId, contactId, ...data });
      captureDonorEvent(c, ANALYTICS_EVENTS.donationRecorded, {
        entity_type: "donation",
        donation_type: data.type,
        restriction: data.restriction,
      });
      return c.json(donation, 201);
    },
  )
  .patch(
    "/:contactId/donations/:donationId",
    requirePermission("donors", "edit"),
    zValidator("json", updateDonationSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const actorId = c.get("user")!.id;
      const contactId = c.req.param("contactId");
      const donationId = c.req.param("donationId");
      const data = c.req.valid("json");
      const donation = await updateDonation(db, { orgId, actorId, contactId, donationId, data });
      captureDonorEvent(c, ANALYTICS_EVENTS.donationUpdated, {
        entity_type: "donation",
        changed_fields: changedFields(data),
      });
      return c.json(donation);
    },
  )
  .delete("/:contactId/donations/:donationId", requirePermission("donors", "manage"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const actorId = c.get("user")!.id;
    const contactId = c.req.param("contactId");
    const donationId = c.req.param("donationId");
    await deleteDonation(db, { orgId, actorId, contactId, donationId });
    captureDonorEvent(c, ANALYTICS_EVENTS.donationDeleted, {
      entity_type: "donation",
    });
    return c.body(null, 204);
  })

  // -------------------------------------------------------------------------
  // Contact Tags
  // -------------------------------------------------------------------------
  .post(
    "/:contactId/tags",
    requirePermission("donors", "edit"),
    zValidator("json", addTagsSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const actorId = c.get("user")!.id;
      const { tagIds } = c.req.valid("json");
      const contactId = c.req.param("contactId");
      await addContactTags(db, { orgId, actorId, contactId, tagIds });
      return c.body(null, 204);
    },
  )
  .delete("/:contactId/tags/:tagId", requirePermission("donors", "manage"), async (c) => {
    const db = c.get("db");
    const orgId = c.get("orgId")!;
    const actorId = c.get("user")!.id;
    const contactId = c.req.param("contactId");
    const tagId = c.req.param("tagId");
    await removeContactTag(db, { orgId, actorId, contactId, tagId });
    return c.body(null, 204);
  })

  // -------------------------------------------------------------------------
  // Communications (nested under contact)
  // -------------------------------------------------------------------------
  .get(
    "/:contactId/communications",
    requirePermission("donors", "view"),
    zValidator("query", paginationSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const contactId = c.req.param("contactId");
      const { page, pageSize } = c.req.valid("query");
      const result = await listCommunications(db, { orgId, contactId, page, pageSize });
      return c.json(result);
    },
  )
  .post(
    "/:contactId/communications",
    requirePermission("donors", "edit"),
    zValidator("json", createCommunicationSchema),
    async (c) => {
      const db = c.get("db");
      const orgId = c.get("orgId")!;
      const contactId = c.req.param("contactId");
      const user = c.get("user")!;
      const userId = user.id;
      const data = c.req.valid("json");
      const entry = await createCommunication(db, {
        orgId,
        actorId: userId,
        contactId,
        loggedBy: userId,
        ...data,
      });
      captureDonorEvent(c, ANALYTICS_EVENTS.communicationLogged, {
        entity_type: "communication",
        communication_type: data.type,
      });
      return c.json(entry, 201);
    },
  );
