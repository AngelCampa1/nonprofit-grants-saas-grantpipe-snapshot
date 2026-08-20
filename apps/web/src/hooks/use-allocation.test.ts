import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const hoisted = vi.hoisted(() => ({
  mockBasesGet: vi.fn(),
  mockBaseIdGet: vi.fn(),
  mockBaseIdPatch: vi.fn(),
  mockBaseIdDelete: vi.fn(),
  mockBasesPost: vi.fn(),
  mockTargetsGet: vi.fn(),
  mockTargetsPut: vi.fn(),
  mockRulesGet: vi.fn(),
  mockRulesPost: vi.fn(),
  mockRuleIdPatch: vi.fn(),
  mockRuleIdDelete: vi.fn(),
  mockFunctionalExpensesGet: vi.fn(),
}));

vi.mock("../lib/api-client", () => ({
  api: {
    api: {
      allocation: {
        bases: {
          $get: hoisted.mockBasesGet,
          $post: hoisted.mockBasesPost,
          ":id": {
            $get: hoisted.mockBaseIdGet,
            $patch: hoisted.mockBaseIdPatch,
            $delete: hoisted.mockBaseIdDelete,
            targets: {
              $get: hoisted.mockTargetsGet,
              $put: hoisted.mockTargetsPut,
            },
          },
        },
        rules: {
          $get: hoisted.mockRulesGet,
          $post: hoisted.mockRulesPost,
          ":id": {
            $patch: hoisted.mockRuleIdPatch,
            $delete: hoisted.mockRuleIdDelete,
          },
        },
        "functional-expenses": {
          $get: hoisted.mockFunctionalExpensesGet,
        },
      },
    },
  },
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(),
  useMutation: vi.fn(),
  useQueryClient: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("../lib/mutation-error", () => ({
  onMutationError: vi.fn(),
}));

vi.mock("../lib/http-response", () => ({
  readResponseOrThrow: vi.fn(),
  ApiError: class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  },
}));

vi.mock("../lib/analytics", () => ({
  captureEvent: vi.fn(),
}));

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import { onMutationError } from "../lib/mutation-error";
import { readResponseOrThrow } from "../lib/http-response";
import { captureEvent } from "../lib/analytics";
import {
  allocationKeys,
  useAllocationBases,
  useAllocationBase,
  useAllocationTargets,
  useAllocationRules,
  useAllocatedFunctionalExpenses,
  useCreateAllocationBase,
  useUpdateAllocationBase,
  useDeleteAllocationBase,
  useSetAllocationTargets,
  useCreateAllocationRule,
  useUpdateAllocationRule,
  useDeleteAllocationRule,
} from "./use-allocation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function captureQueryFn() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (call as unknown as { queryFn: () => Promise<unknown> }).queryFn;
}

function captureQueryKey() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (call as unknown as { queryKey: unknown[] }).queryKey;
}

function captureQueryEnabled() {
  const call = vi.mocked(useQuery).mock.calls[0]?.[0];
  return (call as unknown as { enabled?: boolean }).enabled;
}

function captureMutationFn() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (call as unknown as { mutationFn: (data: unknown) => Promise<unknown> }).mutationFn;
}

function captureMutationOnSuccess() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (call as unknown as { onSuccess: (data: unknown, variables: unknown) => void }).onSuccess;
}

function captureMutationOnError() {
  const call = vi.mocked(useMutation).mock.calls[0]?.[0];
  return (call as unknown as { onError: (error: unknown) => void }).onError;
}

const MOCK_BASE = {
  id: "b1",
  orgId: "org1",
  name: "Headcount",
  description: null,
  method: "headcount_fte",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
};

