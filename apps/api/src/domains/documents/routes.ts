import { Hono } from "hono";
import type { Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  ANALYTICS_EVENTS,
  MAX_DOCUMENT_BYTES,
  createDocumentSchema,
  documentListSchema,
  type DocumentEntityType,
} from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { captureApiAnalyticsSafely } from "../../lib/analytics";
import { requireEntityPermission } from "../../middleware/require-role";
import { getIntegrations } from "../../lib/integrations";
import { canReadDocumentEntity, documentEntityTypesForRole } from "./access";
import { createDocument, downloadDocument, listDocuments, softDeleteDocument } from "./service";

export function resolveUploadedDocumentMimeType(fileEntry: Pick<File, "type">) {
  return fileEntry.type || "application/octet-stream";
}

function analyticsForContext(c: Context<AppEnv>) {
  return getIntegrations(c.get("db"), c.env ?? ({} as AppEnv["Bindings"])).analytics;
}

function getDocumentMimeFamily(mimeType: string | null | undefined): string {
  if (!mimeType) return "unknown";
  const [family, subtype] = mimeType.trim().toLowerCase().split("/");
  return family && subtype ? family : "unknown";
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

function safeDocumentEntityType(value: FormDataEntryValue | null): DocumentEntityType | undefined {
  if (typeof value !== "string") return undefined;
  return createDocumentSchema.shape.entityType.safeParse(value).success
    ? (value as DocumentEntityType)
    : undefined;
}

function documentFileAnalytics(fileEntry: File | null | undefined) {
  if (!(fileEntry instanceof File)) return {};
  const mimeType = resolveUploadedDocumentMimeType(fileEntry);
  return {
    mime_family: getDocumentMimeFamily(mimeType),
    size_bucket: getDocumentSizeBucket(fileEntry.size),
  };
}

function captureDocumentEvent(
  c: Context<AppEnv>,
  eventName: (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS],
  payload: Record<string, unknown> = {},
) {
  captureApiAnalyticsSafely(
    analyticsForContext(c).capture({
      orgId: c.get("orgId")!,
      eventName,
      payload: {
        actorId: c.get("user")!.id,
        ...payload,
      },
    }),
    { c, eventName },
  );
}

function captureDocumentUploadFailed(
  c: Context<AppEnv>,
  failureType: string,
  formData: FormData,
  fileEntry?: File | null,
) {
  const entityType = safeDocumentEntityType(formData.get("entityType"));
  captureDocumentEvent(c, ANALYTICS_EVENTS.documentUploadFailed, {
    failure_type: failureType,
    ...(entityType ? { entity_type: entityType } : {}),
    ...documentFileAnalytics(fileEntry),
  });
}

export const documentRoutes = new Hono<AppEnv>()
  .get(
    "/",
    requireEntityPermission("documents", "view"),
    zValidator("query", documentListSchema),
    async (c) => {
      const query = c.req.valid("query");
      if (!canReadDocumentEntity(c.get("memberRole"), query.entityType)) {
        return c.json({ error: "Forbidden" }, 403);
      }

      const result = await listDocuments(c.get("db"), {
        orgId: c.get("orgId")!,
        selectedEntityId: c.get("entityId")!,
        allowedEntityTypes: documentEntityTypesForRole(c.get("memberRole")),
        ...query,
      });
      return c.json(result);
    },
  )
  .post("/", requireEntityPermission("documents", "edit"), async (c) => {
    const formData = await c.req.formData();
    const fileEntry = formData.get("file");
    if (!(fileEntry instanceof File)) {
      captureDocumentUploadFailed(c, "missing_file", formData);
      return c.json({ error: "File is required" }, 400);
    }

    if (fileEntry.size > MAX_DOCUMENT_BYTES) {
      captureDocumentUploadFailed(c, "file_too_large", formData, fileEntry);
      return c.json({ error: "File exceeds 25MB limit" }, 413);
    }

    const mimeType = resolveUploadedDocumentMimeType(fileEntry);
    if (!ALLOWED_DOCUMENT_MIME_TYPES.has(mimeType)) {
      captureDocumentUploadFailed(c, "mime_not_allowed", formData, fileEntry);
      return c.json({ error: "File type not allowed" }, 415);
    }

    const payload = createDocumentSchema.safeParse({
      entityType: formData.get("entityType"),
      entityId: formData.get("entityId"),
      filename: fileEntry.name,
      mimeType,
      sizeBytes: fileEntry.size,
    });

    if (!payload.success) {
      captureDocumentUploadFailed(c, "invalid_payload", formData, fileEntry);
      return c.json({ error: payload.error.flatten() }, 400);
    }

    const bytes = new Uint8Array(await fileEntry.arrayBuffer());
    const document = await createDocument(c.get("db"), c.env, {
      orgId: c.get("orgId")!,
      selectedEntityId: c.get("entityId")!,
      userId: c.get("user")!.id,
      body: bytes,
      ...payload.data,
    });
    captureDocumentEvent(c, ANALYTICS_EVENTS.documentUploaded, {
      entity_type: payload.data.entityType,
      mime_family: getDocumentMimeFamily(payload.data.mimeType),
      size_bucket: getDocumentSizeBucket(payload.data.sizeBytes),
    });
    return c.json(document, 201);
  })
  .get("/:documentId/download", requireEntityPermission("documents", "view"), async (c) => {
    const response = await downloadDocument(c.get("db"), c.env, {
      orgId: c.get("orgId")!,
      selectedEntityId: c.get("entityId")!,
      documentId: c.req.param("documentId"),
      allowedEntityTypes: documentEntityTypesForRole(c.get("memberRole")),
    });
    captureDocumentEvent(c, ANALYTICS_EVENTS.documentDownloadClicked, {
      entity_type: response.headers.get("X-GrantPipe-Document-Entity-Type") ?? "unknown",
      mime_family: getDocumentMimeFamily(response.headers.get("Content-Type")),
      size_bucket: response.headers.get("X-GrantPipe-Document-Size-Bucket") ?? "unknown",
    });
    return response;
  })
  .delete("/:documentId", requireEntityPermission("documents", "manage"), async (c) => {
    const document = await softDeleteDocument(c.get("db"), c.env, {
      orgId: c.get("orgId")!,
      selectedEntityId: c.get("entityId")!,
      documentId: c.req.param("documentId"),
      actorId: c.get("user")!.id,
    });
    captureDocumentEvent(c, ANALYTICS_EVENTS.documentDeleted, {
      entity_type: document.entityType,
      mime_family: getDocumentMimeFamily(document.mimeType),
      size_bucket: getDocumentSizeBucket(document.sizeBytes),
    });
    return c.body(null, 204);
  });
