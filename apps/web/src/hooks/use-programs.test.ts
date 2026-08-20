import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockInvalidateQueries: vi.fn(),
  mockProgramsGet: vi.fn(),
  mockProgramsPost: vi.fn(),
  mockProgramGet: vi.fn(),
  mockProgramPatch: vi.fn(),
  mockProgramDelete: vi.fn(),
  mockBudgetPost: vi.fn(),
  mockBudgetPatch: vi.fn(),
  mockReportGet: vi.fn(),
  mockExportGet: vi.fn(),
  mockGrantAllocationsPut: vi.fn(),
  mockExpenseAllocationsPut: vi.fn(),
  mockCaptureEvent: vi.fn(),
  mockRemoveQueries: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      programs: {
        $get: hoisted.mockProgramsGet,
        $post: hoisted.mockProgramsPost,
        ":programId": {
          $get: hoisted.mockProgramGet,
          $patch: hoisted.mockProgramPatch,
          $delete: hoisted.mockProgramDelete,
        },
        budgets: {
          $post: hoisted.mockBudgetPost,
          ":budgetId": {
            $patch: hoisted.mockBudgetPatch,
          },
        },
        "budget-vs-actual": {
          $get: hoisted.mockReportGet,
          export: {
            $get: hoisted.mockExportGet,
          },
        },
        grants: {
          ":grantId": {
            allocations: {
              $put: hoisted.mockGrantAllocationsPut,
            },
          },
        },
        expenses: {
          ":expenseId": {
            allocations: {
              $put: hoisted.mockExpenseAllocationsPut,
            },
          },
        },
      },
    },
  },
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: (...args: unknown[]) => hoisted.mockCaptureEvent(...args),
}));

vi.mock("../lib/mutation-error", () => ({
  onMutationError: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: hoisted.mockInvalidateQueries,
    removeQueries: hoisted.mockRemoveQueries,
  })),
}));

import { useMutation, useQuery } from "@tanstack/react-query";
import { onMutationError } from "../lib/mutation-error";
import {
  useCreateProgram,
  useCreateProgramBudget,
  useExportProgramBudgetVsActual,
  useProgram,
  useProgramBudgetVsActual,
  useProgramMutations,
  useUpdateProgramBudget,
  usePrograms,
  useReplaceExpenseProgramAllocations,
  useReplaceGrantProgramAllocations,
} from "./use-programs";

function captureQueryFn() {
  const call = vi.mocked(useQuery).mock.calls.at(-1)?.[0];
  return (call as unknown as { queryFn: () => Promise<unknown> }).queryFn;
}

function captureMutationFn<TInput>() {
  const call = vi.mocked(useMutation).mock.calls.at(-1)?.[0];
  return (call as { mutationFn: (input: TInput) => Promise<unknown> }).mutationFn;
}

function captureMutationFnAt<TInput>(index: number) {
  const call = vi.mocked(useMutation).mock.calls[index]?.[0];
  return (call as { mutationFn: (input: TInput) => Promise<unknown> }).mutationFn;
}

function captureOnSuccess() {
  const call = vi.mocked(useMutation).mock.calls.at(-1)?.[0];
  return (call as { onSuccess: () => void }).onSuccess;
}

function captureOnError() {
  const call = vi.mocked(useMutation).mock.calls.at(-1)?.[0];
  return (call as { onError: (error: unknown) => void }).onError;
}

function captureOnSuccessAt<TVariables>(index: number) {
  const call = vi.mocked(useMutation).mock.calls[index]?.[0];
  return (call as { onSuccess: (data: unknown, variables: TVariables) => void }).onSuccess;
}

