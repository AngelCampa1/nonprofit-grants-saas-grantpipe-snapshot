import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ANALYTICS_EVENTS } from "@grantpipe/shared";
import type {
  CreateAllocationBaseInput,
  UpdateAllocationBaseInput,
  SetAllocationTargetsInput,
  CreateAllocationRuleInput,
  UpdateAllocationRuleInput,
} from "@grantpipe/shared";
import { api } from "../lib/api-client";
import { captureEvent } from "../lib/analytics";
import { readResponseOrThrow } from "../lib/http-response";
import { onMutationError } from "../lib/mutation-error";

const allocationApi = api.api.allocation;

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const allocationKeys = {
  all: () => ["allocation"] as const,
  bases: () => ["allocation", "bases"] as const,
  base: (id: string) => ["allocation", "bases", id] as const,
  targets: (baseId: string) => ["allocation", "bases", baseId, "targets"] as const,
  rules: () => ["allocation", "rules"] as const,
  functionalExpenses: (from: string, to: string) =>
    ["allocation", "functional-expenses", from, to] as const,
  functionalExpensesAll: () => ["allocation", "functional-expenses"] as const,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AllocationBase = {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  method: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type AllocationTarget = {
  id: string;
  orgId: string;
  baseId: string;
  functionalClass: string;
  programId: string | null;
  label: string | null;
  weightBasisPoints: number;
  createdAt: string;
  updatedAt: string;
};

export type AllocationRule = {
  id: string;
  orgId: string;
  accountId: string;
  baseId: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  accountName?: string;
  baseName?: string;
};

export type AllocatedSFEProgramBreakdown = {
  programId: string | null;
  programName: string;
  amountCents: number;
};

export type AllocatedSFERow = {
  accountId: string;
  name: string;
  program: number;
  management: number;
  fundraising: number;
  total: number;
  programBreakdown?: AllocatedSFEProgramBreakdown[];
};

export type AllocatedSFEResult = {
  rows: AllocatedSFERow[];
  totals: { program: number; management: number; fundraising: number; total: number };
  programBreakdown: AllocatedSFEProgramBreakdown[];
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useAllocationBases() {
  return useQuery({
    queryKey: allocationKeys.bases(),
    queryFn: async (): Promise<AllocationBase[]> => {
      const res = await allocationApi.bases.$get();
      return readResponseOrThrow(res) as Promise<AllocationBase[]>;
    },
  });
}

export function useAllocationBase(id: string) {
  return useQuery({
    queryKey: allocationKeys.base(id),
    enabled: Boolean(id),
    queryFn: async (): Promise<AllocationBase> => {
      const res = await allocationApi.bases[":id"].$get({ param: { id } });
      return readResponseOrThrow(res) as Promise<AllocationBase>;
    },
  });
}

export function useAllocationTargets(baseId: string) {
  return useQuery({
    queryKey: allocationKeys.targets(baseId),
    enabled: Boolean(baseId),
    queryFn: async (): Promise<AllocationTarget[]> => {
      const res = await allocationApi.bases[":id"].targets.$get({ param: { id: baseId } });
      return readResponseOrThrow(res) as Promise<AllocationTarget[]>;
    },
  });
}

export function useAllocationRules() {
  return useQuery({
    queryKey: allocationKeys.rules(),
    queryFn: async (): Promise<AllocationRule[]> => {
      const res = await allocationApi.rules.$get();
      return readResponseOrThrow(res) as Promise<AllocationRule[]>;
    },
  });
}

export function useAllocatedFunctionalExpenses(from: string, to: string) {
  return useQuery({
    queryKey: allocationKeys.functionalExpenses(from, to),
    enabled: Boolean(from) && Boolean(to),
    queryFn: async (): Promise<AllocatedSFEResult> => {
      const res = await allocationApi["functional-expenses"].$get({ query: { from, to } });
      return readResponseOrThrow(res) as Promise<AllocatedSFEResult>;
    },
  });
}

// ---------------------------------------------------------------------------
// Mutations — Bases
// ---------------------------------------------------------------------------

export function useCreateAllocationBase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateAllocationBaseInput): Promise<AllocationBase> => {
      const res = await allocationApi.bases.$post({ json: data as never });
      return readResponseOrThrow(res) as Promise<AllocationBase>;
    },
    onSuccess: (data) => {
      captureEvent(ANALYTICS_EVENTS.allocationBaseCreated, {
        entity_type: "allocation_base",
        base_id: data.id,
      });
      void queryClient.invalidateQueries({ queryKey: allocationKeys.bases() });
      void queryClient.invalidateQueries({ queryKey: allocationKeys.functionalExpensesAll() });
      toast.success("Allocation base created");
    },
    onError: onMutationError,
  });
}

