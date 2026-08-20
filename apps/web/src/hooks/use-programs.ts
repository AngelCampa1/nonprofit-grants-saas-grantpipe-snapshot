import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ExpenseProgramAllocationReplaceInput,
  GrantProgramAllocationReplaceInput,
  ProgramBudgetCreateInput,
  ProgramBudgetUpdateInput,
  ProgramBudgetVsActualQuery,
  ProgramCreateInput,
  ProgramListQuery,
  ProgramUpdateInput,
} from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { captureEvent } from "../lib/analytics";
import { readResponseOrThrow, throwIfNotOk } from "../lib/http-response";
import { onMutationError } from "../lib/mutation-error";

const programs = api.api.programs;

function invalidatePrograms(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ["programs"] });
  void queryClient.invalidateQueries({ queryKey: ["program-budget-vs-actual"] });
  // Replacing grant/expense program allocations rewrites each affected program's
  // grantAllocations/expenseAllocations rows, which the program detail page
  // renders as count tiles from ["program", id]. These mutations don't carry the
  // affected program ids, so refresh the whole ["program"] prefix or the detail
  // tiles show stale counts after the user navigates there.
  void queryClient.invalidateQueries({ queryKey: ["program"] });
}

function invalidateProgram(queryClient: ReturnType<typeof useQueryClient>, programId: string) {
  void queryClient.invalidateQueries({ queryKey: ["program", programId] });
  invalidatePrograms(queryClient);
  // The program's name is denormalized into the grant detail view — getGrant
  // joins programAllocations.program (and each expense's programAllocations),
  // so the grant detail page renders allocation.program.name from the embedded
  // ["grant", id] query. Renaming (or removing) a program must refresh the grant
  // caches too, or every co-allocated grant's detail keeps showing the old
  // program name until a full reload. The ["grant"] prefix covers all open
  // grant detail pages.
  void queryClient.invalidateQueries({ queryKey: ["grant"] });
}

function getFailureType(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";

  const message = error.message.toLowerCase();
  if (message.includes("valid") || message.includes("required")) return "validation";
  if (message.includes("permission") || message.includes("forbidden")) return "permission";
  if (message.includes("not found")) return "not_found";
  if (message.includes("network") || message.includes("fetch")) return "network";
  return "unknown";
}

function handleProgramOperationError(operation: string) {
  return (error: unknown) => {
    captureEvent("program_operation_failed", {
      operation,
      failure_type: getFailureType(error),
    });
    onMutationError(error);
  };
}

export function usePrograms(params: ProgramListQuery) {
  return useQuery({
    queryKey: [
      "programs",
      params.search ?? "",
      params.status ?? "",
      params.page,
      params.pageSize,
      params.sortBy,
      params.sortOrder,
    ],
    queryFn: async () => {
      const res = await programs.$get({
        query: {
          page: String(params.page),
          pageSize: String(params.pageSize),
          sortBy: params.sortBy,
          sortOrder: params.sortOrder,
          ...(params.search ? { search: params.search } : {}),
          ...(params.status ? { status: params.status } : {}),
        },
      });
      return readResponseOrThrow(res);
    },
    placeholderData: keepPreviousData,
  });
}

export function useProgram(programId: string) {
  return useQuery({
    queryKey: ["program", programId],
    queryFn: async () => {
      const res = await programs[":programId"].$get({ param: { programId } });
      return readResponseOrThrow(res);
    },
    enabled: !!programId,
  });
}

export function useCreateProgram() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ProgramCreateInput) => {
      const res = await programs.$post({ json: data as typeof data });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("program_created");
      invalidatePrograms(queryClient);
    },
    onError: handleProgramOperationError("create_program"),
  });
}

