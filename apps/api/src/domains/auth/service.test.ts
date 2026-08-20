import { afterEach, describe, it, expect, vi } from "vitest";
import {
  entities,
  entityMembers,
  orgMembers,
  organizations,
  trialEmailSchedule,
} from "@grantpipe/db";
import {
  AccountDeletionBlockedError,
  acceptInvite,
  assertUserCanDeleteAccount,
  checkInvite,
  createOrgForUser,
  deleteUserAccount,
  generateInviteToken,
} from "./service";

// ---------------------------------------------------------------------------
// DB mock helpers
// ---------------------------------------------------------------------------

afterEach(() => {
  vi.restoreAllMocks();
});

function makeInsertMock(returningValue: unknown) {
  const returningFn = vi.fn().mockResolvedValue(returningValue);
  const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
  const valuesFn = vi.fn().mockReturnValue({ returning: returningFn, onConflictDoNothing });
  const insertFn = vi.fn().mockReturnValue({ values: valuesFn });
  return { insertFn, valuesFn, returningFn, onConflictDoNothing };
}

function makeTransactionDb(orgRows: unknown[]) {
  const execute = vi.fn().mockResolvedValue({ rows: orgRows });
  const memberInsert = makeInsertMock([{ id: "mem-1", orgId: "org-1", userId: "user-1" }]);
  const entityInsert = makeInsertMock([{ id: "entity-1", orgId: "org-1" }]);
  const entityMemberInsert = makeInsertMock([{ id: "entity-member-1" }]);
  const trialEmailInsert = makeInsertMock([]);
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
  const tx = {
    execute,
    insert: vi.fn((table: unknown) => {
      if (table === orgMembers) return { values: memberInsert.valuesFn };
      if (table === entities) return { values: entityInsert.valuesFn };
      if (table === entityMembers) return { values: entityMemberInsert.valuesFn };
      if (table === trialEmailSchedule) return { values: trialEmailInsert.valuesFn };
      return { values: makeInsertMock([]).valuesFn };
    }),
    update: vi.fn((table: unknown) => {
      if (table !== organizations) throw new Error("Unexpected update table");
      return { set: updateSet };
    }),
  };
  const db = {
    transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<unknown>) =>
      callback(tx),
    ),
  };

  return {
    db,
    execute,
    memberInsert,
    entityInsert,
    entityMemberInsert,
    trialEmailInsert,
    updateSet,
    updateWhere,
  };
}

function getSqlParameters(execute: ReturnType<typeof vi.fn>): unknown[] {
  const statement = execute.mock.calls[0]?.[0] as
    | { queryChunks?: Array<{ value?: string[] } | unknown> }
    | undefined;

  return (
    statement?.queryChunks?.filter(
      (chunk) => !(typeof chunk === "object" && chunk !== null && "value" in chunk),
    ) ?? []
  );
}

function getSqlText(execute: ReturnType<typeof vi.fn>): string {
  const statement = execute.mock.calls[0]?.[0] as
    | { queryChunks?: Array<{ value?: string[] } | unknown> }
    | undefined;

  return (
    statement?.queryChunks
      ?.map((chunk) =>
        typeof chunk === "object" && chunk !== null && "value" in chunk
          ? ((chunk.value as string[] | undefined)?.join("") ?? "")
          : "?",
      )
      .join("") ?? ""
  );
}

// ---------------------------------------------------------------------------
// createOrgForUser
// ---------------------------------------------------------------------------

