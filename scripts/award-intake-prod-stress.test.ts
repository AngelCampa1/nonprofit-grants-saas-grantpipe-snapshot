import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  AWARD_INTAKE_STRESS_FIXTURES,
  assertProductionWrapper,
  evaluateCommitVerification,
  evaluateExtraction,
  redactForReport,
  selectedFixtures,
} from "../e2e-adhoc/award-intake-prod-stress.mjs";

describe("award intake production stress harness", () => {
  it("uses a file-url CLI guard so relative script paths execute", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/award-intake-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain('import { pathToFileURL } from "node:url"');
    expect(source).toContain('pathToFileURL(process.argv[1] ?? "").href');
  });

  it("ships a broad generated award-letter fixture set", () => {
    expect(AWARD_INTAKE_STRESS_FIXTURES.length).toBeGreaterThanOrEqual(5);
    expect(AWARD_INTAKE_STRESS_FIXTURES.map((fixture) => fixture.key)).toEqual([
      "federal-basic",
      "foundation-restricted",
      "reimbursement-heavy",
      "multi-year-reporting",
      "sparse-risky-award",
    ]);
    expect(AWARD_INTAKE_STRESS_FIXTURES.every((fixture) => fixture.body.length > 700)).toBe(true);
    expect(AWARD_INTAKE_STRESS_FIXTURES[0]?.commitExpectation).toMatchObject({
      grantNameIncludes: "Youth Housing Stabilization Grant",
      grantAmountCents: 12500000,
      funderNameIncludes: "Ohio Community Renewal Agency",
    });
  });

  it("refuses direct production execution outside the cleanup wrapper", () => {
    expect(() =>
      assertProductionWrapper({
        appUrl: "https://app.grantpipe.com",
        env: {},
      }),
    ).toThrow(/cleanup/);

    expect(() =>
      assertProductionWrapper({
        appUrl: "https://app.grantpipe.com",
        env: {
          GRANTPIPE_LIVE_E2E_WRAPPER: "1",
          POSTHOG_PERSONAL_API_KEY: "phx_secret",
          POSTHOG_PROJECT_ID: "390138",
        },
      }),
    ).not.toThrow();
  });

  it("uses direct Better Auth signup and signin before onboarding activation", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/award-intake-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("/api/auth/better/sign-up/email");
    expect(source).toContain("/api/auth/better/sign-in/email");
    expect(source).toContain('"/api/grants/funders"');
    expect(source).toContain('"/api/grants"');
    expect(source).toContain('"/api/onboarding/complete"');
    expect(source).not.toContain('heading", { name: "Welcome to GrantPipe"');
  });

  it("checks expected extraction fields without requiring exact model wording", () => {
    const fixture = AWARD_INTAKE_STRESS_FIXTURES[0]!;
    const result = evaluateExtraction(fixture, {
      id: "ext-1",
      status: "ready_for_review",
      fields: [
        {
          fieldKey: "grant.name",
          destinationEntityType: "grant",
          destinationField: "name",
          valueJson: "Youth Housing Stabilization Grant",
          normalizedValueJson: "Youth Housing Stabilization Grant",
          confidence: 91,
          required: true,
          sources: [{ snippet: "Award name: Youth Housing Stabilization Grant" }],
        },
        {
          fieldKey: "grant.amount",
          destinationEntityType: "grant",
          destinationField: "amountCents",
          valueJson: "$125,000",
          normalizedValueJson: 12500000,
          confidence: 87,
          required: true,
          sources: [{ snippet: "Total award: $125,000" }],
        },
        {
          fieldKey: "funder.name",
          destinationEntityType: "funder",
          destinationField: "name",
          valueJson: "Ohio Community Renewal Agency",
          normalizedValueJson: "Ohio Community Renewal Agency",
          confidence: 94,
          required: true,
          sources: [{ snippet: "Funder: Ohio Community Renewal Agency" }],
        },
      ],
    });

    expect(result.pass).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it("uses destination fields as the stable extraction contract", () => {
    const fixture = AWARD_INTAKE_STRESS_FIXTURES[0]!;
    const result = evaluateExtraction(fixture, {
      id: "ext-1",
      status: "ready_for_review",
      fields: [
        {
          fieldKey: "award_title",
          destinationEntityType: "grant",
          destinationField: "name",
          valueJson: "Youth Housing Stabilization Grant",
          confidence: 91,
          required: true,
          sources: [{ snippet: "Award name: Youth Housing Stabilization Grant" }],
        },
        {
          fieldKey: "total_award_amount",
          destinationEntityType: "grant",
          destinationField: "amountCents",
          valueJson: "$125,000",
          normalizedValueJson: 12500000,
          confidence: 87,
          required: true,
          sources: [{ snippet: "Total award: $125,000" }],
        },
        {
          fieldKey: "funding_agency",
          destinationEntityType: "funder",
          destinationField: "name",
          valueJson: "Ohio Community Renewal Agency",
          confidence: 94,
          required: true,
          sources: [{ snippet: "Funder: Ohio Community Renewal Agency" }],
        },
      ],
    });

    expect(result.pass).toBe(true);
    expect(result.fieldSnapshot).toEqual([
      expect.objectContaining({ fieldKey: "award_title", destinationField: "name" }),
      expect.objectContaining({ fieldKey: "total_award_amount", destinationField: "amountCents" }),
      expect.objectContaining({ fieldKey: "funding_agency", destinationField: "name" }),
    ]);
  });

  it("fails fields whose destination field still carries the entity prefix", () => {
    const fixture = AWARD_INTAKE_STRESS_FIXTURES[0]!;
    const result = evaluateExtraction(fixture, {
      id: "ext-1",
      status: "ready_for_review",
      fields: [
        {
          fieldKey: "grant_amount",
          destinationEntityType: "grant",
          destinationField: "grant.amountCents",
          valueJson: 12500000,
          confidence: 100,
          required: true,
          sources: [{ snippet: "Total award: $125,000" }],
        },
      ],
    });

    expect(result.pass).toBe(false);
    expect(result.missing).toContain("grant.amount");
  });

  it("requires exact amount matches", () => {
    const fixture = AWARD_INTAKE_STRESS_FIXTURES[0]!;
    const result = evaluateExtraction(fixture, {
      id: "ext-1",
      status: "ready_for_review",
      fields: [
        {
          fieldKey: "grant_amount",
          destinationEntityType: "grant",
          destinationField: "amountCents",
          valueJson: 12500001,
          confidence: 100,
          required: true,
          sources: [{ snippet: "Total award: $125,000.01" }],
        },
      ],
    });

    expect(result.pass).toBe(false);
    expect(result.missing).toContain("grant.amount");
  });

  it("reports missing fields and low confidence as failures", () => {
    const fixture = AWARD_INTAKE_STRESS_FIXTURES[1]!;
    const result = evaluateExtraction(fixture, {
      id: "ext-2",
      status: "ready_for_review",
      fields: [
        {
          fieldKey: "grant.name",
          destinationEntityType: "grant",
          destinationField: "name",
          valueJson: "Neighborhood Food Access Expansion",
          confidence: 42,
          required: true,
          sources: [{ snippet: "Neighborhood Food Access Expansion" }],
        },
      ],
    });

    expect(result.pass).toBe(false);
    expect(result.lowConfidence).toContain("grant.name");
    expect(result.missing).toContain("grant.amount");
    expect(result.missing).toContain("funder.name");
  });

  it("checks committed grant, funder, document, and extraction state", () => {
    const fixture = AWARD_INTAKE_STRESS_FIXTURES[0]!;
    const result = evaluateCommitVerification(fixture, {
      commitResult: { grantId: "grant-1", funderId: "funder-1" },
      committedExtraction: {
        id: "ext-1",
        status: "committed",
        document: { id: "doc-1", entityType: "grant" },
      },
      grant: {
        id: "grant-1",
        name: "Youth Housing Stabilization Grant",
        amountCents: 12500000,
        funder: { id: "funder-1", name: "Ohio Community Renewal Agency" },
      },
    });

    expect(result.pass).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports commit verification failures by stable label", () => {
    const fixture = AWARD_INTAKE_STRESS_FIXTURES[0]!;
    const result = evaluateCommitVerification(fixture, {
      commitResult: { grantId: "grant-1" },
      committedExtraction: {
        id: "ext-1",
        status: "ready_for_review",
        document: { id: "doc-1", entityType: "award_intake" },
      },
      grant: {
        id: "grant-1",
        name: "Wrong Grant",
        amountCents: 1,
        funder: { id: "funder-1", name: "Wrong Funder" },
      },
    });

    expect(result.pass).toBe(false);
    expect(result.failures).toEqual([
      "commit.createdFunderId",
      "grant.name",
      "grant.amountCents",
      "grant.funder.name",
      "document.relinkedToGrant",
      "extraction.committed",
    ]);
  });

  it("redacts email-like and token-like values from reports", () => {
    expect(
      redactForReport("Contact jane.doe@example.org with password GrantPipe-secret-token-12345"),
    ).toBe("Contact [redacted-email] with password [redacted-token]");
  });

  it("falls back to one fixture when the stress limit is invalid", () => {
    expect(selectedFixtures({ GRANTPIPE_AWARD_INTAKE_STRESS_LIMIT: "not-a-number" })).toHaveLength(
      1,
    );
  });

  it("writes a standard live E2E report contract for automated audits", () => {
    const source = readFileSync(
      join(process.cwd(), "e2e-adhoc/award-intake-prod-stress.mjs"),
      "utf8",
    );

    expect(source).toContain("pass,");
    expect(source).toContain("createdAt:");
    expect(source).toContain("scenarioCount: fixtures.length");
  });
});
