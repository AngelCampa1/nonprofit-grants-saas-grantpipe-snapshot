import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import type { SQLWrapper } from "drizzle-orm";
import {
  contacts,
  documents,
  donations,
  events,
  funders,
  funds,
  generatedReports,
  grantPaymentRequests,
  grants,
  organizations,
  subawards,
  subrecipientCorrectiveActions,
  subrecipientFindings,
  subrecipientMonitoringTasks,
  subrecipients,
  type Database,
} from "@grantpipe/db";
import type {
  ActivityEntityType,
  CreateDocumentInput,
  DocumentListParams,
  DocumentEntityType,
} from "@grantpipe/shared";
import { ACTIVITY_ENTITY_TYPES, DOCUMENT_ENTITY_TYPES } from "@grantpipe/shared";
import { forbidden, notFound } from "../../lib/app-error";
import { getIntegrations } from "../../lib/integrations";
import { recordActivityLog } from "../../lib/activity-log";
import { captureBackgroundException } from "../../lib/sentry";
import { documentParentEntityScope } from "./entityScope";

type DocumentEnv = {
  R2?: {
    put: (key: string, value: string | Uint8Array) => Promise<unknown>;
    get: (key: string) => Promise<{ body: BodyInit | null } | null>;
    delete?: (key: string) => Promise<unknown>;
  };
};

type CreateDocumentParams = CreateDocumentInput & {
  orgId: string;
  selectedEntityId: string;
  userId: string;
  body: Uint8Array;
};