describe("use-programs hooks", () => {
  beforeEach(() => {
    vi.mocked(useQuery).mockClear();
    vi.mocked(useMutation).mockClear();
    hoisted.mockInvalidateQueries.mockClear();
    hoisted.mockRemoveQueries.mockClear();
    hoisted.mockCaptureEvent.mockClear();
    for (const mock of [
      hoisted.mockProgramsGet,
      hoisted.mockProgramsPost,
      hoisted.mockProgramGet,
      hoisted.mockProgramPatch,
      hoisted.mockProgramDelete,
      hoisted.mockBudgetPost,
      hoisted.mockBudgetPatch,
      hoisted.mockReportGet,
      hoisted.mockExportGet,
      hoisted.mockGrantAllocationsPut,
      hoisted.mockExpenseAllocationsPut,
    ]) {
      mock.mockReset();
      mock.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({ id: "ok" }) });
    }
  });

  it("loads programs with filters", async () => {
    usePrograms({
      page: 1,
      pageSize: 25,
      search: "health",
      status: "active",
      sortBy: "updatedAt",
      sortOrder: "desc",
    });

    await captureQueryFn()();

    expect(hoisted.mockProgramsGet).toHaveBeenCalledWith({
      query: {
        page: "1",
        pageSize: "25",
        search: "health",
        status: "active",
        sortBy: "updatedAt",
        sortOrder: "desc",
      },
    });

    usePrograms({
      page: 1,
      pageSize: 10,
      sortBy: "name",
      sortOrder: "asc",
    });
    await captureQueryFn()();
    expect(hoisted.mockProgramsGet).toHaveBeenLastCalledWith({
      query: {
        page: "1",
        pageSize: "10",
        sortBy: "name",
        sortOrder: "asc",
      },
    });
  });

  it("loads detail and budget-vs-actual previews", async () => {
    useProgram("program-1");
    await captureQueryFn()();
    expect(hoisted.mockProgramGet).toHaveBeenCalledWith({ param: { programId: "program-1" } });

    useProgramBudgetVsActual({
      programId: "program-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    });
    await captureQueryFn()();
    expect(hoisted.mockReportGet).toHaveBeenCalledWith({
      query: {
        programId: "program-1",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
      },
    });

    useProgramBudgetVsActual({
      grantId: "grant-1",
      fundId: "fund-1",
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    });
    await captureQueryFn()();
    expect(hoisted.mockReportGet).toHaveBeenLastCalledWith({
      query: {
        grantId: "grant-1",
        fundId: "fund-1",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
      },
    });
  });

  it("creates programs and invalidates program queries", async () => {
    useCreateProgram();
    await captureMutationFn<{ name: string }>()({ name: "Health" });
    captureOnSuccess()();

    expect(hoisted.mockProgramsPost).toHaveBeenCalledWith({ json: { name: "Health" } });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("program_created");
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["programs"] });
  });

  it("tracks program operation failures without raw error text", () => {
    useCreateProgram();
    const onError = captureOnError();
    onError(new Error("Name is required"));
    onError(new Error("Permission denied"));
    onError(new Error("Program not found"));
    onError(new Error("Network request failed"));
    onError("bad");

    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("program_operation_failed", {
      operation: "create_program",
      failure_type: "validation",
    });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("program_operation_failed", {
      operation: "create_program",
      failure_type: "permission",
    });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("program_operation_failed", {
      operation: "create_program",
      failure_type: "not_found",
    });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("program_operation_failed", {
      operation: "create_program",
      failure_type: "network",
    });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("program_operation_failed", {
      operation: "create_program",
      failure_type: "unknown",
    });
    expect(hoisted.mockCaptureEvent).not.toHaveBeenCalledWith(
      "program_operation_failed",
      expect.objectContaining({ message: expect.any(String) }),
    );
    expect(onMutationError).toHaveBeenCalled();
  });

  it("updates and archives a program", async () => {
    useProgramMutations("program-1");

    await captureMutationFnAt<{ name: string }>(0)({ name: "Health Access" });
    captureOnSuccessAt(0)(undefined, { name: "Health Access" });
    expect(hoisted.mockProgramPatch).toHaveBeenCalledWith({
      param: { programId: "program-1" },
      json: { name: "Health Access" },
    });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("program_updated");
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["program", "program-1"],
    });
    // The program's name is denormalized into the grant detail view — each
    // grant/expense allocation renders allocation.program.name from the embedded
    // ["grant", id] query (getGrant joins programAllocations.program). Renaming a
    // program must refresh the grant caches too, or the grant detail page keeps
    // showing the old program name until a full reload.
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant"] });

    await captureMutationFnAt<void>(1)(undefined);
    captureOnSuccessAt(1)(undefined, undefined);
    expect(hoisted.mockProgramDelete).toHaveBeenCalledWith({ param: { programId: "program-1" } });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("program_archived");
    expect(hoisted.mockRemoveQueries).toHaveBeenCalledWith({
      queryKey: ["program", "program-1"],
    });
  });

  it("refreshes grant detail caches when archiving a program", async () => {
    useProgramMutations("program-1");

    await captureMutationFnAt<void>(1)(undefined);
    captureOnSuccessAt(1)(undefined, undefined);

    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("program_archived");
    expect(hoisted.mockRemoveQueries).toHaveBeenCalledWith({
      queryKey: ["program", "program-1"],
    });
    // Archiving a program soft-deletes it, and getGrant filters out allocations
    // whose program.deletedAt is set — so a co-allocated grant's detail page
    // keeps showing the archived program's allocation row (allocation.program.name)
    // from the embedded ["grant", id] query until a reload. Archive must refresh
    // the grant caches too, matching the rename path (updateProgram).
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ["grant"] });
  });

  it("creates and updates program budgets", async () => {
    useCreateProgramBudget();
    await captureMutationFn<{
      programId: string;
      name: string;
      periodStart: string;
      periodEnd: string;
    }>()({
      programId: "program-1",
      name: "FY 2027",
      periodStart: "2026-07-01",
      periodEnd: "2027-06-30",
    });
    captureOnSuccessAt<{
      programId: string;
      name: string;
      periodStart: string;
      periodEnd: string;
    }>(0)(undefined, {
      programId: "program-1",
      name: "FY 2027",
      periodStart: "2026-07-01",
      periodEnd: "2027-06-30",
    });

    expect(hoisted.mockBudgetPost).toHaveBeenCalledWith({
      json: {
        programId: "program-1",
        name: "FY 2027",
        periodStart: "2026-07-01",
        periodEnd: "2027-06-30",
      },
    });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("program_budget_created");
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["program", "program-1"],
    });

    vi.mocked(useMutation).mockClear();
    useUpdateProgramBudget("budget-1", "program-1");
    await captureMutationFn<{ name: string }>()({ name: "Board approved" });
    captureOnSuccess()();

    expect(hoisted.mockBudgetPatch).toHaveBeenCalledWith({
      param: { budgetId: "budget-1" },
      json: { name: "Board approved" },
    });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("program_budget_updated");
  });

  it("exports budget-vs-actual csv with optional dimensions", async () => {
    hoisted.mockExportGet.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue("csv"),
    });

    useExportProgramBudgetVsActual();
    await expect(
      captureMutationFn<{
        programId: string;
        grantId: string;
        fundId: string;
        periodStart: string;
        periodEnd: string;
      }>()({
        programId: "program-1",
        grantId: "grant-1",
        fundId: "fund-1",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
      }),
    ).resolves.toBe("csv");
    captureOnSuccess()();

    expect(hoisted.mockExportGet).toHaveBeenCalledWith({
      query: {
        programId: "program-1",
        grantId: "grant-1",
        fundId: "fund-1",
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        format: "csv",
      },
    });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("program_budget_vs_actual_exported");

    hoisted.mockExportGet.mockResolvedValueOnce({
      ok: true,
      text: vi.fn().mockResolvedValue("csv"),
    });
    await captureMutationFn<{
      periodStart: string;
      periodEnd: string;
    }>()({
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    });

    expect(hoisted.mockExportGet).toHaveBeenLastCalledWith({
      query: {
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        format: "csv",
      },
    });
  });

  it("rejects failed budget-vs-actual exports without firing success analytics", async () => {
    hoisted.mockExportGet.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({ error: "Audit-Ready plan required" }),
    });

    useExportProgramBudgetVsActual();

    await expect(
      captureMutationFn<{
        periodStart: string;
        periodEnd: string;
      }>()({
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
      }),
    ).rejects.toThrow("Audit-Ready plan required");

    expect(hoisted.mockCaptureEvent).not.toHaveBeenCalledWith("program_budget_vs_actual_exported");
  });

  it("replaces grant and expense allocations through program endpoints", async () => {
    useReplaceGrantProgramAllocations("grant-1");
    await captureMutationFn<{ grantId: string; allocations: [] }>()({
      grantId: "grant-1",
      allocations: [],
    });
    captureOnSuccess()();
    expect(hoisted.mockGrantAllocationsPut).toHaveBeenCalledWith({
      param: { grantId: "grant-1" },
      json: { grantId: "grant-1", allocations: [] },
    });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("grant_program_allocations_replaced");
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["grant", "grant-1"],
    });
    // Replacing a grant's program allocations changes each affected program's
    // grantAllocations list, which the program detail page renders as a count
    // tile from ["program", id]. The mutation doesn't carry the program ids, so
    // the whole ["program"] prefix must refresh or the tile shows a stale count.
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["program"],
    });

    useReplaceExpenseProgramAllocations("expense-1", "grant-2");
    await captureMutationFn<{ expenseId: string; allocations: [] }>()({
      expenseId: "expense-1",
      allocations: [],
    });
    captureOnSuccess()();
    expect(hoisted.mockExpenseAllocationsPut).toHaveBeenCalledWith({
      param: { expenseId: "expense-1" },
      json: { expenseId: "expense-1", allocations: [] },
    });
    expect(hoisted.mockCaptureEvent).toHaveBeenCalledWith("expense_program_allocations_replaced");
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["grant", "grant-2"],
    });
    // Replacing an expense's program allocations changes each affected program's
    // expenseAllocations list, also rendered as a count tile on the program
    // detail page, so the ["program"] prefix must refresh here too.
    expect(hoisted.mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ["program"],
    });
  });

  it("skips grant invalidation for expense allocations when no grant id is supplied", async () => {
    useReplaceExpenseProgramAllocations("expense-9");
    await captureMutationFn<{ expenseId: string; allocations: [] }>()({
      expenseId: "expense-9",
      allocations: [],
    });
    captureOnSuccess()();
    expect(hoisted.mockInvalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ["grant", undefined],
    });
  });
});
