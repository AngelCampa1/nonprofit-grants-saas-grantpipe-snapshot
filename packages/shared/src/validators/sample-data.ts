import { z } from "zod";

export const sampleDataStatusSchema = z.object({
  seeded: z.boolean(),
  recordCount: z.number().int().min(0),
});
export type SampleDataStatus = z.infer<typeof sampleDataStatusSchema>;

export const sampleDataSeedResultSchema = z.object({
  seeded: z.literal(true),
  recordCount: z.number().int().min(1),
});
export type SampleDataSeedResult = z.infer<typeof sampleDataSeedResultSchema>;

export const sampleDataClearResultSchema = z.object({
  cleared: z.boolean(),
  recordCount: z.number().int().min(0),
});
export type SampleDataClearResult = z.infer<typeof sampleDataClearResultSchema>;
