/**
 * Classification service — resolves fundId/grantId to typed inputs,
 * loads any existing restriction term, then delegates to the pure
 * classifyRestriction function from @grantpipe/shared.
 */
import { and, eq, isNull } from "drizzle-orm";
import { funds, grants, restrictionTerms } from "@grantpipe/db";
import type { Database, TransactionDatabase } from "@grantpipe/db";
import {
  classifyRestriction,
  classifyRestrictionInputSchema,
  classifyRestrictionRequestSchema,
  type ClassificationResult,
  type ClassifyRestrictionInput,
  type ClassifyRestrictionRequest,
} from "@grantpipe/shared";

export { classifyRestrictionRequestSchema };
export type { ClassifyRestrictionRequest };

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export async function resolveAndClassifyRestriction(
  db: Database | TransactionDatabase,
  params: { orgId: string } & ClassifyRestrictionRequest,
): Promise<ClassificationResult> {
  const { orgId, fundId, grantId, designation, date } = params;

  // Resolve fund type
  let fundType: ClassifyRestrictionInput["fundType"] = undefined;
  if (fundId) {
    const fund = await db.query.funds.findFirst({
      where: and(eq(funds.id, fundId), eq(funds.orgId, orgId), isNull(funds.deletedAt)),
      columns: { type: true },
    });
    if (fund) {
      fundType = fund.type as ClassifyRestrictionInput["fundType"];
    }
  }

  // Resolve grant presence
  let hasLinkedGrant: boolean | undefined = undefined;
  if (grantId) {
    const grant = await db.query.grants.findFirst({
      where: and(eq(grants.id, grantId), eq(grants.orgId, orgId), isNull(grants.deletedAt)),
      columns: { id: true },
    });
    hasLinkedGrant = Boolean(grant);
  }

  // Load existing restriction term for the fund/grant. Terms are anchored to a
  // single entity, so look up by fund first, then fall back to grant — never
  // require a single row to match both columns.
  let existingTerm: ClassifyRestrictionInput["existingTerm"] = undefined;
  const termColumns = {
    restrictionType: true,
    releaseRule: true,
    startDate: true,
    endDate: true,
  } as const;
  if (fundId || grantId) {
    let term = fundId
      ? await db.query.restrictionTerms.findFirst({
          where: and(
            eq(restrictionTerms.orgId, orgId),
            isNull(restrictionTerms.deletedAt),
            eq(restrictionTerms.fundId, fundId),
          ),
          columns: termColumns,
        })
      : undefined;

    if (!term && grantId) {
      term = await db.query.restrictionTerms.findFirst({
        where: and(
          eq(restrictionTerms.orgId, orgId),
          isNull(restrictionTerms.deletedAt),
          eq(restrictionTerms.grantId, grantId),
        ),
        columns: termColumns,
      });
    }

    if (term) {
      existingTerm = {
        restrictionType: term.restrictionType as NonNullable<
          ClassifyRestrictionInput["existingTerm"]
        >["restrictionType"],
        releaseRule: term.releaseRule ?? null,
        startDate: term.startDate?.toISOString() ?? null,
        endDate: term.endDate?.toISOString() ?? null,
      };
    }
  }

  const input = classifyRestrictionInputSchema.parse({
    fundType,
    hasLinkedGrant,
    existingTerm,
    designation,
    date,
  });

  return classifyRestriction(input);
}
