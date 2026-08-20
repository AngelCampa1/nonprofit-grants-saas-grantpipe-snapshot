import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { EXTERNAL_REVIEW_SCOPE_TYPES } from "@grantpipe/shared";

vi.mock("../../lib/activity-log", () => ({
  recordActivityLog: vi.fn(async () => undefined),
}));

import { recordActivityLog } from "../../lib/activity-log";
import {
  buildEvidenceBundleManifest,
  createCorrectiveAction,
  createEvidenceBundle,
  createFinding,
  createMonitoringTask,
  createMonitoringLog,
  createRiskAssessment,
  createSubaward,
  createSubrecipient,
  deleteSubrecipient,
  generateMonitoringTasks,
  getMonitoringTaskTemplates,
  getSubaward,
  getSubrecipient,
  listSubawards,
  listSubrecipients,
  summarizeSubrecipientPortfolio,
  updateCorrectiveAction,
  updateFinding,
  updateMonitoringTask,
  updateSubaward,
  updateSubrecipient,
} from "./service";

const subawardBody = {
  grantId: "grant-1",
  title: "Youth services",
  amountCents: 100000,
  startDate: "2026-05-06T12:00:00.000Z",
  endDate: "2026-12-31T12:00:00.000Z",
};

type MockDbOptions = {
  selectResults?: unknown[][];
  insertResults?: unknown[][];
  updateResults?: unknown[][];
  queryResults?: Record<string, unknown[]>;
};

function makeChain(results: unknown[][]) {
  const chain = {
    from: vi.fn(() => chain),
    where: vi.fn(() => chain),
    orderBy: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    offset: vi.fn(() => chain),
    values: vi.fn(() => chain),
    set: vi.fn(() => chain),
    returning: vi.fn(() => Promise.resolve(results.shift() ?? [])),
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(results.shift() ?? []).then(resolve, reject),
  };
  return chain;
}

function makeMutationChain(results: unknown[][], whereSpy?: ReturnType<typeof vi.fn>) {
  const chain = {
    values: vi.fn(() => chain),
    set: vi.fn(() => chain),
    where: vi.fn((cond: unknown) => {
      whereSpy?.(cond);
      return chain;
    }),
    returning: vi.fn(() => Promise.resolve(results.shift() ?? [])),
  };
  return chain;
}

function makeMockDb(options: MockDbOptions = {}) {
  const selectResults = [...(options.selectResults ?? [])];
  const insertResults = [...(options.insertResults ?? [])];
  const updateResults = [...(options.updateResults ?? [])];
  const queryResults = options.queryResults ?? {};
  const query = new Proxy(
    {},
    {
      get: (_target, property: string) => ({
        findFirst: vi.fn(() => Promise.resolve((queryResults[property] ?? []).shift() ?? null)),
      }),
    },
  );
  const lastUpdateWhere = vi.fn();
  const db = {
    query,
    lastUpdateWhere,
    select: vi.fn(() => makeChain(selectResults)),
    insert: vi.fn(() => makeMutationChain(insertResults)),
    update: vi.fn(() => makeMutationChain(updateResults, lastUpdateWhere)),
    delete: vi.fn(() => makeChain([[]])),
    transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) => callback(db)),
  };
  return db;
}

