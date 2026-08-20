import { beforeEach, describe, expect, it, vi } from "vitest";
import { documentExtractions, documents } from "@grantpipe/db";
import { PgDialect } from "drizzle-orm/pg-core";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(),
  recordActivityLogBestEffort: vi.fn(),
}));

vi.mock("../../lib/integrations", () => ({
  getIntegrations: vi.fn(),
}));

vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: vi.fn(),
}));

vi.mock("./openrouter", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./openrouter")>();
  return {
    ...actual,
    extractAwardDocumentWithOpenRouter: vi.fn(),
  };
});

vi.mock("@grantpipe/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@grantpipe/shared")>();
  return { ...actual };
});

import {
  cancelDocumentExtraction,
  commitDocumentExtraction,
  createDocumentExtraction,
  findBlockingCommitFields,
  getDocumentExtraction,
  isReviewedFieldStatus,
  processAwardIntakeJob,
  recordDocumentExtractionAction,
  sanitizeExtractionFailureMessage,
} from "./service";
import * as documentExtractionService from "./service";
import { getIntegrations } from "../../lib/integrations";
import { recordActivityLog, recordActivityLogBestEffort } from "../../lib/activity-log";
import { captureBackgroundException } from "../../lib/sentry";
import { extractAwardDocumentWithOpenRouter } from "./openrouter";
import * as shared from "@grantpipe/shared";

type MockDbOptions = {
  document?: unknown;
  extraction?: unknown;
  extractionRows?: unknown[];
  extractions?: unknown[];
  field?: unknown;
  mappedEntity?: unknown;
  activeGrant?: unknown;
  latestBudgetVersion?: unknown;
  fields?: unknown[];
  updateRows?: unknown[][];
  insertRows?: unknown[][];
  insertValueErrors?: Array<unknown>;
  selectRows?: unknown[][];
  transactionErrors?: Array<unknown>;
};

function makeChain(returningRows: unknown[] = [], valuesError?: unknown) {
  const chain = {
    set: vi.fn(() => chain),
    values: vi.fn(() => {
      if (valuesError) throw valuesError;
      return chain;
    }),
    where: vi.fn(() => chain),
    onConflictDoNothing: vi.fn(() => chain),
    returning: vi.fn(async () => returningRows),
  };
  return chain;
}

type MockChain = ReturnType<typeof makeChain>;

function makeMockDb(options: MockDbOptions = {}) {
  const updateRows = [...(options.updateRows ?? [])];
  const insertRows = [...(options.insertRows ?? [])];
  const insertValueErrors = [...(options.insertValueErrors ?? [])];
  const selectRows = [...(options.selectRows ?? [])];
  const extractionRows = options.extractionRows ? [...options.extractionRows] : undefined;
  const transactionErrors = [...(options.transactionErrors ?? [])];
  const extraction =
    options.extraction &&
    typeof options.extraction === "object" &&
    !Array.isArray(options.extraction)
      ? {
          document: { id: "doc-1", entityType: "grant", deletedAt: null },
          ...(options.extraction as Record<string, unknown>),
        }
      : options.extraction;
  const document =
    options.document && typeof options.document === "object" && !Array.isArray(options.document)
      ? { entityType: "award_intake", deletedAt: null, ...options.document }
      : options.document;
  const inserts: MockChain[] = [];
  const deletes: MockChain[] = [];
  const updates: MockChain[] = [];
  const query = {
    documents: {
      findFirst: vi.fn(async () => document ?? null),
    },
    documentExtractions: {
      findFirst: vi.fn(async () => extractionRows?.shift() ?? extraction ?? null),
      findMany: vi.fn(async () => options.extractions ?? []),
    },
    documentExtractionFields: {
      findFirst: vi.fn(async () => options.field ?? null),
      findMany: vi.fn(async () => options.fields ?? []),
    },
    funders: {
      findFirst: vi.fn(async () => options.mappedEntity ?? null),
    },
    grants: {
      findFirst: vi.fn(async () => options.activeGrant ?? options.mappedEntity ?? null),
    },
    grantBudgetVersions: {
      findFirst: vi.fn(async () => options.latestBudgetVersion ?? null),
    },
    funds: {
      findFirst: vi.fn(async () => options.mappedEntity ?? null),
    },
  };
  const db = {
    query,
    insert: vi.fn(() => {
      const chain = makeChain(insertRows.shift() ?? [], insertValueErrors.shift());
      inserts.push(chain);
      return chain;
    }),
    delete: vi.fn(() => {
      const chain = makeChain();
      deletes.push(chain);
      return chain;
    }),
    select: vi.fn(() => {
      const chain = {
        from: vi.fn(() => chain),
        where: vi.fn(async () => selectRows.shift() ?? [{ total: "0" }]),
      };
      return chain;
    }),
    update: vi.fn(() => {
      const chain = makeChain(updateRows.shift() ?? []);
      updates.push(chain);
      return chain;
    }),
    execute: vi.fn(async (_query: unknown) => []),
    transaction: vi.fn(async (callback: (tx: typeof db) => Promise<unknown>) => {
      const error = transactionErrors.shift();
      if (error) throw error;
      return callback(db);
    }),
  };
  return { db, deletes, inserts, updates, query };
}

function containsReference(value: unknown, target: unknown, seen = new WeakSet<object>()): boolean {
  if (value === target) return true;

  if (Array.isArray(value)) {
    return value.some((entry) => containsReference(entry, target, seen));
  }

  if (value && typeof value === "object") {
    if (seen.has(value as object)) {
      return false;
    }

    seen.add(value as object);

    return Object.values(value as Record<string, unknown>).some((entry) =>
      containsReference(entry, target, seen),
    );
  }

  return false;
}

function renderSql(condition: unknown) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(condition as Parameters<PgDialect["sqlToQuery"]>[0]);
}

function firstCallWhere(fn: unknown): unknown {
  if (!fn || (typeof fn !== "object" && typeof fn !== "function") || !("mock" in fn)) {
    return undefined;
  }
  const mock = (fn as { mock?: { calls?: unknown[][] } }).mock;
  const [options] = mock?.calls?.[0] ?? [];
  if (!options || typeof options !== "object" || !("where" in options)) return undefined;
  return (options as { where?: unknown }).where;
}

function providerResult(value: string) {
  return {
    providerRequestId: `request-${value}`,
    tokenUsage: { total_tokens: 12 },
    extraction: {
      documentType: "award_letter" as const,
      duplicateCandidates: { funders: [], grants: [] },
      fields: [
        {
          fieldKey: "grant.name",
          section: "grant_basics" as const,
          destinationEntityType: "grant" as const,
          destinationField: "name",
          value,
          confidence: 0.84,
          required: true,
          sources: [{ pageNumber: 1, snippet: value }],
        },
      ],
    },
  };
}

