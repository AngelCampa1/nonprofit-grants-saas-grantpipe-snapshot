import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HTTPException } from "hono/http-exception";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  generatedReports,
  reportTemplates,
  donations,
  communicationLog,
  activityLog,
  grants,
  funds,
} from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import {
  downloadReportArtifact,
  generateAcknowledgmentLetter,
  generateAuditReport,
  generateBoardReport,
  generateDonorYearEndStatementRun,
  generateGrantComplianceReport,
  generateIrs990Report,
  generateSpendDownReport,
  getAcknowledgmentTemplate,
  getGeneratedReportArtifact,
  getGeneratedReportPreview,
  listGeneratedReportArtifacts,
  updateAcknowledgmentTemplate,
} from "./service";
import puppeteer from "@cloudflare/puppeteer";
import { AppError } from "../../lib/app-error";
import { getIntegrations, resetLocalMockIntegrationRecords } from "../../lib/integrations";

const { mockCaptureBackgroundException, mockDeliverReportReadyEffects } = vi.hoisted(() => ({
  mockCaptureBackgroundException: vi.fn(),
  mockDeliverReportReadyEffects: vi.fn().mockResolvedValue(true),
}));

vi.mock("../grants/spend-down.service", () => ({
  getGrantSpendDown: vi.fn(),
}));

vi.mock("../../lib/sentry", () => ({
  captureBackgroundException: mockCaptureBackgroundException,
}));

vi.mock("../report-builder/ready-effects", () => ({
  deliverReportReadyEffects: mockDeliverReportReadyEffects,
}));

import { getGrantSpendDown } from "../grants/spend-down.service";

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function queryContainsValue(
  node: unknown,
  expected: string,
  seen = new WeakSet<object>(),
): boolean {
  if (node === expected) return true;
  if (node === null || typeof node !== "object") return false;
  if (seen.has(node)) return false;
  seen.add(node);
  if (Array.isArray(node)) {
    return node.some((item) => queryContainsValue(item, expected, seen));
  }
  return Object.entries(node as Record<string, unknown>).some(
    ([key, value]) => key !== "table" && queryContainsValue(value, expected, seen),
  );
}

beforeEach(() => {
  mockCaptureBackgroundException.mockClear();
  mockDeliverReportReadyEffects.mockReset();
  mockDeliverReportReadyEffects.mockResolvedValue(true);
});

type FakeReportRow = typeof generatedReports.$inferSelect;
type FakeTemplateRow = typeof reportTemplates.$inferSelect;
type GrantSpendDown = Awaited<ReturnType<typeof getGrantSpendDown>>;

type FakeDbState = {
  organization?: {
    id: string;
    defaultEntityId?: string | null;
    name: string;
    ein: string | null;
    logoUrl: string | null;
    address: string | null;
    fiscalYearStartMonth: number;
  };
  reportRows: FakeReportRow[];
  templateRow?: FakeTemplateRow;
  grantRecord?: {
    id: string;
    name: string;
    amountCents: number | null;
    status: string;
    startDate: Date | null;
    endDate: Date | null;
    fundAllocations: Array<{
      allocatedAmountCents: number;
      deletedAt?: Date | null;
      fund?: { deletedAt?: Date | null } | null;
    }>;
    expenses: Array<{
      amountCents: number;
      date: Date;
      description: string | null;
      deletedAt?: Date | null;
    }>;
    impactMetrics: Array<{
      id: string;
      name: string;
      targetValue: string | null;
      unit: string | null;
      deletedAt?: Date | null;
      entries: Array<{
        id: string;
        value: string | null;
        periodEnd: Date;
        createdAt: Date;
        deletedAt?: Date | null;
      }>;
    }>;
    reportingRequirements: Array<{
      reportType: string;
      dueDate: Date;
      status: string;
      deletedAt?: Date | null;
    }>;
    closeoutItems: Array<{ label: string; completed: boolean; deletedAt?: Date | null }>;
  };
  donationRecord?: {
    id: string;
    amountCents: number;
    date: Date;
    receiptSent: boolean;
    contact: {
      firstName: string | null;
      lastName: string | null;
      organizationName: string | null;
      address: string | null;
      email: string | null;
    };
  };
  yearEndDonations?: Array<{
    id: string;
    amountCents: number;
    goodsServicesValueCents: number;
    goodsServicesDescription: string | null;
    date: Date;
    receiptSent: boolean;
    contactId: string;
    contact: {
      firstName: string | null;
      lastName: string | null;
      organizationName: string | null;
      address: string | null;
      email: string | null;
      emailOptOut: boolean;
    };
  }>;
  restrictedFunds?: Array<{ id: string; name: string; type: string }>;
  donationTotal?: number;
  donorAggregate?: { totalDonors: number; newDonorsThisFY: number };
  donorAggregatePredicates?: unknown[];
  grantAggregate?: { count: number; totalAmount: number };
  fundAggregate?: { count: number };
  boardFunds?: Array<{
    id: string;
    name: string;
    type: string;
    grantAllocations: Array<{
      allocatedAmountCents: number;
      deletedAt?: Date | null;
      grant?: { deletedAt?: Date | null } | null;
    }>;
    expenses: Array<{ amountCents: number; deletedAt?: Date | null }>;
  }>;
  boardGrants?: Array<{
    name: string;
    status:
      | "discovery"
      | "application"
      | "submitted"
      | "awarded"
      | "active"
      | "reporting"
      | "closeout"
      | "renewal"
      | "declined";
    applicationDeadline?: Date | string | null;
    reportingRequirements: Array<{
      reportType: string;
      dueDate: Date | string;
      status: "upcoming" | "in_progress" | "submitted" | "overdue";
      deletedAt?: Date | null;
    }>;
  }>;
  donorStats?: {
    totalDonors: number;
    totalGivingThisFY: number;
    previousFiscalYearGivingCents: number;
    newDonorsThisFY: number;
    retentionRate: number;
  };
  insertedActivity: Array<Record<string, unknown>>;
  insertedCommunications?: Array<Record<string, unknown>>;
  updatedDonationReceiptSent?: boolean;
  updatedDonationIds?: string[];
  failGeneratedReportInsert?: boolean;
  failGeneratedReportReadyUpdate?: boolean;
  throwAfterGeneratedReportReadyCommit?: boolean;
  failGeneratedReportFailedUpdate?: boolean;
  failTemplateUpdate?: boolean;
  failTemplateCreate?: boolean;
  failActivityInsert?: boolean;
  failCommunicationInsert?: boolean;
  communicationInsertError?: unknown;
  transactionCount?: number;
  failDonationReceiptUpdate?: boolean;
  throwDonationReceiptUpdate?: boolean;
  loseAcknowledgmentCompensationRace?: boolean;
  failR2Delete?: boolean;
  omitReportCount?: boolean;
  omitDonationTotal?: boolean;
  omitDonorAggregate?: boolean;
  omitGrantAggregate?: boolean;
  omitFundAggregate?: boolean;
  grantFindFirstConfig?: Record<string, unknown>;
  boardFundFindManyConfig?: Record<string, unknown>;
  boardGrantFindManyConfig?: Record<string, unknown>;
};

vi.mock("@cloudflare/puppeteer", () => ({
  default: {
    launch: vi.fn(),
  },
}));

vi.mock("../donors/stats.service", () => ({
  getDonorStats: vi.fn(),
}));

import { getDonorStats } from "../donors/stats.service";

