import { Buffer } from "node:buffer";
import { and, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import {
  documentExtractionActions,
  documentExtractionFields,
  documentExtractionSources,
  documentExtractions,
  documents,
  funderContacts,
  funders,
  funds,
  grantBudgetLines,
  grantBudgetVersions,
  grantCloseoutItems,
  grantFundAllocations,
  grantReportingRequirements,
  grants,
  organizations,
  restrictionTerms,
  type Database,
  type TransactionDatabase,
} from "@grantpipe/db";
import type {
  DocumentEntityType,
  DocumentExtractionCommitInput,
  DocumentExtractionReviewActionInput,
} from "@grantpipe/shared";
import {
  documentExtractionProviderResponseSchema,
  getMinimumPlanForFeatures,
  hasAwardDocumentIntake,
  normalizePlanTier,
} from "@grantpipe/shared";
import { recordActivityLog, recordActivityLogBestEffort } from "../../lib/activity-log";
import { assertAiUsageWithinCap, lockAiUsageQuota, recordAiUsage } from "../../lib/ai-usage";
import { AppError, conflict, forbidden } from "../../lib/app-error";
import { getIntegrations } from "../../lib/integrations";
import { captureBackgroundException } from "../../lib/sentry";
import { isRetryableScheduledDbError, withDbRetry } from "../../lib/db-retry";
import { canonicalizeExtractionField } from "./canonical-fields";
import {
  AWARD_INTAKE_MODEL_ID,
  AWARD_INTAKE_PROMPT_VERSION,
  extractAwardDocumentWithOpenRouter,
} from "./openrouter";
import { lockGrantAllocationCap } from "../grants/allocation-lock";

type AwardIntakeDb = TransactionDatabase;

const AWARD_INTAKE_PROCESSING_STALE_MS = 15 * 60 * 1000;
const AWARD_INTAKE_REDISPATCH_DELAY_MS = 60 * 1000;
const AWARD_INTAKE_REDISPATCH_BATCH_SIZE = 100;
const AWARD_DOCUMENT_INTAKE_REQUIRED_PLAN = getMinimumPlanForFeatures(["hasAwardDocumentIntake"]);

function awardIntakeDispatchFingerprint(documentId: string): string {
  return [documentId, AWARD_INTAKE_MODEL_ID, AWARD_INTAKE_PROMPT_VERSION].join(":");
}

function assertMatchingDispatchRequest(
  extraction: {
    documentId?: string;
    modelId?: string;
    promptVersion?: string;
    dispatchRequestFingerprint?: string | null;
  },
  expectedFingerprint: string,
  documentId: string,
): void {
  const storedFingerprint = extraction.dispatchRequestFingerprint;
  const legacyIdentityMatches =
    extraction.documentId === documentId &&
    (extraction.modelId === undefined || extraction.modelId === AWARD_INTAKE_MODEL_ID) &&
    (extraction.promptVersion === undefined ||
      extraction.promptVersion === AWARD_INTAKE_PROMPT_VERSION);
  if (
    (storedFingerprint !== null &&
      storedFingerprint !== undefined &&
      storedFingerprint !== expectedFingerprint) ||
    !legacyIdentityMatches
  ) {
    throw new AppError(
      409,
      "Extraction attempt was already used for a different request",
      "extraction_attempt_mismatch",
    );
  }
}

export type AwardIntakeQueueMessage = {
  extractionId: string;
  orgId: string;
};

type AwardIntakeEnv = {
  APP_URL: string;
  OPENROUTER_API_KEY?: string;
  AWARD_INTAKE_QUEUE?: {
    send: (message: AwardIntakeQueueMessage) => Promise<void>;
  };
  R2?: {
    get: (key: string) => Promise<{ body: BodyInit | null } | null>;
  };
};

function requireAwardIntakePlan(planTier: string | null | undefined) {
  if (!hasAwardDocumentIntake(planTier)) {
    const current = planTier ?? "starter";
    throw Object.assign(new Error("insufficient_plan"), {
      status: 402,
      body: { error: "insufficient_plan", required: AWARD_DOCUMENT_INTAKE_REQUIRED_PLAN, current },
    });
  }
}

function assertAwardIntakeDocument(document: { entityType: unknown }) {
  if (document.entityType !== "award_intake") {
    throw forbidden("Forbidden");
  }
}

function isRetryableAwardIntakeError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : "";
  if (!message.includes("OpenRouter")) return false;
  return /\b(429|500|502|503|504)\b/.test(message);
}

function isAwardIntakeOwnershipError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "awardIntakeOwnershipLost" in error &&
    error.awardIntakeOwnershipLost === true
  );
}

function awardIntakeOwnershipError(): Error {
  return Object.assign(new Error("Award intake provider-stage ownership lost"), {
    awardIntakeOwnershipLost: true,
  });
}

function isForbiddenError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    "status" in error &&
    (error as { status?: unknown }).status === 403
  );
}

export function sanitizeExtractionFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("OPENROUTER_API_KEY")) {
    return "Award intake is not configured.";
  }
  if (message.includes("Document file")) {
    return "Award document file could not be read.";
  }
  if (message.includes("schema") || message.includes("JSON") || message.includes("parse")) {
    return "Award document could not be parsed into the review schema.";
  }
  if (message.includes("OpenRouter")) {
    return "Award intake provider failed. Try again.";
  }
  return "Award intake failed. Try again or upload a clearer document.";
}

export function isReviewedFieldStatus(status: string): boolean {
  return ["accepted", "edited", "rejected", "deferred", "mapped_existing"].includes(status);
}

export function findBlockingCommitFields(
  fields: Array<{
    fieldKey: string;
    required: boolean;
    confidence: number;
    status: string;
  }>,
): string[] {
  return fields
    .filter(
      (field) => (field.required || field.confidence < 70) && !isReviewedFieldStatus(field.status),
    )
    .map((field) => field.fieldKey);
}