async function entityExists(
  db: Pick<Database, "query" | "select">,
  params: {
    orgId: string;
    selectedEntityId: string;
    entityType: DocumentEntityType;
    entityId: string;
  },
) {
  const ownershipScope = documentParentEntityScope({
    orgId: params.orgId,
    selectedEntityId: params.selectedEntityId,
    entityType: params.entityType,
    entityId: params.entityId,
  });
  const defaultEntityScope = sql`EXISTS (
    SELECT 1 FROM ${organizations}
    WHERE ${organizations.id} = ${params.orgId}
      AND ${organizations.defaultEntityId} = ${params.selectedEntityId}
      AND ${organizations.deletedAt} IS NULL
  )`;
  const grantOwnershipScope = (grantId: SQLWrapper) => sql`EXISTS (
    SELECT 1 FROM ${grants}
    WHERE ${grants.id} = ${grantId}
      AND ${grants.orgId} = ${params.orgId}
      AND ${grants.entityId} = ${params.selectedEntityId}
      AND ${grants.deletedAt} IS NULL
  )`;
  const subawardOwnershipScope = (subawardId: SQLWrapper) => sql`EXISTS (
    SELECT 1 FROM ${subawards}
    WHERE ${subawards.id} = ${subawardId}
      AND ${subawards.orgId} = ${params.orgId}
      AND ${subawards.deletedAt} IS NULL
      AND ${grantOwnershipScope(subawards.grantId)}
  )`;

  const donationExists = async () => {
    // Core query builder, not the relational query API — the same
    // relational-API re-qualification hazard documented on entityExists'
    // JSDoc/module notes below applies here: ownershipScope embeds raw `sql`
    // fragments referencing funds/grants/organizations columns.
    const [donation] = await db
      .select({
        id: donations.id,
        orgId: donations.orgId,
        fundId: donations.fundId,
        grantId: donations.grantId,
      })
      .from(donations)
      .where(
        and(
          eq(donations.id, params.entityId),
          eq(donations.orgId, params.orgId),
          ownershipScope,
          isNull(donations.deletedAt),
        ),
      )
      .limit(1);
    if (!donation) return null;

    // These per-owner checks use ONLY same-table predicates (no sql``
    // fragments), so the relational API would compile them correctly — they
    // use the core builder anyway so this file keeps a single query style and
    // the source-contract guard can ban db.query.* for these tables outright.
    const ownershipChecks: Array<Promise<unknown>> = [];
    if (donation.fundId) {
      ownershipChecks.push(
        db
          .select({ id: funds.id })
          .from(funds)
          .where(
            and(
              eq(funds.id, donation.fundId),
              eq(funds.orgId, params.orgId),
              eq(funds.entityId, params.selectedEntityId),
              isNull(funds.deletedAt),
            ),
          )
          .limit(1)
          .then((rows) => rows[0]),
      );
    }
    if (donation.grantId) {
      ownershipChecks.push(
        db
          .select({ id: grants.id })
          .from(grants)
          .where(
            and(
              eq(grants.id, donation.grantId),
              eq(grants.orgId, params.orgId),
              eq(grants.entityId, params.selectedEntityId),
              isNull(grants.deletedAt),
            ),
          )
          .limit(1)
          .then((rows) => rows[0]),
      );
    }
    if (!donation.fundId && !donation.grantId) {
      ownershipChecks.push(
        db
          .select({ id: organizations.id })
          .from(organizations)
          .where(
            and(
              eq(organizations.id, params.orgId),
              eq(organizations.defaultEntityId, params.selectedEntityId),
              isNull(organizations.deletedAt),
            ),
          )
          .limit(1)
          .then((rows) => rows[0]),
      );
    }

    const owners = await Promise.all(ownershipChecks);
    return owners.every(Boolean) ? donation : null;
  };

  // EVERY switch branch below passes ownershipScope (documentParentEntityScope's
  // CASE, which interpolates Columns from contacts/donations/funds/grants/
  // organizations/subawards/subrecipient* tables) and several also pass
  // defaultEntityScope (raw EXISTS over organizations Columns). The relational
  // query API (db.query.<table>.findFirst) re-qualifies every bare Column in
  // its `where` with the base table's own alias, silently corrupting those
  // cross-table fragments (verified: organizations.defaultEntityId compiles as
  // "<base>"."default_entity_id" — a nonexistent column — and organizations.id
  // compiles as "<base>"."id", which EXISTS and mis-scopes). All branches
  // therefore use the core query builder, which compiles fragments verbatim.
  switch (params.entityType) {
    case "contact": {
      const [contact] = await db
        .select({ id: contacts.id, orgId: contacts.orgId })
        .from(contacts)
        .where(
          and(
            eq(contacts.id, params.entityId),
            eq(contacts.orgId, params.orgId),
            ownershipScope,
            defaultEntityScope,
            isNull(contacts.deletedAt),
          ),
        )
        .limit(1);
      return contact;
    }
    case "donation":
      return donationExists();
    case "grant": {
      const [grant] = await db
        .select({ id: grants.id, orgId: grants.orgId })
        .from(grants)
        .where(
          and(
            eq(grants.id, params.entityId),
            eq(grants.orgId, params.orgId),
            ownershipScope,
            eq(grants.entityId, params.selectedEntityId),
            isNull(grants.deletedAt),
          ),
        )
        .limit(1);
      return grant;
    }
    case "funder": {
      const [funder] = await db
        .select({ id: funders.id, orgId: funders.orgId })
        .from(funders)
        .where(
          and(
            eq(funders.id, params.entityId),
            eq(funders.orgId, params.orgId),
            ownershipScope,
            eq(funders.entityId, params.selectedEntityId),
            isNull(funders.deletedAt),
          ),
        )
        .limit(1);
      return funder;
    }
    case "fund": {
      const [fund] = await db
        .select({ id: funds.id, orgId: funds.orgId })
        .from(funds)
        .where(
          and(
            eq(funds.id, params.entityId),
            eq(funds.orgId, params.orgId),
            ownershipScope,
            eq(funds.entityId, params.selectedEntityId),
            isNull(funds.deletedAt),
          ),
        )
        .limit(1);
      return fund;
    }
    case "event": {
      // Core query builder — see the note above donationExists(). ownershipScope
      // and defaultEntityScope both embed raw `sql` fragments referencing
      // organizations (and, via ownershipScope, several other tables), so the
      // relational query API's re-qualification hazard applies here too.
      const [event] = await db
        .select({ id: events.id, orgId: events.orgId })
        .from(events)
        .where(
          and(
            eq(events.id, params.entityId),
            eq(events.orgId, params.orgId),
            ownershipScope,
            defaultEntityScope,
            isNull(events.deletedAt),
          ),
        )
        .limit(1);
      return event;
    }
    case "generated_report": {
      const [generatedReport] = await db
        .select({ id: generatedReports.id, orgId: generatedReports.orgId })
        .from(generatedReports)
        .where(
          and(
            eq(generatedReports.id, params.entityId),
            eq(generatedReports.orgId, params.orgId),
            ownershipScope,
            eq(generatedReports.entityId, params.selectedEntityId),
          ),
        )
        .limit(1);
      return generatedReport;
    }
    case "award_intake": {
      if (params.entityId !== params.orgId) return null;
      const [organization] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(
          and(
            eq(organizations.id, params.orgId),
            ownershipScope,
            eq(organizations.defaultEntityId, params.selectedEntityId),
            isNull(organizations.deletedAt),
          ),
        )
        .limit(1);
      return organization;
    }
    case "payment_request": {
      // Core query builder — see the note above donationExists().
      const [paymentRequest] = await db
        .select({ id: grantPaymentRequests.id, orgId: grantPaymentRequests.orgId })
        .from(grantPaymentRequests)
        .where(
          and(
            eq(grantPaymentRequests.id, params.entityId),
            eq(grantPaymentRequests.orgId, params.orgId),
            ownershipScope,
            grantOwnershipScope(grantPaymentRequests.grantId),
            isNull(grantPaymentRequests.deletedAt),
          ),
        )
        .limit(1);
      return paymentRequest;
    }
    case "subrecipient": {
      // Core query builder — see the note above donationExists().
      const [subrecipient] = await db
        .select({ id: subrecipients.id, orgId: subrecipients.orgId })
        .from(subrecipients)
        .where(
          and(
            eq(subrecipients.id, params.entityId),
            eq(subrecipients.orgId, params.orgId),
            ownershipScope,
            defaultEntityScope,
            isNull(subrecipients.deletedAt),
          ),
        )
        .limit(1);
      return subrecipient;
    }
    case "subaward": {
      // Core query builder — see the note above donationExists().
      const [subaward] = await db
        .select({ id: subawards.id, orgId: subawards.orgId })
        .from(subawards)
        .where(
          and(
            eq(subawards.id, params.entityId),
            eq(subawards.orgId, params.orgId),
            ownershipScope,
            grantOwnershipScope(subawards.grantId),
            isNull(subawards.deletedAt),
          ),
        )
        .limit(1);
      return subaward;
    }
    case "subrecipient_monitoring_task": {
      // Core query builder — see the note above donationExists().
      const [task] = await db
        .select({
          id: subrecipientMonitoringTasks.id,
          orgId: subrecipientMonitoringTasks.orgId,
        })
        .from(subrecipientMonitoringTasks)
        .where(
          and(
            eq(subrecipientMonitoringTasks.id, params.entityId),
            eq(subrecipientMonitoringTasks.orgId, params.orgId),
            ownershipScope,
            subawardOwnershipScope(subrecipientMonitoringTasks.subawardId),
            isNull(subrecipientMonitoringTasks.deletedAt),
          ),
        )
        .limit(1);
      return task;
    }
    case "subrecipient_finding": {
      // Core query builder — see the note above donationExists().
      const [finding] = await db
        .select({ id: subrecipientFindings.id, orgId: subrecipientFindings.orgId })
        .from(subrecipientFindings)
        .where(
          and(
            eq(subrecipientFindings.id, params.entityId),
            eq(subrecipientFindings.orgId, params.orgId),
            ownershipScope,
            subawardOwnershipScope(subrecipientFindings.subawardId),
            isNull(subrecipientFindings.deletedAt),
          ),
        )
        .limit(1);
      return finding;
    }
    case "subrecipient_corrective_action": {
      // Core query builder — see the note above donationExists().
      const [correctiveAction] = await db
        .select({
          id: subrecipientCorrectiveActions.id,
          orgId: subrecipientCorrectiveActions.orgId,
        })
        .from(subrecipientCorrectiveActions)
        .where(
          and(
            eq(subrecipientCorrectiveActions.id, params.entityId),
            eq(subrecipientCorrectiveActions.orgId, params.orgId),
            ownershipScope,
            sql`EXISTS (
              SELECT 1 FROM ${subrecipientFindings}
              WHERE ${subrecipientFindings.id} = ${subrecipientCorrectiveActions.findingId}
                AND ${subrecipientFindings.orgId} = ${params.orgId}
                AND ${subrecipientFindings.deletedAt} IS NULL
                AND ${subawardOwnershipScope(subrecipientFindings.subawardId)}
            )`,
            isNull(subrecipientCorrectiveActions.deletedAt),
          ),
        )
        .limit(1);
      return correctiveAction;
    }
  }
}

