import type { DocumentEntityType, Role } from "@grantpipe/shared";

export const AUDITOR_DOCUMENT_ENTITY_TYPES = [
  "grant",
  "funder",
  "fund",
  "generated_report",
  "payment_request",
  "award_intake",
  "subrecipient",
  "subaward",
  "subrecipient_monitoring_task",
  "subrecipient_finding",
  "subrecipient_corrective_action",
] as const satisfies readonly DocumentEntityType[];

export function documentEntityTypesForRole(
  role: Role | null,
): readonly DocumentEntityType[] | undefined {
  return role === "auditor" ? AUDITOR_DOCUMENT_ENTITY_TYPES : undefined;
}

export function canReadDocumentEntity(role: Role | null, entityType: DocumentEntityType): boolean {
  const allowedEntityTypes = documentEntityTypesForRole(role);
  return !allowedEntityTypes || allowedEntityTypes.includes(entityType);
}
