import { and, eq, isNull } from "drizzle-orm";
import { contacts, donations } from "@grantpipe/db";
import type { Database } from "@grantpipe/db";
import { classifyDonorLapseRisk, type DonorLapseRiskBand } from "@grantpipe/shared";
import { donationEntityScope } from "./ownership";

export type AtRiskDonor = {
  contactId: string;
  displayName: string;
  email: string | null;
  band: Exclude<DonorLapseRiskBand, "none">;
  daysSinceLastGift: number;
  typicalCadenceDays: number | null;
  riskScore: number;
  lifetimeGivingCents: number;
  lastGiftDate: Date;
};

export type AtRiskTotals = {
  lapsing: number;
  at_risk: number;
  lapsed: number;
  total: number;
};

export type AtRiskDonorsResult = {
  donors: AtRiskDonor[];
  totals: AtRiskTotals;
};

type DonationRow = {
  contactId: string;
  amountCents: number;
  date: Date;
  contact: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    organizationName: string | null;
    email: string | null;
    deletedAt: Date | null;
  };
};

function buildDisplayName(row: DonationRow["contact"]): string {
  if (row.organizationName) return row.organizationName;
  return `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim();
}

export async function getAtRiskDonors(
  db: Database,
  params: {
    orgId: string;
    entityId: string;
    now?: Date;
    bands?: DonorLapseRiskBand[];
    limit?: number;
  },
): Promise<AtRiskDonorsResult> {
  const { orgId, entityId, now = new Date(), bands, limit } = params;

  const rows = (await db
    .select({
      contactId: donations.contactId,
      amountCents: donations.amountCents,
      date: donations.date,
      contact: {
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        organizationName: contacts.organizationName,
        email: contacts.email,
        deletedAt: contacts.deletedAt,
      },
    })
    .from(donations)
    .leftJoin(contacts, eq(donations.contactId, contacts.id))
    .where(
      and(
        eq(donations.orgId, orgId),
        donationEntityScope(orgId, entityId),
        isNull(donations.deletedAt),
        eq(contacts.orgId, orgId),
        isNull(contacts.deletedAt),
      ),
    )) as DonationRow[];

  // Group by contactId
  const byContact = new Map<
    string,
    { contact: DonationRow["contact"]; dates: Date[]; amounts: number[] }
  >();

  for (const row of rows) {
    if (!row.contact || row.contact.deletedAt !== null) continue;
    const existing = byContact.get(row.contactId);
    if (existing) {
      existing.dates.push(row.date);
      existing.amounts.push(row.amountCents);
    } else {
      byContact.set(row.contactId, {
        contact: row.contact,
        dates: [row.date],
        amounts: [row.amountCents],
      });
    }
  }

  // Classify ALL donors first (single pass) — needed to compute accurate totals.
  const allAtRisk: AtRiskDonor[] = [];

  for (const [contactId, { contact, dates, amounts }] of byContact) {
    const risk = classifyDonorLapseRisk({ giftDates: dates, giftAmountsCents: amounts, now });

    if (risk.band === "none") continue;

    // daysSinceLastGift is guaranteed non-null here (band !== "none" and dates.length > 0)
    const daysSinceLastGift = risk.daysSinceLastGift as number;

    // Compute lastGiftDate
    const lastGiftDate = dates.reduce((max, d) => (d > max ? d : max), dates[0] as Date);

    allAtRisk.push({
      contactId,
      displayName: buildDisplayName(contact),
      email: contact.email,
      band: risk.band as Exclude<DonorLapseRiskBand, "none">,
      daysSinceLastGift,
      typicalCadenceDays: risk.typicalCadenceDays,
      riskScore: risk.riskScore,
      lifetimeGivingCents: risk.lifetimeGivingCents,
      lastGiftDate,
    });
  }

  // Sort: riskScore DESC, then daysSinceLastGift DESC
  allAtRisk.sort((a, b) => {
    if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
    return b.daysSinceLastGift - a.daysSinceLastGift;
  });

  // Compute totals over the FULL at-risk population before filtering/limiting.
  const totals: AtRiskTotals = {
    lapsing: allAtRisk.filter((d) => d.band === "lapsing").length,
    at_risk: allAtRisk.filter((d) => d.band === "at_risk").length,
    lapsed: allAtRisk.filter((d) => d.band === "lapsed").length,
    total: allAtRisk.length,
  };

  // Apply bands filter and limit to the returned donor rows.
  let filtered = bands ? allAtRisk.filter((d) => bands.includes(d.band)) : allAtRisk;
  if (limit !== undefined) {
    filtered = filtered.slice(0, limit);
  }

  return { donors: filtered, totals };
}
