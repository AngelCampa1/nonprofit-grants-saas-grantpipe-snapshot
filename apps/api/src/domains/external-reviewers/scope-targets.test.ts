import { describe, expect, it, vi } from "vitest";
import { EXTERNAL_REVIEW_SCOPE_TYPES } from "@grantpipe/shared";
import { AppError } from "../../lib/app-error";
import {
  assertScopeTargetBelongsToOrg,
  assertScopeTargetsBelongToOrg,
  resolveScopeName,
} from "./scope-targets";

vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();

  return {
    ...actual,
    and: vi.fn((...conditions: unknown[]) => ({ type: "and", conditions })),
    eq: vi.fn((left: unknown, right: unknown) => ({ type: "eq", left, right })),
    isNull: vi.fn((value: unknown) => ({ type: "isNull", value })),
  };
});

const scopeQueries = {
  grant: "grants",
  fund: "funds",
  program: "programs",
  document: "documents",
  generated_report: "generatedReports",
  evidence_bundle: "evidenceBundles",
  restriction_term: "restrictionTerms",
  reimbursement_request: "grantPaymentRequests",
  subrecipient_file: "documents",
  subrecipient: "subrecipients",
  subaward: "subawards",
  subrecipient_risk_assessment: "subrecipientRiskAssessments",
  subrecipient_monitoring_task: "subrecipientMonitoringTasks",
  subrecipient_monitoring_log: "subrecipientMonitoringLogs",
  subrecipient_finding: "subrecipientFindings",
  subrecipient_corrective_action: "subrecipientCorrectiveActions",
  activity_log: "activityLog",
} as const;

type ScopeType = keyof typeof scopeQueries;
type Predicate = {
  type: "eq" | "isNull";
  right?: unknown;
};
type FindFirstCall = {
  where: {
    type: "and";
    conditions: Predicate[];
  };
};

const softDeletableScopeTypes = new Set<string>(
  EXTERNAL_REVIEW_SCOPE_TYPES.filter(
    (scopeType) => scopeType !== "generated_report" && scopeType !== "activity_log",
  ),
);

function makeDb(missingQuery?: string) {
  const query = Object.fromEntries(
    [...new Set(Object.values(scopeQueries))].map((name) => [
      name,
      {
        findFirst: vi.fn(async () =>
          name === missingQuery
            ? null
            : { id: "target-1", ...(name === "documents" ? { entityType: "subrecipient" } : {}) },
        ),
      },
    ]),
  );

  return { query } as never;
}

function makeDocumentDb(entityType?: string) {
  return {
    query: {
      documents: {
        findFirst: vi.fn(async () => ({ id: "doc-1", entityType })),
      },
    },
  } as never;
}