function createFakeDb(state: FakeDbState): Database {
  const query = {
    organizations: {
      findFirst: vi.fn(async () =>
        state.organization
          ? { defaultEntityId: "entity-1", ...state.organization }
          : state.organization,
      ),
    },
    reportTemplates: {
      findFirst: vi.fn(async () =>
        state.templateRow
          ? {
              intro: state.templateRow.intro,
              body: state.templateRow.body,
              closing: state.templateRow.closing,
              id: state.templateRow.id,
            }
          : undefined,
      ),
    },
    generatedReports: {
      findFirst: vi.fn(async () => state.reportRows[0]),
    },
    grants: {
      findFirst: vi.fn(async (config: Record<string, unknown>) => {
        state.grantFindFirstConfig = config;
        return state.grantRecord;
      }),
      findMany: vi.fn(async (config: Record<string, unknown>) => {
        state.boardGrantFindManyConfig = config;
        return state.boardGrants ?? [];
      }),
    },
    funds: {
      findMany: vi.fn(async (config: Record<string, unknown>) => {
        state.boardFundFindManyConfig = config;
        return state.boardFunds ?? [];
      }),
    },
    donations: {
      findFirst: vi.fn(async () => state.donationRecord),
      findMany: vi.fn(async () => state.yearEndDonations ?? []),
    },
  };

  const fakeDb: Database = {
    query,
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      state.transactionCount = (state.transactionCount ?? 0) + 1;
      return cb(fakeDb);
    },
    insert: (table: unknown) => ({
      values: (payload: Record<string, unknown>) => {
        const applyInsert = async (conflictPayload?: Record<string, unknown>) => {
          if (table === generatedReports) {
            if (state.failGeneratedReportInsert) {
              return [];
            }
            const createdAt = new Date("2026-04-07T20:00:00.000Z");
            const row = {
              id: String(payload.id),
              orgId: String(payload.orgId),
              entityId: String(payload.entityId ?? "entity-1"),
              type: String(payload.type),
              attemptId: (payload.attemptId as string | undefined) ?? null,
              recoveryAttemptedAt: (payload.recoveryAttemptedAt as Date | undefined) ?? null,
              readyEffectsStatus: (payload.readyEffectsStatus as string | undefined) ?? null,
              readyEffectsClaimedAt: (payload.readyEffectsClaimedAt as Date | undefined) ?? null,
              readyEffectsAnalyticsDeliveredAt:
                (payload.readyEffectsAnalyticsDeliveredAt as Date | undefined) ?? null,
              readyEffectsTrialTier: (payload.readyEffectsTrialTier as string | undefined) ?? null,
              readyEffectsTrialUsageRecordedAt:
                (payload.readyEffectsTrialUsageRecordedAt as Date | undefined) ?? null,
              readyEffectsAttemptCount:
                (payload.readyEffectsAttemptCount as number | undefined) ?? 0,
              readyEffectsLastAttemptedAt:
                (payload.readyEffectsLastAttemptedAt as Date | undefined) ?? null,
              format: String(payload.format),
              status: String(payload.status),
              title: String(payload.title),
              grantId: (payload.grantId as string | undefined) ?? null,
              fundId: (payload.fundId as string | undefined) ?? null,
              donationId: (payload.donationId as string | undefined) ?? null,
              fiscalYear: (payload.fiscalYear as string | undefined) ?? null,
              fileKey: String(payload.fileKey),
              fileName: String(payload.fileName),
              fileSizeBytes: Number(payload.fileSizeBytes ?? 0),
              metadata: (payload.metadata as Record<string, unknown> | undefined) ?? null,
              generatedBy: String(payload.generatedBy),
              createdAt,
            } satisfies FakeReportRow;
            state.reportRows.unshift(row);
            return [row];
          }

          if (table === reportTemplates) {
            if (state.templateRow && conflictPayload) {
              if (state.failTemplateUpdate) {
                return [];
              }
              state.templateRow = {
                ...state.templateRow,
                intro: String(conflictPayload.intro ?? state.templateRow.intro),
                body: String(conflictPayload.body ?? state.templateRow.body),
                closing: String(conflictPayload.closing ?? state.templateRow.closing),
                updatedBy: String(conflictPayload.updatedBy ?? state.templateRow.updatedBy),
                updatedAt:
                  (conflictPayload.updatedAt as Date | undefined) ?? state.templateRow.updatedAt,
              };
              return [
                {
                  intro: state.templateRow.intro,
                  body: state.templateRow.body,
                  closing: state.templateRow.closing,
                },
              ];
            }
            if (state.failTemplateCreate) {
              return [];
            }
            const now = new Date("2026-04-07T20:00:00.000Z");
            const row = {
              id: "template-1",
              orgId: String(payload.orgId),
              type: String(payload.type),
              intro: String(payload.intro),
              body: String(payload.body),
              closing: String(payload.closing),
              updatedBy: String(payload.updatedBy),
              createdAt: now,
              updatedAt: (payload.updatedAt as Date | undefined) ?? now,
            } satisfies FakeTemplateRow;
            state.templateRow = row;
            return [{ intro: row.intro, body: row.body, closing: row.closing }];
          }

          if (table === activityLog) {
            if (state.failActivityInsert) {
              throw new Error("Failed to create activity log");
            }
            state.insertedActivity.push(payload);
            return [payload];
          }

          if (table === communicationLog) {
            if ("communicationInsertError" in state) {
              throw state.communicationInsertError;
            }
            if (state.failCommunicationInsert) {
              throw new Error("Failed to create communication log");
            }
            state.insertedCommunications ??= [];
            const rows = Array.isArray(payload) ? payload : [payload];
            state.insertedCommunications.push(...rows);
            return rows;
          }

          return [payload];
        };
        const appliedInsert = applyInsert();

        return {
          returning: async () => appliedInsert,
          onConflictDoNothing: async () => appliedInsert,
          onConflictDoUpdate: ({ set }: { set: Record<string, unknown> }) => ({
            returning: async () => applyInsert(set),
          }),
          then: appliedInsert.then.bind(appliedInsert),
          catch: appliedInsert.catch.bind(appliedInsert),
          finally: appliedInsert.finally.bind(appliedInsert),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (payload: Record<string, unknown>) => ({
        where: () => {
          if (table === donations) {
            state.updatedDonationReceiptSent = Boolean(payload.receiptSent);
            state.updatedDonationIds = (state.yearEndDonations ?? []).map((row) => row.id);
          }

          return {
            returning: async () => {
              if (table === reportTemplates && state.templateRow) {
                if (state.failTemplateUpdate) {
                  return [];
                }
                state.templateRow = {
                  ...state.templateRow,
                  intro: String(payload.intro ?? state.templateRow.intro),
                  body: String(payload.body ?? state.templateRow.body),
                  closing: String(payload.closing ?? state.templateRow.closing),
                  updatedBy: String(payload.updatedBy ?? state.templateRow.updatedBy),
                  updatedAt: (payload.updatedAt as Date | undefined) ?? state.templateRow.updatedAt,
                };
                return [
                  {
                    intro: state.templateRow.intro,
                    body: state.templateRow.body,
                    closing: state.templateRow.closing,
                  },
                ];
              }

              if (table === donations) {
                if (state.throwDonationReceiptUpdate) {
                  throw "Postgres receipt update unavailable";
                }
                if (state.failDonationReceiptUpdate) {
                  return [];
                }
                return (state.yearEndDonations ?? [state.donationRecord ?? { id: "donation-1" }])
                  .filter(Boolean)
                  .map((row) => ({ id: row!.id }));
              }

              if (table === generatedReports && state.reportRows[0]) {
                if (payload.status === "ready" && state.failGeneratedReportReadyUpdate) {
                  return [];
                }
                if (payload.status === "failed" && state.failGeneratedReportFailedUpdate) {
                  throw new Error("Failed to update generated report status");
                }
                if (payload.status === "failed") {
                  if (
                    state.reportRows[0].status !== "pending" &&
                    state.reportRows[0].status !== "ready"
                  ) {
                    return [];
                  }
                  if (
                    state.reportRows[0].status === "ready" &&
                    ((payload.metadata as { failureReason?: string } | undefined)?.failureReason !==
                      "Failed to mark donation receipt as sent" ||
                      state.loseAcknowledgmentCompensationRace)
                  ) {
                    return [];
                  }
                }
                state.reportRows[0] = {
                  ...state.reportRows[0],
                  status: String(payload.status ?? state.reportRows[0].status),
                  metadata:
                    (payload.metadata as FakeReportRow["metadata"] | undefined) ??
                    state.reportRows[0].metadata,
                };
                if (payload.status === "ready" && state.throwAfterGeneratedReportReadyCommit) {
                  throw new Error("Postgres response lost after ready commit");
                }
                return [state.reportRows[0]];
              }

              return [];
            },
          };
        },
      }),
    }),
    select: (selection?: Record<string, unknown>) => ({
      from: (table: unknown) => {
        if (table === generatedReports) {
          if (selection && "count" in selection) {
            return {
              where: async () =>
                state.omitReportCount ? [] : [{ count: state.reportRows.length }],
            };
          }

          return {
            where: () => ({
              orderBy: () => ({
                limit: () => ({
                  offset: async () => state.reportRows,
                }),
              }),
            }),
          };
        }

        if (table === donations) {
          if (selection && "totalDonors" in selection) {
            return {
              where: async (predicate: unknown) => {
                state.donorAggregatePredicates?.push(predicate);
                return state.omitDonorAggregate
                  ? []
                  : [
                      {
                        totalDonors: state.donorAggregate?.totalDonors ?? 0,
                      },
                    ];
              },
            };
          }

          if (selection && "newDonorsThisFY" in selection) {
            return {
              where: async (predicate: unknown) => {
                state.donorAggregatePredicates?.push(predicate);
                return state.omitDonorAggregate
                  ? []
                  : [
                      {
                        newDonorsThisFY: state.donorAggregate?.newDonorsThisFY ?? 0,
                      },
                    ];
              },
            };
          }

          // generateAcknowledgmentLetter and generateDonorYearEndStatementRun
          // are converted from the relational query API's `with: { contact }`
          // eager-load to an explicit .innerJoin(contacts, ...) — see the
          // source-contract regression guard below. Both land here (flat
          // contact* selection keys); distinguish by "goodsServicesValueCents"
          // (only present on the year-end, multi-row query).
          if (selection && "contactFirstName" in selection) {
            const isYearEnd = "goodsServicesValueCents" in selection;
            return {
              innerJoin: () => ({
                where: () => {
                  if (isYearEnd) {
                    const flatRows = (state.yearEndDonations ?? []).map((row) => ({
                      id: row.id,
                      amountCents: row.amountCents,
                      goodsServicesValueCents: row.goodsServicesValueCents,
                      goodsServicesDescription: row.goodsServicesDescription,
                      date: row.date,
                      receiptSent: row.receiptSent,
                      contactId: row.contactId,
                      contactFirstName: row.contact.firstName,
                      contactLastName: row.contact.lastName,
                      contactOrganizationName: row.contact.organizationName,
                      contactAddress: row.contact.address,
                      contactEmail: row.contact.email,
                      contactEmailOptOut: row.contact.emailOptOut,
                    }));
                    return { orderBy: async () => flatRows };
                  }
                  const record = state.donationRecord;
                  const flatRow = record
                    ? {
                        id: record.id,
                        amountCents: record.amountCents,
                        date: record.date,
                        receiptSent: record.receiptSent,
                        contactFirstName: record.contact.firstName,
                        contactLastName: record.contact.lastName,
                        contactOrganizationName: record.contact.organizationName,
                        contactAddress: record.contact.address,
                        contactEmail: record.contact.email,
                      }
                    : undefined;
                  return { limit: async () => (flatRow ? [flatRow] : []) };
                },
              }),
            };
          }

          return {
            where: async () =>
              state.omitDonationTotal ? [] : [{ total: state.donationTotal ?? 0 }],
          };
        }

        if (table === grants) {
          return {
            where: async () =>
              state.omitGrantAggregate
                ? []
                : [state.grantAggregate ?? { count: 0, totalAmount: 0 }],
          };
        }

        if (table === funds) {
          if (selection && "count" in selection) {
            return {
              where: async () =>
                state.omitFundAggregate ? [] : [state.fundAggregate ?? { count: 0 }],
            };
          }

          return {
            where: async () => state.restrictedFunds ?? [],
          };
        }

        return {
          where: async () => state.restrictedFunds ?? [],
        };
      },
    }),
  } as unknown as Database;
  return fakeDb;
}

function createEnv() {
  const files = new Map<string, string | ArrayBuffer>();
  const browserPage = {
    setRequestInterception: vi.fn(async (_enabled: boolean) => undefined),
    on: vi.fn(),
    setContent: vi.fn<(html: string, options: Record<string, unknown>) => Promise<undefined>>(
      async () => undefined,
    ),
    pdf: vi.fn(async () => Uint8Array.from([1, 2, 3]).buffer),
  };
  const browser = {
    newPage: vi.fn(async () => browserPage),
    close: vi.fn(async () => undefined),
  };
  vi.mocked(puppeteer.launch).mockResolvedValue(browser as never);

  return {
    APP_URL: "http://localhost:5173",
    files,
    browser,
    browserPage,
    BROWSER_RENDERING: {
      fetch: vi.fn(async () => new Response("ok")),
    },
    R2: {
      put: vi.fn(async (key: string, body: string | ArrayBuffer | Uint8Array) => {
        files.set(
          key,
          typeof body === "string"
            ? body
            : body instanceof ArrayBuffer
              ? body
              : Uint8Array.from(body).buffer,
        );
      }),
      get: vi.fn(async (key: string) => {
        if (!files.has(key)) return null;
        const value = files.get(key);
        return { body: value ?? null };
      }),
      delete: vi.fn(async (key: string) => {
        files.delete(key);
      }),
    },
  };
}

function createReportRow(overrides: Partial<FakeReportRow> = {}): FakeReportRow {
  return {
    id: "report-1",
    orgId: "org-1",
    entityId: "entity-1",
    type: "compliance",
    attemptId: null,
    recoveryAttemptedAt: null,
    readyEffectsStatus: null,
    readyEffectsClaimedAt: null,
    readyEffectsAnalyticsDeliveredAt: null,
    readyEffectsTrialTier: null,
    readyEffectsTrialUsageRecordedAt: null,
    readyEffectsAttemptCount: 0,
    readyEffectsLastAttemptedAt: null,
    format: "pdf",
    status: "ready",
    title: "Q1 Compliance Report",
    grantId: "grant-1",
    fundId: null,
    donationId: null,
    fiscalYear: "FY2026",
    fileKey: "org-1/compliance/report-1/q1-compliance.pdf",
    fileName: "q1-compliance.pdf",
    fileSizeBytes: 1024,
    metadata: {
      preview: {
        kind: "html",
        title: "Q1 Compliance Report",
        content: "<h1>Q1 Compliance Report</h1>",
      },
    },
    generatedBy: "user-1",
    createdAt: new Date("2026-04-07T20:00:00.000Z"),
    ...overrides,
  };
}

function createGrantComplianceReportState(): FakeDbState {
  return {
    organization: {
      id: "org-1",
      name: "GrantPipe Foundation",
      ein: "12-3456789",
      logoUrl: null,
      address: "123 Main St",
      fiscalYearStartMonth: 1,
    },
    reportRows: [],
    insertedActivity: [],
    grantRecord: {
      id: "grant-1",
      name: "STEM Expansion",
      amountCents: 250000,
      status: "active",
      startDate: new Date("2026-01-01T00:00:00Z"),
      endDate: new Date("2026-12-31T00:00:00Z"),
      fundAllocations: [{ allocatedAmountCents: 120000 }],
      expenses: [
        {
          amountCents: 50000,
          date: new Date("2026-03-01T00:00:00Z"),
          description: "Supplies",
        },
      ],
      impactMetrics: [],
      reportingRequirements: [],
      closeoutItems: [],
    },
  };
}

function createYearEndStatementState(overrides: Partial<FakeDbState> = {}): FakeDbState {
  return {
    organization: {
      id: "org-1",
      name: "GrantPipe Foundation",
      ein: "12-3456789",
      logoUrl: null,
      address: "123 Main St",
      fiscalYearStartMonth: 1,
    },
    reportRows: [],
    insertedActivity: [],
    insertedCommunications: [],
    yearEndDonations: [
      {
        id: "donation-1",
        amountCents: 10000,
        goodsServicesValueCents: 0,
        goodsServicesDescription: null,
        date: new Date("2026-06-01T00:00:00.000Z"),
        receiptSent: false,
        contactId: "contact-1",
        contact: {
          firstName: "Jamie",
          lastName: "Rivera",
          organizationName: null,
          address: null,
          email: "jamie@example.com",
          emailOptOut: false,
        },
      },
    ],
    ...overrides,
  };
}

function getStoredPreviewContent(state: FakeDbState, type: FakeReportRow["type"]): string {
  const row = state.reportRows.find((reportRow) => reportRow.type === type);
  return (row?.metadata as { preview?: { content?: string } } | null)?.preview?.content ?? "";
}

function expectProfessionalReportPreview(html: string) {
  expect(html.trimStart().toLowerCase()).toMatch(/^<!doctype html>/);
  expect(html).toContain('class="brand-masthead"');
  expect(html).toContain('class="brand-wordmark">GrantPipe</span>');
  expect(html).toContain('class="brand-kicker">Prepared report</span>');
  expect(html).toContain('class="report-header"');
  expect(html).not.toContain("<article><h1>");
}

describe("generated report queries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(puppeteer.launch).mockReset();
    resetLocalMockIntegrationRecords();
  });

  it("lists generated report artifacts", async () => {
    const db = createFakeDb({
      reportRows: [createReportRow()],
      insertedActivity: [],
    });

    const result = await listGeneratedReportArtifacts(db, {
      orgId: "org-1",
      page: 1,
      pageSize: 25,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(result.total).toBe(1);
    expect(result.data[0]?.downloadPath).toContain("/api/compliance/reports/report-1/download");
  });

  it("applies optional list filters and alternate sort branches", async () => {
    const db = createFakeDb({
      reportRows: [
        createReportRow({
          metadata: null,
          fundId: "fund-1",
          donationId: "donation-1",
        }),
      ],
      insertedActivity: [],
    });

    const result = await listGeneratedReportArtifacts(db, {
      orgId: "org-1",
      page: 2,
      pageSize: 10,
      sortBy: "title",
      sortOrder: "asc",
      type: "acknowledgment",
      status: "failed",
      allowedTypes: ["acknowledgment"],
    });

    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(10);
    expect(result.data[0]?.metadata).toBeUndefined();
    expect(result.data[0]?.fundId).toBe("fund-1");
    expect(result.data[0]?.donationId).toBe("donation-1");
  });

  it("supports sorting by type", async () => {
    const db = createFakeDb({
      reportRows: [createReportRow({ type: "board" })],
      insertedActivity: [],
    });

    const result = await listGeneratedReportArtifacts(db, {
      orgId: "org-1",
      page: 1,
      pageSize: 5,
      sortBy: "type",
      sortOrder: "asc",
    });

    expect(result.data[0]?.type).toBe("board");
  });

  it("supports descending title and type sorts plus ascending created-at sorts", async () => {
    const db = createFakeDb({
      reportRows: [createReportRow()],
      insertedActivity: [],
      omitReportCount: true,
    });

    const byTitle = await listGeneratedReportArtifacts(db, {
      orgId: "org-1",
      page: 1,
      pageSize: 5,
      sortBy: "title",
      sortOrder: "desc",
    });
    const byType = await listGeneratedReportArtifacts(db, {
      orgId: "org-1",
      page: 1,
      pageSize: 5,
      sortBy: "type",
      sortOrder: "desc",
    });
    const byCreatedAt = await listGeneratedReportArtifacts(db, {
      orgId: "org-1",
      page: 1,
      pageSize: 5,
      sortBy: "createdAt",
      sortOrder: "asc",
    });

    expect(byTitle.total).toBe(0);
    expect(byType.data).toHaveLength(1);
    expect(byCreatedAt.data).toHaveLength(1);
  });

  it("returns report detail and preview", async () => {
    const db = createFakeDb({
      reportRows: [createReportRow()],
      insertedActivity: [],
    });

    const artifact = await getGeneratedReportArtifact(db, { orgId: "org-1", reportId: "report-1" });
    const preview = await getGeneratedReportPreview(db, { orgId: "org-1", reportId: "report-1" });

    expect(artifact.internalPath).toBe("/reports/report-1");
    expect(preview.kind).toBe("html");
  });

  it("falls back to the default preview when stored metadata is invalid", async () => {
    const db = createFakeDb({
      reportRows: [
        createReportRow({
          metadata: { preview: { title: 123 } } as unknown as FakeReportRow["metadata"],
        }),
      ],
      insertedActivity: [],
    });

    const preview = await getGeneratedReportPreview(db, { orgId: "org-1", reportId: "report-1" });

    expect(preview.title).toBe("Generated report");
    expect(preview.content).toContain("Preview unavailable");
  });

  it("does not preview generated reports before generation is ready", async () => {
    const db = createFakeDb({
      reportRows: [
        createReportRow({
          status: "failed",
          metadata: {
            preview: {
              kind: "html",
              title: "Failed report",
              content: "<h1>partial content</h1>",
            },
            failureReason: "R2 upload failed",
          },
        }),
      ],
      insertedActivity: [],
    });

    await expect(
      getGeneratedReportPreview(db, { orgId: "org-1", reportId: "report-1" }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Generated report is not ready",
    });
  });

  it("throws when report detail or preview is missing", async () => {
    const db = createFakeDb({
      reportRows: [],
      insertedActivity: [],
    });

    await expect(
      getGeneratedReportArtifact(db, { orgId: "org-1", reportId: "missing" }),
    ).rejects.toThrow("Generated report not found");
    await expect(
      getGeneratedReportPreview(db, { orgId: "org-1", reportId: "missing" }),
    ).rejects.toThrow("Generated report not found");
  });

  it("downloads stored report bytes from R2", async () => {
    const db = createFakeDb({
      reportRows: [createReportRow()],
      insertedActivity: [],
    });
    const env = createEnv();
    await env.R2.put("org-1/compliance/report-1/q1-compliance.pdf", "pdf-bytes");

    const response = await downloadReportArtifact(db, env, {
      orgId: "org-1",
      reportId: "report-1",
    });

    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("does not download report artifacts before generation is ready", async () => {
    const db = createFakeDb({
      reportRows: [createReportRow({ status: "failed" })],
      insertedActivity: [],
    });
    const env = createEnv();
    await env.R2.put("org-1/compliance/report-1/q1-compliance.pdf", "pdf-bytes");

    await expect(
      downloadReportArtifact(db, env, {
        orgId: "org-1",
        reportId: "report-1",
      }),
    ).rejects.toMatchObject({ status: 409 });

    expect(env.R2.get).not.toHaveBeenCalled();
  });

  it("downloads stored report bytes from mock storage in local mode", async () => {
    const db = {
      query: {
        generatedReports: {
          findFirst: vi.fn().mockResolvedValue({
            fileKey: "org-1/compliance/report-1/q1-compliance.pdf",
            fileName: "q1-compliance.pdf",
            format: "pdf",
            status: "ready",
          }),
        },
      },
    };
    await getIntegrations(db as never, { APP_URL: "http://localhost:5173" } as never).storage.put({
      key: "org-1/compliance/report-1/q1-compliance.pdf",
      body: new Uint8Array(Buffer.from("pdf-bytes")),
      contentType: "application/pdf",
      fileName: "q1-compliance.pdf",
      source: { entityType: "compliance", entityId: "report-1", orgId: "org-1" },
    });

    const response = await downloadReportArtifact(
      db as never,
      { APP_URL: "http://localhost:5173" } as never,
      { orgId: "org-1", reportId: "report-1" },
    );

    expect(await response.text()).toBe("pdf-bytes");
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
  });

  it("sanitizes the download filename in content disposition", async () => {
    const db = createFakeDb({
      reportRows: [createReportRow({ fileName: 'bad"report\r\n.pdf' })],
      insertedActivity: [],
    });
    const env = createEnv();
    await env.R2.put("org-1/compliance/report-1/q1-compliance.pdf", "pdf-bytes");

    const response = await downloadReportArtifact(db, env, {
      orgId: "org-1",
      reportId: "report-1",
    });

    expect(response.headers.get("Content-Disposition")).toBe(
      'attachment; filename="bad-report--.pdf"',
    );
  });

  it("uses a generic download filename when the stored name is blank", async () => {
    const db = createFakeDb({
      reportRows: [createReportRow({ fileName: "" })],
      insertedActivity: [],
    });
    const env = createEnv();
    await env.R2.put("org-1/compliance/report-1/q1-compliance.pdf", "pdf-bytes");

    const response = await downloadReportArtifact(db, env, {
      orgId: "org-1",
      reportId: "report-1",
    });

    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="report"');
  });

  it("downloads csv artifacts with the correct content type", async () => {
    const db = createFakeDb({
      reportRows: [
        createReportRow({
          format: "csv_bundle",
          fileKey: "org-1/audit/report-1/audit.csv",
          fileName: "audit.csv",
        }),
      ],
      insertedActivity: [],
    });
    const env = createEnv();
    await env.R2.put("org-1/audit/report-1/audit.csv", "csv-bytes");

    const response = await downloadReportArtifact(db, env, {
      orgId: "org-1",
      reportId: "report-1",
    });

    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
  });

  it("throws for download error branches", async () => {
    const db = createFakeDb({
      reportRows: [createReportRow()],
      insertedActivity: [],
    });

    await expect(
      downloadReportArtifact(
        db,
        { APP_URL: "http://localhost:5173", INTEGRATION_MODE: "real" },
        { orgId: "org-1", reportId: "report-1" },
      ),
    ).rejects.toThrow("R2 binding is required for real storage mode");

    await expect(
      downloadReportArtifact(createFakeDb({ reportRows: [], insertedActivity: [] }), createEnv(), {
        orgId: "org-1",
        reportId: "missing",
      }),
    ).rejects.toThrow("Generated report not found");

    await expect(
      downloadReportArtifact(db, createEnv(), { orgId: "org-1", reportId: "report-1" }),
    ).rejects.toThrow("Generated report file not found");
  });
});

describe("acknowledgment template management", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("falls back to the default template when none is stored", async () => {
    const db = createFakeDb({
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
    });

    const template = await getAcknowledgmentTemplate(db, { orgId: "org-1" });
    expect(template.intro).toContain("GrantPipe Foundation");
  });

  it("creates and updates the stored template", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
    };
    const db = createFakeDb(state);

    const created = await updateAcknowledgmentTemplate(db, {
      orgId: "org-1",
      userId: "user-1",
      data: {
        intro: "Thank you.",
        body: "No goods or services were provided.",
        closing: "With gratitude",
      },
    });
    const updated = await updateAcknowledgmentTemplate(db, {
      orgId: "org-1",
      userId: "user-1",
      data: {
        intro: "Updated intro",
        body: "Updated body",
        closing: "Updated closing",
      },
    });

    expect(created.intro).toBe("Thank you.");
    expect(updated.closing).toBe("Updated closing");
    expect(state.insertedActivity).toHaveLength(2);
    expect(state.insertedActivity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          orgId: "org-1",
          actorId: "user-1",
          action: "updated",
          entityType: "generated_report",
          entityId: "acknowledgment-template",
        }),
      ]),
    );
  });

  it("throws when the organization is missing", async () => {
    const db = createFakeDb({
      reportRows: [],
      insertedActivity: [],
    });

    await expect(getAcknowledgmentTemplate(db, { orgId: "org-1" })).rejects.toThrow(
      "Organization not found",
    );
  });

  it("throws when template persistence fails", async () => {
    const updateState: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      failTemplateUpdate: true,
      templateRow: {
        id: "template-1",
        orgId: "org-1",
        type: "acknowledgment",
        intro: "Intro",
        body: "Body",
        closing: "Closing",
        updatedBy: "user-1",
        createdAt: new Date("2026-04-07T20:00:00.000Z"),
        updatedAt: new Date("2026-04-07T20:00:00.000Z"),
      },
    };

    await expect(
      updateAcknowledgmentTemplate(createFakeDb(updateState), {
        orgId: "org-1",
        userId: "user-1",
        data: { intro: "Updated intro", body: "Updated body", closing: "Updated closing" },
      }),
    ).rejects.toThrow("Failed to save acknowledgment template");

    const createState: FakeDbState = {
      organization: updateState.organization,
      reportRows: [],
      insertedActivity: [],
      failTemplateCreate: true,
    };

    await expect(
      updateAcknowledgmentTemplate(createFakeDb(createState), {
        orgId: "org-1",
        userId: "user-1",
        data: { intro: "Intro", body: "Body", closing: "Closing" },
      }),
    ).rejects.toThrow("Failed to save acknowledgment template");
  });
});

