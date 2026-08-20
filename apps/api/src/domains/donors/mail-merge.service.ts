import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  communicationLog,
  contacts,
  donorMailMergeDeliveries,
  type Database,
  type DonorMailMergeRequestSnapshot,
} from "@grantpipe/db";
import {
  donorMailMergeSendSchema,
  type DonorMailMergeSendInput,
  type DonorMailMergeSendResult,
} from "@grantpipe/shared";
import { marketingKnowledge } from "@grantpipe/shared/public-kb";
import { renderEmailLayout } from "../../lib/email-layout";
import { recordActivityLog } from "../../lib/activity-log";
import { captureBackgroundException } from "../../lib/sentry";

type MailMergeContact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  organizationName: string | null;
  email: string | null;
  emailOptOut: boolean;
};

type SendDonorMailMergeParams = DonorMailMergeSendInput & {
  orgId: string;
  actorId: string;
  resendApiKey?: string | null;
};

function displayName(contact: MailMergeContact): string {
  const individualName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  return contact.organizationName?.trim() || individualName || contact.email || "Donor";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function mergeText(template: string, contact: MailMergeContact): string {
  const replacements: Record<string, string> = {
    firstName: contact.firstName?.trim() ?? "",
    lastName: contact.lastName?.trim() ?? "",
    fullName: displayName(contact),
    organizationName: contact.organizationName?.trim() ?? "",
    email: contact.email ?? "",
  };

  return template.replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (_match, token: string) => {
    return replacements[token]!;
  });
}

function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br/>")}</p>`)
    .join("\n");
}

function donorUnsubscribeAddress(): string {
  return marketingKnowledge.contact.supportEmail;
}

function donorUnsubscribeUrl(): string {
  const address = donorUnsubscribeAddress();
  const subject = encodeURIComponent("Unsubscribe from donor emails");
  return `mailto:${address}?subject=${subject}`;
}

function appendOptOutFooter(body: string): string {
  return `${body}\n\n--\nTo opt out of donor emails, reply to this email or contact ${donorUnsubscribeAddress()}.`;
}

function buildProviderRequest(params: {
  idempotencyKey: string;
  to: string;
  subject: string;
  body: string;
}): DonorMailMergeRequestSnapshot {
  return {
    endpoint: "https://api.resend.com/emails",
    idempotencyKey: params.idempotencyKey,
    payload: {
      from: marketingKnowledge.contact.transactionalSender,
      to: [params.to],
      subject: params.subject,
      html: renderEmailLayout({
        body: textToHtml(params.body),
        preheader: params.subject,
        unsubscribeUrl: donorUnsubscribeUrl(),
        receivedBecause:
          "You are receiving this because your organization sent a donor email from GrantPipe.",
      }),
      text: params.body,
      headers: {
        "List-Unsubscribe": `<${donorUnsubscribeUrl()}>`,
      },
    },
  };
}

async function fingerprintProviderRequest(request: DonorMailMergeRequestSnapshot): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(request));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sendResendEmail(params: {
  resendApiKey: string;
  request: DonorMailMergeRequestSnapshot;
}): Promise<
  | { ok: true; providerMessageId: string | null }
  | {
      ok: false;
      error: string;
      outcomeAmbiguous: boolean;
      reconciliationRequired: boolean;
    }
> {
  const response = await fetch(params.request.endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.resendApiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": params.request.idempotencyKey,
    },
    body: JSON.stringify(params.request.payload),
  });

  if (response.ok) {
    const payload = (await response.json().catch((): null => null)) as { id?: unknown } | null;
    return {
      ok: true,
      providerMessageId: typeof payload?.id === "string" ? payload.id : null,
    };
  }
  const body = await response.text().catch(() => "");
  const invalidIdempotencyRequest =
    response.status === 409 && /invalid[_ -]?idempotent|idempotency/i.test(body);
  const outcomeAmbiguous =
    response.status < 400 ||
    response.status >= 500 ||
    response.status === 408 ||
    response.status === 425 ||
    response.status === 429;
  return {
    ok: false,
    error: `resend_status_${response.status}:${body}`,
    outcomeAmbiguous,
    reconciliationRequired: invalidIdempotencyRequest,
  };
}

