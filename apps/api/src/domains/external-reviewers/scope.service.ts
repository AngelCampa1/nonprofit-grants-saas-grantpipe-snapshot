import { and, eq } from "drizzle-orm";
import {
  externalReviewScopes,
  externalReviewSessions,
  type ExternalReviewScope,
} from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import type { ExternalReviewScopeType } from "@grantpipe/shared";
import { recordActivityLog } from "../../lib/activity-log";
import { notFound } from "../../lib/app-error";
import { assertScopeTargetsBelongToOrg, resolveScopeName } from "./scope-targets";

export type PublicPortalScope = {
  id: string;
  sessionId: string;
  scopeType: string;
  scopeId: string;
  scopeName: string | null;
};

export type ScopeWithName = ExternalReviewScope & { scopeName: string | null };

type ScopeIdentity = Pick<ExternalReviewScope, "sessionId" | "scopeType" | "scopeId"> & {
  scopeName?: string | null;
};

export function publicPortalScope(scope: ScopeIdentity): PublicPortalScope {
  return {
    id: `${scope.sessionId}:${scope.scopeType}:${scope.scopeId}`,
    sessionId: scope.sessionId,
    scopeType: scope.scopeType,
    scopeId: scope.scopeId,
    scopeName: scope.scopeName ?? null,
  };
}

export async function addScopes(
  db: Database,
  orgId: string,
  sessionId: string,
  actorId: string,
  scopes: Array<{ scopeType: ExternalReviewScopeType; scopeId: string }>,
): Promise<void> {
  const session = await db.query.externalReviewSessions.findFirst({
    where: and(eq(externalReviewSessions.id, sessionId), eq(externalReviewSessions.orgId, orgId)),
    columns: { id: true },
  });

  if (!session) {
    throw notFound("Session not found");
  }

  if (scopes.length === 0) return;
  await assertScopeTargetsBelongToOrg(db, orgId, scopes);

  await db.transaction(async (tx) => {
    const insertedScopes = await tx
      .insert(externalReviewScopes)
      .values(
        scopes.map((scope) => ({
          sessionId,
          scopeType: scope.scopeType,
          scopeId: scope.scopeId,
          grantedBy: actorId,
        })),
      )
      .onConflictDoNothing()
      .returning();

    for (const scope of insertedScopes) {
      await recordActivityLog(tx, {
        orgId,
        actorId,
        action: "create",
        entityType: "external_review_session",
        entityId: sessionId,
        changes: { after: { scopeType: scope.scopeType, scopeId: scope.scopeId } },
      });
    }
  });
}

export async function removeScope(
  db: Database,
  orgId: string,
  sessionId: string,
  actorId: string,
  scopeType: string,
  scopeId: string,
): Promise<void> {
  const session = await db.query.externalReviewSessions.findFirst({
    where: and(eq(externalReviewSessions.id, sessionId), eq(externalReviewSessions.orgId, orgId)),
    columns: { id: true },
  });

  if (!session) {
    throw notFound("Session not found");
  }

  await db.transaction(async (tx) => {
    const deletedScopes = await tx
      .delete(externalReviewScopes)
      .where(
        and(
          eq(externalReviewScopes.sessionId, sessionId),
          eq(externalReviewScopes.scopeType, scopeType),
          eq(externalReviewScopes.scopeId, scopeId),
        ),
      )
      .returning();

    if (deletedScopes.length === 0) return;

    await recordActivityLog(tx, {
      orgId,
      actorId,
      action: "delete",
      entityType: "external_review_session",
      entityId: sessionId,
      changes: { before: { scopeType, scopeId } },
    });
  });
}

export async function listScopes(
  db: Database,
  orgId: string,
  sessionId: string,
): Promise<ScopeWithName[]> {
  const scopes = await db
    .select()
    .from(externalReviewScopes)
    .where(eq(externalReviewScopes.sessionId, sessionId));

  return Promise.all(
    scopes.map(async (scope) => ({
      ...scope,
      scopeName: await resolveScopeName(db, orgId, {
        scopeType: scope.scopeType as ExternalReviewScopeType,
        scopeId: scope.scopeId,
      }),
    })),
  );
}

export async function checkScope(
  db: Database,
  sessionId: string,
  scopeType: string,
  scopeId: string,
): Promise<boolean> {
  const scope = await db.query.externalReviewScopes.findFirst({
    where: and(
      eq(externalReviewScopes.sessionId, sessionId),
      eq(externalReviewScopes.scopeType, scopeType),
      eq(externalReviewScopes.scopeId, scopeId),
    ),
    columns: { sessionId: true },
  });

  return scope !== undefined;
}