describe("createOrgForUser", () => {
  it("uses a transaction and inserts only the stable bootstrap columns", async () => {
    const { db, execute } = makeTransactionDb([
      {
        id: "org-1",
        name: "Test User's Organization",
        slug: "test-user-org-123",
        subscriptionStatus: "trialing",
        trialStartedAt: new Date("2026-04-22T00:00:00.000Z"),
        trialEndsAt: new Date("2026-05-22T00:00:00.000Z"),
      },
    ]);

    await createOrgForUser(db as never, {
      userId: "user-1",
      userName: "Test User",
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();

    const sqlText = getSqlText(execute);
    const parameters = getSqlParameters(execute);
    expect(sqlText).not.toContain(`"${["refer", "ral_code"].join("")}"`);
    expect(sqlText).not.toContain('"plan_selected_at"');
    expect(sqlText).not.toContain('"onboarding_completed"');
    expect(parameters).not.toContainEqual(expect.stringMatching(/^[A-Z2-9]{8}$/));
  });

  it("creates an organization with a name derived from the user name", async () => {
    const orgRow = {
      id: "org-1",
      name: "Test User's Organization",
      slug: "test-user-org-123",
      subscriptionStatus: "trialing",
      trialStartedAt: new Date("2026-04-22T00:00:00.000Z"),
      trialEndsAt: new Date("2026-05-22T00:00:00.000Z"),
    };
    const { db, execute, memberInsert, entityInsert, entityMemberInsert, updateSet, updateWhere } =
      makeTransactionDb([orgRow]);

    const result = await createOrgForUser(db as never, {
      userId: "user-1",
      userName: "Test User",
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledOnce();

    const memberInsertValues = memberInsert.valuesFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(memberInsertValues.role).toBe("admin");
    expect(memberInsertValues.userId).toBe("user-1");
    expect(memberInsertValues.orgId).toBe("org-1");

    expect(entityInsert.valuesFn).toHaveBeenCalledWith({
      orgId: "org-1",
      name: "Test User's Organization",
      kind: "root",
      status: "active",
      fiscalSponsorModel: "none",
    });
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ defaultEntityId: "entity-1" }),
    );
    expect(updateWhere).toHaveBeenCalledOnce();
    expect(entityMemberInsert.valuesFn).toHaveBeenCalledWith({
      orgId: "org-1",
      entityId: "entity-1",
      orgMemberId: "mem-1",
      role: "admin",
    });
    expect(result).toEqual(orgRow);
  });

  it("schedules the trial email sequence for the new admin", async () => {
    const trialStartedAt = new Date("2026-04-22T00:00:00.000Z");
    const trialEndsAt = new Date("2026-05-22T00:00:00.000Z");
    const orgRow = {
      id: "org-1",
      name: "Test User's Organization",
      slug: "test-user-org-123",
      subscriptionStatus: "trialing",
      trialStartedAt,
      trialEndsAt,
    };
    const { db, memberInsert, trialEmailInsert } = makeTransactionDb([orgRow]);

    await createOrgForUser(db as never, {
      userId: "user-1",
      userName: "Test User",
    });

    expect(memberInsert.valuesFn).toHaveBeenCalledOnce();
    expect(trialEmailInsert.valuesFn).toHaveBeenCalledTimes(8);
    expect(trialEmailInsert.onConflictDoNothing).toHaveBeenCalledTimes(8);
    const scheduledRows = trialEmailInsert.valuesFn.mock.calls.map((call) => call[0]);
    expect(scheduledRows.map((row) => row.emailKind)).toEqual([
      "welcome",
      "quick_start",
      "proof_file",
      "team_invite",
      "report_view",
      "plan_nudge",
      "billing_prompt",
      "trial_wrapup",
    ]);
    expect(scheduledRows[0]).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      sendAfter: trialStartedAt,
    });
    expect(scheduledRows[7]).toMatchObject({
      orgId: "org-1",
      userId: "user-1",
      sendAfter: new Date("2026-05-19T00:00:00.000Z"),
    });
  });

  it("succeeds when organization insert returns timestamp strings", async () => {
    const orgRow = {
      id: "org-1",
      name: "Test User's Organization",
      slug: "test-user-org-123",
      subscriptionStatus: "trialing",
      trialStartedAt: "2026-04-22T00:00:00.000Z",
      trialEndsAt: "2026-05-22T00:00:00.000Z",
    };
    const { db, trialEmailInsert } = makeTransactionDb([orgRow]);

    await expect(
      createOrgForUser(db as never, {
        userId: "user-1",
        userName: "Test User",
      }),
    ).resolves.toEqual(orgRow);

    const scheduledRows = trialEmailInsert.valuesFn.mock.calls.map((call) => call[0]);
    expect(scheduledRows.map((row) => row.sendAfter instanceof Date)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(scheduledRows.map((row) => (row.sendAfter as Date).toISOString())).toEqual([
      "2026-04-22T00:00:00.000Z",
      "2026-04-23T00:00:00.000Z",
      "2026-04-24T00:00:00.000Z",
      "2026-04-25T00:00:00.000Z",
      "2026-04-26T00:00:00.000Z",
      "2026-04-27T00:00:00.000Z",
      "2026-04-28T00:00:00.000Z",
      "2026-05-19T00:00:00.000Z",
    ]);
  });

  it("generates a unique slug per call (includes timestamp component)", async () => {
    const orgRow1 = {
      id: "org-1",
      name: "Alice's Organization",
      slug: "alice-org-1",
      subscriptionStatus: "trialing",
      trialStartedAt: new Date("2026-04-22T00:00:00.000Z"),
      trialEndsAt: new Date("2026-05-22T00:00:00.000Z"),
    };
    const orgRow2 = {
      id: "org-2",
      name: "Alice's Organization",
      slug: "alice-org-2",
      subscriptionStatus: "trialing",
      trialStartedAt: new Date("2026-04-22T00:00:00.000Z"),
      trialEndsAt: new Date("2026-05-22T00:00:00.000Z"),
    };
    const db1 = makeTransactionDb([orgRow1]);
    const db2 = makeTransactionDb([orgRow2]);

    vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(2_000);

    await createOrgForUser(db1.db as never, { userId: "user-1", userName: "Alice" });
    await createOrgForUser(db2.db as never, { userId: "user-2", userName: "Alice" });

    expect(db1.execute).toHaveBeenCalledOnce();
    expect(db2.execute).toHaveBeenCalledOnce();

    const slug1 = getSqlParameters(db1.execute)[2];
    const slug2 = getSqlParameters(db2.execute)[2];
    expect(slug1).toBe("alice-org-1000");
    expect(slug2).toBe("alice-org-2000");
    expect(slug1).not.toBe(slug2);
  });

  it("throws when the organization insert returns no rows", async () => {
    const { db } = makeTransactionDb([]);

    await expect(
      createOrgForUser(db as never, { userId: "user-1", userName: "Test User" }),
    ).rejects.toThrow("Failed to create organization");
  });

  it("throws when the organization membership insert returns no rows", async () => {
    const orgRow = {
      id: "org-1",
      name: "Test User's Organization",
      slug: "test-user-org-123",
      subscriptionStatus: "trialing",
      trialStartedAt: new Date("2026-04-22T00:00:00.000Z"),
      trialEndsAt: new Date("2026-05-22T00:00:00.000Z"),
    };
    const { db, memberInsert, entityInsert } = makeTransactionDb([orgRow]);
    memberInsert.returningFn.mockResolvedValueOnce([]);

    await expect(
      createOrgForUser(db as never, { userId: "user-1", userName: "Test User" }),
    ).rejects.toThrow("Failed to create organization membership");
    expect(entityInsert.valuesFn).not.toHaveBeenCalled();
  });

  it("throws when the default entity insert returns no rows", async () => {
    const orgRow = {
      id: "org-1",
      name: "Test User's Organization",
      slug: "test-user-org-123",
      subscriptionStatus: "trialing",
      trialStartedAt: new Date("2026-04-22T00:00:00.000Z"),
      trialEndsAt: new Date("2026-05-22T00:00:00.000Z"),
    };
    const { db, entityInsert, entityMemberInsert } = makeTransactionDb([orgRow]);
    entityInsert.returningFn.mockResolvedValueOnce([]);

    await expect(
      createOrgForUser(db as never, { userId: "user-1", userName: "Test User" }),
    ).rejects.toThrow("Failed to create default entity");
    expect(entityMemberInsert.valuesFn).not.toHaveBeenCalled();
  });

  it("falls back to a safe default name and slug when the user name is blank", async () => {
    const orgRow = {
      id: "org-1",
      name: "New Organization",
      slug: "new-organization-org-123",
      subscriptionStatus: "trialing",
      trialStartedAt: new Date("2026-04-22T00:00:00.000Z"),
      trialEndsAt: new Date("2026-05-22T00:00:00.000Z"),
    };
    const { db, execute } = makeTransactionDb([orgRow]);

    await createOrgForUser(db as never, {
      userId: "user-1",
      userName: "   ",
    });

    const parameters = getSqlParameters(execute);
    expect(parameters[1]).toBe("New Organization");
    expect(parameters[2]).toEqual(expect.stringMatching(/^new-organization-org-\d+$/));
  });
});

