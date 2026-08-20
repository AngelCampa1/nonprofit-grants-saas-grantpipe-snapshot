import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateDraft } from "./service";

vi.mock("./openrouter", () => ({
  generateDraftWithOpenRouter: vi.fn(),
}));

const { generateDraftWithOpenRouter } = await import("./openrouter");

const grantRow = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  name: "Youth Services Grant",
  status: "active",
  amountCents: 250_000_00,
  startDate: new Date("2026-01-01T00:00:00.000Z"),
  endDate: new Date("2026-12-31T00:00:00.000Z"),
  description: "After-school services for youth.",
  funder: { name: "Community Foundation" },
  reportingRequirements: [
    {
      id: "reporting-1",
      reportType: "Interim report",
      dueDate: new Date("2026-07-31T00:00:00.000Z"),
      notes: "Include outcomes and spend.",
      deletedAt: null,
    },
    {
      id: "reporting-2",
      reportType: "Final report",
      dueDate: null,
      notes: null,
      deletedAt: null,
    },
  ],
  impactMetrics: [
    {
      id: "metric-1",
      name: "Youth served",
      targetValue: "100",
      unit: "youth",
      entries: [
        {
          id: "entry-0",
          value: "25",
          periodStart: new Date("2025-10-01T00:00:00.000Z"),
          periodEnd: new Date("2025-12-31T00:00:00.000Z"),
          deletedAt: null,
        },
        {
          id: "entry-1",
          value: "42",
          periodStart: new Date("2026-01-01T00:00:00.000Z"),
          periodEnd: new Date("2026-03-31T00:00:00.000Z"),
          deletedAt: null,
        },
      ],
      deletedAt: null,
    },
    {
      id: "metric-2",
      name: "Families served",
      targetValue: null,
      unit: null,
      entries: [],
      deletedAt: null,
    },
  ],
  budgetVersions: [
    {
      id: "budget-version-1",
      status: "approved",
      lines: [
        {
          id: "budget-line-1",
          category: "Personnel",
          approvedAmountCents: 150_000_00,
          costType: "direct",
          deletedAt: null,
        },
      ],
      deletedAt: null,
    },
  ],
};

const outcomeRows = [
  {
    id: "outcome-1",
    programId: "123e4567-e89b-12d3-a456-426614174111",
    name: "School readiness",
    statement: "Students start school ready to learn.",
    targetPopulation: "Youth in after-school programs",
    status: "active",
    indicators: [
      {
        id: "indicator-1",
        name: "Reading score",
        indicatorType: "outcome",
        direction: "increase",
        targetValue: "85",
        baselineValue: "70",
        unit: "score",
        source: "Program assessment",
        funderDefined: true,
        reportingCadence: "quarterly",
        deletedAt: null,
      },
    ],
    deletedAt: null,
  },
  {
    id: "outcome-2",
    programId: null,
    name: "Family stability",
    statement: "Families have stable support.",
    targetPopulation: null,
    status: "draft",
    indicators: [
      {
        id: "indicator-2",
        name: "Support plan",
        indicatorType: "quality",
        direction: "increase",
        targetValue: null,
        baselineValue: null,
        unit: null,
        source: null,
        funderDefined: false,
        reportingCadence: null,
        deletedAt: null,
      },
    ],
    deletedAt: null,
  },
];

const expandedGrantRow = {
  ...grantRow,
  reportingRequirements: Array.from({ length: 9 }, (_, index) => ({
    id: `reporting-${index + 1}`,
    reportType: `Report ${index + 1}`,
    dueDate: new Date("2026-07-31T00:00:00.000Z"),
    notes: `Notes ${index + 1}`,
    deletedAt: null,
  })),
  impactMetrics: Array.from({ length: 9 }, (_, index) => ({
    id: `metric-${index + 1}`,
    name: `Metric ${index + 1}`,
    targetValue: `${index + 10}`,
    unit: "people",
    entries: [],
    deletedAt: null,
  })),
  budgetVersions: [
    {
      id: "budget-version-expanded",
      status: "approved",
      lines: Array.from({ length: 11 }, (_, index) => ({
        id: `budget-line-${index + 1}`,
        category: `Category ${index + 1}`,
        approvedAmountCents: (index + 1) * 100_00,
        costType: "direct",
        deletedAt: null,
      })),
      deletedAt: null,
    },
  ],
};

