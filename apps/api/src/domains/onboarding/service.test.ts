import { describe, it, expect, vi } from "vitest";
import { getOnboardingStatus, completeOnboarding, markOnboardingCompleted } from "./service";

// ---------------------------------------------------------------------------
// getOnboardingStatus
// ---------------------------------------------------------------------------

describe("getOnboardingStatus", () => {
  it("returns completed=true when org has onboardingCompleted=true", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ onboardingCompleted: true }),
        },
      },
    };

    const result = await getOnboardingStatus(db as never, "org-1");
    expect(result).toEqual({ completed: true });
  });

  it("returns completed=false when org has onboardingCompleted=false", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue({ onboardingCompleted: false }),
        },
      },
    };

    const result = await getOnboardingStatus(db as never, "org-1");
    expect(result).toEqual({ completed: false });
  });

  it("returns completed=false when org is not found", async () => {
    const db = {
      query: {
        organizations: {
          findFirst: vi.fn().mockResolvedValue(undefined),
        },
      },
    };

    const result = await getOnboardingStatus(db as never, "org-missing");
    expect(result).toEqual({ completed: false });
  });
});

// ---------------------------------------------------------------------------
// completeOnboarding
// ---------------------------------------------------------------------------

describe("completeOnboarding", () => {
  const input = {
    orgId: "org-1",
    orgName: "Helping Hands",
    fiscalYearStartMonth: 7,
    timezone: "America/Chicago",
  };

  function makeUpdateMock(returningValue: unknown) {
    const whereFn = vi
      .fn()
      .mockReturnValue({ returning: vi.fn().mockResolvedValue(returningValue) });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    return { updateFn, setFn, whereFn };
  }

  function makeOrgQuery(onboardingCompleted = false) {
    return {
      organizations: {
        findFirst: vi.fn().mockResolvedValue({ onboardingCompleted }),
      },
    };
  }

  it("calls update with orgName, fiscalYearStartMonth, timezone, preserved onboardingCompleted=false, and updatedAt", async () => {
    const updatedOrg = {
      id: "org-1",
      name: "Helping Hands",
      fiscalYearStartMonth: 7,
      timezone: "America/Chicago",
      onboardingCompleted: false,
    };

    const { updateFn, setFn } = makeUpdateMock([updatedOrg]);
    const db = { query: makeOrgQuery(false), update: updateFn };

    const result = await completeOnboarding(db as never, input);

    expect(updateFn).toHaveBeenCalledTimes(1);

    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.name).toBe("Helping Hands");
    expect(setArg.fiscalYearStartMonth).toBe(7);
    expect(setArg.timezone).toBe("America/Chicago");
    expect(setArg.onboardingCompleted).toBe(false);
    expect(setArg.updatedAt).toBeInstanceOf(Date);

    expect(result).toEqual(updatedOrg);
  });

  it("preserves onboardingCompleted=true when a completed org updates setup details", async () => {
    const updatedOrg = {
      id: "org-1",
      name: "Helping Hands",
      fiscalYearStartMonth: 7,
      timezone: "America/Chicago",
      onboardingCompleted: true,
    };

    const { updateFn, setFn } = makeUpdateMock([updatedOrg]);
    const db = { query: makeOrgQuery(true), update: updateFn };

    const result = await completeOnboarding(db as never, input);

    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.onboardingCompleted).toBe(true);
    expect(result).toEqual(updatedOrg);
  });

  it("throws when update returns no rows", async () => {
    const { updateFn } = makeUpdateMock([]);
    const db = { query: makeOrgQuery(false), update: updateFn };

    await expect(completeOnboarding(db as never, input)).rejects.toThrow(
      "Failed to update organization",
    );
  });

  it("sets updatedAt to a recent timestamp", async () => {
    const before = new Date();

    const updatedOrg = { id: "org-1", name: "Helping Hands", onboardingCompleted: true };
    const { updateFn, setFn } = makeUpdateMock([updatedOrg]);
    const db = { query: makeOrgQuery(true), update: updateFn };

    await completeOnboarding(db as never, input);

    const after = new Date();
    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    const updatedAt = setArg.updatedAt as Date;

    expect(updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("falls back to raw SQL when production is missing plan_selected_at", async () => {
    const updatedOrg = {
      id: "org-1",
      name: "Helping Hands",
      slug: "helping-hands",
      fiscalYearStartMonth: 7,
      timezone: "America/Chicago",
      onboardingCompleted: true,
      planSelectedAt: null,
    };

    const returningFn = vi.fn().mockRejectedValue(
      Object.assign(new Error('column "plan_selected_at" does not exist'), {
        code: "42703",
      }),
    );
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const execute = vi.fn().mockResolvedValue({ rows: [updatedOrg] });
    const db = { query: makeOrgQuery(true), update: updateFn, execute };

    const result = await completeOnboarding(db as never, input);

    expect(execute).toHaveBeenCalledOnce();
    expect(result).toEqual(updatedOrg);
  });

  it("handles fallback result returned as a bare array", async () => {
    const updatedOrg = {
      id: "org-1",
      name: "Helping Hands",
      slug: "helping-hands",
      fiscalYearStartMonth: 7,
      timezone: "America/Chicago",
      onboardingCompleted: true,
      planSelectedAt: null,
    };

    const returningFn = vi.fn().mockRejectedValue(
      Object.assign(new Error('column "plan_selected_at" does not exist'), {
        code: "42703",
      }),
    );
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const execute = vi.fn().mockResolvedValue([updatedOrg]);
    const db = { query: makeOrgQuery(true), update: updateFn, execute };

    const result = await completeOnboarding(db as never, input);

    expect(execute).toHaveBeenCalledOnce();
    expect(result).toEqual(updatedOrg);
  });

  it("does not mask non-schema errors from the update", async () => {
    const returningFn = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const execute = vi.fn();
    const db = { query: makeOrgQuery(false), update: updateFn, execute };

    await expect(completeOnboarding(db as never, input)).rejects.toThrow("database unavailable");
    expect(execute).not.toHaveBeenCalled();
  });

  it("throws when the fallback SQL returns no rows", async () => {
    const returningFn = vi.fn().mockRejectedValue(
      Object.assign(new Error('column "plan_selected_at" does not exist'), {
        code: "42703",
      }),
    );
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const db = { query: makeOrgQuery(false), update: updateFn, execute };

    await expect(completeOnboarding(db as never, input)).rejects.toThrow(
      "Failed to update organization",
    );
  });

  it("persists onboardingGoal when provided", async () => {
    const updatedOrg = {
      id: "org-1",
      name: "Helping Hands",
      fiscalYearStartMonth: 7,
      timezone: "America/Chicago",
      onboardingCompleted: true,
      onboardingGoal: "compliance",
    };

    const { updateFn, setFn } = makeUpdateMock([updatedOrg]);
    const db = { query: makeOrgQuery(true), update: updateFn };

    await completeOnboarding(db as never, { ...input, onboardingGoal: "compliance" });

    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.onboardingGoal).toBe("compliance");
  });

  it("does not include onboardingGoal in set when omitted", async () => {
    const updatedOrg = {
      id: "org-1",
      name: "Helping Hands",
      fiscalYearStartMonth: 7,
      timezone: "America/Chicago",
      onboardingCompleted: true,
    };

    const { updateFn, setFn } = makeUpdateMock([updatedOrg]);
    const db = { query: makeOrgQuery(true), update: updateFn };

    await completeOnboarding(db as never, input);

    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(!("onboardingGoal" in setArg)).toBe(true);
  });
});