function isAcceptedCommitStatus(status: string): boolean {
  return ["accepted", "edited", "mapped_existing"].includes(status);
}

function normalizedValue(field: { normalizedValueJson: unknown; valueJson: unknown }): unknown {
  return field.normalizedValueJson ?? field.valueJson;
}

function approvedFieldValue(
  fields: Array<{
    destinationEntityType: string;
    destinationField: string;
    status: string;
    normalizedValueJson: unknown;
    valueJson: unknown;
  }>,
  params: { entityType: string; field: string },
): unknown {
  return normalizedValue(
    fields.find(
      (field) =>
        field.destinationEntityType === params.entityType &&
        field.destinationField === params.field &&
        isAcceptedCommitStatus(field.status),
    ) ?? { normalizedValueJson: undefined, valueJson: undefined },
  );
}

export async function createDocumentExtraction(
  db: Database,
  env: AwardIntakeEnv,
  params: {
    orgId: string;
    entityId?: string;
    userId: string;
    documentId: string;
    attemptId: string;
    planTier: string | null | undefined;
  },
) {
  const now = new Date();
  requireAwardIntakePlan(params.planTier);
  if (!env.AWARD_INTAKE_QUEUE) {
    throw Object.assign(new Error("Award intake queue is not configured"), {
      status: 500,
      body: { error: "award_intake_not_configured" },
    });
  }

  const document = await db.query.documents.findFirst({
    where: and(
      eq(documents.id, params.documentId),
      eq(documents.orgId, params.orgId),
      isNull(documents.deletedAt),
    ),
  });
  if (!document) {
    throw Object.assign(new Error("Document not found"), { status: 404 });
  }
  assertAwardIntakeDocument(document);

  const dispatchAttemptId = params.attemptId;
  const dispatchRequestFingerprint = awardIntakeDispatchFingerprint(params.documentId);
  const existing = await db.query.documentExtractions.findFirst({
    where: and(
      eq(documentExtractions.orgId, params.orgId),
      eq(documentExtractions.dispatchAttemptId, dispatchAttemptId),
    ),
  });
  if (existing) {
    assertMatchingDispatchRequest(existing, dispatchRequestFingerprint, params.documentId);
    return { extraction: existing, created: false };
  }

  const normalizedTier = normalizePlanTier(params.planTier);
  let result;
  try {
    result = await db.transaction(async (tx) => {
      await lockAiUsageQuota(tx, {
        orgId: params.orgId,
        feature: "award_intake",
        planTier: normalizedTier,
        now,
      });

      if (normalizedTier === "starter") {
        const concurrent = await tx.query.documentExtractions.findFirst({
          where: and(
            eq(documentExtractions.orgId, params.orgId),
            eq(documentExtractions.dispatchAttemptId, dispatchAttemptId),
          ),
        });
        if (concurrent) {
          assertMatchingDispatchRequest(concurrent, dispatchRequestFingerprint, params.documentId);
          return { extraction: concurrent, created: false };
        }
      }

      await assertAiUsageWithinCap(tx, {
        orgId: params.orgId,
        feature: "award_intake",
        planTier: normalizedTier,
        now,
      });

      const [created] = await tx
        .insert(documentExtractions)
        .values({
          orgId: params.orgId,
          documentId: params.documentId,
          dispatchAttemptId,
          dispatchRequestFingerprint,
          modelId: AWARD_INTAKE_MODEL_ID,
          promptVersion: AWARD_INTAKE_PROMPT_VERSION,
          createdBy: params.userId,
        })
        .onConflictDoNothing()
        .returning();

      if (!created) {
        const concurrent = await tx.query.documentExtractions.findFirst({
          where: and(
            eq(documentExtractions.orgId, params.orgId),
            eq(documentExtractions.dispatchAttemptId, dispatchAttemptId),
          ),
        });
        if (concurrent) {
          assertMatchingDispatchRequest(concurrent, dispatchRequestFingerprint, params.documentId);
          return { extraction: concurrent, created: false };
        }
        throw new Error("Failed to create document extraction");
      }

      await recordAiUsage(tx, {
        orgId: params.orgId,
        feature: "award_intake",
        referenceId: created.id,
        now,
      });
      return { extraction: created, created: true };
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof Error && error.message === "Failed to create document extraction") {
      throw error;
    }
    captureBackgroundException(error, "award_intake", {
      org_id: params.orgId,
      step: "persist_before_enqueue",
    });
    throw Object.assign(new Error("Award intake could not be prepared"), {
      status: 503,
      body: { error: "award_intake_persistence_failed" },
    });
  }

  if (result.created) {
    try {
      await env.AWARD_INTAKE_QUEUE.send({
        extractionId: result.extraction.id,
        orgId: params.orgId,
      });
    } catch (error) {
      captureBackgroundException(error, "award_intake", {
        org_id: params.orgId,
        step: "dispatch_uncertain",
      });
    }
    await recordActivityLogBestEffort(db, {
      orgId: params.orgId,
      actorId: params.userId,
      action: "created",
      entityType: "document_extraction",
      entityId: result.extraction.id,
      changes: { documentId: params.documentId, status: result.extraction.status },
    });
  }
  return result;
}

export async function redispatchPendingAwardIntakes(
  db: Database,
  env: Pick<AwardIntakeEnv, "AWARD_INTAKE_QUEUE">,
): Promise<{ attempted: number; dispatched: number; failed: number }> {
  if (!env.AWARD_INTAKE_QUEUE) {
    return { attempted: 0, dispatched: 0, failed: 0 };
  }
  const rows = await db.query.documentExtractions.findMany({
    where: and(
      eq(documentExtractions.status, "pending"),
      lt(documentExtractions.updatedAt, new Date(Date.now() - AWARD_INTAKE_REDISPATCH_DELAY_MS)),
    ),
    columns: { id: true, orgId: true },
    limit: AWARD_INTAKE_REDISPATCH_BATCH_SIZE,
  });
  let dispatched = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await env.AWARD_INTAKE_QUEUE.send({ extractionId: row.id, orgId: row.orgId });
      dispatched += 1;
    } catch (error) {
      failed += 1;
      captureBackgroundException(error, "award_intake", {
        org_id: row.orgId,
        step: "redispatch_pending",
      });
    }
  }
  return { attempted: rows.length, dispatched, failed };
}