const expandedOutcomeRows = Array.from({ length: 7 }, (_, index) => ({
  id: `outcome-${index + 1}`,
  programId: `program-${index + 1}`,
  name: `Outcome ${index + 1}`,
  statement: `Outcome statement ${index + 1}`,
  targetPopulation: null,
  status: "active",
  indicators: [],
  deletedAt: null,
}));

type MockQueryArgs = {
  where: (
    table: Record<string, string>,
    ops: {
      and: (...values: unknown[]) => unknown[];
      eq: (left: unknown, right: unknown) => unknown[];
      isNull: (value: unknown) => unknown[];
    },
  ) => unknown;
};

function createDb(row: unknown = grantRow, outcomes: unknown = outcomeRows) {
  return {
    query: {
      grants: {
        findFirst: vi.fn(async (args: MockQueryArgs) => {
          args.where(
            { id: "id", orgId: "orgId", deletedAt: "deletedAt" },
            {
              and: (...values: unknown[]) => values,
              eq: (left: unknown, right: unknown) => [left, right],
              isNull: (value: unknown) => ["isNull", value],
            },
          );
          return row;
        }),
      },
      outcomeGoals: {
        findMany: vi.fn(async (args: MockQueryArgs) => {
          args.where(
            { orgId: "orgId", grantId: "grantId", deletedAt: "deletedAt" },
            {
              and: (...values: unknown[]) => values,
              eq: (left: unknown, right: unknown) => [left, right],
              isNull: (value: unknown) => ["isNull", value],
            },
          );
          return outcomes;
        }),
      },
    },
  };
}

function createDbWithoutOutcomes(row: unknown) {
  return {
    query: {
      grants: {
        findFirst: vi.fn(async (args: MockQueryArgs) => {
          args.where(
            { id: "id", orgId: "orgId", deletedAt: "deletedAt" },
            {
              and: (...values: unknown[]) => values,
              eq: (left: unknown, right: unknown) => [left, right],
              isNull: (value: unknown) => ["isNull", value],
            },
          );
          return row;
        }),
      },
    },
  };
}