describe("assertScopeTargetsBelongToOrg", () => {
  it("accepts every supported scope target type when it belongs to the org", async () => {
    const db = makeDb();
    expect(Object.keys(scopeQueries).sort()).toEqual([...EXTERNAL_REVIEW_SCOPE_TYPES].sort());

    await assertScopeTargetsBelongToOrg(
      db,
      "org-1",
      Object.keys(scopeQueries).map((scopeType) => ({
        scopeType: scopeType as ScopeType,
        scopeId: `${scopeType}-1`,
      })),
    );

    const typedDb = db as { query: Record<string, { findFirst: ReturnType<typeof vi.fn> }> };

    for (const queryName of new Set(Object.values(scopeQueries))) {
      const query = typedDb.query[queryName];
      expect(query).toBeDefined();
      expect(query?.findFirst).toHaveBeenCalled();
    }
  });

  it("scopes every target lookup to the org and excludes soft-deleted targets", async () => {
    const db = makeDb();

    await assertScopeTargetsBelongToOrg(
      db,
      "org-1",
      EXTERNAL_REVIEW_SCOPE_TYPES.map((scopeType) => ({
        scopeType,
        scopeId: `${scopeType}-1`,
      })),
    );

    const typedDb = db as { query: Record<string, { findFirst: ReturnType<typeof vi.fn> }> };

    for (const scopeType of EXTERNAL_REVIEW_SCOPE_TYPES) {
      const queryName = scopeQueries[scopeType];
      const query = typedDb.query[queryName];
      const call = query?.findFirst.mock.calls.find((args: unknown[]) => {
        const [arg] = args as [FindFirstCall];
        return arg.where.conditions.some(
          (condition) => condition.type === "eq" && condition.right === `${scopeType}-1`,
        );
      })?.[0] as FindFirstCall | undefined;

      expect(call, `${scopeType} lookup was not called`).toBeDefined();
      expect(call?.where.conditions).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "eq", right: `${scopeType}-1` }),
          expect.objectContaining({ type: "eq", right: "org-1" }),
        ]),
      );

      const hasSoftDeletePredicate = call?.where.conditions.some(
        (condition) => condition.type === "isNull",
      );
      expect(hasSoftDeletePredicate).toBe(softDeletableScopeTypes.has(scopeType));
    }
  });

  it("rejects the first missing or foreign target", async () => {
    await expect(
      assertScopeTargetsBelongToOrg(makeDb("subawards"), "org-1", [
        { scopeType: "subaward", scopeId: "foreign-subaward" },
      ]),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("accepts generated report scopes only when the report is ready", async () => {
    const db = {
      query: {
        generatedReports: {
          findFirst: vi.fn(async (call: FindFirstCall) => {
            const requiresReadyStatus = call.where.conditions.some(
              (condition) => condition.type === "eq" && condition.right === "ready",
            );
            return requiresReadyStatus ? { id: "report-1" } : null;
          }),
        },
      },
    } as never;

    await expect(
      assertScopeTargetsBelongToOrg(db, "org-1", [
        { scopeType: "generated_report", scopeId: "report-1" },
      ]),
    ).resolves.toBeUndefined();
  });

  it("rejects general document scopes for donor-adjacent documents", async () => {
    await expect(
      assertScopeTargetsBelongToOrg(makeDocumentDb("contact"), "org-1", [
        { scopeType: "document", scopeId: "doc-1" },
      ]),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejects subrecipient file scopes for non-subrecipient documents", async () => {
    await expect(
      assertScopeTargetsBelongToOrg(makeDocumentDb("grant"), "org-1", [
        { scopeType: "subrecipient_file", scopeId: "doc-1" },
      ]),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejects document scopes when the document entity type is missing", async () => {
    await expect(
      assertScopeTargetsBelongToOrg(makeDocumentDb(), "org-1", [
        { scopeType: "document", scopeId: "doc-1" },
      ]),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejects subrecipient file scopes when the document entity type is missing", async () => {
    await expect(
      assertScopeTargetsBelongToOrg(makeDocumentDb(), "org-1", [
        { scopeType: "subrecipient_file", scopeId: "doc-1" },
      ]),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejects unknown runtime scope types", async () => {
    await expect(
      assertScopeTargetsBelongToOrg(makeDb(), "org-1", [
        { scopeType: "unknown_scope", scopeId: "target-1" } as never,
      ]),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("uses the caller-provided message for single target validation failures", async () => {
    await expect(
      assertScopeTargetBelongsToOrg(
        makeDocumentDb("contact"),
        "org-1",
        { scopeType: "document", scopeId: "doc-1" },
        "Bundle item target not found",
      ),
    ).rejects.toMatchObject({ message: "Bundle item target not found" });
  });
});

describe("resolveScopeName", () => {
  function makeNameDb(queryName: string, row: Record<string, unknown> | null) {
    return {
      query: {
        [queryName]: { findFirst: vi.fn(async () => row) },
      },
    } as never;
  }

  const cases: Array<{
    scopeType: ScopeType;
    queryName: string;
    row: Record<string, string>;
    expected: string;
  }> = [
    {
      scopeType: "grant",
      queryName: "grants",
      row: { name: "Annual Operating Grant" },
      expected: "Annual Operating Grant",
    },
    {
      scopeType: "fund",
      queryName: "funds",
      row: { name: "Building Fund" },
      expected: "Building Fund",
    },
    {
      scopeType: "program",
      queryName: "programs",
      row: { name: "Youth Program" },
      expected: "Youth Program",
    },
    {
      scopeType: "document",
      queryName: "documents",
      row: { filename: "award-letter.pdf" },
      expected: "award-letter.pdf",
    },
    {
      scopeType: "subrecipient_file",
      queryName: "documents",
      row: { filename: "subaward.pdf" },
      expected: "subaward.pdf",
    },
    {
      scopeType: "generated_report",
      queryName: "generatedReports",
      row: { title: "Q4 Report" },
      expected: "Q4 Report",
    },
    {
      scopeType: "evidence_bundle",
      queryName: "evidenceBundles",
      row: { title: "Audit Bundle" },
      expected: "Audit Bundle",
    },
    {
      scopeType: "restriction_term",
      queryName: "restrictionTerms",
      row: { title: "Capital Restriction" },
      expected: "Capital Restriction",
    },
  ];

  for (const { scopeType, queryName, row, expected } of cases) {
    it(`resolves the display name for ${scopeType}`, async () => {
      const db = makeNameDb(queryName, row);
      const result = await resolveScopeName(db, "org-1", { scopeType, scopeId: `${scopeType}-1` });
      expect(result).toBe(expected);
    });
  }

  for (const { scopeType, queryName } of cases) {
    it(`returns null when the ${scopeType} target row is missing`, async () => {
      const db = makeNameDb(queryName, null);
      const result = await resolveScopeName(db, "org-1", { scopeType, scopeId: `${scopeType}-1` });
      expect(result).toBeNull();
    });
  }

  it("returns null for scope types without a single obvious name column", async () => {
    const db = { query: {} } as never;
    const result = await resolveScopeName(db, "org-1", {
      scopeType: "activity_log",
      scopeId: "log-1",
    });
    expect(result).toBeNull();
  });
});
