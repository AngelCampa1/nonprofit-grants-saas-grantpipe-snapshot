import { describe, expect, it, vi } from "vitest";
import { createD1MarketingStore } from "./marketing-store";

type LeadRow = {
  id: string;
  email: string;
  first_name: string | null;
  source_page: string | null;
  first_magnet_slug: string | null;
  utm: string | null;
  consent_at: string;
  unsubscribed_at: string | null;
  created_at: string;
  updated_at: string;
};

type DownloadRow = {
  id: string;
  lead_id: string;
  magnet_slug: string;
  downloaded_at: string;
};

type FakeTable = {
  leads: LeadRow[];
  downloads: DownloadRow[];
};

class FakeD1PreparedStatement {
  constructor(
    private readonly table: FakeTable,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]) {
    return new FakeD1PreparedStatement(this.table, this.sql, params);
  }

  async first<T = unknown>(): Promise<T | null> {
    const rows = await this.rows();
    return (rows[0] as T | undefined) ?? null;
  }

  async run(): Promise<{ success: true; meta: { changes: number } }> {
    const rows = await this.rows();
    return { success: true, meta: { changes: rows.length } };
  }

  private async rows(): Promise<unknown[]> {
    const sql = this.sql.replace(/\s+/g, " ").trim();

    if (sql.startsWith("SELECT * FROM leads WHERE email =")) {
      const [email] = this.params as [string];
      return this.table.leads.filter((row) => row.email.toLowerCase() === email.toLowerCase());
    }

    if (sql.startsWith("SELECT * FROM leads WHERE id =")) {
      const [id] = this.params as [string];
      return this.table.leads.filter((row) => row.id === id);
    }

    if (sql.startsWith("INSERT OR IGNORE INTO leads")) {
      const [
        id,
        email,
        firstName,
        sourcePage,
        firstMagnetSlug,
        utm,
        consentAt,
        createdAt,
        updatedAt,
      ] = this.params as [
        string,
        string,
        string | null,
        string | null,
        string | null,
        string | null,
        string,
        string,
        string,
      ];
      if (this.table.leads.some((row) => row.email.toLowerCase() === email.toLowerCase())) {
        return [];
      }
      const inserted = {
        id,
        email,
        first_name: firstName,
        source_page: sourcePage,
        first_magnet_slug: firstMagnetSlug,
        utm,
        consent_at: consentAt,
        unsubscribed_at: null,
        created_at: createdAt,
        updated_at: updatedAt,
      };
      this.table.leads.push(inserted);
      return [inserted];
    }

    if (sql.startsWith("UPDATE leads SET updated_at =")) {
      const [updatedAt, id] = this.params as [string, string];
      const lead = this.table.leads.find((row) => row.id === id);
      if (lead) lead.updated_at = updatedAt;
      return [];
    }

    if (sql.startsWith("UPDATE leads SET unsubscribed_at =")) {
      const [unsubscribedAt, updatedAt, id] = this.params as [string, string, string];
      const lead = this.table.leads.find((row) => row.id === id);
      if (lead) {
        lead.unsubscribed_at = unsubscribedAt;
        lead.updated_at = updatedAt;
      }
      return [];
    }

    if (sql.startsWith("UPDATE lead_magnet_downloads SET email_status = CASE")) {
      return [];
    }

    if (sql.startsWith("INSERT OR IGNORE INTO lead_magnet_downloads")) {
      const [id, leadId, magnetSlug, downloadedAt] = this.params as [
        string,
        string,
        string,
        string,
      ];
      if (
        !this.table.downloads.some(
          (row) => row.lead_id === leadId && row.magnet_slug === magnetSlug,
        )
      ) {
        const inserted = {
          id,
          lead_id: leadId,
          magnet_slug: magnetSlug,
          downloaded_at: downloadedAt,
        };
        this.table.downloads.push(inserted);
        return [inserted];
      }
      return [];
    }

    if (sql.startsWith("SELECT id FROM lead_magnet_downloads")) {
      const [leadId, magnetSlug] = this.params as [string, string];
      return this.table.downloads.filter(
        (row) => row.lead_id === leadId && row.magnet_slug === magnetSlug,
      );
    }

    throw new Error(`Unhandled SQL in fake D1: ${sql}`);
  }
}