const MOCK_TARGET = {
  id: "t1",
  orgId: "org1",
  baseId: "b1",
  functionalClass: "program",
  programId: null,
  label: null,
  weightBasisPoints: 10000,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const MOCK_RULE = {
  id: "r1",
  orgId: "org1",
  accountId: "acc1",
  baseId: "b1",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
};

// ---------------------------------------------------------------------------
// allocationKeys
// ---------------------------------------------------------------------------

describe("allocationKeys", () => {
  it("all returns correct key", () => {
    expect(allocationKeys.all()).toEqual(["allocation"]);
  });
  it("bases returns correct key", () => {
    expect(allocationKeys.bases()).toEqual(["allocation", "bases"]);
  });
  it("base returns correct key", () => {
    expect(allocationKeys.base("b1")).toEqual(["allocation", "bases", "b1"]);
  });
  it("targets returns correct key", () => {
    expect(allocationKeys.targets("b1")).toEqual(["allocation", "bases", "b1", "targets"]);
  });
  it("rules returns correct key", () => {
    expect(allocationKeys.rules()).toEqual(["allocation", "rules"]);
  });
  it("functionalExpenses returns correct key", () => {
    expect(allocationKeys.functionalExpenses("2026-01-01", "2026-12-31")).toEqual([
      "allocation",
      "functional-expenses",
      "2026-01-01",
      "2026-12-31",
    ]);
  });

  it("functionalExpensesAll returns the report query family", () => {
    expect(allocationKeys.functionalExpensesAll()).toEqual(["allocation", "functional-expenses"]);
  });
});

// ---------------------------------------------------------------------------
// useAllocationBases
// ---------------------------------------------------------------------------

describe("useAllocationBases", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({ data: [MOCK_BASE] } as never);
  });

  it("calls useQuery with correct key", () => {
    useAllocationBases();
    expect(captureQueryKey()).toEqual(["allocation", "bases"]);
  });

  it("queryFn calls bases.$get and returns data", async () => {
    useAllocationBases();
    vi.mocked(readResponseOrThrow).mockResolvedValueOnce([MOCK_BASE]);
    hoisted.mockBasesGet.mockResolvedValueOnce({});
    const fn = captureQueryFn();
    const result = await fn();
    expect(result).toEqual([MOCK_BASE]);
  });
});

// ---------------------------------------------------------------------------
// useAllocationBase
// ---------------------------------------------------------------------------

describe("useAllocationBase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({ data: MOCK_BASE } as never);
  });

  it("calls useQuery with correct key and id", () => {
    useAllocationBase("b1");
    expect(captureQueryKey()).toEqual(["allocation", "bases", "b1"]);
  });

  it("enabled is true when id provided", () => {
    useAllocationBase("b1");
    expect(captureQueryEnabled()).toBe(true);
  });

  it("enabled is false when id is empty", () => {
    useAllocationBase("");
    expect(captureQueryEnabled()).toBe(false);
  });

  it("queryFn calls bases[:id].$get and returns data", async () => {
    useAllocationBase("b1");
    vi.mocked(readResponseOrThrow).mockResolvedValueOnce(MOCK_BASE);
    hoisted.mockBaseIdGet.mockResolvedValueOnce({});
    const fn = captureQueryFn();
    const result = await fn();
    expect(result).toEqual(MOCK_BASE);
    expect(hoisted.mockBaseIdGet).toHaveBeenCalledWith({ param: { id: "b1" } });
  });
});

// ---------------------------------------------------------------------------
// useAllocationTargets
// ---------------------------------------------------------------------------

describe("useAllocationTargets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({ data: [MOCK_TARGET] } as never);
  });

  it("calls useQuery with correct key", () => {
    useAllocationTargets("b1");
    expect(captureQueryKey()).toEqual(["allocation", "bases", "b1", "targets"]);
  });

  it("enabled is true when baseId provided", () => {
    useAllocationTargets("b1");
    expect(captureQueryEnabled()).toBe(true);
  });

  it("enabled is false when baseId is empty", () => {
    useAllocationTargets("");
    expect(captureQueryEnabled()).toBe(false);
  });

  it("queryFn calls targets.$get and returns data", async () => {
    useAllocationTargets("b1");
    vi.mocked(readResponseOrThrow).mockResolvedValueOnce([MOCK_TARGET]);
    hoisted.mockTargetsGet.mockResolvedValueOnce({});
    const fn = captureQueryFn();
    const result = await fn();
    expect(result).toEqual([MOCK_TARGET]);
  });
});

