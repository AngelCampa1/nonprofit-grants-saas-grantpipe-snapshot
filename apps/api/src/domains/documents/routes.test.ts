import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  ANALYTICS_EVENTS,
  MAX_DOCUMENT_BYTES,
  getDefaultPermissionsForEntityRole,
  type EntityRole,
  type PermissionMap,
  type Role,
} from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { notFound } from "../../lib/app-error";
import { errorHandler } from "../../middleware/error-handler";
import { documentRoutes, resolveUploadedDocumentMimeType } from "./routes";

vi.mock("./service", () => ({
  createDocument: vi.fn(),
  downloadDocument: vi.fn(),
  listDocuments: vi.fn(),
  softDeleteDocument: vi.fn(),
}));

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
}));

const { mockCaptureAnalytics } = vi.hoisted(() => ({
  mockCaptureAnalytics: vi.fn(),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: () => ({
    analytics: { capture: mockCaptureAnalytics },
  }),
}));

import { createDocument, downloadDocument, listDocuments, softDeleteDocument } from "./service";
import { recordActivityLog } from "../../lib/activity-log";

function buildApp(
  role: Role = "admin",
  permissions: Partial<PermissionMap> | null = null,
  activeEntityId: string | null = "entity-active",
  entityRole: EntityRole | null = null,
) {
  return new Hono<AppEnv>()
    .onError(errorHandler)
    .use("/documents/*", async (c, next) => {
      c.set("db", {} as never);
      c.set("orgId", "org-1");
      c.set("entityId", activeEntityId);
      c.set("user", { id: "user-1", email: "test@example.com", name: "Test" });
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      c.set("memberPermissions", permissions as PermissionMap | null);
      c.set("entityRole", entityRole);
      c.set(
        "entityPermissions",
        entityRole ? getDefaultPermissionsForEntityRole(entityRole) : null,
      );
      await next();
    })
    .route("/documents", documentRoutes);
}

describe("GET /documents", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue({ id: "analytics-1" });
  });

  it("returns paginated documents", async () => {
    vi.mocked(listDocuments).mockResolvedValue({
      data: [{ id: "doc-1" }] as never,
      total: 1,
      page: 1,
      pageSize: 25,
    });

    const app = buildApp("viewer");
    const res = await app.request("/documents?entityType=contact&entityId=contact-1");

    expect(res.status).toBe(200);
  });

  it("blocks auditors from donor document lists", async () => {
    const app = buildApp("auditor");
    const res = await app.request("/documents?entityType=contact&entityId=contact-1");

    expect(res.status).toBe(403);
    expect(listDocuments).not.toHaveBeenCalled();
  });

  it("allows auditors to list grant documents", async () => {
    vi.mocked(listDocuments).mockResolvedValue({
      data: [{ id: "doc-1" }] as never,
      total: 1,
      page: 1,
      pageSize: 25,
    });

    const app = buildApp("auditor");
    const res = await app.request("/documents?entityType=grant&entityId=grant-1");

    expect(res.status).toBe(200);
    expect(listDocuments).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "grant",
        allowedEntityTypes: expect.arrayContaining(["grant", "payment_request", "subaward"]),
      }),
    );
  });

  it("passes the active entity into document list scoping", async () => {
    vi.mocked(listDocuments).mockResolvedValue({
      data: [{ id: "doc-1" }] as never,
      total: 1,
      page: 1,
      pageSize: 25,
    });

    const app = buildApp("viewer", null, "entity-active");
    const res = await app.request("/documents?entityType=grant&entityId=grant-1");

    expect(res.status).toBe(200);
    expect(listDocuments).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        entityType: "grant",
        entityId: "grant-1",
        selectedEntityId: "entity-active",
      }),
    );
  });
});

