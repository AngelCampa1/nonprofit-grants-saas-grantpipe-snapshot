import { and, asc, eq, isNull, sum } from "drizzle-orm";
import {
  allocationBases,
  allocationRules,
  allocationTargets,
  chartOfAccounts,
  journalEntries,
  journalLines,
  programs,
} from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import {
  allocateCents,
  type CreateAllocationBaseInput,
  type CreateAllocationRuleInput,
  type SetAllocationTargetsInput,
  type UpdateAllocationBaseInput,
  type UpdateAllocationRuleInput,
} from "@grantpipe/shared";
import { notFound, conflict } from "../../lib/app-error";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AllocationBaseRow = typeof allocationBases.$inferSelect;
export type AllocationTargetRow = typeof allocationTargets.$inferSelect;
export type AllocationRuleRow = typeof allocationRules.$inferSelect & {
  accountName?: string;
  baseName?: string;
};

export type ProgramBreakdownEntry = {
  programId: string | null;
  programName: string;
  amountCents: number;
};

export type AllocatedSFERow = {
  accountId: string;
  name: string;
  program: number;
  management: number;
  fundraising: number;
  total: number;
};

export type AllocatedSFEResult = {
  rows: AllocatedSFERow[];
  totals: { program: number; management: number; fundraising: number; total: number };
  programBreakdown: ProgramBreakdownEntry[];
};

// ---------------------------------------------------------------------------
// Allocation Bases
// ---------------------------------------------------------------------------

export async function listAllocationBases(
  db: Database,
  params: { orgId: string },
): Promise<AllocationBaseRow[]> {
  return db.query.allocationBases.findMany({
    where: and(eq(allocationBases.orgId, params.orgId), isNull(allocationBases.deletedAt)),
    orderBy: [asc(allocationBases.name)],
  });
}

export async function getAllocationBase(
  db: Database,
  params: { orgId: string; baseId: string },
): Promise<AllocationBaseRow> {
  const row = await db.query.allocationBases.findFirst({
    where: and(
      eq(allocationBases.id, params.baseId),
      eq(allocationBases.orgId, params.orgId),
      isNull(allocationBases.deletedAt),
    ),
  });
  if (!row) throw notFound("Allocation base not found");
  return row;
}

export async function createAllocationBase(
  db: Database,
  params: { orgId: string; input: CreateAllocationBaseInput },
): Promise<AllocationBaseRow> {
  const [row] = await db
    .insert(allocationBases)
    .values({
      orgId: params.orgId,
      name: params.input.name,
      description: params.input.description,
      method: params.input.method,
      status: params.input.status ?? "active",
    })
    .returning();
  if (!row) throw new Error("Failed to create allocation base");
  return row;
}

export async function updateAllocationBase(
  db: Database,
  params: { orgId: string; baseId: string; input: UpdateAllocationBaseInput },
): Promise<AllocationBaseRow> {
  const existing = await getAllocationBase(db, { orgId: params.orgId, baseId: params.baseId });

  const [row] = await db
    .update(allocationBases)
    .set({
      name: params.input.name ?? existing.name,
      description:
        params.input.description !== undefined ? params.input.description : existing.description,
      method: params.input.method ?? existing.method,
      status: params.input.status ?? existing.status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(allocationBases.id, params.baseId),
        eq(allocationBases.orgId, params.orgId),
        isNull(allocationBases.deletedAt),
      ),
    )
    .returning();
  if (!row) throw notFound("Allocation base not found");
  return row;
}

export async function softDeleteAllocationBase(
  db: Database,
  params: { orgId: string; baseId: string },
): Promise<void> {
  await getAllocationBase(db, { orgId: params.orgId, baseId: params.baseId });
  await db
    .update(allocationBases)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(allocationBases.id, params.baseId),
        eq(allocationBases.orgId, params.orgId),
        isNull(allocationBases.deletedAt),
      ),
    );
}

// ---------------------------------------------------------------------------
// Allocation Targets
// ---------------------------------------------------------------------------

export async function getAllocationTargets(
  db: Database,
  params: { orgId: string; baseId: string },
): Promise<AllocationTargetRow[]> {
  // Ensure the base exists and belongs to the org
  await getAllocationBase(db, { orgId: params.orgId, baseId: params.baseId });

  return db.query.allocationTargets.findMany({
    where: and(
      eq(allocationTargets.orgId, params.orgId),
      eq(allocationTargets.baseId, params.baseId),
      isNull(allocationTargets.deletedAt),
    ),
    orderBy: [asc(allocationTargets.createdAt)],
  });
}