describe("report generation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 42,
      totalGivingThisFY: 123400,
      previousFiscalYearGivingCents: 111100,
      newDonorsThisFY: 8,
      retentionRate: 0.62,
    });
    vi.mocked(puppeteer.launch).mockReset();
  });

  it("generates a grant compliance report and stores an artifact", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "STEM Expansion",
        amountCents: 250000,
        status: "active",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        fundAllocations: [{ allocatedAmountCents: 120000 }],
        expenses: [
          { amountCents: 50000, date: new Date("2026-03-01T00:00:00Z"), description: "Supplies" },
        ],
        impactMetrics: [
          {
            id: "metric-1",
            name: "Students Served",
            targetValue: "120",
            unit: "students",
            entries: [
              {
                id: "entry-1",
                value: "48",
                periodEnd: new Date("2026-03-31T00:00:00Z"),
                createdAt: new Date("2026-04-01T00:00:00Z"),
              },
            ],
          },
        ],
        reportingRequirements: [
          {
            reportType: "quarterly",
            dueDate: new Date("2026-10-01T00:00:00Z"),
            status: "upcoming",
          },
        ],
        closeoutItems: [],
      },
    };
    const db = createFakeDb(state);
    const env = createEnv();

    const artifact = await generateGrantComplianceReport(db, env, {
      orgId: "org-1",
      entityId: "entity-2",
      userId: "user-1",
      grantId: "grant-1",
      data: { title: "Q1 STEM Compliance Report" },
    });

    expect(artifact.type).toBe("compliance");
    expect(state.reportRows).toHaveLength(1);
    expect(state.reportRows[0]?.entityId).toBe("entity-2");
    expect(mockDeliverReportReadyEffects).toHaveBeenCalledOnce();
    expect(env.R2.put).toHaveBeenCalledTimes(1);
    expect(puppeteer.launch).toHaveBeenCalledWith(env.BROWSER_RENDERING);
    expect(env.browserPage.setContent).toHaveBeenCalledWith(
      expect.stringContaining("Q1 STEM Compliance Report</h1>"),
      expect.any(Object),
    );
    const htmlArg = vi.mocked(env.browserPage.setContent).mock.calls[0]![0];
    expect(htmlArg).toContain("Grant Summary");
    expect(htmlArg).toContain("STEM Expansion");
    expect(htmlArg).toContain("GrantPipe Foundation");
  });

  it("aborts external browser-rendering requests before rendering the PDF", async () => {
    const state = createGrantComplianceReportState();
    const db = createFakeDb(state);
    const env = createEnv();

    await generateGrantComplianceReport(db, env, {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: { title: "Q1 STEM Compliance Report" },
    });

    expect(env.browserPage.setRequestInterception).toHaveBeenCalledWith(true);
    expect(env.browserPage.on).toHaveBeenCalledWith("request", expect.any(Function));

    const requestHandler = vi
      .mocked(env.browserPage.on)
      .mock.calls.find(([eventName]) => eventName === "request")?.[1] as
      | ((request: { url: () => string; abort: () => void; continue: () => void }) => void)
      | undefined;
    expect(requestHandler).toBeDefined();

    const externalRequest = {
      url: () => "https://169.254.169.254/latest/meta-data",
      abort: vi.fn(),
      continue: vi.fn(),
    };
    requestHandler?.(externalRequest);

    expect(externalRequest.abort).toHaveBeenCalledOnce();
    expect(externalRequest.continue).not.toHaveBeenCalled();

    const dataRequest = {
      url: () => "data:image/png;base64,abc123",
      abort: vi.fn(),
      continue: vi.fn(),
    };
    requestHandler?.(dataRequest);

    expect(dataRequest.continue).toHaveBeenCalledOnce();
    expect(dataRequest.abort).not.toHaveBeenCalled();
  });

  it("fails closed when browser request interception is unavailable", async () => {
    const state = createGrantComplianceReportState();
    const db = createFakeDb(state);
    const env = createEnv();
    const unsafePage = {
      setContent: vi.fn(async () => undefined),
      pdf: vi.fn(async () => Uint8Array.from([1, 2, 3]).buffer),
    };
    vi.mocked(env.browser.newPage).mockResolvedValueOnce(unsafePage as never);

    await expect(
      generateGrantComplianceReport(db, env, {
        orgId: "org-1",
        userId: "user-1",
        grantId: "grant-1",
        data: { title: "Q1 STEM Compliance Report" },
      }),
    ).rejects.toThrow("Browser Rendering request interception is unavailable");

    expect(unsafePage.setContent).not.toHaveBeenCalled();
    expect(env.R2.put).not.toHaveBeenCalled();
  });

  it("retries a transient Browser Rendering launch timeout and stores the report", async () => {
    const state = createGrantComplianceReportState();
    const db = createFakeDb(state);
    const env = createEnv();
    const transientError = new Error(
      "Unable to connect to existing session: Browser.getVersion timed out",
    );
    vi.mocked(puppeteer.launch)
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce(env.browser as never);

    const artifact = await generateGrantComplianceReport(db, env, {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: { title: "Q1 STEM Compliance Report" },
    });

    expect(artifact.status).toBe("ready");
    expect(puppeteer.launch).toHaveBeenCalledTimes(2);
    expect(env.browser.close).toHaveBeenCalledTimes(1);
    expect(env.R2.put).toHaveBeenCalledTimes(1);
  });

  it("stores browser-rendered PDF bytes returned as a Uint8Array", async () => {
    const state = createGrantComplianceReportState();
    const db = createFakeDb(state);
    const env = createEnv();
    env.browserPage.pdf.mockResolvedValueOnce(Uint8Array.from([9, 8, 7]) as never);

    await generateGrantComplianceReport(db, env, {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: { title: "Q1 STEM Compliance Report" },
    });

    const stored = Array.from(env.files.values())[0];
    expect(stored).toBeInstanceOf(ArrayBuffer);
    expect(Array.from(new Uint8Array(stored as ArrayBuffer))).toEqual([9, 8, 7]);
  });

  it("retries transient Browser Rendering launch messages thrown as non-Error values", async () => {
    const env = createEnv();
    vi.mocked(puppeteer.launch)
      .mockRejectedValueOnce("Browser.getVersion timed out")
      .mockResolvedValueOnce(env.browser as never);

    const artifact = await generateGrantComplianceReport(
      createFakeDb(createGrantComplianceReportState()),
      env,
      {
        orgId: "org-1",
        userId: "user-1",
        grantId: "grant-1",
        data: { title: "Q1 STEM Compliance Report" },
      },
    );

    expect(artifact.status).toBe("ready");
    expect(puppeteer.launch).toHaveBeenCalledTimes(2);
  });

  it("does not retry non-transient Browser Rendering launch failures", async () => {
    const env = createEnv();
    const fatalError = new Error("Browser Rendering quota exceeded");
    vi.mocked(puppeteer.launch).mockRejectedValueOnce(fatalError);

    await expect(
      generateGrantComplianceReport(createFakeDb(createGrantComplianceReportState()), env, {
        orgId: "org-1",
        userId: "user-1",
        grantId: "grant-1",
        data: { title: "Q1 STEM Compliance Report" },
      }),
    ).rejects.toThrow("Browser Rendering quota exceeded");

    expect(puppeteer.launch).toHaveBeenCalledTimes(1);
    expect(env.R2.put).not.toHaveBeenCalled();
  });

  it("surfaces repeated transient Browser Rendering launch failures", async () => {
    const env = createEnv();
    const transientError = new Error("Browser.getVersion timed out");
    vi.mocked(puppeteer.launch)
      .mockRejectedValueOnce(transientError)
      .mockRejectedValueOnce(transientError);

    await expect(
      generateGrantComplianceReport(createFakeDb(createGrantComplianceReportState()), env, {
        orgId: "org-1",
        userId: "user-1",
        grantId: "grant-1",
        data: { title: "Q1 STEM Compliance Report" },
      }),
    ).rejects.toThrow("Browser.getVersion timed out");

    expect(puppeteer.launch).toHaveBeenCalledTimes(2);
    expect(env.R2.put).not.toHaveBeenCalled();
  });

  it("ignores soft-deleted expenses in the grant compliance preview", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "STEM Expansion",
        amountCents: 250000,
        status: "active",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        fundAllocations: [{ allocatedAmountCents: 120000 }],
        expenses: [
          { amountCents: 50000, date: new Date("2026-03-01T00:00:00Z"), description: "Supplies" },
          {
            amountCents: 100000,
            date: new Date("2026-03-15T00:00:00Z"),
            description: "Deleted expense",
            deletedAt: new Date("2026-03-15T00:00:00Z"),
          },
        ],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
    };
    const db = createFakeDb(state);
    const env = createEnv();

    const artifact = await generateGrantComplianceReport(db, env, {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: { title: "Q1 STEM Compliance Report" },
    });

    const metadata = JSON.stringify(artifact.metadata);
    expect(metadata).toContain("$500.00");
    expect(metadata).toContain("Remaining Balance");
    expect(metadata).toContain("$2,000.00");
    expect(metadata).toContain("Unallocated Balance");
    expect(metadata).toContain("$1,300.00");
  });

  it("excludes fund allocations whose fund is soft-deleted from compliance report financial summary", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "STEM Expansion",
        // Use $3,000 so that active allocation ($1,000) and remaining ($2,000)
        // don't coincide with the combined allocation total ($1,000 + $500 = $1,500)
        amountCents: 300000,
        status: "active",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        fundAllocations: [
          { allocatedAmountCents: 100000, fund: { deletedAt: null } },
          {
            allocatedAmountCents: 50000,
            fund: { deletedAt: new Date("2026-03-01T00:00:00Z") },
          },
        ],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
    };

    const artifact = await generateGrantComplianceReport(createFakeDb(state), createEnv(), {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: { title: "STEM Compliance Report" },
    });

    // Only the active-fund allocation ($1,000.00) should appear, not the soft-deleted-fund one ($500.00)
    // With grant amount $3,000, remaining = $3,000 - $1,000 = $2,000 (not $1,500)
    expect(JSON.stringify(artifact.metadata)).toContain("$1,000.00");
    expect(JSON.stringify(artifact.metadata)).not.toContain("$500.00");
  });

  it("excludes allocations whose fund is soft-deleted from compliance report financial summary", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "STEM Expansion",
        amountCents: 250000,
        status: "active",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        fundAllocations: [
          {
            allocatedAmountCents: 75000,
            fund: { deletedAt: new Date("2026-02-01T00:00:00Z") },
          },
        ],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
    };

    const artifact = await generateGrantComplianceReport(createFakeDb(state), createEnv(), {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: { title: "STEM Compliance Report" },
    });

    // The allocation whose fund is deleted ($750.00) should be excluded — result is $0.00
    expect(JSON.stringify(artifact.metadata)).not.toContain("$750.00");
    expect(JSON.stringify(artifact.metadata)).toContain("$0.00");
  });

  it("excludes soft-deleted allocations from compliance report financial summary even when the fund is live", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "STEM Expansion",
        amountCents: 300000,
        status: "active",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        fundAllocations: [
          {
            allocatedAmountCents: 100000,
            deletedAt: new Date("2026-03-01T00:00:00Z"),
            fund: { deletedAt: null },
          },
        ],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
    };

    const artifact = await generateGrantComplianceReport(createFakeDb(state), createEnv(), {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: { title: "STEM Compliance Report" },
    });

    expect(JSON.stringify(artifact.metadata)).not.toContain("$1,000.00");
    expect(JSON.stringify(artifact.metadata)).toContain("$0.00");
  });

  it("uses grant defaults when optional values are missing", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "General Support",
        amountCents: null,
        status: "active",
        startDate: "2026-01-01T00:00:00.000Z" as unknown as Date,
        endDate: "2026-12-31T00:00:00.000Z" as unknown as Date,
        fundAllocations: [],
        expenses: [],
        impactMetrics: [
          {
            id: "metric-1",
            name: "Households Served",
            targetValue: null,
            unit: null,
            entries: [],
          },
        ],
        reportingRequirements: [],
        closeoutItems: [],
      },
    };

    const artifact = await generateGrantComplianceReport(createFakeDb(state), createEnv(), {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: {},
    });

    expect(artifact.title).toBe("General Support Compliance Report");
    const metadata = JSON.stringify(state.reportRows[0]?.metadata);
    expect(metadata).toContain("No items recorded.");
    // Award row (Grant Summary keyValue section) should show -- for null amountCents
    expect(metadata).toContain("kv-value");
    // The award value in the kv-value cell should be -- not $0.00
    const preview = (state.reportRows[0]?.metadata as { preview?: { content?: string } })?.preview
      ?.content;
    expect(preview).toContain('kv-value">--<');
    expect(preview).not.toContain('kv-value">$0.00<');
  });

  it("renders a clean grant window fallback when the grant dates are missing", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "General Support",
        amountCents: 150000,
        status: "active",
        startDate: null,
        endDate: null,
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
    };

    await generateGrantComplianceReport(createFakeDb(state), createEnv(), {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: {},
    });

    const metadata = JSON.stringify(state.reportRows[0]?.metadata);
    expect(metadata).toContain("--");
    expect(metadata).not.toContain("â€” - â€”");
  });

  it("generates audit, board, and IRS 990 artifacts", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      restrictedFunds: [{ id: "fund-1", name: "Youth Programs", type: "temporarily_restricted" }],
      donationTotal: 456700,
      grantAggregate: { count: 3, totalAmount: 890000 },
      fundAggregate: { count: 2 },
      boardFunds: [
        {
          id: "fund-1",
          name: "Youth Programs",
          type: "temporarily_restricted",
          grantAllocations: [{ allocatedAmountCents: 600000 }],
          expenses: [{ amountCents: 125000 }],
        },
      ],
      boardGrants: [
        {
          name: "Community STEM",
          status: "active",
          applicationDeadline: new Date("2026-05-01T00:00:00Z"),
          reportingRequirements: [
            {
              reportType: "Quarterly narrative",
              dueDate: new Date("2026-04-30T00:00:00Z"),
              status: "upcoming",
            },
          ],
        },
      ],
    };
    const db = createFakeDb(state);
    const env = createEnv();

    const audit = await generateAuditReport(db, env, {
      orgId: "org-1",
      entityId: "entity-2",
      userId: "user-1",
      fiscalYear: "FY2026",
      data: { title: "FY2026 Audit Export" },
    });
    const board = await generateBoardReport(db, env, {
      orgId: "org-1",
      entityId: "entity-2",
      userId: "user-1",
      data: { fiscalYear: "FY2026", title: "FY2026 Board Packet" },
    });
    const irs990 = await generateIrs990Report(db, env, {
      orgId: "org-1",
      entityId: "entity-2",
      userId: "user-1",
      data: { fiscalYear: "FY2026", title: "FY2026 IRS 990 Prep Export" },
    });

    expect(audit.format).toBe("csv_bundle");
    expect(board.type).toBe("board");
    expect(irs990.fiscalYear).toBe("FY2026");
    expect(state.reportRows).toHaveLength(3);
    expect(state.reportRows.every((report) => report.entityId === "entity-2")).toBe(true);
    expect(getDonorStats).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", entityId: "entity-2" }),
    );

    const auditPreview = getStoredPreviewContent(state, "audit");
    const boardPreview = getStoredPreviewContent(state, "board");
    const irsPreview = getStoredPreviewContent(state, "irs_990");

    expectProfessionalReportPreview(auditPreview);
    expect(auditPreview).toContain("Restricted Funds");
    expect(auditPreview).toContain("Included Files");

    expectProfessionalReportPreview(boardPreview);
    expect(boardPreview).toContain("Fundraising");
    expect(boardPreview).toContain("Grant Pipeline");
    expect(boardPreview).toContain("Fund Balances");
    expect(boardPreview).toContain("Youth Programs");
    expect(boardPreview).toContain("$4,750.00");
    expect(boardPreview).toContain("Compliance Deadlines");
    expect(boardPreview).toContain("Community STEM: Quarterly narrative due");

    expectProfessionalReportPreview(irsPreview);
    expect(irsPreview).toContain("IRS 990 Preparation Export");
    expect(irsPreview).toContain("Export Contents");
    expect(irsPreview).toContain("not an official IRS filing");
  });

  it("scopes every entity-bearing nested report row to the active entity", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "Active grant",
        amountCents: 100,
        status: "active",
        startDate: null,
        endDate: null,
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
      boardFunds: [],
      boardGrants: [],
    };
    const db = createFakeDb(state);
    const env = createEnv();

    await generateGrantComplianceReport(db, env, {
      orgId: "org-1",
      entityId: "entity-active",
      userId: "user-1",
      grantId: "grant-1",
      data: {},
    });
    await generateBoardReport(db, env, {
      orgId: "org-1",
      entityId: "entity-active",
      userId: "user-1",
      data: {
        fiscalYear: "FY2026",
        sections: ["fund_balances", "compliance_deadlines"],
      },
    });

    const grantWith = state.grantFindFirstConfig?.with as Record<string, unknown>;
    for (const relation of [
      "fundAllocations",
      "expenses",
      "impactMetrics",
      "reportingRequirements",
      "closeoutItems",
    ]) {
      expect(
        queryContainsValue(
          (grantWith[relation] as { where?: unknown } | undefined)?.where,
          "entity-active",
        ),
      ).toBe(true);
    }
    expect(
      queryContainsValue(
        (grantWith.impactMetrics as { with?: { entries?: { where?: unknown } } }).with?.entries
          ?.where,
        "entity-active",
      ),
    ).toBe(true);

    const fundWith = state.boardFundFindManyConfig?.with as Record<string, unknown>;
    expect(
      queryContainsValue(
        (fundWith.grantAllocations as { where?: unknown } | undefined)?.where,
        "entity-active",
      ),
    ).toBe(true);
    expect(
      queryContainsValue(
        (fundWith.expenses as { where?: unknown } | undefined)?.where,
        "entity-active",
      ),
    ).toBe(true);

    const boardGrantWith = state.boardGrantFindManyConfig?.with as Record<string, unknown>;
    expect(
      queryContainsValue(
        (boardGrantWith.reportingRequirements as { where?: unknown } | undefined)?.where,
        "entity-active",
      ),
    ).toBe(true);
  });

  it("composes board packets with selected sections and schedule metadata", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      donorStats: {
        totalDonors: 42,
        totalGivingThisFY: 456700,
        previousFiscalYearGivingCents: 390000,
        newDonorsThisFY: 8,
        retentionRate: 0.67,
      },
      grantAggregate: { count: 3, totalAmount: 890000 },
      fundAggregate: { count: 2 },
      boardFunds: [
        {
          id: "fund-1",
          name: "Youth Programs",
          type: "temporarily_restricted",
          grantAllocations: [{ allocatedAmountCents: 600000 }],
          expenses: [{ amountCents: 125000 }],
        },
      ],
      boardGrants: [
        {
          name: "Community STEM",
          status: "active",
          applicationDeadline: new Date("2026-05-01T00:00:00Z"),
          reportingRequirements: [
            {
              reportType: "Quarterly narrative",
              dueDate: new Date("2026-04-30T00:00:00Z"),
              status: "upcoming",
            },
          ],
        },
      ],
    };
    const db = createFakeDb(state);
    const env = createEnv();

    await generateBoardReport(db, env, {
      orgId: "org-1",
      userId: "user-1",
      data: {
        fiscalYear: "FY2026",
        title: "April board packet",
        meetingDate: "2026-04-20",
        cadence: "monthly",
        sections: ["executive_snapshot", "fundraising", "grant_pipeline", "fund_balances"],
      },
    });

    expect(getDonorStats).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ entityId: "entity-1" }),
    );

    const preview = getStoredPreviewContent(state, "board");
    const metadata = JSON.stringify(state.reportRows[0]?.metadata);

    expect(preview).toContain("Executive Snapshot");
    expect(preview).toContain("Fundraising");
    expect(preview).toContain("Grant Pipeline");
    expect(preview).toContain("Fund Balances");
    expect(preview).toContain("Youth Programs");
    expect(preview).toContain("$4,750.00");
    expect(preview).not.toContain("Compliance Deadlines");
    expect(preview).not.toContain("Quarterly narrative");
    expect(metadata).toContain('"cadence":"monthly"');
    expect(metadata).toContain('"meetingDate":"2026-04-20"');
    expect(metadata).toContain(
      '"sections":["executive_snapshot","fundraising","grant_pipeline","fund_balances"]',
    );
  });

  it("filters stale board packet fund and deadline rows", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      donorStats: {
        totalDonors: 42,
        totalGivingThisFY: 456700,
        previousFiscalYearGivingCents: 390000,
        newDonorsThisFY: 8,
        retentionRate: 0.67,
      },
      grantAggregate: { count: 3, totalAmount: 890000 },
      fundAggregate: { count: 2 },
      boardFunds: [
        {
          id: "fund-1",
          name: "Youth Programs",
          type: "temporarily_restricted",
          grantAllocations: [
            { allocatedAmountCents: 600000 },
            { allocatedAmountCents: 50000, deletedAt: new Date("2026-04-01T00:00:00Z") },
            {
              allocatedAmountCents: 75000,
              grant: { deletedAt: new Date("2026-04-02T00:00:00Z") },
            },
          ],
          expenses: [
            { amountCents: 125000 },
            { amountCents: 25000, deletedAt: new Date("2026-04-03T00:00:00Z") },
          ],
        },
        {
          id: "fund-2",
          name: "Unlinked Reserve",
          type: "board_designated",
          grantAllocations: [],
          expenses: [],
        },
        {
          id: "fund-3",
          name: "Missing Activity Arrays",
          type: "temporarily_restricted",
        } as NonNullable<FakeDbState["boardFunds"]>[number],
      ],
      boardGrants: [
        {
          name: "Community STEM",
          status: "application",
          applicationDeadline: "2026-05-01",
          reportingRequirements: [
            {
              reportType: "Quarterly narrative",
              dueDate: "2026-04-30",
              status: "upcoming",
            },
            {
              reportType: "Submitted final",
              dueDate: "2026-04-15",
              status: "submitted",
            },
            {
              reportType: "Deleted interim",
              dueDate: "2026-04-16",
              status: "upcoming",
              deletedAt: new Date("2026-04-01T00:00:00Z"),
            },
          ],
        },
        {
          name: "No schedule grant",
          status: "active",
          reportingRequirements: undefined,
        } as unknown as NonNullable<FakeDbState["boardGrants"]>[number],
      ],
    };
    const db = createFakeDb(state);
    const env = createEnv();

    await generateBoardReport(db, env, {
      orgId: "org-1",
      entityId: "entity-1",
      userId: "user-1",
      data: {
        fiscalYear: "FY2026",
        meetingDate: "2026-04-20",
        cadence: "quarterly",
      },
    });

    const preview = getStoredPreviewContent(state, "board");
    const metadata = JSON.stringify(state.reportRows[0]?.metadata);

    expect(preview).toContain("Quarterly");
    expect(preview).toContain("Youth Programs");
    expect(preview).toContain("$6,000.00");
    expect(preview).toContain("$1,250.00");
    expect(preview).toContain("$4,750.00");
    expect(preview).toContain("Unlinked Reserve");
    expect(preview).toContain("board designated");
    expect(preview).toContain("Missing Activity Arrays");
    expect(preview).toContain("Community STEM: Quarterly narrative due");
    expect(preview).toContain("Community STEM: application due");
    expect(preview).not.toContain("Submitted final");
    expect(preview).not.toContain("Deleted interim");
    expect(metadata).toContain('"cadence":"quarterly"');
    expect(metadata).toContain('"meetingDate":"2026-04-20"');
  });

  it("sorts board packet deadlines before applying the display limit", async () => {
    const laterGrants = Array.from({ length: 10 }, (_, index) => ({
      name: `Later Grant ${index + 1}`,
      status: "active" as const,
      applicationDeadline: null,
      reportingRequirements: [
        {
          reportType: "Later report",
          dueDate: new Date(`2026-08-${String(index + 1).padStart(2, "0")}T00:00:00Z`),
          status: "upcoming" as const,
        },
      ],
    }));
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantAggregate: { count: 12, totalAmount: 890000 },
      fundAggregate: { count: 0 },
      boardFunds: [],
      boardGrants: [
        ...laterGrants,
        {
          name: "Urgent Grant",
          status: "active",
          applicationDeadline: null,
          reportingRequirements: [
            {
              reportType: "Urgent report",
              dueDate: new Date("2026-04-15T00:00:00Z"),
              status: "upcoming",
            },
          ],
        },
        {
          name: "Stale Application",
          status: "awarded",
          applicationDeadline: new Date("2026-04-01T00:00:00Z"),
          reportingRequirements: [],
        },
        {
          name: "Future Pipeline",
          status: "application",
          applicationDeadline: new Date("2026-04-25T00:00:00Z"),
          reportingRequirements: [],
        },
      ],
    };
    const db = createFakeDb(state);
    const env = createEnv();

    await generateBoardReport(db, env, {
      orgId: "org-1",
      entityId: "entity-1",
      userId: "user-1",
      data: {
        fiscalYear: "FY2026",
        meetingDate: "2026-04-20",
        sections: ["compliance_deadlines"],
      },
    });

    const preview = getStoredPreviewContent(state, "board");

    expect(preview).toContain("Urgent Grant: Urgent report due");
    expect(preview).toContain("Future Pipeline: application due");
    expect(preview).not.toContain("Later Grant 5");
    expect(preview).not.toContain("Stale Application: application due");
  });

  it("preserves cents in grant compliance previews", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "STEM Expansion",
        amountCents: 12345,
        status: "active",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        fundAllocations: [],
        expenses: [
          {
            amountCents: 678,
            date: new Date("2026-04-01T00:00:00Z"),
            description: "Supplies",
          },
        ],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
    };

    const artifact = await generateGrantComplianceReport(createFakeDb(state), createEnv(), {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: {},
    });

    expect(artifact.title).toBe("STEM Expansion Compliance Report");
    expect(JSON.stringify(state.reportRows[0]?.metadata)).toContain("$123.45");
    expect(JSON.stringify(state.reportRows[0]?.metadata)).toContain("$6.78");
  });

  it("includes expenditure detail table in compliance report", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "Arts Initiative",
        amountCents: 500000,
        status: "active",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        fundAllocations: [],
        expenses: [
          {
            amountCents: 10000,
            date: new Date("2026-02-01T00:00:00Z"),
            description: "Paint supplies",
          },
          {
            amountCents: 20000,
            date: new Date("2026-03-01T00:00:00Z"),
            description: "Canvas materials",
          },
        ],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
    };

    await generateGrantComplianceReport(createFakeDb(state), createEnv(), {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: {},
    });

    const metadata = JSON.stringify(state.reportRows[0]?.metadata);
    expect(metadata).toContain("Expenditure Detail");
    expect(metadata).toContain("Paint supplies");
    expect(metadata).toContain("Canvas materials");
    expect(metadata).toContain("$100.00");
    expect(metadata).toContain("$200.00");
  });

  it("renders empty state for expenditure detail when no expenses", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "Empty Grant",
        amountCents: 100000,
        status: "active",
        startDate: null,
        endDate: null,
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
    };

    await generateGrantComplianceReport(createFakeDb(state), createEnv(), {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: {},
    });

    const metadata = JSON.stringify(state.reportRows[0]?.metadata);
    expect(metadata).toContain("No expenditures recorded for this period.");
  });

  it("renders closeout checklist items", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "Closeout Test Grant",
        amountCents: 100000,
        status: "active",
        startDate: null,
        endDate: null,
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [
          { label: "Final report submitted", completed: true },
          { label: "Equipment returned", completed: false },
        ],
      },
    };

    await generateGrantComplianceReport(createFakeDb(state), createEnv(), {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: {},
    });

    const metadata = JSON.stringify(state.reportRows[0]?.metadata);
    expect(metadata).toContain("☑");
    expect(metadata).toContain("☐");
    expect(metadata).toContain("Final report submitted");
    expect(metadata).toContain("Equipment returned");
  });

  it("includes impact metrics table in compliance report", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "Youth Program",
        amountCents: 200000,
        status: "active",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        fundAllocations: [],
        expenses: [],
        impactMetrics: [
          {
            id: "metric-1",
            name: "Youth Served",
            targetValue: "200",
            unit: "participants",
            entries: [
              {
                id: "entry-1",
                value: "85",
                periodEnd: new Date("2026-03-31T00:00:00Z"),
                createdAt: new Date("2026-04-01T00:00:00Z"),
              },
            ],
          },
        ],
        reportingRequirements: [],
        closeoutItems: [],
      },
    };

    await generateGrantComplianceReport(createFakeDb(state), createEnv(), {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: {},
    });

    const metadata = JSON.stringify(state.reportRows[0]?.metadata);
    expect(metadata).toContain("Impact Metrics");
    expect(metadata).toContain("Youth Served");
  });

  it("excludes deleted impact metrics and uses latest live entry by period end", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "Youth Program",
        amountCents: 200000,
        status: "active",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        fundAllocations: [],
        expenses: [],
        impactMetrics: [
          {
            id: "metric-1",
            name: "Youth Served",
            targetValue: "200",
            unit: "participants",
            deletedAt: null,
            entries: [
              {
                id: "entry-deleted",
                value: "999",
                periodEnd: new Date("2026-07-31T00:00:00Z"),
                createdAt: new Date("2026-08-01T00:00:00Z"),
                deletedAt: new Date("2026-08-01T00:00:00Z"),
              },
              {
                id: "entry-newer",
                value: "120",
                periodEnd: new Date("2026-06-30T00:00:00Z"),
                createdAt: new Date("2026-07-02T00:00:00Z"),
              },
              {
                id: "entry-older",
                value: "85",
                periodEnd: new Date("2026-06-30T00:00:00Z"),
                createdAt: new Date("2026-07-01T00:00:00Z"),
              },
            ],
          },
          {
            id: "metric-deleted",
            name: "Deleted Metric",
            targetValue: "999",
            unit: "widgets",
            deletedAt: new Date("2026-04-01T00:00:00Z"),
            entries: [
              {
                id: "entry-deleted-metric",
                value: "999",
                periodEnd: new Date("2026-06-30T00:00:00Z"),
                createdAt: new Date("2026-07-01T00:00:00Z"),
              },
            ],
          },
          {
            id: "metric-id-tie",
            name: "Households Served",
            targetValue: "30",
            unit: "households",
            deletedAt: null,
            entries: [
              {
                id: "entry-a",
                value: "10",
                periodEnd: new Date("2026-06-30T00:00:00Z"),
                createdAt: new Date("2026-07-01T00:00:00Z"),
              },
              {
                id: "entry-b",
                value: "20",
                periodEnd: new Date("2026-06-30T00:00:00Z"),
                createdAt: new Date("2026-07-01T00:00:00Z"),
              },
            ],
          },
        ],
        reportingRequirements: [],
        closeoutItems: [],
      },
    };

    await generateGrantComplianceReport(createFakeDb(state), createEnv(), {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: {},
    });

    const preview = getStoredPreviewContent(state, "compliance");
    expect(preview).toContain("Youth Served");
    expect(preview).toContain(">120<");
    expect(preview).toContain("Households Served");
    expect(preview).toContain(">20<");
    expect(preview).not.toContain(">10<");
    expect(preview).not.toContain(">85<");
    expect(preview).not.toContain(">999<");
    expect(preview).not.toContain("Deleted Metric");
  });

  it("renders empty state for impact metrics when none exist", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "No Metrics Grant",
        amountCents: 100000,
        status: "active",
        startDate: null,
        endDate: null,
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
    };

    await generateGrantComplianceReport(createFakeDb(state), createEnv(), {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: {},
    });

    const metadata = JSON.stringify(state.reportRows[0]?.metadata);
    expect(metadata).toContain("No impact metrics recorded for this period.");
  });

  it("renders reporting requirements checklist with submitted items checked", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "Requirements Test Grant",
        amountCents: 100000,
        status: "active",
        startDate: null,
        endDate: null,
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [
          {
            reportType: "quarterly",
            dueDate: new Date("2026-04-01T00:00:00Z"),
            status: "submitted",
          },
          { reportType: "annual", dueDate: new Date("2027-01-01T00:00:00Z"), status: "upcoming" },
        ],
        closeoutItems: [],
      },
    };

    await generateGrantComplianceReport(createFakeDb(state), createEnv(), {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: {},
    });

    const metadata = JSON.stringify(state.reportRows[0]?.metadata);
    expect(metadata).toContain("☑");
    expect(metadata).toContain("☐");
    expect(metadata).toContain("quarterly");
    expect(metadata).toContain("annual");
  });

  it("excludes soft-deleted reporting requirements and closeout items from grant compliance reports", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "Requirements Test Grant",
        amountCents: 100000,
        status: "active",
        startDate: null,
        endDate: null,
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [
          {
            reportType: "quarterly",
            dueDate: new Date("2026-04-01T00:00:00Z"),
            status: "submitted",
            deletedAt: null,
          },
          {
            reportType: "annual",
            dueDate: new Date("2027-01-01T00:00:00Z"),
            status: "upcoming",
            deletedAt: new Date("2026-04-02T00:00:00Z"),
          },
        ],
        closeoutItems: [
          { label: "Archive records", completed: false, deletedAt: null },
          { label: "Deleted item", completed: false, deletedAt: new Date("2026-04-02T00:00:00Z") },
        ],
      },
    };

    await generateGrantComplianceReport(createFakeDb(state), createEnv(), {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: {},
    });

    const metadata = JSON.stringify(state.reportRows[0]?.metadata);
    expect(metadata).toContain("quarterly");
    expect(metadata).toContain("Archive records");
    expect(metadata).not.toContain("annual");
    expect(metadata).not.toContain("Deleted item");
  });

  it("uses donation-based donor counts in board and IRS 990 reports", async () => {
    vi.mocked(getDonorStats).mockResolvedValue({
      totalDonors: 99,
      totalGivingThisFY: 123400,
      previousFiscalYearGivingCents: 111100,
      newDonorsThisFY: 77,
      retentionRate: 0.62,
    });

    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      donationTotal: 456700,
      donorAggregate: { totalDonors: 4, newDonorsThisFY: 2 },
      donorAggregatePredicates: [],
      grantAggregate: { count: 3, totalAmount: 890000 },
      fundAggregate: { count: 2 },
    };
    const db = createFakeDb(state);
    const env = createEnv();

    await generateBoardReport(db, env, {
      orgId: "org-1",
      entityId: "entity-1",
      userId: "user-1",
      data: { fiscalYear: "FY2026", title: "FY2026 Board Packet" },
    });
    await generateIrs990Report(db, env, {
      orgId: "org-1",
      userId: "user-1",
      data: { fiscalYear: "FY2026", title: "FY2026 IRS 990 Prep Export" },
    });

    const boardPreview = getStoredPreviewContent(state, "board");
    const irsPreview = getStoredPreviewContent(state, "irs_990");
    const storedBodies = Array.from(env.files.values())
      .map((value) => String(value))
      .join("\n");

    expect(boardPreview).toContain("Total Donors");
    expect(boardPreview).toContain("4");
    expect(boardPreview).toContain("New Donors");
    expect(boardPreview).toContain("2");
    expect(irsPreview).toContain("Total Donors");
    expect(irsPreview).toContain("4");
    expect(irsPreview).toContain("New Donors This FY");
    expect(irsPreview).toContain("2");
    expect(storedBodies).toContain("Total Donors,4");
    expect(storedBodies).toContain("New Donors This FY,2");
    expect(`${boardPreview}\n${irsPreview}`).not.toContain(">99<");

    const boardPredicates = state
      .donorAggregatePredicates!.slice(0, 2)
      .map((predicate) =>
        new PgDialect().sqlToQuery(predicate as Parameters<PgDialect["sqlToQuery"]>[0]),
      );
    expect(boardPredicates).toHaveLength(2);
    for (const rendered of boardPredicates) {
      const normalizedSql = rendered.sql.toLowerCase();
      // Deleted grant/fund/default-organization parents cannot authorize counts.
      expect(normalizedSql).toContain('"donor_scope_fund"."deleted_at" is null');
      expect(normalizedSql).toContain('"donor_scope_grant"."deleted_at" is null');
      expect(normalizedSql).toContain('"donor_scope_org"."deleted_at" is null');
      // Fund-only, grant-only, and both-linked donations fence each parent by org + entity.
      expect(normalizedSql).toContain('"donor_scope_fund"."id" = "donations"."fund_id"');
      expect(normalizedSql).toContain('"donor_scope_fund"."org_id"');
      expect(normalizedSql).toContain('"donor_scope_fund"."entity_id"');
      expect(normalizedSql).toContain('"donor_scope_grant"."id" = "donations"."grant_id"');
      expect(normalizedSql).toContain('"donor_scope_grant"."org_id"');
      expect(normalizedSql).toContain('"donor_scope_grant"."entity_id"');
      // Both-linked sibling mismatches fail closed because both nullable parent checks are ANDed.
      expect(normalizedSql).toMatch(
        /fund_id" is null or exists[\s\S]+and \("donations"\."grant_id" is null or exists/,
      );
      // Genuinely unlinked rows require the active, same-org default entity.
      expect(normalizedSql).toContain('"donations"."fund_id" is not null');
      expect(normalizedSql).toContain('"donations"."grant_id" is not null');
      expect(normalizedSql).toContain('"donor_scope_org"."default_entity_id"');
      expect(normalizedSql).not.toContain('"donations"."entity_id"');
      expect(normalizedSql).not.toContain('"donations"."default_entity_id"');
      // Donation and every parent lookup carry the requested org/entity params, fencing collisions.
      expect(rendered.params.filter((value) => value === "org-1").length).toBeGreaterThanOrEqual(4);
      expect(rendered.params.filter((value) => value === "entity-1").length).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it("falls back to zero donation-based donor counts when aggregate rows are missing", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      omitDonorAggregate: true,
    };
    const db = createFakeDb(state);
    const env = createEnv();

    await generateBoardReport(db, env, {
      orgId: "org-1",
      entityId: "entity-1",
      userId: "user-1",
      data: { fiscalYear: "FY2026", title: "FY2026 Board Packet" },
    });

    const boardPreview = getStoredPreviewContent(state, "board");
    expect(boardPreview).toContain("Total Donors");
    expect(boardPreview).toContain(">0<");
    expect(boardPreview).toContain("New Donors");
  });

  it("neutralizes CSV formula injection in attacker-controlled fund names in the audit export", async () => {
    // A restricted fund name is user-controlled. Without neutralization, a name
    // beginning with =, +, -, or @ executes as a formula when the auditor opens
    // the exported CSV in Excel/Sheets. The audit CSV must prefix such cells with
    // a single quote so they render as literal text.
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      restrictedFunds: [
        { id: "fund-1", name: "=HYPERLINK(0,1)", type: "temporarily_restricted" },
        { id: "fund-2", name: "@SUM(A1:A9)", type: "permanently_restricted" },
      ],
      donationTotal: 456700,
      grantAggregate: { count: 3, totalAmount: 890000 },
      fundAggregate: { count: 2 },
    };
    const db = createFakeDb(state);
    const env = createEnv();

    await generateAuditReport(db, env, {
      orgId: "org-1",
      userId: "user-1",
      fiscalYear: "FY2026",
      data: { title: "FY2026 Audit Export" },
    });

    const storedBodies = Array.from(env.files.values())
      .map((value) => String(value))
      .join("\n");

    expect(storedBodies).toContain("'=HYPERLINK(0,1)");
    expect(storedBodies).toContain("'@SUM(A1:A9)");
    // The raw, unescaped formula triggers must not appear at a cell boundary.
    expect(storedBodies).not.toContain(",=HYPERLINK(0,1)");
    expect(storedBodies).not.toContain(",@SUM(A1:A9)");
  });

  it("IRS 990 CSV exports Total Giving as dollars (not raw cents)", async () => {
    // donationTotal is 456700 cents = $4,567.00.
    // The CSV row "Total Giving,<value>" must contain the dollar amount, not the raw
    // integer cents — raw cents would make the exported file misleading/unusable for
    // an accountant handing it to a tax preparer.
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      donationTotal: 456700,
      donorAggregate: { totalDonors: 4, newDonorsThisFY: 2 },
    };
    const db = createFakeDb(state);
    const env = createEnv();

    await generateIrs990Report(db, env, {
      orgId: "org-1",
      userId: "user-1",
      data: { fiscalYear: "FY2026" },
    });

    const storedBodies = Array.from(env.files.values())
      .map((value) => String(value))
      .join("\n");

    // formatCurrency("$4,567.00") contains a comma so csvEscape wraps it in double-quotes.
    // The CSV row must contain the formatted dollar value, not the raw cents integer.
    expect(storedBodies).toContain('Total Giving,"$4,567.00"');
    // Must NOT contain the raw cents value in the Total Giving row
    expect(storedBodies).not.toMatch(/Total Giving,456700/);
  });

  it("uses default titles for audit, board, and IRS 990 reports", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      restrictedFunds: [
        {
          id: "fund-1",
          name: "=SUM(1,1)",
          type: "temporarily_restricted",
        },
        {
          id: "fund-2",
          name: null as unknown as string,
          type: "temporarily_restricted",
        },
      ],
      donationTotal: 0,
      grantAggregate: { count: 0, totalAmount: 0 },
      fundAggregate: { count: 0 },
    };
    const db = createFakeDb(state);
    const env = createEnv();

    const audit = await generateAuditReport(db, env, {
      orgId: "org-1",
      userId: "user-1",
      fiscalYear: "FY2026",
      data: {},
    });
    const board = await generateBoardReport(db, env, {
      orgId: "org-1",
      entityId: "entity-1",
      userId: "user-1",
      data: { fiscalYear: "FY2026" },
    });
    const irs990 = await generateIrs990Report(db, env, {
      orgId: "org-1",
      userId: "user-1",
      data: { fiscalYear: "FY2026" },
    });

    expect(audit.title).toBe("FY2026 Audit Export");
    expect(board.title).toBe("FY2026 Board Report");
    expect(irs990.title).toBe("FY2026 IRS 990 Prep Export");
    expect(
      Array.from(env.files.values()).some((value) => String(value).includes(`"'=SUM(1,1)"`)),
    ).toBe(true);
  });

  it("falls back to zero values when aggregate selects return nothing", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      restrictedFunds: [],
      omitDonationTotal: true,
      omitGrantAggregate: true,
      omitFundAggregate: true,
    };
    const db = createFakeDb(state);
    const env = createEnv();

    const irs990 = await generateIrs990Report(db, env, {
      orgId: "org-1",
      userId: "user-1",
      data: { fiscalYear: "FY2026" },
    });
    const board = await generateBoardReport(db, env, {
      orgId: "org-1",
      entityId: "entity-1",
      userId: "user-1",
      data: { fiscalYear: "FY2026" },
    });

    expect(irs990.title).toBe("FY2026 IRS 990 Prep Export");
    expect(board.title).toBe("FY2026 Board Report");
  });

  it("throws when report generation dependencies are missing", async () => {
    const orgState: FakeDbState = {
      reportRows: [],
      insertedActivity: [],
    };

    await expect(
      generateAuditReport(createFakeDb(orgState), createEnv(), {
        orgId: "org-1",
        userId: "user-1",
        fiscalYear: "FY2026",
        data: {},
      }),
    ).rejects.toThrow("Organization not found");

    const grantState: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
    };

    await expect(
      generateBoardReport(
        createFakeDb({
          ...grantState,
          organization: { ...grantState.organization!, defaultEntityId: null },
        }),
        createEnv(),
        {
          orgId: "org-1",
          userId: "user-1",
          data: { fiscalYear: "FY2026" },
        },
      ),
    ).rejects.toThrow("Organization default entity is required to generate board reports");

    await expect(
      generateGrantComplianceReport(createFakeDb(grantState), createEnv(), {
        orgId: "org-1",
        userId: "user-1",
        grantId: "missing",
        data: {},
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: "Grant not found",
    } as HTTPException);

    await expect(
      generateGrantComplianceReport(
        createFakeDb({
          ...grantState,
          failGeneratedReportInsert: true,
          grantRecord: {
            id: "grant-1",
            name: "STEM Expansion",
            amountCents: 250000,
            status: "active",
            startDate: new Date("2026-01-01T00:00:00Z"),
            endDate: new Date("2026-12-31T00:00:00Z"),
            fundAllocations: [],
            expenses: [],
            impactMetrics: [],
            reportingRequirements: [],
            closeoutItems: [],
          },
        }),
        createEnv(),
        {
          orgId: "org-1",
          userId: "user-1",
          grantId: "grant-1",
          data: {},
        },
      ),
    ).rejects.toThrow("Failed to create generated report");

    await expect(
      generateBoardReport(
        createFakeDb({
          ...grantState,
          grantAggregate: { count: 0, totalAmount: 0 },
          fundAggregate: { count: 0 },
        }),
        { APP_URL: "https://app.grantpipe.com" },
        {
          orgId: "org-1",
          entityId: "entity-1",
          userId: "user-1",
          data: { fiscalYear: "FY2026" },
        },
      ),
    ).rejects.toMatchObject({
      name: "AppError",
      status: 500,
      message: "Browser Rendering binding is required for PDF generation",
    } satisfies Partial<AppError>);
  });

  it("rejects PDF generation when browser rendering is unavailable", async () => {
    const db = createFakeDb({
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "STEM Expansion",
        amountCents: 250000,
        status: "active",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
    });

    await expect(
      generateGrantComplianceReport(
        db,
        { APP_URL: "https://app.grantpipe.com", R2: createEnv().R2 },
        {
          orgId: "org-1",
          userId: "user-1",
          grantId: "grant-1",
          data: {},
        },
      ),
    ).rejects.toMatchObject({
      name: "AppError",
      status: 500,
      message: "Browser Rendering binding is required for PDF generation",
    } satisfies Partial<AppError>);
  });

  it("generates board reports in local mode without browser rendering", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      donorAggregate: {
        totalDonors: 18,
        newDonorsThisFY: 4,
      },
      donorStats: {
        totalDonors: 18,
        totalGivingThisFY: 125000,
        previousFiscalYearGivingCents: 98000,
        newDonorsThisFY: 4,
        retentionRate: 0.61,
      },
      grantAggregate: {
        count: 3,
        totalAmount: 890000,
      },
      fundAggregate: {
        count: 2,
      },
    };
    vi.mocked(getDonorStats).mockResolvedValue(state.donorStats!);

    const env = createEnv();
    const result = await generateBoardReport(
      createFakeDb(state),
      {
        APP_URL: "http://localhost:5173",
        R2: env.R2,
      },
      {
        orgId: "org-1",
        entityId: "entity-1",
        userId: "user-1",
        data: { fiscalYear: "FY2026" },
      },
    );

    expect(result.status).toBe("ready");
    expect(result.type).toBe("board");
    expect(env.R2.put).toHaveBeenCalledTimes(1);
  });

  it("generates acknowledgment letters in local mode without browser rendering", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      donationRecord: {
        id: "donation-1",
        amountCents: 12500,
        date: new Date("2026-04-01T00:00:00Z"),
        receiptSent: false,
        contact: {
          firstName: "Jamie",
          lastName: "Rivera",
          organizationName: null,
          address: "77 Pine St",
          email: "jamie@example.com",
        },
      },
    };

    const env = createEnv();
    const result = await generateAcknowledgmentLetter(
      createFakeDb(state),
      {
        APP_URL: "http://localhost:5173",
        R2: env.R2,
      },
      {
        orgId: "org-1",
        userId: "user-1",
        donationId: "donation-1",
        data: { title: "Donation Receipt" },
      },
    );

    expect(result.status).toBe("ready");
    expect(result.type).toBe("acknowledgment");
    expect(env.R2.put).toHaveBeenCalledTimes(1);
  });

  it("generates an acknowledgment letter and marks the donation receipt as sent", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      templateRow: {
        id: "template-1",
        orgId: "org-1",
        type: "acknowledgment",
        intro: "Thank you for your generosity.",
        body: "No goods or services were provided in exchange for this contribution.",
        closing: "With gratitude,\nGrantPipe Foundation",
        updatedBy: "user-1",
        createdAt: new Date("2026-04-07T20:00:00.000Z"),
        updatedAt: new Date("2026-04-07T20:00:00.000Z"),
      },
      donationRecord: {
        id: "donation-1",
        amountCents: 12500,
        date: new Date("2026-04-01T00:00:00Z"),
        receiptSent: false,
        contact: {
          firstName: "Jamie",
          lastName: "Rivera",
          organizationName: null,
          address: "77 Pine St",
          email: "jamie@example.com",
        },
      },
    };
    const db = createFakeDb(state);
    const env = createEnv();

    const artifact = await generateAcknowledgmentLetter(db, env, {
      orgId: "org-1",
      userId: "user-1",
      donationId: "donation-1",
      data: { title: "Donation Receipt" },
    });

    expect(artifact.type).toBe("acknowledgment");
    expect(state.updatedDonationReceiptSent).toBe(true);
    expect(state.reportRows).toHaveLength(1);

    const preview = getStoredPreviewContent(state, "acknowledgment");
    expectProfessionalReportPreview(preview);
    expect(preview).toContain("Donor");
    expect(preview).toContain("Jamie Rivera");
    expect(preview).toContain("Contribution Amount");
    expect(preview).toContain("$125.00");
    expect(preview).toContain("Thank you for your generosity.");
    expect(preview).toContain("With gratitude,\nGrantPipe Foundation");
    expect(preview).toContain("white-space: pre-line");
  });

  it("cleans up stored artifacts if database persistence fails after upload", async () => {
    const env = createEnv();
    let finishCleanup: (() => void) | undefined;
    vi.mocked(env.R2.delete).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        }),
    );
    const db = createFakeDb({
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      failGeneratedReportReadyUpdate: true,
      grantRecord: {
        id: "grant-1",
        name: "STEM Expansion",
        amountCents: 250000,
        status: "active",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
    });

    let generationSettled = false;
    const generation = generateGrantComplianceReport(db, env, {
      orgId: "org-1",
      userId: "user-1",
      grantId: "grant-1",
      data: {},
    }).finally(() => {
      generationSettled = true;
    });
    void generation.catch(() => undefined);

    await vi.waitFor(() => expect(env.R2.delete).toHaveBeenCalledTimes(1));
    expect(generationSettled).toBe(false);

    finishCleanup?.();
    await expect(generation).rejects.toThrow("Failed to update generated report");
  });

  it("marks acknowledgment generation as failed and cleans up when receipt update fails", async () => {
    const env = createEnv();
    let finishCleanup: (() => void) | undefined;
    vi.mocked(env.R2.delete).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = resolve;
        }),
    );
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      failDonationReceiptUpdate: true,
      donationRecord: {
        id: "donation-1",
        amountCents: 12500,
        date: new Date("2026-04-01T00:00:00Z"),
        receiptSent: false,
        contact: {
          firstName: "Jamie",
          lastName: "Rivera",
          organizationName: null,
          address: "77 Pine St",
          email: "jamie@example.com",
        },
      },
    };

    let generationSettled = false;
    const generation = generateAcknowledgmentLetter(createFakeDb(state), env, {
      orgId: "org-1",
      userId: "user-1",
      donationId: "donation-1",
      data: { title: "Donation Receipt" },
    }).finally(() => {
      generationSettled = true;
    });
    void generation.catch(() => undefined);

    await vi.waitFor(() => expect(env.R2.delete).toHaveBeenCalledTimes(1));
    expect(generationSettled).toBe(false);

    finishCleanup?.();
    await expect(generation).rejects.toThrow("Failed to mark donation receipt as sent");
    expect(state.reportRows[0]?.status).toBe("failed");
  });

  it("does not dispatch ready effects when the acknowledgment receipt transaction throws", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      throwDonationReceiptUpdate: true,
      donationRecord: {
        id: "donation-1",
        amountCents: 12500,
        date: new Date("2026-04-01T00:00:00Z"),
        receiptSent: false,
        contact: {
          firstName: "Jamie",
          lastName: "Rivera",
          organizationName: null,
          address: "77 Pine St",
          email: "jamie@example.com",
        },
      },
    };

    await expect(
      generateAcknowledgmentLetter(createFakeDb(state), env, {
        orgId: "org-1",
        entityId: "entity-1",
        userId: "user-1",
        donationId: "donation-1",
        data: { title: "Donation Receipt" },
      }),
    ).rejects.toBe("Postgres receipt update unavailable");

    expect(state.reportRows[0]?.status).toBe("failed");
    expect(env.R2.delete).toHaveBeenCalledOnce();
    expect(mockDeliverReportReadyEffects).not.toHaveBeenCalled();
  });

  it("reconciles an acknowledgment when the atomic ready commit response is lost", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      throwAfterGeneratedReportReadyCommit: true,
      donationRecord: {
        id: "donation-1",
        amountCents: 12500,
        date: new Date("2026-04-01T00:00:00Z"),
        receiptSent: false,
        contact: {
          firstName: "Jamie",
          lastName: "Rivera",
          organizationName: null,
          address: "77 Pine St",
          email: "jamie@example.com",
        },
      },
    };

    await expect(
      generateAcknowledgmentLetter(createFakeDb(state), env, {
        orgId: "org-1",
        entityId: "entity-1",
        userId: "user-1",
        donationId: "donation-1",
        data: { title: "Donation Receipt" },
      }),
    ).resolves.toMatchObject({ status: "ready" });

    expect(state.updatedDonationReceiptSent).toBe(true);
    expect(env.R2.delete).not.toHaveBeenCalled();
    expect(mockDeliverReportReadyEffects).toHaveBeenCalledOnce();
  });

  it("keeps acknowledgment pending until receipt state commits, then compensates failures", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      failDonationReceiptUpdate: true,
      loseAcknowledgmentCompensationRace: true,
      donationRecord: {
        id: "donation-1",
        amountCents: 12500,
        date: new Date("2026-04-01T00:00:00Z"),
        receiptSent: false,
        contact: {
          firstName: "Jamie",
          lastName: "Rivera",
          organizationName: null,
          address: "77 Pine St",
          email: "jamie@example.com",
        },
      },
    };

    await expect(
      generateAcknowledgmentLetter(createFakeDb(state), env, {
        orgId: "org-1",
        userId: "user-1",
        donationId: "donation-1",
        data: { title: "Donation Receipt" },
      }),
    ).rejects.toThrow("Failed to mark donation receipt as sent");

    expect(state.reportRows[0]?.status).toBe("failed");
    expect(env.R2.delete).toHaveBeenCalledOnce();
    expect(mockDeliverReportReadyEffects).not.toHaveBeenCalled();
  });

  it("leaves a pending acknowledgment recoverable when failure persistence is unavailable", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      failDonationReceiptUpdate: true,
      failGeneratedReportFailedUpdate: true,
      donationRecord: {
        id: "donation-1",
        amountCents: 12500,
        date: new Date("2026-04-01T00:00:00Z"),
        receiptSent: false,
        contact: {
          firstName: "Jamie",
          lastName: "Rivera",
          organizationName: null,
          address: "77 Pine St",
          email: "jamie@example.com",
        },
      },
    };

    await expect(
      generateAcknowledgmentLetter(createFakeDb(state), env, {
        orgId: "org-1",
        userId: "user-1",
        donationId: "donation-1",
        data: { title: "Donation Receipt" },
      }),
    ).rejects.toThrow("Failed to mark donation receipt as sent");

    expect(state.reportRows[0]?.status).toBe("pending");
    expect(env.R2.delete).not.toHaveBeenCalled();
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Failed to update generated report status" }),
      "compliance",
      expect.objectContaining({
        step: "mark_generated_report_failed_status",
        report_id: expect.any(String),
      }),
    );
    expect(mockDeliverReportReadyEffects).not.toHaveBeenCalled();
  });

  it("keeps a ready artifact when durable ready effects are deferred", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      restrictedFunds: [{ id: "fund-1", name: "Safe Fund", type: "temporarily_restricted" }],
    };

    mockDeliverReportReadyEffects.mockResolvedValueOnce(false);
    await expect(
      generateAuditReport(createFakeDb(state), env, {
        orgId: "org-1",
        userId: "user-1",
        fiscalYear: "FY2026",
        data: {},
      }),
    ).resolves.toMatchObject({ status: "ready" });

    expect(env.R2.delete).not.toHaveBeenCalled();
    expect(state.reportRows[0]?.status).toBe("ready");
  });

  it("preserves a ready report and its object when the ready commit response is lost", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      throwAfterGeneratedReportReadyCommit: true,
      restrictedFunds: [{ id: "fund-1", name: "Safe Fund", type: "temporarily_restricted" }],
    };

    const artifact = await generateAuditReport(createFakeDb(state), env, {
      orgId: "org-1",
      userId: "user-1",
      fiscalYear: "FY2026",
      data: {},
    });

    expect(artifact.status).toBe("ready");
    expect(state.reportRows[0]?.status).toBe("ready");
    expect(env.R2.delete).not.toHaveBeenCalled();
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Postgres response lost after ready commit" }),
      "compliance",
      expect.objectContaining({
        step: "generated_report_ready_reconciled",
        report_id: expect.any(String),
      }),
    );
  });

  it("preserves the original failure and object when marking the report failed also breaks", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      failGeneratedReportReadyUpdate: true,
      failGeneratedReportFailedUpdate: true,
      restrictedFunds: [{ id: "fund-1", name: "Safe Fund", type: "temporarily_restricted" }],
    };

    await expect(
      generateAuditReport(createFakeDb(state), env, {
        orgId: "org-1",
        userId: "user-1",
        fiscalYear: "FY2026",
        data: {},
      }),
    ).rejects.toThrow("Failed to update generated report");

    expect(env.R2.delete).not.toHaveBeenCalled();
  });

  it("preserves the original failure when blob cleanup also fails", async () => {
    const env = createEnv();
    const cleanupError = new Error("R2 delete failed");
    vi.mocked(env.R2.delete).mockRejectedValueOnce(cleanupError);
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      failGeneratedReportReadyUpdate: true,
      restrictedFunds: [{ id: "fund-1", name: "Safe Fund", type: "temporarily_restricted" }],
    };

    await expect(
      generateAuditReport(createFakeDb(state), env, {
        orgId: "org-1",
        userId: "user-1",
        fiscalYear: "FY2026",
        data: {},
      }),
    ).rejects.toThrow("Failed to update generated report");

    await flushMicrotasks();
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(cleanupError, "compliance", {
      step: "generated_report_cleanup",
    });
  });

  it("uses donor fallback values for acknowledgment letters", async () => {
    const baseState: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
    };

    const orgDonation = {
      id: "donation-1",
      amountCents: 12500,
      date: new Date("2026-04-01T00:00:00Z"),
      receiptSent: false,
      contact: {
        firstName: null,
        lastName: null,
        organizationName: "Rivera Family Fund",
        address: null,
        email: null,
      },
    };

    const byOrg = await generateAcknowledgmentLetter(
      createFakeDb({ ...baseState, donationRecord: orgDonation }),
      createEnv(),
      { orgId: "org-1", userId: "user-1", donationId: "donation-1", data: {} },
    );
    expect(byOrg.title).toBe("Rivera Family Fund Acknowledgment Letter");

    const byEmail = await generateAcknowledgmentLetter(
      createFakeDb({
        ...baseState,
        donationRecord: {
          ...orgDonation,
          contact: {
            firstName: null,
            lastName: null,
            organizationName: null,
            address: null,
            email: "jamie@example.com",
          },
        },
      }),
      createEnv(),
      { orgId: "org-1", userId: "user-1", donationId: "donation-1", data: {} },
    );
    expect(byEmail.title).toBe("jamie@example.com Acknowledgment Letter");

    const byFallback = await generateAcknowledgmentLetter(
      createFakeDb({
        ...baseState,
        donationRecord: {
          ...orgDonation,
          contact: {
            firstName: null,
            lastName: null,
            organizationName: null,
            address: null,
            email: null,
          },
        },
      }),
      createEnv(),
      { orgId: "org-1", userId: "user-1", donationId: "donation-1", data: {} },
    );
    expect(byFallback.title).toBe("Donor Acknowledgment Letter");
  });

  it("throws when the donation is missing", async () => {
    const db = createFakeDb({
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
    });

    await expect(
      generateAcknowledgmentLetter(db, createEnv(), {
        orgId: "org-1",
        userId: "user-1",
        donationId: "missing",
        data: {},
      }),
    ).rejects.toMatchObject({
      status: 404,
      message: "Donation not found",
    } as HTTPException);
  });

  it("generates a year-end statement bundle with deductible totals and logs delivery tracking", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      insertedCommunications: [],
      yearEndDonations: [
        {
          id: "donation-1",
          amountCents: 10000,
          goodsServicesValueCents: 2500,
          goodsServicesDescription: "Dinner ticket fair market value",
          date: new Date("2026-01-01T00:00:00.000Z"),
          receiptSent: false,
          contactId: "contact-1",
          contact: {
            firstName: "Jamie",
            lastName: "Rivera",
            organizationName: null,
            address: "77 Pine St",
            email: "jamie@example.com",
            emailOptOut: false,
          },
        },
        {
          id: "donation-2",
          amountCents: 5000,
          goodsServicesValueCents: 0,
          goodsServicesDescription: null,
          date: new Date("2026-12-31T23:59:59.000Z"),
          receiptSent: false,
          contactId: "contact-1",
          contact: {
            firstName: "Jamie",
            lastName: "Rivera",
            organizationName: null,
            address: "77 Pine St",
            email: "jamie@example.com",
            emailOptOut: false,
          },
        },
        {
          id: "donation-3",
          amountCents: 1000,
          goodsServicesValueCents: 1500,
          goodsServicesDescription: "Benefit value exceeded gift",
          date: new Date("2026-06-30T12:00:00.000Z"),
          receiptSent: false,
          contactId: "contact-2",
          contact: {
            firstName: null,
            lastName: null,
            organizationName: "River City Arts",
            address: null,
            email: null,
            emailOptOut: false,
          },
        },
        {
          id: "donation-4",
          amountCents: 2000,
          goodsServicesValueCents: 0,
          goodsServicesDescription: null,
          date: new Date("2026-07-01T12:00:00.000Z"),
          receiptSent: false,
          contactId: "contact-3",
          contact: {
            firstName: null,
            lastName: null,
            organizationName: null,
            address: null,
            email: "email-only@example.org",
            emailOptOut: false,
          },
        },
      ],
    };

    const artifact = await generateDonorYearEndStatementRun(createFakeDb(state), env, {
      orgId: "org-1",
      userId: "user-1",
      data: { year: 2026, deliveryMode: "download" },
    });

    expect(artifact.type).toBe("donor_year_end_statement");
    expect(artifact.fiscalYear).toBe("2026");
    expect(state.updatedDonationReceiptSent).toBe(true);
    expect(state.updatedDonationIds).toEqual([
      "donation-1",
      "donation-2",
      "donation-3",
      "donation-4",
    ]);
    expect(state.insertedCommunications).toHaveLength(3);
    expect(state.insertedCommunications?.[0]).toMatchObject({
      orgId: "org-1",
      contactId: "contact-1",
      type: "note",
      subject: "2026 year-end statement prepared",
      mailMergeAttemptId: artifact.id,
    });
    expect(state.transactionCount).toBe(1);
    const preview = getStoredPreviewContent(state, "donor_year_end_statement");
    expect(preview).toContain("Jamie Rivera");
    expect(preview).toContain("$150.00");
    expect(preview).toContain("$25.00");
    expect(preview).toContain("$125.00");
    expect(preview).toContain("Dinner ticket fair market value");
    expect(preview).toContain("River City Arts");
    expect(preview).toContain("email-only@example.org");
    expect(preview).toContain("Benefit value exceeded gift");
    expect(preview).toContain("$145.00");
  });

  it("stores an empty year-end statement run without marking receipts or logs", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      insertedCommunications: [],
      yearEndDonations: [],
    };

    const artifact = await generateDonorYearEndStatementRun(createFakeDb(state), env, {
      orgId: "org-1",
      userId: "user-1",
      data: {
        year: 2026,
        deliveryMode: "download",
        minimumAmountCents: 1000,
        title: "2026 Empty Statement Run",
      },
    });

    expect(artifact.title).toBe("2026 Empty Statement Run");
    expect(state.updatedDonationReceiptSent).toBeUndefined();
    expect(state.insertedCommunications).toEqual([]);
    const preview = getStoredPreviewContent(state, "donor_year_end_statement");
    expect(preview).toContain("Donors included");
    expect(preview).toContain("2026 Empty Statement Run");
  });

  it("does not publish year-end success when its atomic side effects fail", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      insertedCommunications: [],
      failCommunicationInsert: true,
      yearEndDonations: [
        {
          id: "donation-1",
          amountCents: 10000,
          goodsServicesValueCents: 0,
          goodsServicesDescription: null,
          date: new Date("2026-06-01T00:00:00.000Z"),
          receiptSent: false,
          contactId: "contact-1",
          contact: {
            firstName: "Jamie",
            lastName: "Rivera",
            organizationName: null,
            address: null,
            email: "jamie@example.com",
            emailOptOut: false,
          },
        },
      ],
    };

    await expect(
      generateDonorYearEndStatementRun(createFakeDb(state), env, {
        orgId: "org-1",
        userId: "user-1",
        data: { year: 2026, deliveryMode: "download" },
      }),
    ).rejects.toThrow("Failed to create communication log");

    expect(state.reportRows[0]?.status).toBe("failed");
    expect(mockDeliverReportReadyEffects).not.toHaveBeenCalled();
    expect(env.R2.delete).toHaveBeenCalledOnce();
  });

  it("reconciles a lost year-end transaction response without duplicating communication logs", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      insertedCommunications: [],
      throwAfterGeneratedReportReadyCommit: true,
      yearEndDonations: [
        {
          id: "donation-1",
          amountCents: 10000,
          goodsServicesValueCents: 0,
          goodsServicesDescription: null,
          date: new Date("2026-06-01T00:00:00.000Z"),
          receiptSent: false,
          contactId: "contact-1",
          contact: {
            firstName: "Jamie",
            lastName: "Rivera",
            organizationName: null,
            address: null,
            email: "jamie@example.com",
            emailOptOut: false,
          },
        },
      ],
    };

    const artifact = await generateDonorYearEndStatementRun(createFakeDb(state), env, {
      orgId: "org-1",
      userId: "user-1",
      data: { year: 2026, deliveryMode: "download" },
    });

    expect(artifact.status).toBe("ready");
    expect(state.insertedCommunications).toHaveLength(1);
    expect(state.insertedCommunications?.[0]?.mailMergeAttemptId).toBe(artifact.id);
    expect(mockDeliverReportReadyEffects).toHaveBeenCalledOnce();
    expect(env.R2.delete).not.toHaveBeenCalled();
  });

  it("fails and cleans up when a year-end donation disappears before the transaction", async () => {
    const env = createEnv();
    const state = createYearEndStatementState({ failDonationReceiptUpdate: true });

    await expect(
      generateDonorYearEndStatementRun(createFakeDb(state), env, {
        orgId: "org-1",
        userId: "user-1",
        data: { year: 2026, deliveryMode: "download" },
      }),
    ).rejects.toThrow("Failed to mark year-end statement donations as receipted");

    expect(state.reportRows[0]?.status).toBe("failed");
    expect(env.R2.delete).toHaveBeenCalledOnce();
  });

  it("fails and cleans up when the year-end ready transition loses the pending row", async () => {
    const env = createEnv();
    const state = createYearEndStatementState({ failGeneratedReportReadyUpdate: true });

    await expect(
      generateDonorYearEndStatementRun(createFakeDb(state), env, {
        orgId: "org-1",
        userId: "user-1",
        data: { year: 2026, deliveryMode: "download" },
      }),
    ).rejects.toThrow("Failed to mark generated report ready");

    expect(state.reportRows[0]?.status).toBe("failed");
    expect(env.R2.delete).toHaveBeenCalledOnce();
  });

  it("uses a safe fallback when a year-end transaction throws a non-Error value", async () => {
    const env = createEnv();
    const state = createYearEndStatementState({ communicationInsertError: "connection lost" });

    await expect(
      generateDonorYearEndStatementRun(createFakeDb(state), env, {
        orgId: "org-1",
        userId: "user-1",
        data: { year: 2026, deliveryMode: "download" },
      }),
    ).rejects.toBe("connection lost");

    expect(state.reportRows[0]?.metadata).toMatchObject({
      failureReason: "Failed to complete year-end statements",
    });
  });

  it("preserves a non-ready concurrent year-end outcome after losing the compensation race", async () => {
    const env = createEnv();
    const state = createYearEndStatementState({
      throwAfterGeneratedReportReadyCommit: true,
      loseAcknowledgmentCompensationRace: true,
    });
    const db = createFakeDb(state);
    vi.mocked(db.query.generatedReports.findFirst).mockResolvedValue(
      createReportRow({ type: "donor_year_end_statement", status: "failed" }),
    );

    await expect(
      generateDonorYearEndStatementRun(db, env, {
        orgId: "org-1",
        userId: "user-1",
        data: { year: 2026, deliveryMode: "download" },
      }),
    ).rejects.toThrow("Postgres response lost after ready commit");

    expect(env.R2.delete).not.toHaveBeenCalled();
  });

  it("uses local PDF fallback when INTEGRATION_MODE is mock", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "STEM Expansion",
        amountCents: 250000,
        status: "active",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
    };

    const artifact = await generateGrantComplianceReport(
      createFakeDb(state),
      { APP_URL: "https://app.grantpipe.com", INTEGRATION_MODE: "mock", R2: env.R2 },
      { orgId: "org-1", userId: "user-1", grantId: "grant-1", data: {} },
    );

    expect(artifact.status).toBe("ready");
    expect(artifact.type).toBe("compliance");
    // Local fallback was used — browser rendering was never invoked
    expect(puppeteer.launch).not.toHaveBeenCalled();
  });

  it("throws when APP_URL is not a valid URL and no browser rendering is available", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: "12-3456789",
        logoUrl: null,
        address: "123 Main St",
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      grantRecord: {
        id: "grant-1",
        name: "STEM Expansion",
        amountCents: 250000,
        status: "active",
        startDate: new Date("2026-01-01T00:00:00Z"),
        endDate: new Date("2026-12-31T00:00:00Z"),
        fundAllocations: [],
        expenses: [],
        impactMetrics: [],
        reportingRequirements: [],
        closeoutItems: [],
      },
    };

    // shouldUseLocalPdfFallback catches the URL parse error and returns false,
    // so without BROWSER_RENDERING the service throws an AppError
    await expect(
      generateGrantComplianceReport(
        createFakeDb(state),
        { APP_URL: "not-a-valid-url", R2: env.R2 },
        { orgId: "org-1", userId: "user-1", grantId: "grant-1", data: {} },
      ),
    ).rejects.toMatchObject({
      name: "AppError",
      status: 500,
      message: "Browser Rendering binding is required for PDF generation",
    } satisfies Partial<AppError>);
  });
});