describe("markOnboardingCompleted", () => {
  type ActivationEvidence = {
    orgCompleted?: boolean;
    contact?: boolean;
    donation?: boolean;
    fund?: boolean;
    grant?: boolean;
    importRow?: boolean;
  };

  function makeUpdateMock(returningValue: unknown) {
    const whereFn = vi
      .fn()
      .mockReturnValue({ returning: vi.fn().mockResolvedValue(returningValue) });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    return { updateFn, setFn };
  }

  function makeMissingPlanSelectedAtUpdateMock() {
    const returningFn = vi.fn().mockRejectedValue(
      Object.assign(new Error('column "plan_selected_at" does not exist'), {
        code: "42703",
      }),
    );
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    return { updateFn, setFn };
  }

  function makeActivationQuery(evidence: ActivationEvidence = {}) {
    return {
      organizations: {
        findFirst: vi
          .fn()
          .mockResolvedValue(
            evidence.orgCompleted === undefined
              ? undefined
              : { onboardingCompleted: evidence.orgCompleted },
          ),
      },
      contacts: { findFirst: vi.fn().mockResolvedValue(evidence.contact ? { id: "c1" } : null) },
      donations: {
        findFirst: vi.fn().mockResolvedValue(evidence.donation ? { id: "d1" } : null),
      },
      funds: { findFirst: vi.fn().mockResolvedValue(evidence.fund ? { id: "f1" } : null) },
      grants: { findFirst: vi.fn().mockResolvedValue(evidence.grant ? { id: "g1" } : null) },
      importHistory: {
        findFirst: vi.fn().mockResolvedValue(evidence.importRow ? { id: "i1" } : null),
      },
    };
  }

  it("marks onboardingCompleted=true and updates updatedAt", async () => {
    const updatedOrg = {
      id: "org-1",
      name: "Helping Hands",
      onboardingCompleted: true,
    };
    const { updateFn, setFn } = makeUpdateMock([updatedOrg]);
    const db = { query: makeActivationQuery({ contact: true }), update: updateFn };

    const result = await markOnboardingCompleted(db as never, "org-1");

    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.onboardingCompleted).toBe(true);
    expect(setArg.updatedAt).toBeInstanceOf(Date);
    expect(result).toEqual({ org: updatedOrg, wasAlreadyComplete: false });
  });

  it("throws when completion update returns no rows", async () => {
    const { updateFn } = makeUpdateMock([]);
    const db = { query: makeActivationQuery({ importRow: true }), update: updateFn };

    await expect(markOnboardingCompleted(db as never, "org-missing")).rejects.toThrow(
      "Failed to complete onboarding",
    );
  });

  it("rejects completion when no activation evidence exists", async () => {
    const { updateFn } = makeUpdateMock([{ id: "org-1", onboardingCompleted: true }]);
    const db = { query: makeActivationQuery(), update: updateFn };

    await expect(markOnboardingCompleted(db as never, "org-1")).rejects.toMatchObject({
      status: 409,
      message: "Finish one setup action before completing onboarding.",
    });
    expect(updateFn).not.toHaveBeenCalled();
  });

  it("falls back to raw SQL when production is missing plan_selected_at", async () => {
    const updatedOrg = {
      id: "org-1",
      name: "Helping Hands",
      slug: "helping-hands",
      onboardingCompleted: true,
      planSelectedAt: null,
    };
    const { updateFn, setFn } = makeMissingPlanSelectedAtUpdateMock();
    const execute = vi.fn().mockResolvedValue({ rows: [updatedOrg] });
    const db = {
      query: makeActivationQuery({ contact: true }),
      update: updateFn,
      execute,
    };

    const result = await markOnboardingCompleted(db as never, "org-1");

    const setArg = setFn.mock.calls[0]![0] as Record<string, unknown>;
    expect(setArg.onboardingCompleted).toBe(true);
    expect(setArg.updatedAt).toBeInstanceOf(Date);
    expect(execute).toHaveBeenCalledOnce();
    expect(result).toEqual({ org: updatedOrg, wasAlreadyComplete: false });
  });

  it("handles fallback completion result returned as a bare array", async () => {
    const updatedOrg = {
      id: "org-1",
      name: "Helping Hands",
      slug: "helping-hands",
      onboardingCompleted: true,
      planSelectedAt: null,
    };
    const { updateFn } = makeMissingPlanSelectedAtUpdateMock();
    const execute = vi.fn().mockResolvedValue([updatedOrg]);
    const db = {
      query: makeActivationQuery({ orgCompleted: true }),
      update: updateFn,
      execute,
    };

    await expect(markOnboardingCompleted(db as never, "org-1")).resolves.toEqual({
      org: updatedOrg,
      wasAlreadyComplete: true,
    });
    expect(execute).toHaveBeenCalledOnce();
  });

  it("does not mask non-schema completion update errors", async () => {
    const returningFn = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    const updateFn = vi.fn().mockReturnValue({ set: setFn });
    const execute = vi.fn();
    const db = {
      query: makeActivationQuery({ importRow: true }),
      update: updateFn,
      execute,
    };

    await expect(markOnboardingCompleted(db as never, "org-1")).rejects.toThrow(
      "database unavailable",
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("throws when the fallback completion SQL returns no rows", async () => {
    const { updateFn } = makeMissingPlanSelectedAtUpdateMock();
    const execute = vi.fn().mockResolvedValue({ rows: [] });
    const db = {
      query: makeActivationQuery({ fund: true }),
      update: updateFn,
      execute,
    };

    await expect(markOnboardingCompleted(db as never, "org-1")).rejects.toThrow(
      "Failed to complete onboarding",
    );
  });

  it.each<ActivationEvidence>([
    { orgCompleted: true },
    { contact: true },
    { donation: true },
    { fund: true },
    { grant: true },
    { importRow: true },
  ])("allows completion when activation evidence exists: %j", async (evidence) => {
    const updatedOrg = {
      id: "org-1",
      name: "Helping Hands",
      onboardingCompleted: true,
    };
    const { updateFn } = makeUpdateMock([updatedOrg]);
    const db = { query: makeActivationQuery(evidence), update: updateFn };

    await expect(markOnboardingCompleted(db as never, "org-1")).resolves.toEqual({
      org: updatedOrg,
      wasAlreadyComplete: evidence.orgCompleted === true,
    });
    expect(updateFn).toHaveBeenCalledOnce();
  });
});