export async function setAllocationTargets(
  db: Database,
  params: { orgId: string; baseId: string; targets: SetAllocationTargetsInput["targets"] },
): Promise<AllocationTargetRow[]> {
  // Ensure the base exists and belongs to org
  await getAllocationBase(db, { orgId: params.orgId, baseId: params.baseId });

  // Validate program targets against programs that belong to this org.
  for (const target of params.targets) {
    if (target.programId != null) {
      const program = await db.query.programs.findFirst({
        where: and(
          eq(programs.id, target.programId),
          eq(programs.orgId, params.orgId),
          isNull(programs.deletedAt),
        ),
      });
      if (!program) throw notFound(`Program ${target.programId} not found`);
    }
  }

  return db.transaction(async (tx) => {
    // Soft-delete existing active targets for this base
    await tx
      .update(allocationTargets)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(allocationTargets.orgId, params.orgId),
          eq(allocationTargets.baseId, params.baseId),
          isNull(allocationTargets.deletedAt),
        ),
      );

    // Insert the new set
    const rows = await tx
      .insert(allocationTargets)
      .values(
        params.targets.map((t) => ({
          orgId: params.orgId,
          baseId: params.baseId,
          functionalClass: t.functionalClass,
          programId: t.programId ?? null,
          label: t.label ?? null,
          weightBasisPoints: t.weightBasisPoints,
        })),
      )
      .returning();

    return rows;
  });
}

// ---------------------------------------------------------------------------
// Allocation Rules
// ---------------------------------------------------------------------------

export async function listAllocationRules(
  db: Database,
  params: { orgId: string },
): Promise<AllocationRuleRow[]> {
  const rules = await db.query.allocationRules.findMany({
    where: and(eq(allocationRules.orgId, params.orgId), isNull(allocationRules.deletedAt)),
    orderBy: [asc(allocationRules.createdAt)],
  });

  if (rules.length === 0) {
    return [];
  }

  const [accounts, bases] = await Promise.all([
    db.query.chartOfAccounts.findMany({
      where: and(eq(chartOfAccounts.orgId, params.orgId), isNull(chartOfAccounts.deletedAt)),
      columns: { id: true, code: true, name: true },
    }),
    db.query.allocationBases.findMany({
      where: and(eq(allocationBases.orgId, params.orgId), isNull(allocationBases.deletedAt)),
      columns: { id: true, name: true },
    }),
  ]);

  const accountNames = new Map(
    accounts.map((account) => [
      account.id,
      account.code ? `${account.code} ${account.name}` : account.name,
    ]),
  );
  const baseNames = new Map(bases.map((base) => [base.id, base.name]));

  return rules.map((rule) => ({
    ...rule,
    accountName: accountNames.get(rule.accountId),
    baseName: baseNames.get(rule.baseId),
  }));
}

export async function createAllocationRule(
  db: Database,
  params: { orgId: string; input: CreateAllocationRuleInput },
): Promise<AllocationRuleRow> {
  const { accountId, baseId, status } = params.input;

  // Validate account exists and is of type "expense"
  const account = await db.query.chartOfAccounts.findFirst({
    where: and(
      eq(chartOfAccounts.id, accountId),
      eq(chartOfAccounts.orgId, params.orgId),
      eq(chartOfAccounts.type, "expense"),
      isNull(chartOfAccounts.deletedAt),
    ),
  });
  if (!account) throw notFound("Expense account not found");

  // Validate base exists and belongs to org
  await getAllocationBase(db, { orgId: params.orgId, baseId });

  // Enforce one active rule per accountId
  const effectiveStatus: string = status ?? "active";
  if (effectiveStatus === "active") {
    const existing = await db.query.allocationRules.findFirst({
      where: and(
        eq(allocationRules.orgId, params.orgId),
        eq(allocationRules.accountId, accountId),
        eq(allocationRules.status, "active"),
        isNull(allocationRules.deletedAt),
      ),
    });
    if (existing) {
      throw conflict("Account already has an active allocation rule");
    }
  }

  const [row] = await db
    .insert(allocationRules)
    .values({
      orgId: params.orgId,
      accountId,
      baseId,
      status: effectiveStatus,
    })
    .returning();
  if (!row) throw new Error("Failed to create allocation rule");
  return row;
}

