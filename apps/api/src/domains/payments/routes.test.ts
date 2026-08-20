import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { ANALYTICS_EVENTS, getMinimumPlanForFeatures, type PermissionMap } from "@grantpipe/shared";
import type { AppEnv } from "../../types";
import { errorHandler } from "../../middleware/error-handler";
import { paymentRoutes } from "./routes";

const { mockCaptureAnalytics, mockCaptureBackgroundException, mockRequiredPlanTiers } = vi.hoisted(
  () => ({
    mockCaptureAnalytics: vi.fn(),
    mockCaptureBackgroundException: vi.fn(),
    mockRequiredPlanTiers: [] as string[],
  }),
);

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(() => ({
    analytics: {
      capture: mockCaptureAnalytics,
    },
  })),
}));

vi.mock("./request.service", () => ({
  listPaymentRequests: vi.fn(),
  getOutstandingSummary: vi.fn(),
  getPaymentRequest: vi.fn(),
  createPaymentRequest: vi.fn(),
  updatePaymentRequest: vi.fn(),
  deletePaymentRequest: vi.fn(),
  transitionPaymentRequest: vi.fn(),
  recalcRequestAmounts: vi.fn(),
}));

vi.mock("./line.service", () => ({
  addLine: vi.fn(),
  updateLine: vi.fn(),
  removeLine: vi.fn(),
  listEligibleExpenses: vi.fn(),
  createAdjustment: vi.fn(),
}));

vi.mock("./payment.service", () => ({
  recordPayment: vi.fn(),
  removePayment: vi.fn(),
  listPayments: vi.fn(),
}));

vi.mock("./indirect.service", () => ({
  listIndirectCostRules: vi.fn(),
  createIndirectCostRule: vi.fn(),
  updateIndirectCostRule: vi.fn(),
  deleteIndirectCostRule: vi.fn(),
  computeIndirectLine: vi.fn(),
}));

vi.mock("./ug-guardrails.service", () => ({
  evaluateUniformGuidanceCostGuardrails: vi.fn(),
}));

vi.mock("./evidence.service", () => ({
  getEvidenceManifest: vi.fn(),
  getGrantPaymentSummary: vi.fn(),
  renderEvidencePacketPdf: vi.fn(),
}));

vi.mock("./cash-flow.service", () => ({
  getReimbursementCashFlowRadar: vi.fn(),
}));

vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

vi.mock("../../middleware/paywall", () => ({
  requirePlanTier: vi.fn((tier: string) => {
    mockRequiredPlanTiers.push(tier);
    return async (_c: unknown, next: () => Promise<void>) => next();
  }),
  requireActiveBilling: vi.fn(() => async (_c: unknown, next: () => Promise<void>) => next()),
}));

import {
  listPaymentRequests,
  getPaymentRequest,
  createPaymentRequest,
  updatePaymentRequest,
  deletePaymentRequest,
  transitionPaymentRequest,
  getOutstandingSummary,
} from "./request.service";
import {
  addLine,
  updateLine,
  removeLine,
  listEligibleExpenses,
  createAdjustment,
} from "./line.service";
import { listPayments, recordPayment, removePayment } from "./payment.service";
import {
  listIndirectCostRules,
  createIndirectCostRule,
  updateIndirectCostRule,
  deleteIndirectCostRule,
  computeIndirectLine,
} from "./indirect.service";
import { evaluateUniformGuidanceCostGuardrails } from "./ug-guardrails.service";
import {
  getEvidenceManifest,
  getGrantPaymentSummary,
  renderEvidencePacketPdf,
} from "./evidence.service";
import { getReimbursementCashFlowRadar } from "./cash-flow.service";
import { badRequest } from "../../lib/app-error";