// ---------------------------------------------------------------------------
// useAllocationRules
// ---------------------------------------------------------------------------

describe("useAllocationRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({ data: [MOCK_RULE] } as never);
  });

  it("calls useQuery with correct key", () => {
    useAllocationRules();
    expect(captureQueryKey()).toEqual(["allocation", "rules"]);
  });

  it("queryFn calls rules.$get and returns data", async () => {
    useAllocationRules();
    vi.mocked(readResponseOrThrow).mockResolvedValueOnce([MOCK_RULE]);
    hoisted.mockRulesGet.mockResolvedValueOnce({});
    const fn = captureQueryFn();
    const result = await fn();
    expect(result).toEqual([MOCK_RULE]);
  });
});

// ---------------------------------------------------------------------------
// useAllocatedFunctionalExpenses
// ---------------------------------------------------------------------------

describe("useAllocatedFunctionalExpenses", () => {
  const MOCK_SFE = {
    rows: [
      {
        accountId: "acc1",
        name: "Salaries",
        program: 7000,
        management: 2000,
        fundraising: 1000,
        total: 10000,
      },
    ],
    totals: { program: 7000, management: 2000, fundraising: 1000, total: 10000 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQuery).mockReturnValue({ data: MOCK_SFE } as never);
  });

  it("calls useQuery with correct key", () => {
    useAllocatedFunctionalExpenses("2026-01-01", "2026-12-31");
    expect(captureQueryKey()).toEqual([
      "allocation",
      "functional-expenses",
      "2026-01-01",
      "2026-12-31",
    ]);
  });

  it("enabled is true when from and to are provided", () => {
    useAllocatedFunctionalExpenses("2026-01-01", "2026-12-31");
    expect(captureQueryEnabled()).toBe(true);
  });

  it("enabled is false when from is empty", () => {
    useAllocatedFunctionalExpenses("", "2026-12-31");
    expect(captureQueryEnabled()).toBe(false);
  });

  it("enabled is false when to is empty", () => {
    useAllocatedFunctionalExpenses("2026-01-01", "");
    expect(captureQueryEnabled()).toBe(false);
  });

  it("queryFn calls functional-expenses.$get and returns data", async () => {
    useAllocatedFunctionalExpenses("2026-01-01", "2026-12-31");
    vi.mocked(readResponseOrThrow).mockResolvedValueOnce(MOCK_SFE);
    hoisted.mockFunctionalExpensesGet.mockResolvedValueOnce({});
    const fn = captureQueryFn();
    const result = await fn();
    expect(result).toEqual(MOCK_SFE);
  });
});

// ---------------------------------------------------------------------------
// useCreateAllocationBase
// ---------------------------------------------------------------------------

describe("useCreateAllocationBase", () => {
  const mockInvalidate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQueryClient).mockReturnValue({
      invalidateQueries: mockInvalidate,
    } as never);
    vi.mocked(useMutation).mockReturnValue({} as never);
  });

  it("mutationFn calls bases.$post and returns data", async () => {
    useCreateAllocationBase();
    vi.mocked(readResponseOrThrow).mockResolvedValueOnce(MOCK_BASE);
    hoisted.mockBasesPost.mockResolvedValueOnce({});
    const fn = captureMutationFn();
    const result = await fn({ name: "X", method: "headcount_fte" });
    expect(result).toEqual(MOCK_BASE);
  });

  it("onSuccess invalidates bases and shows toast", () => {
    useCreateAllocationBase();
    const onSuccess = captureMutationOnSuccess();
    onSuccess(MOCK_BASE, undefined);
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["allocation", "bases"] });
    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["allocation", "functional-expenses"],
    });
    expect(toast.success).toHaveBeenCalledWith("Allocation base created");
  });

  it("onSuccess captures allocationBaseCreated event with base_id", () => {
    useCreateAllocationBase();
    const onSuccess = captureMutationOnSuccess();
    onSuccess(MOCK_BASE, undefined);
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.allocationBaseCreated,
      expect.objectContaining({
        entity_type: "allocation_base",
        base_id: MOCK_BASE.id,
      }),
    );
  });

  it("onError calls onMutationError", () => {
    useCreateAllocationBase();
    const onError = captureMutationOnError();
    const err = new Error("fail");
    onError(err);
    expect(onMutationError).toHaveBeenCalledWith(err);
  });
});