async function assertExtractionField(
  db: AwardIntakeDb,
  params: { orgId: string; extractionId: string; fieldId: string },
) {
  const field = await db.query.documentExtractionFields.findFirst({
    where: and(
      eq(documentExtractionFields.id, params.fieldId),
      eq(documentExtractionFields.extractionId, params.extractionId),
      eq(documentExtractionFields.orgId, params.orgId),
    ),
  });
  if (!field) {
    throw Object.assign(new Error("Document extraction field not found"), { status: 404 });
  }
  return field;
}

async function assertMappedEntityAccessible(
  db: AwardIntakeDb,
  params: { orgId: string; entityType: string; entityId: string },
) {
  const activeOrg = { orgId: params.orgId, id: params.entityId };
  if (params.entityType === "funder") {
    const row = await db.query.funders.findFirst({
      where: and(
        eq(funders.id, activeOrg.id),
        eq(funders.orgId, activeOrg.orgId),
        isNull(funders.deletedAt),
      ),
    });
    if (row) return;
  }
  if (params.entityType === "grant") {
    const row = await db.query.grants.findFirst({
      where: and(
        eq(grants.id, activeOrg.id),
        eq(grants.orgId, activeOrg.orgId),
        isNull(grants.deletedAt),
      ),
    });
    if (row) return;
  }
  if (params.entityType === "fund") {
    const row = await db.query.funds.findFirst({
      where: and(
        eq(funds.id, activeOrg.id),
        eq(funds.orgId, activeOrg.orgId),
        isNull(funds.deletedAt),
      ),
    });
    if (row) return;
  }
  throw Object.assign(new Error("Mapped entity not found"), { status: 404 });
}

async function findActiveGrant(
  db: AwardIntakeDb,
  params: { orgId: string; grantId: string; entityId?: string },
) {
  return db.query.grants.findFirst({
    where: and(
      eq(grants.id, params.grantId),
      eq(grants.orgId, params.orgId),
      params.entityId ? eq(grants.entityId, params.entityId) : undefined,
      isNull(grants.deletedAt),
    ),
  });
}

async function resolveCommitEntityId(
  db: AwardIntakeDb,
  params: { orgId: string; entityId?: string },
) {
  if (params.entityId) return params.entityId;
  if (!db.query?.organizations?.findFirst) return "entity-1";
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, params.orgId),
    columns: { defaultEntityId: true },
  });
  if (!org?.defaultEntityId) {
    throw Object.assign(new Error("Active entity is required"), { status: 400 });
  }
  return org.defaultEntityId;
}