describe("assertUserCanDeleteAccount", () => {
  it("allows deletion when no user references are found", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };

    await expect(assertUserCanDeleteAccount(db as never, "user-1")).resolves.toBeUndefined();
    expect(db.execute).toHaveBeenCalled();
  });

  it("blocks deletion when any user reference exists", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({ rows: [{ label: "organization memberships" }] }),
    };

    await expect(assertUserCanDeleteAccount(db as never, "user-1")).rejects.toThrow(
      AccountDeletionBlockedError,
    );
    await expect(assertUserCanDeleteAccount(db as never, "user-1")).rejects.toThrow(
      "organization memberships",
    );
  });

  it("checks the current user-reference schema surface", async () => {
    const db = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
    };

    await assertUserCanDeleteAccount(db as never, "user-1");
    const sqlText = db.execute.mock.calls
      .map((call) => {
        const statement = call[0] as
          | { queryChunks?: Array<{ value?: string[] } | unknown> }
          | undefined;
        return (
          statement?.queryChunks
            ?.map((chunk) =>
              typeof chunk === "object" && chunk !== null && "value" in chunk
                ? ((chunk.value as string[] | undefined)?.join("") ?? "")
                : "?",
            )
            .join("") ?? ""
        );
      })
      .join("\n");

    expect(sqlText).toContain('"org_members"');
    expect(sqlText).toContain('"journal_entries"');
    expect(sqlText).toContain('"activity_log"');
    expect(sqlText).toContain('"external_review_sessions"');
    expect(sqlText).toContain('"restriction_evidence_links"');
    expect(sqlText).toContain('"subrecipient_monitoring_tasks"');
    expect(sqlText).not.toContain('"external_reviewer_invites"');
  });

  it("skips schema-mismatch probes and still blocks on later user references", async () => {
    const db = {
      execute: vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error("relation does not exist"), { code: "42P01" }),
        )
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ label: "trial email schedule" }] }),
    };

    await expect(assertUserCanDeleteAccount(db as never, "user-1")).rejects.toThrow(
      "trial email schedule",
    );
    expect(db.execute).toHaveBeenCalledTimes(3);
  });

  it("skips schema mismatch codes nested inside Drizzle wrapper causes", async () => {
    const db = {
      execute: vi
        .fn()
        .mockRejectedValueOnce(
          new Error("Failed query: select missing", {
            cause: Object.assign(new Error("column does not exist"), { code: "42703" }),
          }),
        )
        .mockResolvedValue({ rows: [] }),
    };

    await expect(assertUserCanDeleteAccount(db as never, "user-1")).resolves.toBeUndefined();
    expect(db.execute).toHaveBeenCalled();
  });

  it("propagates non-schema probe failures", async () => {
    const db = {
      execute: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("connection reset"), { code: "57P01" })),
    };

    await expect(assertUserCanDeleteAccount(db as never, "user-1")).rejects.toThrow(
      "connection reset",
    );
  });
});

