import { z } from "zod";
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from "../constants";

const paginationValueSchema = z.union([z.string(), z.number()]);

export const paginationSchema = z.object({
  page: z
    .union([paginationValueSchema, z.undefined()])
    .optional()
    .default("1")
    .transform(Number)
    .pipe(z.number().int().min(1).max(10_000)),
  pageSize: z
    .union([paginationValueSchema, z.undefined()])
    .optional()
    .default(String(PAGE_SIZE_DEFAULT))
    .transform(Number)
    .pipe(z.number().int().min(1))
    .transform((n) => Math.min(n, PAGE_SIZE_MAX)),
});

export type PaginationParams = z.infer<typeof paginationSchema>;
