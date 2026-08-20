import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MigrationPlanStep, MigrationSourceId, MigrationSourcePlan } from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { ApiError } from "../lib/http-response";
import { captureEvent } from "../lib/analytics";
import { captureAppException } from "../lib/sentry";

const imports = api.api.import;

export type ImportPreviewRow = Record<string, string | number | boolean | null>;

type ImportEntityType =
  | "contacts"
  | "donations"
  | "grants"
  | "grant_opportunities"
  | "funds"
  | "opening_balances"
  | "pledges";

export type ImportPreviewResponse = {
  entityType: ImportEntityType;
  filename: string;
  headers: string[];
  rows: ImportPreviewRow[];
  totalRows: number;
  reconciliation?: {
    debitTotalCents: number;
    creditTotalCents: number;
    balanced: boolean;
    commitBlocked: boolean;
    fiscalPeriod: {
      id: string | null;
      status: string | null;
      open: boolean;
      dateInRange: boolean | null;
    };
    unresolvedAccounts: Array<{ rowNumber: number; accountId?: string; accountCode?: string }>;
    unresolvedFunds: Array<{ rowNumber: number; fundId?: string; fundName?: string }>;
    unresolvedGrants: Array<{ rowNumber: number; grantId?: string; grantName?: string }>;
    errors: ImportRowErrorDetail[];
  };
};

export type ImportRowErrorDetail = {
  rowIndex: number;
  rowNumber?: number;
  field?: string;
  code?: string;
  message: string;
};

export type ImportSummary = {
  createdCounts?: {
    contacts: number;
    donations: number;
    grants: number;
    funders: number;
    grantOpportunities: number;
    funds: number;
    openingBalanceLines: number;
    pledges: number;
    pledgeInstallments: number;
  };
  errorDetails?: ImportRowErrorDetail[];
};

export type ImportHistoryEntry = {
  id: string;
  entityType: string;
  filename: string;
  status: string;
  createdAt: string;
  insertedRows: number;
  duplicateRows: number;
  failedRows: number;
  summary?: ImportSummary | null;
};

export type ImportHistoryResponse = {
  data: ImportHistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export type MigrationPlanProgress = {
  entityType: MigrationPlanStep["entityType"];
  status: "completed" | "has_errors" | "not_started";
  latestImportAt: string | null;
  insertedRows: number;
  failedRows: number;
};

export type MigrationPlanResponse = MigrationSourcePlan & {
  progress: MigrationPlanProgress[];
  nextEntityType: MigrationPlanStep["entityType"] | null;
};

export type ImportCommitResponse = {
  insertedRows: number;
  duplicateRows: number;
  failedRows: number;
  totalRows: number;
  createdCounts: {
    contacts: number;
    donations: number;
    grants: number;
    funders: number;
    grantOpportunities: number;
    funds: number;
    openingBalanceLines: number;
    pledges: number;
    pledgeInstallments: number;
  };
  history: {
    id: string;
    status: string;
    filename: string;
    entityType: string;
    summary?: ImportSummary | null;
  };
};

const importEntityQueryKeys: Record<
  "contacts" | "donations" | "grants" | "funds" | "opening_balances" | "pledges",
  string[][]
> = {
  // Importing contacts adds donor contacts, which the donors page's donor-stats
  // tile counts (total donors and new-donors-this-FY are read straight off the
  // contacts table), so it must be refreshed alongside the contacts list.
  contacts: [["contacts"], ["dashboard-overview"], ["donor-stats"], ["activity"], ["org-activity"]],
  // Importing donations shifts both donor-stats (giving totals) and
  // retention-stats (year-over-year repeat donors), both rendered on the
  // donors page, so both stat queries must be invalidated.
  donations: [
    ["donations"],
    ["contacts"],
    ["dashboard-overview"],
    ["donor-stats"],
    ["retention-stats"],
    // The import service posts a journal entry for every imported donation
    // (postDonation), so the accounting views go stale exactly like they do
    // after a standalone useCreateDonation — which refreshes them via
    // invalidateDonationAccountingViews. Mirror that key set here (journal
    // entries list + trial balance + ledger + the three financial reports) or
    // every Accounting page keeps showing the pre-import state until a reload.
    ["accounting-journal-entries"],
    ["accounting-trial-balance"],
    ["accounting-ledger"],
    ["accounting-report-financial-position"],
    ["accounting-report-activities"],
    ["accounting-report-functional-expenses"],
    ["activity"],
    ["org-activity"],
  ],
  grants: [
    ["grants"],
    ["grant-pipeline"],
    // A grant import writes applicationDeadline/startDate/endDate, which the
    // calendar overview (["calendar-overview", month]) reads to build each
    // month's deadline items. Invalidate the calendar caches too — every other
    // grant mutation already does via invalidateGrant — or the calendar keeps
    // showing the pre-import deadlines until a reload.
    ["calendar-overview"],
    ["dashboard-overview"],
    ["funders"],
    // A grant import requires a funder per row and links every imported grant to
    // it (match-or-create by name/ID), so each imported grant appears in that
    // funder's "Grant History" tab, which the funder detail (["funder", id])
    // embeds via getFunder's grants:true. The ["funders"] plural list key does
    // not prefix-match the ["funder", id] singular detail key — invalidate
    // ["funder"] too, or an open funder detail keeps showing the pre-import
    // grant list until a reload.
    ["funder"],
    ["activity"],
    ["org-activity"],
  ],
  funds: [
    ["funds"],
    ["dashboard-overview"],
    ["accounting-ledger"],
    ["accounting-trial-balance"],
    ["accounting-report-financial-position"],
    ["activity"],
    ["org-activity"],
  ],
  opening_balances: [
    ["accounting-journal-entries"],
    ["accounting-trial-balance"],
    ["accounting-ledger"],
    ["accounting-report-financial-position"],
    ["accounting-report-activities"],
    ["accounting-report-functional-expenses"],
    ["dashboard-overview"],
    ["funds"],
    ["activity"],
    ["org-activity"],
  ],
  pledges: [
    ["pledges"],
    ["contacts"],
    ["donor-stats"],
    ["accounting-journal-entries"],
    ["accounting-trial-balance"],
    ["accounting-ledger"],
    ["accounting-report-financial-position"],
    ["activity"],
    ["org-activity"],
  ],
};

const grantOpportunityImportQueryKeys = [
  ["tracked-grant-opportunities"],
  ["grant-opportunities"],
  ["activity"],
  ["org-activity"],
];

function getRowCountBucket(count: number) {
  if (count <= 0) return "0";
  if (count <= 10) return "1-10";
  if (count <= 100) return "11-100";
  if (count <= 1000) return "101-1000";
  return "1000+";
}

function buildImportCompletedProperties(
  data: ImportCommitResponse,
  entityType: ImportEntityType,
): Record<string, unknown> {
  return {
    entity_type: entityType,
    total_rows_bucket: getRowCountBucket(data.totalRows),
    inserted_rows_bucket: getRowCountBucket(data.insertedRows),
    duplicate_rows_bucket: getRowCountBucket(data.duplicateRows),
    failed_rows_bucket: getRowCountBucket(data.failedRows),
    contacts_created_bucket: getRowCountBucket(data.createdCounts.contacts),
    donations_created_bucket: getRowCountBucket(data.createdCounts.donations),
    grants_created_bucket: getRowCountBucket(data.createdCounts.grants),
    funders_created_bucket: getRowCountBucket(data.createdCounts.funders),
    grant_opportunities_created_bucket: getRowCountBucket(data.createdCounts.grantOpportunities),
    funds_created_bucket: getRowCountBucket(data.createdCounts.funds),
    opening_balance_lines_created_bucket: getRowCountBucket(data.createdCounts.openingBalanceLines),
    pledges_created_bucket: getRowCountBucket(data.createdCounts.pledges),
    pledge_installments_created_bucket: getRowCountBucket(data.createdCounts.pledgeInstallments),
  };
}

async function readResponseOrThrow<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  let payload: unknown;

  if (contentType.includes("application/json")) {
    try {
      payload = (await response.json()) as unknown;
    } catch {
      payload = undefined;
    }
  } else {
    try {
      payload = await response.text();
    } catch {
      payload = undefined;
    }
  }

  if (!response.ok) {
    if (typeof payload === "object" && payload !== null) {
      const record = payload as Record<string, unknown>;
      if (typeof record.error === "string" && record.error.trim().length > 0) {
        throw new ApiError(record.error, response.status);
      }
      if (typeof record.message === "string" && record.message.trim().length > 0) {
        throw new ApiError(record.message, response.status);
      }
    }

    if (typeof payload === "string" && payload.trim().length > 0) {
      throw new ApiError(payload, response.status);
    }

    throw new ApiError("Request failed", response.status);
  }

  return payload as T;
}