// ---------------------------------------------------------------------------
// useUpdateAllocationBase
// ---------------------------------------------------------------------------

describe("useUpdateAllocationBase", () => {
  const mockInvalidate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQueryClient).mockReturnValue({
      invalidateQueries: mockInvalidate,
    } as never);
    vi.mocked(useMutation).mockReturnValue({} as never);
  });

  it("mutationFn calls bases[:id].$patch and returns data", async () => {
    useUpdateAllocationBase();
    vi.mocked(readResponseOrThrow).mockResolvedValueOnce(MOCK_BASE);
    hoisted.mockBaseIdPatch.mockResolvedValueOnce({});
    const fn = captureMutationFn();
    const result = await fn({ id: "b1", data: { name: "Updated" } });
    expect(result).toEqual(MOCK_BASE);
    expect(hoisted.mockBaseIdPatch).toHaveBeenCalledWith({
      param: { id: "b1" },
      json: { name: "Updated" },
    });
  });

  it("onSuccess invalidates bases and base detail", () => {
    useUpdateAllocationBase();
    const onSuccess = captureMutationOnSuccess();
    onSuccess(MOCK_BASE, { id: "b1", data: {} });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["allocation", "bases"] });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["allocation", "bases", "b1"] });
    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["allocation", "functional-expenses"],
    });
    expect(toast.success).toHaveBeenCalledWith("Allocation base updated");
  });

  it("onSuccess captures allocationBaseUpdated event with base_id from variables", () => {
    useUpdateAllocationBase();
    const onSuccess = captureMutationOnSuccess();
    onSuccess(MOCK_BASE, { id: "b1", data: {} });
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.allocationBaseUpdated,
      expect.objectContaining({
        entity_type: "allocation_base",
        base_id: "b1",
      }),
    );
  });

  it("onError calls onMutationError", () => {
    useUpdateAllocationBase();
    const onError = captureMutationOnError();
    const err = new Error("fail");
    onError(err);
    expect(onMutationError).toHaveBeenCalledWith(err);
  });
});

// ---------------------------------------------------------------------------
// useDeleteAllocationBase
// ---------------------------------------------------------------------------

