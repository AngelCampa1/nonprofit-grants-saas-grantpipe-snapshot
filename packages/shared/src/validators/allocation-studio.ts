import { z } from "zod";
import { ACCOUNT_FUNCTIONAL_CLASSES } from "./accounting";
import { weightsAreComplete } from "./allocation-math";

// ---------------------------------------------------------------------------
// Re-export functional classes for use throughout this domain
// ---------------------------------------------------------------------------

export { ACCOUNT_FUNCTIONAL_CLASSES };
export type AllocationFunctionalClass = (typeof ACCOUNT_FUNCTIONAL_CLASSES)[number];

// ---------------------------------------------------------------------------
// Allocation methods
// ---------------------------------------------------------------------------

export const ALLOCATION_METHODS = [
  "headcount_fte",
  "square_footage",
  "time_study",
  "manual_percentage",
] as const;
export type AllocationMethod = (typeof ALLOCATION_METHODS)[number];

// ---------------------------------------------------------------------------
// Allocation base schemas
// ---------------------------------------------------------------------------

export const createAllocationBaseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  method: z.enum(ALLOCATION_METHODS),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type CreateAllocationBaseInput = z.infer<typeof createAllocationBaseSchema>;

export const updateAllocationBaseSchema = createAllocationBaseSchema.partial();
export type UpdateAllocationBaseInput = z.infer<typeof updateAllocationBaseSchema>;

// ---------------------------------------------------------------------------
// Allocation target schemas
// ---------------------------------------------------------------------------

export const allocationTargetInputSchema = z.object({
  functionalClass: z.enum(ACCOUNT_FUNCTIONAL_CLASSES),
  programId: z.string().optional().nullable(),
  label: z.string().max(120).optional(),
  weightBasisPoints: z.number().int().min(0).max(10000),
});
export type AllocationTargetInput = z.infer<typeof allocationTargetInputSchema>;

export const setAllocationTargetsSchema = z
  .object({
    targets: z.array(allocationTargetInputSchema).min(1),
  })
  .superRefine((data, ctx) => {
    const weights = data.targets.map((t) => t.weightBasisPoints);
    if (!weightsAreComplete(weights)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Allocation weights must total 100%",
        path: ["targets"],
      });
    }
    for (let i = 0; i < data.targets.length; i++) {
      const target = data.targets[i]!;
      if (target.functionalClass !== "program" && target.programId != null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Only program targets can reference a program",
          path: ["targets", i, "programId"],
        });
      }
    }
  });
export type SetAllocationTargetsInput = z.infer<typeof setAllocationTargetsSchema>;

// ---------------------------------------------------------------------------
// Allocation rule schemas
// ---------------------------------------------------------------------------

export const createAllocationRuleSchema = z.object({
  accountId: z.string().min(1),
  baseId: z.string().min(1),
  status: z.enum(["active", "inactive"]).default("active"),
});
export type CreateAllocationRuleInput = z.infer<typeof createAllocationRuleSchema>;

export const updateAllocationRuleSchema = createAllocationRuleSchema.partial();
export type UpdateAllocationRuleInput = z.infer<typeof updateAllocationRuleSchema>;
