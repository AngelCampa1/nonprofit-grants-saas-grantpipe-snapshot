import { describe, expect, it } from "vitest";
import {
  documentExtractionActions,
  documentExtractionFields,
  documentExtractionSources,
  documentExtractions,
} from "./document-extractions";

function columnSqlType(column: { getSQLType: () => string }) {
  return column.getSQLType();
}

describe("document extraction schema", () => {
  it("defines an org-scoped extraction root linked to a source document", () => {
    expect(documentExtractions.orgId.name).toBe("org_id");
    expect(documentExtractions.documentId.name).toBe("document_id");
    expect(documentExtractions.createdGrantId.name).toBe("created_grant_id");
    expect(documentExtractions.createdBy.name).toBe("created_by");
  });

  it("tracks async lifecycle and provider metadata", () => {
    expect(documentExtractions.status.name).toBe("status");
    expect(documentExtractions.status.default).toBe("pending");
    expect(documentExtractions.modelId.name).toBe("model_id");
    expect(documentExtractions.providerRequestId.name).toBe("provider_request_id");
    expect(documentExtractions.dispatchRequestFingerprint.name).toBe(
      "dispatch_request_fingerprint",
    );
    expect(documentExtractions.processingClaimToken.name).toBe("processing_claim_token");
    expect(documentExtractions.failureMessage.name).toBe("failure_message");
    expect(columnSqlType(documentExtractions.rawNormalizedJson)).toBe("jsonb");
    expect(columnSqlType(documentExtractions.tokenUsageJson)).toBe("jsonb");
  });

  it("stores reviewed extracted fields with destination and confidence", () => {
    expect(documentExtractionFields.orgId.name).toBe("org_id");
    expect(documentExtractionFields.extractionId.name).toBe("extraction_id");
    expect(documentExtractionFields.fieldKey.name).toBe("field_key");
    expect(documentExtractionFields.destinationEntityType.name).toBe("destination_entity_type");
    expect(documentExtractionFields.destinationField.name).toBe("destination_field");
    expect(documentExtractionFields.status.default).toBe("pending");
    expect(columnSqlType(documentExtractionFields.valueJson)).toBe("jsonb");
    expect(columnSqlType(documentExtractionFields.normalizedValueJson)).toBe("jsonb");
  });

  it("stores source references for each field", () => {
    expect(documentExtractionSources.orgId.name).toBe("org_id");
    expect(documentExtractionSources.extractionId.name).toBe("extraction_id");
    expect(documentExtractionSources.fieldId.name).toBe("field_id");
    expect(documentExtractionSources.pageNumber.name).toBe("page_number");
    expect(documentExtractionSources.snippet.name).toBe("snippet");
    expect(columnSqlType(documentExtractionSources.boundingBoxJson)).toBe("jsonb");
  });

  it("stores review and commit actions with before and after values", () => {
    expect(documentExtractionActions.orgId.name).toBe("org_id");
    expect(documentExtractionActions.extractionId.name).toBe("extraction_id");
    expect(documentExtractionActions.fieldId.name).toBe("field_id");
    expect(documentExtractionActions.action.name).toBe("action");
    expect(documentExtractionActions.actorId.name).toBe("actor_id");
    expect(columnSqlType(documentExtractionActions.previousValueJson)).toBe("jsonb");
    expect(columnSqlType(documentExtractionActions.nextValueJson)).toBe("jsonb");
  });
});
