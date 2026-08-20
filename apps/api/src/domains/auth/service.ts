import { and, eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import {
  entities,
  entityMembers,
  orgMembers,
  organizations,
  inviteLinks,
  user,
} from "@grantpipe/db";
import type { Database, TransactionDatabase } from "@grantpipe/db";
import { TRIAL_DAYS, type PermissionOverrides } from "@grantpipe/shared";
import { enqueueTrialEmailSequence } from "../trial-emails/service";

type CreatedOrganization = {
  id: string;
  name: string;
  slug: string;
  subscriptionStatus: string | null;
  trialStartedAt: Date | string | null;
  trialEndsAt: Date | string | null;
};

type UserReferenceLookup = {
  label: string;
};

type AccountDeletionDb = Pick<Database, "execute" | "delete"> | TransactionDatabase;
type UserReferenceCheck = {
  label: string;
  query: (userId: string) => SQL<UserReferenceLookup>;
};

export class AccountDeletionBlockedError extends Error {
  constructor(label: string) {
    super(
      `This account is linked to ${label}. Contact support so GrantPipe can preserve organization and audit history before deletion.`,
    );
    this.name = "AccountDeletionBlockedError";
  }
}

function firstResultRow<T>(result: unknown): T | undefined {
  return getResultRows<T>(result)[0];
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function errorCause(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  return (error as { cause?: unknown }).cause;
}

function isSchemaMismatchError(error: unknown): boolean {
  const code = errorCode(error);
  if (code === "42P01" || code === "42703") return true;

  const cause = errorCause(error);
  return cause !== undefined && isSchemaMismatchError(cause);
}

const userReferenceChecks: UserReferenceCheck[] = [
  {
    label: "organization memberships",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"organization memberships"} as "label"
      where exists (
        select 1 from "org_members"
        where "user_id" = ${userId} or "invited_by" = ${userId}
      )
      limit 1
    `,
  },
  {
    label: "invite links",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"invite links"} as "label"
      where exists (
        select 1 from "invite_links"
        where "created_by" = ${userId} or "used_by" = ${userId}
      )
      limit 1
    `,
  },
  {
    label: "trial email schedule",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"trial email schedule"} as "label"
      where exists (select 1 from "trial_email_schedule" where "user_id" = ${userId})
      limit 1
    `,
  },
  {
    label: "fiscal period close history",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"fiscal period close history"} as "label"
      where exists (select 1 from "fiscal_periods" where "closed_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "journal entries",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"journal entries"} as "label"
      where exists (select 1 from "journal_entries" where "posted_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "accounting integrations",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"accounting integrations"} as "label"
      where exists (select 1 from "accounting_integrations" where "created_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "accounting OAuth states",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"accounting OAuth states"} as "label"
      where exists (select 1 from "accounting_oauth_states" where "actor_id" = ${userId})
      limit 1
    `,
  },
  {
    label: "accounting sync runs",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"accounting sync runs"} as "label"
      where exists (select 1 from "accounting_sync_runs" where "requested_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "accounting mappings",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"accounting mappings"} as "label"
      where exists (select 1 from "accounting_dimension_mappings" where "mapped_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "accounting sync conflicts",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"accounting sync conflicts"} as "label"
      where exists (select 1 from "accounting_sync_conflicts" where "resolved_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "recurring journal templates",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"recurring journal templates"} as "label"
      where exists (select 1 from "recurring_journal_templates" where "created_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "grant closeout items",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"grant closeout items"} as "label"
      where exists (select 1 from "grant_closeout_items" where "completed_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "generated reports",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"generated reports"} as "label"
      where exists (select 1 from "generated_reports" where "generated_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "report templates",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"report templates"} as "label"
      where exists (select 1 from "report_templates" where "updated_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "document extractions",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"document extractions"} as "label"
      where exists (select 1 from "document_extractions" where "created_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "document extraction actions",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"document extraction actions"} as "label"
      where exists (select 1 from "document_extraction_actions" where "actor_id" = ${userId})
      limit 1
    `,
  },
  {
    label: "external reviewer grants",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"external reviewer grants"} as "label"
      where exists (select 1 from "external_reviewers" where "created_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "external reviewer sessions",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"external reviewer sessions"} as "label"
      where exists (
        select 1 from "external_review_sessions"
        where "created_by" = ${userId} or "revoked_by" = ${userId}
      )
      limit 1
    `,
  },
  {
    label: "external reviewer scopes",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"external reviewer scopes"} as "label"
      where exists (select 1 from "external_review_scopes" where "granted_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "external reviewer bundles",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"external reviewer bundles"} as "label"
      where exists (select 1 from "evidence_bundles" where "created_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "grant budgets",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"grant budgets"} as "label"
      where exists (
        select 1 from "grant_budget_versions"
        where "approved_by_user_id" = ${userId} or "created_by_user_id" = ${userId}
      )
      limit 1
    `,
  },
  {
    label: "grant budget allocations",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"grant budget allocations"} as "label"
      where exists (
        select 1 from "grant_budget_line_allocations"
        where "created_by_user_id" = ${userId}
      )
      limit 1
    `,
  },
  {
    label: "planned expenses",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"planned expenses"} as "label"
      where exists (select 1 from "planned_expenses" where "created_by_user_id" = ${userId})
      limit 1
    `,
  },
  {
    label: "grant budget amendments",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"grant budget amendments"} as "label"
      where exists (
        select 1 from "grant_budget_amendments"
        where "requested_by_user_id" = ${userId} or "approved_by_user_id" = ${userId}
      )
      limit 1
    `,
  },
  {
    label: "grant opportunity saved searches",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"grant opportunity saved searches"} as "label"
      where exists (select 1 from "grant_opportunity_saved_searches" where "created_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "grant opportunity actions",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"grant opportunity actions"} as "label"
      where exists (
        select 1 from "grant_opportunity_actions"
        where "user_id" = ${userId} or "owner_user_id" = ${userId}
      )
      limit 1
    `,
  },
  {
    label: "documents",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"documents"} as "label"
      where exists (select 1 from "documents" where "uploaded_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "communication log",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"communication log"} as "label"
      where exists (select 1 from "communication_log" where "logged_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "activity log",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"activity log"} as "label"
      where exists (select 1 from "activity_log" where "actor_id" = ${userId})
      limit 1
    `,
  },
  {
    label: "notifications",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"notifications"} as "label"
      where exists (select 1 from "notifications" where "user_id" = ${userId})
      limit 1
    `,
  },
  {
    label: "notification preferences",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"notification preferences"} as "label"
      where exists (select 1 from "notification_preferences" where "user_id" = ${userId})
      limit 1
    `,
  },
  {
    label: "user guide progress",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"user guide progress"} as "label"
      where exists (select 1 from "user_guide_progress" where "user_id" = ${userId})
      limit 1
    `,
  },
  {
    label: "saved segments",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"saved segments"} as "label"
      where exists (select 1 from "saved_segments" where "created_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "import history",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"import history"} as "label"
      where exists (select 1 from "import_history" where "user_id" = ${userId})
      limit 1
    `,
  },
  {
    label: "payment requests",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"payment requests"} as "label"
      where exists (select 1 from "grant_payment_requests" where "created_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "payment request adjustments",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"payment request adjustments"} as "label"
      where exists (select 1 from "grant_payment_request_adjustments" where "created_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "programs",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"programs"} as "label"
      where exists (select 1 from "programs" where "owner_user_id" = ${userId})
      limit 1
    `,
  },
  {
    label: "restriction terms",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"restriction terms"} as "label"
      where exists (select 1 from "restriction_terms" where "created_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "restriction releases",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"restriction releases"} as "label"
      where exists (select 1 from "restriction_releases" where "created_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "restriction balances",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"restriction balances"} as "label"
      where exists (select 1 from "restriction_balances" where "created_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "restriction additions",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"restriction additions"} as "label"
      where exists (select 1 from "restriction_additions" where "created_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "restriction evidence",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"restriction evidence"} as "label"
      where exists (select 1 from "restriction_evidence_links" where "created_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "subrecipients",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"subrecipients"} as "label"
      where exists (
        select 1 from "subrecipients"
        where "owner_id" = ${userId} or "created_by" = ${userId}
      )
      limit 1
    `,
  },
  {
    label: "subawards",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"subawards"} as "label"
      where exists (select 1 from "subawards" where "created_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "subrecipient assessments",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"subrecipient assessments"} as "label"
      where exists (select 1 from "subrecipient_risk_assessments" where "assessed_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "subrecipient monitoring tasks",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"subrecipient monitoring tasks"} as "label"
      where exists (
        select 1 from "subrecipient_monitoring_tasks"
        where "owner_id" = ${userId} or "completed_by" = ${userId} or "created_by" = ${userId}
      )
      limit 1
    `,
  },
  {
    label: "subrecipient monitoring logs",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"subrecipient monitoring logs"} as "label"
      where exists (select 1 from "subrecipient_monitoring_logs" where "created_by" = ${userId})
      limit 1
    `,
  },
  {
    label: "subrecipient findings",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"subrecipient findings"} as "label"
      where exists (
        select 1 from "subrecipient_findings"
        where "owner_id" = ${userId} or "created_by" = ${userId}
      )
      limit 1
    `,
  },
  {
    label: "subrecipient corrective actions",
    query: (userId) => sql<UserReferenceLookup>`
      select ${"subrecipient corrective actions"} as "label"
      where exists (
        select 1 from "subrecipient_corrective_actions"
        where "owner_id" = ${userId} or "created_by" = ${userId}
      )
      limit 1
    `,
  },
];

export async function assertUserCanDeleteAccount(
  db: Pick<Database, "execute">,
  userId: string,
): Promise<void> {
  for (const check of userReferenceChecks) {
    let reference: UserReferenceLookup | undefined;
    try {
      reference = firstResultRow<UserReferenceLookup>(await db.execute(check.query(userId)));
    } catch (error) {
      if (isSchemaMismatchError(error)) continue;
      throw error;
    }

    if (reference) {
      throw new AccountDeletionBlockedError(reference.label);
    }
  }
}

export async function deleteUserAccount(db: Database, userId: string): Promise<void> {
  await assertUserCanDeleteAccount(db, userId);

  await db.transaction(async (tx) => {
    await (tx as AccountDeletionDb).delete(user).where(eq(user.id, userId));
  });
}

export async function createOrgForUser(
  db: Database,
  input: { userId: string; userName: string },
): Promise<CreatedOrganization> {
  const { userId, userName } = input;

  const normalizedUserName = userName.trim();
  const orgName =
    normalizedUserName.length > 0 ? `${normalizedUserName}'s Organization` : "New Organization";
  const slugBase =
    normalizedUserName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "new-organization";
  const slug = `${slugBase}-org-${Date.now()}`;

  const trialStartedAt = new Date();
  const trialEndsAt = new Date(trialStartedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const orgId = crypto.randomUUID();

  return db.transaction(async (tx) => {
    const inserted = await tx.execute(sql<CreatedOrganization>`
      insert into "organizations" (
        "id",
        "name",
        "slug",
        "subscription_status",
        "trial_started_at",
        "trial_ends_at"
      )
      values (
        ${orgId},
        ${orgName},
        ${slug},
        ${"trialing"},
        ${trialStartedAt},
        ${trialEndsAt}
      )
      returning
        "id",
        "name",
        "slug",
        "subscription_status" as "subscriptionStatus",
        "trial_started_at" as "trialStartedAt",
        "trial_ends_at" as "trialEndsAt"
    `);

    const createdOrg = inserted.rows[0] as CreatedOrganization | undefined;

    if (!createdOrg) {
      throw new Error("Failed to create organization");
    }

    const [orgMember] = await tx
      .insert(orgMembers)
      .values({ orgId: createdOrg.id, userId, role: "admin" })
      .returning();

    if (!orgMember) {
      throw new Error("Failed to create organization membership");
    }

    const [defaultEntity] = await tx
      .insert(entities)
      .values({
        orgId: createdOrg.id,
        name: createdOrg.name,
        kind: "root",
        status: "active",
        fiscalSponsorModel: "none",
      })
      .returning();

    if (!defaultEntity) {
      throw new Error("Failed to create default entity");
    }

    await tx
      .update(organizations)
      .set({ defaultEntityId: defaultEntity.id, updatedAt: new Date() })
      .where(eq(organizations.id, createdOrg.id));

    await tx
      .insert(entityMembers)
      .values({
        orgId: createdOrg.id,
        entityId: defaultEntity.id,
        orgMemberId: orgMember.id,
        role: "admin",
      })
      .returning();

    await enqueueTrialEmailSequence(tx, {
      orgId: createdOrg.id,
      userId,
      trialStartedAt: createdOrg.trialStartedAt,
      trialEndsAt: createdOrg.trialEndsAt,
    });

    return createdOrg;
  });
}

// ---------------------------------------------------------------------------
// generateInviteToken
// ---------------------------------------------------------------------------

export function generateInviteToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// checkInvite
// ---------------------------------------------------------------------------

type CheckInviteValid = { valid: true; role: string; email: string | null };
type CheckInviteInvalid = {
  valid: false;
  error: "invite_not_found" | "invite_expired" | "invite_already_used";
};
type CheckInviteResult = CheckInviteValid | CheckInviteInvalid;

export async function checkInvite(
  db: Database,
  input: { token: string },
): Promise<CheckInviteResult> {
  const { token } = input;

  const invite = await db.query.inviteLinks.findFirst({
    where: eq(inviteLinks.token, token),
  });

  if (!invite) return { valid: false, error: "invite_not_found" };
  if (invite.expiresAt < new Date()) return { valid: false, error: "invite_expired" };
  if (invite.usedBy !== null) return { valid: false, error: "invite_already_used" };

  return { valid: true, role: invite.role ?? "viewer", email: invite.email ?? null };
}

// ---------------------------------------------------------------------------
// acceptInvite
// ---------------------------------------------------------------------------

type AcceptInviteSuccess = { orgId: string; role: string };
type AcceptInviteError = {
  error: "invite_not_found" | "invite_expired" | "invite_already_used" | "invite_email_mismatch";
};
type AcceptInviteResult = AcceptInviteSuccess | AcceptInviteError;
type ClaimedInviteMembership = {
  orgId: string;
  role: string | null;
};
type InviteStatusLookup = {
  id: string;
  expiresAt: Date;
  usedBy: string | null;
};
type InviteStatusLookupTx = {
  query?: {
    inviteLinks?: {
      findFirst?: (args: { where: unknown }) => Promise<InviteStatusLookup | undefined>;
    };
  };
  execute?: (query: unknown) => PromiseLike<unknown> | unknown;
};

function getResultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (
    typeof result === "object" &&
    result !== null &&
    "rows" in result &&
    Array.isArray((result as { rows: unknown }).rows)
  ) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

async function findInviteStatusByToken(
  tx: InviteStatusLookupTx,
  token: string,
): Promise<InviteStatusLookup | undefined> {
  if (typeof tx.query?.inviteLinks?.findFirst === "function") {
    return tx.query.inviteLinks.findFirst({
      where: eq(inviteLinks.token, token),
    }) as Promise<InviteStatusLookup | undefined>;
  }

  if (!tx.execute) return undefined;

  const result = await tx.execute(sql`
    select
      "id",
      "expires_at" as "expiresAt",
      "used_by" as "usedBy"
    from "invite_links"
    where "token" = ${token}
    limit 1
  `);

  return getResultRows<InviteStatusLookup>(result)[0];
}

export async function acceptInvite(
  db: Database,
  input: { token: string; userId: string; userEmail?: string | null },
): Promise<AcceptInviteResult> {
  const { token, userId } = input;
  const userEmail = input.userEmail?.trim().toLowerCase() ?? null;

  if (!("execute" in db) || typeof db.execute !== "function") {
    const invite = await db.query.inviteLinks.findFirst({
      where: eq(inviteLinks.token, token),
    });

    if (!invite) return { error: "invite_not_found" };
    if (invite.expiresAt < new Date()) return { error: "invite_expired" };
    if (invite.usedBy !== null) return { error: "invite_already_used" };

    const inviteEmail = invite.email?.trim().toLowerCase() ?? null;
    if (inviteEmail && inviteEmail !== userEmail) {
      return { error: "invite_email_mismatch" };
    }

    const permissions = (invite.permissions ?? null) as PermissionOverrides | null;
    const role = invite.role ?? "viewer";
    const entityId = invite.entityId ?? null;
    const orgRole = entityId ? "viewer" : role;
    const orgPermissions = entityId ? null : permissions;
    let existingMember = await db.query?.orgMembers?.findFirst?.({
      where: and(eq(orgMembers.orgId, invite.orgId), eq(orgMembers.userId, userId)),
    });

    if (existingMember && existingMember.deletedAt == null) {
      if (entityId) {
        await db
          .insert(entityMembers)
          .values({
            orgId: invite.orgId,
            orgMemberId: existingMember.id,
            entityId,
            role,
            permissions,
          })
          .onConflictDoNothing()
          .returning();
      }

      await db
        .update(inviteLinks)
        .set({ usedBy: userId, usedAt: new Date() })
        .where(eq(inviteLinks.id, invite.id));

      return { orgId: invite.orgId, role: existingMember.role ?? "viewer" };
    }

    if (existingMember) {
      await db
        .update(orgMembers)
        .set({
          role: orgRole,
          invitedBy: invite.createdBy,
          permissions: orgPermissions,
          deletedAt: null,
        })
        .where(and(eq(orgMembers.orgId, invite.orgId), eq(orgMembers.userId, userId)));
    } else {
      const inserted = await db
        .insert(orgMembers)
        .values({
          orgId: invite.orgId,
          userId,
          role: orgRole,
          invitedBy: invite.createdBy,
          permissions: orgPermissions,
        })
        .onConflictDoNothing()
        .returning();
      if (Array.isArray(inserted) && inserted[0]?.id) {
        existingMember = inserted[0];
      }
    }

    const orgMemberId = existingMember?.id;
    const membershipEntityId =
      entityId ??
      (
        await db.query?.organizations?.findFirst?.({
          where: eq(organizations.id, invite.orgId),
        })
      )?.defaultEntityId;
    if (orgMemberId && membershipEntityId) {
      await db
        .insert(entityMembers)
        .values({
          orgId: invite.orgId,
          orgMemberId,
          entityId: membershipEntityId,
          role,
          permissions,
        })
        .onConflictDoNothing()
        .returning();
    }

    await db
      .update(inviteLinks)
      .set({ usedBy: userId, usedAt: new Date() })
      .where(eq(inviteLinks.id, invite.id));

    return { orgId: invite.orgId, role: orgRole };
  }

  const inviteStatus = await findInviteStatusByToken(db as unknown as InviteStatusLookupTx, token);
  if (!inviteStatus) return { error: "invite_not_found" };
  if (inviteStatus.expiresAt < new Date()) return { error: "invite_expired" };
  if (inviteStatus.usedBy !== null) return { error: "invite_already_used" };

  const membershipId = crypto.randomUUID();
  const entityMembershipId = crypto.randomUUID();
  const claimed = await db.execute(sql`
    with claimed_invite as (
      update "invite_links"
        set "used_by" = ${userId}, "used_at" = now()
        where "token" = ${token}
          and "used_by" is null
          and "expires_at" >= now()
          and (
            "email" is null
            or ${userEmail}::text is not null
            and lower(trim("email")) = ${userEmail}::text
          )
        returning
          "org_id" as "orgId",
          "entity_id" as "entityId",
          "role",
          "permissions",
          "created_by" as "createdBy"
    ),
    existing_member as (
      select
        m."id" as "orgMemberId",
        m."org_id" as "orgId",
        m."user_id" as "userId",
        m."role",
        m."deleted_at" as "deletedAt"
      from "org_members" m
      join claimed_invite i on i."orgId" = m."org_id"
      where m."user_id" = ${userId}
      limit 1
    ),
    reactivated_member as (
      update "org_members" m
        set
          "role" = case when i."entityId" is not null then 'viewer' else coalesce(i."role", 'viewer') end,
          "invited_by" = i."createdBy",
          "permissions" = case when i."entityId" is not null then null else i."permissions" end,
          "deleted_at" = null
        from claimed_invite i
        join existing_member e on e."orgId" = i."orgId"
        where m."org_id" = e."orgId"
          and m."user_id" = e."userId"
          and e."deletedAt" is not null
        returning
          m."id" as "orgMemberId",
          m."org_id" as "orgId",
          coalesce(m."role", 'viewer') as "role"
    ),
    inserted_member as (
      insert into "org_members" (
        "id",
        "org_id",
        "user_id",
        "role",
        "invited_by",
        "permissions"
      )
      select
        ${membershipId},
        i."orgId",
        ${userId},
        case when i."entityId" is not null then 'viewer' else coalesce(i."role", 'viewer') end,
        i."createdBy",
        case when i."entityId" is not null then null else i."permissions" end
      from claimed_invite i
      where not exists (select 1 from existing_member)
      on conflict ("org_id", "user_id") do update
        set "deleted_at" = null
        where "org_members"."deleted_at" is not null
      returning "org_id" as "orgId", coalesce("role", 'viewer') as "role"
        , "id" as "orgMemberId"
    ),
    final_member as (
      select "orgId", "role", "orgMemberId" from reactivated_member
      union all
      select "orgId", "role", "orgMemberId" from inserted_member
      union all
      select e."orgId", coalesce(e."role", 'viewer') as "role", e."orgMemberId"
      from existing_member e
      where e."deletedAt" is null
      union all
      select i."orgId",
        case when i."entityId" is not null then 'viewer' else coalesce(i."role", 'viewer') end as "role",
        ${membershipId} as "orgMemberId"
      from claimed_invite i
      where not exists (select 1 from reactivated_member)
        and not exists (select 1 from inserted_member)
        and not exists (select 1 from existing_member)
      limit 1
    ),
    scoped_entity_member as (
      insert into "entity_members" (
        "id",
        "org_id",
        "org_member_id",
        "entity_id",
        "role",
        "permissions"
      )
      select
        ${entityMembershipId},
        i."orgId",
        f."orgMemberId",
        i."entityId",
        coalesce(i."role", 'viewer'),
        i."permissions"
      from claimed_invite i
      join final_member f on f."orgId" = i."orgId"
      where i."entityId" is not null
      on conflict do nothing
      returning "id"
    ),
    default_entity_member as (
      insert into "entity_members" (
        "id",
        "org_id",
        "org_member_id",
        "entity_id",
        "role",
        "permissions"
      )
      select
        ${entityMembershipId},
        i."orgId",
        f."orgMemberId",
        o."default_entity_id",
        coalesce(i."role", 'viewer'),
        i."permissions"
      from claimed_invite i
      join final_member f on f."orgId" = i."orgId"
      join "organizations" o on o."id" = i."orgId"
      where i."entityId" is null
        and o."default_entity_id" is not null
      on conflict do nothing
      returning "id"
    )
    select "orgId", "role" from final_member
  `);
  const membership = getResultRows<ClaimedInviteMembership>(claimed)[0];

  if (membership) {
    return { orgId: membership.orgId, role: membership.role ?? "viewer" };
  }

  const existingInvite = await findInviteStatusByToken(
    db as unknown as InviteStatusLookupTx,
    token,
  );

  if (!existingInvite) return { error: "invite_not_found" };
  if (existingInvite.expiresAt < new Date()) return { error: "invite_expired" };
  if (existingInvite.usedBy !== null) return { error: "invite_already_used" };
  return { error: "invite_email_mismatch" };
}
