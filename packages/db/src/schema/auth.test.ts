import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { entities, entityMembers, inviteLinks, organizations, trialEmailSchedule } from "./auth";

function columnSqlType(column: { getSQLType: () => string }) {
  return column.getSQLType();
}

describe("trialEmailSchedule", () => {
  it("stores org-scoped trial lifecycle email rows", () => {
    expect(trialEmailSchedule.orgId.name).toBe("org_id");
    expect(trialEmailSchedule.userId.name).toBe("user_id");
    expect(trialEmailSchedule.emailKind.name).toBe("email_kind");
    expect(trialEmailSchedule.sendAfter.name).toBe("send_after");
    expect(trialEmailSchedule.sentAt.name).toBe("sent_at");
    expect(trialEmailSchedule.error.name).toBe("error");
    expect(trialEmailSchedule.trialDeadlineAt.name).toBe("trial_deadline_at");
    expect(organizations.trialWrapupClaimedAt.name).toBe("trial_wrapup_claimed_at");
    expect(organizations.trialWrapupClaimToken.name).toBe("trial_wrapup_claim_token");
    expect(columnSqlType(organizations.trialWrapupClaimToken)).toBe("text");
  });

  it("uses timestamps for delivery lifecycle fields", () => {
    expect(columnSqlType(trialEmailSchedule.sendAfter)).toBe("timestamp with time zone");
    expect(columnSqlType(trialEmailSchedule.sentAt)).toBe("timestamp with time zone");
    expect(columnSqlType(trialEmailSchedule.createdAt)).toBe("timestamp with time zone");
    expect(columnSqlType(trialEmailSchedule.updatedAt)).toBe("timestamp with time zone");
  });

  it("keeps non-wrapup kinds unique while allowing a later wrapup for the same admin", () => {
    const { indexes } = getTableConfig(trialEmailSchedule);
    const nonWrapup = indexes.find(
      (index) => index.config.name === "trial_email_schedule_org_user_non_wrapup_unique",
    );
    expect(nonWrapup?.config.unique).toBe(true);
    expect(
      nonWrapup?.config.columns.map((column) => ("name" in column ? column.name : null)),
    ).toEqual(["org_id", "user_id", "email_kind"]);
    expect(nonWrapup?.config.where).toBeDefined();
    expect(
      indexes.find((index) => index.config.name === "trial_email_schedule_org_user_kind_unique"),
    ).toBeUndefined();
    const wrapup = indexes.find(
      (index) => index.config.name === "trial_email_schedule_org_wrapup_deadline_unique",
    );
    expect(wrapup?.config.unique).toBe(true);
    expect(wrapup?.config.columns.map((column) => ("name" in column ? column.name : null))).toEqual(
      ["org_id", "trial_deadline_at"],
    );
    expect(wrapup?.config.where).toBeDefined();
  });
});

describe("organizations.onboardingGoal", () => {
  it("declares a nullable onboarding_goal column", () => {
    const col = organizations.onboardingGoal;
    expect(col).toBeDefined();
    expect(col.name).toBe("onboarding_goal");
    expect(col.notNull).toBe(false);
  });
});

