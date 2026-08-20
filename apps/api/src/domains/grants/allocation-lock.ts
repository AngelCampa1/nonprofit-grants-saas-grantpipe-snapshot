import { sql } from "drizzle-orm";
import type { TransactionDatabase } from "@grantpipe/db";

export function grantAllocationLockKey(params: { orgId: string; grantId: string }): string {
  return `${params.orgId}:${params.grantId}:allocations`;
}

export async function lockGrantAllocationCap(
  db: TransactionDatabase,
  params: { orgId: string; grantId: string },
): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${grantAllocationLockKey(params)}))`);
}

export function grantBillingCapLockKey(params: { orgId: string }): string {
  return `${params.orgId}:grant-billing-cap`;
}

// Serializes the org-wide active-grant billing-cap critical section so the cap
// count and the status write happen atomically. Without this, two concurrent
// create/activate requests can both pass a stale count check and both commit,
// pushing the org one grant over its plan cap (TOCTOU bypass).
export async function lockGrantBillingCap(
  db: TransactionDatabase,
  params: { orgId: string },
): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${grantBillingCapLockKey(params)}))`);
}