describe("document extraction service guardrails", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("blocks commit when required or low-confidence fields are unresolved", () => {
    expect(
      findBlockingCommitFields([
        { fieldKey: "grant.name", required: true, confidence: 98, status: "pending" },
        { fieldKey: "grant.amount", required: false, confidence: 55, status: "pending" },
        { fieldKey: "grant.notes", required: false, confidence: 95, status: "pending" },
        { fieldKey: "grant.endDate", required: true, confidence: 80, status: "accepted" },
      ]),
    ).toEqual(["grant.name", "grant.amount"]);
  });

  it("treats every explicit review decision as reviewed", () => {
    expect(isReviewedFieldStatus("accepted")).toBe(true);
    expect(isReviewedFieldStatus("edited")).toBe(true);
    expect(isReviewedFieldStatus("rejected")).toBe(true);
    expect(isReviewedFieldStatus("deferred")).toBe(true);
    expect(isReviewedFieldStatus("mapped_existing")).toBe(true);
    expect(isReviewedFieldStatus("pending")).toBe(false);
  });

  it("stores sanitized failure messages instead of provider internals", () => {
    expect(sanitizeExtractionFailureMessage(new Error("OPENROUTER_API_KEY is not set"))).toBe(
      "Award intake is not configured.",
    );
    expect(sanitizeExtractionFailureMessage(new Error("OpenRouter request failed: 500"))).toBe(
      "Award intake provider failed. Try again.",
    );
    expect(sanitizeExtractionFailureMessage(new Error("Invalid JSON schema payload"))).toBe(
      "Award document could not be parsed into the review schema.",
    );
    expect(sanitizeExtractionFailureMessage(new Error("Document file missing"))).toBe(
      "Award document file could not be read.",
    );
    expect(sanitizeExtractionFailureMessage("boom")).toBe(
      "Award intake failed. Try again or upload a clearer document.",
    );
  });

  it("rejects a Starter org that has already reached the 5-upload monthly cap", async () => {
    const send = vi.fn(async () => undefined);
    // selectRows feeds the count query inside assertAiUsageWithinCap
    const { db, inserts } = makeMockDb({
      document: { id: "doc-1" },
      selectRows: [[{ count: 5 }]],
    });

    await expect(
      createDocumentExtraction(
        db as never,
        { APP_URL: "https://grantpipe.com", AWARD_INTAKE_QUEUE: { send } },
        {
          orgId: "org-1",
          userId: "user-1",
          documentId: "doc-1",
          attemptId: "attempt-starter-cap",
          planTier: "starter",
        },
      ),
    ).rejects.toMatchObject({
      status: 402,
      errorCode: "ai_usage_cap_reached",
      details: {
        feature: "award_intake",
        cap: 5,
        used: 5,
        upgradeToPlan: "growth",
      },
    });

    // No extraction row inserted, no queue send
    expect(inserts).toHaveLength(0);
    expect(send).not.toHaveBeenCalled();
    expect(db.execute).toHaveBeenCalledOnce();
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });

  it("rechecks the attempt after serializing quota and preserves idempotency at the cap", async () => {
    const winner = { id: "ext-winner", status: "pending", documentId: "doc-1" };
    const send = vi.fn(async () => undefined);
    const { db } = makeMockDb({
      document: { id: "doc-1" },
      extractionRows: [null, winner],
      selectRows: [[{ count: 5 }]],
    });

    await expect(
      createDocumentExtraction(
        db as never,
        { APP_URL: "https://grantpipe.com", AWARD_INTAKE_QUEUE: { send } },
        {
          orgId: "org-1",
          userId: "user-1",
          documentId: "doc-1",
          attemptId: "attempt-shared-at-cap",
          planTier: "starter",
        },
      ),
    ).resolves.toEqual({ extraction: winner, created: false });

    expect(db.execute).toHaveBeenCalledOnce();
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("allows a Starter org below cap and records usage with the extraction id", async () => {
    const send = vi.fn(async () => undefined);
    // selectRows[0] = cap check (count: 4), insertRows[0] = extraction row, insertRows[1] = ai_usage_events row
    const { db, inserts } = makeMockDb({
      document: { id: "doc-1" },
      selectRows: [[{ count: 4 }]],
      insertRows: [[{ id: "ext-1", status: "pending" }], []],
    });

    const result = await createDocumentExtraction(
      db as never,
      { APP_URL: "https://grantpipe.com", AWARD_INTAKE_QUEUE: { send } },
      {
        orgId: "org-1",
        userId: "user-1",
        documentId: "doc-1",
        attemptId: "attempt-starter-allowed",
        planTier: "starter",
      },
    );

    expect(result).toEqual({
      extraction: { id: "ext-1", status: "pending" },
      created: true,
    });
    expect(send).toHaveBeenCalledWith({ extractionId: "ext-1", orgId: "org-1" });

    // Second insert is the ai_usage_events row from recordAiUsage
    expect(inserts).toHaveLength(2);
    expect(inserts[1]?.values).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: "org-1",
        feature: "award_intake",
        referenceId: "ext-1",
      }),
    );
  });

  it("does not enqueue when durable usage persistence fails", async () => {
    const send = vi.fn(async () => undefined);
    const persistenceError = new Error("simulated usage persistence failure");
    const { db } = makeMockDb({
      document: { id: "doc-1" },
      insertRows: [[{ id: "ext-1", status: "pending" }]],
      insertValueErrors: [undefined, persistenceError],
    });

    await expect(
      createDocumentExtraction(
        db as never,
        { APP_URL: "https://grantpipe.com", AWARD_INTAKE_QUEUE: { send } },
        {
          orgId: "org-1",
          userId: "user-1",
          documentId: "doc-1",
          attemptId: "attempt-persistence-failure",
          planTier: "growth",
        },
      ),
    ).rejects.toMatchObject({
      status: 503,
      body: { error: "award_intake_persistence_failed" },
    });

    expect(send).not.toHaveBeenCalled();
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(captureBackgroundException).toHaveBeenCalledWith(
      persistenceError,
      "award_intake",
      expect.objectContaining({
        org_id: "org-1",
        step: "persist_before_enqueue",
      }),
    );
  });

  it("keeps an ambiguous queue submission pending and metered", async () => {
    const sendError = new Error("response lost after acceptance");
    const send = vi.fn(async () => Promise.reject(sendError));
    const { db, deletes, updates } = makeMockDb({
      document: { id: "doc-1" },
      insertRows: [[{ id: "ext-1", status: "pending" }], []],
    });

    await expect(
      createDocumentExtraction(
        db as never,
        { APP_URL: "https://grantpipe.com", AWARD_INTAKE_QUEUE: { send } },
        {
          orgId: "org-1",
          userId: "user-1",
          documentId: "doc-1",
          attemptId: "attempt-1",
          planTier: "growth",
        },
      ),
    ).resolves.toEqual({
      extraction: { id: "ext-1", status: "pending" },
      created: true,
    });

    expect(deletes).toHaveLength(0);
    expect(updates).toHaveLength(0);
    expect(captureBackgroundException).toHaveBeenCalledWith(sendError, "award_intake", {
      org_id: "org-1",
      step: "dispatch_uncertain",
    });
  });

  it("returns the same logical extraction without repeating creator effects on client retry", async () => {
    const existing = {
      id: "ext-existing",
      status: "pending",
      documentId: "doc-2",
      dispatchRequestFingerprint: "doc-2:google/gemini-3.1-flash-lite:award-intake-v3",
    };
    const send = vi.fn(async () => undefined);
    const { db } = makeMockDb({
      document: { id: "doc-2" },
      extraction: existing,
    });

    await expect(
      createDocumentExtraction(
        db as never,
        { APP_URL: "https://grantpipe.com", AWARD_INTAKE_QUEUE: { send } },
        {
          orgId: "org-1",
          userId: "user-1",
          documentId: "doc-2",
          attemptId: "attempt-stable",
          planTier: "growth",
        },
      ),
    ).resolves.toEqual({ extraction: expect.objectContaining(existing), created: false });

    expect(db.insert).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(recordActivityLogBestEffort).not.toHaveBeenCalled();
  });

  it("rejects an attempt id reused for a different document without enqueueing", async () => {
    const send = vi.fn(async () => undefined);
    const { db } = makeMockDb({
      document: { id: "doc-new" },
      extraction: {
        id: "ext-existing",
        status: "pending",
        documentId: "doc-old",
        dispatchRequestFingerprint: "doc-old:openai/gpt-4.1-mini:award-intake-v1",
      },
    });

    await expect(
      createDocumentExtraction(
        db as never,
        { APP_URL: "https://grantpipe.com", AWARD_INTAKE_QUEUE: { send } },
        {
          orgId: "org-1",
          userId: "user-1",
          documentId: "doc-new",
          attemptId: "attempt-reused",
          planTier: "growth",
        },
      ),
    ).rejects.toMatchObject({ status: 409, errorCode: "extraction_attempt_mismatch" });

    expect(db.insert).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    { modelId: "different/model", promptVersion: "award-intake-v3" },
    { modelId: "google/gemini-3.1-flash-lite", promptVersion: "different-prompt" },
  ])("rejects an attempt reused after provider request identity drift", async (identity) => {
    const send = vi.fn(async () => undefined);
    const { db } = makeMockDb({
      document: { id: "doc-1" },
      extraction: {
        id: "ext-existing",
        status: "pending",
        documentId: "doc-1",
        dispatchRequestFingerprint: null,
        ...identity,
      },
    });

    await expect(
      createDocumentExtraction(
        db as never,
        { APP_URL: "https://grantpipe.com", AWARD_INTAKE_QUEUE: { send } },
        {
          orgId: "org-1",
          userId: "user-1",
          documentId: "doc-1",
          attemptId: "attempt-reused",
          planTier: "growth",
        },
      ),
    ).rejects.toMatchObject({ status: 409, errorCode: "extraction_attempt_mismatch" });
    expect(send).not.toHaveBeenCalled();
  });

  it("returns the winning extraction when concurrent requests race on the attempt id", async () => {
    const winner = { id: "ext-winner", status: "pending", documentId: "doc-1" };
    const send = vi.fn(async () => undefined);
    const { db, inserts } = makeMockDb({
      document: { id: "doc-1" },
      extractionRows: [null, winner],
      insertRows: [[]],
    });

    await expect(
      createDocumentExtraction(
        db as never,
        { APP_URL: "https://grantpipe.com", AWARD_INTAKE_QUEUE: { send } },
        {
          orgId: "org-1",
          userId: "user-1",
          documentId: "doc-1",
          attemptId: "attempt-shared",
          planTier: "growth",
        },
      ),
    ).resolves.toEqual({ extraction: winner, created: false });

    expect(inserts).toHaveLength(1);
    expect(send).not.toHaveBeenCalled();
    expect(recordActivityLogBestEffort).not.toHaveBeenCalled();
  });

  it("redispatches persisted pending rows and isolates definite send failures", async () => {
    expect(documentExtractionService).toHaveProperty("redispatchPendingAwardIntakes");
    const redispatchPendingAwardIntakes = Reflect.get(
      documentExtractionService,
      "redispatchPendingAwardIntakes",
    ) as (
      db: unknown,
      env: { AWARD_INTAKE_QUEUE: { send: (message: unknown) => Promise<void> } },
    ) => Promise<{ attempted: number; dispatched: number; failed: number }>;
    const send = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("queue unavailable"));
    const { db } = makeMockDb({
      extractions: [
        { id: "ext-1", orgId: "org-1" },
        { id: "ext-2", orgId: "org-2" },
      ],
    });

    await expect(
      redispatchPendingAwardIntakes(db as never, { AWARD_INTAKE_QUEUE: { send } }),
    ).resolves.toEqual({ attempted: 2, dispatched: 1, failed: 1 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(captureBackgroundException).toHaveBeenCalledWith(expect.any(Error), "award_intake", {
      org_id: "org-2",
      step: "redispatch_pending",
    });
  });

  it("reports Starter as the current plan when the plan tier is omitted", async () => {
    const { db } = makeMockDb({
      document: { id: "doc-1" },
    });
    const hasAwardDocumentIntakeSpy = vi
      .spyOn(shared, "hasAwardDocumentIntake")
      .mockReturnValueOnce(false);

    await expect(
      createDocumentExtraction(
        db as never,
        { APP_URL: "https://grantpipe.com" },
        {
          orgId: "org-1",
          userId: "user-1",
          documentId: "doc-1",
          attemptId: "attempt-no-plan",
          planTier: undefined,
        },
      ),
    ).rejects.toMatchObject({
      status: 402,
      body: expect.objectContaining({ current: "starter" }),
    });
    hasAwardDocumentIntakeSpy.mockRestore();
  });

  it("never queries the usage cap for Growth orgs and always succeeds without a cap error", async () => {
    const send = vi.fn(async () => undefined);
    // No selectRows — assertAiUsageWithinCap must not call db.select for growth
    const { db } = makeMockDb({
      document: { id: "doc-1" },
      insertRows: [[{ id: "ext-1", status: "pending" }], []],
    });

    const result = await createDocumentExtraction(
      db as never,
      { APP_URL: "https://grantpipe.com", AWARD_INTAKE_QUEUE: { send } },
      {
        orgId: "org-1",
        userId: "user-1",
        documentId: "doc-1",
        attemptId: "attempt-growth-cap",
        planTier: "growth",
      },
    );

    expect(result).toEqual({
      extraction: { id: "ext-1", status: "pending" },
      created: true,
    });
    expect(send).toHaveBeenCalledWith({ extractionId: "ext-1", orgId: "org-1" });
    // db.select is not called for uncapped plans
    expect(db.select).not.toHaveBeenCalled();
  });

  it("keeps durable usage and pending extraction when queue dispatch fails", async () => {
    const sendError = new Error("queue down");
    const { db, deletes, inserts, updates } = makeMockDb({
      document: { id: "doc-1" },
      insertRows: [[{ id: "ext-1", status: "pending" }]],
    });

    await expect(
      createDocumentExtraction(
        db as never,
        {
          APP_URL: "https://grantpipe.com",
          AWARD_INTAKE_QUEUE: { send: vi.fn(async () => Promise.reject(sendError)) },
        },
        {
          orgId: "org-1",
          userId: "user-1",
          documentId: "doc-1",
          attemptId: "attempt-dispatch-failure",
          planTier: "growth",
        },
      ),
    ).resolves.toEqual({
      extraction: { id: "ext-1", status: "pending" },
      created: true,
    });

    expect(inserts).toHaveLength(2);
    expect(deletes).toHaveLength(0);
    expect(updates).toHaveLength(0);
    expect(captureBackgroundException).toHaveBeenCalledWith(sendError, "award_intake", {
      org_id: "org-1",
      step: "dispatch_uncertain",
    });
  });

  it("records activity after persisting a recoverable queue dispatch", async () => {
    const { db, updates } = makeMockDb({
      document: { id: "doc-1" },
      insertRows: [[{ id: "ext-1", status: "pending" }]],
    });

    await expect(
      createDocumentExtraction(
        db as never,
        {
          APP_URL: "https://grantpipe.com",
          AWARD_INTAKE_QUEUE: { send: vi.fn(async () => Promise.reject(new Error("queue down"))) },
        },
        {
          orgId: "org-1",
          userId: "user-1",
          documentId: "doc-1",
          attemptId: "attempt-activity",
          planTier: "growth",
        },
      ),
    ).resolves.toEqual({
      extraction: { id: "ext-1", status: "pending" },
      created: true,
    });
    expect(updates).toHaveLength(0);
    expect(recordActivityLogBestEffort).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        action: "created",
        entityType: "document_extraction",
        entityId: "ext-1",
      }),
    );
  });

  it("rejects extraction creation for non-award-intake documents", async () => {
    const send = vi.fn(async () => undefined);
    const { db } = makeMockDb({
      document: { id: "doc-1", entityType: "grant", deletedAt: null },
      insertRows: [[{ id: "ext-1", status: "pending" }]],
    });

    await expect(
      createDocumentExtraction(
        db as never,
        { APP_URL: "https://grantpipe.com", AWARD_INTAKE_QUEUE: { send } },
        {
          orgId: "org-1",
          userId: "user-1",
          documentId: "doc-1",
          attemptId: "attempt-wrong-document",
          planTier: "growth",
        },
      ),
    ).rejects.toMatchObject({ status: 403 });

    expect(send).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("creates and queues an extraction for growth plans", async () => {
    const send = vi.fn(async () => undefined);
    const { db } = makeMockDb({
      document: { id: "doc-1" },
      insertRows: [[{ id: "ext-1", status: "pending" }]],
    });

    await expect(
      createDocumentExtraction(
        db as never,
        { APP_URL: "https://grantpipe.com", AWARD_INTAKE_QUEUE: { send } },
        {
          orgId: "org-1",
          userId: "user-1",
          documentId: "doc-1",
          attemptId: "attempt-growth-create",
          planTier: "growth",
        },
      ),
    ).resolves.toEqual({
      extraction: { id: "ext-1", status: "pending" },
      created: true,
    });
    expect(send).toHaveBeenCalledWith({ extractionId: "ext-1", orgId: "org-1" });

    const noRowDb = makeMockDb({ document: { id: "doc-1" } }).db;
    await expect(
      createDocumentExtraction(
        noRowDb as never,
        { APP_URL: "https://grantpipe.com", AWARD_INTAKE_QUEUE: { send } },
        {
          orgId: "org-1",
          userId: "user-1",
          documentId: "doc-1",
          attemptId: "attempt-no-row",
          planTier: "growth",
        },
      ),
    ).rejects.toThrow("Failed to create document extraction");
  });

  it("guards plan, queue, and missing document before creating an extraction", async () => {
    const { db } = makeMockDb();

    // The 402 plan gate is unreachable via any real PlanTier (all tiers now have
    // hasAwardDocumentIntake = true). Cover the branch by mocking the helper.
    const hasAwardDocumentIntakeSpy = vi
      .spyOn(shared, "hasAwardDocumentIntake")
      .mockReturnValueOnce(false);
    await expect(
      createDocumentExtraction(
        db as never,
        { APP_URL: "https://grantpipe.com" },
        {
          orgId: "org-1",
          userId: "user-1",
          documentId: "doc-1",
          attemptId: "attempt-plan-gate",
          planTier: "starter",
        },
      ),
    ).rejects.toMatchObject({ status: 402 });
    hasAwardDocumentIntakeSpy.mockRestore();

    // Queue guard: plan passes (growth) but AWARD_INTAKE_QUEUE is not configured
    await expect(
      createDocumentExtraction(
        db as never,
        { APP_URL: "https://grantpipe.com" },
        {
          orgId: "org-1",
          userId: "user-1",
          documentId: "doc-1",
          attemptId: "attempt-queue-gate",
          planTier: "growth",
        },
      ),
    ).rejects.toMatchObject({ status: 500, body: { error: "award_intake_not_configured" } });

    // Document-not-found guard: plan and queue pass but document is missing
    const missingDocumentDb = makeMockDb().db;
    await expect(
      createDocumentExtraction(
        missingDocumentDb as never,
        { APP_URL: "https://grantpipe.com", AWARD_INTAKE_QUEUE: { send: vi.fn() } },
        {
          orgId: "org-1",
          userId: "user-1",
          documentId: "doc-1",
          attemptId: "attempt-missing-document",
          planTier: "growth",
        },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("only starts extraction for active documents", async () => {
    const send = vi.fn(async () => undefined);
    const { db, query } = makeMockDb({
      document: { id: "doc-1" },
      insertRows: [[{ id: "ext-1", status: "pending" }]],
    });

    await createDocumentExtraction(
      db as never,
      { APP_URL: "https://grantpipe.com", AWARD_INTAKE_QUEUE: { send } },
      {
        orgId: "org-1",
        userId: "user-1",
        documentId: "doc-1",
        attemptId: "attempt-active-document",
        planTier: "growth",
      },
    );

    const where = firstCallWhere(query.documents.findFirst);

    expect(containsReference(where, documents.deletedAt)).toBe(true);
    expect(renderSql(where).sql.toLowerCase()).toContain('"documents"."deleted_at" is null');
  });

  it("reads extraction details and records review actions", async () => {
    const { db, updates, inserts } = makeMockDb({
      extraction: { id: "ext-1", status: "ready_for_review" },
      field: { id: "field-1" },
      insertRows: [[{ id: "action-1" }]],
    });

    await expect(
      getDocumentExtraction(db as never, { orgId: "org-1", extractionId: "missing" }),
    ).resolves.toMatchObject({ id: "ext-1", status: "ready_for_review" });
    const action = await recordDocumentExtractionAction(db as never, {
      orgId: "org-1",
      userId: "user-1",
      extractionId: "ext-1",
      input: { fieldId: "field-1", action: "edit", nextValue: "Edited" },
    });

    expect(action).toEqual({ id: "action-1" });
    expect(inserts[0]).toBeDefined();
    expect(updates[0]?.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "edited", normalizedValueJson: "Edited" }),
    );

    await expect(
      getDocumentExtraction(makeMockDb().db as never, {
        orgId: "org-1",
        extractionId: "missing",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("coerces an edited money field to cents so the committed amount is never dropped", async () => {
    const { db, updates } = makeMockDb({
      extraction: { id: "ext-1", status: "ready_for_review" },
      field: {
        id: "field-amount",
        destinationEntityType: "grant",
        destinationField: "amountCents",
      },
      insertRows: [[{ id: "action-1" }]],
    });

    await recordDocumentExtractionAction(db as never, {
      orgId: "org-1",
      userId: "user-1",
      extractionId: "ext-1",
      input: { fieldId: "field-amount", action: "edit", nextValue: "$50,000" },
    });

    expect(updates[0]?.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "edited", normalizedValueJson: 5000000 }),
    );
  });

  it("preserves the extracted value when accepting a field without a replacement", async () => {
    const { db, updates } = makeMockDb({
      extraction: { id: "ext-1", status: "ready_for_review" },
      field: {
        id: "field-amount",
        destinationEntityType: "grant",
        destinationField: "amountCents",
        valueJson: "$50,000",
        normalizedValueJson: 5000000,
      },
      insertRows: [[{ id: "action-1" }]],
    });

    await recordDocumentExtractionAction(db as never, {
      orgId: "org-1",
      userId: "user-1",
      extractionId: "ext-1",
      input: { fieldId: "field-amount", action: "accept" },
    });

    expect(updates[0]?.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "accepted", normalizedValueJson: 5000000 }),
    );
  });

  it("leaves an edited non-money field value untouched", async () => {
    const { db, updates } = makeMockDb({
      extraction: { id: "ext-1", status: "ready_for_review" },
      field: { id: "field-name", destinationEntityType: "grant", destinationField: "name" },
      insertRows: [[{ id: "action-1" }]],
    });

    await recordDocumentExtractionAction(db as never, {
      orgId: "org-1",
      userId: "user-1",
      extractionId: "ext-1",
      input: { fieldId: "field-name", action: "edit", nextValue: "Renamed Award" },
    });

    expect(updates[0]?.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "edited", normalizedValueJson: "Renamed Award" }),
    );
  });

  it("blocks extraction details when the linked document is outside the caller allowlist", async () => {
    const { db } = makeMockDb({
      extraction: {
        id: "ext-1",
        status: "ready_for_review",
        document: { id: "doc-1", entityType: "contact" },
      },
    });

    await expect(
      getDocumentExtraction(db as never, {
        orgId: "org-1",
        extractionId: "ext-1",
        allowedDocumentEntityTypes: ["grant"],
      }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("blocks extraction details when the linked source document is deleted", async () => {
    const { db } = makeMockDb({
      extraction: {
        id: "ext-1",
        status: "ready_for_review",
        document: {
          id: "doc-1",
          entityType: "grant",
          deletedAt: new Date("2026-05-26T00:00:00.000Z"),
        },
      },
    });

    await expect(
      getDocumentExtraction(db as never, {
        orgId: "org-1",
        extractionId: "ext-1",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects invalid review actions and inaccessible mapped entities", async () => {
    const processingDb = makeMockDb({ extraction: { id: "ext-1", status: "processing" } }).db;
    await expect(
      recordDocumentExtractionAction(processingDb as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
        input: { fieldId: "field-1", action: "accept" },
      }),
    ).rejects.toMatchObject({ status: 409 });

    const missingFieldDb = makeMockDb({
      extraction: { id: "ext-1", status: "ready_for_review" },
    }).db;
    await expect(
      recordDocumentExtractionAction(missingFieldDb as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
        input: { fieldId: "field-1", action: "accept" },
      }),
    ).rejects.toMatchObject({ status: 404 });

    const missingMappedDb = makeMockDb({
      extraction: { id: "ext-1", status: "ready_for_review" },
      field: { id: "field-1" },
    }).db;
    await expect(
      recordDocumentExtractionAction(missingMappedDb as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
        input: {
          fieldId: "field-1",
          action: "map_existing",
          mappedEntityType: "grant",
          mappedEntityId: "grant-1",
        },
      }),
    ).rejects.toMatchObject({ status: 404 });

    for (const entityType of ["funder", "grant", "fund"] as const) {
      const mappedDb = makeMockDb({
        extraction: { id: "ext-1", status: "ready_for_review" },
        field: { id: "field-1" },
        mappedEntity: { id: `${entityType}-1` },
        insertRows: [[{ id: "action-1" }]],
      }).db;
      await expect(
        recordDocumentExtractionAction(mappedDb as never, {
          orgId: "org-1",
          userId: "user-1",
          extractionId: "ext-1",
          input: {
            fieldId: "field-1",
            action: "map_existing",
            mappedEntityType: entityType,
            mappedEntityId: `${entityType}-1`,
          },
        }),
      ).resolves.toEqual({ id: "action-1" });
    }

    for (const action of ["accept", "reject", "defer"] as const) {
      const actionDb = makeMockDb({
        extraction: { id: "ext-1", status: "ready_for_review" },
        field: { id: "field-1" },
        insertRows: [[{ id: `action-${action}` }]],
      }).db;
      await expect(
        recordDocumentExtractionAction(actionDb as never, {
          orgId: "org-1",
          userId: "user-1",
          extractionId: "ext-1",
          input: { fieldId: "field-1", action },
        }),
      ).resolves.toEqual({ id: `action-${action}` });
    }
  });

  it("cancels active extractions and distinguishes missing from non-cancelable rows", async () => {
    const canceledDb = makeMockDb({ updateRows: [[{ id: "ext-1", status: "canceled" }]] });
    await expect(
      cancelDocumentExtraction(canceledDb.db as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
      }),
    ).resolves.toEqual({ id: "ext-1", status: "canceled" });

    const committedDb = makeMockDb({ extraction: { id: "ext-1", status: "committed" } }).db;
    await expect(
      cancelDocumentExtraction(committedDb as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
      }),
    ).rejects.toMatchObject({ status: 409 });

    const missingDb = makeMockDb().db;
    await expect(
      cancelDocumentExtraction(missingDb as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "missing",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("processes award intake jobs into review fields and sources", async () => {
    vi.mocked(getIntegrations).mockReturnValue({
      storage: { get: vi.fn(async () => ({ body: "award body" })) },
    } as never);
    vi.mocked(extractAwardDocumentWithOpenRouter).mockResolvedValue({
      providerRequestId: "req-1",
      tokenUsage: { total_tokens: 12 },
      extraction: {
        documentType: "award_letter",
        duplicateCandidates: { funders: [], grants: [] },
        fields: [
          {
            fieldKey: "grant.name",
            section: "grant_basics",
            destinationEntityType: "grant",
            destinationField: "name",
            value: "Youth STEM",
            confidence: 0.84,
            required: true,
            sources: [{ pageNumber: 1, snippet: "Youth STEM" }],
          },
        ],
      },
    });
    const { db, inserts, updates } = makeMockDb({
      document: {
        id: "doc-1",
        fileKey: "award.pdf",
        filename: "award.pdf",
        mimeType: "application/pdf",
      },
      updateRows: [
        [{ id: "ext-1", documentId: "doc-1" }],
        [{ rawNormalizedJson: providerResult("Youth STEM").extraction }],
        [{ id: "ext-1", status: "ready_for_review" }],
      ],
      insertRows: [[{ id: "field-1" }], []],
    });

    await processAwardIntakeJob(
      db as never,
      {
        APP_URL: "https://grantpipe.com",
        OPENROUTER_API_KEY: "key",
      },
      { orgId: "org-1", extractionId: "ext-1" },
    );

    expect(updates[2]?.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ready_for_review" }),
    );
    expect(updates[1]?.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "provider_result_pending", providerRequestId: "req-1" }),
    );
    expect(inserts[0]?.values).toHaveBeenCalledWith(
      expect.objectContaining({ fieldKey: "grant.name", confidence: 84 }),
    );
    expect(inserts[1]?.values).toHaveBeenCalledWith([
      expect.objectContaining({ fieldId: "field-1", snippet: "Youth STEM" }),
    ]);
  });

  it("retries transient result persistence without repeating provider work", async () => {
    vi.mocked(getIntegrations).mockReturnValue({
      storage: { get: vi.fn(async () => ({ body: "award body" })) },
    } as never);
    vi.mocked(extractAwardDocumentWithOpenRouter).mockResolvedValue({
      ...providerResult("Retry result"),
      providerRequestId: "req-once",
    });
    const transient = Object.assign(new Error("connection reset by peer"), { code: "08006" });
    const { db, updates } = makeMockDb({
      document: {
        id: "doc-1",
        fileKey: "award.pdf",
        filename: "award.pdf",
        mimeType: "application/pdf",
      },
      updateRows: [
        [{ id: "ext-1", documentId: "doc-1" }],
        [{ rawNormalizedJson: providerResult("Retry result").extraction }],
        [{ id: "ext-1", status: "ready_for_review" }],
      ],
      transactionErrors: [transient],
    });

    await processAwardIntakeJob(
      db as never,
      { APP_URL: "https://grantpipe.com", OPENROUTER_API_KEY: "key" },
      { orgId: "org-1", extractionId: "ext-1" },
    );

    expect(extractAwardDocumentWithOpenRouter).toHaveBeenCalledOnce();
    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(updates[1]?.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "provider_result_pending", providerRequestId: "req-once" }),
    );
    expect(updates[2]?.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ready_for_review" }),
    );
  });

  it("materializes a durably staged provider result without calling the provider again", async () => {
    const extraction = {
      documentType: "award_letter",
      duplicateCandidates: { funders: [], grants: [] },
      fields: [
        {
          fieldKey: "grant.name",
          section: "grant_basics",
          destinationEntityType: "grant",
          destinationField: "name",
          value: "Youth STEM",
          confidence: 0.84,
          required: true,
          sources: [{ pageNumber: 1, snippet: "Youth STEM" }],
        },
      ],
    };
    const { db, updates } = makeMockDb({
      extraction: {
        id: "ext-1",
        documentId: "doc-1",
        status: "provider_result_pending",
        rawNormalizedJson: extraction,
      },
      updateRows: [[{ id: "ext-1", status: "ready_for_review" }]],
      insertRows: [[{ id: "field-1" }], []],
    });

    await processAwardIntakeJob(
      db as never,
      { APP_URL: "https://grantpipe.com", OPENROUTER_API_KEY: "key" },
      { orgId: "org-1", extractionId: "ext-1" },
    );

    expect(extractAwardDocumentWithOpenRouter).not.toHaveBeenCalled();
    expect(getIntegrations).not.toHaveBeenCalled();
    expect(updates[0]?.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ready_for_review" }),
    );
  });

  it("materializes the CAS-staged row instead of the provider result held in memory", async () => {
    const workerResult = providerResult("Worker A");
    const persistedResult = providerResult("Persisted winner");
    vi.mocked(getIntegrations).mockReturnValue({
      storage: { get: vi.fn(async () => ({ body: "award body" })) },
    } as never);
    vi.mocked(extractAwardDocumentWithOpenRouter).mockResolvedValue(workerResult);
    const { db, inserts } = makeMockDb({
      document: {
        id: "doc-1",
        fileKey: "award.pdf",
        filename: "award.pdf",
        mimeType: "application/pdf",
      },
      extractionRows: [null],
      updateRows: [
        [{ id: "ext-1", documentId: "doc-1", status: "processing" }],
        [
          {
            id: "ext-1",
            status: "provider_result_pending",
            rawNormalizedJson: persistedResult.extraction,
            tokenUsageJson: persistedResult.tokenUsage,
            providerRequestId: persistedResult.providerRequestId,
          },
        ],
        [{ id: "ext-1", status: "ready_for_review" }],
      ],
      insertRows: [[{ id: "field-1" }], []],
    });

    await processAwardIntakeJob(
      db as never,
      { APP_URL: "https://grantpipe.com", OPENROUTER_API_KEY: "key" },
      { orgId: "org-1", extractionId: "ext-1" },
    );

    expect(inserts[0]?.values).toHaveBeenCalledWith(
      expect.objectContaining({ valueJson: "Persisted winner" }),
    );
    expect(inserts[0]?.values).not.toHaveBeenCalledWith(
      expect.objectContaining({ valueJson: "Worker A" }),
    );
  });

  it("uses a competing worker's staged result after losing the provider-stage CAS", async () => {
    const persistedResult = providerResult("Worker B");
    vi.mocked(getIntegrations).mockReturnValue({
      storage: { get: vi.fn(async () => ({ body: "award body" })) },
    } as never);
    vi.mocked(extractAwardDocumentWithOpenRouter).mockResolvedValue(providerResult("Worker A"));
    const { db, inserts } = makeMockDb({
      document: {
        id: "doc-1",
        fileKey: "award.pdf",
        filename: "award.pdf",
        mimeType: "application/pdf",
      },
      extractionRows: [
        null,
        {
          id: "ext-1",
          status: "provider_result_pending",
          rawNormalizedJson: persistedResult.extraction,
        },
      ],
      updateRows: [
        [{ id: "ext-1", documentId: "doc-1", status: "processing" }],
        [],
        [{ id: "ext-1", status: "ready_for_review" }],
      ],
      insertRows: [[{ id: "field-1" }], []],
    });

    await processAwardIntakeJob(
      db as never,
      { APP_URL: "https://grantpipe.com", OPENROUTER_API_KEY: "key" },
      { orgId: "org-1", extractionId: "ext-1" },
    );

    expect(inserts[0]?.values).toHaveBeenCalledWith(
      expect.objectContaining({ valueJson: "Worker B" }),
    );
  });

  it.each(["processing", "canceled", null])(
    "does not poison a %s row after losing provider-stage ownership",
    async (status) => {
      vi.mocked(getIntegrations).mockReturnValue({
        storage: { get: vi.fn(async () => ({ body: "award body" })) },
      } as never);
      vi.mocked(extractAwardDocumentWithOpenRouter).mockResolvedValue(providerResult("Worker A"));
      const { db, updates } = makeMockDb({
        document: {
          id: "doc-1",
          fileKey: "award.pdf",
          filename: "award.pdf",
          mimeType: "application/pdf",
        },
        extractionRows: [
          null,
          status === null
            ? null
            : { id: "ext-1", status, processingClaimToken: "different-worker" },
        ],
        updateRows: [[{ id: "ext-1", documentId: "doc-1", status: "processing" }], []],
      });

      const promise = processAwardIntakeJob(
        db as never,
        { APP_URL: "https://grantpipe.com", OPENROUTER_API_KEY: "key" },
        { orgId: "org-1", extractionId: "ext-1" },
      );
      if (status !== "canceled") {
        await expect(promise).rejects.toThrow("Award intake provider-stage ownership lost");
      } else {
        await expect(promise).resolves.toBeUndefined();
      }
      expect(updates).toHaveLength(2);
      expect(captureBackgroundException).toHaveBeenCalledWith(
        expect.anything(),
        "award_intake",
        expect.objectContaining({ step: "provider_stage_cas_miss" }),
      );
    },
  );

  it("only processes queued extractions for active documents", async () => {
    vi.mocked(getIntegrations).mockReturnValue({
      storage: { get: vi.fn(async () => null) },
    } as never);
    const { db, query } = makeMockDb({
      document: { id: "doc-1", fileKey: "file-1" },
      updateRows: [[{ id: "ext-1", documentId: "doc-1" }]],
    });

    await processAwardIntakeJob(
      db as never,
      { APP_URL: "https://grantpipe.com", OPENROUTER_API_KEY: "test-key" },
      { extractionId: "ext-1", orgId: "org-1" },
    );

    const where = firstCallWhere(query.documents.findFirst);

    expect(containsReference(where, documents.deletedAt)).toBe(true);
    expect(renderSql(where).sql.toLowerCase()).toContain('"documents"."deleted_at" is null');
  });

  it("records sanitized failure details when award intake processing fails", async () => {
    const { db, updates } = makeMockDb({
      updateRows: [
        [{ id: "ext-1", documentId: "doc-1" }],
        [{ rawNormalizedJson: providerResult("Youth STEM").extraction }],
        [],
      ],
    });

    await processAwardIntakeJob(
      db as never,
      {
        APP_URL: "https://grantpipe.com",
      },
      { orgId: "org-1", extractionId: "ext-1" },
    );

    expect(updates[1]?.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        failureMessage: "Award intake is not configured.",
      }),
    );
    expect(captureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Award intake processing failed" }),
      "award_intake",
      {
        org_id: "org-1",
        extraction_id: "ext-1",
        step: "process_award_intake_job",
      },
    );
    const sentryCalls = vi.mocked(captureBackgroundException).mock.calls;
    expect(sentryCalls).not.toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          expect.objectContaining({ message: "OPENROUTER_API_KEY is not set" }),
        ]),
      ]),
    );
    expect(JSON.stringify(sentryCalls)).not.toContain("award body");
  });

  it("resets retryable provider failures to pending and rethrows for queue retry", async () => {
    vi.mocked(getIntegrations).mockReturnValue({
      storage: { get: vi.fn(async () => ({ body: "award body" })) },
    } as never);
    vi.mocked(extractAwardDocumentWithOpenRouter).mockRejectedValue(
      new Error("OpenRouter extraction failed with status 429"),
    );
    const { db, updates } = makeMockDb({
      document: {
        id: "doc-1",
        entityType: "award_intake",
        fileKey: "award.pdf",
        filename: "award.pdf",
        mimeType: "application/pdf",
      },
      updateRows: [[{ id: "ext-1", documentId: "doc-1" }], []],
    });

    await expect(
      processAwardIntakeJob(
        db as never,
        { APP_URL: "https://grantpipe.com", OPENROUTER_API_KEY: "key" },
        { orgId: "org-1", extractionId: "ext-1" },
      ),
    ).rejects.toThrow("OpenRouter extraction failed with status 429");

    expect(updates[1]?.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        failureMessage: "Award intake provider failed. Try again.",
      }),
    );
    expect(updates[1]?.set).toHaveBeenCalledWith(
      expect.not.objectContaining({ completedAt: expect.any(Date) }),
    );
  });

  it("does not terminally fail processing jobs for non-award-intake documents", async () => {
    const { db, updates } = makeMockDb({
      document: {
        id: "doc-1",
        entityType: "grant",
        fileKey: "award.pdf",
        filename: "award.pdf",
        mimeType: "application/pdf",
      },
      updateRows: [[{ id: "ext-1", documentId: "doc-1" }], []],
    });

    await processAwardIntakeJob(
      db as never,
      { APP_URL: "https://grantpipe.com", OPENROUTER_API_KEY: "key" },
      { orgId: "org-1", extractionId: "ext-1" },
    );

    expect(updates[1]?.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        failureMessage: "Award intake source document is not eligible.",
      }),
    );
    expect(updates[1]?.set).toHaveBeenCalledWith(
      expect.not.objectContaining({ completedAt: expect.any(Date) }),
    );
    expect(getIntegrations).not.toHaveBeenCalled();
    expect(extractAwardDocumentWithOpenRouter).not.toHaveBeenCalled();
  });

  it("claims stale processing jobs for award intake retry", async () => {
    vi.mocked(getIntegrations).mockReturnValue({
      storage: { get: vi.fn(async () => ({ body: "award body" })) },
    } as never);
    vi.mocked(extractAwardDocumentWithOpenRouter).mockResolvedValue({
      ...providerResult("Stale result"),
      providerRequestId: null,
      tokenUsage: null,
    });
    const { db, updates } = makeMockDb({
      document: {
        id: "doc-1",
        entityType: "award_intake",
        fileKey: "award.pdf",
        filename: "award.pdf",
        mimeType: "application/pdf",
      },
      updateRows: [
        [{ id: "ext-1", documentId: "doc-1", status: "processing" }],
        [{ rawNormalizedJson: providerResult("Stale result").extraction }],
        [{ id: "ext-1", status: "ready_for_review" }],
      ],
    });

    await processAwardIntakeJob(
      db as never,
      { APP_URL: "https://grantpipe.com", OPENROUTER_API_KEY: "key" },
      { orgId: "org-1", extractionId: "ext-1" },
    );

    const where = (updates[0]?.where.mock.calls[0] as unknown[] | undefined)?.[0];

    expect(containsReference(where, documentExtractions.updatedAt)).toBe(true);
    expect(renderSql(where).sql.toLowerCase()).toContain('"document_extractions"."status" = $3 or');
    expect(updates[2]?.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ready_for_review" }),
    );
  });

  it("skips stale processing claims and handles storage failure variants", async () => {
    const staleDb = makeMockDb({ updateRows: [[]] });
    await processAwardIntakeJob(
      staleDb.db as never,
      { APP_URL: "https://grantpipe.com", OPENROUTER_API_KEY: "key" },
      { orgId: "org-1", extractionId: "ext-1" },
    );
    expect(staleDb.db.transaction).not.toHaveBeenCalled();

    const missingDocumentDb = makeMockDb({
      updateRows: [
        [{ id: "ext-1", documentId: "doc-1" }],
        [{ rawNormalizedJson: providerResult("Youth STEM").extraction }],
        [],
      ],
    });
    await processAwardIntakeJob(
      missingDocumentDb.db as never,
      { APP_URL: "https://grantpipe.com", OPENROUTER_API_KEY: "key" },
      { orgId: "org-1", extractionId: "ext-1" },
    );
    expect(missingDocumentDb.updates[1]?.set).toHaveBeenCalledWith(
      expect.objectContaining({
        failureMessage: "Award intake failed. Try again or upload a clearer document.",
      }),
    );

    for (const object of [null, { body: null }]) {
      vi.mocked(getIntegrations).mockReturnValue({
        storage: { get: vi.fn(async () => object) },
      } as never);
      const storageDb = makeMockDb({
        document: {
          id: "doc-1",
          fileKey: "award.pdf",
          filename: "award.pdf",
          mimeType: "application/pdf",
        },
        updateRows: [[{ id: "ext-1", documentId: "doc-1" }], []],
      });
      await processAwardIntakeJob(
        storageDb.db as never,
        { APP_URL: "https://grantpipe.com", OPENROUTER_API_KEY: "key" },
        { orgId: "org-1", extractionId: "ext-1" },
      );
      expect(storageDb.updates[1]?.set).toHaveBeenCalledWith(
        expect.objectContaining({ failureMessage: "Award document file could not be read." }),
      );
    }

    vi.mocked(getIntegrations).mockReturnValue({
      storage: { get: vi.fn(async () => ({ body: "award body" })) },
    } as never);
    vi.mocked(extractAwardDocumentWithOpenRouter).mockResolvedValue({
      providerRequestId: null,
      tokenUsage: null,
      extraction: {
        documentType: "award_letter",
        duplicateCandidates: { funders: [], grants: [] },
        fields: [
          {
            fieldKey: "grant.name",
            section: "grant_basics",
            destinationEntityType: "grant",
            destinationField: "name",
            value: "Youth STEM",
            confidence: 0.8,
            required: true,
            sources: [{ snippet: "Youth STEM" }],
          },
        ],
      },
    });
    const noReadyDb = makeMockDb({
      document: {
        id: "doc-1",
        fileKey: "award.pdf",
        filename: "award.pdf",
        mimeType: "application/pdf",
      },
      updateRows: [
        [{ id: "ext-1", documentId: "doc-1" }],
        [{ rawNormalizedJson: providerResult("Youth STEM").extraction }],
        [],
      ],
    });
    await processAwardIntakeJob(
      noReadyDb.db as never,
      { APP_URL: "https://grantpipe.com", OPENROUTER_API_KEY: "key" },
      { orgId: "org-1", extractionId: "ext-1" },
    );
    expect(noReadyDb.inserts).toHaveLength(0);

    const noFieldRowDb = makeMockDb({
      document: {
        id: "doc-1",
        fileKey: "award.pdf",
        filename: "award.pdf",
        mimeType: "application/pdf",
      },
      updateRows: [
        [{ id: "ext-1", documentId: "doc-1" }],
        [{ rawNormalizedJson: providerResult("Youth STEM").extraction }],
        [{ id: "ext-1" }],
      ],
      insertRows: [[]],
    });
    await processAwardIntakeJob(
      noFieldRowDb.db as never,
      { APP_URL: "https://grantpipe.com", OPENROUTER_API_KEY: "key" },
      { orgId: "org-1", extractionId: "ext-1" },
    );
    expect(noFieldRowDb.inserts).toHaveLength(1);
  });

  it("commits reviewed extraction fields into grant setup records", async () => {
    const fields = [
      {
        id: "field-funder",
        fieldKey: "funder.name",
        destinationEntityType: "funder",
        destinationField: "name",
        status: "accepted",
        required: true,
        confidence: 99,
        valueJson: "Acme Foundation",
        normalizedValueJson: undefined,
      },
      {
        id: "field-contact",
        fieldKey: "contact",
        destinationEntityType: "funder_contact",
        destinationField: "name",
        status: "edited",
        required: false,
        confidence: 90,
        valueJson: { name: "Pat Program", title: "Officer", email: "pat@example.com" },
        normalizedValueJson: undefined,
      },
      {
        id: "field-report",
        fieldKey: "report",
        destinationEntityType: "reporting_requirement",
        destinationField: "dueDate",
        status: "accepted",
        required: false,
        confidence: 90,
        valueJson: { dueDate: "2026-06-01T00:00:00.000Z", reportType: "financial" },
        normalizedValueJson: undefined,
      },
      {
        id: "field-closeout",
        fieldKey: "closeout",
        destinationEntityType: "closeout_item",
        destinationField: "label",
        status: "accepted",
        required: false,
        confidence: 90,
        valueJson: { label: "Final report", dueDate: "2026-12-31T00:00:00.000Z" },
        normalizedValueJson: undefined,
      },
      {
        id: "field-restriction",
        fieldKey: "restriction",
        destinationEntityType: "restriction_term",
        destinationField: "title",
        status: "accepted",
        required: false,
        confidence: 90,
        valueJson: { title: "STEM only", description: "Use for STEM programming." },
        normalizedValueJson: undefined,
      },
      {
        id: "field-allocation",
        fieldKey: "allocation",
        destinationEntityType: "allocation",
        destinationField: "allocatedAmountCents",
        status: "accepted",
        required: false,
        confidence: 90,
        valueJson: { fundName: "Restricted STEM", allocatedAmountCents: 100000 },
        normalizedValueJson: undefined,
      },
      {
        id: "field-contact-string",
        fieldKey: "contact.string",
        destinationEntityType: "funder_contact",
        destinationField: "name",
        status: "accepted",
        required: false,
        confidence: 90,
        valueJson: "Sam Contact",
        normalizedValueJson: undefined,
      },
      {
        id: "field-report-type",
        fieldKey: "report.type",
        destinationEntityType: "reporting_requirement",
        destinationField: "reportType",
        status: "accepted",
        required: false,
        confidence: 90,
        valueJson: "programmatic",
        normalizedValueJson: undefined,
      },
      {
        id: "field-closeout-title",
        fieldKey: "closeout.title",
        destinationEntityType: "closeout_item",
        destinationField: "title",
        status: "accepted",
        required: false,
        confidence: 90,
        valueJson: { title: "Final invoice" },
        normalizedValueJson: undefined,
      },
      {
        id: "field-restriction-purpose",
        fieldKey: "restriction.purpose",
        destinationEntityType: "restriction_term",
        destinationField: "purposeStatement",
        status: "accepted",
        required: false,
        confidence: 90,
        valueJson: { title: "Tutoring", purposeStatement: "Tutoring only" },
        normalizedValueJson: undefined,
      },
      {
        id: "field-allocation-name",
        fieldKey: "allocation.name",
        destinationEntityType: "allocation",
        destinationField: "allocatedAmountCents",
        status: "accepted",
        required: false,
        confidence: 90,
        valueJson: { name: "Named Fund", allocatedAmountCents: 50000 },
        normalizedValueJson: undefined,
      },
      {
        id: "field-allocation-amount",
        fieldKey: "allocation.amount",
        destinationEntityType: "allocation",
        destinationField: "allocatedAmountCents",
        status: "accepted",
        required: false,
        confidence: 90,
        valueJson: 25000,
        normalizedValueJson: undefined,
      },
    ];
    const { db, updates } = makeMockDb({
      document: { id: "doc-1" },
      fields,
      updateRows: [
        [{ id: "ext-1", documentId: "doc-1" }],
        [],
        [{ id: "ext-1", status: "committed" }],
      ],
      insertRows: [
        [{ id: "funder-1" }],
        [],
        [],
        [{ id: "grant-1" }],
        [],
        [],
        [{ id: "contact-1" }],
        [],
        [{ id: "report-1" }],
        [],
        [{ id: "closeout-1" }],
        [],
        [{ id: "restriction-1" }],
        [],
        [{ id: "fund-1" }],
        [],
        [{ id: "allocation-1" }],
        [],
        [{ id: "contact-2" }],
        [],
        [{ id: "closeout-2" }],
        [],
        [{ id: "restriction-2" }],
        [],
        [{ id: "fund-2" }],
        [],
        [{ id: "allocation-2" }],
        [],
        [],
        [],
      ],
    });

    const result = await commitDocumentExtraction(db as never, {
      orgId: "org-1",
      userId: "user-1",
      extractionId: "ext-1",
      planTier: "growth",
      input: {
        funderDecision: { action: "create_new" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: {
          name: "Youth STEM",
          amountCents: 200000,
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-12-31T00:00:00.000Z",
        },
      },
    });

    expect(result).toEqual({ grantId: "grant-1", funderId: "funder-1" });
    expect(updates.at(-1)?.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "committed", createdGrantId: "grant-1" }),
    );
    // The final commit status flip must stay tenant-scoped: a bare id match
    // would let a UUID collision mark another org's extraction committed.
    const commitWhere = (updates.at(-1)?.where as { mock: { calls: unknown[][] } }).mock
      .calls[0]?.[0];
    expect(renderSql(commitWhere).sql).toContain("org_id");
  });

  it("records activity for compliance artifacts created during commit", async () => {
    const { db } = makeMockDb({
      document: { id: "doc-1", entityType: "award_intake" },
      fields: [
        {
          id: "field-funder",
          fieldKey: "funder.name",
          destinationEntityType: "funder",
          destinationField: "name",
          status: "accepted",
          required: true,
          confidence: 99,
          valueJson: "Acme Foundation",
          normalizedValueJson: undefined,
        },
        {
          id: "field-report",
          fieldKey: "report",
          destinationEntityType: "reporting_requirement",
          destinationField: "dueDate",
          status: "accepted",
          required: false,
          confidence: 90,
          valueJson: { dueDate: "2026-06-01T00:00:00.000Z", reportType: "financial" },
          normalizedValueJson: undefined,
        },
        {
          id: "field-closeout",
          fieldKey: "closeout",
          destinationEntityType: "closeout_item",
          destinationField: "label",
          status: "accepted",
          required: false,
          confidence: 90,
          valueJson: { label: "Final report", dueDate: "2026-12-31T00:00:00.000Z" },
          normalizedValueJson: undefined,
        },
      ],
      updateRows: [
        [{ id: "ext-1", documentId: "doc-1" }],
        [],
        [{ id: "ext-1", status: "committed" }],
      ],
      insertRows: [
        [{ id: "funder-1" }],
        [],
        [],
        [{ id: "grant-1" }],
        [],
        [],
        [{ id: "report-1", reportType: "financial" }],
        [],
        [{ id: "closeout-1", label: "Final report" }],
        [],
        [],
      ],
    });

    await commitDocumentExtraction(db as never, {
      orgId: "org-1",
      userId: "user-1",
      extractionId: "ext-1",
      planTier: "growth",
      input: {
        funderDecision: { action: "create_new" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: {
          name: "Youth STEM",
          amountCents: 200000,
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-12-31T00:00:00.000Z",
        },
      },
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        action: "created",
        entityType: "reporting_requirement",
        entityId: "report-1",
        changes: { grantId: "grant-1", reportType: "financial" },
      }),
    );
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        orgId: "org-1",
        actorId: "user-1",
        action: "created",
        entityType: "closeout_item",
        entityId: "closeout-1",
        changes: { grantId: "grant-1", label: "Final report" },
      }),
    );
  });

  it("commits a child record whose value is a stringified JSON object", async () => {
    const { db } = makeMockDb({
      document: { id: "doc-1", entityType: "award_intake" },
      fields: [
        {
          id: "field-funder",
          fieldKey: "funder.name",
          destinationEntityType: "funder",
          destinationField: "name",
          status: "accepted",
          required: true,
          confidence: 99,
          valueJson: "Acme Foundation",
          normalizedValueJson: undefined,
        },
        {
          id: "field-report",
          fieldKey: "report",
          destinationEntityType: "reporting_requirement",
          destinationField: "reporting_requirement",
          status: "accepted",
          required: false,
          confidence: 90,
          valueJson: '{"reportType": "financial", "dueDate": "2026-06-01T00:00:00.000Z"}',
          normalizedValueJson: undefined,
        },
      ],
      updateRows: [
        [{ id: "ext-1", documentId: "doc-1" }],
        [],
        [{ id: "ext-1", status: "committed" }],
      ],
      insertRows: [
        [{ id: "funder-1" }],
        [],
        [],
        [{ id: "grant-1" }],
        [],
        [],
        [{ id: "report-1", reportType: "financial" }],
        [],
      ],
    });

    await commitDocumentExtraction(db as never, {
      orgId: "org-1",
      userId: "user-1",
      extractionId: "ext-1",
      planTier: "growth",
      input: {
        funderDecision: { action: "create_new" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: {
          name: "Youth STEM",
          amountCents: 200000,
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-12-31T00:00:00.000Z",
        },
      },
    });

    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "created",
        entityType: "reporting_requirement",
        entityId: "report-1",
        changes: { grantId: "grant-1", reportType: "financial" },
      }),
    );
  });

  it("skips a child record whose value is a malformed JSON string", async () => {
    const { db } = makeMockDb({
      document: { id: "doc-1", entityType: "award_intake" },
      fields: [
        {
          id: "field-funder",
          fieldKey: "funder.name",
          destinationEntityType: "funder",
          destinationField: "name",
          status: "accepted",
          required: true,
          confidence: 99,
          valueJson: "Acme Foundation",
          normalizedValueJson: undefined,
        },
        {
          id: "field-report",
          fieldKey: "report",
          destinationEntityType: "reporting_requirement",
          destinationField: "reporting_requirement",
          status: "accepted",
          required: false,
          confidence: 90,
          valueJson: '{"reportType": "financial", dueDate}',
          normalizedValueJson: undefined,
        },
      ],
      updateRows: [
        [{ id: "ext-1", documentId: "doc-1" }],
        [],
        [{ id: "ext-1", status: "committed" }],
      ],
      insertRows: [[{ id: "funder-1" }], [], [], [{ id: "grant-1" }], [], []],
    });

    await commitDocumentExtraction(db as never, {
      orgId: "org-1",
      userId: "user-1",
      extractionId: "ext-1",
      planTier: "growth",
      input: {
        funderDecision: { action: "create_new" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: {
          name: "Youth STEM",
          amountCents: 200000,
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-12-31T00:00:00.000Z",
        },
      },
    });

    expect(recordActivityLog).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "reporting_requirement" }),
    );
  });

  it("never persists a raw JSON blob into a text field when the parsed object lacks that key", async () => {
    const { db, inserts } = makeMockDb({
      document: { id: "doc-1", entityType: "award_intake" },
      fields: [
        {
          id: "field-funder",
          fieldKey: "funder.name",
          destinationEntityType: "funder",
          destinationField: "name",
          status: "accepted",
          required: true,
          confidence: 99,
          valueJson: "Acme Foundation",
          normalizedValueJson: undefined,
        },
        {
          id: "field-restriction",
          fieldKey: "restriction",
          destinationEntityType: "restriction_term",
          destinationField: "purposeStatement",
          status: "accepted",
          required: false,
          confidence: 90,
          valueJson: '{"title": "Program costs only"}',
          normalizedValueJson: undefined,
        },
      ],
      updateRows: [
        [{ id: "ext-1", documentId: "doc-1" }],
        [],
        [{ id: "ext-1", status: "committed" }],
      ],
      insertRows: [
        [{ id: "funder-1" }],
        [],
        [],
        [{ id: "grant-1" }],
        [],
        [],
        [{ id: "restriction-1", title: "Program costs only" }],
        [],
      ],
    });

    await commitDocumentExtraction(db as never, {
      orgId: "org-1",
      userId: "user-1",
      extractionId: "ext-1",
      planTier: "growth",
      input: {
        funderDecision: { action: "create_new" },
        grantDecision: { action: "create_new" },
        requiredGrantBasics: {
          name: "Youth STEM",
          amountCents: 200000,
          startDate: "2026-01-01T00:00:00.000Z",
          endDate: "2026-12-31T00:00:00.000Z",
        },
      },
    });

    const valuesArg = (chain: (typeof inserts)[number]): Record<string, unknown> | undefined =>
      (chain.values.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]?.[0];
    const restrictionInsert = inserts.find(
      (chain) => valuesArg(chain)?.title === "Program costs only",
    );
    expect(restrictionInsert).toBeDefined();
    // The object's `title` key backfills the title, but the field's own
    // destination (`purposeStatement`) is absent from the object. The scalar
    // fallback must NOT write the raw JSON string into the text column.
    expect(valuesArg(restrictionInsert!)?.purposeStatement).toBeNull();
  });

  it("rejects extracted allocations that exceed the committed grant amount", async () => {
    const { db, inserts } = makeMockDb({
      document: { id: "doc-1" },
      fields: [
        {
          id: "field-funder-name",
          fieldKey: "funder.name",
          destinationEntityType: "funder",
          destinationField: "name",
          status: "accepted",
          required: true,
          confidence: 90,
          valueJson: "Grantor",
          normalizedValueJson: undefined,
        },
        {
          id: "field-allocation",
          fieldKey: "allocation",
          destinationEntityType: "allocation",
          destinationField: "allocatedAmountCents",
          status: "accepted",
          required: false,
          confidence: 90,
          valueJson: { fundName: "Restricted STEM", allocatedAmountCents: 60000 },
          normalizedValueJson: undefined,
        },
      ],
      updateRows: [[{ id: "ext-1", documentId: "doc-1" }]],
      insertRows: [
        [{ id: "funder-1" }],
        [],
        [],
        [{ id: "grant-1", amountCents: 50000 }],
        [],
        [],
        [{ id: "fund-1" }],
        [],
        [{ id: "allocation-1" }],
        [],
        [],
        [],
      ],
    });

    await expect(
      commitDocumentExtraction(db as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
        planTier: "growth",
        input: {
          funderDecision: { action: "create_new" },
          grantDecision: { action: "create_new" },
          requiredGrantBasics: { name: "Grant", amountCents: 50000 },
        },
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(inserts).toHaveLength(6);
  });

  it("skips negative allocation amounts and prevents them from bypassing the grant cap", async () => {
    // Bug scenario: a negative allocation reduces pendingAllocationAmountCents, allowing
    // a later allocation that would exceed the cap to slip through undetected.
    // With the fix the negative row is skipped, so the cap is still enforced correctly.
    const { db } = makeMockDb({
      document: { id: "doc-1" },
      fields: [
        {
          id: "field-funder-name",
          fieldKey: "funder.name",
          destinationEntityType: "funder",
          destinationField: "name",
          status: "accepted",
          required: true,
          confidence: 90,
          valueJson: "Grantor",
          normalizedValueJson: undefined,
        },
        // negative allocation comes first; without the fix it would reduce pending sum
        {
          id: "field-allocation-neg",
          fieldKey: "allocation.neg",
          destinationEntityType: "allocation",
          destinationField: "allocatedAmountCents",
          status: "accepted",
          required: false,
          confidence: 90,
          valueJson: { fundName: "Refund", allocatedAmountCents: -20000 },
          normalizedValueJson: undefined,
        },
        // 30000 + 30000 = 60000 > 50000 cap — must be rejected
        {
          id: "field-allocation-a",
          fieldKey: "allocation.a",
          destinationEntityType: "allocation",
          destinationField: "allocatedAmountCents",
          status: "accepted",
          required: false,
          confidence: 90,
          valueJson: { fundName: "Fund A", allocatedAmountCents: 30000 },
          normalizedValueJson: undefined,
        },
        {
          id: "field-allocation-b",
          fieldKey: "allocation.b",
          destinationEntityType: "allocation",
          destinationField: "allocatedAmountCents",
          status: "accepted",
          required: false,
          confidence: 90,
          valueJson: { fundName: "Fund B", allocatedAmountCents: 30000 },
          normalizedValueJson: undefined,
        },
      ],
      updateRows: [[{ id: "ext-1", documentId: "doc-1" }]],
      insertRows: [
        [{ id: "funder-1" }],
        [],
        [],
        [{ id: "grant-1", amountCents: 50000 }],
        [],
        [],
        [{ id: "fund-a" }],
        [],
        [{ id: "allocation-a" }],
        [],
        [],
        [],
      ],
    });

    // Without the fix: pending = 0 + (-20000) + 30000 = 10000 after first two; then 10000+30000=40000 <= 50000 — no throw.
    // With the fix: negative is skipped; pending = 0 + 30000 = 30000; then 30000+30000=60000 > 50000 — throws 409.
    await expect(
      commitDocumentExtraction(db as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
        planTier: "growth",
        input: {
          funderDecision: { action: "create_new" },
          grantDecision: { action: "create_new" },
          requiredGrantBasics: { name: "Grant", amountCents: 50000 },
        },
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("allows multiple extracted allocations when combined total stays within the grant amount", async () => {
    const { db } = makeMockDb({
      document: { id: "doc-1" },
      fields: [
        {
          id: "field-funder-name",
          fieldKey: "funder.name",
          destinationEntityType: "funder",
          destinationField: "name",
          status: "accepted",
          required: true,
          confidence: 90,
          valueJson: "Grantor",
          normalizedValueJson: undefined,
        },
        {
          id: "field-allocation-one",
          fieldKey: "allocation.one",
          destinationEntityType: "allocation",
          destinationField: "allocatedAmountCents",
          status: "accepted",
          required: false,
          confidence: 90,
          valueJson: { fundName: "Restricted STEM", allocatedAmountCents: 100000 },
          normalizedValueJson: undefined,
        },
        {
          id: "field-allocation-two",
          fieldKey: "allocation.two",
          destinationEntityType: "allocation",
          destinationField: "allocatedAmountCents",
          status: "accepted",
          required: false,
          confidence: 90,
          valueJson: { fundName: "Program Support", allocatedAmountCents: 50000 },
          normalizedValueJson: undefined,
        },
      ],
      updateRows: [[{ id: "ext-1", documentId: "doc-1" }], [{ id: "ext-1", status: "committed" }]],
      insertRows: [
        [{ id: "funder-1" }],
        [],
        [],
        [{ id: "grant-1", amountCents: 200000 }],
        [],
        [],
        [{ id: "fund-1" }],
        [],
        [{ id: "allocation-1" }],
        [],
        [{ id: "fund-2" }],
        [],
        [{ id: "allocation-2" }],
        [],
        [],
        [],
      ],
      selectRows: [[{ total: "25000" }]],
    });

    await expect(
      commitDocumentExtraction(db as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
        planTier: "growth",
        input: {
          funderDecision: { action: "create_new" },
          grantDecision: { action: "create_new" },
          requiredGrantBasics: { name: "Grant", amountCents: 200000 },
        },
      }),
    ).resolves.toEqual({ funderId: "funder-1", grantId: "grant-1" });

    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("rejects commits that are not ready or have incomplete review", async () => {
    await expect(
      commitDocumentExtraction(makeMockDb().db as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "missing",
        planTier: "growth",
        input: {
          funderDecision: { action: "create_new" },
          grantDecision: { action: "create_new" },
          requiredGrantBasics: { name: "Grant", amountCents: 100000 },
        },
      }),
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      commitDocumentExtraction(makeMockDb({ extraction: { id: "ext-1" } }).db as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
        planTier: "growth",
        input: {
          funderDecision: { action: "create_new" },
          grantDecision: { action: "create_new" },
          requiredGrantBasics: { name: "Grant", amountCents: 1 },
        },
      }),
    ).rejects.toMatchObject({ status: 409 });

    const incompleteDb = makeMockDb({
      document: { id: "doc-1" },
      extraction: { id: "ext-1" },
      fields: [
        {
          fieldKey: "grant.name",
          required: true,
          confidence: 99,
          status: "pending",
        },
      ],
      updateRows: [[{ id: "ext-1", documentId: "doc-1" }]],
    }).db;
    await expect(
      commitDocumentExtraction(incompleteDb as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
        planTier: "growth",
        input: {
          funderDecision: { action: "create_new" },
          grantDecision: { action: "create_new" },
          requiredGrantBasics: { name: "Grant", amountCents: 1 },
        },
      }),
    ).rejects.toMatchObject({ status: 409, body: { error: "review_incomplete" } });

    const missingNameDb = makeMockDb({
      document: { id: "doc-1" },
      fields: [],
      updateRows: [[{ id: "ext-1", documentId: "doc-1" }]],
    }).db;
    await expect(
      commitDocumentExtraction(missingNameDb as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
        planTier: "growth",
        input: {
          funderDecision: { action: "create_new" },
          grantDecision: { action: "create_new" },
          requiredGrantBasics: { name: "Grant", amountCents: 1 },
        },
      }),
    ).rejects.toMatchObject({ status: 409, body: { error: "missing_approved_funder_name" } });

    const funderField = {
      fieldKey: "funder.name",
      destinationEntityType: "funder",
      destinationField: "name",
      status: "accepted",
      required: true,
      confidence: 99,
      valueJson: "Acme",
      normalizedValueJson: undefined,
    };
    await expect(
      commitDocumentExtraction(
        makeMockDb({
          document: { id: "doc-1" },
          fields: [funderField],
          updateRows: [[{ id: "ext-1", documentId: "doc-1" }]],
          insertRows: [[]],
        }).db as never,
        {
          orgId: "org-1",
          userId: "user-1",
          extractionId: "ext-1",
          planTier: "growth",
          input: {
            funderDecision: { action: "create_new" },
            grantDecision: { action: "create_new" },
            requiredGrantBasics: { name: "Grant", amountCents: 1 },
          },
        },
      ),
    ).rejects.toThrow("Failed to create funder");

    await expect(
      commitDocumentExtraction(
        makeMockDb({
          document: { id: "doc-1" },
          fields: [funderField],
          updateRows: [[{ id: "ext-1", documentId: "doc-1" }]],
          insertRows: [[{ id: "funder-1" }], [], [], []],
        }).db as never,
        {
          orgId: "org-1",
          userId: "user-1",
          extractionId: "ext-1",
          planTier: "growth",
          input: {
            funderDecision: { action: "create_new" },
            grantDecision: { action: "create_new" },
            requiredGrantBasics: { name: "Grant", amountCents: 1 },
          },
        },
      ),
    ).rejects.toThrow("Failed to create grant");
  });

  it("rejects commit when the source document has been deleted", async () => {
    const { db, inserts } = makeMockDb({
      document: null,
      updateRows: [[{ id: "ext-1", documentId: "doc-1" }]],
    });

    await expect(
      commitDocumentExtraction(db as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
        planTier: "growth",
        input: {
          funderDecision: { action: "create_new" },
          grantDecision: { action: "create_new" },
          requiredGrantBasics: { name: "Grant", amountCents: 1 },
        },
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(inserts).toHaveLength(0);
  });

  it("commits mapped funder and grant decisions and rejects mismatched grants", async () => {
    const mappedFields = [
      {
        id: "field-notes",
        fieldKey: "notes",
        destinationEntityType: "grant",
        destinationField: "notes",
        status: "mapped_existing",
        required: false,
        confidence: 99,
        valueJson: "notes",
        normalizedValueJson: "notes",
      },
    ];
    const mappedDb = makeMockDb({
      document: { id: "doc-1" },
      mappedEntity: { id: "funder-1" },
      activeGrant: { id: "grant-1", funderId: "funder-1" },
      fields: mappedFields,
      updateRows: [[{ id: "ext-1", documentId: "doc-1" }], [], [{ id: "ext-1" }]],
      insertRows: [[], [], []],
    }).db;

    await expect(
      commitDocumentExtraction(mappedDb as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
        planTier: "growth",
        input: {
          funderDecision: { action: "map_existing", existingId: "funder-1" },
          grantDecision: { action: "map_existing", existingId: "grant-1" },
          requiredGrantBasics: { name: "Grant", amountCents: 1 },
        },
      }),
    ).resolves.toEqual({ funderId: "funder-1", grantId: "grant-1" });

    const mismatchDb = makeMockDb({
      document: { id: "doc-1" },
      mappedEntity: { id: "funder-1" },
      activeGrant: { id: "grant-1", funderId: "other-funder" },
      fields: mappedFields,
      updateRows: [[{ id: "ext-1", documentId: "doc-1" }]],
    }).db;
    await expect(
      commitDocumentExtraction(mismatchDb as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
        planTier: "growth",
        input: {
          funderDecision: { action: "map_existing", existingId: "funder-1" },
          grantDecision: { action: "map_existing", existingId: "grant-1" },
          requiredGrantBasics: { name: "Grant", amountCents: 1 },
        },
      }),
    ).rejects.toMatchObject({ status: 409, body: { error: "grant_funder_mismatch" } });

    await expect(
      commitDocumentExtraction(
        makeMockDb({
          document: { id: "doc-1" },
          mappedEntity: { id: "funder-1" },
          activeGrant: false,
          fields: mappedFields,
          updateRows: [[{ id: "ext-1", documentId: "doc-1" }]],
        }).db as never,
        {
          orgId: "org-1",
          userId: "user-1",
          extractionId: "ext-1",
          planTier: "growth",
          input: {
            funderDecision: { action: "map_existing", existingId: "funder-1" },
            grantDecision: { action: "map_existing", existingId: "grant-1" },
            requiredGrantBasics: { name: "Grant", amountCents: 1 },
          },
        },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("applies allocation caps when committing allocations to a mapped grant", async () => {
    const mappedAllocationFields = [
      {
        id: "field-allocation",
        fieldKey: "allocation",
        destinationEntityType: "allocation",
        destinationField: "allocatedAmountCents",
        status: "accepted",
        required: false,
        confidence: 90,
        valueJson: { fundName: "Restricted STEM", allocatedAmountCents: 50000 },
        normalizedValueJson: undefined,
      },
    ];
    const passing = makeMockDb({
      document: { id: "doc-1" },
      mappedEntity: { id: "funder-1" },
      activeGrant: { id: "grant-1", funderId: "funder-1", amountCents: 200000 },
      fields: mappedAllocationFields,
      updateRows: [
        [{ id: "ext-1", documentId: "doc-1" }],
        [{ rawNormalizedJson: providerResult("Youth STEM").extraction }],
        [{ id: "ext-1" }],
      ],
      insertRows: [[{ id: "fund-1" }], [], [{ id: "allocation-1" }], [], [], []],
      selectRows: [[{ total: "100000" }]],
    });

    await expect(
      commitDocumentExtraction(passing.db as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
        planTier: "growth",
        input: {
          funderDecision: { action: "map_existing", existingId: "funder-1" },
          grantDecision: { action: "map_existing", existingId: "grant-1" },
          requiredGrantBasics: { name: "Grant", amountCents: 1 },
        },
      }),
    ).resolves.toEqual({ funderId: "funder-1", grantId: "grant-1" });
    expect(passing.db.execute).toHaveBeenCalledTimes(1);

    const failing = makeMockDb({
      document: { id: "doc-1" },
      mappedEntity: { id: "funder-1" },
      activeGrant: { id: "grant-1", funderId: "funder-1", amountCents: 125000 },
      fields: mappedAllocationFields,
      updateRows: [[{ id: "ext-1", documentId: "doc-1" }]],
      insertRows: [[{ id: "fund-1" }], [], [{ id: "allocation-1" }]],
      selectRows: [[{ total: "100000" }]],
    });

    await expect(
      commitDocumentExtraction(failing.db as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
        planTier: "growth",
        input: {
          funderDecision: { action: "map_existing", existingId: "funder-1" },
          grantDecision: { action: "map_existing", existingId: "grant-1" },
          requiredGrantBasics: { name: "Grant", amountCents: 1 },
        },
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(failing.db.execute).toHaveBeenCalledTimes(1);
    expect(failing.inserts).toHaveLength(2);
  });

  it("commits reviewed budget line fields into a document intake budget version", async () => {
    const budgetFields = [
      {
        id: "field-budget-personnel",
        fieldKey: "budget.personnel",
        destinationEntityType: "budget_line",
        destinationField: "approvedAmountCents",
        status: "accepted",
        required: false,
        confidence: 95,
        valueJson: {
          category: "Personnel",
          description: "Program staff",
          approvedAmountCents: 125000,
          allowable: true,
          costType: "direct",
        },
        normalizedValueJson: undefined,
      },
      {
        id: "field-budget-equipment",
        fieldKey: "budget.equipment",
        destinationEntityType: "budget_line",
        destinationField: "approvedAmountCents",
        status: "accepted",
        required: false,
        confidence: 95,
        valueJson: {
          name: "Equipment",
          amountCents: 75000,
          allowable: false,
          costType: "indirect",
        },
        normalizedValueJson: undefined,
      },
    ];
    const { db, inserts } = makeMockDb({
      document: { id: "doc-1" },
      mappedEntity: { id: "funder-1" },
      activeGrant: { id: "grant-1", funderId: "funder-1" },
      latestBudgetVersion: { versionNumber: 2 },
      fields: budgetFields,
      updateRows: [[{ id: "ext-1", documentId: "doc-1" }], [], [{ id: "ext-1" }]],
      insertRows: [
        [],
        [],
        [{ id: "version-3" }],
        [],
        [{ id: "line-1" }],
        [],
        [{ id: "line-2" }],
        [],
        [],
      ],
    });

    await expect(
      commitDocumentExtraction(db as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
        planTier: "growth",
        input: {
          funderDecision: { action: "map_existing", existingId: "funder-1" },
          grantDecision: { action: "map_existing", existingId: "grant-1" },
          requiredGrantBasics: { name: "Grant", amountCents: 1 },
        },
      }),
    ).resolves.toEqual({ funderId: "funder-1", grantId: "grant-1" });
    expect(inserts[2]?.values).toHaveBeenCalledWith(
      expect.objectContaining({
        grantId: "grant-1",
        versionNumber: 3,
        source: "document_intake",
        sourceDocumentId: "doc-1",
      }),
    );
    expect(inserts[4]?.values).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetVersionId: "version-3",
        category: "Personnel",
        approvedAmountCents: 125000,
      }),
    );
    expect(inserts[6]?.values).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetVersionId: "version-3",
        category: "Equipment",
        approvedAmountCents: 75000,
        allowable: false,
        costType: "indirect",
      }),
    );
  });

  it("skips optional commit records when extracted values are incomplete", async () => {
    const branchFields = [
      {
        id: "funder",
        fieldKey: "funder.name",
        destinationEntityType: "funder",
        destinationField: "name",
        status: "accepted",
        required: true,
        confidence: 99,
        valueJson: "Acme",
        normalizedValueJson: undefined,
      },
      {
        id: "contact-missing",
        fieldKey: "contact.missing",
        destinationEntityType: "funder_contact",
        destinationField: "name",
        status: "accepted",
        required: false,
        confidence: 99,
        valueJson: {},
        normalizedValueJson: undefined,
      },
      {
        id: "contact-string",
        fieldKey: "contact.string",
        destinationEntityType: "funder_contact",
        destinationField: "name",
        status: "accepted",
        required: false,
        confidence: 99,
        valueJson: "Alex Contact",
        normalizedValueJson: undefined,
      },
      {
        id: "report-invalid-date",
        fieldKey: "report.invalid",
        destinationEntityType: "reporting_requirement",
        destinationField: "dueDate",
        status: "accepted",
        required: false,
        confidence: 99,
        valueJson: { dueDate: "not-a-date", reportType: "financial" },
        normalizedValueJson: undefined,
      },
      {
        id: "report-type",
        fieldKey: "report.type",
        destinationEntityType: "reporting_requirement",
        destinationField: "dueDate",
        status: "accepted",
        required: false,
        confidence: 99,
        valueJson: { dueDate: "2026-06-01T00:00:00.000Z", type: "program" },
        normalizedValueJson: undefined,
      },
      {
        id: "report-value-type",
        fieldKey: "report.valueType",
        destinationEntityType: "reporting_requirement",
        destinationField: "reportType",
        status: "accepted",
        required: false,
        confidence: 99,
        valueJson: "programmatic",
        normalizedValueJson: undefined,
      },
      {
        id: "closeout-title",
        fieldKey: "closeout.title",
        destinationEntityType: "closeout_item",
        destinationField: "title",
        status: "accepted",
        required: false,
        confidence: 99,
        valueJson: { title: "Final invoice" },
        normalizedValueJson: undefined,
      },
      {
        id: "closeout-missing",
        fieldKey: "closeout.missing",
        destinationEntityType: "closeout_item",
        destinationField: "label",
        status: "accepted",
        required: false,
        confidence: 99,
        valueJson: {},
        normalizedValueJson: undefined,
      },
      {
        id: "closeout-label-scalar",
        fieldKey: "closeout.scalar",
        destinationEntityType: "closeout_item",
        destinationField: "label",
        status: "accepted",
        required: false,
        confidence: 99,
        valueJson: "Closeout packet",
        normalizedValueJson: undefined,
      },
      {
        id: "restriction-title-scalar",
        fieldKey: "restriction.scalarTitle",
        destinationEntityType: "restriction_term",
        destinationField: "title",
        status: "accepted",
        required: false,
        confidence: 99,
        valueJson: "Scholarship purpose",
        normalizedValueJson: undefined,
      },
      {
        id: "restriction-purpose-empty",
        fieldKey: "restriction.emptyPurpose",
        destinationEntityType: "restriction_term",
        destinationField: "purposeStatement",
        status: "accepted",
        required: false,
        confidence: 99,
        valueJson: { title: "Purpose without statement" },
        normalizedValueJson: undefined,
      },
      {
        id: "restriction-description",
        fieldKey: "restriction.description",
        destinationEntityType: "restriction_term",
        destinationField: "title",
        status: "accepted",
        required: false,
        confidence: 99,
        valueJson: { title: "Purpose", description: "Description fallback" },
        normalizedValueJson: undefined,
      },
      {
        id: "restriction-missing",
        fieldKey: "restriction.missing",
        destinationEntityType: "restriction_term",
        destinationField: "title",
        status: "accepted",
        required: false,
        confidence: 99,
        valueJson: {},
        normalizedValueJson: undefined,
      },
      {
        id: "allocation-name",
        fieldKey: "allocation.name",
        destinationEntityType: "allocation",
        destinationField: "allocatedAmountCents",
        status: "accepted",
        required: false,
        confidence: 99,
        valueJson: { name: "Named Fund", allocatedAmountCents: 50000 },
        normalizedValueJson: undefined,
      },
      {
        id: "allocation-missing-fund",
        fieldKey: "allocation.missingFund",
        destinationEntityType: "allocation",
        destinationField: "allocatedAmountCents",
        status: "accepted",
        required: false,
        confidence: 99,
        valueJson: { fundName: "Missing Fund", allocatedAmountCents: 1000 },
        normalizedValueJson: undefined,
      },
      {
        id: "allocation-number",
        fieldKey: "allocation.number",
        destinationEntityType: "allocation",
        destinationField: "allocatedAmountCents",
        status: "accepted",
        required: false,
        confidence: 99,
        valueJson: 25000,
        normalizedValueJson: undefined,
      },
      {
        id: "budget-category-only",
        fieldKey: "budget.categoryOnly",
        destinationEntityType: "budget_line",
        destinationField: "category",
        status: "accepted",
        required: false,
        confidence: 99,
        valueJson: "Travel",
        normalizedValueJson: undefined,
      },
    ];
    const { db } = makeMockDb({
      document: { id: "doc-1" },
      fields: branchFields,
      updateRows: [[{ id: "ext-1", documentId: "doc-1" }], [], [{ id: "ext-1" }]],
      insertRows: [
        [{ id: "funder-1" }],
        [],
        [],
        [{ id: "grant-1" }],
        [],
        [],
        [{ id: "contact-1" }],
        [],
        [{ id: "report-1" }],
        [],
        [{ id: "closeout-1" }],
        [],
        [{ id: "closeout-2" }],
        [],
        [{ id: "restriction-1" }],
        [],
        [{ id: "restriction-2" }],
        [],
        [{ id: "restriction-3" }],
        [],
        [{ id: "fund-1" }],
        [],
        [{ id: "allocation-1" }],
        [],
        [],
        [],
        [],
      ],
    });

    await expect(
      commitDocumentExtraction(db as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
        planTier: "growth",
        input: {
          funderDecision: { action: "create_new" },
          grantDecision: { action: "create_new" },
          requiredGrantBasics: { name: "Grant", amountCents: 100000 },
        },
      }),
    ).resolves.toEqual({ funderId: "funder-1", grantId: "grant-1" });
  });
});