describe("POST /documents", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue({ id: "analytics-1" });
  });

  it("defaults empty file types to application/octet-stream", () => {
    expect(resolveUploadedDocumentMimeType({ type: "" } as File)).toBe("application/octet-stream");
  });

  it("preserves explicit file mime types", () => {
    expect(resolveUploadedDocumentMimeType({ type: "application/pdf" } as File)).toBe(
      "application/pdf",
    );
  });

  it("returns 201 when editor uploads a document", async () => {
    vi.mocked(createDocument).mockResolvedValue({
      id: "doc-1",
      entityType: "contact",
      entityId: "contact-1",
      filename: "appeal.pdf",
      mimeType: "application/pdf",
      sizeBytes: 5,
    } as never);

    const formData = new FormData();
    formData.append("entityType", "contact");
    formData.append("entityId", "contact-1");
    formData.append("file", new File(["hello"], "appeal.pdf", { type: "application/pdf" }));

    const app = buildApp("editor");
    const res = await app.request("/documents", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(201);
    expect(createDocument).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      expect.objectContaining({
        orgId: "org-1",
        userId: "user-1",
        entityType: "contact",
        entityId: "contact-1",
        selectedEntityId: "entity-active",
      }),
    );
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("denies an org editor selected as an entity viewer from uploading", async () => {
    const formData = new FormData();
    formData.append("entityType", "grant");
    formData.append("entityId", "grant-1");
    formData.append("file", new File(["hello"], "appeal.pdf", { type: "application/pdf" }));

    const res = await buildApp("editor", null, "entity-active", "viewer").request("/documents", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(403);
    expect(createDocument).not.toHaveBeenCalled();
    expect(mockCaptureAnalytics).not.toHaveBeenCalled();
  });

  it("returns 404 when the selected entity does not own the upload parent", async () => {
    vi.mocked(createDocument).mockRejectedValue(notFound("Entity not found"));
    const form = new FormData();
    form.set("entityType", "grant");
    form.set("entityId", "grant-sibling");
    form.set("file", new File(["hello"], "appeal.pdf", { type: "application/pdf" }));

    const res = await buildApp("editor").request("/documents", {
      method: "POST",
      body: form,
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Entity not found" });
    expect(recordActivityLog).not.toHaveBeenCalled();
  });

  it("captures a server-side document upload event with safe buckets", async () => {
    vi.mocked(createDocument).mockResolvedValue({
      id: "doc-1",
      entityType: "contact",
      entityId: "contact-1",
      filename: "appeal.pdf",
      mimeType: "application/pdf",
      sizeBytes: 5,
    } as never);

    const formData = new FormData();
    formData.append("entityType", "contact");
    formData.append("entityId", "contact-1");
    formData.append("file", new File(["hello"], "appeal.pdf", { type: "application/pdf" }));

    const app = buildApp("editor");
    const res = await app.request("/documents", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.documentUploaded,
      payload: {
        actorId: "user-1",
        entity_type: "contact",
        mime_family: "application",
        size_bucket: "under_10kb",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("appeal.pdf");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("contact-1");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("doc-1");
  });

  it("returns 403 when viewer uploads", async () => {
    const formData = new FormData();
    formData.append("entityType", "contact");
    formData.append("entityId", "contact-1");
    formData.append("file", new File(["hello"], "appeal.pdf", { type: "application/pdf" }));

    const app = buildApp("viewer");
    const res = await app.request("/documents", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(403);
    expect(createDocument).not.toHaveBeenCalled();
  });

  it("allows a viewer with documents edit permission override to upload", async () => {
    vi.mocked(createDocument).mockResolvedValue({
      id: "doc-1",
      entityType: "contact",
      entityId: "contact-1",
      filename: "appeal.pdf",
      mimeType: "application/pdf",
      sizeBytes: 5,
    } as never);
    const formData = new FormData();
    formData.append("entityType", "contact");
    formData.append("entityId", "contact-1");
    formData.append("file", new File(["hello"], "appeal.pdf", { type: "application/pdf" }));

    const app = buildApp("viewer", { documents: "edit" });
    const res = await app.request("/documents", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(201);
    expect(createDocument).toHaveBeenCalledOnce();
  });

  it("returns 400 when file is missing", async () => {
    const formData = new FormData();
    formData.append("entityType", "contact");
    formData.append("entityId", "contact-1");

    const app = buildApp("editor");
    const res = await app.request("/documents", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(400);
    expect(createDocument).not.toHaveBeenCalled();
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.documentUploadFailed,
      payload: {
        actorId: "user-1",
        entity_type: "contact",
        failure_type: "missing_file",
      },
    });
  });

  it("returns 400 when the payload is invalid", async () => {
    const formData = new FormData();
    formData.append("entityType", "invalid");
    formData.append("entityId", "");
    formData.append("file", new File(["hello"], "appeal.pdf", { type: "application/pdf" }));

    const app = buildApp("editor");
    const res = await app.request("/documents", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(400);
    expect(createDocument).not.toHaveBeenCalled();
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.documentUploadFailed,
      payload: {
        actorId: "user-1",
        failure_type: "invalid_payload",
        mime_family: "application",
        size_bucket: "under_10kb",
      },
    });
  });

  it("exposes MAX_DOCUMENT_BYTES as 25 MB", () => {
    expect(MAX_DOCUMENT_BYTES).toBe(25 * 1024 * 1024);
  });

  it("exposes an ALLOWED_DOCUMENT_MIME_TYPES allowlist containing common nonprofit types", () => {
    expect(ALLOWED_DOCUMENT_MIME_TYPES).toBeInstanceOf(Set);
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("application/pdf")).toBe(true);
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("image/png")).toBe(true);
    expect(ALLOWED_DOCUMENT_MIME_TYPES.has("text/csv")).toBe(true);
    expect(
      ALLOWED_DOCUMENT_MIME_TYPES.has(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe(true);
  });

  it("returns 413 when the uploaded file exceeds MAX_DOCUMENT_BYTES", async () => {
    const formData = new FormData();
    formData.append("entityType", "contact");
    formData.append("entityId", "contact-1");
    // Allocate a buffer that is exactly one byte over the cap. Uint8Array(25MiB + 1)
    // is ~25 MB of zeros; acceptable for a single-test allocation.
    const oversize = new Uint8Array(MAX_DOCUMENT_BYTES + 1);
    formData.append("file", new File([oversize], "big.pdf", { type: "application/pdf" }));

    const app = buildApp("editor");
    const res = await app.request("/documents", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(413);
    expect(createDocument).not.toHaveBeenCalled();
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.documentUploadFailed,
      payload: {
        actorId: "user-1",
        entity_type: "contact",
        failure_type: "file_too_large",
        mime_family: "application",
        size_bucket: "over_10mb",
      },
    });
  });

  it("returns 415 when the uploaded file has a disallowed mime type", async () => {
    const formData = new FormData();
    formData.append("entityType", "contact");
    formData.append("entityId", "contact-1");
    formData.append(
      "file",
      new File(["bytes"], "payload.exe", { type: "application/x-msdownload" }),
    );

    const app = buildApp("editor");
    const res = await app.request("/documents", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(415);
    expect(createDocument).not.toHaveBeenCalled();
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.documentUploadFailed,
      payload: {
        actorId: "user-1",
        entity_type: "contact",
        failure_type: "mime_not_allowed",
        mime_family: "application",
        size_bucket: "under_10kb",
      },
    });
  });

  it("rejects empty-type uploads because application/octet-stream is not in the allowlist", async () => {
    const formData = new FormData();
    formData.append("entityType", "contact");
    formData.append("entityId", "contact-1");
    const file = new File(["hello"], "appeal.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "type", {
      value: "",
    });
    formData.append("file", file);

    const app = buildApp("editor");
    const res = await app.request("/documents", {
      method: "POST",
      body: formData,
    });

    expect(res.status).toBe(415);
    expect(createDocument).not.toHaveBeenCalled();
  });
});

describe("GET /documents/:documentId/download", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue({ id: "analytics-1" });
  });

  it("streams the download response", async () => {
    vi.mocked(downloadDocument).mockResolvedValue(
      new Response("pdf-bytes", {
        headers: {
          "Content-Type": "application/pdf",
          "X-GrantPipe-Document-Entity-Type": "grant",
          "X-GrantPipe-Document-Size-Bucket": "under_10kb",
        },
      }),
    );

    const app = buildApp("viewer");
    const res = await app.request("/documents/doc-1/download");

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("pdf-bytes");
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.documentDownloadClicked,
      payload: {
        actorId: "user-1",
        entity_type: "grant",
        mime_family: "application",
        size_bucket: "under_10kb",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("doc-1");
  });

  it("passes auditor-safe document entity types to download authorization", async () => {
    vi.mocked(downloadDocument).mockResolvedValue(new Response("pdf-bytes"));

    const app = buildApp("auditor");
    const res = await app.request("/documents/doc-1/download");

    expect(res.status).toBe(200);
    expect(downloadDocument).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
      expect.objectContaining({
        documentId: "doc-1",
        selectedEntityId: "entity-active",
        allowedEntityTypes: expect.arrayContaining(["grant", "fund", "generated_report"]),
      }),
    );
  });
});

