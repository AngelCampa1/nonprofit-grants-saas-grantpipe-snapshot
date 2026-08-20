import { z } from "zod";

const idSchema = z.string().trim().min(1);
const optionalTrimmedString = z.string().trim().min(1).max(200).optional();
const optionalNullableTrimmedString = z.string().trim().min(1).max(200).nullish();

export const SEFA_INCLUSION_TYPES = ["cash", "noncash", "loan", "loan_guarantee"] as const;

export const federalAwardMetadataSchema = z.object({
  grantId: idSchema,
  assistanceListingNumber: z.string().trim().min(1).max(32).nullish(),
  assistanceListingTitle: optionalTrimmedString,
  federalAgency: optionalNullableTrimmedString,
  fain: optionalTrimmedString,
  passThroughEntityName: optionalTrimmedString,
  passThroughIdentifyingNumber: optionalTrimmedString,
  programName: optionalTrimmedString,
  clusterName: optionalTrimmedString,
  sefaInclusionType: z.enum(SEFA_INCLUSION_TYPES),
});
export type FederalAwardMetadataInput = z.input<typeof federalAwardMetadataSchema>;

export const updateFederalAwardMetadataSchema = federalAwardMetadataSchema
  .omit({ grantId: true })
  .partial();
export type UpdateFederalAwardMetadataInput = z.input<typeof updateFederalAwardMetadataSchema>;