describe("organizations", () => {
  it("stores the default entity for the organization", () => {
    expect(organizations.defaultEntityId.name).toBe("default_entity_id");
    expect(organizations.defaultEntityId.notNull).toBe(false);
    expect(columnSqlType(organizations.defaultEntityId)).toBe("text");
  });

  it("does not expose removed incentive columns", () => {
    expect(["refer", "ralCode"].join("") in organizations).toBe(false);
    expect(["refer", "ralBonus3GrantedAt"].join("") in organizations).toBe(false);
    expect(["refer", "ralBonus10GrantedAt"].join("") in organizations).toBe(false);
  });

  it("tracks the trial_expired dedup marker as a nullable timestamp", () => {
    expect(organizations.trialExpiredEventAt.name).toBe("trial_expired_event_at");
    expect(columnSqlType(organizations.trialExpiredEventAt)).toBe("timestamp with time zone");
    expect(organizations.trialExpiredEventAt.notNull).toBe(false);
  });

  it("enforces a partial unique index on stripe_customer_id (one customer → one org)", () => {
    const { indexes } = getTableConfig(organizations);
    const stripeIdx = indexes.find(
      (idx) => idx.config.name === "organizations_stripe_customer_id_unique",
    );
    expect(stripeIdx).toBeDefined();
    expect(stripeIdx?.config.unique).toBe(true);
    expect(stripeIdx?.config.columns.map((c) => ("name" in c ? c.name : undefined))).toEqual([
      "stripe_customer_id",
    ]);
    // Partial predicate keeps NULL customer ids (the common case) from colliding.
    expect(stripeIdx?.config.where).toBeDefined();
  });
  it("tracks the latest accepted Stripe state event for webhook ordering", () => {
    expect(organizations.stripeStateEventCreatedAt.name).toBe("stripe_state_event_created_at");
    expect(columnSqlType(organizations.stripeStateEventCreatedAt)).toBe("timestamp with time zone");
    expect(organizations.stripeStateEventCreatedAt.notNull).toBe(false);
    expect(organizations.stripeStateEventId.name).toBe("stripe_state_event_id");
    expect(columnSqlType(organizations.stripeStateEventId)).toBe("text");
    expect(organizations.stripeStateEventId.notNull).toBe(false);
    expect(organizations.stripeStateEventPriority.name).toBe("stripe_state_event_priority");
    expect(columnSqlType(organizations.stripeStateEventPriority)).toBe("integer");
  });
});

describe("entities", () => {
  it("stores org-scoped entity metadata", () => {
    expect(entities.id.name).toBe("id");
    expect(entities.orgId.name).toBe("org_id");
    expect(entities.name.name).toBe("name");
    expect(entities.kind.name).toBe("kind");
    expect(entities.status.name).toBe("status");
    expect(entities.fiscalSponsorModel.name).toBe("fiscal_sponsor_model");
    expect(entities.parentEntityId.name).toBe("parent_entity_id");
    expect(entities.createdAt.name).toBe("created_at");
    expect(entities.updatedAt.name).toBe("updated_at");
    expect(entities.deletedAt.name).toBe("deleted_at");
  });

  it("allows parent entities while keeping the org boundary required", () => {
    expect(entities.orgId.notNull).toBe(true);
    expect(entities.parentEntityId.notNull).toBe(false);
    expect(columnSqlType(entities.orgId)).toBe("text");
    expect(columnSqlType(entities.parentEntityId)).toBe("text");
  });

  it("indexes active entity lookups by organization and name", () => {
    const { indexes } = getTableConfig(entities);

    expect(indexes.map((idx) => idx.config.name)).toEqual(
      expect.arrayContaining(["entities_org_status_idx", "entities_org_name_active_idx"]),
    );
  });
});

describe("entityMembers", () => {
  it("links organization members to entities", () => {
    expect(entityMembers.id.name).toBe("id");
    expect(entityMembers.orgId.name).toBe("org_id");
    expect(entityMembers.entityId.name).toBe("entity_id");
    expect(entityMembers.orgMemberId.name).toBe("org_member_id");
    expect(entityMembers.role.name).toBe("role");
    expect(entityMembers.permissions.name).toBe("permissions");
    expect(entityMembers.createdAt.name).toBe("created_at");
    expect(entityMembers.updatedAt.name).toBe("updated_at");
    expect(entityMembers.deletedAt.name).toBe("deleted_at");
  });

  it("requires one active entity member row per org member/entity pair", () => {
    const { indexes } = getTableConfig(entityMembers);

    expect(entityMembers.entityId.notNull).toBe(true);
    expect(entityMembers.orgMemberId.notNull).toBe(true);
    expect(entityMembers.orgId.notNull).toBe(true);
    expect(indexes.map((idx) => idx.config.name)).toEqual(
      expect.arrayContaining([
        "entity_members_org_idx",
        "entity_members_entity_idx",
        "entity_members_org_member_idx",
        "entity_members_entity_org_member_active_idx",
      ]),
    );
  });
});

describe("inviteLinks", () => {
  it("can preserve the requested entity scope for invite acceptance", () => {
    expect(inviteLinks.entityId.name).toBe("entity_id");
    expect(inviteLinks.entityId.notNull).toBe(false);
    expect(columnSqlType(inviteLinks.entityId)).toBe("text");
  });
});