export function useProgramMutations(programId: string) {
  const queryClient = useQueryClient();
  return {
    updateProgram: useMutation({
      mutationFn: async (data: ProgramUpdateInput) => {
        const res = await programs[":programId"].$patch({
          param: { programId },
          json: data as typeof data,
        });
        return readResponseOrThrow(res);
      },
      onSuccess: () => {
        captureEvent("program_updated");
        invalidateProgram(queryClient, programId);
      },
      onError: handleProgramOperationError("update_program"),
    }),
    archiveProgram: useMutation({
      mutationFn: async () => {
        const res = await programs[":programId"].$delete({ param: { programId } });
        await throwIfNotOk(res);
      },
      onSuccess: () => {
        captureEvent("program_archived");
        queryClient.removeQueries({ queryKey: ["program", programId] });
        invalidatePrograms(queryClient);
        // Archiving soft-deletes the program, and getGrant filters out
        // allocations whose program.deletedAt is set — so a co-allocated grant's
        // detail page keeps showing the archived program's allocation row
        // (allocation.program.name) from the embedded ["grant", id] query until a
        // reload. Refresh the grant caches too (the rename path does this via
        // invalidateProgram); the ["grant"] prefix covers all open grant details.
        void queryClient.invalidateQueries({ queryKey: ["grant"] });
      },
      onError: handleProgramOperationError("archive_program"),
    }),
  };
}

export function useCreateProgramBudget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ProgramBudgetCreateInput) => {
      const res = await programs.budgets.$post({ json: data as typeof data });
      return readResponseOrThrow(res);
    },
    onSuccess: (_budget, variables) => {
      captureEvent("program_budget_created");
      invalidateProgram(queryClient, variables.programId);
    },
    onError: handleProgramOperationError("create_program_budget"),
  });
}

export function useUpdateProgramBudget(budgetId: string, programId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ProgramBudgetUpdateInput) => {
      const res = await programs.budgets[":budgetId"].$patch({
        param: { budgetId },
        json: data as typeof data,
      });
      return readResponseOrThrow(res);
    },
    onSuccess: () => {
      captureEvent("program_budget_updated");
      invalidateProgram(queryClient, programId);
    },
    onError: handleProgramOperationError("update_program_budget"),
  });
}

export function useProgramBudgetVsActual(params: ProgramBudgetVsActualQuery) {
  return useQuery({
    queryKey: [
      "program-budget-vs-actual",
      params.programId ?? "",
      params.grantId ?? "",
      params.fundId ?? "",
      params.periodStart,
      params.periodEnd,
    ],
    queryFn: async () => {
      const res = await programs["budget-vs-actual"].$get({
        query: {
          periodStart: params.periodStart,
          periodEnd: params.periodEnd,
          ...(params.programId ? { programId: params.programId } : {}),
          ...(params.grantId ? { grantId: params.grantId } : {}),
          ...(params.fundId ? { fundId: params.fundId } : {}),
        },
      });
      return readResponseOrThrow(res);
    },
    placeholderData: keepPreviousData,
  });
}

export function useExportProgramBudgetVsActual() {
  return useMutation({
    mutationFn: async (params: ProgramBudgetVsActualQuery) => {
      const res = await programs["budget-vs-actual"].export.$get({
        query: {
          periodStart: params.periodStart,
          periodEnd: params.periodEnd,
          format: "csv",
          ...(params.programId ? { programId: params.programId } : {}),
          ...(params.grantId ? { grantId: params.grantId } : {}),
          ...(params.fundId ? { fundId: params.fundId } : {}),
        },
      });
      await throwIfNotOk(res);
      return res.text();
    },
    onSuccess: () => captureEvent("program_budget_vs_actual_exported"),
    onError: handleProgramOperationError("export_program_budget_vs_actual"),
  });
}

export function useReplaceGrantProgramAllocations(grantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: GrantProgramAllocationReplaceInput) => {
      const res = await programs.grants[":grantId"].allocations.$put({
        param: { grantId },
        json: data as typeof data,
      });
      return readResponseOrThrow<unknown>(res as never);
    },
    onSuccess: () => {
      captureEvent("grant_program_allocations_replaced");
      void queryClient.invalidateQueries({ queryKey: ["grant", grantId] });
      invalidatePrograms(queryClient);
    },
    onError: handleProgramOperationError("replace_grant_program_allocations"),
  });
}

export function useReplaceExpenseProgramAllocations(expenseId: string, grantId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: ExpenseProgramAllocationReplaceInput) => {
      const res = await programs.expenses[":expenseId"].allocations.$put({
        param: { expenseId },
        json: data as typeof data,
      });
      return readResponseOrThrow<unknown>(res as never);
    },
    onSuccess: () => {
      captureEvent("expense_program_allocations_replaced");
      if (grantId) {
        void queryClient.invalidateQueries({ queryKey: ["grant", grantId] });
      }
      invalidatePrograms(queryClient);
    },
    onError: handleProgramOperationError("replace_expense_program_allocations"),
  });
}
