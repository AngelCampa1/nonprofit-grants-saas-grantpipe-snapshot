import { describe, expect, it, vi } from "vitest";
import type { AppEnv } from "../types";
import {
  listEntityAccessForOrgMember,
  listEntityAccessForUser,
  toOrgMembershipEntityAccess,
} from "./entity-access";

function buildDb({
  orgMember,
  entityRows,
}: {
  orgMember?: { id: string } | null;
  entityRows: unknown[];
}) {
  return {
    query: {
      orgMembers: {
        findFirst: vi.fn().mockResolvedValue(orgMember),
      },
      entityMembers: {
        findMany: vi.fn().mockResolvedValue(entityRows),
      },
    },
  } as unknown as AppEnv["Variables"]["db"];
}

describe("entity access serialization", () => {
  it("returns no entity access when the user has no active org membership", async () => {
    const db = buildDb({ orgMember: null, entityRows: [{ entityId: "entity-1" }] });

    const result = await listEntityAccessForUser(db, {
      orgId: "org-1",
      userId: "user-1",
      defaultEntityId: "entity-1",
    });

    expect(result).toEqual([]);
    expect(db.query.entityMembers.findMany).not.toHaveBeenCalled();
  });

  it("serializes active entity memberships with effective permissions", async () => {
    const db = buildDb({
      orgMember: { id: "org-member-1" },
      entityRows: [
        {
          entityId: "entity-1",
          role: "admin",
          permissions: { reports: "none" },
          entity: {
            id: "entity-1",
            name: "Foundation Alpha",
            kind: "root",
            status: "active",
            fiscalSponsorModel: "none",
            parentEntityId: null,
            deletedAt: null,
          },
        },
        {
          entityId: "entity-2",
          role: "editor",
          permissions: { reports: "view" },
          entity: {
            id: "entity-2",
            name: "Sponsored Project",
            kind: "sponsored_project",
            status: "active",
            fiscalSponsorModel: "model_a",
            parentEntityId: "entity-1",
            deletedAt: null,
          },
        },
        {
          entityId: "entity-3",
          role: "viewer",
          permissions: null,
          entity: {
            id: "entity-3",
            name: "Archived Entity",
            kind: "legal_entity",
            status: "archived",
            fiscalSponsorModel: "none",
            parentEntityId: null,
            deletedAt: null,
          },
        },
        {
          entityId: "entity-4",
          role: "viewer",
          permissions: null,
          entity: {
            id: "entity-4",
            name: "Deleted Entity",
            kind: "legal_entity",
            status: "active",
            fiscalSponsorModel: "none",
            parentEntityId: null,
            deletedAt: new Date("2026-01-01T00:00:00.000Z"),
          },
        },
        {
          entityId: "entity-5",
          role: "viewer",
          permissions: null,
          entity: null,
        },
      ],
    });

    const result = await listEntityAccessForUser(db, {
      orgId: "org-1",
      userId: "user-1",
      defaultEntityId: "entity-1",
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: "entity-1",
      name: "Foundation Alpha",
      role: "admin",
      isDefault: true,
      permissions: { reports: "manage" },
    });
    expect(result[1]).toMatchObject({
      id: "entity-2",
      name: "Sponsored Project",
      role: "editor",
      isDefault: false,
      permissions: { reports: "view" },
    });
  });

  it("converts session entity access to org membership summaries", async () => {
    const db = buildDb({
      orgMember: { id: "org-member-1" },
      entityRows: [
        {
          entityId: "entity-1",
          role: "viewer",
          permissions: null,
          entity: {
            id: "entity-1",
            name: "Foundation Alpha",
            kind: "root",
            status: "active",
            fiscalSponsorModel: "none",
            parentEntityId: null,
          },
        },
      ],
    });

    const sessionAccess = await listEntityAccessForOrgMember(db, {
      orgId: "org-1",
      orgMemberId: "org-member-1",
    });

    expect(toOrgMembershipEntityAccess(sessionAccess)).toEqual([
      {
        entityId: "entity-1",
        entityName: "Foundation Alpha",
        kind: "root",
        status: "active",
        fiscalSponsorModel: "none",
        parentEntityId: null,
        role: "viewer",
        permissions: {
          entitySettings: "view",
          entityTeam: "none",
          grants: "view",
          funds: "view",
          documents: "view",
          compliance: "view",
          accounting: "view",
          reports: "view",
        },
      },
    ]);
  });
});