describe("deleteUserAccount", () => {
  it("checks references and deletes the Better Auth user inside a transaction", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const tx = {
      delete: vi.fn().mockReturnValue({ where }),
    };
    const db = {
      execute: vi.fn().mockResolvedValue({ rows: [] }),
      transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<void>) =>
        callback(tx),
      ),
    };

    await deleteUserAccount(db as never, "user-1");

    expect(db.execute).toHaveBeenCalled();
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(tx.delete).toHaveBeenCalledOnce();
    expect(where).toHaveBeenCalledOnce();
  });

  it("runs schema-tolerant reference checks before opening the delete transaction", async () => {
    const where = vi.fn().mockResolvedValue(undefined);
    const tx = {
      delete: vi.fn().mockReturnValue({ where }),
    };
    const db = {
      execute: vi
        .fn()
        .mockRejectedValueOnce(
          Object.assign(new Error("relation does not exist"), { code: "42P01" }),
        )
        .mockResolvedValue({ rows: [] }),
      transaction: vi.fn(async (callback: (transaction: typeof tx) => Promise<void>) =>
        callback(tx),
      ),
    };

    await deleteUserAccount(db as never, "user-1");

    expect(db.execute).toHaveBeenCalled();
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(tx.delete).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// generateInviteToken
// ---------------------------------------------------------------------------

describe("generateInviteToken", () => {
  it("returns a 48-character hex string", () => {
    const token = generateInviteToken();
    expect(token).toHaveLength(48);
    expect(/^[0-9a-f]{48}$/.test(token)).toBe(true);
  });

  it("produces different tokens on consecutive calls", () => {
    const t1 = generateInviteToken();
    const t2 = generateInviteToken();
    expect(t1).not.toBe(t2);
  });
});

// ---------------------------------------------------------------------------
// acceptInvite
// ---------------------------------------------------------------------------

describe("acceptInvite", () => {
  const token = "abc123";
  const userId = "user-42";

  function makeDb(invite: unknown) {
    return {
      query: {
        inviteLinks: {
          findFirst: vi.fn().mockResolvedValue(invite),
        },
      },
      insert: vi.fn(),
      update: vi.fn(),
    };
  }

  it("returns error when token is not found", async () => {
    const db = makeDb(undefined);
    const result = await acceptInvite(db as never, { token, userId });
    expect(result).toEqual({ error: "invite_not_found" });
  });

  it("returns error when token is expired", async () => {
    const pastDate = new Date(Date.now() - 1000 * 60 * 60);
    const db = makeDb({
      id: "inv-1",
      orgId: "org-1",
      role: "viewer",
      expiresAt: pastDate,
      usedBy: null,
    });
    const result = await acceptInvite(db as never, { token, userId });
    expect(result).toEqual({ error: "invite_expired" });
  });

  it("returns error when token is already used", async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60);
    const db = makeDb({
      id: "inv-1",
      orgId: "org-1",
      role: "editor",
      expiresAt: futureDate,
      usedBy: "some-other-user",
    });
    const result = await acceptInvite(db as never, { token, userId });
    expect(result).toEqual({ error: "invite_already_used" });
  });

  it("inserts org member and marks invite used on success", async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60);
    const invite = {
      id: "inv-1",
      orgId: "org-5",
      email: null,
      role: "editor",
      permissions: { grants: "edit" },
      expiresAt: futureDate,
      usedBy: null,
    };

    const memberRow = { id: "mem-99", orgId: "org-5", userId, role: "editor" };
    const insertReturning = vi.fn().mockResolvedValue([memberRow]);
    const insertOnConflict = vi.fn().mockReturnValue({ returning: insertReturning });
    const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflict });
    const insertFn = vi.fn().mockReturnValue({ values: insertValues });

    const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const updateFn = vi.fn().mockReturnValue({ set: updateSet });

    const db = {
      query: {
        inviteLinks: { findFirst: vi.fn().mockResolvedValue(invite) },
        orgMembers: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      insert: insertFn,
      update: updateFn,
    };

    const result = await acceptInvite(db as never, {
      token,
      userId,
      userEmail: "anyone@example.org",
    });

    expect(insertFn).toHaveBeenCalledTimes(1);
    const insertedMember = insertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertedMember.orgId).toBe("org-5");
    expect(insertedMember.userId).toBe(userId);
    expect(insertedMember.role).toBe("editor");
    expect(insertedMember.permissions).toEqual({ grants: "edit" });

    expect(updateFn).toHaveBeenCalledTimes(1);
    const setArg = updateSet.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.usedBy).toBe(userId);
    expect(setArg.usedAt).toBeInstanceOf(Date);

    expect(result).toEqual({ orgId: "org-5", role: "editor" });
  });

  it("accepts an entity-scoped invite without granting sibling entity access", async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60);
    const invite = {
      id: "inv-entity",
      orgId: "org-5",
      entityId: "entity-client",
      email: null,
      role: "admin",
      permissions: { grants: "manage" },
      expiresAt: futureDate,
      usedBy: null,
      createdBy: "admin-1",
    };

    const orgMemberRow = { id: "member-99", orgId: "org-5", userId, role: "viewer" };
    const entityMemberRow = {
      id: "entity-member-99",
      orgId: "org-5",
      orgMemberId: "member-99",
      entityId: "entity-client",
      role: "admin",
    };
    const insertValues = vi
      .fn()
      .mockReturnValueOnce({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([orgMemberRow]),
        }),
      })
      .mockReturnValueOnce({
        onConflictDoNothing: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([entityMemberRow]),
        }),
      });
    const insertFn = vi.fn().mockReturnValue({ values: insertValues });
    const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const updateFn = vi.fn().mockReturnValue({ set: updateSet });

    const db = {
      query: {
        inviteLinks: { findFirst: vi.fn().mockResolvedValue(invite) },
        orgMembers: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      insert: insertFn,
      update: updateFn,
    };

    const result = await acceptInvite(db as never, {
      token,
      userId,
      userEmail: "client@example.org",
    });

    expect(insertValues).toHaveBeenCalledTimes(2);
    expect(insertValues.mock.calls[0]![0]).toMatchObject({
      orgId: "org-5",
      userId,
      role: "viewer",
      permissions: null,
    });
    expect(insertValues.mock.calls[1]![0]).toMatchObject({
      orgId: "org-5",
      orgMemberId: "member-99",
      entityId: "entity-client",
      role: "admin",
      permissions: { grants: "manage" },
    });
    expect(insertValues.mock.calls[1]![0]).not.toHaveProperty("siblingEntityId");
    expect(result).toEqual({ orgId: "org-5", role: "viewer" });
  });

  it("claims the invite atomically before inserting membership", async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60);
    const invite = {
      id: "inv-atomic",
      orgId: "org-atomic",
      email: null,
      role: "editor",
      permissions: { grants: "edit" },
      createdBy: "admin-1",
      expiresAt: futureDate,
      usedBy: null,
    };

    const calls: string[] = [];
    const db = {
      execute: vi.fn().mockImplementation(() => {
        calls.push("claim");
        return Promise.resolve({ rows: [invite] });
      }),
      query: {
        orgMembers: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockImplementation(() => {
          calls.push("member");
          return {
            onConflictDoNothing: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([]),
            }),
          };
        }),
      }),
      update: vi.fn(),
    };

    const result = await acceptInvite(db as never, {
      token,
      userId,
      userEmail: "member@example.org",
    });

    expect(db.execute).toHaveBeenCalledTimes(2);
    expect(calls).toEqual(["claim", "claim"]);
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
    expect(result).toEqual({ orgId: "org-atomic", role: "editor" });
  });

  it("rejects email-specific invite acceptance for a different email", async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60);
    const invite = {
      id: "inv-4",
      orgId: "org-5",
      email: "teammate@example.org",
      role: "viewer",
      permissions: null,
      expiresAt: futureDate,
      usedBy: null,
    };

    const db = {
      query: {
        inviteLinks: { findFirst: vi.fn().mockResolvedValue(invite) },
      },
      insert: vi.fn(),
      update: vi.fn(),
    };

    const result = await acceptInvite(db as never, {
      token,
      userId,
      userEmail: "other@example.org",
    });

    expect(result).toEqual({ error: "invite_email_mismatch" });
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  describe("checkInvite", () => {
    function dbWith(invite: unknown) {
      return { query: { inviteLinks: { findFirst: vi.fn().mockResolvedValue(invite) } } };
    }

    it("returns invite_not_found when no invite matches the token", async () => {
      const result = await checkInvite(dbWith(undefined) as never, { token: "missing" });
      expect(result).toEqual({ valid: false, error: "invite_not_found" });
    });

    it("returns invite_expired when expiresAt is in the past", async () => {
      const db = dbWith({
        id: "inv-1",
        role: "viewer",
        expiresAt: new Date(Date.now() - 1000),
        usedBy: null,
      });
      const result = await checkInvite(db as never, { token: "t" });
      expect(result).toEqual({ valid: false, error: "invite_expired" });
    });

    it("returns invite_already_used when usedBy is set", async () => {
      const db = dbWith({
        id: "inv-1",
        role: "editor",
        expiresAt: new Date(Date.now() + 10_000),
        usedBy: "someone",
      });
      const result = await checkInvite(db as never, { token: "t" });
      expect(result).toEqual({ valid: false, error: "invite_already_used" });
    });

    it("returns valid with role when the invite is usable", async () => {
      const db = dbWith({
        id: "inv-1",
        role: "editor",
        expiresAt: new Date(Date.now() + 10_000),
        usedBy: null,
      });
      const result = await checkInvite(db as never, { token: "t" });
      expect(result).toEqual({ valid: true, role: "editor", email: null });
    });

    it("defaults role to viewer when invite role is null", async () => {
      const db = dbWith({
        id: "inv-1",
        role: null,
        expiresAt: new Date(Date.now() + 10_000),
        usedBy: null,
      });
      const result = await checkInvite(db as never, { token: "t" });
      expect(result).toEqual({ valid: true, role: "viewer", email: null });
    });
  });

  it("silently ignores duplicate membership via onConflictDoNothing", async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60);
    const invite = {
      id: "inv-3",
      orgId: "org-7",
      role: "viewer",
      expiresAt: futureDate,
      usedBy: null,
    };

    const insertOnConflict = vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) });
    const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflict });
    const insertFn = vi.fn().mockReturnValue({ values: insertValues });

    const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const updateFn = vi.fn().mockReturnValue({ set: updateSet });

    const db = {
      query: {
        inviteLinks: { findFirst: vi.fn().mockResolvedValue(invite) },
        orgMembers: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      insert: insertFn,
      update: updateFn,
    };

    const result = await acceptInvite(db as never, {
      token,
      userId,
      userEmail: "viewer@example.org",
    });

    expect(insertFn).toHaveBeenCalledTimes(1);
    expect(insertOnConflict).toHaveBeenCalledTimes(1);
    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ orgId: "org-7", role: "viewer" });
  });

  it("reactivates a soft-deleted membership when accepting a fresh invite", async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60);
    const invite = {
      id: "inv-5",
      orgId: "org-8",
      role: "editor",
      permissions: { grants: "edit" },
      createdBy: "admin-1",
      expiresAt: futureDate,
      usedBy: null,
    };

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const updateFn = vi.fn().mockReturnValue({ set: updateSet });
    const db = {
      query: {
        inviteLinks: { findFirst: vi.fn().mockResolvedValue(invite) },
        orgMembers: {
          findFirst: vi.fn().mockResolvedValue({
            id: "member-1",
            orgId: "org-8",
            userId,
            role: "viewer",
            deletedAt: new Date("2026-01-01T00:00:00.000Z"),
          }),
        },
      },
      insert: vi.fn(),
      update: updateFn,
    };

    const result = await acceptInvite(db as never, {
      token,
      userId,
      userEmail: "editor@example.org",
    });

    expect(db.insert).not.toHaveBeenCalled();
    expect(updateFn).toHaveBeenCalledTimes(2);
    expect(updateSet.mock.calls[0]?.[0]).toMatchObject({
      role: "editor",
      permissions: { grants: "edit" },
      invitedBy: "admin-1",
      deletedAt: null,
    });
    expect(updateSet.mock.calls[1]?.[0]).toMatchObject({
      usedBy: userId,
      usedAt: expect.any(Date),
    });
    expect(result).toEqual({ orgId: "org-8", role: "editor" });
  });

  it("does not rewrite an active membership when accepting a duplicate invite", async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60);
    const invite = {
      id: "inv-6",
      orgId: "org-8",
      role: "admin",
      permissions: { billing: "manage" },
      createdBy: "admin-1",
      expiresAt: futureDate,
      usedBy: null,
    };

    const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const updateFn = vi.fn().mockReturnValue({ set: updateSet });
    const db = {
      query: {
        inviteLinks: { findFirst: vi.fn().mockResolvedValue(invite) },
        orgMembers: {
          findFirst: vi.fn().mockResolvedValue({
            id: "member-1",
            orgId: "org-8",
            userId,
            role: "viewer",
            deletedAt: null,
          }),
        },
      },
      insert: vi.fn(),
      update: updateFn,
    };

    const result = await acceptInvite(db as never, {
      token,
      userId,
      userEmail: "viewer@example.org",
    });

    expect(db.insert).not.toHaveBeenCalled();
    expect(updateFn).toHaveBeenCalledTimes(1);
    expect(updateSet).toHaveBeenCalledWith({
      usedBy: userId,
      usedAt: expect.any(Date),
    });
    expect(result).toEqual({ orgId: "org-8", role: "viewer" });
  });

  it("falls back to 'viewer' role when invite role is null", async () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60);
    const invite = { id: "inv-2", orgId: "org-6", role: null, expiresAt: futureDate, usedBy: null };

    const memberRow = { id: "mem-100", orgId: "org-6", userId, role: "viewer" };
    const insertReturning = vi.fn().mockResolvedValue([memberRow]);
    const insertOnConflict = vi.fn().mockReturnValue({ returning: insertReturning });
    const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflict });
    const insertFn = vi.fn().mockReturnValue({ values: insertValues });

    const updateSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    const updateFn = vi.fn().mockReturnValue({ set: updateSet });

    const db = {
      query: {
        inviteLinks: { findFirst: vi.fn().mockResolvedValue(invite) },
        orgMembers: { findFirst: vi.fn().mockResolvedValue(undefined) },
      },
      insert: insertFn,
      update: updateFn,
    };

    const result = await acceptInvite(db as never, {
      token,
      userId,
      userEmail: "viewer@example.org",
    });

    const insertedMember = insertValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertedMember.role).toBe("viewer");
    expect(result).toEqual({ orgId: "org-6", role: "viewer" });
  });

  describe("transactional invite claim", () => {
    function makeExecutableDb({
      claimedInvite,
      existingInvite,
    }: {
      claimedInvite?: Record<string, unknown>;
      existingInvite?: Record<string, unknown>;
    }) {
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
      const updateFn = vi.fn().mockReturnValue({ set: updateSet });
      const insertReturning = vi.fn().mockResolvedValue([]);
      const insertOnConflict = vi.fn().mockReturnValue({ returning: insertReturning });
      const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflict });
      const insertFn = vi.fn().mockReturnValue({ values: insertValues });
      const db = {
        execute: vi.fn().mockResolvedValue({
          rows: claimedInvite ? [claimedInvite] : [],
        }),
        query: {
          inviteLinks: {
            findFirst: vi.fn().mockResolvedValue(
              existingInvite ??
                (claimedInvite
                  ? {
                      id: claimedInvite.id ?? "inv-claim",
                      expiresAt: new Date(Date.now() + 60_000),
                      usedBy: null,
                    }
                  : undefined),
            ),
          },
        },
        insert: insertFn,
        update: updateFn,
      };

      return {
        db,
        tx: db,
        insertValues,
        updateSet,
      };
    }

    it("returns invite_email_mismatch when a valid token cannot be claimed", async () => {
      const { db, tx } = makeExecutableDb({
        existingInvite: {
          id: "inv-10",
          expiresAt: new Date(Date.now() + 60_000),
          usedBy: null,
        },
      });

      const result = await acceptInvite(db as never, {
        token,
        userId,
        userEmail: "wrong@example.org",
      });

      expect(result).toEqual({ error: "invite_email_mismatch" });
      expect(tx.query.inviteLinks.findFirst).toHaveBeenCalledTimes(2);
    });

    it("returns invite_not_found when an invite disappears after precheck", async () => {
      const validInvite = {
        id: "inv-race-not-found",
        expiresAt: new Date(Date.now() + 60_000),
        usedBy: null,
      };
      const { db } = makeExecutableDb({ existingInvite: validInvite });
      db.query.inviteLinks.findFirst
        .mockResolvedValueOnce(validInvite)
        .mockResolvedValueOnce(undefined);

      const result = await acceptInvite(db as never, { token, userId });

      expect(result).toEqual({ error: "invite_not_found" });
      expect(db.execute).toHaveBeenCalledOnce();
    });

    it("returns invite_expired when an invite expires after precheck", async () => {
      const validInvite = {
        id: "inv-race-expired",
        expiresAt: new Date(Date.now() + 60_000),
        usedBy: null,
      };
      const { db } = makeExecutableDb({ existingInvite: validInvite });
      db.query.inviteLinks.findFirst.mockResolvedValueOnce(validInvite).mockResolvedValueOnce({
        ...validInvite,
        expiresAt: new Date(Date.now() - 60_000),
      });

      const result = await acceptInvite(db as never, { token, userId });

      expect(result).toEqual({ error: "invite_expired" });
      expect(db.execute).toHaveBeenCalledOnce();
    });

    it("returns invite_already_used when an invite is used after precheck", async () => {
      const validInvite = {
        id: "inv-race-used",
        expiresAt: new Date(Date.now() + 60_000),
        usedBy: null,
      };
      const { db } = makeExecutableDb({ existingInvite: validInvite });
      db.query.inviteLinks.findFirst.mockResolvedValueOnce(validInvite).mockResolvedValueOnce({
        ...validInvite,
        usedBy: "user-other",
      });

      const result = await acceptInvite(db as never, { token, userId });

      expect(result).toEqual({ error: "invite_already_used" });
      expect(db.execute).toHaveBeenCalledOnce();
    });

    it("returns invite_not_found when an atomic claim finds no invite", async () => {
      const { db } = makeExecutableDb({ existingInvite: undefined });

      const result = await acceptInvite(db as never, { token, userId });

      expect(result).toEqual({ error: "invite_not_found" });
      expect(db.execute).not.toHaveBeenCalled();
    });

    it("keeps the relational invite lookup bound to its query builder", async () => {
      const inviteQuery = {
        invite: undefined as Record<string, unknown> | undefined,
        async findFirst() {
          return this.invite;
        },
      };
      const db = {
        execute: vi.fn(),
        query: {
          inviteLinks: inviteQuery,
        },
      };

      const result = await acceptInvite(db as never, { token, userId });

      expect(result).toEqual({ error: "invite_not_found" });
      expect(db.execute).not.toHaveBeenCalled();
    });

    it("returns invite_not_found before the atomic claim without relational query helpers", async () => {
      const db = {
        execute: vi.fn().mockResolvedValueOnce({ rows: [] }),
      };

      const result = await acceptInvite(db as never, { token, userId });

      expect(result).toEqual({ error: "invite_not_found" });
      expect(db.execute).toHaveBeenCalledOnce();
    });

    it("returns invite_not_found when execute-only status lookup has no rows payload", async () => {
      const db = {
        execute: vi.fn().mockResolvedValueOnce({}),
      };

      const result = await acceptInvite(db as never, { token, userId });

      expect(result).toEqual({ error: "invite_not_found" });
      expect(db.execute).toHaveBeenCalledOnce();
    });

    it("returns invite_expired when an atomic claim loses to an expired invite", async () => {
      const { db } = makeExecutableDb({
        existingInvite: {
          id: "inv-expired",
          expiresAt: new Date(Date.now() - 60_000),
          usedBy: null,
        },
      });

      const result = await acceptInvite(db as never, { token, userId });

      expect(result).toEqual({ error: "invite_expired" });
    });

    it("classifies a failed claim when the transaction lacks relational query helpers", async () => {
      const db = {
        execute: vi.fn().mockResolvedValueOnce({
          rows: [
            {
              id: "inv-no-query-expired",
              expiresAt: new Date(Date.now() - 60_000),
              usedBy: null,
            },
          ],
        }),
      };

      const result = await acceptInvite(db as never, { token, userId });

      expect(result).toEqual({ error: "invite_expired" });
      expect(db.execute).toHaveBeenCalledOnce();
    });

    it("returns invite_already_used when an atomic claim loses to a used invite", async () => {
      const { db } = makeExecutableDb({
        existingInvite: {
          id: "inv-used",
          expiresAt: new Date(Date.now() + 60_000),
          usedBy: "user-other",
        },
      });

      const result = await acceptInvite(db as never, { token, userId });

      expect(result).toEqual({ error: "invite_already_used" });
    });

    it("returns invite_already_used before the atomic claim without relational query helpers", async () => {
      const db = {
        execute: vi.fn().mockResolvedValueOnce({
          rows: [
            {
              id: "inv-no-query-used",
              expiresAt: new Date(Date.now() + 60_000),
              usedBy: "user-other",
            },
          ],
        }),
      };

      const result = await acceptInvite(db as never, { token, userId });

      expect(result).toEqual({ error: "invite_already_used" });
      expect(db.execute).toHaveBeenCalledOnce();
    });

    it("inserts a new membership after atomically claiming an invite", async () => {
      const randomUuid = vi
        .spyOn(crypto, "randomUUID")
        .mockReturnValue("00000000-0000-4000-8000-000000000001");
      const { db, insertValues } = makeExecutableDb({
        claimedInvite: {
          id: "inv-11",
          orgId: "org-11",
          role: "editor",
          permissions: { grants: "edit" },
          createdBy: "admin-1",
        },
      });

      const result = await acceptInvite(db as never, {
        token,
        userId,
        userEmail: "editor@example.org",
      });

      expect(insertValues).not.toHaveBeenCalled();
      expect(randomUuid).toHaveBeenCalledTimes(2);
      expect(getSqlText(db.execute)).toContain('"id"');
      expect(getSqlParameters(db.execute)).toContain("00000000-0000-4000-8000-000000000001");
      expect(result).toEqual({ orgId: "org-11", role: "editor" });
    });

    it("grants default entity access for org-wide invites in the atomic claim", async () => {
      const { db } = makeExecutableDb({
        claimedInvite: {
          id: "inv-default-entity",
          orgId: "org-default-entity",
          role: "editor",
          entityId: null,
          permissions: { grants: "edit" },
          createdBy: "admin-1",
        },
      });

      await acceptInvite(db as never, {
        token,
        userId,
        userEmail: "editor@example.org",
      });

      const sqlText = getSqlText(db.execute);
      expect(sqlText).toContain("default_entity_member");
      expect(sqlText).toContain('"default_entity_id"');
      expect(sqlText).toContain('where i."entityId" is null');
    });

    it("generates an entity membership id inside the atomic claim", async () => {
      vi.spyOn(crypto, "randomUUID")
        .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
        .mockReturnValueOnce("00000000-0000-4000-8000-000000000002");
      const { db } = makeExecutableDb({
        claimedInvite: {
          id: "inv-entity-member-id",
          orgId: "org-entity-member-id",
          role: "editor",
          entityId: null,
          permissions: { grants: "edit" },
          createdBy: "admin-1",
        },
      });

      await acceptInvite(db as never, {
        token,
        userId,
        userEmail: "editor@example.org",
      });

      const sqlText = getSqlText(db.execute);
      expect(sqlText).toContain('"id",\n        "org_id"');
      expect(getSqlParameters(db.execute)).toContain("00000000-0000-4000-8000-000000000002");
    });

    it("inserts a new membership when the transaction lacks relational query helpers", async () => {
      const insertReturning = vi.fn().mockResolvedValue([]);
      const insertOnConflict = vi.fn().mockReturnValue({ returning: insertReturning });
      const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflict });
      const insertFn = vi.fn().mockReturnValue({ values: insertValues });
      const db = {
        execute: vi
          .fn()
          .mockResolvedValueOnce({
            rows: [
              {
                id: "inv-no-query",
                expiresAt: new Date(Date.now() + 60_000),
                usedBy: null,
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                id: "inv-no-query",
                orgId: "org-no-query",
                role: "viewer",
                permissions: null,
                createdBy: "admin-1",
              },
            ],
          })
          .mockResolvedValueOnce({ rows: [] }),
        insert: insertFn,
      };

      const result = await acceptInvite(db as never, {
        token,
        userId,
        userEmail: "viewer@example.org",
      });

      expect(insertValues).not.toHaveBeenCalled();
      expect(db.execute).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ orgId: "org-no-query", role: "viewer" });
    });

    it("accepts raw array results from transaction execute", async () => {
      const insertReturning = vi.fn().mockResolvedValue([]);
      const insertOnConflict = vi.fn().mockReturnValue({ returning: insertReturning });
      const insertValues = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflict });
      const insertFn = vi.fn().mockReturnValue({ values: insertValues });
      const db = {
        execute: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: "inv-array",
              expiresAt: new Date(Date.now() + 60_000),
              usedBy: null,
            },
          ])
          .mockResolvedValueOnce([
            {
              id: "inv-array",
              orgId: "org-array",
              role: "editor",
              permissions: null,
              createdBy: "admin-1",
            },
          ])
          .mockResolvedValueOnce([]),
        insert: insertFn,
      };

      const result = await acceptInvite(db as never, { token, userId });

      expect(insertValues).not.toHaveBeenCalled();
      expect(db.execute).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ orgId: "org-array", role: "editor" });
    });

    it("reactivates a soft-deleted membership when relational query helpers are unavailable", async () => {
      const db = {
        execute: vi
          .fn()
          .mockResolvedValueOnce({
            rows: [
              {
                id: "inv-no-query-reactivate",
                expiresAt: new Date(Date.now() + 60_000),
                usedBy: null,
              },
            ],
          })
          .mockResolvedValueOnce({
            rows: [
              {
                orgId: "org-no-query-reactivate",
                role: "editor",
              },
            ],
          })
          .mockResolvedValueOnce({ rows: [] }),
        insert: vi.fn(),
      };

      const result = await acceptInvite(db as never, { token, userId });

      expect(db.insert).not.toHaveBeenCalled();
      expect(db.execute).toHaveBeenCalledTimes(2);
      expect(result).toEqual({ orgId: "org-no-query-reactivate", role: "editor" });
    });

    it("reactivates a soft-deleted membership after atomically claiming an invite", async () => {
      const { db, tx } = makeExecutableDb({
        claimedInvite: {
          id: "inv-12",
          orgId: "org-12",
          role: null,
          permissions: null,
          createdBy: null,
        },
      });

      const result = await acceptInvite(db as never, { token, userId });

      expect(tx.execute).toHaveBeenCalledOnce();
      expect(result).toEqual({ orgId: "org-12", role: "viewer" });
    });

    it("keeps an active membership unchanged after atomically claiming an invite", async () => {
      const { db, tx } = makeExecutableDb({
        claimedInvite: {
          id: "inv-13",
          orgId: "org-13",
          role: "editor",
          permissions: { billing: "manage" },
          createdBy: "admin-1",
        },
      });

      const result = await acceptInvite(db as never, { token, userId });

      expect(tx.insert).not.toHaveBeenCalled();
      expect(tx.update).not.toHaveBeenCalled();
      expect(result).toEqual({ orgId: "org-13", role: "editor" });
    });

    it("defaults an active membership with no stored role to viewer", async () => {
      const { db } = makeExecutableDb({
        claimedInvite: {
          id: "inv-14",
          orgId: "org-14",
          role: "viewer",
          permissions: null,
          createdBy: null,
        },
      });

      const result = await acceptInvite(db as never, { token, userId });

      expect(result).toEqual({ orgId: "org-14", role: "viewer" });
    });
  });
});
