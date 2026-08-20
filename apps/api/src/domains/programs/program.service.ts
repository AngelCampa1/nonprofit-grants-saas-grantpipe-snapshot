import { and, asc, count as drizzleCount, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { orgMembers, programs, type Database } from "@grantpipe/db";
import {
  programCreateSchema,
  programUpdateSchema,
  type ProgramCreateInput,
  type ProgramListQuery,
  type ProgramUpdateInput,
} from "@grantpipe/shared";
import { internalError, notFound } from "../../lib/app-error";
import { recordActivityLog } from "../../lib/activity-log";

function isActiveRelatedRow(row: { deletedAt: Date | string | null }) {
  return row.deletedAt == null;
}

export async function listPrograms(db: Database, params: { orgId: string } & ProgramListQuery) {
  const { orgId, page, pageSize, search, status, sortBy, sortOrder } = params;
  const conditions = [eq(programs.orgId, orgId), isNull(programs.deletedAt)];

  if (search) {
    const pattern = `%${search}%`;
    conditions.push(or(ilike(programs.name, pattern), ilike(programs.code, pattern))!);
  }
  if (status) conditions.push(eq(programs.status, status));

  const where = and(...conditions);
  const sortFn = sortOrder === "desc" ? desc : asc;
  const sortColumn =
    sortBy === "code" ? programs.code : sortBy === "updatedAt" ? programs.updatedAt : programs.name;

  const data = await db
    .select()
    .from(programs)
    .where(where)
    .orderBy(sortFn(sortColumn))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const [countResult] = await db.select({ count: drizzleCount() }).from(programs).where(where);

  return { data, total: countResult?.count ?? 0, page, pageSize };
}

export async function getProgram(db: Database, params: { orgId: string; programId: string }) {
  const program = await db.query.programs.findFirst({
    where: and(
      eq(programs.id, params.programId),
      eq(programs.orgId, params.orgId),
      isNull(programs.deletedAt),
    ),
    with: {
      budgets: { with: { lines: true } },
      grantAllocations: true,
      expenseAllocations: true,
      impactMetricLinks: true,
      reportingRequirementLinks: true,
    },
  });

  if (!program) throw notFound("Program not found");
  return {
    ...program,
    budgets: program.budgets.filter(isActiveRelatedRow).map((budget) => ({
      ...budget,
      lines: budget.lines.filter(isActiveRelatedRow),
    })),
    grantAllocations: program.grantAllocations.filter(isActiveRelatedRow),
    expenseAllocations: program.expenseAllocations.filter(isActiveRelatedRow),
    impactMetricLinks: program.impactMetricLinks.filter(isActiveRelatedRow),
    reportingRequirementLinks: program.reportingRequirementLinks.filter(isActiveRelatedRow),
  };
}

export async function assertProgramInOrg(db: Database, orgId: string, programId: string) {
  const program = await db.query.programs.findFirst({
    where: and(eq(programs.id, programId), eq(programs.orgId, orgId), isNull(programs.deletedAt)),
    columns: { id: true },
  });

  if (!program) throw notFound("Program not found");
}

async function assertOwnerInOrg(db: Database, orgId: string, ownerUserId: string) {
  const member = await db.query.orgMembers.findFirst({
    where: and(
      eq(orgMembers.orgId, orgId),
      eq(orgMembers.userId, ownerUserId),
      isNull(orgMembers.deletedAt),
    ),
    columns: { id: true },
  });

  if (!member) throw notFound("Program owner not found");
}

export async function createProgram(
  db: Database,
  params: { orgId: string; actorId?: string } & ProgramCreateInput,
) {
  const data = programCreateSchema.parse(params);

  if (data.ownerUserId) {
    await assertOwnerInOrg(db, params.orgId, data.ownerUserId);
  }

  return db.transaction(async (tx) => {
    const [program] = await tx
      .insert(programs)
      .values({ orgId: params.orgId, ...data })
      .returning();
    if (!program) throw internalError("Failed to create program");

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "created",
        entityType: "program",
        entityId: program.id,
        entityLabel: program.name,
        changes: { after: program },
      });
    }

    return program;
  });
}

export async function updateProgram(
  db: Database,
  params: {
    orgId: string;
    actorId?: string;
    programId: string;
    data: ProgramUpdateInput;
  },
) {
  const data = programUpdateSchema.parse(params.data);

  const existing = await db.query.programs.findFirst({
    where: and(
      eq(programs.id, params.programId),
      eq(programs.orgId, params.orgId),
      isNull(programs.deletedAt),
    ),
  });
  if (!existing) throw notFound("Program not found");

  if (data.ownerUserId) {
    await assertOwnerInOrg(db, params.orgId, data.ownerUserId);
  }

  return db.transaction(async (tx) => {
    const [program] = await tx
      .update(programs)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(programs.id, params.programId),
          eq(programs.orgId, params.orgId),
          isNull(programs.deletedAt),
        ),
      )
      .returning();
    if (!program) throw notFound("Program not found");

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "updated",
        entityType: "program",
        entityId: program.id,
        entityLabel: program.name,
        changes: { before: existing, after: program },
      });
    }

    return program;
  });
}

export async function archiveProgram(
  db: Database,
  params: { orgId: string; actorId?: string; programId: string },
) {
  return db.transaction(async (tx) => {
    const [program] = await tx
      .update(programs)
      .set({ deletedAt: new Date(), status: "archived", updatedAt: new Date() })
      .where(
        and(
          eq(programs.id, params.programId),
          eq(programs.orgId, params.orgId),
          isNull(programs.deletedAt),
        ),
      )
      .returning();
    if (!program) throw notFound("Program not found");

    if (params.actorId) {
      await recordActivityLog(tx, {
        orgId: params.orgId,
        actorId: params.actorId,
        action: "archived",
        entityType: "program",
        entityId: params.programId,
        entityLabel: program.name,
        changes: { deletedAt: program.deletedAt },
      });
    }
  });
}