export function useUpdateAllocationBase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateAllocationBaseInput;
    }): Promise<AllocationBase> => {
      const res = await allocationApi.bases[":id"].$patch({ param: { id }, json: data as never });
      return readResponseOrThrow(res) as Promise<AllocationBase>;
    },
    onSuccess: (_data, variables) => {
      captureEvent(ANALYTICS_EVENTS.allocationBaseUpdated, {
        entity_type: "allocation_base",
        base_id: variables.id,
      });
      void queryClient.invalidateQueries({ queryKey: allocationKeys.bases() });
      void queryClient.invalidateQueries({ queryKey: allocationKeys.base(variables.id) });
      void queryClient.invalidateQueries({ queryKey: allocationKeys.functionalExpensesAll() });
      toast.success("Allocation base updated");
    },
    onError: onMutationError,
  });
}

export function useDeleteAllocationBase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await allocationApi.bases[":id"].$delete({ param: { id } });
      await readResponseOrThrow(res);
    },
    onSuccess: (_data, id) => {
      captureEvent(ANALYTICS_EVENTS.allocationBaseDeleted, {
        entity_type: "allocation_base",
        base_id: id,
      });
      void queryClient.invalidateQueries({ queryKey: allocationKeys.bases() });
      void queryClient.invalidateQueries({ queryKey: allocationKeys.functionalExpensesAll() });
      toast.success("Allocation base deleted");
    },
    onError: onMutationError,
  });
}

// ---------------------------------------------------------------------------
// Mutations — Targets
// ---------------------------------------------------------------------------

export function useSetAllocationTargets() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      baseId,
      data,
    }: {
      baseId: string;
      data: SetAllocationTargetsInput;
    }): Promise<AllocationTarget[]> => {
      const res = await allocationApi.bases[":id"].targets.$put({
        param: { id: baseId },
        json: data as never,
      });
      return readResponseOrThrow(res) as Promise<AllocationTarget[]>;
    },
    onSuccess: (_data, variables) => {
      captureEvent(ANALYTICS_EVENTS.allocationTargetsSet, {
        entity_type: "allocation_base",
        base_id: variables.baseId,
        target_count: variables.data.targets.length,
      });
      void queryClient.invalidateQueries({ queryKey: allocationKeys.targets(variables.baseId) });
      void queryClient.invalidateQueries({ queryKey: allocationKeys.all() });
      toast.success("Targets saved");
    },
    onError: onMutationError,
  });
}

// ---------------------------------------------------------------------------
// Mutations — Rules
// ---------------------------------------------------------------------------

export function useCreateAllocationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: CreateAllocationRuleInput): Promise<AllocationRule> => {
      const res = await allocationApi.rules.$post({ json: data as never });
      return readResponseOrThrow(res) as Promise<AllocationRule>;
    },
    onSuccess: (data) => {
      captureEvent(ANALYTICS_EVENTS.allocationRuleCreated, {
        entity_type: "allocation_rule",
        rule_id: data.id,
      });
      void queryClient.invalidateQueries({ queryKey: allocationKeys.rules() });
      void queryClient.invalidateQueries({ queryKey: allocationKeys.functionalExpensesAll() });
      toast.success("Account bound to allocation base");
    },
    onError: onMutationError,
  });
}

export function useUpdateAllocationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string;
      data: UpdateAllocationRuleInput;
    }): Promise<AllocationRule> => {
      const res = await allocationApi.rules[":id"].$patch({ param: { id }, json: data as never });
      return readResponseOrThrow(res) as Promise<AllocationRule>;
    },
    onSuccess: (_data, variables) => {
      captureEvent(ANALYTICS_EVENTS.allocationRuleUpdated, {
        entity_type: "allocation_rule",
        rule_id: variables.id,
      });
      void queryClient.invalidateQueries({ queryKey: allocationKeys.rules() });
      void queryClient.invalidateQueries({ queryKey: allocationKeys.functionalExpensesAll() });
      toast.success("Rule updated");
    },
    onError: onMutationError,
  });
}

export function useDeleteAllocationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      const res = await allocationApi.rules[":id"].$delete({ param: { id } });
      await readResponseOrThrow(res);
    },
    onSuccess: (_data, id) => {
      captureEvent(ANALYTICS_EVENTS.allocationRuleDeleted, {
        entity_type: "allocation_rule",
        rule_id: id,
      });
      void queryClient.invalidateQueries({ queryKey: allocationKeys.rules() });
      void queryClient.invalidateQueries({ queryKey: allocationKeys.functionalExpensesAll() });
      toast.success("Rule deleted");
    },
    onError: onMutationError,
  });
}