describe("subrecipient monitoring service", () => {
  it("generates low-risk baseline monitoring tasks", () => {
    expect(getMonitoringTaskTemplates("low").map((task) => task.title)).toEqual([
      "Agreement document on file",
      "Annual report review",
      "Closeout check",
    ]);
  });

  it("adds quarterly review and evidence checks for medium risk", () => {
    expect(getMonitoringTaskTemplates("medium").map((task) => task.title)).toEqual([
      "Agreement document on file",
      "Annual report review",
      "Closeout check",
      "Quarterly financial and performance review",
      "Evidence completeness check",
    ]);
  });

  it("adds site visit, corrective-action, and payment-condition checks for high risk", () => {
    expect(getMonitoringTaskTemplates("high").map((task) => task.title)).toEqual([
      "Agreement document on file",
      "Annual report review",
      "Closeout check",
      "Quarterly financial and performance review",
      "Evidence completeness check",
      "Site visit or desk review",
      "Corrective-action follow-up",
      "Payment-condition review note",
    ]);
  });

  it("summarizes subrecipient portfolio rows for list and filter surfaces", () => {
    const today = new Date("2026-05-06T12:00:00.000Z");

    expect(
      summarizeSubrecipientPortfolio(
        {
          id: "sub-1",
          name: "Community Partner",
          status: "active",
          ownerId: "owner-1",
          primaryContactId: "contact-1",
        },
        [
          { id: "award-low", riskRating: "low", status: "active" },
          { id: "award-high", riskRating: "high", status: "active" },
        ],
        [
          { status: "open", dueDate: new Date("2026-05-01T12:00:00.000Z") },
          { status: "in_progress", dueDate: new Date("2026-05-20T12:00:00.000Z") },
          { status: "completed", dueDate: new Date("2026-04-01T12:00:00.000Z") },
        ],
        [{ status: "open" }, { status: "resolved" }, { status: "in_review" }],
        today,
      ),
    ).toMatchObject({
      id: "sub-1",
      name: "Community Partner",
      status: "active",
      ownerId: "owner-1",
      primaryContactId: "contact-1",
      subawardCount: 2,
      activeSubawardCount: 2,
      highestRiskRating: "high",
      openTaskCount: 2,
      overdueTaskCount: 1,
      openFindingCount: 2,
    });
  });

  it("keeps the highest known risk when later subawards have lower or unknown risk", () => {
    expect(
      summarizeSubrecipientPortfolio(
        {
          id: "sub-1",
          name: "Community Partner",
          status: "active",
          ownerId: null,
          primaryContactId: null,
        },
        [
          { id: "award-high", riskRating: "high", status: "active" },
          { id: "award-medium", riskRating: "medium", status: "active" },
          { id: "award-unknown", riskRating: "unknown", status: "inactive" },
        ],
        [],
        [],
        new Date("2026-05-06T12:00:00.000Z"),
      ),
    ).toMatchObject({
      activeSubawardCount: 2,
      highestRiskRating: "high",
    });
  });

  it("builds evidence bundle manifests from subaward monitoring records", () => {
    expect(
      buildEvidenceBundleManifest({
        subrecipient: { id: "sub-1", name: "Community Partner" },
        subaward: { id: "award-1", title: "Youth services" },
        riskAssessments: [{ id: "risk-1", finalRiskRating: "medium" }],
        tasks: [{ id: "task-1", title: "Annual report review", evidenceDocumentId: "doc-task" }],
        logs: [{ id: "log-1", title: "Desk review", documentId: "doc-log" }],
        findings: [{ id: "finding-1", title: "Missing support" }],
        correctiveActions: [{ id: "action-1", title: "Upload support" }],
        documents: [
          { id: "doc-task", filename: "task.pdf" },
          { id: "doc-general", filename: "agreement.pdf" },
        ],
        activityEntries: [
          {
            id: "activity-1",
            action: "created",
            entityType: "subrecipient_monitoring_task",
            entityLabel: "Annual report review",
          },
        ],
      }).map((item) => [item.itemType, item.itemId, item.caption]),
    ).toEqual([
      ["subrecipient", "sub-1", "Subrecipient: Community Partner"],
      ["subaward", "award-1", "Subaward: Youth services"],
      ["subrecipient_risk_assessment", "risk-1", "Risk assessment: medium"],
      ["subrecipient_monitoring_task", "task-1", "Task: Annual report review"],
      ["document", "doc-task", "Task evidence: Annual report review"],
      ["subrecipient_monitoring_log", "log-1", "Monitoring log: Desk review"],
      ["document", "doc-log", "Log evidence: Desk review"],
      ["subrecipient_finding", "finding-1", "Finding: Missing support"],
      ["subrecipient_corrective_action", "action-1", "Corrective action: Upload support"],
      ["document", "doc-general", "Linked document: agreement.pdf"],
      ["activity_log", "activity-1", "Activity: created Annual report review"],
    ]);
  });

  it("falls back to activity entity type when bundle activity lacks a label", () => {
    expect(
      buildEvidenceBundleManifest({
        subrecipient: { id: "sub-1", name: "Community Partner" },
        subaward: { id: "award-1", title: "Youth services" },
        riskAssessments: [],
        tasks: [],
        logs: [],
        findings: [],
        correctiveActions: [],
        documents: [],
        activityEntries: [
          {
            id: "activity-1",
            action: "updated",
            entityType: "subaward",
            entityLabel: null,
          },
        ],
      }).at(-1),
    ).toMatchObject({
      itemType: "activity_log",
      caption: "Activity: updated subaward",
    });
  });

  it("emits only external-review scope item types in evidence bundle manifests", () => {
    const allowedTypes = new Set<string>(EXTERNAL_REVIEW_SCOPE_TYPES);

    const manifest = buildEvidenceBundleManifest({
      subrecipient: { id: "sub-1", name: "Community Partner" },
      subaward: { id: "award-1", title: "Youth services" },
      riskAssessments: [{ id: "risk-1", finalRiskRating: "medium" }],
      tasks: [],
      logs: [],
      findings: [],
      correctiveActions: [],
      documents: [],
      activityEntries: [{ id: "activity-1", action: "created", entityType: "subaward" }],
    });

    expect(manifest.filter((item) => !allowedTypes.has(item.itemType))).toEqual([]);
  });

  it("rejects subrecipient references outside the organization before insert", async () => {
    const db = {
      query: {
        contacts: { findFirst: vi.fn().mockResolvedValue(null) },
        orgMembers: { findFirst: vi.fn() },
      },
      insert: vi.fn(),
    };

    await expect(
      createSubrecipient(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        data: {
          name: "Community Partner",
          primaryContactId: "contact-other",
          ownerId: "user-2",
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects findings linked to monitoring tasks from another subaward", async () => {
    const db = {
      query: {
        subawards: { findFirst: vi.fn().mockResolvedValue({ id: "subaward-1" }) },
        subrecipientMonitoringTasks: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      insert: vi.fn(),
    };

    await expect(
      createFinding(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subawardId: "subaward-1",
        data: {
          title: "Missing support",
          severity: "medium",
          description: "Missing invoice support.",
          monitoringTaskId: "task-other",
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects paid monitoring reads without Audit-Ready entitlement", async () => {
    const db = makeMockDb();
    const baseParams = {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "growth",
    };

    await expect(
      listSubrecipients(db as never, {
        ...baseParams,
        page: "1" as never,
        pageSize: "10" as never,
      }),
    ).rejects.toMatchObject({ status: 402 });
    await expect(
      listSubawards(db as never, {
        ...baseParams,
        grantId: "grant-1",
      }),
    ).rejects.toMatchObject({ status: 402 });
    await expect(
      getSubrecipient(db as never, {
        ...baseParams,
        subrecipientId: "sub-1",
      }),
    ).rejects.toMatchObject({ status: 402 });
    await expect(
      getSubaward(db as never, {
        ...baseParams,
        subawardId: "award-1",
      }),
    ).rejects.toMatchObject({ status: 402 });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("returns not found for missing active subrecipient and subaward reads", async () => {
    const db = makeMockDb({
      queryResults: {
        subrecipients: [null],
        subawards: [null],
      },
    });

    await expect(
      getSubrecipient(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subrecipientId: "missing-sub",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      getSubaward(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subawardId: "missing-award",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects org references outside the organization across subaward and document checks", async () => {
    await expect(
      createSubaward(
        {
          query: {
            subrecipients: { findFirst: vi.fn().mockResolvedValue({ id: "sub-1" }) },
            grants: { findFirst: vi.fn().mockResolvedValue(null) },
          },
          insert: vi.fn(),
        } as never,
        {
          orgId: "org-1",
          actorId: "user-1",
          planTier: "audit_ready",
          subrecipientId: "sub-1",
          data: subawardBody,
        },
      ),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      createMonitoringTask(
        {
          query: {
            documents: { findFirst: vi.fn().mockResolvedValue(null) },
            orgMembers: { findFirst: vi.fn() },
          },
          insert: vi.fn(),
        } as never,
        {
          orgId: "org-1",
          actorId: "user-1",
          planTier: "audit_ready",
          subawardId: "award-1",
          data: {
            title: "Evidence review",
            dueDate: "2026-06-01T00:00:00.000Z",
            evidenceDocumentId: "doc-other",
          },
        },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects invalid subaward creation input before loading the subrecipient", async () => {
    const findFirst = vi.fn();
    const db = {
      query: {
        subrecipients: { findFirst },
        grants: { findFirst: vi.fn() },
      },
      insert: vi.fn(),
    };

    await expect(
      createSubaward(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subrecipientId: "sub-1",
        data: {
          grantId: "grant-1",
          title: "",
          amountCents: 0,
          startDate: "not-a-date",
          endDate: "2026-12-31T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow();

    expect(findFirst).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects invalid subaward updates before loading the subaward", async () => {
    const findFirst = vi.fn();
    const db = {
      query: {
        subawards: { findFirst },
        grants: { findFirst: vi.fn() },
      },
      update: vi.fn(),
    };

    await expect(
      updateSubaward(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subawardId: "award-1",
        data: { amountCents: 0 },
      }),
    ).rejects.toThrow();

    expect(findFirst).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("rejects invalid risk assessments before loading the subaward", async () => {
    const findFirst = vi.fn();
    const db = {
      query: { subawards: { findFirst } },
      transaction: vi.fn(),
    };

    await expect(
      createRiskAssessment(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subawardId: "award-1",
        data: {
          checklist: {
            priorFindings: "no",
            newPartner: "no",
            complexRequirements: "no",
            highDollarAward: "no",
            weakControls: "no",
          },
          suggestedRiskRating: "low",
          finalRiskRating: "high",
        },
      }),
    ).rejects.toThrow();

    expect(findFirst).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid generated monitoring task input before loading the subaward", async () => {
    const findFirst = vi.fn();
    const db = {
      query: { subawards: { findFirst } },
      transaction: vi.fn(),
    };

    await expect(
      generateMonitoringTasks(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subawardId: "award-1",
        data: { riskRating: "severe" as never },
      }),
    ).rejects.toThrow();

    expect(findFirst).not.toHaveBeenCalled();
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid monitoring logs before loading the subaward", async () => {
    const findFirst = vi.fn();
    const db = {
      query: {
        subawards: { findFirst },
        documents: { findFirst: vi.fn() },
      },
      insert: vi.fn(),
    };

    await expect(
      createMonitoringLog(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subawardId: "award-1",
        data: {
          logType: "desk_review",
          title: "Desk review",
          occurredAt: "2026-05-06T00:00:00.000Z",
          summary: "",
        },
      }),
    ).rejects.toThrow();

    expect(findFirst).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects invalid findings before loading the subaward", async () => {
    const findFirst = vi.fn();
    const db = {
      query: {
        subawards: { findFirst },
        subrecipientMonitoringTasks: { findFirst: vi.fn() },
      },
      insert: vi.fn(),
    };

    await expect(
      createFinding(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subawardId: "award-1",
        data: {
          title: "",
          severity: "critical" as never,
          description: "",
        },
      }),
    ).rejects.toThrow();

    expect(findFirst).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("rejects owners outside the organization on records with assignable owners", async () => {
    const db = makeMockDb({
      queryResults: {
        contacts: [{ id: "contact-1" }],
        orgMembers: [null],
      },
    });

    await expect(
      createSubrecipient(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        data: {
          name: "Community Partner",
          primaryContactId: "contact-1",
          ownerId: "user-other",
        },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("rejects finding updates that relink to a task from another subaward", async () => {
    const db = {
      query: {
        subrecipientFindings: {
          findFirst: vi.fn().mockResolvedValue({ id: "finding-1", subawardId: "award-1" }),
        },
        subrecipientMonitoringTasks: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      update: vi.fn(),
    };

    await expect(
      updateFinding(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        findingId: "finding-1",
        data: { monitoringTaskId: "task-other" },
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("sets monitoring task completion fields when status changes to completed", async () => {
    const set = vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([
          {
            id: "task-1",
            title: "Annual report review",
            status: "completed",
          },
        ]),
      })),
    }));
    const db: Record<string, unknown> = {
      query: { documents: { findFirst: vi.fn() }, orgMembers: { findFirst: vi.fn() } },
      update: vi.fn(() => ({ set })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: "activity-1" }]) })),
      })),
    };
    db.transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(db));

    await updateMonitoringTask(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "audit_ready",
      taskId: "task-1",
      data: { status: "completed" },
    });

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        completedBy: "user-1",
        completedAt: expect.any(Date),
      }),
    );
  });

  it("lists portfolio rows after enrichment filters are applied", async () => {
    const db = makeMockDb({
      selectResults: [
        [
          {
            id: "sub-1",
            name: "Community Partner",
            status: "active",
            ownerId: "owner-1",
            primaryContactId: null,
          },
          {
            id: "sub-2",
            name: "Low Partner",
            status: "active",
            ownerId: "owner-1",
            primaryContactId: null,
          },
        ],
        [
          {
            id: "award-1",
            subrecipientId: "sub-1",
            grantId: "grant-1",
            status: "active",
            riskRating: "high",
          },
          {
            id: "award-2",
            subrecipientId: "sub-2",
            grantId: "grant-2",
            status: "active",
            riskRating: "low",
          },
        ],
        [
          { subawardId: "award-1", status: "open", dueDate: new Date("2026-05-01T00:00:00.000Z") },
          {
            subawardId: "award-2",
            status: "completed",
            dueDate: new Date("2026-05-01T00:00:00.000Z"),
          },
        ],
        [
          { subawardId: "award-1", status: "open" },
          { subawardId: "award-2", status: "resolved" },
        ],
      ],
    });

    const result = await listSubrecipients(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "audit_ready",
      page: "1" as never,
      pageSize: "10" as never,
      riskRating: "high",
      grantId: "grant-1",
      overdueTasks: true,
      openFindings: true,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ id: "sub-1", highestRiskRating: "high" });
    expect(result.total).toBe(1);
    expect(result.summary).toEqual({
      subrecipients: 1,
      highRisk: 1,
      overdueTasks: 1,
      openFindings: 1,
    });
  });

  it("accepts already-normalized numeric pagination params from the route layer", async () => {
    const db = makeMockDb({
      selectResults: [
        [
          {
            id: "sub-1",
            name: "First Partner",
            status: "active",
            ownerId: null,
            primaryContactId: null,
          },
          {
            id: "sub-2",
            name: "Second Partner",
            status: "active",
            ownerId: null,
            primaryContactId: null,
          },
        ],
        [],
        [],
        [],
      ],
    });

    const result = await listSubrecipients(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "audit_ready",
      page: 2,
      pageSize: 1,
    });

    expect(result.rows).toEqual([expect.objectContaining({ id: "sub-2" })]);
    expect(result.total).toBe(2);
    expect(result.summary.subrecipients).toBe(2);
  });

  it("summary aggregates over the full filtered set, not just the current page", async () => {
    const db = makeMockDb({
      selectResults: [
        [
          {
            id: "sub-1",
            name: "High Risk Partner",
            status: "active",
            ownerId: null,
            primaryContactId: null,
          },
          {
            id: "sub-2",
            name: "Low Risk Partner",
            status: "active",
            ownerId: null,
            primaryContactId: null,
          },
          {
            id: "sub-3",
            name: "Another Partner",
            status: "active",
            ownerId: null,
            primaryContactId: null,
          },
        ],
        [
          {
            id: "award-1",
            subrecipientId: "sub-1",
            grantId: "grant-1",
            status: "active",
            riskRating: "high",
          },
          {
            id: "award-2",
            subrecipientId: "sub-2",
            grantId: "grant-1",
            status: "active",
            riskRating: "low",
          },
          {
            id: "award-3",
            subrecipientId: "sub-3",
            grantId: "grant-1",
            status: "active",
            riskRating: "high",
          },
        ],
        [
          { subawardId: "award-1", status: "open", dueDate: new Date("2020-01-01T00:00:00.000Z") },
          { subawardId: "award-3", status: "open", dueDate: new Date("2020-01-01T00:00:00.000Z") },
        ],
        [
          { subawardId: "award-1", status: "open" },
          { subawardId: "award-2", status: "open" },
        ],
      ],
    });

    // page=1, pageSize=1 — only sub-1 in rows, but total should be 3 and summary should cover all 3
    const result = await listSubrecipients(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "audit_ready",
      page: 1,
      pageSize: 1,
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ id: "sub-1" });
    expect(result.total).toBe(3);
    expect(result.summary.subrecipients).toBe(3);
    expect(result.summary.highRisk).toBe(2);
    expect(result.summary.overdueTasks).toBeGreaterThanOrEqual(2);
    expect(result.summary.openFindings).toBeGreaterThanOrEqual(2);
  });

  it("lists portfolio rows with direct filters and unfiltered grant scope", async () => {
    const db = makeMockDb({
      selectResults: [
        [
          {
            id: "sub-1",
            name: "Community Partner",
            status: "watchlist",
            ownerId: "owner-1",
            primaryContactId: null,
          },
        ],
        [],
        [],
        [],
      ],
    });

    const result = await listSubrecipients(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "audit_ready",
      page: "1" as never,
      pageSize: "10" as never,
      status: "watchlist",
      ownerId: "owner-1",
      search: "Community",
    });

    expect(result.rows).toEqual([
      expect.objectContaining({
        id: "sub-1",
        subawardCount: 0,
        highestRiskRating: null,
      }),
    ]);
    expect(result.total).toBe(1);
    expect(result.summary).toEqual({
      subrecipients: 1,
      highRisk: 0,
      overdueTasks: 0,
      openFindings: 0,
    });
  });

  it("reads subrecipient detail with no linked subawards", async () => {
    const db = makeMockDb({
      queryResults: {
        subrecipients: [{ id: "sub-empty", name: "No Awards", status: "active" }],
      },
      selectResults: [[], [{ id: "doc-1", entityType: "subrecipient", entityId: "sub-empty" }]],
    });

    await expect(
      getSubrecipient(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subrecipientId: "sub-empty",
      }),
    ).resolves.toMatchObject({
      subawards: [],
      riskAssessments: [],
      monitoringLogs: [],
      correctiveActions: [],
    });
  });

  it("lists subawards for a subrecipient when there are no monitoring records", async () => {
    const db = makeMockDb({
      selectResults: [
        [
          {
            id: "award-empty",
            subrecipientId: "sub-1",
            grantId: "grant-1",
            status: "active",
            riskRating: null,
          },
        ],
        [],
        [],
      ],
    });

    await expect(
      listSubawards(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subrecipientId: "sub-1",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "award-empty",
        openTaskCount: 0,
        overdueTaskCount: 0,
        openFindingCount: 0,
      }),
    ]);
  });

  it("reads subrecipient detail and grant-filtered subawards", async () => {
    const subrecipient = {
      id: "sub-1",
      name: "Community Partner",
      status: "active",
      ownerId: null,
      primaryContactId: null,
    };
    const subaward = {
      id: "award-1",
      subrecipientId: "sub-1",
      grantId: "grant-1",
      title: "Youth services",
      amountCents: 1000,
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
      status: "active",
      riskRating: "medium",
    };
    const db = makeMockDb({
      queryResults: {
        subrecipients: [subrecipient],
        subawards: [subaward],
      },
      selectResults: [
        [subaward],
        [{ id: "risk-1", subawardId: "award-1", finalRiskRating: "medium" }],
        [
          {
            id: "task-1",
            subawardId: "award-1",
            status: "open",
            dueDate: new Date("2026-06-01T00:00:00.000Z"),
          },
        ],
        [{ id: "log-1", subawardId: "award-1", title: "Desk review" }],
        [{ id: "finding-1", subawardId: "award-1", status: "open" }],
        [{ id: "doc-1", entityType: "subrecipient", entityId: "sub-1", filename: "agreement.pdf" }],
        [{ id: "action-1", findingId: "finding-1", status: "open" }],
        [subaward],
        [
          {
            id: "task-1",
            subawardId: "award-1",
            status: "open",
            dueDate: new Date("2026-06-01T00:00:00.000Z"),
          },
        ],
        [{ id: "finding-1", subawardId: "award-1", status: "open" }],
      ],
    });

    await expect(
      getSubrecipient(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subrecipientId: "sub-1",
      }),
    ).resolves.toMatchObject({
      subrecipient: { id: "sub-1" },
      subawards: [expect.objectContaining({ id: "award-1" })],
      correctiveActions: [expect.objectContaining({ id: "action-1" })],
    });
    await expect(
      getSubaward(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subawardId: "award-1",
      }),
    ).resolves.toMatchObject({ id: "award-1" });
    await expect(
      listSubawards(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        grantId: "grant-1",
      }),
    ).resolves.toHaveLength(1);
  });

  it("executes subrecipient, subaward, risk, and generated task mutations", async () => {
    const subrecipient = { id: "sub-1", name: "Community Partner", status: "active" };
    const subaward = {
      id: "award-1",
      subrecipientId: "sub-1",
      grantId: "grant-1",
      title: "Youth services",
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
      status: "active",
      riskRating: "low",
    };
    const db = makeMockDb({
      queryResults: {
        contacts: [{ id: "contact-1" }],
        orgMembers: [{ id: "member-1" }],
        subrecipients: [subrecipient, subrecipient, subrecipient, subrecipient],
        grants: [{ id: "grant-1" }],
        subawards: [subaward, subaward, subaward],
      },
      insertResults: [
        [subrecipient],
        [subaward],
        [{ id: "risk-1", finalRiskRating: "high" }],
        [{ id: "task-1", title: "Generated task", status: "open" }],
        [{ id: "task-2", title: "Generated task", status: "open" }],
        [{ id: "task-3", title: "Generated task", status: "open" }],
      ],
      updateResults: [[subrecipient], [subaward], [subaward]],
    });

    await expect(
      createSubrecipient(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        data: {
          name: "Community Partner",
          primaryContactId: "contact-1",
          ownerId: "user-2",
        },
      }),
    ).resolves.toMatchObject({ id: "sub-1" });
    await expect(
      updateSubrecipient(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subrecipientId: "sub-1",
        data: { status: "watchlist" },
      }),
    ).resolves.toMatchObject({ id: "sub-1" });
    const deleteDb = makeMockDb({
      queryResults: {
        subrecipients: [subrecipient],
        subawards: [],
      },
      updateResults: [[subrecipient]],
    });
    await expect(
      deleteSubrecipient(deleteDb as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subrecipientId: "sub-1",
      }),
    ).resolves.toMatchObject({ id: "sub-1" });
    await expect(
      createSubaward(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subrecipientId: "sub-1",
        data: {
          grantId: "grant-1",
          title: "Youth services",
          amountCents: 1000,
          startDate: "2026-05-01T00:00:00.000Z",
          endDate: "2026-12-31T00:00:00.000Z",
        },
      }),
    ).resolves.toMatchObject({ id: "award-1" });
    await expect(
      updateSubaward(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subawardId: "award-1",
        data: { status: "active" },
      }),
    ).resolves.toMatchObject({ id: "award-1" });
    await expect(
      createRiskAssessment(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subawardId: "award-1",
        data: {
          checklist: {
            priorFindings: "yes",
            newPartner: "no",
            complexRequirements: "yes",
            highDollarAward: "no",
            weakControls: "unknown",
          },
          suggestedRiskRating: "high",
        },
      }),
    ).resolves.toMatchObject({ id: "risk-1" });
    await expect(
      generateMonitoringTasks(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subawardId: "award-1",
        data: { riskRating: "low" },
      }),
    ).resolves.toHaveLength(3);
  });

  it("covers defensive failure branches for core subrecipient and subaward mutations", async () => {
    await expect(
      createSubrecipient(makeMockDb({ insertResults: [[]] }) as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        data: { name: "Community Partner" },
      }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      updateSubrecipient(
        makeMockDb({
          queryResults: {
            subrecipients: [{ id: "sub-1", name: "Community Partner", status: "active" }],
            contacts: [{ id: "contact-1" }],
            orgMembers: [{ id: "member-1" }],
          },
          updateResults: [[]],
        }) as never,
        {
          orgId: "org-1",
          actorId: "user-1",
          planTier: "audit_ready",
          subrecipientId: "sub-1",
          data: { primaryContactId: "contact-1", ownerId: "user-2" },
        },
      ),
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      createSubaward(
        makeMockDb({
          queryResults: {
            subrecipients: [{ id: "sub-1" }],
            grants: [{ id: "grant-1" }],
          },
          insertResults: [[]],
        }) as never,
        {
          orgId: "org-1",
          actorId: "user-1",
          planTier: "audit_ready",
          subrecipientId: "sub-1",
          data: subawardBody,
        },
      ),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      updateSubaward(
        makeMockDb({
          queryResults: {
            subawards: [{ id: "award-1", title: "Youth services" }],
            grants: [{ id: "grant-2" }],
          },
          updateResults: [[]],
        }) as never,
        {
          orgId: "org-1",
          actorId: "user-1",
          planTier: "audit_ready",
          subawardId: "award-1",
          data: {
            grantId: "grant-2",
            startDate: "2026-06-01T00:00:00.000Z",
            endDate: "2026-12-31T00:00:00.000Z",
          },
        },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("returns 404 when the soft-delete UPDATE matches no active subrecipient row", async () => {
    const db = makeMockDb({
      queryResults: {
        subrecipients: [{ id: "sub-1", name: "Community Partner", status: "active" }],
        subawards: [],
      },
      updateResults: [[]],
    });

    await expect(
      deleteSubrecipient(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subrecipientId: "sub-1",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("rejects deleting a subrecipient that still has an active subaward", async () => {
    const db = makeMockDb({
      queryResults: {
        subrecipients: [{ id: "sub-1", name: "Community Partner", status: "active" }],
        subawards: [{ id: "award-1" }],
      },
    });

    await expect(
      deleteSubrecipient(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subrecipientId: "sub-1",
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Cannot delete a subrecipient that still has active subawards",
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("soft-delete and update guards exclude already-deleted rows via deleted_at is null", async () => {
    const renderWhere = (mock: ReturnType<typeof vi.fn>) => {
      const cond = mock.mock.calls.at(-1)?.[0];
      return new PgDialect().sqlToQuery(cond).sql;
    };

    // deleteSubrecipient: scopes the soft-delete UPDATE to non-deleted rows
    const delDb = makeMockDb({
      queryResults: {
        subrecipients: [{ id: "sub-1", name: "Community Partner", status: "active" }],
        subawards: [],
      },
      updateResults: [[{ id: "sub-1" }]],
    });
    await deleteSubrecipient(delDb as never, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "audit_ready",
      subrecipientId: "sub-1",
    });
    expect(renderWhere(delDb.lastUpdateWhere)).toContain('"deleted_at" is null');

    // updateSubrecipient: UPDATE WHERE excludes deleted rows
    const updSubDb = makeMockDb({
      queryResults: {
        subrecipients: [{ id: "sub-1", name: "Community Partner", status: "active" }],
      },
      updateResults: [[{ id: "sub-1" }]],
    });
    await updateSubrecipient(updSubDb as never, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "audit_ready",
      subrecipientId: "sub-1",
      data: { status: "watchlist" },
    });
    expect(renderWhere(updSubDb.lastUpdateWhere)).toContain('"deleted_at" is null');

    // updateSubaward: UPDATE WHERE excludes deleted rows
    const updAwardDb = makeMockDb({
      queryResults: {
        subawards: [{ id: "award-1", title: "Youth services" }],
      },
      updateResults: [[{ id: "award-1" }]],
    });
    await updateSubaward(updAwardDb as never, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "audit_ready",
      subawardId: "award-1",
      data: { status: "active" },
    });
    expect(renderWhere(updAwardDb.lastUpdateWhere)).toContain('"deleted_at" is null');
  });

  it("scopes the createRiskAssessment subaward write by deleted_at is null", async () => {
    const renderWhere = (mock: ReturnType<typeof vi.fn>) => {
      const cond = mock.mock.calls.at(-1)?.[0];
      return new PgDialect().sqlToQuery(cond).sql;
    };

    // Happy path: subaward live at pre-check, assessment insert succeeds, then
    // the subaward riskRating update runs. The UPDATE WHERE must exclude
    // soft-deleted rows so a concurrent delete cannot be stamped over.
    const db = makeMockDb({
      queryResults: {
        subawards: [{ id: "award-1", title: "Youth services", riskRating: "low" }],
      },
      insertResults: [[{ id: "risk-1", finalRiskRating: "high" }]],
      updateResults: [[{ id: "award-1", riskRating: "high" }]],
    });

    await createRiskAssessment(db as never, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "audit_ready",
      subawardId: "award-1",
      data: {
        checklist: {
          priorFindings: "no",
          newPartner: "no",
          complexRequirements: "no",
          highDollarAward: "no",
          weakControls: "no",
        },
        suggestedRiskRating: "low",
        finalRiskRating: "high",
        overrideReason: "Escalated after review of weak controls.",
      },
    });

    expect(renderWhere(db.lastUpdateWhere)).toContain('"deleted_at" is null');
  });

  it("rolls back when the subaward is soft-deleted between the risk-assessment pre-check and write", async () => {
    // Subaward live at pre-check, assessment insert succeeds, but the guarded
    // UPDATE returns no row (concurrent soft-delete) → must throw 404 so the
    // transaction rolls back the orphaned assessment insert.
    const db = makeMockDb({
      queryResults: {
        subawards: [{ id: "award-1", title: "Youth services", riskRating: "low" }],
      },
      insertResults: [[{ id: "risk-1", finalRiskRating: "high" }]],
      updateResults: [[]],
    });

    await expect(
      createRiskAssessment(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subawardId: "award-1",
        data: {
          checklist: {
            priorFindings: "no",
            newPartner: "no",
            complexRequirements: "no",
            highDollarAward: "no",
            weakControls: "no",
          },
          suggestedRiskRating: "low",
          finalRiskRating: "high",
          overrideReason: "Escalated after review of weak controls.",
        },
      }),
    ).rejects.toMatchObject({ status: 404, message: "Subaward not found" });
  });

  it("rejects partial subaward date updates that would invert the saved range", async () => {
    const db = makeMockDb({
      queryResults: {
        subawards: [
          {
            id: "award-1",
            title: "Youth services",
            startDate: new Date("2026-01-01T00:00:00.000Z"),
            endDate: new Date("2026-06-30T00:00:00.000Z"),
          },
        ],
      },
      updateResults: [[{ id: "award-1" }]],
    });

    await expect(
      updateSubaward(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subawardId: "award-1",
        data: { startDate: "2026-07-01T00:00:00.000Z" },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Start date must be before or equal to end date",
    });
    expect(db.update).not.toHaveBeenCalled();
  });

  it("covers risk assessment and generated task defaults and failures", async () => {
    await expect(
      createRiskAssessment(
        makeMockDb({
          queryResults: {
            subawards: [{ id: "award-1", title: "Youth services", riskRating: "low" }],
          },
          insertResults: [[]],
        }) as never,
        {
          orgId: "org-1",
          actorId: "user-1",
          planTier: "audit_ready",
          subawardId: "award-1",
          data: {
            checklist: {
              priorFindings: "no",
              newPartner: "no",
              complexRequirements: "no",
              highDollarAward: "no",
              weakControls: "no",
            },
            suggestedRiskRating: "low",
            assessedAt: "2026-05-06T00:00:00.000Z",
          },
        },
      ),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      generateMonitoringTasks(
        makeMockDb({
          queryResults: {
            subawards: [{ id: "award-1", title: "Youth services", riskRating: "high" }],
          },
          insertResults: Array.from({ length: 8 }, (_value, index) => [
            { id: `task-${index}`, title: "Generated task", status: "open" },
          ]),
        }) as never,
        {
          orgId: "org-1",
          actorId: "user-1",
          planTier: "audit_ready",
          subawardId: "award-1",
          data: {},
        },
      ),
    ).resolves.toHaveLength(8);
  });

  it("executes monitoring records and evidence bundle generation", async () => {
    const subaward = {
      id: "award-1",
      subrecipientId: "sub-1",
      title: "Youth services",
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
    };
    const subrecipient = { id: "sub-1", name: "Community Partner" };
    const db = makeMockDb({
      queryResults: {
        subawards: [subaward, subaward, subaward, subaward],
        subrecipients: [subrecipient],
        documents: [{ id: "doc-1" }],
        subrecipientMonitoringTasks: [{ id: "task-1" }],
        subrecipientFindings: [
          { id: "finding-1", subawardId: "award-1" },
          { id: "finding-1", subawardId: "award-1" },
        ],
        evidenceBundles: [null],
      },
      selectResults: [
        [{ id: "risk-1", finalRiskRating: "medium" }],
        [{ id: "task-1", title: "Annual report review", evidenceDocumentId: "doc-1" }],
        [{ id: "log-1", title: "Desk review", documentId: "doc-2" }],
        [{ id: "finding-1", title: "Missing support" }],
        [{ id: "action-1", title: "Upload support" }],
        [{ id: "doc-1", filename: "task.pdf" }],
        [
          {
            id: "activity-1",
            action: "created",
            entityType: "subaward",
            entityLabel: "Youth services",
          },
        ],
        [],
      ],
      insertResults: [
        [{ id: "log-1", title: "Desk review" }],
        [{ id: "log-2", title: "Desk review" }],
        [{ id: "finding-1", title: "Missing support" }],
        [{ id: "action-1", title: "Upload support", status: "open" }],
        [{ id: "bundle-1", title: "Bundle" }],
        [{ id: "item-1" }],
      ],
      updateResults: [
        [{ id: "finding-1", title: "Missing support", status: "resolved" }],
        [{ id: "action-1", title: "Upload support", status: "completed" }],
      ],
    });

    await expect(
      createMonitoringLog(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subawardId: "award-1",
        data: {
          logType: "desk_review",
          title: "Desk review",
          occurredAt: "2026-05-06T00:00:00.000Z",
          summary: "Reviewed evidence.",
          documentId: "doc-1",
        },
      }),
    ).resolves.toMatchObject({ id: "log-1" });
    await expect(
      createMonitoringLog(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subawardId: "award-1",
        data: {
          logType: "desk_review",
          title: "Desk review",
          occurredAt: "2026-05-06T00:00:00.000Z",
          summary: "Reviewed evidence.",
        },
      }),
    ).resolves.toMatchObject({ id: "log-2" });
    await expect(
      createFinding(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subawardId: "award-1",
        data: {
          title: "Missing support",
          severity: "medium",
          description: "Missing support.",
          monitoringTaskId: "task-1",
        },
      }),
    ).resolves.toMatchObject({ id: "finding-1" });
    await expect(
      createCorrectiveAction(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        findingId: "finding-1",
        data: {
          findingId: "finding-1",
          title: "Upload support",
          dueDate: "2026-06-01T00:00:00.000Z",
        },
      }),
    ).resolves.toMatchObject({ id: "action-1" });
    await expect(
      updateFinding(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        findingId: "finding-1",
        data: { status: "resolved" },
      }),
    ).resolves.toMatchObject({ status: "resolved" });
    await expect(
      updateCorrectiveAction(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        actionId: "action-1",
        data: { status: "completed" },
      }),
    ).resolves.toMatchObject({ status: "completed" });
    await expect(
      createEvidenceBundle(db as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        subawardId: "award-1",
      }),
    ).resolves.toMatchObject({ bundle: { id: "bundle-1" }, items: [{ id: "item-1" }] });
  });

  it("covers optional monitoring task updates and defensive insert failures", async () => {
    const documentAndOwnerDb = makeMockDb({
      queryResults: {
        documents: [{ id: "doc-1" }],
        orgMembers: [{ id: "member-1" }],
      },
      updateResults: [
        [{ id: "task-1", title: "Evidence review", status: "in_progress" }],
        [{ id: "task-1", title: "Evidence review", status: "open" }],
      ],
    });

    await expect(
      createMonitoringTask(
        makeMockDb({
          queryResults: {
            documents: [{ id: "doc-1" }],
            orgMembers: [{ id: "member-1" }],
          },
          insertResults: [[]],
        }) as never,
        {
          orgId: "org-1",
          actorId: "user-1",
          planTier: "audit_ready",
          subawardId: "award-1",
          data: {
            title: "Evidence review",
            dueDate: "2026-06-01T00:00:00.000Z",
            ownerId: "user-2",
            evidenceDocumentId: "doc-1",
          },
        },
      ),
    ).rejects.toMatchObject({ status: 400 });

    await updateMonitoringTask(documentAndOwnerDb as never, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "audit_ready",
      taskId: "task-1",
      data: {
        status: "in_progress",
        dueDate: "2026-06-15T00:00:00.000Z",
        ownerId: "user-2",
        evidenceDocumentId: "doc-1",
      },
    });
    await updateMonitoringTask(documentAndOwnerDb as never, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "audit_ready",
      taskId: "task-1",
      data: { completedAt: null },
    });

    await expect(
      updateMonitoringTask(makeMockDb({ updateResults: [[]] }) as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        taskId: "missing-task",
        data: { status: "completed", completedAt: "2026-06-01T00:00:00.000Z" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("covers defensive failure branches for monitoring logs, findings, and actions", async () => {
    await expect(
      createMonitoringLog(
        makeMockDb({
          queryResults: {
            subawards: [{ id: "award-1" }],
          },
          insertResults: [[]],
        }) as never,
        {
          orgId: "org-1",
          actorId: "user-1",
          planTier: "audit_ready",
          subawardId: "award-1",
          data: {
            logType: "desk_review",
            title: "Desk review",
            occurredAt: "2026-05-06T00:00:00.000Z",
            summary: "Reviewed evidence.",
          },
        },
      ),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      createFinding(
        makeMockDb({
          queryResults: {
            subawards: [{ id: "award-1" }],
          },
          insertResults: [[]],
        }) as never,
        {
          orgId: "org-1",
          actorId: "user-1",
          planTier: "audit_ready",
          subawardId: "award-1",
          data: {
            title: "Missing support",
            severity: "medium",
            description: "Missing support.",
          },
        },
      ),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      updateFinding(
        makeMockDb({
          queryResults: {
            subrecipientFindings: [null],
          },
        }) as never,
        {
          orgId: "org-1",
          actorId: "user-1",
          planTier: "audit_ready",
          findingId: "missing-finding",
          data: { status: "resolved" },
        },
      ),
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      updateFinding(
        makeMockDb({
          queryResults: {
            subrecipientFindings: [{ id: "finding-1", subawardId: "award-1" }],
            subrecipientMonitoringTasks: [{ id: "task-1" }],
          },
          updateResults: [[]],
        }) as never,
        {
          orgId: "org-1",
          actorId: "user-1",
          planTier: "audit_ready",
          findingId: "finding-1",
          data: { monitoringTaskId: "task-1" },
        },
      ),
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      createCorrectiveAction(
        makeMockDb({
          queryResults: {
            subrecipientFindings: [null],
          },
        }) as never,
        {
          orgId: "org-1",
          actorId: "user-1",
          planTier: "audit_ready",
          findingId: "missing-finding",
          data: {
            findingId: "missing-finding",
            title: "Upload support",
            dueDate: "2026-06-01T00:00:00.000Z",
          },
        },
      ),
    ).rejects.toMatchObject({ status: 404 });

    await expect(
      createCorrectiveAction(
        makeMockDb({
          queryResults: {
            subrecipientFindings: [{ id: "finding-1" }],
            orgMembers: [{ id: "member-1" }],
          },
          insertResults: [[]],
        }) as never,
        {
          orgId: "org-1",
          actorId: "user-1",
          planTier: "audit_ready",
          findingId: "finding-1",
          data: {
            findingId: "finding-1",
            title: "Upload support",
            dueDate: "2026-06-01T00:00:00.000Z",
            ownerId: "user-2",
          },
        },
      ),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      updateCorrectiveAction(makeMockDb({ updateResults: [[]] }) as never, {
        orgId: "org-1",
        actorId: "user-1",
        planTier: "audit_ready",
        actionId: "missing-action",
        data: { status: "completed", ownerId: "user-2" },
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("updates corrective actions without completion and refreshes existing evidence bundles", async () => {
    const actionDb = makeMockDb({
      updateResults: [
        [{ id: "action-1", title: "Upload support", status: "in_progress" }],
        [{ id: "action-1", title: "Upload support", status: "open" }],
      ],
    });

    await updateCorrectiveAction(actionDb as never, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "audit_ready",
      actionId: "action-1",
      data: {
        status: "in_progress",
        dueDate: "2026-06-15T00:00:00.000Z",
      },
    });
    await updateCorrectiveAction(actionDb as never, {
      orgId: "org-1",
      actorId: "user-1",
      planTier: "audit_ready",
      actionId: "action-1",
      data: {},
    });

    const subaward = {
      id: "award-1",
      subrecipientId: "sub-1",
      title: "Youth services",
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
    };
    await expect(
      createEvidenceBundle(
        makeMockDb({
          queryResults: {
            subawards: [subaward],
            subrecipients: [{ id: "sub-1", name: "Community Partner" }],
            evidenceBundles: [{ id: "bundle-1", title: "Existing bundle" }],
          },
          selectResults: [[], [], [], [], [], [], [{ id: "item-existing", bundleId: "bundle-1" }]],
          insertResults: [[{ id: "item-1" }]],
        }) as never,
        {
          orgId: "org-1",
          actorId: "user-1",
          planTier: "audit_ready",
          subawardId: "award-1",
        },
      ),
    ).resolves.toMatchObject({ bundle: { id: "bundle-1" } });
  });
});

describe("activity-log atomicity", () => {
  function makeAtomicDb(
    insertResults: unknown[][] = [],
    updateResults: unknown[][] = [],
    queryOverrides: Record<string, unknown[]> = {},
  ) {
    const queryResults: Record<string, unknown[]> = {
      subrecipients: [
        {
          id: "sub-1",
          name: "Test Subrecipient",
          orgId: "org-1",
          status: "active",
          deletedAt: null,
        },
      ],
      subawards: [
        {
          id: "award-1",
          title: "Youth services",
          orgId: "org-1",
          subrecipientId: "sub-1",
          startDate: new Date("2026-05-01T00:00:00.000Z"),
          endDate: new Date("2026-12-31T00:00:00.000Z"),
          deletedAt: null,
        },
      ],
      subrecipientFindings: [
        {
          id: "finding-1",
          title: "Missing support",
          orgId: "org-1",
          subawardId: "award-1",
          deletedAt: null,
        },
      ],
      grants: [{ id: "grant-1", orgId: "org-1", deletedAt: null }],
      users: [{ id: "user-1", orgId: "org-1" }],
      documents: [{ id: "doc-1", orgId: "org-1" }],
      contacts: [{ id: "contact-1", orgId: "org-1" }],
      ...queryOverrides,
    };
    const db = makeMockDb({ insertResults, updateResults, queryResults });
    return db;
  }

  beforeEach(() => {
    vi.mocked(recordActivityLog).mockReset();
    vi.mocked(recordActivityLog).mockResolvedValue(undefined);
  });

  const baseParams = {
    orgId: "org-1",
    actorId: "user-1",
    planTier: "audit_ready" as const,
  };

  it("createSubrecipient wraps insert and audit log in a single transaction", async () => {
    const row = { id: "sub-new", name: "New Org", orgId: "org-1" };
    const db = makeAtomicDb([[row]]);

    await createSubrecipient(db as never, {
      ...baseParams,
      data: { name: "New Org", uei: "ABC123456789", status: "active" },
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "subrecipient", action: "created" }),
    );
  });

  it("createSubrecipient rolls back when the audit log write fails", async () => {
    const row = { id: "sub-new", name: "New Org", orgId: "org-1" };
    const db = makeAtomicDb([[row]]);
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      createSubrecipient(db as never, {
        ...baseParams,
        data: { name: "New Org", uei: "ABC123456789", status: "active" },
      }),
    ).rejects.toThrow("audit log down");
    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
  });

  it("updateSubrecipient wraps update and audit log in a single transaction", async () => {
    const row = { id: "sub-1", name: "Updated Org", orgId: "org-1" };
    const db = makeAtomicDb([], [[row]]);

    await updateSubrecipient(db as never, {
      ...baseParams,
      subrecipientId: "sub-1",
      data: { name: "Updated Org" },
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "subrecipient", action: "updated" }),
    );
  });

  it("updateSubrecipient rolls back when the audit log write fails", async () => {
    const row = { id: "sub-1", name: "Updated Org", orgId: "org-1" };
    const db = makeAtomicDb([], [[row]]);
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      updateSubrecipient(db as never, {
        ...baseParams,
        subrecipientId: "sub-1",
        data: { name: "Updated Org" },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("deleteSubrecipient wraps soft-delete and audit log in a single transaction", async () => {
    const row = { id: "sub-1", name: "Test Subrecipient", orgId: "org-1", deletedAt: new Date() };
    const db = makeAtomicDb([], [[row]], { subawards: [] });

    await deleteSubrecipient(db as never, {
      ...baseParams,
      subrecipientId: "sub-1",
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "subrecipient", action: "deleted" }),
    );
  });

  it("deleteSubrecipient rolls back when the audit log write fails", async () => {
    const row = { id: "sub-1", name: "Test Subrecipient", orgId: "org-1", deletedAt: new Date() };
    const db = makeAtomicDb([], [[row]], { subawards: [] });
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      deleteSubrecipient(db as never, { ...baseParams, subrecipientId: "sub-1" }),
    ).rejects.toThrow("audit log down");
  });

  it("createSubaward wraps insert and audit log in a single transaction", async () => {
    const row = {
      id: "award-new",
      title: "Youth services",
      orgId: "org-1",
      subrecipientId: "sub-1",
    };
    const db = makeAtomicDb([[row]]);

    await createSubaward(db as never, {
      ...baseParams,
      subrecipientId: "sub-1",
      data: {
        grantId: "grant-1",
        title: "Youth services",
        amountCents: 100000,
        startDate: "2026-05-06T12:00:00.000Z",
        endDate: "2026-12-31T12:00:00.000Z",
      },
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "subaward", action: "created" }),
    );
  });

  it("createSubaward rolls back when the audit log write fails", async () => {
    const row = {
      id: "award-new",
      title: "Youth services",
      orgId: "org-1",
      subrecipientId: "sub-1",
    };
    const db = makeAtomicDb([[row]]);
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      createSubaward(db as never, {
        ...baseParams,
        subrecipientId: "sub-1",
        data: {
          grantId: "grant-1",
          title: "Youth services",
          amountCents: 100000,
          startDate: "2026-05-06T12:00:00.000Z",
          endDate: "2026-12-31T12:00:00.000Z",
        },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("updateSubaward wraps update and audit log in a single transaction", async () => {
    const row = {
      id: "award-1",
      title: "Updated services",
      orgId: "org-1",
      subrecipientId: "sub-1",
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
    };
    const db = makeAtomicDb([], [[row]]);

    await updateSubaward(db as never, {
      ...baseParams,
      subawardId: "award-1",
      data: { title: "Updated services" },
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "subaward", action: "updated" }),
    );
  });

  it("updateSubaward rolls back when the audit log write fails", async () => {
    const row = {
      id: "award-1",
      title: "Updated services",
      orgId: "org-1",
      subrecipientId: "sub-1",
      startDate: new Date("2026-05-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
    };
    const db = makeAtomicDb([], [[row]]);
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      updateSubaward(db as never, {
        ...baseParams,
        subawardId: "award-1",
        data: { title: "Updated services" },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("createMonitoringTask wraps insert and audit log in a single transaction", async () => {
    const row = { id: "task-new", title: "Annual review", orgId: "org-1", subawardId: "award-1" };
    const db = makeAtomicDb([[row]]);

    await createMonitoringTask(db as never, {
      ...baseParams,
      subawardId: "award-1",
      data: {
        title: "Annual review",
        dueDate: "2026-12-01T00:00:00.000Z",
        status: "open",
      },
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "subrecipient_monitoring_task", action: "created" }),
    );
  });

  it("createMonitoringTask rolls back when the audit log write fails", async () => {
    const row = { id: "task-new", title: "Annual review", orgId: "org-1", subawardId: "award-1" };
    const db = makeAtomicDb([[row]]);
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      createMonitoringTask(db as never, {
        ...baseParams,
        subawardId: "award-1",
        data: {
          title: "Annual review",
          dueDate: "2026-12-01T00:00:00.000Z",
          status: "open",
        },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("updateMonitoringTask wraps update and audit log in a single transaction", async () => {
    const row = {
      id: "task-1",
      title: "Annual review",
      orgId: "org-1",
      status: "in_progress",
    };
    const db = makeAtomicDb([], [[row]]);

    await updateMonitoringTask(db as never, {
      ...baseParams,
      taskId: "task-1",
      data: { status: "in_progress" },
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "subrecipient_monitoring_task", action: "updated" }),
    );
  });

  it("updateMonitoringTask rolls back when the audit log write fails", async () => {
    const row = {
      id: "task-1",
      title: "Annual review",
      orgId: "org-1",
      status: "in_progress",
    };
    const db = makeAtomicDb([], [[row]]);
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      updateMonitoringTask(db as never, {
        ...baseParams,
        taskId: "task-1",
        data: { status: "in_progress" },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("createMonitoringLog wraps insert and audit log in a single transaction", async () => {
    const row = { id: "log-new", title: "Desk review", orgId: "org-1", subawardId: "award-1" };
    const db = makeAtomicDb([[row]]);

    await createMonitoringLog(db as never, {
      ...baseParams,
      subawardId: "award-1",
      data: {
        title: "Desk review",
        occurredAt: "2026-06-01T00:00:00.000Z",
        logType: "desk_review",
        summary: "Reviewed documents",
      },
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "subrecipient_monitoring_log", action: "created" }),
    );
  });

  it("createMonitoringLog rolls back when the audit log write fails", async () => {
    const row = { id: "log-new", title: "Desk review", orgId: "org-1", subawardId: "award-1" };
    const db = makeAtomicDb([[row]]);
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      createMonitoringLog(db as never, {
        ...baseParams,
        subawardId: "award-1",
        data: {
          title: "Desk review",
          occurredAt: "2026-06-01T00:00:00.000Z",
          logType: "desk_review",
          summary: "Reviewed documents",
        },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("createFinding wraps insert and audit log in a single transaction", async () => {
    const row = {
      id: "finding-new",
      title: "Missing support",
      orgId: "org-1",
      subawardId: "award-1",
    };
    const db = makeAtomicDb([[row]]);

    await createFinding(db as never, {
      ...baseParams,
      subawardId: "award-1",
      data: {
        title: "Missing support",
        description: "No issue",
        status: "open",
        severity: "low",
      },
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "subrecipient_finding", action: "created" }),
    );
  });

  it("createFinding rolls back when the audit log write fails", async () => {
    const row = {
      id: "finding-new",
      title: "Missing support",
      orgId: "org-1",
      subawardId: "award-1",
    };
    const db = makeAtomicDb([[row]]);
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      createFinding(db as never, {
        ...baseParams,
        subawardId: "award-1",
        data: {
          title: "Missing support",
          description: "No issue",
          status: "open",
          severity: "low",
        },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("updateFinding wraps update and audit log in a single transaction", async () => {
    const row = {
      id: "finding-1",
      title: "Missing support",
      orgId: "org-1",
      subawardId: "award-1",
    };
    const db = makeAtomicDb([], [[row]]);

    await updateFinding(db as never, {
      ...baseParams,
      findingId: "finding-1",
      data: { status: "in_review" },
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "subrecipient_finding", action: "updated" }),
    );
  });

  it("updateFinding rolls back when the audit log write fails", async () => {
    const row = {
      id: "finding-1",
      title: "Missing support",
      orgId: "org-1",
      subawardId: "award-1",
    };
    const db = makeAtomicDb([], [[row]]);
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      updateFinding(db as never, {
        ...baseParams,
        findingId: "finding-1",
        data: { status: "in_review" },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("createCorrectiveAction wraps insert and audit log in a single transaction", async () => {
    const row = { id: "action-new", title: "Upload support", orgId: "org-1" };
    const db = makeAtomicDb([[row]]);

    await createCorrectiveAction(db as never, {
      ...baseParams,
      findingId: "finding-1",
      data: {
        findingId: "finding-1",
        title: "Upload support",
        status: "open",
        dueDate: "2026-09-01T00:00:00.000Z",
      },
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "subrecipient_corrective_action", action: "created" }),
    );
  });

  it("createCorrectiveAction rolls back when the audit log write fails", async () => {
    const row = { id: "action-new", title: "Upload support", orgId: "org-1" };
    const db = makeAtomicDb([[row]]);
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      createCorrectiveAction(db as never, {
        ...baseParams,
        findingId: "finding-1",
        data: {
          findingId: "finding-1",
          title: "Upload support",
          status: "open",
          dueDate: "2026-09-01T00:00:00.000Z",
        },
      }),
    ).rejects.toThrow("audit log down");
  });

  it("updateCorrectiveAction wraps update and audit log in a single transaction", async () => {
    const row = {
      id: "action-1",
      title: "Upload support",
      orgId: "org-1",
      status: "in_progress",
    };
    const db = makeAtomicDb([], [[row]]);

    await updateCorrectiveAction(db as never, {
      ...baseParams,
      actionId: "action-1",
      data: { status: "in_progress" },
    });

    expect(
      (db as unknown as { transaction: ReturnType<typeof vi.fn> }).transaction,
    ).toHaveBeenCalledTimes(1);
    expect(recordActivityLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityType: "subrecipient_corrective_action", action: "updated" }),
    );
  });

  it("updateCorrectiveAction rolls back when the audit log write fails", async () => {
    const row = {
      id: "action-1",
      title: "Upload support",
      orgId: "org-1",
      status: "in_progress",
    };
    const db = makeAtomicDb([], [[row]]);
    vi.mocked(recordActivityLog).mockRejectedValueOnce(new Error("audit log down"));

    await expect(
      updateCorrectiveAction(db as never, {
        ...baseParams,
        actionId: "action-1",
        data: { status: "in_progress" },
      }),
    ).rejects.toThrow("audit log down");
  });
});