describe("useDeleteAllocationBase", () => {
  const mockInvalidate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQueryClient).mockReturnValue({
      invalidateQueries: mockInvalidate,
    } as never);
    vi.mocked(useMutation).mockReturnValue({} as never);
  });

  it("mutationFn calls bases[:id].$delete", async () => {
    useDeleteAllocationBase();
    vi.mocked(readResponseOrThrow).mockResolvedValueOnce({ success: true });
    hoisted.mockBaseIdDelete.mockResolvedValueOnce({});
    const fn = captureMutationFn();
    await fn("b1");
    expect(hoisted.mockBaseIdDelete).toHaveBeenCalledWith({ param: { id: "b1" } });
  });

  it("onSuccess invalidates bases and shows toast", () => {
    useDeleteAllocationBase();
    const onSuccess = captureMutationOnSuccess();
    onSuccess(undefined, "b1");
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["allocation", "bases"] });
    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["allocation", "functional-expenses"],
    });
    expect(toast.success).toHaveBeenCalledWith("Allocation base deleted");
  });

  it("onSuccess captures allocationBaseDeleted event with base_id from variables", () => {
    useDeleteAllocationBase();
    const onSuccess = captureMutationOnSuccess();
    onSuccess(undefined, "b1");
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.allocationBaseDeleted,
      expect.objectContaining({
        entity_type: "allocation_base",
        base_id: "b1",
      }),
    );
  });

  it("onError calls onMutationError", () => {
    useDeleteAllocationBase();
    const onError = captureMutationOnError();
    onError(new Error("oops"));
    expect(onMutationError).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useSetAllocationTargets
// ---------------------------------------------------------------------------

describe("useSetAllocationTargets", () => {
  const mockInvalidate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQueryClient).mockReturnValue({
      invalidateQueries: mockInvalidate,
    } as never);
    vi.mocked(useMutation).mockReturnValue({} as never);
  });

  it("mutationFn calls targets.$put and returns data", async () => {
    useSetAllocationTargets();
    vi.mocked(readResponseOrThrow).mockResolvedValueOnce([MOCK_TARGET]);
    hoisted.mockTargetsPut.mockResolvedValueOnce({});
    const fn = captureMutationFn();
    const input = {
      baseId: "b1",
      data: { targets: [{ functionalClass: "program" as const, weightBasisPoints: 10000 }] },
    };
    const result = await fn(input);
    expect(result).toEqual([MOCK_TARGET]);
    expect(hoisted.mockTargetsPut).toHaveBeenCalledWith({
      param: { id: "b1" },
      json: input.data,
    });
  });

  it("onSuccess invalidates targets and all allocation keys", () => {
    useSetAllocationTargets();
    const onSuccess = captureMutationOnSuccess();
    onSuccess([MOCK_TARGET], { baseId: "b1", data: { targets: [] } });
    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["allocation", "bases", "b1", "targets"],
    });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["allocation"] });
    expect(toast.success).toHaveBeenCalledWith("Targets saved");
  });

  it("onSuccess captures allocationTargetsSet event with base_id and target_count", () => {
    useSetAllocationTargets();
    const onSuccess = captureMutationOnSuccess();
    const targets = [
      { functionalClass: "program" as const, weightBasisPoints: 5000 },
      { functionalClass: "management" as const, weightBasisPoints: 5000 },
    ];
    onSuccess([MOCK_TARGET], { baseId: "b1", data: { targets } });
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.allocationTargetsSet,
      expect.objectContaining({
        entity_type: "allocation_base",
        base_id: "b1",
        target_count: 2,
      }),
    );
  });

  it("onError calls onMutationError", () => {
    useSetAllocationTargets();
    const onError = captureMutationOnError();
    onError(new Error("fail"));
    expect(onMutationError).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useCreateAllocationRule
// ---------------------------------------------------------------------------

describe("useCreateAllocationRule", () => {
  const mockInvalidate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQueryClient).mockReturnValue({
      invalidateQueries: mockInvalidate,
    } as never);
    vi.mocked(useMutation).mockReturnValue({} as never);
  });

  it("mutationFn calls rules.$post and returns data", async () => {
    useCreateAllocationRule();
    vi.mocked(readResponseOrThrow).mockResolvedValueOnce(MOCK_RULE);
    hoisted.mockRulesPost.mockResolvedValueOnce({});
    const fn = captureMutationFn();
    const result = await fn({ accountId: "acc1", baseId: "b1" });
    expect(result).toEqual(MOCK_RULE);
  });

  it("onSuccess invalidates rules and shows toast", () => {
    useCreateAllocationRule();
    const onSuccess = captureMutationOnSuccess();
    onSuccess(MOCK_RULE, undefined);
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["allocation", "rules"] });
    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["allocation", "functional-expenses"],
    });
    expect(toast.success).toHaveBeenCalledWith("Account bound to allocation base");
  });

  it("onSuccess captures allocationRuleCreated event with rule_id", () => {
    useCreateAllocationRule();
    const onSuccess = captureMutationOnSuccess();
    onSuccess(MOCK_RULE, undefined);
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.allocationRuleCreated,
      expect.objectContaining({
        entity_type: "allocation_rule",
        rule_id: MOCK_RULE.id,
      }),
    );
  });

  it("onError calls onMutationError", () => {
    useCreateAllocationRule();
    const onError = captureMutationOnError();
    onError(new Error("fail"));
    expect(onMutationError).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useUpdateAllocationRule
// ---------------------------------------------------------------------------

describe("useUpdateAllocationRule", () => {
  const mockInvalidate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQueryClient).mockReturnValue({
      invalidateQueries: mockInvalidate,
    } as never);
    vi.mocked(useMutation).mockReturnValue({} as never);
  });

  it("mutationFn calls rules[:id].$patch and returns data", async () => {
    useUpdateAllocationRule();
    vi.mocked(readResponseOrThrow).mockResolvedValueOnce(MOCK_RULE);
    hoisted.mockRuleIdPatch.mockResolvedValueOnce({});
    const fn = captureMutationFn();
    const result = await fn({ id: "r1", data: { status: "inactive" } });
    expect(result).toEqual(MOCK_RULE);
    expect(hoisted.mockRuleIdPatch).toHaveBeenCalledWith({
      param: { id: "r1" },
      json: { status: "inactive" },
    });
  });

  it("onSuccess invalidates rules and shows toast", () => {
    useUpdateAllocationRule();
    const onSuccess = captureMutationOnSuccess();
    onSuccess(MOCK_RULE, { id: "r1", data: {} });
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["allocation", "rules"] });
    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["allocation", "functional-expenses"],
    });
    expect(toast.success).toHaveBeenCalledWith("Rule updated");
  });

  it("onSuccess captures allocationRuleUpdated event with rule_id from variables", () => {
    useUpdateAllocationRule();
    const onSuccess = captureMutationOnSuccess();
    onSuccess(MOCK_RULE, { id: "r1", data: {} });
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.allocationRuleUpdated,
      expect.objectContaining({
        entity_type: "allocation_rule",
        rule_id: "r1",
      }),
    );
  });

  it("onError calls onMutationError", () => {
    useUpdateAllocationRule();
    const onError = captureMutationOnError();
    onError(new Error("fail"));
    expect(onMutationError).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// useDeleteAllocationRule
// ---------------------------------------------------------------------------

describe("useDeleteAllocationRule", () => {
  const mockInvalidate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQueryClient).mockReturnValue({
      invalidateQueries: mockInvalidate,
    } as never);
    vi.mocked(useMutation).mockReturnValue({} as never);
  });

  it("mutationFn calls rules[:id].$delete", async () => {
    useDeleteAllocationRule();
    vi.mocked(readResponseOrThrow).mockResolvedValueOnce({ success: true });
    hoisted.mockRuleIdDelete.mockResolvedValueOnce({});
    const fn = captureMutationFn();
    await fn("r1");
    expect(hoisted.mockRuleIdDelete).toHaveBeenCalledWith({ param: { id: "r1" } });
  });

  it("onSuccess invalidates rules and shows toast", () => {
    useDeleteAllocationRule();
    const onSuccess = captureMutationOnSuccess();
    onSuccess(undefined, "r1");
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ["allocation", "rules"] });
    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ["allocation", "functional-expenses"],
    });
    expect(toast.success).toHaveBeenCalledWith("Rule deleted");
  });

  it("onSuccess captures allocationRuleDeleted event with rule_id from variables", () => {
    useDeleteAllocationRule();
    const onSuccess = captureMutationOnSuccess();
    onSuccess(undefined, "r1");
    expect(captureEvent).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.allocationRuleDeleted,
      expect.objectContaining({
        entity_type: "allocation_rule",
        rule_id: "r1",
      }),
    );
  });

  it("onError calls onMutationError", () => {
    useDeleteAllocationRule();
    const onError = captureMutationOnError();
    onError(new Error("fail"));
    expect(onMutationError).toHaveBeenCalled();
  });
});
