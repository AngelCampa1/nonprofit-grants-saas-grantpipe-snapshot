import { describe, it, expect, vi } from "vitest";
import { Hono } from "hono";
import type { AppEnv, Bindings } from "../../types";
import { signDownloadToken } from "../../lib/r2";
import { downloadsRoutes } from "./routes";

const SECRET = "test-download-secret";

/**
 * Build an R2-like bucket that returns a PDF-like stream for the given key.
 * Passing `null` simulates the object being absent from the bucket.
 */
function makeR2(key: string | null) {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF magic bytes
  return {
    get: vi.fn(async (requestedKey: string) => {
      if (key === null || requestedKey !== key) return null;
      return {
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(pdfBytes);
            controller.close();
          },
        }),
        httpMetadata: { contentType: "application/pdf" },
      };
    }),
  };
}

function buildEnv(r2: ReturnType<typeof makeR2> | null, overrides?: Partial<Bindings>): Bindings {
  return {
    BETTER_AUTH_SECRET: "fallback-secret",
    DOWNLOAD_LINK_SECRET: SECRET,
    DATABASE_URL: "postgres://test",
    GOOGLE_CLIENT_ID: "g",
    GOOGLE_CLIENT_SECRET: "g",
    APP_URL: "http://localhost:3050",
    ...(r2 ? { R2: r2 as unknown as Bindings["R2"] } : {}),
    ...overrides,
  };
}

function buildApp() {
  return new Hono<AppEnv>().route("/api/public/downloads", downloadsRoutes as never);
}

describe("GET /api/public/downloads/:token", () => {
  it("returns 200 with PDF body for a valid non-expired token", async () => {
    const expiresAt = Date.now() + 3600_000;
    const token = await signDownloadToken("lead-1", "compliance-checklist", expiresAt, SECRET);
    const r2 = makeR2("lead-magnets/compliance-checklist.pdf");
    const app = buildApp();

    const res = await app.request(`/api/public/downloads/${token}`, {}, buildEnv(r2));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("compliance-checklist.pdf");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow, noarchive");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("returns 401 for an expired token", async () => {
    const expiresAt = Date.now() - 1000;
    const token = await signDownloadToken("lead-1", "compliance-checklist", expiresAt, SECRET);
    const r2 = makeR2("lead-magnets/compliance-checklist.pdf");
    const app = buildApp();

    const res = await app.request(`/api/public/downloads/${token}`, {}, buildEnv(r2));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Invalid or expired download link" });
  });

  it("returns 401 for a tampered HMAC", async () => {
    const expiresAt = Date.now() + 3600_000;
    const token = await signDownloadToken("lead-1", "compliance-checklist", expiresAt, SECRET);
    const tampered = token.slice(0, -1) + (token.endsWith("a") ? "b" : "a");
    const r2 = makeR2("lead-magnets/compliance-checklist.pdf");
    const app = buildApp();

    const res = await app.request(`/api/public/downloads/${tampered}`, {}, buildEnv(r2));

    expect(res.status).toBe(401);
  });

  it("returns 401 for a completely invalid token string", async () => {
    const r2 = makeR2("lead-magnets/compliance-checklist.pdf");
    const app = buildApp();

    const res = await app.request(`/api/public/downloads/notavalidtoken`, {}, buildEnv(r2));

    expect(res.status).toBe(401);
  });

  it("returns 404 when the object is not found in R2", async () => {
    const expiresAt = Date.now() + 3600_000;
    const token = await signDownloadToken("lead-1", "compliance-checklist", expiresAt, SECRET);
    // Pass null key so get() always returns null
    const r2 = makeR2(null);
    const app = buildApp();

    const res = await app.request(`/api/public/downloads/${token}`, {}, buildEnv(r2));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "File not found" });
  });

  it("falls back to BETTER_AUTH_SECRET when DOWNLOAD_LINK_SECRET is absent", async () => {
    const fallbackSecret = "fallback-secret";
    const expiresAt = Date.now() + 3600_000;
    const token = await signDownloadToken("lead-1", "grant-guide", expiresAt, fallbackSecret);
    const r2 = makeR2("lead-magnets/grant-guide.pdf");
    const app = buildApp();

    const env = buildEnv(r2, {
      BETTER_AUTH_SECRET: fallbackSecret,
      DOWNLOAD_LINK_SECRET: undefined,
    });

    const res = await app.request(`/api/public/downloads/${token}`, {}, env);
    expect(res.status).toBe(200);
  });

  it("returns 401 when no R2 binding and token is invalid", async () => {
    const app = buildApp();
    const res = await app.request(`/api/public/downloads/badtoken`, {}, buildEnv(null));
    expect(res.status).toBe(401);
  });

  it("returns 404 when no R2 binding but token is valid", async () => {
    const expiresAt = Date.now() + 3600_000;
    const token = await signDownloadToken("lead-1", "my-magnet", expiresAt, SECRET);
    const app = buildApp();
    const res = await app.request(`/api/public/downloads/${token}`, {}, buildEnv(null));
    expect(res.status).toBe(404);
  });

  it("serves an xlsx lead magnet with the spreadsheet content type and extension", async () => {
    const expiresAt = Date.now() + 3600_000;
    const token = await signDownloadToken("lead-1", "grant-tracking-template", expiresAt, SECRET);
    const r2 = makeR2("lead-magnets/grant-tracking-template.xlsx");
    const app = buildApp();

    const res = await app.request(`/api/public/downloads/${token}`, {}, buildEnv(r2));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("content-disposition")).toContain("grant-tracking-template.xlsx");
  });

  it("sanitizes unsafe characters in the slug before setting Content-Disposition", async () => {
    const unsafeSlug = 'my"slug;name';
    const expiresAt = Date.now() + 3600_000;
    const token = await signDownloadToken("lead-1", unsafeSlug, expiresAt, SECRET);
    const r2 = makeR2(`lead-magnets/${unsafeSlug}.pdf`);
    const app = buildApp();

    const res = await app.request(`/api/public/downloads/${token}`, {}, buildEnv(r2));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="my-slug-name.pdf"');
  });
});