class FakeD1Database {
  readonly table: FakeTable = { leads: [], downloads: [] };

  prepare(sql: string) {
    return new FakeD1PreparedStatement(this.table, sql);
  }

  async batch(statements: FakeD1PreparedStatement[]) {
    return Promise.all(statements.map((statement) => statement.run()));
  }
}

class FailedInsertD1Database extends FakeD1Database {
  override prepare(sql: string): FakeD1PreparedStatement {
    if (sql.replace(/\s+/g, " ").trim().startsWith("INSERT OR IGNORE INTO leads")) {
      return {
        bind() {
          return {
            async run() {
              return { success: true };
            },
          };
        },
      } as unknown as FakeD1PreparedStatement;
    }
    return super.prepare(sql);
  }
}

class MissingChangeMetadataD1Database extends FakeD1Database {
  override prepare(sql: string): FakeD1PreparedStatement {
    const prepared = super.prepare(sql);
    if (!sql.replace(/\s+/g, " ").trim().startsWith("INSERT OR IGNORE INTO leads")) {
      return prepared;
    }
    return {
      bind(...params: unknown[]) {
        return {
          async run() {
            await prepared.bind(...params).run();
            return { success: true };
          },
        };
      },
    } as unknown as FakeD1PreparedStatement;
  }
}

function makeStore() {
  const db = new FakeD1Database();
  return { db, store: createD1MarketingStore(db as unknown as D1Database) };
}