export function useImportHistory() {
  return useQuery({
    queryKey: ["import-history"],
    queryFn: async (): Promise<ImportHistoryResponse> => {
      const res = await imports.$get({
        query: {
          page: "1",
          pageSize: "25",
          sortBy: "createdAt",
          sortOrder: "desc",
        },
      });
      return readResponseOrThrow(res);
    },
  });
}

export function useMigrationPlan(source: MigrationSourceId) {
  return useQuery({
    queryKey: ["migration-plan", source],
    queryFn: async (): Promise<MigrationPlanResponse> => {
      const res = await imports["migration-plan"].$get({
        query: { source },
      });
      return readResponseOrThrow<MigrationPlanResponse>(res);
    },
  });
}

export function useImportMutations() {
  const queryClient = useQueryClient();

  return {
    previewImport: useMutation({
      mutationFn: async (data: {
        entityType: ImportEntityType;
        filename: string;
        csvText: string;
      }): Promise<ImportPreviewResponse> => {
        const res = await imports.preview.$post({ json: data });
        return readResponseOrThrow<ImportPreviewResponse>(res);
      },
    }),
    commitImport: useMutation({
      mutationFn: async (data: {
        entityType: ImportEntityType;
        filename: string;
        mapping: Record<string, string>;
        rows: ImportPreviewRow[];
      }): Promise<ImportCommitResponse> => {
        const res = await imports.commit.$post({ json: data });
        return readResponseOrThrow<ImportCommitResponse>(res);
      },
      onSuccess: (data, variables) => {
        captureEvent(
          "import_completed",
          buildImportCompletedProperties(data, variables.entityType),
        );
        void queryClient.invalidateQueries({ queryKey: ["import-history"] });
        void queryClient.invalidateQueries({ queryKey: ["migration-plan"] });
        const queryKeys =
          variables.entityType === "grant_opportunities"
            ? grantOpportunityImportQueryKeys
            : importEntityQueryKeys[variables.entityType];
        for (const queryKey of queryKeys) {
          void queryClient.invalidateQueries({ queryKey });
        }
      },
      onError: (error, variables) => {
        captureEvent("import_failed", {
          entity_type: variables.entityType,
          error_code: error instanceof Error ? "api_error" : "unknown_error",
          total_rows_bucket: getRowCountBucket(variables.rows.length),
        });
        captureAppException(error, {
          tags: {
            feature: "import",
            operation: "commit",
            entity_type: variables.entityType,
          },
          extra: {
            totalRowsBucket: getRowCountBucket(variables.rows.length),
          },
        });
      },
    }),
  };
}