export async function updateAllocationRule(
  db: Database,
  params: { orgId: string; ruleId: string; input: UpdateAllocationRuleInput },
): Promise<AllocationRuleRow> {
  const existing = await db.query.allocationRules.findFirst({
    where: and(
      eq(allocationRules.id, params.ruleId),
      eq(allocationRules.orgId, params.orgId),
      isNull(allocationRules.deletedAt),
    ),
  });
  if (!existing) throw notFound("Allocation rule not found");

  const newStatus = params.input.status ?? existing.status;
  const newAccountId = params.input.accountId ?? existing.accountId;
  const newBaseId = params.input.baseId ?? existing.baseId;

  // Validate account if changing
  if (params.input.accountId && params.input.accountId !== existing.accountId) {
    const account = await db.query.chartOfAccounts.findFirst({
      where: and(
        eq(chartOfAccounts.id, newAccountId),
        eq(chartOfAccounts.orgId, params.orgId),
        eq(chartOfAccounts.type, "expense"),
        isNull(chartOfAccounts.deletedAt),
      ),
    });
    if (!account) throw notFound("Expense account not found");
  }

  // Validate base if changing
  if (params.input.baseId && params.input.baseId !== existing.baseId) {
    await getAllocationBase(db, { orgId: params.orgId, baseId: newBaseId });
  }

  // Enforce one active rule per accountId when activating
  if (
    newStatus === "active" &&
    (existing.status !== "active" || newAccountId !== existing.accountId)
  ) {
    const conflict_ = await db.query.allocationRules.findFirst({
      where: and(
        eq(allocationRules.orgId, params.orgId),
        eq(allocationRules.accountId, newAccountId),
        eq(allocationRules.status, "active"),
        isNull(allocationRules.deletedAt),
      ),
    });
    if (conflict_ && conflict_.id !== params.ruleId) {
      throw conflict("Account already has an active allocation rule");
    }
  }

  const [row] = await db
    .update(allocationRules)
    .set({
      accountId: newAccountId,
      baseId: newBaseId,
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(allocationRules.id, params.ruleId),
        eq(allocationRules.orgId, params.orgId),
        isNull(allocationRules.deletedAt),
      ),
    )
    .returning();
  if (!row) throw notFound("Allocation rule not found");
  return row;
}

export async function softDeleteAllocationRule(
  db: Database,
  params: { orgId: string; ruleId: string },
): Promise<void> {
  const existing = await db.query.allocationRules.findFirst({
    where: and(
      eq(allocationRules.id, params.ruleId),
      eq(allocationRules.orgId, params.orgId),
      isNull(allocationRules.deletedAt),
    ),
  });
  if (!existing) throw notFound("Allocation rule not found");

  await db
    .update(allocationRules)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(allocationRules.id, params.ruleId),
        eq(allocationRules.orgId, params.orgId),
        isNull(allocationRules.deletedAt),
      ),
    );
}

// ---------------------------------------------------------------------------
// Allocated Statement of Functional Expenses
// ---------------------------------------------------------------------------

