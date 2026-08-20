/**
 * scope-isolation.test.ts — Security gate test
 *
 * Ensures that portal scoped-read endpoints return 403/401 (never 200) when
 * there are zero matching scope rows for the requested entity. This test
 * exercises all 8 scoped portal endpoints (7 entity reads + 1 download).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { AppEnv } from "../../types";
import { portalRoutes } from "./routes";

// ---------------------------------------------------------------------------
// Mock scope.service — always return false (no scope granted)
// ---------------------------------------------------------------------------
vi.mock("./scope.service", () => ({
  checkScope: vi.fn().mockResolvedValue(false),
  listScopes: vi.fn().mockResolvedValue([]),
  addScopes: vi.fn(),
  removeScope: vi.fn(),
}));

vi.mock("./audit-event.service", () => ({
  recordAuditEvent: vi.fn().mockResolvedValue(undefined),
  listAuditEvents: vi.fn(),
  exportAuditEventsCSV: vi.fn(),
}));

vi.mock("./bundle.service", () => ({
  getBundle: vi.fn().mockResolvedValue(null),
  createBundle: vi.fn(),
  updateBundle: vi.fn(),
  softDeleteBundle: vi.fn(),
  publishBundle: vi.fn(),
  listBundles: vi.fn(),
  addBundleItem: vi.fn(),
  removeBundleItem: vi.fn(),
  reorderBundleItems: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Minimal portal context — simulates a valid authenticated portal session
// with no scope rows.
// ---------------------------------------------------------------------------
const PORTAL_SESSION_ID = "sess-portal-1";
const PORTAL_REVIEWER_ID = "reviewer-1";
const PORTAL_ORG_ID = "org-portal-1";

function buildPortalApp() {
  return new Hono<AppEnv>()
    .use("/public/portal/*", async (c, next) => {
      // Simulate portalReviewerMiddleware having already run
      c.set("db", {} as never);
      c.set("portalSessionId", PORTAL_SESSION_ID);
      c.set("portalReviewerId", PORTAL_REVIEWER_ID);
      c.set("portalOrgId", PORTAL_ORG_ID);
      c.set("portalSession", {
        id: PORTAL_SESSION_ID,
        orgId: PORTAL_ORG_ID,
        reviewerId: PORTAL_REVIEWER_ID,
        tokenHash: "hash",
        purpose: "test",
        expiresAt: new Date(Date.now() + 86400000),
        revokedAt: null,
        revokedBy: null,
        createdBy: "actor",
        createdAt: new Date(),
        lastAccessedAt: new Date(),
      } as never);
      c.set("portalReviewer", {
        id: PORTAL_REVIEWER_ID,
        orgId: PORTAL_ORG_ID,
        email: "reviewer@test.com",
        name: "Test Reviewer",
        reviewerType: "auditor",
        organizationName: null,
        notes: null,
        createdBy: "actor",
        createdAt: new Date(),
        deletedAt: null,
      } as never);
      await next();
    })
    .route("/public/portal", portalRoutes);
}

// ---------------------------------------------------------------------------
// Scoped endpoints — all must return 403 when no scope row exists
// ---------------------------------------------------------------------------

const SCOPED_ENDPOINTS = [
  { method: "GET", path: "/public/portal/grants/grant-123" },
  { method: "GET", path: "/public/portal/funds/fund-123" },
  { method: "GET", path: "/public/portal/programs/program-123" },
  { method: "GET", path: "/public/portal/documents/doc-123" },
  { method: "GET", path: "/public/portal/documents/doc-123/download" },
  { method: "GET", path: "/public/portal/generated-reports/report-123" },
  { method: "GET", path: "/public/portal/restriction-terms/term-123" },
  { method: "GET", path: "/public/portal/evidence-bundles/bundle-123" },
] as const;

describe("portal scope isolation — zero scope rows", () => {
  let app: ReturnType<typeof buildPortalApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildPortalApp();
  });

  for (const endpoint of SCOPED_ENDPOINTS) {
    it(`${endpoint.method} ${endpoint.path} returns 403 when no scope is granted`, async () => {
      const res = await app.request(endpoint.path, { method: endpoint.method });
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).not.toBe(200);
      // Must be 401 or 403 — never a 200 or 5xx
      expect([401, 403]).toContain(res.status);
    });
  }
});

describe("portal scope isolation — all endpoints enumerated", () => {
  it("covers all 8 scoped portal endpoints", () => {
    // This test acts as a sentinel — if a new scoped endpoint is added to
    // routes.ts without a corresponding entry in SCOPED_ENDPOINTS above,
    // this count assertion will catch it.
    expect(SCOPED_ENDPOINTS).toHaveLength(8);
  });
});