function sanitizeFileName(fileName: string) {
  // Strip path separators, quotes, and ALL C0 control characters (including the
  // null byte and tab). Control characters left in the name would otherwise be
  // written verbatim into the R2 object key — producing an opaque storage-side
  // 400 instead of a clean result — and would corrupt the Content-Disposition
  // header value on download.
  // eslint-disable-next-line no-control-regex -- intentional: collapse C0 control chars
  return fileName.replace(/[\\/"\x00-\x1f]/g, "-");
}

// Build an RFC 6266 Content-Disposition value that survives the Workers/undici
// Headers API. HTTP header values must be Latin-1 (ByteString); a filename with
// code points > 255 (CJK, emoji, etc.) would otherwise throw at Response
// construction and 500 the download. We emit an ASCII-only `filename=` fallback
// for legacy clients plus an RFC 5987 `filename*=UTF-8''` parameter that carries
// the true name for modern clients.
function contentDispositionHeader(fileName: string) {
  const sanitized = sanitizeFileName(fileName);
  const asciiFallback = sanitized.replace(/[^\x20-\x7e]/g, "_");
  const encoded = encodeURIComponent(sanitized).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export async function listDocuments(
  db: Database,
  params: {
    orgId: string;
    selectedEntityId: string;
    entityType: DocumentEntityType;
    entityId: string;
    allowedEntityTypes?: readonly DocumentEntityType[];
  } & DocumentListParams,
) {
  if (params.allowedEntityTypes && !params.allowedEntityTypes.includes(params.entityType)) {
    throw forbidden("Forbidden");
  }

  const entity = await entityExists(db, {
    orgId: params.orgId,
    selectedEntityId: params.selectedEntityId,
    entityType: params.entityType,
    entityId: params.entityId,
  });
  if (!entity) {
    throw notFound("Entity not found");
  }

  const offset = (params.page - 1) * params.pageSize;
  const rows = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.orgId, params.orgId),
        eq(documents.entityType, params.entityType),
        eq(documents.entityId, params.entityId),
        isNull(documents.deletedAt),
      ),
    )
    .orderBy(desc(documents.createdAt))
    .limit(params.pageSize)
    .offset(offset);

  const [totalRow] = await db
    .select({ count: count() })
    .from(documents)
    .where(
      and(
        eq(documents.orgId, params.orgId),
        eq(documents.entityType, params.entityType),
        eq(documents.entityId, params.entityId),
        isNull(documents.deletedAt),
      ),
    );

  return {
    data: rows,
    total: totalRow?.count ?? 0,
    page: params.page,
    pageSize: params.pageSize,
  };
}

