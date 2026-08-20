import { describe, expect, it } from "vitest";
import {
  LAUNCH_PROMO,
  LAUNCH_PROMO_PHASES,
  getLaunchPromoForBillingCycle,
  pickActiveLaunchPhase,
  LAUNCH_PROMO_DEADLINE_ISO,
  PROMO_CATALOG,
  getActivePromo,
  getPromoDeadlineLabel,
  isPromoWindowOpen,
} from "./promos";
import type { LaunchPromoCode, Promo, PromoKind } from "./promos";

describe("getPromoDeadlineLabel", () => {
  it('returns "Friday, July 3"', () => {
    expect(getPromoDeadlineLabel()).toBe("Friday, July 3");
  });
});

describe("LAUNCH_PROMO_DEADLINE_ISO", () => {
  it("is the correct cutoff instant", () => {
    expect(LAUNCH_PROMO_DEADLINE_ISO).toBe("2026-07-04T06:59:59.000Z");
  });
});

describe("PROMO_CATALOG", () => {
  it("has no active launch promo entries", () => {
    expect(PROMO_CATALOG).toHaveLength(0);
  });
});

describe("isPromoWindowOpen", () => {
  const inactivePromo = (): Promo => ({
    slug: "inactive-test",
    name: "Inactive test",
    kind: "discount",
    window: { endsAt: "2000-01-01T00:00:00.000Z" },
    discount: { kind: "percent", value: 80, appliesToCycle: "both" },
    phases: LAUNCH_PROMO_PHASES,
    copy: {
      badge: "",
      headline: "",
      bannerEyebrow: "",
      bannerMessage: "",
      deadlineLine: "",
    },
  });

  it("returns false for the retired launch window", () => {
    expect(isPromoWindowOpen(inactivePromo(), new Date("2026-06-23T12:00:00Z"))).toBe(false);
  });

  it("handles a promo with no window bounds (always open)", () => {
    const openPromo = { ...inactivePromo(), window: {} } as Promo;
    expect(isPromoWindowOpen(openPromo, new Date("2000-01-01T00:00:00Z"))).toBe(true);
    expect(isPromoWindowOpen(openPromo, new Date("2099-01-01T00:00:00Z"))).toBe(true);
  });

  it("handles a promo with only startsAt (open once started, no end)", () => {
    const futureOpen = {
      ...inactivePromo(),
      window: { startsAt: "2026-01-01T00:00:00.000Z" },
    } as Promo;
    expect(isPromoWindowOpen(futureOpen, new Date("2026-06-01T00:00:00Z"))).toBe(true);
    expect(isPromoWindowOpen(futureOpen, new Date("2025-12-31T00:00:00Z"))).toBe(false);
  });
});

describe("getActivePromo", () => {
  it("returns null before, at, and after the retired cutoff", () => {
    expect(getActivePromo(new Date("2026-06-23T12:00:00Z"))).toBeNull();
    expect(getActivePromo(new Date(LAUNCH_PROMO_DEADLINE_ISO))).toBeNull();
    expect(getActivePromo(new Date("2026-07-04T07:00:00Z"))).toBeNull();
    expect(getActivePromo(new Date("2026-07-10T00:00:00Z"))).toBeNull();
  });
});

describe("moved symbols still work from promos.ts", () => {
  it("LAUNCH_PROMO is M80OFF alias", () => {
    expect(LAUNCH_PROMO.code).toBe("M80OFF");
  });

  it("getLaunchPromoForBillingCycle works", () => {
    expect(getLaunchPromoForBillingCycle("monthly").code).toBe("M80OFF");
    expect(getLaunchPromoForBillingCycle("annual").code).toBe("Y80OFF");
  });

  it("pickActiveLaunchPhase works", () => {
    expect(pickActiveLaunchPhase({}).code).toBe("M80OFF");
  });
});

describe("TypeScript types are exported", () => {
  it("LaunchPromoCode, LaunchPromo, Promo, PromoKind are importable as types", () => {
    // Type-only check; if this compiles, types are exported correctly
    const _code: LaunchPromoCode = "M80OFF";
    const _kind: PromoKind = "discount";
    void _code;
    void _kind;
  });
});