describe("DELETE /documents/:documentId", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue({ id: "analytics-1" });
  });

  it("returns 204 when admin deletes a document", async () => {
    vi.mocked(softDeleteDocument).mockResolvedValue({
      id: "doc-1",
      entityType: "contact",
      entityId: "contact-1",
      filename: "appeal.pdf",
    } as never);

    const app = buildApp("admin");
    const res = await app.request("/documents/doc-1", {
      method: "DELETE",
    });

    expect(res.status).toBe(204);
    const calls = vi.mocked(softDeleteDocument).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[2]).toMatchObject({
      orgId: "org-1",
      documentId: "doc-1",
      actorId: "user-1",
      selectedEntityId: "entity-active",
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.documentDeleted,
      payload: {
        actorId: "user-1",
        entity_type: "contact",
        mime_family: "unknown",
        size_bucket: "unknown",
      },
    });
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("appeal.pdf");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("contact-1");
    expect(JSON.stringify(mockCaptureAnalytics.mock.calls)).not.toContain("doc-1");
  });
});

// ---------------------------------------------------------------------------
// getDocumentSizeBucket — intermediate size ranges (routes.ts helper)
// ---------------------------------------------------------------------------

describe("document upload — size bucket coverage for intermediate ranges", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue({ id: "analytics-1" });
  });

  it("captures size_bucket 10kb_100kb for a 50 KB file", async () => {
    const fiftyKb = new Uint8Array(50 * 1024);
    vi.mocked(createDocument).mockResolvedValue({
      id: "doc-1",
      entityType: "contact",
      entityId: "contact-1",
      filename: "mid.pdf",
      mimeType: "application/pdf",
      sizeBytes: fiftyKb.length,
    } as never);

    const formData = new FormData();
    formData.append("entityType", "contact");
    formData.append("entityId", "contact-1");
    formData.append("file", new File([fiftyKb], "mid.pdf", { type: "application/pdf" }));

    const app = buildApp("editor");
    const res = await app.request("/documents", { method: "POST", body: formData });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ size_bucket: "10kb_100kb" }),
      }),
    );
  });

  it("captures size_bucket 100kb_1mb for a 500 KB file", async () => {
    const fiveHundredKb = new Uint8Array(500 * 1024);
    vi.mocked(createDocument).mockResolvedValue({
      id: "doc-1",
      entityType: "contact",
      entityId: "contact-1",
      filename: "big.pdf",
      mimeType: "application/pdf",
      sizeBytes: fiveHundredKb.length,
    } as never);

    const formData = new FormData();
    formData.append("entityType", "contact");
    formData.append("entityId", "contact-1");
    formData.append("file", new File([fiveHundredKb], "big.pdf", { type: "application/pdf" }));

    const app = buildApp("editor");
    const res = await app.request("/documents", { method: "POST", body: formData });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ size_bucket: "100kb_1mb" }),
      }),
    );
  });

  it("captures size_bucket 1mb_10mb for a 5 MB file", async () => {
    const fiveMb = new Uint8Array(5 * 1024 * 1024);
    vi.mocked(createDocument).mockResolvedValue({
      id: "doc-1",
      entityType: "contact",
      entityId: "contact-1",
      filename: "large.pdf",
      mimeType: "application/pdf",
      sizeBytes: fiveMb.length,
    } as never);

    const formData = new FormData();
    formData.append("entityType", "contact");
    formData.append("entityId", "contact-1");
    formData.append("file", new File([fiveMb], "large.pdf", { type: "application/pdf" }));

    const app = buildApp("editor");
    const res = await app.request("/documents", { method: "POST", body: formData });

    expect(res.status).toBe(201);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ size_bucket: "1mb_10mb" }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// getDocumentMimeFamily — edge cases (routes.ts helper via upload failed path)
// ---------------------------------------------------------------------------

describe("document upload failed — mime_family unknown for malformed mime type", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue({ id: "analytics-1" });
  });

  it("emits mime_family unknown when Content-Type is a malformed value with no subtype", async () => {
    vi.mocked(downloadDocument).mockResolvedValue(
      new Response("pdf-bytes", {
        headers: {
          "Content-Type": "noslash",
          "X-GrantPipe-Document-Entity-Type": "grant",
          "X-GrantPipe-Document-Size-Bucket": "under_10kb",
        },
      }),
    );

    const app = buildApp("viewer");
    const res = await app.request("/documents/doc-1/download");

    expect(res.status).toBe(200);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ mime_family: "unknown" }),
      }),
    );
  });
});