export async function createDocument(db: Database, env: DocumentEnv, params: CreateDocumentParams) {
  const storage = getIntegrations(db, env as never).storage;

  const entity = await entityExists(db, params);
  if (!entity) {
    throw notFound("Entity not found");
  }

  const documentId = crypto.randomUUID();
  const safeName = sanitizeFileName(params.filename);
  const fileKey = `${params.orgId}/${params.entityType}/${params.entityId}/${documentId}-${safeName}`;
  await storage.put({
    key: fileKey,
    body: params.body,
    contentType: params.mimeType,
    fileName: params.filename,
    source: {
      orgId: params.orgId,
      entityType: params.entityType,
      entityId: params.entityId,
    },
  });

  try {
    return await db.transaction(async (tx) => {
      const [insertedRow] = await tx
        .insert(documents)
        .values({
          id: documentId,
          orgId: params.orgId,
          fileKey,
          filename: params.filename,
          mimeType: params.mimeType,
          sizeBytes: params.sizeBytes,
          entityType: params.entityType,
          entityId: params.entityId,
          uploadedBy: params.userId,
        })
        .returning();

      if (!insertedRow) {
        throw new Error("Failed to create document");
      }

      // Log against the PARENT entity so auditors viewing a grant/contact/fund
      // see document churn in their activity feed.
      // "award_intake" is not tracked in the activity log (org-level entity),
      // so we only log for entity types that are valid ActivityEntityType values.
      const activityEntityTypes: ReadonlyArray<string> = ACTIVITY_ENTITY_TYPES;
      if (activityEntityTypes.includes(params.entityType)) {
        await recordActivityLog(tx, {
          orgId: params.orgId,
          activeEntityId: params.selectedEntityId,
          actorId: params.userId,
          action: "document_added",
          entityType: params.entityType as ActivityEntityType,
          entityId: params.entityId,
          changes: {
            documentId: insertedRow.id,
            filename: insertedRow.filename,
            sizeBytes: insertedRow.sizeBytes,
          },
        });
      }

      return insertedRow;
    });
  } catch (error) {
    try {
      await storage.delete?.(fileKey);
    } catch (cleanupError) {
      captureBackgroundException(cleanupError, "documents", {
        step: "upload_cleanup",
        entity_type: params.entityType,
      });
    }
    throw error;
  }
}

