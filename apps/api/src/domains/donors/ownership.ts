import { and, isNotNull, isNull, or, sql, type SQLWrapper } from "drizzle-orm";
import { contacts, donations } from "@grantpipe/db";

type DonationOwnershipColumns = {
  fundId: SQLWrapper;
  grantId: SQLWrapper;
};

const entityDonationColumns: DonationOwnershipColumns = {
  fundId: sql`entity_donation.fund_id`,
  grantId: sql`entity_donation.grant_id`,
};

function defaultEntityScope(orgId: string, entityId: string) {
  const organizationAlias = sql.identifier("donor_scope_org");

  return sql`EXISTS (
    SELECT 1 FROM ${sql.identifier("organizations")} ${organizationAlias}
    WHERE ${organizationAlias}.${sql.identifier("id")} = ${orgId}
      AND ${organizationAlias}.${sql.identifier("default_entity_id")} = ${entityId}
      AND ${organizationAlias}.${sql.identifier("deleted_at")} IS NULL
  )`;
}

export function donationEntityScope(
  orgId: string,
  entityId: string,
  columns: DonationOwnershipColumns = donations,
) {
  const fundAlias = sql.identifier("donor_scope_fund");
  const grantAlias = sql.identifier("donor_scope_grant");

  return and(
    or(
      isNull(columns.fundId),
      sql`EXISTS (
        SELECT 1 FROM ${sql.identifier("funds")} ${fundAlias}
        WHERE ${fundAlias}.${sql.identifier("id")} = ${columns.fundId}
          AND ${fundAlias}.${sql.identifier("org_id")} = ${orgId}
          AND ${fundAlias}.${sql.identifier("entity_id")} = ${entityId}
          AND ${fundAlias}.${sql.identifier("deleted_at")} IS NULL
      )`,
    ),
    or(
      isNull(columns.grantId),
      sql`EXISTS (
        SELECT 1 FROM ${sql.identifier("grants")} ${grantAlias}
        WHERE ${grantAlias}.${sql.identifier("id")} = ${columns.grantId}
          AND ${grantAlias}.${sql.identifier("org_id")} = ${orgId}
          AND ${grantAlias}.${sql.identifier("entity_id")} = ${entityId}
          AND ${grantAlias}.${sql.identifier("deleted_at")} IS NULL
      )`,
    ),
    or(isNotNull(columns.fundId), isNotNull(columns.grantId), defaultEntityScope(orgId, entityId)),
  );
}

export function donorContactEntityScope(
  orgId: string,
  entityId: string,
  contactId: SQLWrapper = contacts.id,
) {
  const qualifyingDonation = sql`EXISTS (
    SELECT 1 FROM ${donations} entity_donation
    WHERE entity_donation.contact_id = ${contactId}
      AND entity_donation.org_id = ${orgId}
      AND entity_donation.deleted_at IS NULL
      AND ${donationEntityScope(orgId, entityId, entityDonationColumns)}
  )`;
  const defaultProspect = and(
    defaultEntityScope(orgId, entityId),
    sql`NOT EXISTS (
      SELECT 1 FROM ${donations} entity_donation
      WHERE entity_donation.contact_id = ${contactId}
        AND entity_donation.org_id = ${orgId}
        AND entity_donation.deleted_at IS NULL
    )`,
  );

  return or(qualifyingDonation, defaultProspect);
}