describe("generateSpendDownReport", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(puppeteer.launch).mockReset();
  });

  const baseSpendDown: GrantSpendDown = {
    budgetCents: 100_000,
    expensesCents: 80_000,
    remainingCents: 20_000,
    burnRateCentsPerMonth: 10_000,
    projectedExhaustionDate: "2026-06-01T00:00:00.000Z",
    thresholdState: "80",
    byCategory: [
      { category: "Salaries", amountCents: 50_000 },
      { category: "Supplies", amountCents: 30_000 },
    ],
    byFund: [
      {
        fundId: "fund-1",
        fundName: "General Fund",
        allocatedAmountCents: 60_000,
        expensesCents: 40_000,
      },
    ],
    byMonth: [
      { month: "2026-01", amountCents: 30_000 },
      { month: "2026-02", amountCents: 50_000 },
    ],
  };

  it("generates a spend-down PDF report and stores it", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "Nonprofit Org",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
    };

    vi.mocked(getGrantSpendDown).mockResolvedValue(baseSpendDown);

    const result = await generateSpendDownReport(createFakeDb(state), env, {
      orgId: "org-1",
      userId: "user-1",
      data: { grantId: "grant-1" },
    });

    expect(result.type).toBe("spend_down");
    expect(result.format).toBe("pdf");
    expect(result.grantId).toBe("grant-1");
    expect(result.status).toBe("ready");
    expect(getGrantSpendDown).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: "org-1", grantId: "grant-1" }),
    );
  });

  it("uses the provided title when given", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "Nonprofit Org",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
    };

    vi.mocked(getGrantSpendDown).mockResolvedValue(baseSpendDown);

    const result = await generateSpendDownReport(createFakeDb(state), env, {
      orgId: "org-1",
      userId: "user-1",
      data: { grantId: "grant-1", title: "Q1 Spend-Down" },
    });

    expect(result.title).toBe("Q1 Spend-Down");
  });

  it("passes from/to to getGrantSpendDown when provided", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "Nonprofit Org",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
    };

    vi.mocked(getGrantSpendDown).mockResolvedValue({
      ...baseSpendDown,
      byCategory: [],
      byFund: [],
      byMonth: [],
    });

    await generateSpendDownReport(createFakeDb(state), env, {
      orgId: "org-1",
      userId: "user-1",
      data: {
        grantId: "grant-1",
        from: "2026-01-01T00:00:00.000Z",
        to: "2026-03-31T23:59:59.999Z",
      },
    });

    expect(getGrantSpendDown).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        from: new Date("2026-01-01T00:00:00.000Z"),
        to: new Date("2026-03-31T23:59:59.999Z"),
      }),
    );
  });

  it("renders empty sections when no data", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "Nonprofit Org",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
    };

    vi.mocked(getGrantSpendDown).mockResolvedValue({
      budgetCents: null,
      expensesCents: 0,
      remainingCents: null,
      burnRateCentsPerMonth: null,
      projectedExhaustionDate: null,
      thresholdState: null,
      byCategory: [],
      byFund: [],
      byMonth: [],
    });

    const result = await generateSpendDownReport(createFakeDb(state), env, {
      orgId: "org-1",
      userId: "user-1",
      data: { grantId: "grant-1" },
    });

    expect(result.status).toBe("ready");
  });

  it("propagates notFound when getGrantSpendDown throws", async () => {
    const env = createEnv();
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "Nonprofit Org",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
    };

    vi.mocked(getGrantSpendDown).mockRejectedValue(new AppError(404, "Grant not found"));

    await expect(
      generateSpendDownReport(createFakeDb(state), env, {
        orgId: "org-1",
        userId: "user-1",
        data: { grantId: "missing-grant" },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

// ---------------------------------------------------------------------------
// attemptFailedStatusUpdate observability (fix #14)
// ---------------------------------------------------------------------------

describe("attemptFailedStatusUpdate observability", () => {
  it("logs to console.error when markGeneratedReportStatus fails so the failure is visible in Worker logs (fix #14)", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const env = createEnv();

    // Use failGeneratedReportFailedUpdate: true to trigger the swallowed inner failure.
    // We also need a primary failure to cause attemptFailedStatusUpdate to be called.
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      failGeneratedReportReadyUpdate: true,
      failGeneratedReportFailedUpdate: true,
    };

    // The primary error propagates; we only care that console.error was called
    // for the reportId by the inner catch of attemptFailedStatusUpdate.
    await expect(
      generateAuditReport(createFakeDb(state), env, {
        orgId: "org-1",
        userId: "user-1",
        fiscalYear: "FY2026",
        data: {},
      }),
    ).rejects.toThrow();

    // The console.error call from attemptFailedStatusUpdate must include the reportId.
    const complianceLogCall = consoleErrorSpy.mock.calls.find(
      (call) => typeof call[0] === "string" && call[0].includes("[compliance]"),
    );
    expect(complianceLogCall).toBeDefined();
    expect(complianceLogCall?.[0]).toContain(
      "[compliance] markGeneratedReportStatus failed for reportId:",
    );
    expect(mockCaptureBackgroundException).toHaveBeenCalledWith(
      expect.any(Error),
      "compliance",
      expect.objectContaining({
        step: "mark_generated_report_failed_status",
        report_id: expect.any(String),
      }),
    );

    consoleErrorSpy.mockRestore();
  });
});

describe("updateAcknowledgmentTemplate — atomicity", () => {
  it("runs upsert + log in one transaction (happy path)", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
    };
    const db = createFakeDb(state);

    const result = await updateAcknowledgmentTemplate(db, {
      orgId: "org-1",
      userId: "user-1",
      data: { intro: "Hello", body: "No goods.", closing: "Thanks" },
    });

    expect(result.intro).toBe("Hello");
    expect(state.insertedActivity).toHaveLength(1);
    expect(state.insertedActivity[0]).toMatchObject({
      action: "updated",
      entityType: "generated_report",
    });
  });

  it("rolls back when audit log fails", async () => {
    const state: FakeDbState = {
      organization: {
        id: "org-1",
        name: "GrantPipe Foundation",
        ein: null,
        logoUrl: null,
        address: null,
        fiscalYearStartMonth: 1,
      },
      reportRows: [],
      insertedActivity: [],
      failActivityInsert: true,
    };

    await expect(
      updateAcknowledgmentTemplate(createFakeDb(state), {
        orgId: "org-1",
        userId: "user-1",
        data: { intro: "Hello", body: "No goods.", closing: "Thanks" },
      }),
    ).rejects.toThrow("Failed to create activity log");
  });
});