describe("captureDocumentUploadFailed — entityType absent from formData", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue({ id: "analytics-1" });
  });

  it("omits entity_type from capture payload when entityType field is missing in formData", async () => {
    const formData = new FormData();
    // entityType intentionally omitted; entityId is also absent
    // No file field → triggers missing_file failure path

    const app = buildApp("editor");
    const res = await app.request("/documents", { method: "POST", body: formData });

    expect(res.status).toBe(400);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.documentUploadFailed,
        payload: expect.objectContaining({ failure_type: "missing_file" }),
      }),
    );
    // entity_type must not be present when entityType is absent
    const callPayload = vi.mocked(mockCaptureAnalytics).mock.calls[0]?.[0] as {
      payload: Record<string, unknown>;
    };
    expect(callPayload.payload).not.toHaveProperty("entity_type");
  });
});

describe("swallowCapture — absorbs rejected analytics promise in document routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockRejectedValue(new Error("PostHog unreachable"));
  });

  it("returns 204 even when analytics.capture rejects during document delete", async () => {
    vi.mocked(softDeleteDocument).mockResolvedValue({
      id: "doc-1",
      entityType: "contact",
      entityId: "contact-1",
      filename: "appeal.pdf",
    } as never);

    const app = buildApp("admin");
    const res = await app.request("/documents/doc-1", { method: "DELETE" });

    expect(res.status).toBe(204);
  });
});
