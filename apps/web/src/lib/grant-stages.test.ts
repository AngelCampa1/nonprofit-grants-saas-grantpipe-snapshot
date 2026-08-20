import { GRANT_STATUSES } from "@grantpipe/shared";
import { describe, expect, it } from "vitest";
import {
  GRANT_PIPELINE_PHASES,
  GRANT_STAGE_DETAILS,
  GRANT_STATUS_BADGE_VARIANTS,
  getGrantStageInfo,
} from "./grant-stages";

describe("GRANT_STAGE_DETAILS", () => {
  it("contains one entry per grant status in GRANT_STATUSES order", () => {
    expect(GRANT_STAGE_DETAILS.map((s) => s.status)).toEqual([...GRANT_STATUSES]);
  });

  it("every entry has required fields", () => {
    for (const detail of GRANT_STAGE_DETAILS) {
      expect(detail.status).toBeTruthy();
      expect(detail.label).toBeTruthy();
      expect(detail.meaning).toBeTruthy();
      expect(detail.moveWhen).toBeTruthy();
      expect(detail.nextAction).toBeTruthy();
      expect(detail.emptyMessage).toBeTruthy();
    }
  });
});

describe("getGrantStageInfo", () => {
  it("returns stage info with the correct status attached", () => {
    const info = getGrantStageInfo("discovery");
    expect(info.status).toBe("discovery");
    expect(info.label).toBe("Discovery");
  });

  it("returns distinct info for each status", () => {
    const discovery = getGrantStageInfo("discovery");
    const awarded = getGrantStageInfo("awarded");
    expect(discovery.label).not.toBe(awarded.label);
    expect(discovery.meaning).not.toBe(awarded.meaning);
  });
});

describe("GRANT_PIPELINE_PHASES", () => {
  it("has exactly four phases", () => {
    expect(GRANT_PIPELINE_PHASES).toHaveLength(4);
  });

  it("phase ids are unique", () => {
    const ids = GRANT_PIPELINE_PHASES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every status referenced in phases is a valid GrantStatus", () => {
    const allStatuses = new Set(GRANT_STATUSES);
    for (const phase of GRANT_PIPELINE_PHASES) {
      for (const status of phase.statuses) {
        expect(allStatuses.has(status)).toBe(true);
      }
    }
  });
});

describe("GRANT_STATUS_BADGE_VARIANTS", () => {
  it("has an entry for every GrantStatus", () => {
    for (const status of GRANT_STATUSES) {
      expect(GRANT_STATUS_BADGE_VARIANTS).toHaveProperty(status);
    }
  });

  it("maps each status to the correct badge variant", () => {
    expect(GRANT_STATUS_BADGE_VARIANTS.discovery).toBe("gs-discovery");
    expect(GRANT_STATUS_BADGE_VARIANTS.application).toBe("gs-application");
    expect(GRANT_STATUS_BADGE_VARIANTS.submitted).toBe("gs-submitted");
    expect(GRANT_STATUS_BADGE_VARIANTS.awarded).toBe("gs-awarded");
    expect(GRANT_STATUS_BADGE_VARIANTS.active).toBe("gs-active");
    expect(GRANT_STATUS_BADGE_VARIANTS.reporting).toBe("gs-reporting");
    expect(GRANT_STATUS_BADGE_VARIANTS.closeout).toBe("gs-closeout");
    expect(GRANT_STATUS_BADGE_VARIANTS.renewal).toBe("gs-renewal");
    expect(GRANT_STATUS_BADGE_VARIANTS.declined).toBe("gs-declined");
  });

  it("all variant values are non-empty strings starting with gs-", () => {
    for (const variant of Object.values(GRANT_STATUS_BADGE_VARIANTS)) {
      expect(typeof variant).toBe("string");
      expect(variant.startsWith("gs-")).toBe(true);
    }
  });
});
