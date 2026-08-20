import { describe, expect, it } from "vitest";
import {
  subawards,
  subrecipientCorrectiveActions,
  subrecipientFindings,
  subrecipientMonitoringLogs,
  subrecipientMonitoringTasks,
  subrecipientRiskAssessments,
  subrecipients,
} from "./subrecipients";

function columnSqlType(column: { getSQLType: () => string }) {
  return column.getSQLType();
}

describe("subrecipient monitoring schema", () => {
  it("defines org-scoped, soft-deleted subrecipients and subawards", () => {
    expect(subrecipients.orgId.name).toBe("org_id");
    expect(subrecipients.name.name).toBe("name");
    expect(subrecipients.uei.name).toBe("uei");
    expect(subrecipients.status.name).toBe("status");
    expect(subrecipients.deletedAt.name).toBe("deleted_at");

    expect(subawards.orgId.name).toBe("org_id");
    expect(subawards.subrecipientId.name).toBe("subrecipient_id");
    expect(subawards.grantId.name).toBe("grant_id");
    expect(columnSqlType(subawards.amountCents)).toBe("bigint");
    expect(subawards.deletedAt.name).toBe("deleted_at");
  });

  it("stores risk assessments with checklist details and override metadata", () => {
    expect(subrecipientRiskAssessments.orgId.name).toBe("org_id");
    expect(subrecipientRiskAssessments.subawardId.name).toBe("subaward_id");
    expect(subrecipientRiskAssessments.checklist.name).toBe("checklist");
    expect(subrecipientRiskAssessments.suggestedRiskRating.name).toBe("suggested_risk_rating");
    expect(subrecipientRiskAssessments.finalRiskRating.name).toBe("final_risk_rating");
    expect(subrecipientRiskAssessments.overrideReason.name).toBe("override_reason");
  });

  it("keeps tasks, logs, findings, and corrective actions org scoped and soft deletable", () => {
    for (const table of [
      subrecipientMonitoringTasks,
      subrecipientMonitoringLogs,
      subrecipientFindings,
      subrecipientCorrectiveActions,
    ]) {
      expect(table.orgId.name).toBe("org_id");
      expect(table.deletedAt.name).toBe("deleted_at");
    }
    expect(subrecipientMonitoringTasks.evidenceDocumentId.name).toBe("evidence_document_id");
    expect(subrecipientFindings.severity.name).toBe("severity");
    expect(subrecipientCorrectiveActions.findingId.name).toBe("finding_id");
  });
});
