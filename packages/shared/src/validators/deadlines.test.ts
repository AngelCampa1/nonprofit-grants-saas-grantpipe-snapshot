import { describe, expect, it } from "vitest";
import {
  RADAR_OBLIGATION_KINDS,
  RADAR_OBLIGATION_STATUSES,
  RADAR_URGENCY_BANDS,
  radarObligationKindSchema,
  radarObligationStatusSchema,
  radarUrgencyBandSchema,
  radarQuerySchema,
} from "./deadlines";

describe("radar obligation enums", () => {
  it("exposes the five obligation kinds", () => {
    expect(RADAR_OBLIGATION_KINDS).toEqual([
      "application_deadline",
      "reporting_requirement",
      "closeout_item",
      "restriction_release",
      "period_close",
    ]);
  });

  it("exposes the four obligation statuses", () => {
    expect(RADAR_OBLIGATION_STATUSES).toEqual([
      "overdue",
      "due_today",
      "upcoming",
      "resolved",
    ]);
  });

  it("exposes the five urgency bands", () => {
    expect(RADAR_URGENCY_BANDS).toEqual([
      "overdue",
      "due_today",
      "this_week",
      "this_month",
      "later",
    ]);
  });

  it("validates a known kind and rejects an unknown one", () => {
    expect(radarObligationKindSchema.safeParse("period_close").success).toBe(true);
    expect(radarObligationKindSchema.safeParse("audit_window").success).toBe(false);
  });

  it("validates statuses and bands", () => {
    expect(radarObligationStatusSchema.safeParse("resolved").success).toBe(true);
    expect(radarObligationStatusSchema.safeParse("nope").success).toBe(false);
    expect(radarUrgencyBandSchema.safeParse("this_week").success).toBe(true);
    expect(radarUrgencyBandSchema.safeParse("nope").success).toBe(false);
  });
});

describe("radarQuerySchema", () => {
  it("applies defaults for an empty query", () => {
    const result = radarQuerySchema.parse({});
    expect(result.horizonDays).toBe(90);
    expect(result.includeResolved).toBe(false);
    expect(result.kinds).toBeUndefined();
    expect(result.status).toBeUndefined();
  });

  it("coerces horizonDays from a query string and clamps the range", () => {
    expect(radarQuerySchema.parse({ horizonDays: "30" }).horizonDays).toBe(30);
    expect(radarQuerySchema.safeParse({ horizonDays: "0" }).success).toBe(false);
    expect(radarQuerySchema.safeParse({ horizonDays: "1000" }).success).toBe(false);
    expect(radarQuerySchema.safeParse({ horizonDays: "12.5" }).success).toBe(false);
  });

  it("parses a comma-separated kinds list into a deduped array", () => {
    const result = radarQuerySchema.parse({
      kinds: "period_close,reporting_requirement,period_close",
    });
    expect(result.kinds).toEqual(["period_close", "reporting_requirement"]);
  });

  it("rejects an unknown kind in the list", () => {
    expect(radarQuerySchema.safeParse({ kinds: "reporting_requirement,bogus" }).success).toBe(
      false,
    );
  });

  it("treats a blank kinds string as no filter", () => {
    expect(radarQuerySchema.parse({ kinds: "" }).kinds).toBeUndefined();
  });

  it("parses the status filter and includeResolved booleans", () => {
    expect(radarQuerySchema.parse({ status: "overdue" }).status).toBe("overdue");
    expect(radarQuerySchema.parse({ includeResolved: "true" }).includeResolved).toBe(true);
    expect(radarQuerySchema.parse({ includeResolved: "false" }).includeResolved).toBe(false);
  });
});