function makeApp(
  role: "admin" | "editor" | "viewer" | "auditor" = "admin",
  planTier: string = "audit_ready",
  permissions: Partial<PermissionMap> | null = null,
) {
  return new Hono<AppEnv>()
    .onError(errorHandler)
    .use("/payments/*", async (c, next) => {
      c.set("db", { db: true } as never);
      c.set("orgId", "org-1");
      c.set("entityId", "entity-1");
      c.set("user", { id: "user-1", email: "user@example.com" } as AppEnv["Variables"]["user"]);
      c.set("session", { id: "sess-1", userId: "user-1" });
      c.set("memberRole", role);
      c.set("memberPermissions", permissions as PermissionMap | null);
      c.set("orgSubscription", { planTier } as never);
      await next();
    })
    .route("/payments", paymentRoutes);
}

const mockRequest = {
  id: "req-1",
  orgId: "org-1",
  grantId: "grant-1",
  type: "reimbursement",
  status: "draft",
  requestedAmountCents: 5000,
  approvedAmountCents: 0,
  paidAmountCents: 0,
  outstandingCents: 0,
  lines: [],
  adjustments: [],
  payments: [],
};

describe("payment routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockCaptureAnalytics.mockResolvedValue(undefined);
  });

  it("routes indirect rules and evidence packets at the entitlement matrix minimum tier", () => {
    makeApp();

    expect(getMinimumPlanForFeatures(["hasIndirectCostRules"])).toBe("growth");
    expect(getMinimumPlanForFeatures(["hasPaymentEvidencePackage"])).toBe("growth");

    expect(mockRequiredPlanTiers).not.toContain("audit_ready");
  });

  it("returns the reimbursement cash-flow radar scoped to the current organization", async () => {
    vi.mocked(getReimbursementCashFlowRadar).mockResolvedValue({
      totals: {
        eligibleExpenseCents: 45000,
        unrequestedExpenseCents: 30000,
        submittedCents: 10000,
        approvedOutstandingCents: 5000,
        totalCashGapCents: 45000,
        criticalCount: 1,
        warningCount: 0,
      },
      worklist: [],
    });

    const res = await makeApp().request("/payments/cash-flow-radar");
    const body = (await res.json()) as {
      totals: { totalCashGapCents: number };
    };

    expect(res.status).toBe(200);
    expect(getReimbursementCashFlowRadar).toHaveBeenCalledWith(
      { db: true },
      { orgId: "org-1", entityId: "entity-1" },
    );
    expect(body.totals.totalCashGapCents).toBe(45000);
  });

  it("captures privacy-safe payment lifecycle events", async () => {
    vi.mocked(createPaymentRequest).mockResolvedValue(mockRequest as never);
    vi.mocked(updatePaymentRequest).mockResolvedValue(mockRequest as never);
    vi.mocked(deletePaymentRequest).mockResolvedValue(undefined as never);
    vi.mocked(transitionPaymentRequest).mockResolvedValue({
      ...mockRequest,
      status: "submitted",
    } as never);
    vi.mocked(addLine).mockResolvedValue({ id: "line-1" } as never);
    vi.mocked(updateLine).mockResolvedValue({ id: "line-1" } as never);
    vi.mocked(removeLine).mockResolvedValue(undefined as never);
    vi.mocked(createAdjustment).mockResolvedValue({ id: "adj-1" } as never);
    vi.mocked(recordPayment).mockResolvedValue({ id: "pay-1" } as never);
    vi.mocked(removePayment).mockResolvedValue(undefined as never);
    vi.mocked(computeIndirectLine).mockResolvedValue({ computedAmountCents: 1000 } as never);
    vi.mocked(createIndirectCostRule).mockResolvedValue({ id: "rule-1" } as never);
    vi.mocked(updateIndirectCostRule).mockResolvedValue({ id: "rule-1" } as never);
    vi.mocked(deleteIndirectCostRule).mockResolvedValue(undefined as never);
    vi.mocked(evaluateUniformGuidanceCostGuardrails).mockResolvedValue({
      applicable: true,
      status: "warning",
      findingCount: 1,
      findings: [
        {
          code: "mtdc_subaward_cap",
          severity: "warning",
          title: "MTDC subaward cap",
          message: "Only the first $50,000 of each subaward can be included in MTDC.",
          source: "expense",
        },
      ],
      regulatoryFacts: {
        deMinimisRatePercent: 15,
        mtdcSubawardCapCents: 5_000_000,
        equipmentThresholdCents: 1_000_000,
      },
    } as never);

    const app = makeApp();

    await app.request("/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId: "grant-1", type: "reimbursement" }),
    });
    await app.request("/payments/req-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Updated" }),
    });
    await app.request("/payments/req-1/transitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStatus: "submitted", fromStatus: "draft" }),
    });
    await app.request("/payments/req-1/lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: 5000, category: "direct" }),
    });
    await app.request("/payments/req-1/lines/line-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: 7500 }),
    });
    await app.request("/payments/req-1/adjustments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "reduction", amountCents: 500, reason: "Partial approval" }),
    });
    await app.request("/payments/req-1/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receivedDate: "2026-05-01T00:00:00.000Z", amountCents: 10000 }),
    });
    await app.request("/payments/req-1/indirect/recompute", { method: "POST" });
    await app.request("/payments/req-1/ug-guardrails/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: 6000000, category: "direct" }),
    });
    await app.request("/payments/indirect-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base: "direct_costs",
        rateBasisPoints: 1000,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      }),
    });
    await app.request("/payments/indirect-rules/rule-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rateBasisPoints: 1500 }),
    });
    await app.request("/payments/indirect-rules/rule-1", { method: "DELETE" });
    await app.request("/payments/req-1/payments/pay-1", { method: "DELETE" });
    await app.request("/payments/req-1/lines/line-1", { method: "DELETE" });
    await app.request("/payments/req-1", { method: "DELETE" });

    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.paymentRequestCreated,
      payload: {
        actorId: "user-1",
        entity_type: "payment_request",
        request_type: "reimbursement",
        auto_post_journal_entry: true,
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.paymentRequestTransitioned,
      payload: {
        actorId: "user-1",
        entity_type: "payment_request",
        from_status: "draft",
        to_status: "submitted",
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.paymentRequestLineAdded,
      payload: { actorId: "user-1", entity_type: "payment_request_line" },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.paymentRequestPaymentRecorded,
      payload: { actorId: "user-1", entity_type: "payment_request_payment" },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.uniformGuidanceGuardrailsPreviewed,
      payload: {
        actorId: "user-1",
        entity_type: "payment_request_line",
        result_status: "warning",
        finding_count: 1,
      },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.indirectCostRuleCreated,
      payload: { actorId: "user-1", entity_type: "indirect_cost_rule", base: "direct_costs" },
    });
    expect(mockCaptureAnalytics).toHaveBeenCalledWith({
      orgId: "org-1",
      eventName: ANALYTICS_EVENTS.paymentRequestDeleted,
      payload: { actorId: "user-1", entity_type: "payment_request" },
    });

    const serializedCalls = JSON.stringify(mockCaptureAnalytics.mock.calls);
    expect(serializedCalls).not.toContain("grant-1");
    expect(serializedCalls).not.toContain("req-1");
    expect(serializedCalls).not.toContain("line-1");
    expect(serializedCalls).not.toContain("pay-1");
    expect(serializedCalls).not.toContain("rule-1");
    expect(serializedCalls).not.toContain("Partial approval");
    expect(serializedCalls).not.toContain("Subrecipient agreement");
  });

  it("GET /payments calls listPaymentRequests and returns 200", async () => {
    vi.mocked(listPaymentRequests).mockResolvedValue({ data: [mockRequest], total: 1 } as never);
    const app = makeApp();

    const res = await app.request("/payments");

    expect(res.status).toBe(200);
    expect(listPaymentRequests).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", entityId: "entity-1" }),
    );
  });

  it("GET /payments/outstanding-summary calls getOutstandingSummary and returns 200", async () => {
    vi.mocked(getOutstandingSummary).mockResolvedValue({
      totalOutstandingCents: 10000,
      requestCount: 3,
    } as never);
    const app = makeApp();

    const res = await app.request("/payments/outstanding-summary");

    expect(res.status).toBe(200);
    expect(getOutstandingSummary).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", entityId: "entity-1" }),
    );
  });

  it("POST /payments calls createPaymentRequest and returns 201", async () => {
    vi.mocked(createPaymentRequest).mockResolvedValue(mockRequest as never);
    const app = makeApp();

    const res = await app.request("/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId: "grant-1", type: "reimbursement" }),
    });

    expect(res.status).toBe(201);
    expect(createPaymentRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", actorId: "user-1", grantId: "grant-1" }),
    );
  });

  it("POST /payments defaults auto posting on for Audit-Ready requests when omitted", async () => {
    vi.mocked(createPaymentRequest).mockResolvedValue(mockRequest as never);
    const app = makeApp("editor", "audit_ready", { payments: "edit" });

    const res = await app.request("/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId: "grant-1", type: "reimbursement" }),
    });

    expect(res.status).toBe(201);
    expect(createPaymentRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ autoPostJournalEntry: true }),
    );
  });

  it("POST /payments leaves auto posting off for Growth requests when omitted", async () => {
    vi.mocked(createPaymentRequest).mockResolvedValue(mockRequest as never);
    const app = makeApp("editor", "growth", { payments: "edit" });

    const res = await app.request("/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId: "grant-1", type: "reimbursement" }),
    });

    expect(res.status).toBe(201);
    expect(createPaymentRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ autoPostJournalEntry: false }),
    );
  });

  it("POST /payments honors explicit Audit-Ready auto-post opt out", async () => {
    vi.mocked(createPaymentRequest).mockResolvedValue(mockRequest as never);
    const app = makeApp("editor", "audit_ready", { payments: "edit" });

    const res = await app.request("/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grantId: "grant-1",
        type: "reimbursement",
        autoPostJournalEntry: false,
      }),
    });

    expect(res.status).toBe(201);
    expect(createPaymentRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ autoPostJournalEntry: false }),
    );
  });

  it("GET /payments/grants/grant-1/summary calls getGrantPaymentSummary and returns 200", async () => {
    vi.mocked(getGrantPaymentSummary).mockResolvedValue({
      grantId: "grant-1",
      totalRequestedCents: 50000,
    } as never);
    const app = makeApp();

    const res = await app.request("/payments/grants/grant-1/summary");

    expect(res.status).toBe(200);
    expect(getGrantPaymentSummary).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", grantId: "grant-1" }),
    );
  });

  it("GET /payments/req-1 calls getPaymentRequest and returns 200", async () => {
    vi.mocked(getPaymentRequest).mockResolvedValue(mockRequest as never);
    const app = makeApp();

    const res = await app.request("/payments/req-1");

    expect(res.status).toBe(200);
    expect(getPaymentRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", requestId: "req-1" }),
    );
  });

  it("PATCH /payments/req-1 calls updatePaymentRequest and returns 200", async () => {
    vi.mocked(updatePaymentRequest).mockResolvedValue({
      ...mockRequest,
      notes: "Updated",
    } as never);
    const app = makeApp();

    const res = await app.request("/payments/req-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Updated" }),
    });

    expect(res.status).toBe(200);
    expect(updatePaymentRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", actorId: "user-1", requestId: "req-1" }),
    );
  });

  it("DELETE /payments/req-1 calls deletePaymentRequest and returns 200", async () => {
    vi.mocked(deletePaymentRequest).mockResolvedValue(undefined as never);
    const app = makeApp();

    const res = await app.request("/payments/req-1", { method: "DELETE" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(deletePaymentRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", actorId: "user-1", requestId: "req-1" }),
    );
  });

  it("returns 403 for editor role on DELETE /payments/req-1", async () => {
    const app = makeApp("editor");

    const res = await app.request("/payments/req-1", { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(deletePaymentRequest).not.toHaveBeenCalled();
  });

  it("POST /payments/req-1/transitions calls transitionPaymentRequest and returns 200", async () => {
    vi.mocked(transitionPaymentRequest).mockResolvedValue({
      ...mockRequest,
      status: "submitted",
    } as never);
    const app = makeApp();

    const res = await app.request("/payments/req-1/transitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toStatus: "submitted", fromStatus: "draft" }),
    });

    expect(res.status).toBe(200);
    expect(transitionPaymentRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        transition: expect.objectContaining({ toStatus: "submitted", fromStatus: "draft" }),
      }),
    );
  });

  it("POST /payments/req-1/lines calls addLine and returns 201", async () => {
    vi.mocked(addLine).mockResolvedValue({ id: "line-1", amountCents: 5000 } as never);
    const app = makeApp();

    const res = await app.request("/payments/req-1/lines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: 5000, category: "direct" }),
    });

    expect(res.status).toBe(201);
    expect(addLine).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", actorId: "user-1", requestId: "req-1" }),
    );
  });

  it("PATCH /payments/req-1/lines/line-1 calls updateLine and returns 200", async () => {
    vi.mocked(updateLine).mockResolvedValue({ id: "line-1", amountCents: 7500 } as never);
    const app = makeApp();

    const res = await app.request("/payments/req-1/lines/line-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCents: 7500 }),
    });

    expect(res.status).toBe(200);
    expect(updateLine).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        lineId: "line-1",
      }),
    );
  });

  it("DELETE /payments/req-1/lines/line-1 calls removeLine and returns 200", async () => {
    vi.mocked(removeLine).mockResolvedValue(undefined as never);
    const app = makeApp();

    const res = await app.request("/payments/req-1/lines/line-1", { method: "DELETE" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(removeLine).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        lineId: "line-1",
      }),
    );
  });

  it("returns 403 for editor role on DELETE /payments/req-1/lines/line-1", async () => {
    const app = makeApp("editor");

    const res = await app.request("/payments/req-1/lines/line-1", { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(removeLine).not.toHaveBeenCalled();
  });

  it("GET /payments/req-1/eligible-expenses calls getPaymentRequest then listEligibleExpenses and returns 200", async () => {
    vi.mocked(getPaymentRequest).mockResolvedValue({ id: "req-1", grantId: "grant-1" } as never);
    vi.mocked(listEligibleExpenses).mockResolvedValue([] as never);
    const app = makeApp();

    const res = await app.request("/payments/req-1/eligible-expenses");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: [] });
    expect(getPaymentRequest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", requestId: "req-1" }),
    );
    expect(listEligibleExpenses).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", grantId: "grant-1", requestId: "req-1" }),
    );
  });

  it("POST /payments/req-1/adjustments calls createAdjustment and returns 201", async () => {
    vi.mocked(createAdjustment).mockResolvedValue({ id: "adj-1" } as never);
    const app = makeApp();

    const res = await app.request("/payments/req-1/adjustments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "reduction", amountCents: 500, reason: "Partial approval" }),
    });

    expect(res.status).toBe(201);
    expect(createAdjustment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", actorId: "user-1", requestId: "req-1" }),
    );
  });

  it("POST /payments/req-1/payments calls recordPayment and returns 201", async () => {
    vi.mocked(recordPayment).mockResolvedValue({ id: "pay-1" } as never);
    const app = makeApp();

    const res = await app.request("/payments/req-1/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        receivedDate: "2026-05-01T00:00:00.000Z",
        amountCents: 10000,
      }),
    });

    expect(res.status).toBe(201);
    expect(recordPayment).toHaveBeenCalledWith(
      expect.objectContaining({ db: true }),
      // c.env is undefined in test context
      undefined,
      expect.objectContaining({ orgId: "org-1", actorId: "user-1", requestId: "req-1" }),
    );
  });

  it("GET /payments/req-1/payments calls listPayments and returns 200", async () => {
    vi.mocked(listPayments).mockResolvedValue([{ id: "pay-1", amountCents: 10000 }] as never);
    const app = makeApp();

    const res = await app.request("/payments/req-1/payments");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [{ id: "pay-1", amountCents: 10000 }] });
    expect(listPayments).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", requestId: "req-1" }),
    );
  });

  it("DELETE /payments/req-1/payments/pay-1 calls removePayment and returns 200", async () => {
    vi.mocked(removePayment).mockResolvedValue(undefined as never);
    const app = makeApp();

    const res = await app.request("/payments/req-1/payments/pay-1", { method: "DELETE" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(removePayment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        requestId: "req-1",
        paymentId: "pay-1",
      }),
    );
  });

  it("returns 403 for editor role on DELETE /payments/req-1/payments/pay-1", async () => {
    const app = makeApp("editor");

    const res = await app.request("/payments/req-1/payments/pay-1", { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(removePayment).not.toHaveBeenCalled();
  });

  it("POST /payments/req-1/indirect/recompute calls computeIndirectLine and returns 200", async () => {
    vi.mocked(computeIndirectLine).mockResolvedValue({
      computedAmountCents: 1000,
    } as never);
    const app = makeApp();

    const res = await app.request("/payments/req-1/indirect/recompute", { method: "POST" });

    expect(res.status).toBe(200);
    expect(computeIndirectLine).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", requestId: "req-1" }),
    );
  });

  it("POST /payments/req-1/ug-guardrails/preview evaluates Uniform Guidance guardrails and returns findings", async () => {
    vi.mocked(evaluateUniformGuidanceCostGuardrails).mockResolvedValue({
      applicable: true,
      status: "blocked",
      findingCount: 1,
      findings: [
        {
          code: "unallowable_budget_line",
          severity: "block",
          title: "Unallowable budget line",
          message: "This budget line is marked unallowable for the award.",
          source: "budget_line",
        },
      ],
      regulatoryFacts: {
        deMinimisRatePercent: 15,
        mtdcSubawardCapCents: 5_000_000,
        equipmentThresholdCents: 1_000_000,
      },
    } as never);
    const app = makeApp("editor", "audit_ready", { payments: "edit" });

    const res = await app.request("/payments/req-1/ug-guardrails/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budgetLineId: "budget-line-1",
        amountCents: 25000,
        category: "direct",
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      applicable: true,
      status: "blocked",
      findingCount: 1,
    });
    expect(evaluateUniformGuidanceCostGuardrails).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        requestId: "req-1",
        data: expect.objectContaining({ budgetLineId: "budget-line-1" }),
      }),
    );
  });

  it("POST /payments/req-1/ug-guardrails/preview records expected failures without Sentry capture", async () => {
    vi.mocked(evaluateUniformGuidanceCostGuardrails).mockRejectedValue(
      badRequest("Budget line not found"),
    );
    const app = makeApp("editor", "audit_ready", { payments: "edit" });

    const res = await app.request("/payments/req-1/ug-guardrails/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        budgetLineId: "budget-line-1",
        amountCents: 25000,
        category: "direct",
        sortOrder: 0,
      }),
    });

    expect(res.status).toBe(400);
    expect(mockCaptureAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: ANALYTICS_EVENTS.paymentOperationFailed,
        payload: expect.objectContaining({
          entity_type: "payment_request_line",
          operation: "uniform_guidance_guardrail_preview",
        }),
      }),
    );
    expect(mockCaptureBackgroundException).not.toHaveBeenCalled();
  });

  it("GET /payments/req-1/packet calls getEvidenceManifest and returns 200", async () => {
    vi.mocked(getEvidenceManifest).mockResolvedValue({ requestId: "req-1", items: [] } as never);
    const app = makeApp();

    const res = await app.request("/payments/req-1/packet");

    expect(res.status).toBe(200);
    expect(getEvidenceManifest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", requestId: "req-1" }),
    );
  });

  it("GET /payments/req-1/packet.pdf returns a downloadable evidence PDF", async () => {
    const manifest = {
      request: { id: "req-1", requestNumber: 42 },
      lines: [],
      adjustments: [],
      payments: [],
      activityHistory: [],
      linkedDocuments: [],
      generatedAt: "2026-05-26T00:00:00.000Z",
    };
    vi.mocked(getEvidenceManifest).mockResolvedValue(manifest as never);
    vi.mocked(renderEvidencePacketPdf).mockReturnValue(
      new TextEncoder().encode("%PDF-1.4\nbody\n%%EOF\n") as never,
    );
    const app = makeApp();

    const res = await app.request("/payments/req-1/packet.pdf");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="payment-request-42-evidence-packet.pdf"',
    );
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await res.text()).startsWith("%PDF-1.4")).toBe(true);
    expect(getEvidenceManifest).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", requestId: "req-1" }),
    );
    expect(renderEvidencePacketPdf).toHaveBeenCalledWith(manifest);
  });

  it("GET /payments/req-1/packet.pdf falls back to a safe packet filename", async () => {
    vi.mocked(getEvidenceManifest).mockResolvedValue({
      request: { id: "!!!" },
      lines: [],
      adjustments: [],
      payments: [],
      activityHistory: [],
      linkedDocuments: [],
      generatedAt: "2026-05-26T00:00:00.000Z",
    } as never);
    vi.mocked(renderEvidencePacketPdf).mockReturnValue(
      new TextEncoder().encode("%PDF-1.4\nbody\n%%EOF\n") as never,
    );
    const app = makeApp();

    const res = await app.request("/payments/req-1/packet.pdf");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="payment-request-packet-evidence-packet.pdf"',
    );
  });

  it("GET /payments/indirect-rules calls listIndirectCostRules and returns 200", async () => {
    vi.mocked(listIndirectCostRules).mockResolvedValue([] as never);
    const app = makeApp();

    const res = await app.request("/payments/indirect-rules");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: [] });
    expect(listIndirectCostRules).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1" }),
    );
  });

  it("POST /payments/indirect-rules calls createIndirectCostRule and returns 201", async () => {
    vi.mocked(createIndirectCostRule).mockResolvedValue({ id: "rule-1" } as never);
    const app = makeApp();

    const res = await app.request("/payments/indirect-rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base: "direct_costs",
        rateBasisPoints: 1000,
        effectiveFrom: "2026-01-01T00:00:00.000Z",
      }),
    });

    expect(res.status).toBe(201);
    expect(createIndirectCostRule).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", actorId: "user-1" }),
    );
  });

  it("PATCH /payments/indirect-rules/rule-1 calls updateIndirectCostRule and returns 200", async () => {
    vi.mocked(updateIndirectCostRule).mockResolvedValue({ id: "rule-1" } as never);
    const app = makeApp();

    const res = await app.request("/payments/indirect-rules/rule-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rateBasisPoints: 1500 }),
    });

    expect(res.status).toBe(200);
    expect(updateIndirectCostRule).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        ruleId: "rule-1",
      }),
    );
  });

  it("DELETE /payments/indirect-rules/rule-1 calls deleteIndirectCostRule and returns 200", async () => {
    vi.mocked(deleteIndirectCostRule).mockResolvedValue(undefined as never);
    const app = makeApp();

    const res = await app.request("/payments/indirect-rules/rule-1", { method: "DELETE" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(deleteIndirectCostRule).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", actorId: "user-1", ruleId: "rule-1" }),
    );
  });

  it("returns 403 for editor role on DELETE /payments/indirect-rules/rule-1", async () => {
    const app = makeApp("editor");

    const res = await app.request("/payments/indirect-rules/rule-1", { method: "DELETE" });

    expect(res.status).toBe(403);
    expect(deleteIndirectCostRule).not.toHaveBeenCalled();
  });

  it("returns 403 for viewer role on POST /payments (create request)", async () => {
    const app = makeApp("viewer", "audit_ready", { payments: "view" });

    const res = await app.request("/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grantId: "grant-1", type: "reimbursement" }),
    });

    expect(res.status).toBe(403);
    expect(createPaymentRequest).not.toHaveBeenCalled();
  });

  it("returns 403 for viewer role on PATCH /:id", async () => {
    const app = makeApp("viewer", "audit_ready", { payments: "view" });

    const res = await app.request("/payments/req-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Updated" }),
    });

    expect(res.status).toBe(403);
    expect(updatePaymentRequest).not.toHaveBeenCalled();
  });

  it("returns 400 for POST /payments with missing required fields", async () => {
    const app = makeApp();

    const res = await app.request("/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Missing grantId and type" }),
    });

    expect(res.status).toBe(400);
    expect(createPaymentRequest).not.toHaveBeenCalled();
  });
});
