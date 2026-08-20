import { describe, expect, it } from "vitest";
import { ANALYTICS_EVENTS } from "../packages/shared/src/constants/analytics";
import {
  POSTHOG_DASHBOARDS,
  buildDashboardPlan,
  buildInsightPayload,
  buildPostHogApiUrl,
  getUncoveredAnalyticsEvents,
  parseArgs,
} from "./posthog-dashboards";

describe("PostHog dashboard manifest", () => {
  it("covers every canonical analytics event in a decision dashboard", () => {
    expect(getUncoveredAnalyticsEvents(POSTHOG_DASHBOARDS)).toEqual([]);
  });

  it("groups dashboards around business decisions", () => {
    expect(POSTHOG_DASHBOARDS.map((dashboard) => dashboard.name)).toEqual([
      "GrantPipe - Acquisition and Signup",
      "GrantPipe - Activation and Onboarding",
      "GrantPipe - Product Adoption",
      "GrantPipe - Billing and Retention",
      "GrantPipe - Friction and Support",
      "GrantPipe - Executive Decisions",
    ]);
  });

  it("builds a compact dry-run plan with event coverage counts", () => {
    const plan = buildDashboardPlan(POSTHOG_DASHBOARDS);
    expect(plan.dashboardCount).toBe(6);
    expect(plan.insightCount).toBeGreaterThan(10);
    expect(plan.coveredEventCount).toBe(Object.values(ANALYTICS_EVENTS).length);
    expect(plan.uncoveredEvents).toEqual([]);
  });

  it("builds PostHog API URLs without using ingest hosts", () => {
    expect(buildPostHogApiUrl("https://us.posthog.com/", "123", "/dashboards/")).toBe(
      "https://us.posthog.com/api/environments/123/dashboards/",
    );
  });

  it("creates insight payloads that attach to the target dashboard", () => {
    const payload = buildInsightPayload(42, POSTHOG_DASHBOARDS[0]!.insights[0]!);
    expect(payload.dashboards).toEqual([42]);
    expect(payload.query.kind).toBe("InsightVizNode");
    expect(JSON.stringify(payload)).toContain(ANALYTICS_EVENTS.ctaClicked);
    expect(JSON.stringify(payload)).not.toContain("email");
  });

  it("includes the full document lifecycle in the product adoption dashboard", () => {
    const productDashboard = POSTHOG_DASHBOARDS.find(
      (dashboard) => dashboard.name === "GrantPipe - Product Adoption",
    );
    const documentEvents = productDashboard?.insights
      .find((insight) => insight.name === "Reporting and document workflows")
      ?.events.join(" ");

    expect(documentEvents).toContain(ANALYTICS_EVENTS.documentUploaded);
    expect(documentEvents).toContain(ANALYTICS_EVENTS.documentDownloadClicked);
    expect(documentEvents).toContain(ANALYTICS_EVENTS.documentDeleted);
    expect(documentEvents).toContain(ANALYTICS_EVENTS.documentUploadFailed);
  });

  it("does not include the retired recurring gift dashboard", () => {
    const productDashboard = POSTHOG_DASHBOARDS.find(
      (dashboard) => dashboard.name === "GrantPipe - Product Adoption",
    );
    expect(productDashboard?.insights.map((insight) => insight.name)).not.toContain(
      "Recurring gift engine",
    );
  });

  it("includes the Budget Sentinel journey in product and friction dashboards", () => {
    const productDashboard = POSTHOG_DASHBOARDS.find(
      (dashboard) => dashboard.name === "GrantPipe - Product Adoption",
    );
    const sentinelEvents = productDashboard?.insights
      .find((insight) => insight.name === "Budget Sentinel risk monitoring")
      ?.events.join(" ");
    const frictionDashboard = POSTHOG_DASHBOARDS.find(
      (dashboard) => dashboard.name === "GrantPipe - Friction and Support",
    );
    const failureEvents = frictionDashboard?.insights
      .find((insight) => insight.name === "Product operation failures")
      ?.events.join(" ");

    expect(sentinelEvents).toContain(ANALYTICS_EVENTS.budgetSentinelViewed);
    expect(sentinelEvents).toContain(ANALYTICS_EVENTS.budgetSentinelFilterChanged);
    expect(sentinelEvents).toContain(ANALYTICS_EVENTS.budgetSentinelItemOpened);
    expect(sentinelEvents).toContain(ANALYTICS_EVENTS.budgetSentinelAlertCreated);
    expect(sentinelEvents).toContain(ANALYTICS_EVENTS.budgetSentinelEmailSent);
    expect(failureEvents).toContain(ANALYTICS_EVENTS.budgetSentinelOperationFailed);
  });
});

