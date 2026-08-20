import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  PAID_ATTRIBUTION_STORAGE_KEY,
  getStoredPaidAttribution,
  mergeStoredPaidAttribution,
  storePaidAttribution,
} from "./paid-attribution";

describe("paid attribution", () => {
  beforeEach(() => {
    vi.useRealTimers();
    window.localStorage.clear();
  });

  it("stores normalized Microsoft Ads click attribution for later app events", () => {
    storePaidAttribution({
      utm_source: "  bing  ",
      utm_medium: "cpc",
      utm_campaign: "BING_Search_Grant-Compliance_Trial_2026-05",
      utm_content: "",
      utm_term: "grant compliance software",
      msclkid: "m".repeat(260),
      gclid: "google-click",
      ve_product: "grantpipe",
      ve_icp: "gp_grants_compliance_operators",
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_variant: "plain_founder",
      ve_step: "7",
      ve_offer: "compliance_calendar_trial",
      ve_branding: "plain",
    });

    expect(getStoredPaidAttribution()).toEqual({
      utm_source: "bing",
      utm_medium: "cpc",
      utm_campaign: "BING_Search_Grant-Compliance_Trial_2026-05",
      utm_term: "grant compliance software",
      msclkid: "m".repeat(200),
      gclid: "google-click",
      ve_product: "grantpipe",
      ve_icp: "gp_grants_compliance_operators",
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_variant: "plain_founder",
      ve_step: "7",
      ve_offer: "compliance_calendar_trial",
      ve_branding: "plain",
    });
  });

  it("stores numeric outbound step fields as strings", () => {
    storePaidAttribution({
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_variant: "plain_founder",
      ve_step: 1,
      ve_sequence_day: 1,
    });

    expect(getStoredPaidAttribution()).toEqual({
      ve_campaign_id: "grantpipe-grants-deadline-drift-2026_06-01",
      ve_variant: "plain_founder",
      ve_step: "1",
      ve_sequence_day: "1",
    });
  });

  it("does not overwrite stored attribution when no paid fields are present", () => {
    storePaidAttribution({ utm_source: "bing", msclkid: "ms-click-1" });
    storePaidAttribution({});

    expect(getStoredPaidAttribution()).toMatchObject({
      utm_source: "bing",
      msclkid: "ms-click-1",
    });
  });

  it("stores numeric outbound step attribution as strings", () => {
    storePaidAttribution({ ve_step: 1, ve_sequence_day: 1 });

    expect(getStoredPaidAttribution()).toEqual({
      ve_step: "1",
      ve_sequence_day: "1",
    });
  });

  it("expires stored attribution after 30 days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T00:00:00.000Z"));
    storePaidAttribution({ utm_source: "bing", msclkid: "ms-click-1" });

    vi.setSystemTime(new Date("2026-06-01T00:00:01.000Z"));

    expect(getStoredPaidAttribution()).toEqual({});
    expect(window.localStorage.getItem(PAID_ATTRIBUTION_STORAGE_KEY)).toBeNull();
  });

  it("merges stored attribution without replacing explicit event properties", () => {
    storePaidAttribution({
      utm_source: "bing",
      utm_campaign: "BING_Search_Grant-Reporting_Trial_2026-05",
      msclkid: "ms-click-1",
    });

    expect(
      mergeStoredPaidAttribution({
        utm_campaign: "explicit-campaign",
        first_action: "grants",
      }),
    ).toEqual({
      utm_source: "bing",
      utm_campaign: "explicit-campaign",
      msclkid: "ms-click-1",
      first_action: "grants",
    });
  });

  it("swallows malformed stored attribution", () => {
    window.localStorage.setItem(PAID_ATTRIBUTION_STORAGE_KEY, "{not json");

    expect(getStoredPaidAttribution()).toEqual({});
    expect(window.localStorage.getItem(PAID_ATTRIBUTION_STORAGE_KEY)).toBeNull();
  });

  it("removes stored attribution with an invalid envelope", () => {
    window.localStorage.setItem(
      PAID_ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({ attribution: { utm_source: "bing" } }),
    );

    expect(getStoredPaidAttribution()).toEqual({});
    expect(window.localStorage.getItem(PAID_ATTRIBUTION_STORAGE_KEY)).toBeNull();
  });

  it("does not throw when localStorage rejects attribution writes", () => {
    const setItem = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });

    expect(() => {
      storePaidAttribution({ utm_source: "bing", msclkid: "ms-click-1" });
    }).not.toThrow();
    expect(setItem).toHaveBeenCalled();

    setItem.mockRestore();
  });

  it("does not throw when localStorage access is unavailable", () => {
    const localStorageDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    try {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new Error("storage unavailable");
        },
      });

      expect(() => {
        storePaidAttribution({ utm_source: "bing", msclkid: "ms-click-1" });
      }).not.toThrow();
      expect(() => getStoredPaidAttribution()).not.toThrow();
      expect(() => mergeStoredPaidAttribution({ event: "signup_completed" })).not.toThrow();
      expect(mergeStoredPaidAttribution({ event: "signup_completed" })).toEqual({
        event: "signup_completed",
      });
    } finally {
      if (localStorageDescriptor) {
        Object.defineProperty(window, "localStorage", localStorageDescriptor);
      }
    }
  });

  it("does not throw when malformed attribution cleanup fails", () => {
    window.localStorage.setItem(PAID_ATTRIBUTION_STORAGE_KEY, "{not json");
    const removeItem = vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
      throw new Error("storage cleanup unavailable");
    });

    expect(() => getStoredPaidAttribution()).not.toThrow();
    expect(getStoredPaidAttribution()).toEqual({});
    expect(removeItem).toHaveBeenCalled();

    removeItem.mockRestore();
    window.localStorage.removeItem(PAID_ATTRIBUTION_STORAGE_KEY);
  });

  it.each([
    ["null payload", "null"],
    ["primitive payload", '"string-payload"'],
    ["number payload", "42"],
    ["envelope with non-numeric capturedAt", '{"capturedAt":"now","attribution":{}}'],
    ["envelope with null attribution", '{"capturedAt":1,"attribution":null}'],
    ["envelope with string attribution", '{"capturedAt":1,"attribution":"oops"}'],
  ])("clears stored attribution with an %s", (_label, raw) => {
    window.localStorage.setItem(PAID_ATTRIBUTION_STORAGE_KEY, raw);
    expect(getStoredPaidAttribution()).toEqual({});
    expect(window.localStorage.getItem(PAID_ATTRIBUTION_STORAGE_KEY)).toBeNull();
  });

  it("returns empty attribution when no entry has been stored", () => {
    expect(getStoredPaidAttribution()).toEqual({});
  });

  it("merges only explicit properties when no attribution is stored", () => {
    expect(mergeStoredPaidAttribution()).toEqual({});
    expect(mergeStoredPaidAttribution({ first_action: "grants" })).toEqual({
      first_action: "grants",
    });
  });
});