describe("generateDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(generateDraftWithOpenRouter).mockResolvedValue({
      draftTitle: "Draft Youth Services report",
      draftBody: "Draft body from sources.",
      sections: [{ heading: "Progress", body: "42 youth were served." }],
    });
  });

  it("grounds proposal/report drafts in the selected grant before calling OpenRouter", async () => {
    const db = createDb();

    const draft = await generateDraft(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      appUrl: "https://app.grantpipe.com",
      openRouterApiKey: "openrouter-key",
      input: {
        grantId: "123e4567-e89b-12d3-a456-426614174000",
        draftType: "interim_report",
        userPrompt: "Draft a short interim report from current sources.",
      },
    });

    expect(db.query.grants.findFirst).toHaveBeenCalledOnce();
    expect(generateDraftWithOpenRouter).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "openrouter-key",
        appUrl: "https://app.grantpipe.com",
        draftType: "interim_report",
        userPrompt: "Draft a short interim report from current sources.",
        sourceContext: expect.stringContaining("Youth Services Grant"),
      }),
    );
    expect(generateDraftWithOpenRouter).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceContext: expect.stringContaining("Youth served"),
      }),
    );
    expect(generateDraftWithOpenRouter).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceContext: expect.stringContaining("School readiness"),
      }),
    );
    expect(draft).toMatchObject({
      draftTitle: "Draft Youth Services report",
      draftType: "interim_report",
      modelId: "minimax/minimax-m2.7",
      promptVersion: "proposal-report-drafting-v1",
      citations: expect.arrayContaining([
        expect.objectContaining({
          type: "grant",
          href: "/grants/123e4567-e89b-12d3-a456-426614174000",
        }),
        expect.objectContaining({
          type: "metric",
          href: "/grants/123e4567-e89b-12d3-a456-426614174000",
        }),
        expect.objectContaining({
          type: "outcome",
          href: "/programs/123e4567-e89b-12d3-a456-426614174111",
        }),
        expect.objectContaining({
          type: "outcome",
          href: "/grants/123e4567-e89b-12d3-a456-426614174000",
        }),
      ]),
    });
    expect(draft.safeguards.join(" ")).toContain("human must review");
    expect(draft.safeguards.join(" ")).toContain("never auto-submits");
  });

  it("returns citations for every source row sent to the model context", async () => {
    const db = createDb(expandedGrantRow, expandedOutcomeRows);

    const draft = await generateDraft(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      appUrl: "https://app.grantpipe.com",
      openRouterApiKey: "openrouter-key",
      input: {
        grantId: "123e4567-e89b-12d3-a456-426614174000",
        draftType: "final_report",
        userPrompt: "Draft a final report from all available source rows.",
      },
    });

    expect(draft.citations.filter((citation) => citation.type === "report_row")).toHaveLength(8);
    expect(draft.citations.filter((citation) => citation.type === "metric")).toHaveLength(8);
    expect(draft.citations.filter((citation) => citation.type === "budget")).toHaveLength(10);
    expect(draft.citations.filter((citation) => citation.type === "outcome")).toHaveLength(6);
    expect(draft.citations.map((citation) => citation.label)).toContain("Report 8");
    expect(draft.citations.map((citation) => citation.label)).not.toContain("Report 9");
    expect(draft.citations.map((citation) => citation.label)).toContain("Category 10");
    expect(draft.citations.map((citation) => citation.label)).not.toContain("Category 11");
  });

  it("fails closed when OpenRouter is not configured", async () => {
    await expect(
      generateDraft(createDb() as never, {
        orgId: "org-1",
        actorId: "user-1",
        input: {
          grantId: "123e4567-e89b-12d3-a456-426614174000",
          draftType: "proposal_narrative",
          userPrompt: "Draft a short proposal narrative.",
        },
      }),
    ).rejects.toMatchObject({
      status: 500,
      message: "OPENROUTER_API_KEY is not configured",
    });
    expect(generateDraftWithOpenRouter).not.toHaveBeenCalled();
  });

  it("returns not found when the grant is outside the org", async () => {
    await expect(
      generateDraft(createDb(null) as never, {
        orgId: "org-1",
        actorId: "user-1",
        appUrl: "https://app.grantpipe.com",
        openRouterApiKey: "openrouter-key",
        input: {
          grantId: "123e4567-e89b-12d3-a456-426614174000",
          draftType: "final_report",
          userPrompt: "Draft a final report from the grant record.",
        },
      }),
    ).rejects.toMatchObject({ status: 404, message: "Grant not found" });
    expect(generateDraftWithOpenRouter).not.toHaveBeenCalled();
  });

  it("marks sparse source records as missing instead of inventing context", async () => {
    const sparseGrant = {
      ...grantRow,
      amountCents: null,
      startDate: "not-a-date",
      endDate: null,
      description: null,
      funder: null,
      reportingRequirements: [],
      impactMetrics: [],
      budgetVersions: [],
    };
    const db = createDbWithoutOutcomes(sparseGrant);

    await generateDraft(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      openRouterApiKey: "openrouter-key",
      input: {
        grantId: "123e4567-e89b-12d3-a456-426614174000",
        draftType: "proposal_narrative",
        userPrompt: "Draft a proposal narrative from sparse records.",
        reportPeriodStart: "2026-01-01",
      },
    });

    const sourceContext = vi
      .mocked(generateDraftWithOpenRouter)
      .mock.calls.at(-1)?.[0].sourceContext;
    expect(sourceContext).toContain("Funder: not recorded");
    expect(sourceContext).toContain("Award amount: not recorded");
    expect(sourceContext).toContain("Grant period: not recorded to not recorded");
    expect(sourceContext).toContain("Requested report period: 2026-01-01 to not specified");
    expect(sourceContext).toContain("No reporting requirements are recorded.");
    expect(sourceContext).toContain("No impact metrics are recorded.");
    expect(sourceContext).toContain("No approved budget lines are recorded.");
    expect(sourceContext).toContain("No outcome goals are recorded for this grant.");
  });

  it("fails closed if the provider returns a draft without sections", async () => {
    vi.mocked(generateDraftWithOpenRouter).mockResolvedValueOnce({
      draftTitle: "Invalid",
      draftBody: "No sections",
      sections: [],
    });

    await expect(
      generateDraft(createDb() as never, {
        orgId: "org-1",
        actorId: "user-1",
        appUrl: "https://app.grantpipe.com",
        openRouterApiKey: "openrouter-key",
        input: {
          grantId: "123e4567-e89b-12d3-a456-426614174000",
          draftType: "final_report",
          userPrompt: "Draft a final report from the grant record.",
        },
      }),
    ).rejects.toThrow();
  });
});