describe("D1 marketing store", () => {
  it("creates a lead and preserves JSON utm values", async () => {
    const { db, store } = makeStore();
    const now = new Date("2026-04-27T00:00:00.000Z");

    await store.createLead({
      id: "lead-1",
      email: "person@example.com",
      firstName: "Person",
      sourcePage: "/free/checklist",
      firstMagnetSlug: "grant-compliance-checklist",
      utm: { utmSource: "google" },
      now,
    });

    const lead = await store.findLeadByEmail("PERSON@example.com");
    expect(lead).toMatchObject({
      id: "lead-1",
      email: "person@example.com",
      firstName: "Person",
      sourcePage: "/free/checklist",
      firstMagnetSlug: "grant-compliance-checklist",
      utm: { utmSource: "google" },
      unsubscribedAt: null,
    });
    expect(db.table.leads).toHaveLength(1);
  });

  it("returns the canonical lead when a concurrent insert already claimed the email", async () => {
    const { db, store } = makeStore();
    const now = new Date("2026-04-27T00:00:00.000Z");

    const [first, loser] = await Promise.all([
      store.createLead({
        id: "lead-winner",
        email: "person@example.com",
        firstName: "Winner",
        sourcePage: "/first",
        firstMagnetSlug: "first-magnet",
        utm: null,
        now,
      }),
      store.createLead({
        id: "lead-loser",
        email: "PERSON@example.com",
        firstName: "Loser",
        sourcePage: "/second",
        firstMagnetSlug: "second-magnet",
        utm: null,
        now,
      }),
    ]);

    expect(first).toMatchObject({ created: true, lead: { id: "lead-winner" } });
    expect(loser).toMatchObject({ created: false, lead: { id: "lead-winner" } });
    expect(db.table.leads).toHaveLength(1);
  });

  it("does not claim ownership when D1 omits insert change metadata", async () => {
    const store = createD1MarketingStore(
      new MissingChangeMetadataD1Database() as unknown as D1Database,
    );

    await expect(
      store.createLead({
        id: "lead-1",
        email: "person@example.com",
        firstName: null,
        sourcePage: null,
        firstMagnetSlug: null,
        utm: null,
        now: new Date("2026-04-27T00:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ created: false, lead: { id: "lead-1" } });
  });

  it("dedupes downloads by lead and magnet slug", async () => {
    const { db, store } = makeStore();
    const now = new Date("2026-04-27T00:00:00.000Z");

    await store.createLead({
      id: "lead-1",
      email: "person@example.com",
      firstName: null,
      sourcePage: null,
      firstMagnetSlug: "grant-compliance-checklist",
      utm: null,
      now,
    });
    expect(db.table.downloads).toHaveLength(0);
    // First insert creates the row and reports it was inserted.
    await expect(
      store.insertDownload("download-1", "lead-1", "grant-compliance-checklist", now),
    ).resolves.toBe(true);
    // Duplicate insert is ignored and reports no row was inserted.
    await expect(
      store.insertDownload("download-2", "lead-1", "grant-compliance-checklist", now),
    ).resolves.toBe(false);

    expect(db.table.downloads).toHaveLength(1);
    await expect(store.findDownloadId?.("lead-1", "grant-compliance-checklist")).resolves.toBe(
      "download-1",
    );
    await expect(store.findDownloadId?.("lead-1", "missing")).resolves.toBeNull();
  });

  it("treats a D1 insert result without change metadata as not inserted", async () => {
    const db = {
      prepare: () => ({
        bind: () => ({ run: async () => ({ success: true }) }),
      }),
    };
    const store = createD1MarketingStore(db as unknown as D1Database);

    await expect(
      store.insertDownload(
        "download-1",
        "lead-1",
        "grant-compliance-checklist",
        new Date("2026-04-27T00:00:00Z"),
      ),
    ).resolves.toBe(false);
  });

  it("updates lead state with SQLite-compatible timestamp strings", async () => {
    const { db, store } = makeStore();
    const now = new Date("2026-04-27T00:00:00.000Z");
    const later = new Date("2026-04-28T00:00:00.000Z");

    await store.createLead({
      id: "lead-1",
      email: "person@example.com",
      firstName: null,
      sourcePage: null,
      firstMagnetSlug: "grant-compliance-checklist",
      utm: null,
      now,
    });

    await store.updateLeadTimestamp("lead-1", later);
    await store.markLeadUnsubscribed("lead-1", later);

    expect(db.table.leads[0]).toMatchObject({
      updated_at: later.toISOString(),
      unsubscribed_at: later.toISOString(),
    });
    await expect(store.findLeadById("lead-1")).resolves.toMatchObject({
      unsubscribedAt: later,
    });
  });

  it("atomically unsubscribes the lead and suppresses queued delivery channels", async () => {
    const statements: string[] = [];
    const prepared = (sql: string) => ({
      sql,
      bind: vi.fn(() => ({ sql, run: vi.fn() })),
    });
    const db = {
      prepare: vi.fn((sql: string) => {
        statements.push(sql);
        return prepared(sql);
      }),
      batch: vi.fn().mockResolvedValue([]),
    };
    const store = createD1MarketingStore(db as never);

    await store.markLeadUnsubscribed("lead-1", new Date("2026-07-11T12:00:00.000Z"));

    expect(db.batch).toHaveBeenCalledOnce();
    expect(db.batch.mock.calls[0]?.[0]).toHaveLength(2);
    expect(statements[0]).toContain("UPDATE leads SET unsubscribed_at");
    expect(statements[1]).toContain("email_status = CASE");
    expect(statements[1]).toContain("sequencer_status = CASE");
    expect(statements[1]).toContain("'suppressed'");
  });

  it("maps non-object utm JSON to null", async () => {
    const { db, store } = makeStore();
    const now = new Date("2026-04-27T00:00:00.000Z");

    for (const [id, utm] of [
      ["lead-string", '"not-an-object"'],
      ["lead-array", "[]"],
    ] as const) {
      db.table.leads.push({
        id,
        email: `${id}@example.com`,
        first_name: null,
        source_page: null,
        first_magnet_slug: null,
        utm,
        consent_at: now.toISOString(),
        unsubscribed_at: null,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      });
    }

    await expect(store.findLeadById("lead-string")).resolves.toMatchObject({ utm: null });
    await expect(store.findLeadById("lead-array")).resolves.toMatchObject({ utm: null });
    await expect(store.findLeadByEmail("missing@example.com")).resolves.toBeNull();
    await expect(store.findLeadById("missing-id")).resolves.toBeNull();
  });

  it("throws when D1 reports success but the inserted lead cannot be reloaded", async () => {
    const store = createD1MarketingStore(new FailedInsertD1Database() as unknown as D1Database);

    await expect(
      store.createLead({
        id: "lead-1",
        email: "person@example.com",
        firstName: null,
        sourcePage: null,
        firstMagnetSlug: null,
        utm: null,
        now: new Date("2026-04-27T00:00:00.000Z"),
      }),
    ).rejects.toThrow("Failed to insert lead");
  });
});