describe("executive decisions dashboard", () => {
  const dashboard = POSTHOG_DASHBOARDS.find(
    (entry) => entry.name === "GrantPipe - Executive Decisions",
  );
  const insightByName = (name: string) =>
    dashboard?.insights.find((insight) => insight.name === name);

  it("ships the six decision insights", () => {
    expect(dashboard?.insights.map((insight) => insight.name)).toEqual([
      "Leads and signup starts by UTM source",
      "Trial to paid conversion",
      "Subscription revenue trend",
      "AI SDR conversion funnel",
      "Feature stickiness (weekly active users)",
      "New org retention by signup cohort",
    ]);
  });

  it("attributes leads and signup starts to a UTM source breakdown", () => {
    const payload = buildInsightPayload(7, insightByName("Leads and signup starts by UTM source")!);
    expect(payload.query.source.kind).toBe("TrendsQuery");
    expect(payload.query.source.breakdownFilter).toEqual({
      breakdown: "utm_source",
      breakdown_type: "event",
    });
    // signup_completed is captured server-side without utm_source, so attribution stays on the
    // top-of-funnel events that actually carry the source.
    expect(payload.query.source.series?.map((node) => node.event)).toEqual([
      ANALYTICS_EVENTS.leadCreated,
      ANALYTICS_EVENTS.signupStarted,
    ]);
  });

  it("sums subscription revenue by billing cycle", () => {
    const payload = buildInsightPayload(7, insightByName("Subscription revenue trend")!);
    const series = payload.query.source.series ?? [];
    expect(series).toHaveLength(1);
    expect(series[0]).toMatchObject({
      event: ANALYTICS_EVENTS.subscriptionStarted,
      math: "sum",
      math_property: "amount_cents",
    });
    expect(payload.query.source.breakdownFilter?.breakdown).toBe("billing_cycle");
  });

  it("models the trial-to-paid and AI SDR conversion funnels", () => {
    const trial = buildInsightPayload(7, insightByName("Trial to paid conversion")!);
    expect(trial.query.source.kind).toBe("FunnelsQuery");
    expect(trial.query.source.steps?.map((step) => step.event)).toEqual([
      ANALYTICS_EVENTS.trialStarted,
      ANALYTICS_EVENTS.checkoutStarted,
      ANALYTICS_EVENTS.checkoutCompleted,
      ANALYTICS_EVENTS.subscriptionStarted,
    ]);

    const aiSdr = buildInsightPayload(7, insightByName("AI SDR conversion funnel")!);
    expect(aiSdr.query.source.steps?.map((step) => step.event)).toEqual([
      ANALYTICS_EVENTS.aiSdrSessionStarted,
      ANALYTICS_EVENTS.aiSdrDraftGenerated,
      ANALYTICS_EVENTS.aiSdrDraftSent,
    ]);
  });

  it("measures feature stickiness with weekly active users", () => {
    const payload = buildInsightPayload(
      7,
      insightByName("Feature stickiness (weekly active users)")!,
    );
    expect(payload.query.source.series?.every((node) => node.math === "weekly_active")).toBe(true);
    expect(payload.query.source.series?.some((node) => "math_property" in node)).toBe(false);
    // No breakdown — each event is its own per-feature series (report_generated carries
    // report_type, not entity_type, so an entity_type breakdown would bucket as "(empty)").
    expect(payload.query.source.breakdownFilter).toBeUndefined();
  });

  it("builds a first-time retention query for the signup cohort", () => {
    const payload = buildInsightPayload(7, insightByName("New org retention by signup cohort")!);
    expect(payload.query.source.kind).toBe("RetentionQuery");
    expect(payload.query.source.breakdownFilter).toBeUndefined();
    expect(payload.query.source.retentionFilter).toMatchObject({
      retentionType: "retention_first_time",
      period: "Week",
      totalIntervals: 8,
      targetEntity: { id: ANALYTICS_EVENTS.signupCompleted, type: "events" },
      returningEntity: { id: ANALYTICS_EVENTS.reportGenerated, type: "events" },
    });
  });
});

describe("buildInsightPayload guards", () => {
  it("rejects sum math without a math property", () => {
    expect(() =>
      buildInsightPayload(1, {
        name: "Bad sum",
        description: "missing math property",
        kind: "trends",
        math: "sum",
        events: [ANALYTICS_EVENTS.subscriptionStarted],
      }),
    ).toThrow('Trends insight "Bad sum" uses sum math without a mathProperty.');
  });

  it("rejects a retention insight without a retention spec", () => {
    expect(() =>
      buildInsightPayload(1, {
        name: "Bad retention",
        description: "missing retention spec",
        kind: "retention",
        events: [ANALYTICS_EVENTS.signupCompleted, ANALYTICS_EVENTS.reportGenerated],
      }),
    ).toThrow('Retention insight "Bad retention" is missing a retention spec.');
  });

  it("builds a monthly retention query with six intervals", () => {
    const payload = buildInsightPayload(1, {
      name: "Monthly retention",
      description: "monthly cohort retention",
      kind: "retention",
      events: [ANALYTICS_EVENTS.signupCompleted, ANALYTICS_EVENTS.reportGenerated],
      retention: {
        targetEvent: ANALYTICS_EVENTS.signupCompleted,
        returningEvent: ANALYTICS_EVENTS.reportGenerated,
        period: "Month",
      },
    });
    expect(payload.query.source.retentionFilter).toMatchObject({
      period: "Month",
      totalIntervals: 6,
    });
  });
});

describe("parseArgs", () => {
  it("defaults to dry-run mode", () => {
    expect(parseArgs([])).toEqual({
      apply: false,
      host: "https://us.posthog.com",
      environmentId: undefined,
      apiKey: undefined,
    });
  });

  it("parses apply mode and explicit credentials without printing them", () => {
    expect(
      parseArgs([
        "--apply",
        "--host",
        "https://app.posthog.com",
        "--environment-id",
        "321",
        "--api-key",
        "phx_secret",
      ]),
    ).toEqual({
      apply: true,
      host: "https://app.posthog.com",
      environmentId: "321",
      apiKey: "phx_secret",
    });
  });

  it("rejects unknown flags and missing values", () => {
    expect(() => parseArgs(["--wat"])).toThrow("Unknown argument: --wat");
    expect(() => parseArgs(["--host"])).toThrow("Missing value for --host.");
  });
});