export async function getAllocatedStatementOfFunctionalExpenses(
  db: Database,
  params: { orgId: string; startDate: Date; endDate: Date },
): Promise<AllocatedSFEResult> {
  // 1. Query expense account balances for the period (mirrors getStatementOfFunctionalExpenses)
  const expenseRows = await db
    .select({
      id: chartOfAccounts.id,
      name: chartOfAccounts.name,
      functionalClass: chartOfAccounts.functionalClass,
      debitTotal: sql<number>`COALESCE(${sum(journalLines.debitCents)}, 0)`,
      creditTotal: sql<number>`COALESCE(${sum(journalLines.creditCents)}, 0)`,
    })
    .from(chartOfAccounts)
    .innerJoin(
      journalLines,
      and(eq(journalLines.accountId, chartOfAccounts.id), eq(journalLines.orgId, params.orgId)),
    )
    .innerJoin(
      journalEntries,
      and(
        eq(journalEntries.id, journalLines.journalEntryId),
        eq(journalEntries.orgId, params.orgId),
        sql`${journalEntries.date} >= ${params.startDate}`,
        sql`${journalEntries.date} <= ${params.endDate}`,
      ),
    )
    .where(
      and(
        eq(chartOfAccounts.orgId, params.orgId),
        isNull(chartOfAccounts.deletedAt),
        eq(chartOfAccounts.type, "expense"),
      ),
    )
    .groupBy(chartOfAccounts.id, chartOfAccounts.name, chartOfAccounts.functionalClass)
    .orderBy(asc(chartOfAccounts.name));

  // 2. Load active rules for the org
  const rules = await db.query.allocationRules.findMany({
    where: and(
      eq(allocationRules.orgId, params.orgId),
      eq(allocationRules.status, "active"),
      isNull(allocationRules.deletedAt),
    ),
  });

  const referencedBaseIds = new Set(rules.map((rule) => rule.baseId));
  const activeBaseIds = new Set<string>();
  if (referencedBaseIds.size > 0) {
    const activeBases = await db.query.allocationBases.findMany({
      where: and(
        eq(allocationBases.orgId, params.orgId),
        eq(allocationBases.status, "active"),
        isNull(allocationBases.deletedAt),
      ),
      columns: { id: true },
    });
    for (const base of activeBases) {
      if (referencedBaseIds.has(base.id)) {
        activeBaseIds.add(base.id);
      }
    }
  }

  // Map accountId -> active baseId
  const accountToBase = new Map<string, string>();
  for (const rule of rules) {
    if (activeBaseIds.has(rule.baseId)) {
      accountToBase.set(rule.accountId, rule.baseId);
    }
  }

  // Load all referenced bases' active targets
  const uniqueBaseIds = [...new Set(accountToBase.values())];
  const baseTargetsMap = new Map<string, AllocationTargetRow[]>();

  for (const baseId of uniqueBaseIds) {
    const targets = await db.query.allocationTargets.findMany({
      where: and(
        eq(allocationTargets.orgId, params.orgId),
        eq(allocationTargets.baseId, baseId),
        isNull(allocationTargets.deletedAt),
      ),
    });
    baseTargetsMap.set(baseId, targets);
  }

  // 3. Load program names for breakdown
  const programIds = new Set<string>();
  for (const targets of baseTargetsMap.values()) {
    for (const t of targets) {
      if (t.functionalClass === "program" && t.programId != null) {
        programIds.add(t.programId);
      }
    }
  }

  const programNameMap = new Map<string, string>();
  if (programIds.size > 0) {
    const programRows = await db.query.programs.findMany({
      where: and(eq(programs.orgId, params.orgId), isNull(programs.deletedAt)),
      columns: { id: true, name: true },
    });
    for (const p of programRows) {
      if (programIds.has(p.id)) {
        programNameMap.set(p.id, p.name);
      }
    }
  }

  // 4. Allocate
  const programBreakdownMap = new Map<string | null, number>(); // programId -> amountCents
  const rows: AllocatedSFERow[] = [];

  for (const row of expenseRows) {
    const balance = Number(row.debitTotal) - Number(row.creditTotal);
    const baseId = accountToBase.get(row.id);

    if (baseId !== undefined) {
      const targets = baseTargetsMap.get(baseId);

      if (targets && targets.length > 0) {
        const weights = targets.map((t) => t.weightBasisPoints);
        const splits = allocateCents(balance, weights);

        let programTotal = 0;
        let managementTotal = 0;
        let fundraisingTotal = 0;

        for (let i = 0; i < targets.length; i++) {
          const target = targets[i]!;
          const amount = splits[i]!;

          if (target.functionalClass === "program") {
            programTotal += amount;
            const key = target.programId ?? null;
            programBreakdownMap.set(key, (programBreakdownMap.get(key) ?? 0) + amount);
          } else if (target.functionalClass === "management") {
            managementTotal += amount;
          } else if (target.functionalClass === "fundraising") {
            fundraisingTotal += amount;
          }
        }

        rows.push({
          accountId: row.id,
          name: row.name,
          program: programTotal,
          management: managementTotal,
          fundraising: fundraisingTotal,
          total: balance,
        });
        continue;
      }
    }

    // No active rule — whole balance goes to account's own functionalClass
    const fc = row.functionalClass;
    rows.push({
      accountId: row.id,
      name: row.name,
      program: fc === "program" ? balance : 0,
      management: fc === "management" ? balance : 0,
      fundraising: fc === "fundraising" ? balance : 0,
      total: balance,
    });
    // Track direct program allocations in breakdown too
    if (fc === "program" && balance !== 0) {
      const key = null;
      programBreakdownMap.set(key, (programBreakdownMap.get(key) ?? 0) + balance);
    }
  }

  const totals = rows.reduce(
    (acc, row) => ({
      program: acc.program + row.program,
      management: acc.management + row.management,
      fundraising: acc.fundraising + row.fundraising,
      total: acc.total + row.total,
    }),
    { program: 0, management: 0, fundraising: 0, total: 0 },
  );

  // 5. Build programBreakdown sorted by name
  const programBreakdown: ProgramBreakdownEntry[] = [];
  for (const [programId, amountCents] of programBreakdownMap) {
    const programName =
      programId != null
        ? (programNameMap.get(programId) ?? "Unknown Program")
        : "Unassigned Program";
    programBreakdown.push({ programId, programName, amountCents });
  }
  programBreakdown.sort((a, b) => a.programName.localeCompare(b.programName));

  return { rows, totals, programBreakdown };
}