describe("recordDocumentExtractionAction — atomicity", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("runs insert + field update + log in one transaction (happy path)", async () => {
    const { db } = makeMockDb({
      extraction: { id: "ext-1", status: "ready_for_review" },
      field: { id: "field-1" },
      insertRows: [[{ id: "action-1" }]],
    });

    const result = await recordDocumentExtractionAction(db as never, {
      orgId: "org-1",
      userId: "user-1",
      extractionId: "ext-1",
      input: { fieldId: "field-1", action: "accept" },
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ id: "action-1" });
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "document_extraction", action: "accept" }),
    );
  });

  it("rolls back when audit log fails", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const { db } = makeMockDb({
      extraction: { id: "ext-1", status: "ready_for_review" },
      field: { id: "field-1" },
      insertRows: [[{ id: "action-1" }]],
    });

    await expect(
      recordDocumentExtractionAction(db as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
        input: { fieldId: "field-1", action: "accept" },
      }),
    ).rejects.toThrow("audit log down");
  });
});

describe("cancelDocumentExtraction — atomicity", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  it("runs cancel update + action insert + log in one transaction (happy path)", async () => {
    const { db } = makeMockDb({
      updateRows: [[{ id: "ext-1", status: "canceled" }]],
      insertRows: [[]],
    });

    const result = await cancelDocumentExtraction(db as never, {
      orgId: "org-1",
      userId: "user-1",
      extractionId: "ext-1",
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ id: "ext-1", status: "canceled" });
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "document_extraction", action: "canceled" }),
    );
  });

  it("rolls back when audit log fails", async () => {
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));
    const { db } = makeMockDb({
      updateRows: [[{ id: "ext-1", status: "canceled" }]],
      insertRows: [[]],
    });

    await expect(
      cancelDocumentExtraction(db as never, {
        orgId: "org-1",
        userId: "user-1",
        extractionId: "ext-1",
      }),
    ).rejects.toThrow("audit log down");
  });
});
