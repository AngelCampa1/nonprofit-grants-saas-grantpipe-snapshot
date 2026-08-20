import { describe, expect, it } from "vitest";
import {
  FALLBACK_LEAD_MAGNET_SEQUENCE,
  FEATURED_LEAD_MAGNET_SLUGS,
  ACTIVE_LEAD_MAGNET_SLUGS,
  LEAD_MAGNET_FALLBACK_BY_FAMILY,
  LEAD_MAGNET_SLUGS,
  NON_PDF_LEAD_MAGNET_SLUGS,
  PROMOTED_PDF_LEAD_MAGNET_SLUGS,
  LEAD_MAGNET_ASSET_TYPES,
  LEAD_MAGNET_PROVISIONED_SEQUENCE_SLUGS,
  LEAD_MAGNET_SEQUENCE_FAMILIES,
  LEAD_MAGNET_SEQUENCE_METADATA,
  LEAD_MAGNET_SEQUENCE_SLUGS,
  LEAD_MAGNET_TITLES,
  isLeadMagnetSlug,
  leadMagnetAsset,
  resolveLeadMagnetSequence,
  type LeadMagnetSlug,
} from "./lead-magnets";

describe("lead magnet constants", () => {
  it("exports the supported lead magnet slug list in canonical order", () => {
    expect(LEAD_MAGNET_SLUGS).toEqual([
      // Existing
      "grant-compliance-checklist",
      "grant-compliance-cost-audit",
      "grant-reporting-calendar-template",
      "fasb-asc-958-quick-reference",
      "grant-pipeline-forecasting-worksheet",
      "donor-retention-playbook",
      "major-donor-cultivation-playbook",
      "nonprofit-crm-cost-calculator",
      "nonprofit-crm-evaluation-scorecard",
      "nonprofit-crm-market-report-2026",
      // Grant Management & Lifecycle
      "grant-closeout-checklist",
      "granthub-migration-checklist",
      "award-setup-worksheet",
      "grant-reporting-deadlines-tracker",
      "grant-kickoff-meeting-template",
      "no-cost-extension-request-template",
      "grant-budget-amendment-request-template",
      "funder-report-template",
      // Grant Compliance
      "2-cfr-200-audit-prep-checklist",
      "grant-file-audit-checklist",
      "single-audit-prep-timeline",
      // Federal Grant Operations
      "time-and-effort-certification-template",
      "subrecipient-monitoring-checklist",
      "sefa-prep-worksheet",
      "sf-425-reporting-checklist",
      "subrecipient-agreement-checklist",
      "grant-staff-time-tracking-template",
      // Restricted Fund Accounting
      "restricted-fund-tracking-spreadsheet",
      "grant-spend-down-tracker",
      "grant-budget-tracking-template",
      "restricted-funds-release-calculator",
      "donor-to-grant-reconciliation-template",
      // CRM + Grants Alternatives
      "grant-software-roi-calculator",
      "board-approval-memo-software-template",
      "crm-migration-data-map-template",
      "salesforce-npsp-migration-map",
      // Fundraising & Development
      "donor-thank-you-letter-template-pack",
      "nonprofit-financial-report-template",
      "grant-proposal-budget-template",
      "nonprofit-development-plan-template",
      "monthly-giving-program-launch-checklist",
      "ai-tools-evaluation-scorecard-nonprofits",
      "501c3-application-checklist",
      "donor-stewardship-plan-template",
      // Grant Discovery & Development Strategy
      "grant-proposal-sample-pack",
      "development-operations-self-audit",
      "year-end-campaign-toolkit",
      "board-fundraising-toolkit",
      "funder-prospecting-research-template",
      "cdbg-compliance-worksheet",
      "federal-grant-application-checklist",
      "nonprofit-technology-evaluation-worksheet",
      "donor-retention-dashboard-template",
      "grant-narrative-template-pack",
      "new-development-director-90-day-checklist",
      "cost-allocation-plan-worksheet",
      "funder-stewardship-calendar-template",
      "indirect-cost-rate-negotiation-worksheet",
      "corporate-partnership-proposal-template",
      // City Lead Magnets
      "nyc-foundation-funder-map-2026",
      "los-angeles-foundation-funder-map-2026",
      "chicago-foundation-funder-map-2026",
      "houston-grant-deadline-calendar-2026",
      "dc-federal-pass-through-pipeline-worksheet",
      "philadelphia-grant-deadline-calendar-2026",
      "phoenix-foundation-funder-map-2026",
      "san-antonio-grant-deadline-calendar-2026",
      "san-diego-foundation-funder-map-2026",
      "dallas-foundation-funder-map-2026",
      // City Lead Magnets — Batch 2
      "boston-foundation-funder-map-2026",
      "seattle-foundation-funder-map-2026",
      "denver-foundation-funder-map-2026",
      "atlanta-grant-deadline-calendar-2026",
      "minneapolis-foundation-funder-map-2026",
      // City Lead Magnets — Batch 3
      "jacksonville-grant-deadline-calendar-2026",
      "raleigh-foundation-funder-map-2026",
      // State Charitable Registration Compliance Checklists
      "california-compliance-checklist",
      "texas-compliance-checklist",
      "new-york-compliance-checklist",
      "florida-compliance-checklist",
      "illinois-compliance-checklist",
      "pennsylvania-compliance-checklist",
      "ohio-compliance-checklist",
      "georgia-compliance-checklist",
      "north-carolina-compliance-checklist",
      "massachusetts-compliance-checklist",
      "washington-compliance-checklist",
      "minnesota-compliance-checklist",
      "virginia-compliance-checklist",
      "new-jersey-compliance-checklist",
      "michigan-compliance-checklist",
      "maryland-compliance-checklist",
      "colorado-compliance-checklist",
      "arizona-compliance-checklist",
      "tennessee-compliance-checklist",
      "missouri-compliance-checklist",
      "indiana-compliance-checklist",
      "wisconsin-compliance-checklist",
      "oregon-compliance-checklist",
      "connecticut-compliance-checklist",
      "kentucky-compliance-checklist",
      "alabama-compliance-checklist",
      "south-carolina-compliance-checklist",
      "oklahoma-compliance-checklist",
      "louisiana-compliance-checklist",
      "iowa-compliance-checklist",
      // Interactive Questionnaires (5)
      "nonprofit-audit-readiness-assessment",
      "grant-compliance-readiness-quiz",
      "nonprofit-software-needs-assessment",
      "donor-management-maturity-assessment",
      "nonprofit-financial-health-scorecard",
      // Auditor & Funder Portal
      "auditor-evidence-checklist",
      "funder-monitoring-evidence-template",
      "audit-prep-week-by-week-checklist",
      "external-reviewer-access-policy-template",
      // Spreadsheet Deliverables (xlsx)
      "grant-tracking-template",
      "grant-budget-template",
    ] satisfies LeadMagnetSlug[]);
  });

  it("has exactly 117 supported slugs", () => {
    expect(LEAD_MAGNET_SLUGS).toHaveLength(117);
  });

  it("keeps the public offer library focused on GrantPipe ICP pains", () => {
    expect(ACTIVE_LEAD_MAGNET_SLUGS).toEqual([
      "grant-compliance-checklist",
      "grant-compliance-cost-audit",
      "grant-reporting-calendar-template",
      "nonprofit-crm-cost-calculator",
      "grant-closeout-checklist",
      "granthub-migration-checklist",
      "award-setup-worksheet",
      "grant-kickoff-meeting-template",
      "2-cfr-200-audit-prep-checklist",
      "grant-file-audit-checklist",
      "single-audit-prep-timeline",
      "time-and-effort-certification-template",
      "subrecipient-monitoring-checklist",
      "sefa-prep-worksheet",
      "restricted-fund-tracking-spreadsheet",
      "grant-spend-down-tracker",
      "donor-to-grant-reconciliation-template",
      "grant-software-roi-calculator",
      "board-approval-memo-software-template",
      "crm-migration-data-map-template",
      "audit-prep-week-by-week-checklist",
      "external-reviewer-access-policy-template",
      "grant-tracking-template",
      "grant-budget-template",
    ] satisfies LeadMagnetSlug[]);

    expect(ACTIVE_LEAD_MAGNET_SLUGS).toHaveLength(24);
    expect(ACTIVE_LEAD_MAGNET_SLUGS).not.toContain("donor-retention-playbook");
    expect(ACTIVE_LEAD_MAGNET_SLUGS).not.toContain("major-donor-cultivation-playbook");
    expect(ACTIVE_LEAD_MAGNET_SLUGS).not.toContain("board-fundraising-toolkit");
  });

  it("provides a human title for every supported slug", () => {
    for (const slug of LEAD_MAGNET_SLUGS) {
      expect(LEAD_MAGNET_TITLES[slug]).toMatch(/\S/);
    }
  });

  it("every title is unique", () => {
    const titles = Object.values(LEAD_MAGNET_TITLES);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("treats the spreadsheet deliverables as non-PDF lead magnets", () => {
    expect(NON_PDF_LEAD_MAGNET_SLUGS).toEqual([
      "restricted-fund-tracking-spreadsheet",
      "grant-tracking-template",
      "grant-budget-template",
    ]);
    expect(LEAD_MAGNET_ASSET_TYPES["restricted-fund-tracking-spreadsheet"]).toBe("xlsx");
    expect(LEAD_MAGNET_ASSET_TYPES["grant-tracking-template"]).toBe("xlsx");
    expect(LEAD_MAGNET_ASSET_TYPES["grant-budget-template"]).toBe("xlsx");
    expect(LEAD_MAGNET_TITLES["restricted-fund-tracking-spreadsheet"]).toBe(
      "Restricted Fund Tracking Spreadsheet",
    );
    expect(LEAD_MAGNET_TITLES["grant-tracking-template"]).toBe("Grant Tracking Spreadsheet");
    expect(LEAD_MAGNET_TITLES["grant-budget-template"]).toBe("Grant Budget Template");
  });

  it("exports the promoted PDF slug list from active PDF magnets", () => {
    expect(PROMOTED_PDF_LEAD_MAGNET_SLUGS).toEqual(
      ACTIVE_LEAD_MAGNET_SLUGS.filter(
        (slug) => !(NON_PDF_LEAD_MAGNET_SLUGS as readonly string[]).includes(slug),
      ),
    );
    expect(PROMOTED_PDF_LEAD_MAGNET_SLUGS).not.toContain("grant-tracking-template");
    expect(PROMOTED_PDF_LEAD_MAGNET_SLUGS).not.toContain("grant-budget-template");
  });

  it("resolves a typed deliverable descriptor for the grant budget xlsx magnet", () => {
    expect(leadMagnetAsset("grant-budget-template")).toEqual({
      extension: "xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      r2Key: "lead-magnets/grant-budget-template.xlsx",
    });
  });

  it("defaults every non-spreadsheet slug to a pdf asset type", () => {
    for (const slug of LEAD_MAGNET_SLUGS) {
      const expected = (NON_PDF_LEAD_MAGNET_SLUGS as readonly string[]).includes(slug)
        ? "xlsx"
        : "pdf";
      expect(LEAD_MAGNET_ASSET_TYPES[slug], slug).toBe(expected);
    }
  });

  it("resolves a typed deliverable descriptor for a pdf magnet", () => {
    expect(leadMagnetAsset("grant-compliance-checklist")).toEqual({
      extension: "pdf",
      contentType: "application/pdf",
      r2Key: "lead-magnets/grant-compliance-checklist.pdf",
    });
  });

  it("resolves a typed deliverable descriptor for an xlsx magnet", () => {
    expect(leadMagnetAsset("grant-tracking-template")).toEqual({
      extension: "xlsx",
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      r2Key: "lead-magnets/grant-tracking-template.xlsx",
    });
  });

  it("defaults unknown slugs to a pdf deliverable descriptor", () => {
    expect(leadMagnetAsset("some-unknown-slug")).toEqual({
      extension: "pdf",
      contentType: "application/pdf",
      r2Key: "lead-magnets/some-unknown-slug.pdf",
    });
  });

  it("maps every supported lead magnet to exactly one nurture sequence", () => {
    expect(Object.keys(LEAD_MAGNET_SEQUENCE_METADATA).sort()).toEqual(
      [...LEAD_MAGNET_SLUGS].sort(),
    );

    for (const slug of LEAD_MAGNET_SLUGS) {
      const metadata = LEAD_MAGNET_SEQUENCE_METADATA[slug];
      expect(LEAD_MAGNET_SEQUENCE_FAMILIES, slug).toContain(metadata.family);
      expect(LEAD_MAGNET_SEQUENCE_SLUGS, slug).toContain(metadata.sequenceSlug);
      expect(LEAD_MAGNET_PROVISIONED_SEQUENCE_SLUGS, slug).toContain(
        metadata.enrollmentSequenceSlug,
      );
      expect(metadata.firstFollowUpAngle.trim().length, slug).toBeGreaterThan(24);
      expect(metadata.firstFollowUpAngle, slug).not.toMatch(/operating[- ]system/i);
      expect(metadata.cadence, slug).toBe("daily");
      expect(metadata.nextStepGoal, slug).toBe("start_trial");
      expect(metadata.stopCondition, slug).toBe("signup_completed");
      expect(metadata.buyerStage, slug).toMatch(/^(tofu|mofu|bofu)$/);
    }

    expect(FALLBACK_LEAD_MAGNET_SEQUENCE.firstFollowUpAngle).not.toMatch(/operating[- ]system/i);
  });

  it("resolves a topical sequence for known magnets and the fallback for legacy slugs", () => {
    expect(resolveLeadMagnetSequence("grant-compliance-checklist")).toMatchObject({
      family: "grant-compliance",
      sequenceSlug: "grantpipe-lead-magnet-nurture",
    });
    expect(resolveLeadMagnetSequence("nonprofit-crm-cost-calculator")).toMatchObject({
      family: "crm-evaluation",
      sequenceSlug: "grantpipe-lead-magnet-nurture",
      enrollmentSequenceSlug: "grantpipe-lead-magnet-nurture",
    });
    expect(resolveLeadMagnetSequence("unknown-legacy-magnet")).toMatchObject({
      family: "grant-compliance",
      sequenceSlug: "grantpipe-nurture-value-1",
      enrollmentSequenceSlug: "grantpipe-nurture-value-1",
    });
  });

  it("exports the featured site lead magnets in the configured order", () => {
    expect(FEATURED_LEAD_MAGNET_SLUGS).toEqual([
      "nonprofit-crm-cost-calculator",
      "grant-compliance-checklist",
      "audit-prep-week-by-week-checklist",
    ] satisfies LeadMagnetSlug[]);
  });

  it("exports the default family fallback mapping for routed content", () => {
    expect(LEAD_MAGNET_FALLBACK_BY_FAMILY).toEqual({
      guide: "grant-compliance-checklist",
      "state-page": "grant-compliance-checklist",
      solution: "grant-compliance-checklist",
      comparison: "crm-migration-data-map-template",
      "pricing-breakdown": "grant-software-roi-calculator",
      listicle: "grant-software-roi-calculator",
    });
  });

  it("every fallback slug is in LEAD_MAGNET_SLUGS", () => {
    for (const slug of Object.values(LEAD_MAGNET_FALLBACK_BY_FAMILY)) {
      expect(LEAD_MAGNET_SLUGS).toContain(slug);
    }
  });

  it("every featured slug is in LEAD_MAGNET_SLUGS", () => {
    for (const slug of FEATURED_LEAD_MAGNET_SLUGS) {
      expect(LEAD_MAGNET_SLUGS).toContain(slug);
    }
  });

  it("recognizes valid lead magnet slugs", () => {
    expect(isLeadMagnetSlug("grant-compliance-checklist")).toBe(true);
    expect(isLeadMagnetSlug("nonprofit-crm-evaluation-scorecard")).toBe(true);
    expect(isLeadMagnetSlug("grant-closeout-checklist")).toBe(true);
    expect(isLeadMagnetSlug("2-cfr-200-audit-prep-checklist")).toBe(true);
    expect(isLeadMagnetSlug("crm-migration-data-map-template")).toBe(true);
    expect(isLeadMagnetSlug("salesforce-npsp-migration-map")).toBe(true);
  });

  it("rejects unsupported lead magnet slugs", () => {
    expect(isLeadMagnetSlug("resource")).toBe(false);
    expect(isLeadMagnetSlug("")).toBe(false);
    expect(isLeadMagnetSlug(undefined)).toBe(false);
    expect(isLeadMagnetSlug("wcag-checklist")).toBe(false);
  });
});
