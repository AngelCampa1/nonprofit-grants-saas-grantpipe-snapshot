import { z } from "zod";
import { ANOMALY_CLASSES } from "./anomaly-detector";

// ---------------------------------------------------------------------------
// anomalyQuerySchema — validates GET /accounting/anomalies query params
// ---------------------------------------------------------------------------

export const anomalyQuerySchema = z.object({
  classes: z.array(z.enum(ANOMALY_CLASSES)).optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export type AnomalyQueryParams = z.infer<typeof anomalyQuerySchema>;
