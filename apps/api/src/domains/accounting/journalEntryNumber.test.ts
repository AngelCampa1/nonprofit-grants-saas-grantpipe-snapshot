import { describe, expect, it, vi } from "vitest";
import { journalEntries } from "@grantpipe/db";
import {
  JOURNAL_ENTRY_NUMBER_MAX_ATTEMPTS,
  getNextJournalEntryNumber,
  insertJournalEntryWithNextNumber,
} from "./journalEntryNumber";

const maxRow = (max: number | null) => [{ max }];

function makeSelectQueue(rows: Array<Array<{ max: number | null }>>) {
  return vi.fn().mockImplementation(() => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows.shift() ?? maxRow(0)),
    }),
  }));
}

function makeInsertReturningQueue(rows: unknown[][]) {
  const onConflictDoNothing = vi.fn().mockImplementation(() => ({
    returning: vi.fn().mockResolvedValue(rows.shift() ?? []),
  }));
  const values = vi.fn().mockReturnValue({ onConflictDoNothing });
  const insert = vi.fn().mockReturnValue({ values });
  return { insert, values, onConflictDoNothing };
}

describe("insertJournalEntryWithNextNumber", () => {
  it("starts at one when the organization has no journal entries", async () => {
    const select = makeSelectQueue([[]]);

    await expect(getNextJournalEntryNumber({ select } as never, "org-1")).resolves.toBe(1);
  });
  it("recomputes entry numbers after targeted org entry-number conflicts", async () => {
    const createdEntry = { id: "entry-2", orgId: "org-1", entryNumber: 12 };
    const select = makeSelectQueue([maxRow(10), maxRow(11)]);
    const insertMocks = makeInsertReturningQueue([[], [createdEntry]]);
    const tx = {
      select,
      insert: insertMocks.insert,
    };

    const result = await insertJournalEntryWithNextNumber(tx as never, {
      orgId: "org-1",
      values: {
        date: new Date("2026-07-12T00:00:00.000Z"),
        fiscalPeriodId: "period-1",
        memo: "Manual entry",
        source: "manual",
        postedBy: "user-1",
        isAdjusting: false,
      },
    });

    expect(result).toBe(createdEntry);
    expect(select).toHaveBeenCalledTimes(2);
    expect(insertMocks.values).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ orgId: "org-1", entryNumber: 11 }),
    );
    expect(insertMocks.values).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ orgId: "org-1", entryNumber: 12 }),
    );
    expect(insertMocks.onConflictDoNothing).toHaveBeenCalledWith({
      target: [journalEntries.orgId, journalEntries.entryNumber],
    });
  });

  it("fails after the bounded retry budget without inserting lines or activity", async () => {
    const select = makeSelectQueue(
      Array.from({ length: JOURNAL_ENTRY_NUMBER_MAX_ATTEMPTS }, () => maxRow(10)),
    );
    const insertMocks = makeInsertReturningQueue(
      Array.from({ length: JOURNAL_ENTRY_NUMBER_MAX_ATTEMPTS }, () => []),
    );
    const tx = {
      select,
      insert: insertMocks.insert,
    };

    await expect(
      insertJournalEntryWithNextNumber(tx as never, {
        orgId: "org-1",
        values: {
          date: new Date("2026-07-12T00:00:00.000Z"),
          fiscalPeriodId: "period-1",
          memo: "Manual entry",
          source: "manual",
          postedBy: "user-1",
          isAdjusting: false,
        },
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: "Could not allocate a journal entry number. Please retry.",
    });
    expect(select).toHaveBeenCalledTimes(JOURNAL_ENTRY_NUMBER_MAX_ATTEMPTS);
    expect(insertMocks.values).toHaveBeenCalledTimes(JOURNAL_ENTRY_NUMBER_MAX_ATTEMPTS);
  });

  it("does not retry unrelated insert failures", async () => {
    const select = makeSelectQueue([maxRow(10)]);
    const unrelatedError = Object.assign(new Error("duplicate source id"), {
      code: "23505",
      constraint: "journal_entries_source_id_idx",
    });
    const returning = vi.fn().mockRejectedValue(unrelatedError);
    const onConflictDoNothing = vi.fn().mockReturnValue({ returning });
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const insert = vi.fn().mockReturnValue({ values });

    await expect(
      insertJournalEntryWithNextNumber({ select, insert } as never, {
        orgId: "org-1",
        values: {
          date: new Date("2026-07-12T00:00:00.000Z"),
          fiscalPeriodId: "period-1",
          memo: "Manual entry",
          source: "manual",
          postedBy: "user-1",
          isAdjusting: false,
        },
      }),
    ).rejects.toBe(unrelatedError);
    expect(select).toHaveBeenCalledTimes(1);
    expect(values).toHaveBeenCalledTimes(1);
  });
});
