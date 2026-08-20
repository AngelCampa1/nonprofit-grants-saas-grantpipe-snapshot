import { sql, type SQLWrapper } from "drizzle-orm";
import {
  contacts,
  donations,
  events,
  funders,
  funds,
  generatedReports,
  grantPaymentRequests,
  grants,
  organizations,
  subawards,
  subrecipientCorrectiveActions,
  subrecipientFindings,
  subrecipientMonitoringTasks,
  subrecipients,
} from "@grantpipe/db";

type ScopeValue = string | SQLWrapper;

export function documentParentEntityScope(params: {
  orgId: string;
  selectedEntityId: string;
  entityType: ScopeValue;
  entityId: ScopeValue;
}) {
  const grantScope = (grantId: ScopeValue) => sql`EXISTS (
    SELECT 1 FROM ${grants}
    WHERE ${grants.id} = ${grantId}
      AND ${grants.orgId} = ${params.orgId}
      AND ${grants.entityId} = ${params.selectedEntityId}
      AND ${grants.deletedAt} IS NULL
  )`;
  const subawardScope = (subawardId: ScopeValue) => sql`EXISTS (
    SELECT 1 FROM ${subawards}
    WHERE ${subawards.id} = ${subawardId}
      AND ${subawards.orgId} = ${params.orgId}
      AND ${subawards.deletedAt} IS NULL
      AND ${grantScope(subawards.grantId)}
  )`;
  const defaultEntityScope = sql`EXISTS (
    SELECT 1 FROM ${organizations}
    WHERE ${organizations.id} = ${params.orgId}
      AND ${organizations.defaultEntityId} = ${params.selectedEntityId}
      AND ${organizations.deletedAt} IS NULL
  )`;
  const donationScope = sql`EXISTS (
    SELECT 1 FROM ${donations}
    WHERE ${donations.id} = ${params.entityId}
      AND ${donations.orgId} = ${params.orgId}
      AND ${donations.deletedAt} IS NULL
      AND (
        ${donations.fundId} IS NULL OR EXISTS (
          SELECT 1 FROM ${funds}
          WHERE ${funds.id} = ${donations.fundId}
            AND ${funds.orgId} = ${params.orgId}
            AND ${funds.entityId} = ${params.selectedEntityId}
            AND ${funds.deletedAt} IS NULL
        )
      )
      AND (
        ${donations.grantId} IS NULL OR ${grantScope(donations.grantId)}
      )
      AND (
        ${donations.fundId} IS NOT NULL
        OR ${donations.grantId} IS NOT NULL
        OR ${defaultEntityScope}
      )
  )`;

  return sql`CASE ${params.entityType}
    WHEN 'contact' THEN EXISTS (
      SELECT 1 FROM ${contacts}
      WHERE ${contacts.id} = ${params.entityId}
        AND ${contacts.orgId} = ${params.orgId}
        AND ${contacts.deletedAt} IS NULL
        AND ${defaultEntityScope}
    )
    WHEN 'donation' THEN ${donationScope}
    WHEN 'grant' THEN ${grantScope(params.entityId)}
    WHEN 'funder' THEN EXISTS (
      SELECT 1 FROM ${funders}
      WHERE ${funders.id} = ${params.entityId}
        AND ${funders.orgId} = ${params.orgId}
        AND ${funders.entityId} = ${params.selectedEntityId}
        AND ${funders.deletedAt} IS NULL
    )
    WHEN 'fund' THEN EXISTS (
      SELECT 1 FROM ${funds}
      WHERE ${funds.id} = ${params.entityId}
        AND ${funds.orgId} = ${params.orgId}
        AND ${funds.entityId} = ${params.selectedEntityId}
        AND ${funds.deletedAt} IS NULL
    )
    WHEN 'event' THEN EXISTS (
      SELECT 1 FROM ${events}
      WHERE ${events.id} = ${params.entityId}
        AND ${events.orgId} = ${params.orgId}
        AND ${events.deletedAt} IS NULL
        AND ${defaultEntityScope}
    )
    WHEN 'generated_report' THEN EXISTS (
      SELECT 1 FROM ${generatedReports}
      WHERE ${generatedReports.id} = ${params.entityId}
        AND ${generatedReports.orgId} = ${params.orgId}
        AND ${generatedReports.entityId} = ${params.selectedEntityId}
    )
    WHEN 'award_intake' THEN ${params.entityId} = ${params.orgId} AND ${defaultEntityScope}
    WHEN 'payment_request' THEN EXISTS (
      SELECT 1 FROM ${grantPaymentRequests}
      WHERE ${grantPaymentRequests.id} = ${params.entityId}
        AND ${grantPaymentRequests.orgId} = ${params.orgId}
        AND ${grantPaymentRequests.deletedAt} IS NULL
        AND ${grantScope(grantPaymentRequests.grantId)}
    )
    WHEN 'subrecipient' THEN EXISTS (
      SELECT 1 FROM ${subrecipients}
      WHERE ${subrecipients.id} = ${params.entityId}
        AND ${subrecipients.orgId} = ${params.orgId}
        AND ${subrecipients.deletedAt} IS NULL
        AND ${defaultEntityScope}
    )
    WHEN 'subaward' THEN ${subawardScope(params.entityId)}
    WHEN 'subrecipient_monitoring_task' THEN EXISTS (
      SELECT 1 FROM ${subrecipientMonitoringTasks}
      WHERE ${subrecipientMonitoringTasks.id} = ${params.entityId}
        AND ${subrecipientMonitoringTasks.orgId} = ${params.orgId}
        AND ${subrecipientMonitoringTasks.deletedAt} IS NULL
        AND ${subawardScope(subrecipientMonitoringTasks.subawardId)}
    )
    WHEN 'subrecipient_finding' THEN EXISTS (
      SELECT 1 FROM ${subrecipientFindings}
      WHERE ${subrecipientFindings.id} = ${params.entityId}
        AND ${subrecipientFindings.orgId} = ${params.orgId}
        AND ${subrecipientFindings.deletedAt} IS NULL
        AND ${subawardScope(subrecipientFindings.subawardId)}
    )
    WHEN 'subrecipient_corrective_action' THEN EXISTS (
      SELECT 1 FROM ${subrecipientCorrectiveActions}
      WHERE ${subrecipientCorrectiveActions.id} = ${params.entityId}
        AND ${subrecipientCorrectiveActions.orgId} = ${params.orgId}
        AND ${subrecipientCorrectiveActions.deletedAt} IS NULL
        AND EXISTS (
          SELECT 1 FROM ${subrecipientFindings}
          WHERE ${subrecipientFindings.id} = ${subrecipientCorrectiveActions.findingId}
            AND ${subrecipientFindings.orgId} = ${params.orgId}
            AND ${subrecipientFindings.deletedAt} IS NULL
            AND ${subawardScope(subrecipientFindings.subawardId)}
        )
    )
    ELSE FALSE
  END`;
}
