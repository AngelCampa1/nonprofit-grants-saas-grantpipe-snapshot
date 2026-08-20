import type { LeadSignupInput } from "@grantpipe/shared";
import type { D1DatabaseBinding } from "../../types";

export type MarketingLead = {
  id: string;
  email: string;
  firstName: string | null;
  sourcePage: string | null;
  firstMagnetSlug: string | null;
  utm: LeadSignupInput["utm"] | null;
  consentAt: Date;
  unsubscribedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type NewMarketingLead = {
  id: string;
  email: string;
  firstName: string | null;
  sourcePage: string | null;
  firstMagnetSlug: string | null;
  utm: LeadSignupInput["utm"] | null;
  now: Date;
};

export interface MarketingStore {
  findLeadByEmail(email: string): Promise<MarketingLead | null>;
  findLeadById(id: string): Promise<MarketingLead | null>;
  createLead(input: NewMarketingLead): Promise<{ lead: MarketingLead; created: boolean }>;
  updateLeadTimestamp(id: string, now: Date): Promise<void>;
  markLeadUnsubscribed(id: string, now: Date): Promise<void>;
  /**
   * Records a lead-magnet download. Returns `true` when a new row was inserted
   * and `false` when an identical (lead, magnet) row already existed and the
   * INSERT OR IGNORE was a no-op. Callers gate delivery emails on this result so
   * concurrent double-submits do not fire duplicate deliveries.
   */
  insertDownload(
    id: string,
    leadId: string,
    magnetSlug: string,
    downloadedAt: Date,
    sourcePage?: string | null,
  ): Promise<boolean>;
  findDownloadId?(leadId: string, magnetSlug: string): Promise<string | null>;
}

type LeadRecord = {
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

function toIso(value: Date): string {
  return value.toISOString();
}

function parseDate(value: string | null): Date | null {
  if (value === null) return null;
  return new Date(value);
}

function parseUtm(value: string | null): LeadSignupInput["utm"] | null {
  if (value === null) return null;
  const parsed: unknown = JSON.parse(value);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  return parsed as LeadSignupInput["utm"];
}

function mapLead(row: LeadRecord): MarketingLead {
  return {
    id: row.id,
    email: row.email,
    firstName: row.first_name,
    sourcePage: row.source_page,
    firstMagnetSlug: row.first_magnet_slug,
    utm: parseUtm(row.utm),
    consentAt: new Date(row.consent_at),
    unsubscribedAt: parseDate(row.unsubscribed_at),
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export function createD1MarketingStore(db: D1DatabaseBinding): MarketingStore {
  const store: MarketingStore = {
    async findLeadByEmail(email) {
      const row = await db
        .prepare("SELECT * FROM leads WHERE email = ? COLLATE NOCASE LIMIT 1")
        .bind(email)
        .first<LeadRecord>();
      return row ? mapLead(row) : null;
    },

    async findLeadById(id) {
      const row = await db
        .prepare("SELECT * FROM leads WHERE id = ? LIMIT 1")
        .bind(id)
        .first<LeadRecord>();
      return row ? mapLead(row) : null;
    },

    async createLead(input) {
      const nowIso = toIso(input.now);
      const utm = input.utm ? JSON.stringify(input.utm) : null;
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO leads (
            id, email, first_name, source_page, first_magnet_slug, utm,
            consent_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          input.id,
          input.email,
          input.firstName,
          input.sourcePage,
          input.firstMagnetSlug,
          utm,
          nowIso,
          nowIso,
          nowIso,
        )
        .run();

      const lead = await store.findLeadByEmail(input.email);
      if (!lead) {
        throw new Error("Failed to insert lead");
      }
      const changes = (result as { meta?: { changes?: number } }).meta?.changes ?? 0;
      return { lead, created: changes === 1 };
    },

    async updateLeadTimestamp(id, now) {
      await db.prepare("UPDATE leads SET updated_at = ? WHERE id = ?").bind(toIso(now), id).run();
    },

    async markLeadUnsubscribed(id, now) {
      const nowIso = toIso(now);
      const markLead = db
        .prepare("UPDATE leads SET unsubscribed_at = ?, updated_at = ? WHERE id = ?")
        .bind(nowIso, nowIso, id);
      const suppressDeliveries = db
        .prepare(
          `UPDATE lead_magnet_downloads
           SET email_status = CASE WHEN email_status = 'sent' THEN email_status ELSE 'suppressed' END,
               sequencer_status = CASE WHEN sequencer_status = 'sent' THEN sequencer_status ELSE 'suppressed' END,
               email_only = 0,
               delivery_error = NULL
           WHERE lead_id = ?`,
        )
        .bind(id);
      await db.batch([markLead, suppressDeliveries]);
    },

    async insertDownload(id, leadId, magnetSlug, downloadedAt, sourcePage = null) {
      const result = await db
        .prepare(
          `INSERT OR IGNORE INTO lead_magnet_downloads (
            id, lead_id, magnet_slug, downloaded_at, source_page,
            email_status, sequencer_status
          ) VALUES (?, ?, ?, ?, ?, 'pending', 'pending')`,
        )
        .bind(id, leadId, magnetSlug, toIso(downloadedAt), sourcePage)
        .run();
      // INSERT OR IGNORE reports changes=0 when the (lead, magnet) row already
      // existed. Returning whether a row was actually inserted lets callers
      // dedupe delivery emails atomically instead of via a separate read.
      const changes = (result as { meta?: { changes?: number } }).meta?.changes ?? 0;
      return changes > 0;
    },
    async findDownloadId(leadId, magnetSlug) {
      const row = await db
        .prepare(
          "SELECT id FROM lead_magnet_downloads WHERE lead_id = ? AND magnet_slug = ? LIMIT 1",
        )
        .bind(leadId, magnetSlug)
        .first<{ id: string }>();
      return row?.id ?? null;
    },
  };

  return store;
}