export async function downloadDocument(
  db: Database,
  env: DocumentEnv,
  params: {
    orgId: string;
    selectedEntityId: string;
    documentId: string;
    allowedEntityTypes?: readonly DocumentEntityType[];
  },
) {
  const storage = getIntegrations(db, env as never).storage;

  const row = await db.query.documents.findFirst({
    where: and(
      eq(documents.id, params.documentId),
      eq(documents.orgId, params.orgId),
      isNull(documents.deletedAt),
    ),
  });

  if (!row) {
    throw notFound("Document not found");
  }

  if (
    params.allowedEntityTypes &&
    !params.allowedEntityTypes.includes(row.entityType as DocumentEntityType)
  ) {
    throw forbidden("Forbidden");
  }

  if (!DOCUMENT_ENTITY_TYPES.includes(row.entityType as DocumentEntityType)) {
    throw notFound("Entity not found");
  }

  const entity = await entityExists(db, {
    orgId: params.orgId,
    selectedEntityId: params.selectedEntityId,
    entityType: row.entityType as DocumentEntityType,
    entityId: row.entityId,
  });
  if (!entity) {
    throw notFound("Entity not found");
  }

  const object = await storage.get(row.fileKey);
  if (!object) {
    throw new Error("Document file not found");
  }

  return new Response(object.body as BodyInit, {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Disposition": contentDispositionHeader(row.filename),
      "X-GrantPipe-Document-Entity-Type": row.entityType,
      "X-GrantPipe-Document-Size-Bucket": getDocumentSizeBucket(row.sizeBytes ?? null),
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Cache-Control": "private, no-store",
    },
  });
}
export async function softDeleteDocument(
  db: Database,
  _env: DocumentEnv,
  params: { orgId: string; selectedEntityId: string; documentId: string; actorId: string },
) {
  return db.transaction(async (tx) => {
    const activeDocument = await tx.query.documents.findFirst({
      where: and(
        eq(documents.id, params.documentId),
        eq(documents.orgId, params.orgId),
        isNull(documents.deletedAt),
      ),
    });
    if (!activeDocument) {
      throw notFound("Document not found");
    }
    if (!DOCUMENT_ENTITY_TYPES.includes(activeDocument.entityType as DocumentEntityType)) {
      throw notFound("Entity not found");
    }
    const entity = await entityExists(tx, {
      orgId: params.orgId,
      selectedEntityId: params.selectedEntityId,
      entityType: activeDocument.entityType as DocumentEntityType,
      entityId: activeDocument.entityId,
    });
    if (!entity) {
      throw notFound("Entity not found");
    }

    const [row] = await tx
      .update(documents)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(documents.id, params.documentId),
          eq(documents.orgId, params.orgId),
          isNull(documents.deletedAt),
        ),
      )
      .returning();

    if (!row) {
      throw new Error("Document not found");
    }

    // Log against the PARENT entity so auditors viewing a grant/contact/fund
    // see document churn in their activity feed.
    // Only log for entity types tracked in the activity log (award_intake is not).
    const activityEntityTypes: ReadonlyArray<string> = ACTIVITY_ENTITY_TYPES;
    if (activityEntityTypes.includes(row.entityType)) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        activeEntityId: params.selectedEntityId,
        actorId: params.actorId,
        action: "document_removed",
        entityType: row.entityType as ActivityEntityType,
        entityId: row.entityId,
        changes: {
          documentId: row.id,
          filename: row.filename,
          sizeBytes: row.sizeBytes ?? null,
        },
      });
    }

    return row;
  });
}

function getDocumentSizeBucket(sizeBytes: number | null | undefined): string {
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "unknown";
  }
  if (sizeBytes < 10 * 1024) return "under_10kb";
  if (sizeBytes < 100 * 1024) return "10kb_100kb";
  if (sizeBytes < 1024 * 1024) return "100kb_1mb";
  if (sizeBytes < 10 * 1024 * 1024) return "1mb_10mb";
  return "over_10mb";
}