describe("GET /api/public/downloads/file/:slug (ungated public download)", () => {
  it("returns 200 with the PDF content type for a known pdf slug", async () => {
    const r2 = makeR2("lead-magnets/grant-compliance-checklist.pdf");
    const app = buildApp();

    const res = await app.request(
      "/api/public/downloads/file/grant-compliance-checklist",
      {},
      buildEnv(r2),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(
      'inline; filename="grant-compliance-checklist.pdf"',
    );
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
  });

  it("returns 200 with the xlsx content type for a known xlsx slug", async () => {
    const r2 = makeR2("lead-magnets/grant-tracking-template.xlsx");
    const app = buildApp();

    const res = await app.request(
      "/api/public/downloads/file/grant-tracking-template",
      {},
      buildEnv(r2),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("content-disposition")).toBe(
      'inline; filename="grant-tracking-template.xlsx"',
    );
  });

  it("returns 404 for an unknown slug without touching R2", async () => {
    const r2 = makeR2("lead-magnets/grant-compliance-checklist.pdf");
    const app = buildApp();

    const res = await app.request("/api/public/downloads/file/not-a-real-slug", {}, buildEnv(r2));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "File not found" });
    expect(r2.get).not.toHaveBeenCalled();
  });

  it("returns 404 when the object is missing from R2 for a known slug", async () => {
    const r2 = makeR2(null);
    const app = buildApp();

    const res = await app.request(
      "/api/public/downloads/file/grant-compliance-checklist",
      {},
      buildEnv(r2),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "File not found" });
  });

  it("returns 404 when there is no R2 binding for a known slug", async () => {
    const app = buildApp();

    const res = await app.request(
      "/api/public/downloads/file/grant-compliance-checklist",
      {},
      buildEnv(null),
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "File not found" });
  });
});
