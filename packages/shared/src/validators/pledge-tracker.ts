import { z } from "zod";

// ---------------------------------------------------------------------------
// Status enums
// ---------------------------------------------------------------------------

export const PLEDGE_STATUSES = [
  "conditional",
  "active",
  "completed",
  "written_off",
  "cancelled",
] as const;
export type PledgeStatus = (typeof PLEDGE_STATUSES)[number];

export const PLEDGE_INSTALLMENT_STATUSES = ["scheduled", "paid", "partial", "written_off"] as const;
export type PledgeInstallmentStatus = (typeof PLEDGE_INSTALLMENT_STATUSES)[number];

// ---------------------------------------------------------------------------
// createPledgeSchema
// ---------------------------------------------------------------------------

const pledgeInstallmentSchema = z.object({
  dueDate: z.coerce.date(),
  amountCents: z.number().int().positive(),
});

export const createPledgeSchema = z.object({
  contactId: z.string().min(1),
  fundId: z.string().optional().nullable(),
  grantId: z.string().optional().nullable(),
  pledgeDate: z.coerce.date(),
  discountRateBasisPoints: z.number().int().min(0).max(10_000),
  netAssetClass: z.enum(["unrestricted", "temporarily_restricted", "permanently_restricted"]),
  hasBarrier: z.boolean().default(false),
  hasRightOfReturn: z.boolean().default(false),
  conditionNote: z.string().optional(),
  notes: z.string().optional(),
  installments: z.array(pledgeInstallmentSchema).min(1),
});

export type CreatePledgeInput = z.infer<typeof createPledgeSchema>;

// ---------------------------------------------------------------------------
// recordPledgePaymentSchema
// ---------------------------------------------------------------------------

export const recordPledgePaymentSchema = z.object({
  installmentId: z.string().optional().nullable(),
  amountCents: z.number().int().positive(),
  paymentDate: z.coerce.date(),
  notes: z.string().optional(),
});

export type RecordPledgePaymentInput = z.infer<typeof recordPledgePaymentSchema>;

// ---------------------------------------------------------------------------
// setPledgeAllowanceSchema
// ---------------------------------------------------------------------------

export const setPledgeAllowanceSchema = z.object({
  allowanceCents: z.number().int().min(0),
});

export type SetPledgeAllowanceInput = z.infer<typeof setPledgeAllowanceSchema>;

// ---------------------------------------------------------------------------
// writeOffPledgeSchema
// ---------------------------------------------------------------------------

export const writeOffPledgeSchema = z.object({
  reason: z.string().optional(),
});

export type WriteOffPledgeInput = z.infer<typeof writeOffPledgeSchema>;

// ---------------------------------------------------------------------------
// promotePledgeSchema
// ---------------------------------------------------------------------------

export const promotePledgeSchema = z.object({
  promotionDate: z.coerce.date().optional(),
});

export type PromotePledgeInput = z.infer<typeof promotePledgeSchema>;

// ---------------------------------------------------------------------------
// pledgeQuerySchema
// ---------------------------------------------------------------------------

export const pledgeQuerySchema = z.object({
  status: z.enum(PLEDGE_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type PledgeQueryParams = z.infer<typeof pledgeQuerySchema>;