type DeliveryClaim =
  | {
      state: "claimed";
      deliveryId: string;
      claimedAt: Date;
      request: DonorMailMergeRequestSnapshot;
    }
  | { state: "sent" }
  | { state: "ambiguous" }
  | { state: "quarantined" };

const DELIVERY_LEASE_MS = 5 * 60 * 1000;
const PROVIDER_IDEMPOTENCY_RECOVERY_MS = 23 * 60 * 60 * 1000;

async function claimDelivery(
  db: Database,
  params: {
    orgId: string;
    contactId: string;
    attemptId: string;
    requestFingerprint: string;
    requestSnapshot: DonorMailMergeRequestSnapshot;
  },
): Promise<DeliveryClaim> {
  return db.transaction(async (tx) => {
    await tx.insert(donorMailMergeDeliveries).values(params).onConflictDoNothing();
    const delivery = await tx.query.donorMailMergeDeliveries.findFirst({
      where: and(
        eq(donorMailMergeDeliveries.orgId, params.orgId),
        eq(donorMailMergeDeliveries.contactId, params.contactId),
        eq(donorMailMergeDeliveries.attemptId, params.attemptId),
      ),
      columns: {
        id: true,
        status: true,
        requestFingerprint: true,
        requestSnapshot: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!delivery) throw new Error("Failed to create donor mail merge delivery claim");
    if (delivery.status === "sent") return { state: "sent" };
    if (delivery.status === "quarantined") return { state: "quarantined" };
    if (
      delivery.requestFingerprint !== params.requestFingerprint ||
      delivery.requestSnapshot === null
    ) {
      await tx
        .update(donorMailMergeDeliveries)
        .set({
          status: "quarantined",
          lastError: "provider_request_drift",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(donorMailMergeDeliveries.id, delivery.id),
            eq(donorMailMergeDeliveries.updatedAt, delivery.updatedAt),
          ),
        );
      return { state: "quarantined" };
    }
    const now = new Date();
    if (delivery.status === "sending" || delivery.status === "ambiguous") {
      const leaseExpired = now.getTime() - delivery.updatedAt.getTime() >= DELIVERY_LEASE_MS;
      const insideProviderWindow =
        now.getTime() - delivery.createdAt.getTime() < PROVIDER_IDEMPOTENCY_RECOVERY_MS;
      if (!leaseExpired) return { state: "ambiguous" };
      if (!insideProviderWindow) {
        const [quarantined] = await tx
          .update(donorMailMergeDeliveries)
          .set({
            status: "quarantined",
            lastError: "provider_idempotency_window_expired",
            updatedAt: now,
          })
          .where(
            and(
              eq(donorMailMergeDeliveries.id, delivery.id),
              eq(donorMailMergeDeliveries.status, delivery.status),
              eq(donorMailMergeDeliveries.updatedAt, delivery.updatedAt),
            ),
          )
          .returning({ id: donorMailMergeDeliveries.id });
        return quarantined ? { state: "quarantined" } : { state: "ambiguous" };
      }
    }
    const claimableStatuses =
      delivery.status === "sending" || delivery.status === "ambiguous"
        ? [delivery.status]
        : ["pending", "failed"];
    const [claimed] = await tx
      .update(donorMailMergeDeliveries)
      .set({ status: "sending", lastError: null, updatedAt: now })
      .where(
        and(
          eq(donorMailMergeDeliveries.id, delivery.id),
          inArray(donorMailMergeDeliveries.status, claimableStatuses),
          eq(donorMailMergeDeliveries.updatedAt, delivery.updatedAt),
        ),
      )
      .returning({ id: donorMailMergeDeliveries.id });
    return claimed
      ? {
          state: "claimed",
          deliveryId: claimed.id,
          claimedAt: now,
          request: delivery.requestSnapshot,
        }
      : { state: "ambiguous" };
  });
}

async function updateDeliveryState(
  db: Database,
  deliveryId: string,
  claimedAt: Date,
  values: {
    status: "failed" | "ambiguous" | "quarantined";
    providerMessageId?: string | null;
    lastError: string;
  },
): Promise<void> {
  await db
    .update(donorMailMergeDeliveries)
    .set({ ...values, updatedAt: new Date() })
    .where(
      and(
        eq(donorMailMergeDeliveries.id, deliveryId),
        eq(donorMailMergeDeliveries.status, "sending"),
        eq(donorMailMergeDeliveries.updatedAt, claimedAt),
      ),
    );
}

export async function sendDonorMailMerge(
  db: Database,
  params: SendDonorMailMergeParams,
): Promise<DonorMailMergeSendResult> {
  if (!params.resendApiKey) {
    throw new Error("RESEND_API_KEY is required for donor email delivery");
  }

  const input = donorMailMergeSendSchema.parse(params);
  const attemptId = input.attemptId;
  const rows = (await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      organizationName: contacts.organizationName,
      email: contacts.email,
      emailOptOut: contacts.emailOptOut,
    })
    .from(contacts)
    .where(
      and(
        eq(contacts.orgId, params.orgId),
        isNull(contacts.deletedAt),
        inArray(contacts.id, input.contactIds),
      ),
    )) as MailMergeContact[];

  const byId = new Map(rows.filter((row) => row.id).map((row) => [row.id, row]));
  const recipients: DonorMailMergeSendResult["recipients"] = [];

  for (const [recipientIndex, contactId] of input.contactIds.entries()) {
    const contact = byId.get(contactId);
    const name = contact ? displayName(contact) : "Donor";
    if (!contact || contact.email === null || contact.email.trim().length === 0) {
      recipients.push({
        contactId,
        email: contact?.email ?? null,
        name,
        status: "skipped_missing_email",
      });
      continue;
    }

    if (contact.emailOptOut) {
      recipients.push({
        contactId,
        email: contact.email,
        name,
        status: "skipped_unsubscribed",
      });
      continue;
    }

    const subject = mergeText(input.subject, contact);
    const body = appendOptOutFooter(mergeText(input.body, contact));
    const requestSnapshot = buildProviderRequest({
      idempotencyKey: `donor-mail/${attemptId}/${contactId}`,
      to: contact.email,
      subject,
      body,
    });
    const requestFingerprint = await fingerprintProviderRequest(requestSnapshot);
    let claim: DeliveryClaim;
    try {
      claim = await claimDelivery(db, {
        orgId: params.orgId,
        contactId,
        attemptId,
        requestFingerprint,
        requestSnapshot,
      });
    } catch (error) {
      captureBackgroundException(error, "donor-mail-merge", {
        step: "claim_delivery",
        attempt_id: attemptId,
        recipient_index: String(recipientIndex),
      });
      recipients.push({
        contactId,
        email: contact.email,
        name,
        status: "failed",
        error: "delivery_claim_failed",
      });
      continue;
    }
    if (claim.state === "sent") {
      recipients.push({ contactId, email: contact.email, name, status: "sent" });
      continue;
    }
    if (claim.state === "ambiguous" || claim.state === "quarantined") {
      captureBackgroundException(
        new Error("Donor mail delivery needs reconciliation"),
        "donor-mail-merge",
        {
          step:
            claim.state === "quarantined"
              ? "reconcile_quarantined_delivery"
              : "reconcile_ambiguous_delivery",
          attempt_id: attemptId,
          recipient_index: String(recipientIndex),
        },
      );
      recipients.push({
        contactId,
        email: contact.email,
        name,
        status: "failed",
        error: "delivery_reconciliation_required",
      });
      continue;
    }

    let sendResult: Awaited<ReturnType<typeof sendResendEmail>>;
    try {
      sendResult = await sendResendEmail({
        resendApiKey: params.resendApiKey,
        request: claim.request,
      });
    } catch (error) {
      try {
        await updateDeliveryState(db, claim.deliveryId, claim.claimedAt, {
          status: "ambiguous",
          lastError: "provider_request_ambiguous",
        });
      } catch (persistenceError) {
        captureBackgroundException(persistenceError, "donor-mail-merge", {
          step: "persist_provider_ambiguity_state",
          attempt_id: attemptId,
          recipient_index: String(recipientIndex),
        });
      }
      captureBackgroundException(error, "donor-mail-merge", {
        step: "provider_request_ambiguous",
        attempt_id: attemptId,
        recipient_index: String(recipientIndex),
      });
      recipients.push({
        contactId,
        email: contact.email,
        name,
        status: "failed",
        error: "delivery_reconciliation_required",
      });
      continue;
    }

    if (!sendResult.ok) {
      if (sendResult.outcomeAmbiguous) {
        await updateDeliveryState(db, claim.deliveryId, claim.claimedAt, {
          status: "ambiguous",
          lastError: sendResult.error.slice(0, 1000),
        }).catch((error: unknown) => {
          captureBackgroundException(error, "donor-mail-merge", {
            step: "persist_provider_ambiguity_state",
            attempt_id: attemptId,
            recipient_index: String(recipientIndex),
          });
        });
        recipients.push({
          contactId,
          email: contact.email,
          name,
          status: "failed",
          error: "delivery_reconciliation_required",
        });
        continue;
      }
      if (sendResult.reconciliationRequired) {
        await updateDeliveryState(db, claim.deliveryId, claim.claimedAt, {
          status: "quarantined",
          lastError: "provider_idempotency_conflict",
        }).catch((error: unknown) => {
          captureBackgroundException(error, "donor-mail-merge", {
            step: "persist_provider_idempotency_conflict",
            attempt_id: attemptId,
            recipient_index: String(recipientIndex),
          });
        });
        captureBackgroundException(
          new Error("Provider rejected the persisted idempotent request"),
          "donor-mail-merge",
          {
            step: "provider_idempotency_conflict",
            attempt_id: attemptId,
            recipient_index: String(recipientIndex),
          },
        );
        recipients.push({
          contactId,
          email: contact.email,
          name,
          status: "failed",
          error: "delivery_reconciliation_required",
        });
        continue;
      }
      try {
        await updateDeliveryState(db, claim.deliveryId, claim.claimedAt, {
          status: "failed",
          lastError: sendResult.error.slice(0, 1000),
        });
      } catch (error) {
        captureBackgroundException(error, "donor-mail-merge", {
          step: "persist_provider_rejection_state",
          attempt_id: attemptId,
          recipient_index: String(recipientIndex),
        });
        recipients.push({
          contactId,
          email: contact.email,
          name,
          status: "failed",
          error: "delivery_reconciliation_required",
        });
        continue;
      }
      recipients.push({
        contactId,
        email: contact.email,
        name,
        status: "failed",
        error: sendResult.error,
      });
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        const [entry] = await tx
          .insert(communicationLog)
          .values({
            orgId: params.orgId,
            contactId,
            loggedBy: params.actorId,
            type: "email",
            subject,
            body,
            mailMergeAttemptId: attemptId,
          })
          .onConflictDoNothing()
          .returning();

        if (entry) {
          await recordActivityLog(tx, {
            orgId: params.orgId,
            actorId: params.actorId,
            action: "created_communication",
            entityType: "contact",
            entityId: contactId,
            changes: {
              communicationId: entry.id,
              type: "email",
              subject,
            },
          });
        }
        await tx
          .update(donorMailMergeDeliveries)
          .set({
            status: "sent",
            providerMessageId: sendResult.providerMessageId,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(donorMailMergeDeliveries.id, claim.deliveryId),
              eq(donorMailMergeDeliveries.status, "sending"),
              eq(donorMailMergeDeliveries.updatedAt, claim.claimedAt),
            ),
          );
      });
    } catch (error) {
      await updateDeliveryState(db, claim.deliveryId, claim.claimedAt, {
        status: "ambiguous",
        providerMessageId: sendResult.providerMessageId,
        lastError: "communication_persistence_failed",
      }).catch(() => undefined);
      captureBackgroundException(error, "donor-mail-merge", {
        step: "persist_recipient_communication",
        attempt_id: attemptId,
        recipient_index: String(recipientIndex),
      });
      recipients.push({
        contactId,
        email: contact.email,
        name,
        status: "failed",
        error: "delivery_persistence_failed",
      });
      continue;
    }

    recipients.push({ contactId, email: contact.email, name, status: "sent" });
  }

  return {
    requested: input.contactIds.length,
    sent: recipients.filter((recipient) => recipient.status === "sent").length,
    skipped: recipients.filter(
      (recipient) =>
        recipient.status === "skipped_missing_email" || recipient.status === "skipped_unsubscribed",
    ).length,
    failed: recipients.filter((recipient) => recipient.status === "failed").length,
    recipients,
  };
}