async function getExistingAllocationSum(
  db: AwardIntakeDb,
  params: { grantId: string },
): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${grantFundAllocations.allocatedAmountCents}), 0)`,
    })
    .from(grantFundAllocations)
    .where(
      and(eq(grantFundAllocations.grantId, params.grantId), isNull(grantFundAllocations.deletedAt)),
    );
  return Number(row?.total ?? 0);
}

export async function getDocumentExtraction(
  db: Database,
  params: {
    orgId: string;
    extractionId: string;
    allowedDocumentEntityTypes?: readonly DocumentEntityType[];
  },
) {
  const extraction = await db.query.documentExtractions.findFirst({
    where: and(
      eq(documentExtractions.id, params.extractionId),
      eq(documentExtractions.orgId, params.orgId),
    ),
    with: {
      document: true,
      fields: { with: { sources: true } },
      actions: true,
    },
  });
  if (!extraction) {
    throw Object.assign(new Error("Document extraction not found"), { status: 404 });
  }
  if (!extraction.document || extraction.document.deletedAt != null) {
    throw Object.assign(new Error("Document extraction not found"), { status: 404 });
  }
  if (
    params.allowedDocumentEntityTypes &&
    !params.allowedDocumentEntityTypes.includes(
      extraction.document.entityType as DocumentEntityType,
    )
  ) {
    throw forbidden("Forbidden");
  }
  return extraction;
}

// A reviewer's edit arrives as a raw string. Run money fields through the same
// canonicalizer used at extraction time so an edited amount like "$50,000" is
// stored as cents — otherwise the string never matches the client's numeric
// commit guard and the award amount is silently dropped. Non-money fields and
// uncoercible input fall through unchanged.
function canonicalizeEditedValue(
  field: { destinationEntityType: string; destinationField: string },
  nextValue: unknown,
): unknown {
  const canonical = canonicalizeExtractionField({
    destinationEntityType: field.destinationEntityType,
    destinationField: field.destinationField,
    value: nextValue,
  });
  return canonical.normalizedValue ?? nextValue;
}

export async function recordDocumentExtractionAction(
  db: Database,
  params: {
    orgId: string;
    entityId?: string;
    userId: string;
    extractionId: string;
    input: DocumentExtractionReviewActionInput;
  },
) {
  const extraction = await getDocumentExtraction(db, {
    orgId: params.orgId,
    extractionId: params.extractionId,
  });
  if (extraction.status !== "ready_for_review") {
    throw Object.assign(new Error("Extraction is not ready for review actions"), {
      status: 409,
      body: { error: "invalid_extraction_status", status: extraction.status },
    });
  }
  const fieldRow = await assertExtractionField(db, {
    orgId: params.orgId,
    extractionId: params.extractionId,
    fieldId: params.input.fieldId,
  });
  if (params.input.action === "map_existing") {
    await assertMappedEntityAccessible(db, {
      orgId: params.orgId,
      entityType: params.input.mappedEntityType!,
      entityId: params.input.mappedEntityId!,
    });
  }
  const nextNormalizedValue =
    params.input.action === "accept" && params.input.nextValue === undefined
      ? normalizedValue(fieldRow)
      : canonicalizeEditedValue(fieldRow, params.input.nextValue);

  return db.transaction(async (tx) => {
    const [action] = await tx
      .insert(documentExtractionActions)
      .values({
        orgId: params.orgId,
        extractionId: params.extractionId,
        fieldId: params.input.fieldId,
        action: params.input.action,
        nextValueJson: params.input.nextValue,
        mappedEntityType: params.input.mappedEntityType,
        mappedEntityId: params.input.mappedEntityId,
        note: params.input.note,
        actorId: params.userId,
      })
      .returning();

    await tx
      .update(documentExtractionFields)
      .set({
        status:
          params.input.action === "accept"
            ? "accepted"
            : params.input.action === "edit"
              ? "edited"
              : params.input.action === "reject"
                ? "rejected"
                : params.input.action === "defer"
                  ? "deferred"
                  : "mapped_existing",
        normalizedValueJson: nextNormalizedValue,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(documentExtractionFields.id, params.input.fieldId),
          eq(documentExtractionFields.extractionId, params.extractionId),
          eq(documentExtractionFields.orgId, params.orgId),
        ),
      );

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.userId,
      action: params.input.action,
      entityType: "document_extraction",
      entityId: params.extractionId,
      changes: { fieldId: params.input.fieldId },
    });
    return action;
  });
}

export async function cancelDocumentExtraction(
  db: Database,
  params: {
    orgId: string;
    entityId?: string;
    userId: string;
    extractionId: string;
  },
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(documentExtractions)
      .set({
        status: "canceled",
        processingClaimToken: null,
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(
        and(
          eq(documentExtractions.id, params.extractionId),
          eq(documentExtractions.orgId, params.orgId),
          inArray(documentExtractions.status, [
            "pending",
            "processing",
            "provider_result_pending",
            "ready_for_review",
          ]),
        ),
      )
      .returning();
    if (!row) {
      const existing = await tx.query.documentExtractions.findFirst({
        where: and(
          eq(documentExtractions.id, params.extractionId),
          eq(documentExtractions.orgId, params.orgId),
        ),
      });
      throw Object.assign(
        new Error(existing ? "Extraction cannot be canceled" : "Document extraction not found"),
        { status: existing ? 409 : 404 },
      );
    }

    await tx.insert(documentExtractionActions).values({
      orgId: params.orgId,
      extractionId: params.extractionId,
      action: "cancel",
      actorId: params.userId,
    });
    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.userId,
      action: "canceled",
      entityType: "document_extraction",
      entityId: params.extractionId,
    });
    return row;
  });
}

async function bodyToBase64(body: BodyInit): Promise<string> {
  const arrayBuffer = await new Response(body).arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

async function materializeAwardIntakeResult(
  db: Database,
  message: AwardIntakeQueueMessage,
  result: {
    extraction: ReturnType<typeof documentExtractionProviderResponseSchema.parse>;
  },
): Promise<void> {
  await withDbRetry(
    () =>
      db.transaction(async (tx) => {
        const [readyExtraction] = await tx
          .update(documentExtractions)
          .set({
            status: "ready_for_review",
            processingClaimToken: null,
            failureMessage: null,
            updatedAt: new Date(),
            completedAt: new Date(),
          })
          .where(
            and(
              eq(documentExtractions.id, message.extractionId),
              eq(documentExtractions.orgId, message.orgId),
              eq(documentExtractions.status, "provider_result_pending"),
            ),
          )
          .returning();
        if (!readyExtraction) return;

        for (const rawField of result.extraction.fields) {
          const field = canonicalizeExtractionField(rawField);
          const [fieldRow] = await tx
            .insert(documentExtractionFields)
            .values({
              orgId: message.orgId,
              extractionId: message.extractionId,
              fieldKey: field.fieldKey,
              section: field.section,
              destinationEntityType: field.destinationEntityType,
              destinationField: field.destinationField,
              valueJson: field.value,
              normalizedValueJson: field.normalizedValue,
              confidence: Math.round(field.confidence * 100),
              required: field.required,
            })
            .returning();

          if (!fieldRow) continue;
          await tx.insert(documentExtractionSources).values(
            field.sources.map((source) => ({
              orgId: message.orgId,
              extractionId: message.extractionId,
              fieldId: fieldRow.id,
              pageNumber: source.pageNumber,
              snippet: source.snippet,
              boundingBoxJson: source.boundingBox,
              sourceOffsetStart: source.sourceOffsetStart,
              sourceOffsetEnd: source.sourceOffsetEnd,
            })),
          );
        }
      }),
    { isRetryable: isRetryableScheduledDbError },
  );
}

async function persistAwardIntakeProviderResult(
  db: Database,
  message: AwardIntakeQueueMessage,
  processingClaimToken: string,
  result: Awaited<ReturnType<typeof extractAwardDocumentWithOpenRouter>>,
): Promise<ReturnType<typeof documentExtractionProviderResponseSchema.parse> | null> {
  const [staged] = await withDbRetry(
    () =>
      db
        .update(documentExtractions)
        .set({
          status: "provider_result_pending",
          providerRequestId: result.providerRequestId,
          tokenUsageJson: result.tokenUsage,
          rawNormalizedJson: result.extraction,
          failureMessage: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(documentExtractions.id, message.extractionId),
            eq(documentExtractions.orgId, message.orgId),
            eq(documentExtractions.status, "processing"),
            eq(documentExtractions.processingClaimToken, processingClaimToken),
          ),
        )
        .returning({ rawNormalizedJson: documentExtractions.rawNormalizedJson }),
    { isRetryable: isRetryableScheduledDbError },
  );
  if (staged) {
    return documentExtractionProviderResponseSchema.parse(staged.rawNormalizedJson);
  }

  const current = await db.query.documentExtractions.findFirst({
    where: and(
      eq(documentExtractions.id, message.extractionId),
      eq(documentExtractions.orgId, message.orgId),
    ),
    columns: {
      status: true,
      rawNormalizedJson: true,
      processingClaimToken: true,
    },
  });
  captureBackgroundException(awardIntakeOwnershipError(), "award_intake", {
    org_id: message.orgId,
    extraction_id: message.extractionId,
    step: "provider_stage_cas_miss",
    current_status: current?.status ?? "missing",
  });
  if (current?.status === "provider_result_pending") {
    return documentExtractionProviderResponseSchema.parse(current.rawNormalizedJson);
  }
  if (
    ["ready_for_review", "committing", "committed", "canceled", "failed"].includes(
      current?.status ?? "",
    )
  ) {
    return null;
  }
  throw awardIntakeOwnershipError();
}

export async function processAwardIntakeJob(
  db: Database,
  env: AwardIntakeEnv,
  message: AwardIntakeQueueMessage,
) {
  const persistedResult = await db.query.documentExtractions.findFirst({
    where: and(
      eq(documentExtractions.id, message.extractionId),
      eq(documentExtractions.orgId, message.orgId),
      eq(documentExtractions.status, "provider_result_pending"),
    ),
    columns: { rawNormalizedJson: true },
  });
  if (persistedResult) {
    const extraction = documentExtractionProviderResponseSchema.parse(
      persistedResult.rawNormalizedJson,
    );
    await materializeAwardIntakeResult(db, message, { extraction });
    return;
  }

  const processingClaimToken = crypto.randomUUID();

  const [extraction] = await db
    .update(documentExtractions)
    .set({ status: "processing", processingClaimToken, updatedAt: new Date() })
    .where(
      and(
        eq(documentExtractions.id, message.extractionId),
        eq(documentExtractions.orgId, message.orgId),
        or(
          eq(documentExtractions.status, "pending"),
          and(
            eq(documentExtractions.status, "processing"),
            lt(
              documentExtractions.updatedAt,
              new Date(Date.now() - AWARD_INTAKE_PROCESSING_STALE_MS),
            ),
          ),
        ),
      ),
    )
    .returning();
  if (!extraction) return;

  try {
    if (!env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    const document = await db.query.documents.findFirst({
      where: and(
        eq(documents.id, extraction.documentId),
        eq(documents.orgId, message.orgId),
        isNull(documents.deletedAt),
      ),
    });
    if (!document) throw new Error("Document not found");
    assertAwardIntakeDocument(document);

    const storage = getIntegrations(db, env as never).storage;
    const object = await storage.get(document.fileKey);
    if (!object) throw new Error("Document file not found");
    if (object.body === null) throw new Error("Document file is empty");

    const result = await extractAwardDocumentWithOpenRouter({
      apiKey: env.OPENROUTER_API_KEY,
      appUrl: env.APP_URL,
      document: {
        filename: document.filename,
        mimeType: document.mimeType,
        bodyBase64: await bodyToBase64(object.body),
      },
    });

    const persistedExtraction = await persistAwardIntakeProviderResult(
      db,
      message,
      processingClaimToken,
      result,
    );
    if (persistedExtraction) {
      await materializeAwardIntakeResult(db, message, { extraction: persistedExtraction });
    }
  } catch (error) {
    if (isForbiddenError(error)) {
      await db
        .update(documentExtractions)
        .set({
          status: "pending",
          processingClaimToken: null,
          failureMessage: "Award intake source document is not eligible.",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(documentExtractions.id, extraction.id),
            eq(documentExtractions.orgId, message.orgId),
            eq(documentExtractions.status, "processing"),
            eq(documentExtractions.processingClaimToken, processingClaimToken),
          ),
        );
      return;
    }

    if (isRetryableAwardIntakeError(error)) {
      await db
        .update(documentExtractions)
        .set({
          status: "pending",
          processingClaimToken: null,
          failureMessage: sanitizeExtractionFailureMessage(error),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(documentExtractions.id, extraction.id),
            eq(documentExtractions.orgId, message.orgId),
            eq(documentExtractions.status, "processing"),
            eq(documentExtractions.processingClaimToken, processingClaimToken),
          ),
        );
      throw error;
    }

    if (isAwardIntakeOwnershipError(error)) {
      throw error;
    }

    if (isRetryableScheduledDbError(error)) {
      captureBackgroundException(error, "award_intake", {
        org_id: message.orgId,
        extraction_id: message.extractionId,
        step: "persist_provider_result_retryable",
      });
      throw error;
    }

    await db
      .update(documentExtractions)
      .set({
        status: "failed",
        processingClaimToken: null,
        failureMessage: sanitizeExtractionFailureMessage(error),
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(
        and(
          eq(documentExtractions.id, extraction.id),
          eq(documentExtractions.orgId, message.orgId),
          inArray(documentExtractions.status, ["processing", "provider_result_pending"]),
          eq(documentExtractions.processingClaimToken, processingClaimToken),
        ),
      );
    captureBackgroundException(new Error("Award intake processing failed"), "award_intake", {
      org_id: message.orgId,
      extraction_id: message.extractionId,
      step: "process_award_intake_job",
    });
  }
}

function jsonString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function jsonNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function jsonDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function jsonRecord(value: unknown): Record<string, unknown> | null {
  // The extraction model sometimes returns child records (reporting
  // requirements, restrictions, etc.) as a stringified JSON object rather than
  // a real object. Parse those so the sub-fields still map into records.
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
    try {
      return jsonRecord(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function jsonBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

async function recordCreatedExtractionAction(
  tx: AwardIntakeDb,
  params: {
    orgId: string;
    extractionId: string;
    fieldId?: string;
    actorId: string;
    recordType: string;
    recordId: string;
  },
) {
  await tx.insert(documentExtractionActions).values({
    orgId: params.orgId,
    extractionId: params.extractionId,
    fieldId: params.fieldId,
    action: "created_record",
    createdRecordType: params.recordType,
    createdRecordId: params.recordId,
    actorId: params.actorId,
  });
}

export async function commitDocumentExtraction(
  db: Database,
  params: {
    orgId: string;
    entityId?: string;
    userId: string;
    extractionId: string;
    planTier: string | null | undefined;
    input: DocumentExtractionCommitInput;
  },
) {
  requireAwardIntakePlan(params.planTier);

  return db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(documentExtractions)
      .set({ status: "committing", updatedAt: new Date() })
      .where(
        and(
          eq(documentExtractions.id, params.extractionId),
          eq(documentExtractions.orgId, params.orgId),
          eq(documentExtractions.status, "ready_for_review"),
        ),
      )
      .returning();
    if (!claimed) {
      const existing = await tx.query.documentExtractions.findFirst({
        where: and(
          eq(documentExtractions.id, params.extractionId),
          eq(documentExtractions.orgId, params.orgId),
        ),
      });
      throw Object.assign(
        new Error(
          existing ? "Extraction is not ready for commit" : "Document extraction not found",
        ),
        { status: existing ? 409 : 404 },
      );
    }

    const sourceDocument = await tx.query.documents.findFirst({
      where: and(
        eq(documents.id, claimed.documentId),
        eq(documents.orgId, params.orgId),
        isNull(documents.deletedAt),
      ),
      columns: { id: true, entityType: true },
    });
    if (!sourceDocument) {
      throw Object.assign(new Error("Document not found"), { status: 404 });
    }
    assertAwardIntakeDocument(sourceDocument);

    const fields = await tx.query.documentExtractionFields.findMany({
      where: and(
        eq(documentExtractionFields.extractionId, params.extractionId),
        eq(documentExtractionFields.orgId, params.orgId),
      ),
    });
    const extraction = { ...claimed, fields };
    const blockingFields = findBlockingCommitFields(extraction.fields);
    if (blockingFields.length > 0) {
      throw Object.assign(new Error("Extraction review is incomplete"), {
        status: 409,
        body: { error: "review_incomplete", fields: blockingFields },
      });
    }

    let activeEntityId = params.entityId;
    let funderId =
      params.input.funderDecision.action === "map_existing"
        ? params.input.funderDecision.existingId
        : null;
    if (funderId) {
      await assertMappedEntityAccessible(tx, {
        orgId: params.orgId,
        entityType: "funder",
        entityId: funderId,
      });
    }
    if (!funderId) {
      const funderName = jsonString(
        approvedFieldValue(extraction.fields, { entityType: "funder", field: "name" }),
      );
      if (!funderName) {
        throw Object.assign(new Error("Approved funder name is required"), {
          status: 409,
          body: { error: "missing_approved_funder_name" },
        });
      }
      const [funder] = await tx
        .insert(funders)
        .values({
          orgId: params.orgId,
          entityId: await resolveCommitEntityId(tx, {
            orgId: params.orgId,
            entityId: activeEntityId,
          }),
          name: funderName,
          type: "other",
        })
        .returning();
      if (!funder) throw new Error("Failed to create funder");
      activeEntityId = funder.entityId;
      funderId = funder.id;
      await recordCreatedExtractionAction(tx, {
        orgId: params.orgId,
        extractionId: params.extractionId,
        actorId: params.userId,
        recordType: "funder",
        recordId: funderId,
      });
    }
    await tx.insert(documentExtractionActions).values({
      orgId: params.orgId,
      extractionId: params.extractionId,
      action: "funder_decision",
      mappedEntityType: "funder",
      mappedEntityId: params.input.funderDecision.action === "map_existing" ? funderId : undefined,
      createdRecordType: params.input.funderDecision.action === "create_new" ? "funder" : undefined,
      createdRecordId: params.input.funderDecision.action === "create_new" ? funderId : undefined,
      actorId: params.userId,
    });

    let grantId =
      params.input.grantDecision.action === "map_existing"
        ? params.input.grantDecision.existingId
        : null;
    if (grantId) {
      const mappedGrant = await findActiveGrant(tx, {
        orgId: params.orgId,
        grantId,
        entityId: activeEntityId,
      });
      if (!mappedGrant) {
        throw Object.assign(new Error("Mapped entity not found"), { status: 404 });
      }
      activeEntityId = mappedGrant.entityId;
      if (mappedGrant.funderId !== funderId) {
        throw Object.assign(new Error("Mapped grant belongs to a different funder"), {
          status: 409,
          body: { error: "grant_funder_mismatch" },
        });
      }
    }
    if (!grantId) {
      const newGrantEntityId = await resolveCommitEntityId(tx, {
        orgId: params.orgId,
        entityId: activeEntityId,
      });
      activeEntityId = newGrantEntityId;
      const [grant] = await tx
        .insert(grants)
        .values({
          orgId: params.orgId,
          entityId: newGrantEntityId,
          funderId,
          name: params.input.requiredGrantBasics.name,
          status: "awarded",
          amountCents: params.input.requiredGrantBasics.amountCents,
          startDate: params.input.requiredGrantBasics.startDate
            ? new Date(params.input.requiredGrantBasics.startDate)
            : undefined,
          endDate: params.input.requiredGrantBasics.endDate
            ? new Date(params.input.requiredGrantBasics.endDate)
            : undefined,
        })
        .returning();
      if (!grant) throw new Error("Failed to create grant");
      grantId = grant.id;
      await recordCreatedExtractionAction(tx, {
        orgId: params.orgId,
        extractionId: params.extractionId,
        actorId: params.userId,
        recordType: "grant",
        recordId: grantId,
      });
    }
    await tx.insert(documentExtractionActions).values({
      orgId: params.orgId,
      extractionId: params.extractionId,
      action: "grant_decision",
      mappedEntityType: "grant",
      mappedEntityId: params.input.grantDecision.action === "map_existing" ? grantId : undefined,
      createdRecordType: params.input.grantDecision.action === "create_new" ? "grant" : undefined,
      createdRecordId: params.input.grantDecision.action === "create_new" ? grantId : undefined,
      actorId: params.userId,
    });

    const committedGrantId = grantId;
    const committedFunderId = funderId;
    const committedEntityId = await resolveCommitEntityId(tx, {
      orgId: params.orgId,
      entityId: activeEntityId,
    });
    const committedGrantAmountCents =
      params.input.grantDecision.action === "map_existing"
        ? (
            await findActiveGrant(tx, {
              orgId: params.orgId,
              grantId: committedGrantId,
              entityId: committedEntityId,
            })
          )?.amountCents
        : params.input.requiredGrantBasics.amountCents;
    if (committedGrantAmountCents != null) {
      await lockGrantAllocationCap(tx, {
        orgId: params.orgId,
        grantId: committedGrantId,
      });
    }
    const existingAllocationAmountCents =
      committedGrantAmountCents == null
        ? 0
        : await getExistingAllocationSum(tx, {
            grantId: committedGrantId,
          });
    let pendingAllocationAmountCents = 0;

    let documentBudgetVersionId: string | null = null;
    async function getDocumentBudgetVersionId(fieldId?: string) {
      if (documentBudgetVersionId) return documentBudgetVersionId;

      const latestVersion = await tx.query.grantBudgetVersions.findFirst({
        where: and(
          eq(grantBudgetVersions.orgId, params.orgId),
          eq(grantBudgetVersions.grantId, committedGrantId),
          eq(grantBudgetVersions.entityId, committedEntityId),
          isNull(grantBudgetVersions.deletedAt),
        ),
        orderBy: [desc(grantBudgetVersions.versionNumber)],
        columns: { versionNumber: true },
      });
      const [version] = await tx
        .insert(grantBudgetVersions)
        .values({
          orgId: params.orgId,
          entityId: committedEntityId,
          grantId: committedGrantId,
          versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
          status: "draft",
          source: "document_intake",
          sourceDocumentId: extraction.documentId,
          createdByUserId: params.userId,
        })
        .returning();
      if (!version) throw new Error("Failed to create grant budget version");

      documentBudgetVersionId = version.id;
      await recordCreatedExtractionAction(tx, {
        orgId: params.orgId,
        extractionId: params.extractionId,
        fieldId,
        actorId: params.userId,
        recordType: "grant_budget_version",
        recordId: version.id,
      });
      return documentBudgetVersionId;
    }

    for (const field of extraction.fields.filter((item) => isAcceptedCommitStatus(item.status))) {
      const value = normalizedValue(field);
      const record = jsonRecord(value);
      // When `value` parses as an object, every leaf is read from `record`.
      // The scalar fallback only applies to genuinely flat values; using the
      // raw `value` here would persist the whole JSON blob into a text column.
      const scalar = record === null ? value : null;
      if (field.destinationEntityType === "funder_contact") {
        const name =
          jsonString(record?.name) ??
          (field.destinationField === "name" ? jsonString(scalar) : null);
        if (!name) continue;
        const [created] = await tx
          .insert(funderContacts)
          .values({
            orgId: params.orgId,
            entityId: committedEntityId,
            funderId,
            name,
            title: jsonString(record?.title),
            email: jsonString(record?.email),
            phone: jsonString(record?.phone),
            notes: jsonString(record?.notes),
          })
          .returning();
        if (created) {
          await recordCreatedExtractionAction(tx, {
            orgId: params.orgId,
            extractionId: params.extractionId,
            fieldId: field.id,
            actorId: params.userId,
            recordType: "funder_contact",
            recordId: created.id,
          });
        }
      }

      if (field.destinationEntityType === "reporting_requirement") {
        const dueDate =
          jsonDate(record?.dueDate) ??
          (field.destinationField === "dueDate" ? jsonDate(scalar) : null);
        const reportType =
          jsonString(record?.reportType) ??
          jsonString(record?.type) ??
          (field.destinationField === "reportType" ? jsonString(scalar) : null);
        if (!dueDate || !reportType) continue;
        const [created] = await tx
          .insert(grantReportingRequirements)
          .values({
            orgId: params.orgId,
            entityId: committedEntityId,
            grantId,
            reportType,
            dueDate,
            notes: jsonString(record?.notes),
          })
          .returning();
        if (created) {
          await recordCreatedExtractionAction(tx, {
            orgId: params.orgId,
            extractionId: params.extractionId,
            fieldId: field.id,
            actorId: params.userId,
            recordType: "reporting_requirement",
            recordId: created.id,
          });
          await recordActivityLog(tx, {
            orgId: params.orgId,
            actorId: params.userId,
            action: "created",
            entityType: "reporting_requirement",
            entityId: created.id,
            activeEntityId: committedEntityId,
            changes: { grantId, reportType: created.reportType },
          });
        }
      }

      if (field.destinationEntityType === "closeout_item") {
        const label =
          jsonString(record?.label) ??
          jsonString(record?.title) ??
          (field.destinationField === "label" ? jsonString(scalar) : null);
        if (!label) continue;
        const [created] = await tx
          .insert(grantCloseoutItems)
          .values({
            orgId: params.orgId,
            entityId: committedEntityId,
            grantId,
            label,
            dueDate: jsonDate(record?.dueDate),
          })
          .returning();
        if (created) {
          await recordCreatedExtractionAction(tx, {
            orgId: params.orgId,
            extractionId: params.extractionId,
            fieldId: field.id,
            actorId: params.userId,
            recordType: "closeout_item",
            recordId: created.id,
          });
          await recordActivityLog(tx, {
            orgId: params.orgId,
            actorId: params.userId,
            action: "created",
            entityType: "closeout_item",
            entityId: created.id,
            activeEntityId: committedEntityId,
            changes: { grantId, label: created.label },
          });
        }
      }

      if (field.destinationEntityType === "restriction_term") {
        const title =
          jsonString(record?.title) ??
          (field.destinationField === "title" ? jsonString(scalar) : null);
        if (!title) continue;
        const [created] = await tx
          .insert(restrictionTerms)
          .values({
            orgId: params.orgId,
            grantId,
            sourceDocumentId: extraction.documentId,
            restrictionType: jsonString(record?.restrictionType) ?? "purpose",
            source: "award_document_intake",
            title,
            purposeStatement:
              jsonString(record?.purposeStatement) ??
              jsonString(record?.description) ??
              (field.destinationField === "purposeStatement" ? jsonString(scalar) : null),
            releaseRule: jsonString(record?.releaseRule),
            startDate: jsonDate(record?.startDate),
            endDate: jsonDate(record?.endDate),
            evidenceRequirement: jsonString(record?.evidenceRequirement),
            createdBy: params.userId,
          })
          .returning();
        if (created) {
          await recordCreatedExtractionAction(tx, {
            orgId: params.orgId,
            extractionId: params.extractionId,
            fieldId: field.id,
            actorId: params.userId,
            recordType: "restriction_term",
            recordId: created.id,
          });
        }
      }

      if (field.destinationEntityType === "budget_line") {
        const category =
          jsonString(record?.category) ??
          jsonString(record?.name) ??
          (field.destinationField === "category" ? jsonString(scalar) : null);
        const approvedAmountCents =
          jsonNumber(record?.approvedAmountCents) ??
          jsonNumber(record?.amountCents) ??
          (field.destinationField === "approvedAmountCents" ? jsonNumber(scalar) : null);
        if (!category || approvedAmountCents == null) continue;

        const budgetVersionId = await getDocumentBudgetVersionId(field.id);
        const [created] = await tx
          .insert(grantBudgetLines)
          .values({
            orgId: params.orgId,
            entityId: committedEntityId,
            budgetVersionId,
            category,
            description: jsonString(record?.description),
            approvedAmountCents,
            allowable: jsonBoolean(record?.allowable) ?? true,
            costType: jsonString(record?.costType) === "indirect" ? "indirect" : "direct",
            notes: jsonString(record?.notes),
          })
          .returning();
        if (created) {
          await recordCreatedExtractionAction(tx, {
            orgId: params.orgId,
            extractionId: params.extractionId,
            fieldId: field.id,
            actorId: params.userId,
            recordType: "grant_budget_line",
            recordId: created.id,
          });
        }
      }

      if (field.destinationEntityType === "allocation") {
        const fundName = jsonString(record?.fundName) ?? jsonString(record?.name);
        const allocatedAmountCents =
          jsonNumber(record?.allocatedAmountCents) ??
          (field.destinationField === "allocatedAmountCents" ? jsonNumber(scalar) : null);
        if (!fundName || !allocatedAmountCents || allocatedAmountCents <= 0) continue;
        if (committedGrantAmountCents != null) {
          if (
            existingAllocationAmountCents + pendingAllocationAmountCents + allocatedAmountCents >
            committedGrantAmountCents
          ) {
            throw conflict("Allocation would exceed grant amount");
          }
        }
        pendingAllocationAmountCents += allocatedAmountCents;
        const [fund] = await tx
          .insert(funds)
          .values({
            orgId: params.orgId,
            entityId: committedEntityId,
            name: fundName,
            type: jsonString(record?.fundType) ?? "temporarily_restricted",
            description: jsonString(record?.description),
          })
          .returning();
        if (!fund) continue;
        await recordCreatedExtractionAction(tx, {
          orgId: params.orgId,
          extractionId: params.extractionId,
          fieldId: field.id,
          actorId: params.userId,
          recordType: "fund",
          recordId: fund.id,
        });
        const [allocation] = await tx
          .insert(grantFundAllocations)
          .values({
            grantId,
            entityId: committedEntityId,
            fundId: fund.id,
            allocatedAmountCents,
          })
          .returning();
        if (allocation) {
          await recordCreatedExtractionAction(tx, {
            orgId: params.orgId,
            extractionId: params.extractionId,
            fieldId: field.id,
            actorId: params.userId,
            recordType: "grant_fund_allocation",
            recordId: allocation.id,
          });
        }
      }
    }

    await tx
      .update(documents)
      .set({ entityType: "grant", entityId: committedGrantId })
      .where(
        and(
          eq(documents.id, extraction.documentId),
          eq(documents.orgId, params.orgId),
          isNull(documents.deletedAt),
        ),
      );

    await tx
      .update(documentExtractions)
      .set({
        status: "committed",
        createdGrantId: committedGrantId,
        updatedAt: new Date(),
        completedAt: new Date(),
      })
      .where(
        and(
          eq(documentExtractions.id, params.extractionId),
          eq(documentExtractions.orgId, params.orgId),
        ),
      );

    await tx.insert(documentExtractionActions).values({
      orgId: params.orgId,
      extractionId: params.extractionId,
      action: "commit",
      createdRecordType: "grant",
      createdRecordId: committedGrantId,
      actorId: params.userId,
    });

    await recordActivityLog(tx, {
      orgId: params.orgId,
      actorId: params.userId,
      action: "committed",
      entityType: "document_extraction",
      entityId: params.extractionId,
      activeEntityId: committedEntityId,
      changes: { grantId: committedGrantId, funderId: committedFunderId },
    });

    return { grantId: committedGrantId, funderId: committedFunderId };
  });
}