// ---------------------------------------------------------------------------
// Regression guard — relational query API + cross-table sql fragments
//
// generateAcknowledgmentLetter and generateDonorYearEndStatementRun both pass
// `where` expressions built from donationEntityScope (imported from
// donors/ownership.ts), which embeds raw `sql` fragments referencing OTHER
// tables' columns (funds, grants, organizations). Under the Drizzle
// relational query API (`db.query.donations.findFirst`/`findMany`), those
// fragments get silently re-qualified to the wrong table and Postgres 500s.
// The core query builder (`db.select().from().innerJoin().where()`) does not
// re-qualify columns, so these two call sites must use it instead of
// `db.query.donations`.
// ---------------------------------------------------------------------------

describe("compliance service source contract — no relational API for donationEntityScope reads", () => {
  const complianceServiceSource = readFileSync(
    fileURLToPath(new URL("./service.ts", import.meta.url)),
    "utf8",
  );

  it("does not call db.query.donations.findFirst (donationEntityScope re-qualification hazard)", () => {
    expect(complianceServiceSource).not.toContain("db.query.donations.findFirst");
  });

  it("does not call db.query.donations.findMany (donationEntityScope re-qualification hazard)", () => {
    expect(complianceServiceSource).not.toContain("db.query.donations.findMany");
  });
});
