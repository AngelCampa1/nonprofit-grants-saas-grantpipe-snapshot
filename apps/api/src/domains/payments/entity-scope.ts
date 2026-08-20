import { sql, type SQL, type SQLWrapper } from "drizzle-orm";

export type PaymentEntityScope = { orgId: string; entityId?: string };
export type ActivePaymentEntityScope = { orgId: string; entityId: string };

export function paymentRequestEntityScope(
  requestGrantId: SQLWrapper,
  scope: PaymentEntityScope,
): SQL {
  return sql`exists (
    select 1
    from grants as payment_scope_grant
    where payment_scope_grant.id = ${requestGrantId}
      and payment_scope_grant.org_id = ${scope.orgId}
      and payment_scope_grant.entity_id = ${scope.entityId ?? ""}
      and payment_scope_grant.deleted_at is null
  )`;
}

export function paymentGrantEntityScope(grantId: SQLWrapper, scope: PaymentEntityScope): SQL {
  return sql`exists (
    select 1
    from grants as payment_scope_grant
    where payment_scope_grant.id = ${grantId}
      and payment_scope_grant.org_id = ${scope.orgId}
      and payment_scope_grant.entity_id = ${scope.entityId}
      and payment_scope_grant.deleted_at is null
  )`;
}

export function paymentOptionalGrantEntityScope(
  grantId: SQLWrapper,
  scope: PaymentEntityScope,
): SQL {
  return sql`(${grantId} is null or ${paymentGrantEntityScope(grantId, scope)})`;
}
