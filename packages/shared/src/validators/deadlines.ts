import { z } from "zod";

/**
 * The five dated-obligation kinds the Compliance Deadline Radar unifies. Each
 * maps to an existing source table (see the Radar PRD scope table). Audit
 * windows and pledge installments are intentionally omitted from v1 because no
 * scheduled-date entity exists for them.
 */
export const RADAR_OBLIGATION_KINDS = [
  "application_deadline",
  "reporting_requirement",
  "closeout_item",
  "restriction_release",
  "period_close",
] as const;

export type RadarObligationKind = (typeof RADAR_OBLIGATION_KINDS)[number];

/** Per-obligation lifecycle status. `resolved` items are excluded by default. */
export const RADAR_OBLIGATION_STATUSES = [
  "overdue",
  "due_today",
  "upcoming",
  "resolved",
] as const;

export type RadarObligationStatus = (typeof RADAR_OBLIGATION_STATUSES)[number];

/** Urgency banding the feed is grouped into, ordered most → least urgent. */
export const RADAR_URGENCY_BANDS = [
  "overdue",
  "due_today",
  "this_week",
  "this_month",
  "later",
] as const;

export type RadarUrgencyBand = (typeof RADAR_URGENCY_BANDS)[number];

/** The source record a Radar row links through to. */
export type RadarObligationTarget = {
  type: "grant" | "fund" | "fiscal_period";
  id: string;
};

/**
 * The canonical shape every obligation source normalizes to. `id` is stable per
 * source row as `${kind}:${sourceId}`. `daysUntilDue` is timezone-aware (from
 * the shared getDaysUntilDeadline helper).
 */
export type RadarObligation = {
  id: string;
  kind: RadarObligationKind;
  title: string;
  contextLabel: string;
  dueDate: string;
  daysUntilDue: number;
  status: RadarObligationStatus;
  urgencyBand: RadarUrgencyBand;
  target: RadarObligationTarget;
};

export const radarObligationKindSchema = z.enum(RADAR_OBLIGATION_KINDS);
export const radarObligationStatusSchema = z.enum(RADAR_OBLIGATION_STATUSES);
export const radarUrgencyBandSchema = z.enum(RADAR_URGENCY_BANDS);

const kindsQuerySchema = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part.length > 0),
  )
  .pipe(z.array(radarObligationKindSchema))
  .transform((kinds) => {
    const deduped = [...new Set(kinds)];
    return deduped.length > 0 ? deduped : undefined;
  });

/**
 * Query schema for `GET /api/deadlines`. Values arrive as query strings, so
 * numbers and booleans are coerced. `horizonDays` bounds how far ahead upcoming
 * obligations are collected.
 */
export const radarQuerySchema = z.object({
  horizonDays: z.coerce.number().int().min(1).max(366).default(90),
  kinds: kindsQuerySchema.optional(),
  status: radarObligationStatusSchema.optional(),
  includeResolved: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

export type RadarQueryParams = z.infer<typeof radarQuerySchema>;
